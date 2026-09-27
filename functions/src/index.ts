/**
 * Ele Café — Cloud Functions  v4
 * ─────────────────────────────────────────────────────────────────────────────
 * Runtime:  Node.js 22  (native fetch built-in)
 * Region:   us-central1
 *
 * Functions exported:
 *   1. setAdminRole                HTTPS callable  — grant/revoke admin custom claim
 *   2. verifyRecaptcha             HTTPS callable  — server-side reCAPTCHA v3 score
 *   3. onOrderWrite                Firestore       — in-app notifications + credit earn
 *   4. onOrderEmail                Firestore       — transactional emails via Resend
 *   5. onNewUser                   Auth trigger    — admin notification on new signup
 *   6. onAnnualCreditReset         Scheduler       — zero all balances Jan 1 PT midnight
 *   7. onCreditTransactionCreate   Firestore       — notify customer on admin credit adjust
 *   8. onOrderExpiry               Scheduler       — expire unpaid approved orders hourly
 *   9. getSitemap                  HTTPS endpoint  — dynamic sitemap.xml
 *  10. renderSeo                   HTTPS endpoint  — first-byte SEO meta for crawlers
 *  11. onTeaWrite                  Firestore       — index invalidation on tea changes
 *
 * Secrets — set once via Firebase CLI, never commit to source:
 *   firebase functions:secrets:set RESEND_API_KEY
 *   firebase functions:secrets:set RECAPTCHA_SECRET_KEY
 *
 * Deploy:
 *   cd functions && npm run build && cd .. && firebase deploy --only functions
 */

import * as zlib from 'node:zlib';
import * as functions from 'firebase-functions/v2';
import * as functionsV1 from 'firebase-functions/v1';
import * as admin from './lib/admin';
import * as crypto from 'node:crypto';
import {
  keyForOrderStatus,
  keyForCreditEarned,
  keyForSignup,
  keyForWelcomeBonus,
  keyForCreditAdminAdjust,
  orderIdOf,
  userIdOf,
  txIdOf,
} from './notificationKeys';
import { isInventoryEmail, isInventorySessionUid } from './lib/inventoryAccount';
import { sendPushToUser } from './lib/push';
import {
  CLOVER_PRIVATE_TOKEN,
  CloverError,
  authorizeCharge,
  captureCharge,
  releaseCharge,
  toCents,
} from './lib/clover';
import { computeOrderTotals, evaluatePromotion } from './lib/orderPricing';
import {
  CATEGORY_SEO,
  SEO_COLLECTIONS,
  teaSeoTitle,
  teaMetaDescription,
  SEO_COLLECTION_BY_SLUG,
  type CollectionDef,
  type CollectionTea,
} from './lib/seoCatalog';
import {
  validateOrderLines,
  OrderInputError,
  cleanText,
  type OrderLine,
  type DirectLine,
} from './lib/orderValidation';
import {
  readStoreContent,
  localBusinessLd,
  buildHomeFaq,
  faqJsonLd,
  homeDescription,
  HOME_TITLE,
  HOME_TITLE_FR,
  shippingText,
  shippingRateFor,
  hoursText,
  phoneTel,
  money,
  moneyFr,
  RETURN_POLICY_LD,
  addressLines,
  FOUNDING_YEAR,
  type StoreContent,
} from './lib/storeContent';
import { COLLECTION_GUIDES } from './lib/collectionGuides';
import { homeHeroHtml } from './lib/homeHero';
import {
  REWARDS_TITLE,
  REWARDS_DESCRIPTION,
  REWARDS_TITLE_FR,
  REWARDS_DESCRIPTION_FR,
  REWARDS_EARN,
  REWARDS_REDEEM,
  REWARDS_URL,
  buildRewardsFaq,
  rewardsIntro,
} from './lib/rewards';
import {
  FRANCHISE_TITLE,
  FRANCHISE_DESCRIPTION,
  FRANCHISE_TITLE_FR,
  FRANCHISE_DESCRIPTION_FR,
  FRANCHISE_CONCEPT,
  FRANCHISE_PARTNER,
  FRANCHISE_EMAIL_FALLBACK,
  franchiseIntro,
  franchiseMailto,
} from './lib/franchise';
import {
  CAFE_TITLE,
  CAFE_TITLE_FR,
  PAIRINGS_TITLE,
  PAIRINGS_TITLE_FR,
  PAIRINGS_DESCRIPTION,
  PAIRINGS_DESCRIPTION_FR,
  CAFE_DESCRIPTION,
  CAFE_DESCRIPTION_FR,
  CAFE_MENU,
  cafeIntro,
  buildCafeFaq,
  cafeMenuLd,
  comboDiet,
  comboCalories,
  DIET_LABEL,
  type CafeCombo,
} from './lib/cafeMenu';
import {
  renderEmail,
  emailBrandFrom,
  esc,
  p,
  strong,
  code,
  button,
  infoBox,
  itemsTable,
  totalsTable,
  addressBox,
  emailLang,
  note,
  L,
  type EmailBrand,
} from './lib/emailLayout';

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();
const FS = admin.firestore.FieldValue;

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NaN/Infinity-safe coercion to a non-negative number. Used by
 * placeOrder for every numeric field that originates from the client
 * — without this, `Number('foo')` returns NaN, `Math.max(0, NaN)` is
 * also NaN (NaN propagates through Math.max), and that NaN flows into
 * the order doc's totalAmount. Use this helper to coerce-and-clamp.
 */
function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

/**
 * Write an in-app notification with caller-supplied deterministic ID.
 *
 * Best-effort by design: if the Firestore write fails, we log and
 * swallow rather than rethrow. Why:
 * - Cloud Functions retries on uncaught errors, which would re-run the
 *   parent trigger (onOrderWrite, onNewUser, etc.) — those have stock
 *   decrements and credit deductions that must NOT run twice.
 * - Losing a notification is degraded UX. Losing inventory/credit
 *   integrity is a real-money loss.
 *
 * The doc ID makes the second write a no-op overwrite on the same row
 * — customer sees one notification regardless of how many times the
 * function ran. Cloud Functions guarantees at-least-once delivery, so
 * deterministic IDs are essential.
 *
 * Convention: `<event>_<sourceId>_<audience>` — e.g. for an order
 * state-change notification, `order_<orderId>_approved_user`.
 */
async function notifyOnce(
  notifId: string,
  recipientId: string,
  type: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  // Phase 11.5 — notification preferences gate for PUSH only.
  // The bell entry is always written: it's the in-app record (e.g. the
  // payment instructions on customer_order_approved), and the account
  // page describes these toggles as email/push controls. Admin bell
  // notifications are never suppressed — pass no category for those.
  category?: import('./lib/notificationPrefs').NotificationCategory,
): Promise<void> {
  try {
    await db.collection('notifications').doc(notifId).set({
      recipientId,
      type,
      title,
      body,
      data,
      isRead: false,
      createdAt: FS.serverTimestamp(),
    });
  } catch (err) {
    console.error('[notifyOnce] write failed', { notifId, recipientId, type, err });
  }

  if (!recipientId || recipientId === 'admin') return;
  if (category) {
    const { userAcceptsCategory } = await import('./lib/notificationPrefs');
    if (!(await userAcceptsCategory(recipientId, category))) {
      console.log(
        `[notifyOnce] push suppressed — uid=${recipientId} opted out of ${category}: "${type}"`,
      );
      return;
    }
  }

  // Send a parallel Web Push so the user sees the OS notification even when
  // the app is closed. Fire-and-forget — push failure must never block or
  // fail the caller (the bell write is what matters for data integrity).
  sendPushToUser(recipientId, title, body, {
    notifId,
    type,
    url: (data.orderId as string)
      ? '/orders'
      : type?.startsWith('customer_credit') || type === 'customer_welcome_bonus'
        ? '/account'
        : '/',
  }).catch(() => {
    /* already logged inside sendPushToUser */
  });
}

/**
 * Web Push for bell notifications that were batch-written directly
 * (scheduled credit jobs) instead of through notifyOnce. Sent after the
 * batches commit, a few at a time so a large run doesn't open hundreds
 * of FCM requests at once.
 */
type PendingPush = { uid: string; title: string; body: string; notifId: string; type: string };
async function sendPendingPushes(pushes: PendingPush[]): Promise<void> {
  const CONCURRENCY = 25;
  for (let i = 0; i < pushes.length; i += CONCURRENCY) {
    await Promise.allSettled(
      pushes.slice(i, i + CONCURRENCY).map((p) =>
        sendPushToUser(p.uid, p.title, p.body, {
          notifId: p.notifId,
          type: p.type,
          url: '/account',
        }),
      ),
    );
  }
}

/**
 * Restore stock + refund redeemed credit when an order is cancelled,
 * rejected, or expired. Idempotent via the `restored` flag on the
 * order doc — re-fires (e.g., admin editing notes after rejection)
 * are no-ops.
 *
 * Without this helper, every cancellation:
 *   1. Leaves stock at the decremented value forever — products
 *      look "out of stock" when inventory is actually available.
 *   2. Burns the customer's redeemed points — they paid in points
 *      for an order they didn't receive. Real money loss.
 */
async function restoreStockAndCredit(
  orderRef: FirebaseFirestore.DocumentReference,
  _after: FirebaseFirestore.DocumentData,
  orderId: string,
  userId: string,
  /** True when transitioning OUT OF 'delivered' (admin-driven). When set,
   *  this function also reverses the earn audit row + the balance/
   *  lifetime fields that were incremented by the delivered branch.
   *  Otherwise (rejection/cancellation from pending/approved/etc.) only
   *  redeem-credit and stock are restored. */
  wasDelivered = false,
): Promise<void> {
  try {
    await db.runTransaction(async (tx) => {
      // Fresh read inside the transaction — guard against stale data
      // and provide the idempotency check.
      const fresh = await tx.get(orderRef);
      if (!fresh.exists) return;
      const data = fresh.data()!;
      // R3 file2 Bug #1: previously a single `if (data.restored === true) return`
      // gated EVERYTHING — stock restore, credit-redeem refund, AND earn
      // reversal. That broke the re-cancel cycle: admin moves a delivered
      // order to cancelled (restored:=true, earn reversed, earn audit
      // deleted), then back to delivered (fresh earn audit + balance), then
      // back to cancelled (this function fires again with wasDelivered=true
      // — but bails on the restored check before reaching the earn-reversal
      // block, so the second-cycle earn pts stick around forever).
      //
      // Fix: the `restored` flag protects stock + credit-redeem-refund only,
      // because those have NO per-doc idempotency of their own (the items
      // array doesn't change between cycles, and creditPointsActuallyDeducted
      // doesn't get re-set). Earn reversal has its own idempotency via the
      // earn_<orderId> audit row's existence — if it doesn't exist, no earn
      // happened in this cycle and there's nothing to reverse. So we can
      // safely run the earn-reversal block on every fire and let the audit
      // row check be the gate. We just split the early-return into two paths:
      // when `restored===true` we skip stock+redeem-refund, but we still
      // fall through to the earn-reversal block when wasDelivered=true.
      const alreadyRestored = data.restored === true;

      if (!alreadyRestored) {
        // ── 1. Restore stock — DEAD CODE post-Turn-6. ─────────────────────────
        //
        // The pending branch no longer decrements `tea.stock` (Turn 6
        // cleanup: inventory level is the only quantity model; orders
        // don't subtract from a count). With nothing decremented at
        // order placement, there's nothing to restore on cancellation.
        //
        // We keep `decremented: false` semantics on new orders. Legacy
        // orders predating Turn 6 may still carry `decremented: true`
        // — for those, FS.increment would write to a `stock` field
        // that's no longer schema-defined. Two reasons we skip the
        // restore entirely rather than honoring the legacy flag:
        //   1. Nothing reads tea.stock anymore (storefront → available
        //      projection; server → same). A "decremented" legacy
        //      tea.stock value is harmless.
        //   2. Issuing FS.increment on a missing field would create
        //      stray data on the tea doc — admins would see a vestigial
        //      stock field reappear when they edit the product.
        //
        // The credit-refund block below is unaffected — orders that
        // redeemed points still need their points back on cancellation.
        const decrementWasApplied = false; // post-Turn-6: always false
        if (decrementWasApplied) {
          const items =
            (data.items as {
              productId?: string;
              quantity?: number;
              bundle?: { teas?: { id?: string }[]; samples?: { id?: string }[] };
            }[]) ?? [];
          // R2 Bug #17 mirror: expand bundle items the same way the
          // pending-branch decrement does. Without this, the refund only
          // touches the bundle's productId='bundle-...' (which has no
          // /teas doc and is silently skipped) — leaving constituent
          // teas with stock locked forever after a cancellation.
          const expanded: { productId: string; quantity: number }[] = [];
          for (const item of items) {
            const qty = item.quantity ?? 0;
            if (qty <= 0) continue;
            if (item.productId && !item.productId.startsWith('bundle-')) {
              expanded.push({ productId: item.productId, quantity: qty });
              continue;
            }
            if (item.bundle) {
              const teas = Array.isArray(item.bundle.teas) ? item.bundle.teas : [];
              const samples = Array.isArray(item.bundle.samples) ? item.bundle.samples : [];
              for (const t of [...teas, ...samples]) {
                if (t && typeof t.id === 'string' && t.id.length > 0) {
                  expanded.push({ productId: t.id, quantity: qty });
                }
              }
            }
          }
          // Coalesce duplicates before issuing increments, so a tea that
          // appears across multiple bundles is restored once with the
          // total quantity.
          const coalesced = Array.from(
            expanded
              .reduce((acc, cur) => {
                acc.set(cur.productId, (acc.get(cur.productId) ?? 0) + cur.quantity);
                return acc;
              }, new Map<string, number>())
              .entries(),
          );
          for (const [productId, quantity] of coalesced) {
            if (quantity <= 0) continue;
            const teaRef = db.doc(`teas/${productId}`);
            // Read first so we can skip silently when the tea was hard-
            // deleted between order placement and refund — without this
            // check, tx.update on a missing doc throws NOT_FOUND, aborts
            // the entire transaction, and the customer's credit refund
            // never lands.
            const teaSnap = await tx.get(teaRef);
            if (!teaSnap.exists) {
              console.warn(
                '[restoreStockAndCredit] tea',
                productId,
                'no longer exists — skipping stock restore for order',
                orderId,
              );
              continue;
            }
            tx.update(teaRef, { stock: FS.increment(quantity) });
          }
        } else {
          console.log(
            '[restoreStockAndCredit] post-Turn-6: stock-restore skipped for order',
            orderId,
          );
        }

        // ── 2. Refund redeemed credit — ONLY the actual amount that was ──────
        //                                deducted, not the claimed amount.
        //
        // The pending branch writes `creditPointsActuallyDeducted` after
        // the deduction transaction; that value reflects the clamp at
        // current balance (so a malicious client claiming 99999 points
        // when their balance is 5 sees only 5 deducted, and we only
        // refund 5 here on cancellation). Falls back to the claimed
        // `creditPointsRedeemed` for legacy orders predating the new
        // field — those orders couldn't have been clamped because the
        // clamp was added at the same time as the field.
        const actuallyDeducted =
          typeof data.creditPointsActuallyDeducted === 'number'
            ? (data.creditPointsActuallyDeducted as number)
            : ((data.creditPointsRedeemed as number) ?? 0);
        if (actuallyDeducted > 0 && userId) {
          const creditRef = db.doc(`credits/${userId}`);
          const credSnap = await tx.get(creditRef);
          if (credSnap.exists) {
            const cur = credSnap.data()!;
            const newBalance = ((cur.balance as number) ?? 0) + actuallyDeducted;
            // lifetimeRedeemed decreases (this redemption is reversed).
            // Floor at 0 in case the doc was manually edited.
            const newLifetimeRedeemed = Math.max(
              0,
              ((cur.lifetimeRedeemed as number) ?? 0) - actuallyDeducted,
            );
            tx.update(creditRef, {
              balance: newBalance,
              lifetimeRedeemed: newLifetimeRedeemed,
              updatedAt: FS.serverTimestamp(),
            });

            // Audit log entry — type 'refund' so admin/customer can see
            // the reversal alongside the original 'redeem' entry.
            // Deterministic ID `refund_<orderId>` so a duplicate-fire of
            // this trigger doesn't produce a second refund audit row.
            const txRef = db.collection('creditTransactions').doc(`refund_${orderId}`);
            tx.set(txRef, {
              userId,
              type: 'refund',
              points: actuallyDeducted,
              balanceAfter: newBalance,
              orderId,
              createdAt: FS.serverTimestamp(),
            });
          }
        }
      } // end if (!alreadyRestored) — stock + redeem-refund block

      // ── 2b. Reverse EARN if the order was previously 'delivered'. ────────
      //
      // Bug 12 — admin can move a delivered order to cancelled / rejected
      // (the firestore rule allows admin: any transition). When this
      // happens, the points earned at delivery time should also be
      // reversed; without this, lifetimeEarned/orderCount/lifetimeSpend
      // grow monotonically with no way back, and the balance reflects
      // points the customer "shouldn't" have anymore. Reversal:
      //   - balance       -= ptsEarned (clamped at 0)
      //   - lifetimeEarned -= ptsEarned (clamped at 0)
      //   - lifetimeSpend  -= orderSubtotal (clamped at 0)
      //   - orderCount    -= 1 (clamped at 0)
      //   - delete the earn audit row (so a re-mark-as-delivered earns
      //     fresh points cleanly via the deterministic earn_<id> id)
      //   - write an 'earn_reversed' audit entry for the trail
      if (wasDelivered && userId) {
        const earnAuditRef = db.collection('creditTransactions').doc(`earn_${orderId}`);
        const earnSnap = await tx.get(earnAuditRef);
        if (earnSnap.exists) {
          const earnData = earnSnap.data()!;
          const earnedPts = (earnData.points as number) ?? 0;
          const earnedSpend = (earnData.orderSubtotal as number) ?? 0;
          const creditRef = db.doc(`credits/${userId}`);
          const credSnap = await tx.get(creditRef);
          if (credSnap.exists && earnedPts > 0) {
            const cur = credSnap.data()!;
            const newBalance = Math.max(0, ((cur.balance as number) ?? 0) - earnedPts);
            const newLifetimeEarned = Math.max(
              0,
              ((cur.lifetimeEarned as number) ?? 0) - earnedPts,
            );
            const newLifetimeSpend = Math.max(
              0,
              ((cur.lifetimeSpend as number) ?? 0) - earnedSpend,
            );
            const newOrderCount = Math.max(0, ((cur.orderCount as number) ?? 0) - 1);
            tx.update(creditRef, {
              balance: newBalance,
              lifetimeEarned: newLifetimeEarned,
              lifetimeSpend: newLifetimeSpend,
              orderCount: newOrderCount,
              updatedAt: FS.serverTimestamp(),
            });
            // Reversal audit entry. Type 'earn_reversed' so the
            // history reads cleanly: original earn row, then the
            // reversal row pointing to the same orderId.
            const reverseRef = db.collection('creditTransactions').doc(`earn_reversed_${orderId}`);
            tx.set(reverseRef, {
              userId,
              type: 'earn_reversed',
              points: -earnedPts,
              balanceAfter: newBalance,
              orderId,
              createdAt: FS.serverTimestamp(),
            });
            // Remove the original earn row so a future re-delivery
            // (admin reverts the cancellation) can write a fresh
            // earn_<orderId> doc — keeps the deterministic-ID
            // idempotency of the earn path intact.
            tx.delete(earnAuditRef);
          }
        }
      }

      // ── 3. Refund promo usage — only if the increment actually ran. ──────
      //
      // The pending branch's promo path is wrapped in its own try/catch
      // and writes the per-user `/promotionUsage` doc atomically with
      // the `/promotions/{id}.usageCount` increment. We use the
      // existence of the per-user record as the "did the increment
      // happen" proof — same atomic transaction either commits both or
      // neither. Decrementing without that proof would drive usageCount
      // negative on edge cases.
      const promotionId = (data.promotionId as string) ?? '';
      if (promotionId) {
        const usageQ = db
          .collection('promotionUsage')
          .where('promotionId', '==', promotionId)
          .where('orderId', '==', orderId);
        const usageSnap = await tx.get(usageQ);
        if (!usageSnap.empty) {
          const promoRef = db.doc(`promotions/${promotionId}`);
          const promoSnap = await tx.get(promoRef);
          if (promoSnap.exists) {
            const cur = (promoSnap.data()?.usageCount as number) ?? 0;
            if (cur > 0) {
              tx.update(promoRef, { usageCount: cur - 1 });
            }
          }
          // Delete the per-user usage record(s) for this order.
          for (const doc of usageSnap.docs) {
            tx.delete(doc.ref);
          }
        }
      }

      // ── 4. Mark restored so retries are no-ops. ──────────────────────────
      tx.update(orderRef, {
        restored: true,
        restoredAt: FS.serverTimestamp(),
      });
    });
  } catch (err) {
    // Don't black-hole the order — log and let admin handle. Same
    // failure-recovery posture as the stock check on order creation.
    console.error('[restoreStockAndCredit] Failed for', orderId, err);
  }
}

/**
 * Resolve a customer's email address.
 * Tries Firestore /users/{uid}.email first, then falls back to Firebase Auth.
 * Returns '' if neither source has an email.
 */
async function getCustomerEmail(userId: string): Promise<string> {
  if (!userId) return '';

  // 1. Firestore /users/{uid}
  try {
    const snap = await db.doc(`users/${userId}`).get();
    const email = snap.data()?.email as string | undefined;
    if (email) return email;
  } catch (e) {
    console.warn(`[getCustomerEmail] Firestore lookup failed for ${userId}:`, e);
  }

  // 2. Firebase Auth record
  try {
    const user = await auth.getUser(userId);
    if (user.email) return user.email;
  } catch (e) {
    console.warn(`[getCustomerEmail] Auth lookup failed for ${userId}:`, e);
  }

  console.warn(`[getCustomerEmail] No email found for userId=${userId}`);
  return '';
}

/**
 * Email brand (name, address, contact, white logo) from Admin → Settings.
 * Every email is rendered with it through lib/emailLayout.ts.
 */
async function getEmailBrand(): Promise<EmailBrand> {
  try {
    return emailBrandFrom((await db.doc('settings/global').get()).data());
  } catch (err) {
    console.warn('[getEmailBrand] settings read failed, using defaults:', err);
    return emailBrandFrom({});
  }
}

/**
 * Send a transactional email via Resend's REST API.
 * Silently skips (with a warning) when RESEND_API_KEY is not set —
 * so the app works in dev/staging without any email config.
 */
async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  /** Override sender (default: orders@elecafe.ca for transactional order mail).
      Auth emails pass 'Ele Café <noreply@elecafe.ca>' to follow industry
      convention — different sender name in the inbox helps customers
      recognise security mail vs purchase mail. */
  from?: string;
  /** Reply-To routing. Auth mail uses noreply but we route replies to
      hello@ so a confused customer hitting Reply doesn't hit a black hole. */
  replyTo?: string;
  /** Phase 11.5 — recipient's Firebase Auth uid. Together with `category`,
   *  enables the notification-preferences gate. Optional: if not provided
   *  (e.g. auth emails like verification where there's no choice to make,
   *  or a transactional reply-to-customer for an anonymous order), the gate
   *  is bypassed entirely. */
  uid?: string;
  /** Phase 11.5 — notification category. When provided alongside `uid`,
   *  sendEmail consults /users/{uid}/preferences/notifications and silently
   *  drops the send if the user opted out. */
  category?: import('./lib/notificationPrefs').NotificationCategory;
}): Promise<boolean> {
  // Schema-fidelity round 2 — global admin kill switch on top of the
  // per-user preference gate. AdminSettings exposes a `sendOrderEmails`
  // toggle that pre-fix did nothing: admin could flip it off and order
  // emails would still send. Now: when category === 'orderUpdates' and
  // /settings/global.sendOrderEmails === false, the entire send path is
  // suppressed regardless of any per-user preferences. Use cases —
  // pausing during a Resend incident, complying with a "do not send"
  // demand, running a manual import without spamming the customer.
  if (opts.category === 'orderUpdates') {
    try {
      const settingsSnap = await db.doc('settings/global').get();
      // Strict false check: the field has to be explicitly disabled.
      // Missing or any non-boolean value leaves it enabled (the
      // CASL-friendly default — transactional mail flows unless admin
      // actively shuts it off).
      if (settingsSnap.exists && settingsSnap.data()?.sendOrderEmails === false) {
        console.log(
          `[sendEmail] suppressed (admin kill-switch sendOrderEmails=false): "${opts.subject}"`,
        );
        return false;
      }
    } catch (err) {
      // Fail-open on settings-read errors. Better to send a legitimate
      // order email than to silently drop transactional mail because
      // Firestore was briefly degraded.
      console.warn('[sendEmail] sendOrderEmails settings read failed; continuing', err);
    }
  }

  // Phase 11.5 — per-user preference gate. Centralized here so every
  // existing call site inherits it; individual functions don't need to
  // remember to call userAcceptsCategory themselves. Passing uid +
  // category opts in to the gate; omitting either bypasses it (for auth
  // emails etc).
  if (opts.uid && opts.category) {
    const { userAcceptsCategory } = await import('./lib/notificationPrefs');
    const accepts = await userAcceptsCategory(opts.uid, opts.category);
    if (!accepts) {
      console.log(
        `[sendEmail] suppressed (uid=${opts.uid} opted out of ${opts.category}): "${opts.subject}"`,
      );
      return false;
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[sendEmail] RESEND_API_KEY not set — skipped "${opts.subject}" to ${opts.to}`);
    return false;
  }

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: opts.from ?? 'Ele Café <orders@elecafe.ca>',
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
  } catch (err) {
    console.error('[sendEmail] Network error calling Resend:', err);
    return false;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[sendEmail] Resend ${res.status}: ${body}`);
    return false;
  } else {
    console.log(`[sendEmail] ✓ "${opts.subject}" → ${opts.to}`);
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export auth-email callables (defined in authEmails.ts to keep this file
// from growing further). These replace Firebase's built-in
// sendEmailVerification / sendPasswordResetEmail / verifyBeforeUpdateEmail
// senders — clients call these via httpsCallable instead. See authEmails.ts
// for the full rationale and the client-side wiring in firebaseAuthLazy.ts.
// ─────────────────────────────────────────────────────────────────────────────
export {
  sendBrandedVerifyEmail,
  sendBrandedPasswordReset,
  sendBrandedEmailChange,
} from './authEmails';

// ─────────────────────────────────────────────────────────────────────────────
// Inventory subsystem — kept in inventory.ts to isolate the data model and
// keep index.ts from growing. See inventory.ts for callable/trigger details.
//
//   setEmployeeAccessCode       — admin callable, scrypts + writes employees_access
//   validateInventoryAccessCode — App-Check'd callable, rate-limited per IP
//   onInventoryWrite            — projects safe fields onto /teas + writes audit log
//   onTeaCreate                 — auto-provisions inventory/{teaId} for new teas
//   onTeaDelete                 — cascade-deletes inventory/{teaId} on tea deletion
//
// Inventory v2 — non-tea categories with the quantity model. Lives in
// inventoryItems.ts. The tea category is seeded automatically by
// onInventoryWrite (in inventory.ts).
//
//   setInventoryCategory       — admin callable, create/update category
//   archiveInventoryCategory   — admin callable, soft-delete
//   deleteInventoryCategory    — admin callable, hard-delete (Phase 15;
//                                cascades to child items when cascade:true)
//   setInventoryItem           — admin callable, create/update item
//   archiveInventoryItem       — admin callable, soft-delete
//   deleteInventoryItem        — admin callable, hard-delete (Phase 15)
//   onInventoryItemWrite       — projects status + writes item-kind audit log
// ─────────────────────────────────────────────────────────────────────────────
export {
  setEmployeeAccessCode,
  validateInventoryAccessCode,
  onInventoryWrite,
  onTeaCreate,
  onTeaDelete,
  repairInventoryProjections,
} from './inventory';

export {
  setInventoryCategory,
  archiveInventoryCategory,
  deleteInventoryCategory,
  setInventoryItem,
  archiveInventoryItem,
  deleteInventoryItem,
  onInventoryItemWrite,
} from './inventoryItems';

// ─────────────────────────────────────────────────────────────────────────────
// 1. setAdminRole — HTTPS callable
// ─────────────────────────────────────────────────────────────────────────────
export const setAdminRole = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: true },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can change roles.');
    }
    // Accept either uid or email — the AdminSettings form sends email
    // because admins type the human-readable address into the input,
    // not a UUID. Programmatic callers can still pass uid directly.
    const data = request.data as { uid?: string; email?: string; makeAdmin?: boolean };
    const { uid: providedUid, email, makeAdmin } = data;
    if (typeof makeAdmin !== 'boolean' || (!providedUid && !email)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Either uid (string) or email (string), plus makeAdmin (boolean), are required.',
      );
    }

    // Resolve to a uid. If the caller sent email only, look up the
    // user via Admin SDK. auth/user-not-found gets translated to a
    // proper not-found HttpsError so the client gets a clear message.
    let uid: string;
    if (providedUid) {
      uid = providedUid;
    } else {
      try {
        const userRecord = await auth.getUserByEmail(email!);
        uid = userRecord.uid;
      } catch (err) {
        const code = (err as { code?: string })?.code ?? '';
        if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
          throw new functions.https.HttpsError('not-found', `No user found with email "${email}".`);
        }
        throw err;
      }
    }

    // Prevent an admin from demoting themselves — the only admin could otherwise
    // lock the whole team out of the admin console.
    if (!makeAdmin && request.auth?.uid === uid) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Admins cannot demote themselves. Ask another admin to do it.',
      );
    }
    const newRole = makeAdmin ? 'admin' : 'user';
    await auth.setCustomUserClaims(uid, { role: newRole });
    await db
      .doc(`users/${uid}`)
      .set({ role: newRole, updatedAt: FS.serverTimestamp() }, { merge: true });
    // Write a role-signal doc the user's client listens for. When this
    // doc updates, the client force-refreshes its ID token to pick up
    // the new custom claim — without this signal the user has to sign
    // out and back in (Firebase doesn't push claim changes; tokens
    // cache for up to 1 hour). The signal is the trigger; the actual
    // permission change is still the JWT claim set above.
    await db
      .doc(`roleSignals/${uid}`)
      .set({ role: newRole, updatedAt: FS.serverTimestamp() }, { merge: true });
    return { success: true, uid, role: newRole };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. verifyRecaptcha — HTTPS callable
//
//    Client calls this with the reCAPTCHA v3 token from grecaptcha.execute().
//    We verify it with Google's API using the SECRET key (never in client code).
//    Returns { score: 0.0–1.0, pass: boolean }.
//    Score < 0.5 = likely automated. Client should warn/block accordingly.
//
//    Activate: firebase functions:secrets:set RECAPTCHA_SECRET_KEY
//    (Paste the SECRET key from console.cloud.google.com/security/recaptcha)
// ─────────────────────────────────────────────────────────────────────────────
export const verifyRecaptcha = functions.https.onCall(
  { region: 'us-central1', secrets: ['RECAPTCHA_SECRET_KEY'], enforceAppCheck: true },
  async (request) => {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;

    // No secret configured. We must be careful here:
    //  - In the emulator (local dev / staging), pass through so the app works
    //    without any reCAPTCHA setup.
    //  - In production, fail CLOSED — silently passing every request would
    //    completely defeat the bot-protection on signup/login/checkout if
    //    `firebase functions:secrets:set RECAPTCHA_SECRET_KEY` is forgotten.
    if (!secretKey) {
      const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
      if (isEmulator) {
        console.warn('[verifyRecaptcha] RECAPTCHA_SECRET_KEY not set — emulator pass-through');
        return { success: true, score: 1.0, pass: true, skipped: true };
      }
      console.error(
        '[verifyRecaptcha] RECAPTCHA_SECRET_KEY not set in production — failing closed',
      );
      throw new functions.https.HttpsError(
        'failed-precondition',
        'reCAPTCHA verification is not configured. Please contact support.',
      );
    }

    const { token, action } = request.data as { token: string; action?: string };
    if (!token) {
      throw new functions.https.HttpsError('invalid-argument', 'token is required');
    }

    let data: {
      success: boolean;
      score: number;
      action: string;
      'error-codes'?: string[];
    };

    try {
      // Use URL-encoded POST body so the secret never appears in URL / logs.
      const params = new URLSearchParams({ secret: secretKey, response: token });
      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!res.ok) {
        console.error(`[verifyRecaptcha] reCAPTCHA API ${res.status}`);
        return { success: true, score: 0.5, pass: true, error: 'api_error' };
      }
      data = (await res.json()) as typeof data;
    } catch (err) {
      console.error('[verifyRecaptcha] Network error:', err);
      // Don't block user on network failure — fail open
      return { success: true, score: 0.5, pass: true, error: 'network_failure' };
    }

    const score = data.score ?? 0;
    // Action validation: a token issued for action='login' should NOT
    // pass verification when used to gate action='checkout'. Without
    // this check, an attacker who solves reCAPTCHA once on a low-stakes
    // page (or harvests a token from a leaked HAR) can replay it on
    // any other reCAPTCHA-gated action. The client passes its expected
    // action; we compare against what Google returned in the token.
    const actionMismatch = !!(action && data.action && data.action !== action);
    if (actionMismatch) {
      console.warn(
        `[verifyRecaptcha] Action mismatch — client expected "${action}" ` +
          `but token was issued for "${data.action}". Treating as failed.`,
      );
    }
    const pass = data.success && score >= 0.5 && !actionMismatch;

    console.log(
      `[verifyRecaptcha] action=${action ?? 'unknown'} ` +
        `score=${score} success=${data.success} pass=${pass} ` +
        `uid=${request.auth?.uid ?? 'anon'}`,
    );

    if (data.success && score < 0.3) {
      // Log suspicious activity for admin review
      try {
        await db.collection('security_events').add({
          type: 'low_recaptcha_score',
          action: action ?? 'unknown',
          score,
          uid: request.auth?.uid ?? null,
          createdAt: FS.serverTimestamp(),
        });
      } catch (err) {
        console.warn('[verifyRecaptcha] Failed to record low-score security event:', err);
      }
    }

    return {
      success: data.success,
      score,
      pass,
      ...(data['error-codes'] ? { errorCodes: data['error-codes'] } : {}),
    };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. onOrderWrite — in-app notifications + loyalty credit on delivery
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Email the store's admin inbox (Settings → Online Payments → "Admin
 * notification email"). Used for things that need a person: new orders
 * waiting for approval (their card hold lapses) and failed refunds.
 * Best-effort — never throws.
 */
async function sendAdminAlert(
  subject: string,
  lines: string[],
  link = 'https://elecafe.ca/admin/orders',
): Promise<void> {
  try {
    const d = (await db.doc('settings/global').get()).data() ?? {};
    const to = typeof d.adminEmail === 'string' ? d.adminEmail.trim() : '';
    if (!to || !to.includes('@')) return;
    const html = renderEmail({
      brand: emailBrandFrom(d),
      preheader: lines[0] ?? subject,
      eyebrow: 'Admin alert',
      title: subject,
      body: [...lines.map((l) => p(esc(l))), button('Open orders', link)],
      footnote: 'Sent to the admin notification email set in Admin → Settings.',
    });
    await sendEmail({ to, subject, html });
  } catch (err) {
    console.warn('[sendAdminAlert] failed:', subject, err);
  }
}

/**
 * Release the card hold (never charged) or refund the charge (already
 * captured) when an order ends without being fulfilled. Idempotent: the
 * payment.status check plus Clover's idempotency key make re-fires safe.
 * A failure never throws — the admin is alerted to fix it in Clover.
 */
async function settleOrderPayment(
  orderRef: admin.firestore.DocumentReference,
  order: admin.firestore.DocumentData,
  orderId: string,
  userId: string,
): Promise<void> {
  const payment = (order.payment ?? {}) as {
    status?: string;
    chargeId?: string;
    capturedAmount?: number;
  };
  if (!payment.chargeId || (payment.status !== 'authorized' && payment.status !== 'captured'))
    return;
  const wasCaptured = payment.status === 'captured';
  try {
    const refund = await releaseCharge({ orderId, chargeId: payment.chargeId });
    await orderRef.update({
      'payment.status': wasCaptured ? 'refunded' : 'released',
      'payment.refundId': refund.id ?? null,
      ...(wasCaptured
        ? {
            'payment.refundedAmount': refund.amount ?? payment.capturedAmount ?? null,
            'payment.refundedAt': FS.serverTimestamp(),
          }
        : { 'payment.releasedAt': FS.serverTimestamp() }),
      'payment.settleError': FS.delete(),
    });
  } catch (err) {
    console.error(
      `[settleOrderPayment] ${wasCaptured ? 'refund' : 'hold release'} failed for`,
      orderId,
      err,
    );
    await orderRef.update({ 'payment.settleError': String(err).slice(0, 300) }).catch(() => {});
    await sendAdminAlert(
      `Action needed: ${wasCaptured ? 'refund' : 'release card hold'} for ${orderId}`,
      [
        `We couldn't automatically ${wasCaptured ? 'refund' : 'release the card hold for'} order ${orderId}.`,
        `Please do it in the Clover dashboard (charge ${payment.chargeId}).`,
      ],
    );
    await notifyOnce(
      `payment_settle_failed_${orderId}`,
      'admin',
      'admin_payment_issue',
      `Action needed: ${wasCaptured ? 'refund' : 'release hold'} for ${orderId}`,
      `We couldn't automatically ${wasCaptured ? 'refund' : 'release the card hold for'} order ${orderId}. Do it in the Clover dashboard (charge ${payment.chargeId}).`,
      { orderId, userId, chargeId: payment.chargeId },
    );
  }
}

export const onOrderWrite = functions.firestore.onDocumentWritten(
  // RESEND_API_KEY: settleOrderPayment emails the admin if a refund fails.
  {
    document: 'orders/{orderId}',
    region: 'us-central1',
    secrets: [CLOVER_PRIVATE_TOKEN, 'RESEND_API_KEY'],
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;

    const prevStatus = before?.status as string | undefined;
    const newStatus = after.status as string;

    const orderId = (after.orderId as string) ?? event.params.orderId;
    const userId = (after.userId as string) ?? '';

    // ── R3 file2 Bug #5: pending-order edit credit reconciliation. ───
    //
    // Admin can edit a pending order via EditOrderModal — items/subtotal/
    // promo/total all get rewritten in-place while status stays 'pending'.
    // The credit deduction has ALREADY happened in the case 'pending'
    // branch below (which fired on order create), so an edit that
    // reduces the order's effective creditApplied (because the new
    // subtotal is too low to absorb the original credit, or admin
    // explicitly lowered creditApplied) leaves points-deducted-but-
    // discount-not-given.
    //
    // Detection: pending → pending update where the BEFORE's creditApplied
    // exceeds the post-edit cap (subtotal_after - promo_after). Refund
    // the dollar delta back to points using the same dollarsPer1000
    // rate the deduction used, write a 'refund' audit row, and update
    // creditPointsActuallyDeducted so any future cancellation only
    // refunds the residual.
    if (prevStatus === 'pending' && newStatus === 'pending' && before && userId) {
      try {
        const prevCreditApplied = (before.creditApplied as number) ?? 0;
        const prevPtsDeducted =
          typeof before.creditPointsActuallyDeducted === 'number'
            ? (before.creditPointsActuallyDeducted as number)
            : ((before.creditPointsRedeemed as number) ?? 0);
        const newSubtotal = (after.subtotal as number) ?? 0;
        const newPromoDiscount = (after.promoDiscount as number) ?? (after.discount as number) ?? 0;
        const newCreditApplied = (after.creditApplied as number) ?? 0;

        // Effective credit applicable AFTER edit = min(after.creditApplied,
        // pre-credit subtotal after edit). If the edit reduced the
        // subtotal below the credit, the customer paid points for
        // discount they didn't receive.
        const newAfterPromo = Math.max(0, newSubtotal - newPromoDiscount);
        const effectiveApplied = Math.min(newCreditApplied, newAfterPromo);
        const dollarShortfall = prevCreditApplied - effectiveApplied;

        if (prevPtsDeducted > 0 && dollarShortfall > 0.01) {
          // Convert dollar shortfall back to points using the same
          // dollarsPer1000 rate the deduction used.
          let dollarsPer1000 = 1;
          try {
            const settingsSnap = await db.doc('settings/global').get();
            const v = settingsSnap.data()?.creditValuePer1000;
            if (typeof v === 'number' && Number.isFinite(v) && v > 0) dollarsPer1000 = v;
          } catch (err) {
            console.warn(
              '[onOrderWrite] settings read failed during pending-edit refund; using default rate',
            );
            console.warn('[onOrderWrite] settings read error detail:', err);
            // Fall through with default — refund will be approximately
            // correct even if rate read failed.
          }
          // pts = dollars * 1000 / dollarsPer1000. Round DOWN so we
          // never refund more than the dollar-equivalent.
          const ptsToRefund = Math.floor((dollarShortfall * 1000) / dollarsPer1000);
          // Cap by actual amount deducted — never refund more than
          // was taken from the user's balance for this order.
          const refundPts = Math.min(ptsToRefund, prevPtsDeducted);

          if (refundPts > 0) {
            const creditRef = db.doc(`credits/${userId}`);
            const orderRef = event.data!.after!.ref;
            await db.runTransaction(async (tx) => {
              // Per-edit suffix on the audit row id so multiple edits
              // don't collide. Date.now() is monotonic enough within a
              // single function execution for uniqueness.
              const refundRef = db
                .collection('creditTransactions')
                .doc(`refund_edit_${orderId}_${Date.now()}`);
              const credSnap = await tx.get(creditRef);
              if (!credSnap.exists) return; // nothing to refund into
              const cur = credSnap.data()!;
              const curBalance = (cur.balance as number) ?? 0;
              const newBalance = curBalance + refundPts;
              const curLifetimeRedeemed = (cur.lifetimeRedeemed as number) ?? 0;
              tx.update(creditRef, {
                balance: newBalance,
                lifetimeRedeemed: Math.max(0, curLifetimeRedeemed - refundPts),
                updatedAt: FS.serverTimestamp(),
              });
              tx.set(refundRef, {
                userId,
                type: 'refund',
                points: refundPts,
                balanceAfter: newBalance,
                creditApplied: Number(dollarShortfall.toFixed(2)),
                orderId,
                adminNote: 'Refund for pending-order edit (subtotal/credit reduced)',
                createdAt: FS.serverTimestamp(),
              });
              // Update the order doc's actually-deducted marker so any
              // future cancellation refund only handles the residual.
              tx.update(orderRef, {
                creditPointsActuallyDeducted: prevPtsDeducted - refundPts,
              });
            });
            console.log(
              '[onOrderWrite] pending-edit refund:',
              refundPts,
              'pts to',
              userId,
              'for order',
              orderId,
              '(shortfall $',
              dollarShortfall.toFixed(2),
              ')',
            );
          }
        }
      } catch (editErr) {
        // Don't black-hole the order — log and continue. Admin can
        // manually adjust credit via AdminCustomers if the auto-refund
        // failed.
        console.error('[onOrderWrite] pending-edit reconciliation failed:', editErr);
      }
    }

    if (prevStatus === newStatus) return;

    // Resolve the customer's display name + email. Pickup orders don't
    // have a shippingAddress, so falling back to that field gives
    // "Customer" — useless for admin notifications. We read /users/{uid}
    // when no shipping name is available. The email comes from there too
    // since shippingAddress only carries a phone, not an email.
    let customerName = (after.shippingAddress?.name as string | undefined) ?? '';
    let customerEmail =
      after.isGuest === true && typeof after.customerEmail === 'string' ? after.customerEmail : '';
    if (userId && (!customerName || customerName === 'Customer')) {
      try {
        const userSnap = await db.doc(`users/${userId}`).get();
        if (userSnap.exists) {
          const u = userSnap.data() ?? {};
          customerName =
            customerName || (u.displayName as string) || (u.email as string) || 'Customer';
          customerEmail = (u.email as string) || '';
        } else {
          customerName = customerName || 'Customer';
        }
      } catch (err) {
        console.warn('[onOrderWrite] user read failed for', userId, err);
        customerName = customerName || 'Customer';
      }
    } else if (userId) {
      // Shipping name was good — still try to grab the email so admin
      // notifications carry it. Best-effort; fallback to empty string.
      try {
        const userSnap = await db.doc(`users/${userId}`).get();
        if (userSnap.exists) {
          customerEmail = (userSnap.data()?.email as string) || '';
        }
      } catch (err) {
        // Silent — email enrichment is opportunistic.
        void err;
      }
    }
    if (!customerName) customerName = 'Customer';

    const totalAmount = (after.totalAmount as number) ?? 0;
    const trackingNo = (after.trackingNumber as string) ?? '';
    const carrier = (after.carrier as string) ?? '';
    const reason = (after.rejectionReason as string) ?? (after.cancellationReason as string) ?? '';

    switch (newStatus) {
      case 'pending':
        if (prevStatus) break; // update to pending is unusual — only fire on create
        // Falls through to the body block — wrapped in {} so the const
        // declarations below don't leak to other case clauses
        // (eslint no-case-declarations).
        {
          // Server-side stock enforcement.
          //
          // Why this lives here and not in Firestore rules: rules can't read
          // across documents cheaply and can't atomically read+update a sibling
          // collection. The previous implementation decremented stock client-
          // side via writeBatch — atomic at the field level (Firestore
          // increment), but no non-negative check, so two simultaneous orders
          // for the last unit could both succeed and drive stock to -1.
          //
          // Now: a transaction reads each tea's stock, validates >= requested,
          // and either decrements or rejects the entire order. The Admin SDK
          // bypasses Firestore rules so /teas can stay admin-only-write for
          // clients while the trigger still updates stock here. Idempotent —
          // re-running the trigger on an order already past 'pending' is a
          // no-op because we early-return on prevStatus.
          try {
            const orderItems =
              (after.items as {
                productId?: string;
                productName?: string;
                quantity?: number;
                bundle?: { teas?: { id?: string }[]; samples?: { id?: string }[] };
              }[]) ?? [];

            // R2 Bug #17: bundle line items have productId='bundle-{uuid}'
            // which doesn't exist in /teas, so the previous loop silently
            // skipped them — and the constituent teas inside the bundle
            // were never reserved. This walked stock past zero on bundle-
            // heavy orders.
            //
            // Fix: expand bundle items into one decrement per constituent
            // tea (and per sample). The bundle blob itself isn't a /teas
            // doc so we iterate `bundle.teas` and `bundle.samples`. Bundle
            // items are quantity=1 by store invariant (cartStore L232),
            // so each constituent tea/sample is decremented by 1 per
            // bundle line.
            const expanded: { productId: string; productName: string; quantity: number }[] = [];
            for (const it of orderItems) {
              const qty = it.quantity ?? 0;
              if (qty <= 0) continue;
              // Plain tea line item with a real productId.
              if (it.productId && !it.productId.startsWith('bundle-')) {
                expanded.push({
                  productId: it.productId,
                  productName: it.productName || it.productId,
                  quantity: qty,
                });
                continue;
              }
              // Bundle line item — expand constituent teas + samples.
              // qty is 1 per the cart store invariant; if a future change
              // allows N>1 per bundle we still multiply through correctly.
              if (it.bundle) {
                const teas = Array.isArray(it.bundle.teas) ? it.bundle.teas : [];
                const samples = Array.isArray(it.bundle.samples) ? it.bundle.samples : [];
                for (const t of [...teas, ...samples]) {
                  if (t && typeof t.id === 'string' && t.id.length > 0) {
                    expanded.push({
                      productId: t.id,
                      productName: t.id,
                      quantity: qty, // multiply by bundle line quantity
                    });
                  }
                }
              }
            }

            // Coalesce duplicates so two cart lines for the same productId
            // (or a tea that appears in two bundles) read /teas only once
            // and reduce stock atomically by the combined amount.
            const itemsWithIds = Array.from(
              expanded
                .reduce((acc, cur) => {
                  const prev = acc.get(cur.productId);
                  if (prev) prev.quantity += cur.quantity;
                  else acc.set(cur.productId, { ...cur });
                  return acc;
                }, new Map<string, { productId: string; productName: string; quantity: number }>())
                .values(),
            );

            if (itemsWithIds.length > 0) {
              const insufficient = await db.runTransaction(async (tx) => {
                // 1. Read all referenced teas in one round-trip
                const teaRefs = itemsWithIds.map((i) => db.doc(`teas/${i.productId}`));
                const snaps = await Promise.all(teaRefs.map((r) => tx.get(r)));

                // 2. Validate availability. Turn 6 cleanup: this used to
                //    read a numeric `stock` field and decrement it per
                //    order. The new inventory model (level 0-10 set by
                //    employees) makes that quantity model wrong — a
                //    customer ordering 5 bags of matcha doesn't reduce
                //    container fullness by 5 in any meaningful way.
                //    Validation is now purely binary: is this tea
                //    available right now? If yes, accept any quantity;
                //    if no, reject the whole order.
                //
                //    Fail-closed when `available` is undefined — see
                //    src/lib/availability.ts for the rationale. The
                //    Turn 1 migration script + onTeaCreate trigger
                //    ensure every tea doc has the field populated.
                const shortfalls: { name: string; requested: number; available: number }[] = [];
                for (let i = 0; i < snaps.length; i++) {
                  const snap = snaps[i];
                  const item = itemsWithIds[i];
                  const requested = item.quantity ?? 0;
                  if (!snap.exists) {
                    // Tea doc missing — likely a deleted product. Don't block.
                    continue;
                  }
                  const teaData = snap.data();
                  const projectedAvailable = teaData?.available;
                  if (projectedAvailable !== true) {
                    // Unavailable OR projection-missing — block.
                    shortfalls.push({
                      name: item.productName,
                      requested,
                      available: 0,
                    });
                  }
                }

                if (shortfalls.length > 0) {
                  // Don't decrement — return the shortfall list so the caller
                  // can reject the order with a useful reason.
                  return shortfalls;
                }

                // 3. All available — mark the order. No quantity decrement
                //    in the new model (employees manage inventory level
                //    directly; orders don't subtract from a count).
                //    Explicitly set `decremented: false` so the rejection
                //    / cancellation path knows there's nothing to restore.
                tx.update(event.data!.after!.ref, {
                  decremented: false,
                });
                return null;
              });

              if (insufficient && insufficient.length > 0) {
                const reason =
                  'Some items are no longer available: ' +
                  insufficient.map((s) => s.name).join(', ');
                await event.data!.after!.ref.update({
                  status: 'rejected',
                  rejectionReason: reason,
                  // Mark as not-decremented so the rejected-branch trigger
                  // (restoreStockAndCredit) skips the stock-restore loop.
                  // In the post-Turn-6 model nothing was decremented anyway,
                  // but the flag preserves the existing restore contract.
                  decremented: false,
                  // R3-2 fix: ALSO mark creditPointsActuallyDeducted=0 here.
                  // We're rejecting BEFORE the credit-deduction transaction
                  // below ever runs, so no points were actually moved from
                  // the user's balance. Without this marker,
                  // restoreStockAndCredit (line ~208) falls back to
                  // `creditPointsRedeemed` (the CLAIMED amount) on the
                  // rejected-branch fire — refunding points the user never
                  // had deducted. Same exploit-shape as R1's Bug #1 (rate-
                  // mismatch path), but fired by the stock-shortfall path.
                  creditPointsActuallyDeducted: 0,
                  updatedAt: FS.serverTimestamp(),
                });
                // Skip the admin notification — the rejected-status branch of
                // this same trigger will fire on the next write and notify
                // the customer.
                return;
              }
            }
          } catch (stockErr) {
            // Stock check failure shouldn't black-hole the order — log and
            // continue so the admin still sees it and can resolve manually.
            console.error('[onOrderWrite] Stock check failed for', orderId, stockErr);
          }

          // ── Server-side credit redemption ─────────────────────────────────
          // CheckoutPage writes `creditPointsRedeemed` (points count) and
          // `creditApplied` (dollar value) to the order doc, but the client
          // CANNOT deduct from /credits/{uid} because firestore.rules forbids
          // it (the rule prevents users self-granting balance). Previously
          // the client tried `tx.update(creditRef, ...)` which silently
          // failed with permission-denied — the order succeeded but the
          // balance was never deducted, so customers could redeem the same
          // points on every order. This was a money exploit.
          //
          // Now: deduct here using the Admin SDK (bypasses rules), inside
          // the same pending-only branch so it's idempotent (the prevStatus
          // guard at the top of this case prevents re-runs).
          try {
            const pointsToRedeem = (after.creditPointsRedeemed as number) ?? 0;
            const claimedCreditApplied = (after.creditApplied as number) ?? 0;

            // R3-1 backstop — reject XOR pairs even when reaching here
            // via a direct firestore write that bypasses the placeOrder
            // callable. The firestore rule's `allow create` clause does
            // NOT cross-validate these two fields, so a malicious client
            // can write an order doc directly with `creditApplied=$99`
            // and `creditPointsRedeemed=0`. Without this check, the
            // rate-validation block below would skip (gated on
            // `pointsToRedeem > 0`), the deduction would skip too, and
            // the customer would walk away with $99 off for free. Same
            // exploit covered in placeOrder; this is the second layer.
            if (claimedCreditApplied > 0 !== pointsToRedeem > 0) {
              console.error(
                '[onOrderWrite] Malformed credit redemption for',
                orderId,
                '— claimedCreditApplied:',
                claimedCreditApplied,
                'creditPointsRedeemed:',
                pointsToRedeem,
                '. Rejecting order.',
              );
              await event.data!.after!.ref.update({
                status: 'rejected',
                rejectionReason:
                  'Credit redemption is malformed: dollar value and point count must both be set or both be zero.',
                creditPointsActuallyDeducted: 0,
                updatedAt: FS.serverTimestamp(),
              });
              return;
            }

            // ── Validate creditApplied against the live exchange rate. ─────
            // The order doc carries two related fields: creditPointsRedeemed
            // (point count) and creditApplied (dollar value). The Firestore
            // rule only checks `creditApplied >= 0`, never that the dollar
            // amount actually matches the points at the configured rate.
            // Without this server-side check, a malicious client can submit
            // creditPointsRedeemed=100, creditApplied=50, totalAmount lowered
            // by $50 — and pay 100 points for a $50 discount instead of the
            // intended $0.10. Recompute expected here using live settings
            // and reject the order if the claim is materially higher.
            if (pointsToRedeem > 0) {
              try {
                const settingsSnap = await db.doc('settings/global').get();
                const settings = settingsSnap.exists ? (settingsSnap.data() ?? {}) : {};
                const dollarsPer1000Raw = settings.creditValuePer1000;
                const dollarsPer1000 =
                  typeof dollarsPer1000Raw === 'number' && dollarsPer1000Raw > 0
                    ? dollarsPer1000Raw
                    : 1; // default $1 per 1000 pts
                const expectedCreditApplied = pointsToRedeem * (dollarsPer1000 / 1000);
                // Allow a 1¢ tolerance for floating-point rounding noise.
                if (claimedCreditApplied > expectedCreditApplied + 0.01) {
                  console.error(
                    '[onOrderWrite] Credit rate mismatch for',
                    orderId,
                    '— claimed $' + claimedCreditApplied.toFixed(2),
                    'for',
                    pointsToRedeem,
                    'pts but expected $' + expectedCreditApplied.toFixed(2),
                    '. Rejecting order.',
                  );
                  await event.data!.after!.ref.update({
                    status: 'rejected',
                    rejectionReason:
                      'Credit redemption amount does not match the current exchange rate. Please refresh and try again.',
                    // Decrement happened earlier in this branch; restore it.
                    // Setting decremented stays true so restoreStockAndCredit
                    // properly reverses inventory on the rejected-branch fire.
                    //
                    // Bug 1 fix: ALSO set creditPointsActuallyDeducted=0
                    // explicitly. We're rejecting BEFORE the credit deduction
                    // transaction below, so no points were actually moved.
                    // restoreStockAndCredit otherwise falls back to
                    // `creditPointsRedeemed` (the CLAIMED amount) when this
                    // field is absent — it would then refund points the
                    // user never had deducted. Free-credit exploit.
                    creditPointsActuallyDeducted: 0,
                    updatedAt: FS.serverTimestamp(),
                  });
                  return;
                }
              } catch (rateErr) {
                console.warn(
                  '[onOrderWrite] Settings read for rate validation failed; allowing order:',
                  rateErr,
                );
              }
            }

            if (pointsToRedeem > 0 && userId) {
              const creditRef = db.doc(`credits/${userId}`);
              const orderRef = event.data!.after!.ref;

              // R3 Bug #1: previously the deduction transaction silently
              // CLAMPED `actualDeduct` to the available balance when the
              // user claimed more points than they had — but the order
              // doc's `creditApplied` and `totalAmount` stayed at the
              // CLAIMED (inflated) values. A customer with 5,000 pts
              // (worth $5) could submit an order claiming creditApplied=$50
              // and creditPointsRedeemed=50000; rate validation passed
              // ($50 ≤ 50000 × 0.001 + 0.01); the deduction clamped to
              // 5,000 pts; but the customer paid totalAmount-$50 instead
              // of totalAmount-$5. Direct money exploit.
              //
              // Pre-check the balance against the claimed redemption
              // BEFORE entering the deduction transaction. If insufficient,
              // reject the entire order with a clear message — the
              // customer can refresh and re-apply credit at their actual
              // balance. We don't try to silently down-adjust the order
              // because that would also require recomputing totalAmount
              // and notifying the customer that their order changed
              // mid-flight, which is more confusing than rejection.
              //
              // The pre-check is a non-transactional read; a tiny race
              // window exists where balance could change between this
              // read and the transaction below. The transaction itself
              // remains the source of truth — if balance dropped below
              // pointsToRedeem in that window, we still clamp BUT the
              // order was rejected here first, so the transaction never
              // runs in that case. The pre-check prevents the exploit
              // path; the transaction's existing clamp covers the
              // narrow concurrent-spend race window for legitimate users.
              try {
                const preSnap = await creditRef.get();
                const preBalance = preSnap.exists ? ((preSnap.data()?.balance as number) ?? 0) : 0;
                if (preBalance < pointsToRedeem) {
                  console.warn(
                    '[onOrderWrite] Credit insufficient for',
                    orderId,
                    '— claimed',
                    pointsToRedeem,
                    'pts but balance is',
                    preBalance,
                    '. Rejecting.',
                  );
                  await orderRef.update({
                    status: 'rejected',
                    rejectionReason:
                      'Insufficient credit balance for the redemption you applied. Please refresh and try again with your current balance.',
                    // No deduction happened; mark explicitly so refund
                    // path doesn't try to refund nothing.
                    creditPointsActuallyDeducted: 0,
                    // Stock decrement DID happen earlier in this branch
                    // (decremented:true). Keep it true so restoreStockAndCredit
                    // restores stock when the rejected-branch trigger
                    // fires — same path as the rate-mismatch reject above.
                    updatedAt: FS.serverTimestamp(),
                  });
                  return;
                }
              } catch (preErr) {
                // Read failed — fall through to the transaction. The
                // transaction's clamp is still in place as a safety net,
                // and the customer will at most lose pts to the silent-
                // clamp behaviour (the original bug). Worst-case posture
                // here is "no worse than before."
                console.warn('[onOrderWrite] Pre-check balance read failed:', preErr);
              }

              await db.runTransaction(async (tx) => {
                const snap = await tx.get(creditRef);
                if (!snap.exists) {
                  console.warn(
                    '[onOrderWrite] No /credits doc for',
                    userId,
                    '— skipping redemption',
                  );
                  // Still mark the order so the refund path doesn't refund
                  // points that were never deducted.
                  tx.update(orderRef, { creditPointsActuallyDeducted: 0 });
                  return;
                }
                const current = snap.data()!;
                const curBalance = (current.balance as number) ?? 0;
                // Defensive clamp — pre-check above catches the exploit;
                // this clamp now only fires on the narrow concurrent-spend
                // race (user redeems same balance from two tabs in the
                // window between the pre-check and this transaction).
                const actualDeduct = Math.min(pointsToRedeem, curBalance);
                if (actualDeduct < pointsToRedeem) {
                  console.warn(
                    '[onOrderWrite] Order',
                    orderId,
                    'requested',
                    pointsToRedeem,
                    'pts but balance was only',
                    curBalance,
                    '— clamping deduction (concurrent-spend race).',
                  );
                }
                const newBalance = curBalance - actualDeduct;
                const claimedCredit = (after.creditApplied as number) ?? 0;
                const claimedPts = pointsToRedeem;
                const actualCreditApplied =
                  claimedPts > 0 ? claimedCredit * (actualDeduct / claimedPts) : 0;
                tx.update(creditRef, {
                  balance: newBalance,
                  lifetimeRedeemed: ((current.lifetimeRedeemed as number) ?? 0) + actualDeduct,
                  updatedAt: FS.serverTimestamp(),
                });
                // R3-3 marker write — INSIDE this transaction so it
                // commits atomically with the balance change.
                //
                // R3 Bug #1 follow-up: when the concurrent-spend race
                // clamp fires (actualDeduct < pointsToRedeem), update
                // the order's creditApplied / totalAmount to the actual
                // values too. Without this the legitimate concurrent-
                // spend customer would still get the inflated discount
                // (smaller exploit shape than the pre-check case, but
                // same direction). For exact-match deductions this is
                // a no-op rewrite of the same values.
                const orderUpdate: Record<string, unknown> = {
                  creditPointsActuallyDeducted: actualDeduct,
                };
                if (actualDeduct < pointsToRedeem) {
                  // Recompute totalAmount with the actual credit applied.
                  // Other order fields (subtotal, gst, shipping, promo)
                  // stay; only creditApplied + totalAmount change.
                  const subtotal = (after.subtotal as number) ?? 0;
                  const gst = (after.gst as number) ?? 0;
                  const shippingFee = (after.shippingFee as number) ?? 0;
                  const promoDiscount =
                    (after.promoDiscount as number) ?? (after.discount as number) ?? 0;
                  const afterPromo = Math.max(0, subtotal - promoDiscount);
                  const afterCredit = Math.max(0, afterPromo - actualCreditApplied);
                  const newTotal = Math.max(0, afterCredit + shippingFee + gst);
                  orderUpdate.creditApplied = Number(actualCreditApplied.toFixed(2));
                  orderUpdate.totalAmount = Number(newTotal.toFixed(2));
                }
                tx.update(orderRef, orderUpdate);
                // Bug 5/7 — deterministic audit doc ID per order so a
                // duplicate-fire of this trigger (Firestore at-least-once
                // delivery) can't create a second 'redeem' row.
                const txRef = db.collection('creditTransactions').doc(`redeem_${orderId}`);
                tx.set(txRef, {
                  userId,
                  type: 'redeem',
                  points: -actualDeduct,
                  balanceAfter: newBalance,
                  creditApplied: Number(actualCreditApplied.toFixed(2)),
                  orderId: orderId,
                  createdAt: FS.serverTimestamp(),
                });
              });
            }
          } catch (creditErr) {
            console.error('[onOrderWrite] Credit deduction failed for', orderId, creditErr);
            // Don't reject the order — log and let admin handle. Same
            // failure-recovery posture as the stock check above.
          }

          // ── Server-side promo usage tracking ──────────────────────────────
          // CheckoutPage USED to do this client-side via runTransaction,
          // but the previous Firestore rule allowed only admin writes to
          // /promotions, so the customer-side `tx.update(promoRef, ...)`
          // silently failed and total usageCount never incremented.
          // (We later relaxed the rule to allow narrow customer
          // increments, but keeping the source-of-truth on the server
          // gives stronger guarantees: the increment now happens in the
          // same idempotent pending-branch as stock + credit deduction,
          // so a network blip after order setDoc can't leave usageCount
          // out of sync with the order.)
          try {
            const promotionId = (after.promotionId as string) ?? '';
            const promoCode = (after.promoCode as string) ?? '';
            const promoDiscountAmt = (after.promoDiscount as number) ?? 0;
            if (promotionId && userId) {
              // Idempotency check: if /promotionUsage already has a doc
              // for this (promotionId, orderId), the trigger fired twice
              // for the same create event (Firestore at-least-once
              // delivery). Skip both writes.
              const existing = await db
                .collection('promotionUsage')
                .where('promotionId', '==', promotionId)
                .where('orderId', '==', orderId)
                .limit(1)
                .get();
              if (existing.empty) {
                await db.runTransaction(async (tx) => {
                  const promoRef = db.doc(`promotions/${promotionId}`);
                  const promoSnap = await tx.get(promoRef);
                  if (!promoSnap.exists) return;
                  const cur = (promoSnap.data()?.usageCount as number) ?? 0;
                  tx.update(promoRef, {
                    usageCount: cur + 1,
                    updatedAt: FS.serverTimestamp(),
                  });
                  const usageRef = db.collection('promotionUsage').doc();
                  tx.set(usageRef, {
                    promotionId,
                    promoCode,
                    userId,
                    orderId,
                    discountAmount: promoDiscountAmt,
                    usedAt: FS.serverTimestamp(),
                  });
                });
              }
            }
          } catch (promoErr) {
            console.error('[onOrderWrite] Promo usage tracking failed for', orderId, promoErr);
            // Don't reject the order — log and continue. Worst case the
            // total usage limit lags by one; per-user limit is checked
            // separately via /promotionUsage queries on next apply.
          }

          // Build the items array for the admin notification. The bell
          // already renders d.items when present — was previously dead UI
          // because no notify() call wrote it. Strip pricing-internals
          // we don't need in the bell (image URLs, product IDs).
          const notifItems = (
            (after.items as { productName?: string; quantity?: number; price?: number }[]) ?? []
          )
            .filter((i) => i.productName)
            .slice(0, 20) // cap notification size
            .map((i) => ({
              productName: i.productName ?? '',
              quantity: Number(i.quantity ?? 0),
              price: Number(i.price ?? 0),
            }));
          const fulfillmentHint = after.fulfillmentMethod === 'pickup' ? ' (PICKUP)' : '';

          await notifyOnce(
            keyForOrderStatus(orderIdOf(orderId), 'pending', 'admin'),
            'admin',
            'admin_order_placed',
            `New order ${orderId}${fulfillmentHint}`,
            `${customerName} placed an order for $${totalAmount.toFixed(2)} — review required`,
            {
              orderId,
              customerName,
              customerEmail,
              customerId: (after.customerId as string) ?? '',
              totalAmount,
              subtotal: Number(after.subtotal ?? 0),
              shippingFee: Number(after.shippingFee ?? 0),
              items: notifItems,
              userId,
            },
          );
        }
        break;

      case 'in_progress':
        await notifyOnce(
          keyForOrderStatus(orderIdOf(orderId), 'in_progress', 'user'),
          userId,
          'customer_payment_confirmed',
          `Order ${orderId} confirmed`,
          `Your teas are in stock and your card was charged $${totalAmount.toFixed(2)}. We're preparing your order now.`,
          { orderId },
          'orderUpdates',
        );
        break;

      // R1 Bug #22: pickup orders get their own status. Notify the
      // customer their order is at the counter (not "shipped").
      case 'ready_for_pickup':
        await notifyOnce(
          keyForOrderStatus(orderIdOf(orderId), 'ready_for_pickup', 'user'),
          userId,
          'customer_order_ready_for_pickup',
          `Order ${orderId} is ready for pickup`,
          'Your order is at the counter — bring your order number when you stop by.',
          { orderId },
          'orderUpdates',
        );
        break;

      case 'shipped':
        await notifyOnce(
          keyForOrderStatus(orderIdOf(orderId), 'shipped', 'user'),
          userId,
          'customer_order_shipped',
          `Order ${orderId} shipped!`,
          `On its way${trackingNo ? ` — tracking: ${trackingNo}` : ''}.`,
          { orderId, trackingNumber: trackingNo, carrier },
          'orderUpdates',
        );
        break;

      case 'delivered': {
        if (after.isGuest === true) {
          // Guest orders don't earn points (there's no account to hold them).
          await notifyOnce(
            keyForOrderStatus(orderIdOf(orderId), 'delivered', 'user'),
            userId,
            'customer_order_delivered',
            `Order ${orderId} delivered`,
            'Enjoy your tea!',
            { orderId, pointsEarned: 0 },
            'orderUpdates',
          );
          break;
        }
        const subtotal = (after.subtotal as number) ?? 0;
        const creditApplied = (after.creditApplied as number) ?? 0;
        // Order docs carry the discount under `promoDiscount` (the field
        // name CheckoutPage writes). Earlier code read `discount` which
        // never exists on the doc, leaving promo discounts out of the
        // points-earned calculation — customers earned full points on
        // the pre-promo amount. Read both keys for backward compat with
        // any historical docs that may have used `discount`.
        const promoDiscount = (after.promoDiscount as number) ?? (after.discount as number) ?? 0;
        const afterCredit = Math.max(0, subtotal - creditApplied - promoDiscount);

        // Read pointsPerDollar from /settings/global so admin's value
        // in /admin/settings → Credit System is the single source of
        // truth. Falls back to 100 if missing/invalid — matches the
        // SETTING_DEFAULTS in src/hooks/useSettings.ts.
        let pointsPerDollar = 100;
        try {
          const settingsSnap = await db.doc('settings/global').get();
          if (settingsSnap.exists) {
            const v = settingsSnap.data()?.pointsPerDollar;
            // R3 Bug #2: previously this was `Math.floor(v)`, which
            // destroyed sub-1 admin-set rates (e.g. 0.5 → 0, killing
            // earn entirely). The client (useCreditConfig.pickPositive)
            // doesn't floor, so client + server disagreed silently.
            // Now we accept any positive finite number; the final
            // ptsEarned is rounded down at integer boundary below
            // because Firestore `points` should remain an integer.
            if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
              pointsPerDollar = v;
            }
          }
        } catch (err) {
          console.warn(
            '[onOrderWrite delivered] Settings read failed, using default 100 pts/$1:',
            err,
          );
        }
        const ptsEarned = Math.floor(afterCredit * pointsPerDollar);

        if (ptsEarned > 0 && userId) {
          const creditRef = db.doc(`credits/${userId}`);
          // Bug 5 fix — deterministic audit doc ID (`earn_<orderId>`)
          // gives us per-order idempotency. The outer guard
          // `prevStatus === newStatus` prevents duplicate fires of the
          // SAME transition, but doesn't help when an admin manually
          // flips status `shipped → delivered → shipped → delivered`
          // (each transition is distinct). Each such delivered entry
          // would re-run this transaction and re-credit the user.
          // With a deterministic ID we read-check first and skip on
          // hit. (We also rely on this for the cancellation reversal
          // — see restoreStockAndCredit.)
          const earnAuditRef = db.collection('creditTransactions').doc(`earn_${orderId}`);
          await db.runTransaction(async (tx) => {
            // Idempotency check: if the earn audit row already exists,
            // we've already processed this order's delivery — skip.
            const existingEarn = await tx.get(earnAuditRef);
            if (existingEarn.exists) {
              console.log(
                '[onOrderWrite delivered] earn already recorded for',
                orderId,
                '— skipping',
              );
              return;
            }
            const snap = await tx.get(creditRef);
            const cur = snap.exists
              ? snap.data()!
              : {
                  balance: 0,
                  lifetimeEarned: 0,
                  lifetimeSpend: 0,
                  orderCount: 0,
                  lifetimeRedeemed: 0,
                  welcomeBonusGiven: false,
                };
            const newBalance = ((cur.balance as number) ?? 0) + ptsEarned;
            // Bug 9 fix — `tx.set` with merge:true (or tx.update if exists)
            // so any future schema fields on the credit doc aren't
            // silently wiped on every order delivery.
            const updates: Record<string, unknown> = {
              userId,
              balance: newBalance,
              lifetimeEarned: ((cur.lifetimeEarned as number) ?? 0) + ptsEarned,
              lifetimeSpend: ((cur.lifetimeSpend as number) ?? 0) + afterCredit,
              orderCount: ((cur.orderCount as number) ?? 0) + 1,
              welcomeBonusGiven: (cur.welcomeBonusGiven as boolean) ?? false,
              // R3 file2 Bug #16: lastEarnedAt removed (dead field).
              updatedAt: FS.serverTimestamp(),
            };
            if (snap.exists) {
              tx.update(creditRef, updates);
            } else {
              tx.set(creditRef, {
                ...updates,
                lifetimeRedeemed: 0,
                createdAt: FS.serverTimestamp(),
              });
            }
            tx.set(earnAuditRef, {
              userId,
              type: 'earn',
              points: ptsEarned,
              balanceAfter: newBalance,
              orderId,
              orderSubtotal: afterCredit,
              createdAt: FS.serverTimestamp(),
            });
          });
          await notifyOnce(
            keyForCreditEarned(orderIdOf(orderId)),
            userId,
            'customer_credit_earned',
            `+${ptsEarned.toLocaleString()} points earned`,
            `From order ${orderId}. Balance updated.`,
            { orderId, pointsEarned: ptsEarned },
            'orderUpdates',
          );
        }
        await notifyOnce(
          keyForOrderStatus(orderIdOf(orderId), 'delivered', 'user'),
          userId,
          'customer_order_delivered',
          `Order ${orderId} delivered`,
          `Enjoy your tea!${ptsEarned > 0 ? ` You earned ${ptsEarned.toLocaleString()} pts.` : ''}`,
          // "Rate your teas" in the bell opens My Orders, where each tea has a Rate link.
          { orderId, pointsEarned: ptsEarned, url: '/orders' },
          'orderUpdates',
        );
        break;
      }

      case 'rejected':
        await settleOrderPayment(event.data!.after!.ref, after, orderId, userId);
        // Pass wasDelivered=true if admin moved this from 'delivered' →
        // 'rejected'. restoreStockAndCredit will then also reverse the
        // earn row + lifetime fields. (Normal rejected from pending
        // never had an earn row — that's why prevStatus is the gate.)
        await restoreStockAndCredit(
          event.data!.after!.ref,
          after,
          orderId,
          userId,
          prevStatus === 'delivered',
        );
        await notifyOnce(
          keyForOrderStatus(orderIdOf(orderId), 'rejected', 'user'),
          userId,
          'customer_order_rejected',
          `Order ${orderId} rejected`,
          reason ? `Reason: ${reason}` : 'Your order could not be processed.',
          { orderId, reason },
          'orderUpdates',
        );
        break;

      case 'cancelled':
        await settleOrderPayment(event.data!.after!.ref, after, orderId, userId);
        await restoreStockAndCredit(
          event.data!.after!.ref,
          after,
          orderId,
          userId,
          prevStatus === 'delivered',
        );
        await notifyOnce(
          keyForOrderStatus(orderIdOf(orderId), 'cancelled', 'user'),
          userId,
          'customer_order_cancelled',
          `Order ${orderId} cancelled`,
          reason ? `Reason: ${reason}` : 'Your order has been cancelled.',
          { orderId, reason },
          'orderUpdates',
        );
        break;

      case 'expired':
        // 'expired' only fires on pending (never-approved) orders — see
        // onOrderExpiry — so wasDelivered stays false here.
        await settleOrderPayment(event.data!.after!.ref, after, orderId, userId);
        await restoreStockAndCredit(event.data!.after!.ref, after, orderId, userId);
        await notifyOnce(
          keyForOrderStatus(orderIdOf(orderId), 'expired', 'user'),
          userId,
          'customer_order_expired',
          `Order ${orderId} expired`,
          "We couldn't confirm your order in time, so it was cancelled and the hold on your card was released. You were not charged.",
          { orderId },
          'orderUpdates',
        );
        break;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// placeOrder — callable Cloud Function that writes the order doc using
// the Admin SDK, bypassing Firestore rules entirely.
//
// Why callable instead of direct setDoc:
// We were hitting permission-denied on /orders/{orderId} create from
// the customer client even with permissive rules and verified tokens.
// The contradiction was unsolvable from outside the Firebase project.
// Routing the write through a callable function eliminates the rule
// layer entirely (Admin SDK is unconstrained). It also moves field
// validation server-side where it belongs.
//
// Security model after this change:
//   • Client can only call this if signed in (callable enforces).
//   • Function double-checks auth.uid matches request.data.userId.
//   • Email verification still enforced (defense in depth).
//   • Idempotent on orderId: existing orderId returns success
//     without re-writing — same retry semantics as the previous
//     client-side check, just moved server-side.
//   • Server-recomputed totalAmount from clamped numeric inputs.
//     Client's claimed totalAmount is ignored; admin still reviews
//     every order before approval as the secondary check.
// ─────────────────────────────────────────────────────────────────────────────
/** Declined cards allowed per account per hour before placeOrder pauses it. */
const CARD_DECLINE_LIMIT = 5;

export const placeOrder = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: true, secrets: [CLOVER_PRIVATE_TOKEN] },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }
    // Guest checkout: an anonymous Firebase session plus the email the
    // guest typed. Guests can't redeem credit or use per-customer-limited
    // codes, and card declines are rate-limited per network address.
    const isGuest = request.auth.token?.firebase?.sign_in_provider === 'anonymous';
    const guestEmail = isGuest
      ? String((request.data as { guestEmail?: unknown })?.guestEmail ?? '')
          .trim()
          .toLowerCase()
      : '';
    if (isGuest) {
      if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(guestEmail)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Please enter a valid email address.',
        );
      }
    } else if (request.auth.token?.email_verified !== true) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Please verify your email before placing an order.',
      );
    }

    const data = request.data as {
      orderId?: string;
      userId?: string;
      customerId?: string;
      items?: Array<{
        productId: string;
        productName?: string;
        quantity: number;
        price: number;
        image?: string;
        bundle?: unknown;
      }>;
      subtotal?: number;
      creditApplied?: number;
      promoCode?: string | null;
      promotionId?: string | null;
      promoDiscount?: number;
      creditPointsRedeemed?: number;
      fulfillmentMethod?: 'delivery' | 'pickup';
      /** Clover card token (clv_…) from the checkout card form. Required
       *  unless credit covers the whole order. */
      cardToken?: string;
      /** The total the customer saw. The hold is never larger than this. */
      expectedTotal?: number;
      shippingAddress?: Record<string, unknown>;
      isGift?: boolean;
      recipientName?: string;
      senderName?: string;
      giftMessage?: string;
      occasion?: string;
      customOccasion?: string;
      /** Site language at checkout — order emails go out in it. */
      lang?: string;
    };

    if (!data.userId || data.userId !== request.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Order userId must match the signed-in user.',
      );
    }
    // Round 2 Bug #18: previously `length < 5` was too loose. The
    // generateOrderId helper produces a fixed-format ID; we accept any
    // string between 8 and 64 chars so future format changes don't
    // require touching this gate, but reject the obvious short/long
    // garbage that a probing client might submit.
    if (
      !data.orderId ||
      typeof data.orderId !== 'string' ||
      data.orderId.length < 8 ||
      data.orderId.length > 64 ||
      // Restrict charset so the order doc path stays predictable.
      // Firestore tolerates more, but we want IDs we can search /
      // log without quoting.
      !/^[A-Za-z0-9_-]+$/.test(data.orderId)
    ) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid orderId.');
    }
    // Cart lines — IDs, quantities and bundle contents are validated and
    // normalised here (see lib/orderValidation.ts). Prices are NOT taken
    // from the client: teas are re-read below, bundles use BUNDLE_TIERS.
    let lines: OrderLine[];
    try {
      lines = validateOrderLines(data.items);
    } catch (err) {
      if (err instanceof OrderInputError)
        throw new functions.https.HttpsError('invalid-argument', err.message);
      throw err;
    }

    // Idempotent: if the orderId already exists, return success
    // without re-writing. Mirrors the client-side retry guard.
    const orderRef = db.doc(`orders/${data.orderId}`);
    const existing = await orderRef.get();
    if (existing.exists) {
      // Only the owner's own retry is an idempotent success; never confirm
      // (or reveal) another customer's order id.
      if (existing.data()?.userId !== request.auth.uid) {
        throw new functions.https.HttpsError(
          'already-exists',
          'Please refresh the page and try again.',
        );
      }
      return { ok: true, orderId: data.orderId, alreadyExisted: true };
    }

    // ─── R2 Bug #16: re-fetch prices from /teas to close the price-trust gap. ──
    //
    // Previously the function trusted the client-claimed `price` on each
    // line item. Even after the R3-10 fix (subtotal recomputed from items
    // rather than trusted directly), the items' `price` was still the
    // client's number. A malicious client could submit
    //   { productId: 'real-pu-erh-id', price: 0.01, quantity: 100 }
    // and the recomputed subtotal would honour the fake price. The
    // R3-10 comment claimed this exploit was closed; it wasn't.
    //
    // Fix: for every line item that is NOT a bundle (productId NOT
    // matching `bundle-*`), read /teas/{productId} and use the canonical
    // price. Bundle items use their client-supplied price because the
    // bundle catalogue is admin-curated and the bundle line item is
    // priced at the bundle tier level, not the constituent teas. The
    // bundle catalogue should ideally also be revalidated server-side,
    // but that requires a separate /bundles collection — out of scope
    // for this fix. For now, bundle prices retain the client-claim
    // posture and admin review remains the secondary check on those.
    //
    // We pull all tea docs in parallel before any writes; on a missing
    // tea, we reject the order (a deleted-but-cart-cached tea cannot
    // be honored).
    // R3 Bug #10: bundle line items previously kept the client-claimed
    // price unchallenged because there's no /bundles collection holding
    // canonical tier prices. A malicious client could submit
    // `productId: 'bundle-anything'` with `price: 0` and a forged
    // bundle blob — getting the bundle (and its constituent teas via
    // the stock-decrement path) for free.
    //
    // Server-side defense: validate that each bundle's claimed price
    // is at least the SUM of its constituent teas' canonical prices.
    // A bundle's tier discount is admin-curated marketing, but an
    // honest bundle is never CHEAPER than the goods it contains
    // (otherwise the bundle would be a loss leader by definition).
    // We pull the constituent tea prices into the same /teas batch
    // read used for non-bundle line items.
    const directTeaIds = lines
      .filter((l): l is DirectLine => l.kind === 'tea')
      .map((l) => l.productId);
    const bundleConstituentIds = lines.flatMap((l) =>
      l.kind === 'bundle' ? [...l.teaIds, ...l.sampleIds] : [],
    );
    const teaItemIds = Array.from(new Set([...directTeaIds, ...bundleConstituentIds]));
    const teaSnaps = await Promise.all(teaItemIds.map((id) => db.doc(`teas/${id}`).get()));
    const canonicalPrices = new Map<string, number>();
    const canonicalNames = new Map<string, string>();
    const canonicalImages = new Map<string, string>();
    const canonicalGst = new Map<string, boolean>();
    const unavailableNames: string[] = [];
    const missingIds: string[] = [];
    for (let i = 0; i < teaItemIds.length; i++) {
      const id = teaItemIds[i];
      const snap = teaSnaps[i];
      const teaData = snap.exists ? (snap.data() ?? {}) : null;
      const teaPrice = teaData?.price;
      // A tea we can't price (deleted / hidden / malformed) can't be sold.
      if (
        !teaData ||
        typeof teaPrice !== 'number' ||
        !Number.isFinite(teaPrice) ||
        teaPrice < 0 ||
        teaData.isActive === false
      ) {
        missingIds.push(id);
        continue;
      }
      canonicalPrices.set(id, teaPrice);
      if (typeof teaData.name === 'string') canonicalNames.set(id, teaData.name);
      if (typeof teaData.image === 'string') canonicalImages.set(id, teaData.image);
      canonicalGst.set(id, teaData.gstApplicable === true);
      // Same fail-closed availability rule as onOrderWrite / approveOrder:
      // never hold a card for an order that would be rejected for stock.
      if (teaData.available !== true) {
        unavailableNames.push(typeof teaData.name === 'string' ? teaData.name : id);
      }
    }
    if (missingIds.length > 0) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        missingIds.some((id) => directTeaIds.includes(id))
          ? 'Some items in your cart are no longer available. Please refresh your cart.'
          : 'A tea inside one of your bundles is no longer available. Please rebuild the bundle.',
      );
    }
    if (unavailableNames.length > 0) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Sorry — these teas just sold out: ${unavailableNames.join(', ')}. Please update your cart.`,
      );
    }

    const resolvedItems = lines.map((l) => {
      if (l.kind === 'bundle') {
        const image = canonicalImages.get(l.teaIds[0]);
        return {
          productId: l.productId,
          productName: l.name,
          quantity: 1,
          price: l.price, // BUNDLE_TIERS — never the client's number
          gstApplicable: false, // bundles are never taxable (same as the cart)
          ...(image ? { image } : {}),
          bundle: l.bundle, // sanitised copy, not the raw client blob
        };
      }
      const image = canonicalImages.get(l.productId);
      return {
        productId: l.productId,
        productName: canonicalNames.get(l.productId) ?? l.productId,
        quantity: l.quantity,
        price: canonicalPrices.get(l.productId)!,
        gstApplicable: canonicalGst.get(l.productId) === true,
        ...(image ? { image } : {}),
      };
    });

    // The card hold is for this total, so every number below comes from
    // Firestore (canonical prices, the promotion doc, settings) — never
    // from the client's claimed shipping / GST / promo / total.
    const creditPointsRedeemed = safeNum(data.creditPointsRedeemed);
    const creditApplied = safeNum(data.creditApplied);

    // R3-1 fix — validate the credit redemption pair as a unit.
    //
    // Pre-fix, both rate-validation gates checked `creditPointsRedeemed > 0`,
    // which meant a client could submit `creditApplied=$99` with
    // `creditPointsRedeemed=0` and the validator skipped entirely —
    // applying a $99 discount that cost the user zero points.
    // Free-money exploit on any order.
    //
    // The two fields are a coupled pair: a non-zero value in EITHER means
    // the user is claiming to redeem credit, so BOTH must be non-zero
    // for the claim to be coherent. XOR (one set, the other zero) is
    // a malformed claim and we reject up front.
    //
    // After XOR rejection we know either (a) both are zero (no credit
    // being redeemed — skip rate validation) or (b) both are non-zero
    // (rate validation must run).
    if (creditApplied > 0 !== creditPointsRedeemed > 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Credit redemption is malformed: dollar value and point count must both be set or both be zero.',
      );
    }

    if (creditApplied > 0 && creditPointsRedeemed > 0) {
      try {
        const settingsSnap = await db.doc('settings/global').get();
        const settings = settingsSnap.exists ? (settingsSnap.data() ?? {}) : {};
        const dollarsPer1000Raw = settings.creditValuePer1000;
        const dollarsPer1000 =
          typeof dollarsPer1000Raw === 'number' && dollarsPer1000Raw > 0 ? dollarsPer1000Raw : 1;
        const expectedCreditApplied = creditPointsRedeemed * (dollarsPer1000 / 1000);
        if (creditApplied > expectedCreditApplied + 0.01) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Credit redemption amount does not match the current rate. Please refresh and try again.',
          );
        }
      } catch (rateErr) {
        // Re-raise our own HttpsError; tolerate transient settings-read
        // failures by allowing the order through — onOrderWrite will
        // catch a mismatch as a backstop.
        if (rateErr instanceof functions.https.HttpsError) throw rateErr;
        console.warn(
          '[placeOrder] settings read failed, deferring rate check to onOrderWrite:',
          rateErr,
        );
      }
    }

    const fulfillmentMethod = data.fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery';
    // R2 Bug #20: validate shippingAddress shape for delivery orders so
    // a malicious client can't drop arbitrary keys onto the doc. Loose
    // allowlist: keep only the well-known fields we render in emails
    // and the admin UI; drop anything else (e.g. injected HTML payloads
    // wrapped in unexpected keys).
    let shippingAddress: Record<string, unknown> | null = null;
    if (
      fulfillmentMethod === 'delivery' &&
      data.shippingAddress &&
      typeof data.shippingAddress === 'object'
    ) {
      const allowed = [
        'name',
        'phone',
        'address',
        'city',
        'province',
        'postalCode',
        'country',
      ] as const;
      const cleaned: Record<string, string> = {};
      for (const key of allowed) {
        const v = (data.shippingAddress as Record<string, unknown>)[key];
        if (typeof v === 'string') cleaned[key] = v.slice(0, 300); // bound length defensively
      }
      // Pickup-with-stale-form edge case: if no fields cleaned through,
      // treat as missing rather than persisting an empty object.
      if (Object.keys(cleaned).length > 0) shippingAddress = cleaned;
    }
    if (fulfillmentMethod === 'delivery' && !shippingAddress) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Delivery orders require a shipping address.',
      );
    }

    // ── Promotion — re-validated server-side (dates, limits, minimum,
    //    per-customer uses) and the discount recomputed from the doc.
    const now = new Date();
    const settingsSnap = await db.doc('settings/global').get();
    const settings = settingsSnap.data() ?? {};
    const preDiscountSubtotal = resolvedItems.reduce((s, i) => s + i.price * i.quantity, 0);
    let promoDiscount = 0;
    let promotionId: string | null = null;
    let promoCode: string | null = null;
    if (data.promotionId) {
      const promoSnap = await db.doc(`promotions/${data.promotionId}`).get();
      if (!promoSnap.exists) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'That promo code no longer exists. Please remove it and try again.',
        );
      }
      const promo = promoSnap.data() ?? {};
      if (isGuest && Number(promo.perUserLimit) > 0) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Please sign in to use this code — it’s limited per customer.',
        );
      }
      const usage = await db
        .collection('promotionUsage')
        .where('promotionId', '==', data.promotionId)
        .where('userId', '==', request.auth.uid)
        .get();
      const result = evaluatePromotion(promo, {
        subtotal: preDiscountSubtotal,
        now,
        timesUsedByUser: usage.size,
      });
      if (!result.ok) throw new functions.https.HttpsError('failed-precondition', result.reason);
      promoDiscount = result.discount;
      promotionId = data.promotionId;
      promoCode = typeof promo.code === 'string' ? promo.code : (data.promoCode ?? null);
    }

    const totals = computeOrderTotals({
      items: resolvedItems,
      promoDiscount,
      creditApplied,
      fulfillment: fulfillmentMethod,
      settings,
    });
    const { subtotal, shippingFee, gst, totalAmount } = totals;
    // Minimum redemption (Settings → Credit System) — enforced here, not
    // just in the checkout UI. The one exception mirrors checkout: when
    // points cover the WHOLE order, the client scales them down to the
    // exact order value, which can fall under the minimum.
    const minRedeemRaw = settings.minRedemptionPts;
    const minRedeem =
      typeof minRedeemRaw === 'number' && Number.isFinite(minRedeemRaw) && minRedeemRaw > 0
        ? minRedeemRaw
        : 10000;
    const coversWholeOrder =
      Math.abs(creditApplied - (totals.subtotal - totals.promoDiscount)) <= 0.01;
    if (creditPointsRedeemed > 0 && creditPointsRedeemed < minRedeem && !coversWholeOrder) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Points can be redeemed in blocks of ${minRedeem.toLocaleString()}. Please reapply your credits.`,
      );
    }

    // Credit beyond what the order can absorb is rejected rather than
    // silently trimmed, so points and dollars stay in lockstep.
    if (totals.creditApplied + 0.01 < creditApplied) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Your cart total changed — please reapply your credits.',
      );
    }

    // Never hold more than the customer was shown.
    if (typeof data.expectedTotal === 'number' && totalAmount > data.expectedTotal + 0.01) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Your total is now $${totalAmount.toFixed(2)} (prices or shipping changed). Please review your order and try again.`,
      );
    }

    // Points: check the balance BEFORE holding the card, so an order can't
    // be placed on points the customer doesn't have (onOrderWrite would
    // later clamp the credit and push the total above the card hold).
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    if (creditPointsRedeemed > 0) {
      const balance = Number(
        (await db.doc(`credits/${request.auth.uid}`).get()).data()?.balance ?? 0,
      );
      if (!Number.isFinite(balance) || balance < creditPointsRedeemed) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          "You don't have enough points for that redemption. Please reapply your credits.",
        );
      }
    }

    // ── Card hold. Nothing is charged until an admin approves the order.
    let payment: Record<string, unknown>;
    let heldChargeId: string | null = null;
    if (totalAmount > 0) {
      if (!data.cardToken || typeof data.cardToken !== 'string' || data.cardToken.length > 200) {
        throw new functions.https.HttpsError('invalid-argument', 'Card details are required.');
      }
      // Card-testing protection: stolen-card testers try many cards fast.
      // After CARD_DECLINE_LIMIT declines in an hour the account is paused.
      const attemptsKey = isGuest
        ? `guest_${crypto
            .createHash('sha256')
            .update(String(request.rawRequest?.ip ?? 'unknown'))
            .digest('hex')
            .slice(0, 32)}`
        : request.auth.uid;
      const attemptsRef = db.doc(`paymentAttempts/${attemptsKey}`);
      const attempts = (await attemptsRef.get()).data() as
        { windowStart?: number; declines?: number } | undefined;
      const windowOpen =
        attempts?.windowStart && Date.now() - attempts.windowStart < 60 * 60 * 1000;
      if (windowOpen && (attempts?.declines ?? 0) >= CARD_DECLINE_LIMIT) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Too many declined cards. Please wait an hour or contact us.',
        );
      }
      try {
        const charge = await authorizeCharge({
          orderId: data.orderId,
          amountCents: toCents(totalAmount),
          cardToken: data.cardToken,
          clientIp: request.rawRequest?.ip,
        });
        heldChargeId = charge.id;
        payment = {
          provider: 'clover',
          status: 'authorized',
          chargeId: charge.id,
          authorizedAmount: charge.amount ?? toCents(totalAmount),
          cardBrand: charge.source?.brand ?? null,
          last4: charge.source?.last4 ?? null,
          authorizedAt: FS.serverTimestamp(),
        };
      } catch (err) {
        console.error('[placeOrder] card authorization failed for', data.orderId, err);
        if (err instanceof CloverError && err.declined) {
          await attemptsRef
            .set(
              windowOpen ? { declines: FS.increment(1) } : { windowStart: Date.now(), declines: 1 },
              { merge: true },
            )
            .catch((e) => console.warn('[placeOrder] decline counter write failed:', e));
          throw new functions.https.HttpsError(
            'failed-precondition',
            `Your card was declined${err.message ? ` (${err.message})` : ''}. Please try another card.`,
          );
        }
        throw new functions.https.HttpsError(
          'unavailable',
          "We couldn't reach our payment processor. You have not been charged — please try again.",
        );
      }
    } else {
      // Fully covered by credit/promo — nothing to hold.
      payment = { provider: 'none', status: 'not_required' };
    }

    const docPayload: Record<string, unknown> = {
      orderId: data.orderId,
      userId: request.auth.uid,
      // From the user profile — never the client's claim.
      customerId: cleanText(userSnap.data()?.customerId, 40),
      ...(isGuest ? { isGuest: true, customerEmail: guestEmail } : {}),
      // R2 Bug #16 — write resolvedItems with canonical prices.
      items: resolvedItems,
      subtotal,
      creditApplied,
      promoCode,
      promotionId,
      promoDiscount,
      creditPointsRedeemed,
      shippingFee,
      gst,
      totalAmount,
      fulfillmentMethod,
      lang: emailLang(data.lang),
      ...(shippingAddress ? { shippingAddress } : {}),
      // Schema-fidelity fix — mirror ALL five gift fields documented by
      // order.schema.ts (isGift, recipientName, senderName, giftMessage,
      // occasion, customOccasion). Pre-fix only the first three were
      // persisted at the top level. The other three lived ONLY inside
      // items[].bundle.personalization, so any admin query / filter
      // keyed on the top-level mirror (per the schema's stated purpose
      // — "Gift fields mirrored from cart bundle so admin filters work
      // without a data migration") silently saw partial data.
      // Free text is length-capped: it's shown in emails and the admin UI.
      ...(data.isGift === true ? { isGift: true } : {}),
      ...(cleanText(data.recipientName, 100)
        ? { recipientName: cleanText(data.recipientName, 100) }
        : {}),
      ...(cleanText(data.senderName, 100) ? { senderName: cleanText(data.senderName, 100) } : {}),
      ...(cleanText(data.giftMessage, 1000)
        ? { giftMessage: cleanText(data.giftMessage, 1000) }
        : {}),
      ...(cleanText(data.occasion, 60) ? { occasion: cleanText(data.occasion, 60) } : {}),
      ...(cleanText(data.customOccasion, 100)
        ? { customOccasion: cleanText(data.customOccasion, 100) }
        : {}),
      status: 'pending',
      payment,
      createdAt: FS.serverTimestamp(),
      updatedAt: FS.serverTimestamp(),
    };

    try {
      // create() — not set() — so two simultaneous submits of the same
      // order can't both write it. (Both hold calls share Clover's
      // idempotency key, so they hold the same single charge.)
      await orderRef.create(docPayload);
    } catch (err) {
      if ((err as { code?: number }).code === 6 /* ALREADY_EXISTS */) {
        // The concurrent submit won; its order owns this same charge —
        // releasing here would cancel the real order's hold.
        return { ok: true, orderId: data.orderId, alreadyExisted: true };
      }
      console.error('[placeOrder] Admin SDK write failed:', err);
      // Don't leave a hold on the card for an order that doesn't exist.
      if (heldChargeId) {
        await releaseCharge({ orderId: data.orderId, chargeId: heldChargeId }).catch((relErr) =>
          console.error(
            '[placeOrder] RELEASE FAILED — release hold manually in Clover:',
            heldChargeId,
            relErr,
          ),
        );
      }
      throw new functions.https.HttpsError(
        'internal',
        'Failed to save order. You have not been charged — please try again.',
      );
    }

    return { ok: true, orderId: data.orderId, alreadyExisted: false, totalAmount };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Order stock check shared by approveOrder: names of teas in the order
// (direct lines + bundle constituents) that are not available right now.
// Same fail-closed rule as the pending branch of onOrderWrite.
// ─────────────────────────────────────────────────────────────────────────────
async function unavailableTeaNames(items: unknown): Promise<string[]> {
  const ids = new Set<string>();
  for (const it of (Array.isArray(items) ? items : []) as {
    productId?: string;
    bundle?: { teas?: { id?: string }[]; samples?: { id?: string }[] };
  }[]) {
    if (it.productId && !it.productId.startsWith('bundle-')) ids.add(it.productId);
    for (const t of [...(it.bundle?.teas ?? []), ...(it.bundle?.samples ?? [])]) {
      if (t && typeof t.id === 'string' && t.id) ids.add(t.id);
    }
  }
  const snaps = await Promise.all([...ids].map((id) => db.doc(`teas/${id}`).get()));
  return snaps
    .filter((snap) => snap.exists && snap.data()?.available !== true)
    .map((snap) => String(snap.data()?.name ?? snap.id));
}

// ─────────────────────────────────────────────────────────────────────────────
// approveOrder — admin-only. The ONLY path that charges a customer's card.
//
//   1. Order must be 'pending' with a card hold (or nothing to charge).
//   2. Every tea must be in stock right now — all or nothing. If not, the
//      admin gets an error and should reject the order (which releases
//      the hold via onOrderWrite).
//   3. Capture the order total (never more than the hold), then move the
//      order to 'in_progress'. Pickup orders then go ready_for_pickup,
//      delivery orders go shipped, via the normal admin actions.
//
// Firestore rules stop admin clients moving a pending order forward
// directly, so an order can't be marked paid without this capture.
// ─────────────────────────────────────────────────────────────────────────────
export const approveOrder = functions.https.onCall(
  {
    region: 'us-central1',
    enforceAppCheck: true,
    secrets: [CLOVER_PRIVATE_TOKEN],
    // Explicit: Cloud Run lost this function's public invoker binding once,
    // so every Approve click was rejected (401) before reaching the admin
    // check below. Stating it makes each deploy re-apply the binding.
    invoker: 'public',
  },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can approve orders.');
    }
    const { orderId, adminNote } = (request.data ?? {}) as { orderId?: string; adminNote?: string };
    if (!orderId || typeof orderId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(orderId)) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid orderId.');
    }
    const orderRef = db.doc(`orders/${orderId}`);

    // Claim the order so two admins clicking Approve can't both capture.
    // (Clover's idempotency key is the second guard.)
    const order = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists)
        throw new functions.https.HttpsError('not-found', `Order ${orderId} not found.`);
      const o = snap.data()!;
      if (o.status !== 'pending') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Order ${orderId} is ${o.status}, not pending.`,
        );
      }
      // Every order from placeOrder carries a payment record; refuse
      // anything else before the claim below writes into `payment`.
      if (!o.payment || typeof o.payment !== 'object') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'This order has no payment on file. Cancel it and ask the customer to reorder.',
        );
      }
      const claimedAt = o.payment?.approvingAt?.toMillis?.() ?? 0;
      if (claimedAt && Date.now() - claimedAt < 2 * 60 * 1000) {
        throw new functions.https.HttpsError('aborted', 'This order is already being approved.');
      }
      tx.update(orderRef, { 'payment.approvingAt': FS.serverTimestamp() });
      return o;
    });

    const releaseClaim = () =>
      orderRef.update({ 'payment.approvingAt': FS.delete() }).catch(() => {});

    try {
      const unavailable = await unavailableTeaNames(order.items);
      if (unavailable.length > 0) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Out of stock: ${unavailable.join(', ')}. Reject the order to release the customer's card hold.`,
        );
      }

      const payment = (order.payment ?? {}) as {
        status?: string;
        chargeId?: string;
        authorizedAmount?: number;
      };
      const totalAmount = Number(order.totalAmount ?? 0);
      const paymentUpdate: Record<string, unknown> = {};

      if (payment.status === 'authorized' && payment.chargeId) {
        const amountCents = toCents(totalAmount);
        if (amountCents > Number(payment.authorizedAmount ?? 0)) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            `The order total ($${totalAmount.toFixed(2)}) is more than the card hold ($${(Number(payment.authorizedAmount ?? 0) / 100).toFixed(2)}). Lower it, or reject the order.`,
          );
        }
        try {
          const charge = await captureCharge({ orderId, chargeId: payment.chargeId, amountCents });
          paymentUpdate['payment.status'] = 'captured';
          paymentUpdate['payment.capturedAmount'] = charge.amount ?? amountCents;
          paymentUpdate['payment.capturedAt'] = FS.serverTimestamp();
        } catch (err) {
          console.error('[approveOrder] capture failed for', orderId, err);
          throw new functions.https.HttpsError(
            'failed-precondition',
            `The card could not be charged${err instanceof CloverError ? ` (${err.message})` : ''}. The hold may have expired — reject the order and ask the customer to reorder.`,
          );
        }
      } else if (payment.status !== 'not_required') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'This order has no card payment on file. Cancel it and ask the customer to reorder.',
        );
      }

      // Commit only if the order is STILL pending — the customer may have
      // cancelled (or another admin rejected) while we were capturing.
      // In that case refund the capture instead of overwriting their
      // cancellation with a paid status.
      const stillPending = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(orderRef);
        if (fresh.data()?.status !== 'pending') return false;
        tx.update(orderRef, {
          ...paymentUpdate,
          'payment.approvingAt': FS.delete(),
          status: 'in_progress',
          approvedAt: FS.serverTimestamp(),
          paidAt: FS.serverTimestamp(),
          updatedAt: FS.serverTimestamp(),
          ...(typeof adminNote === 'string' && adminNote.trim()
            ? { adminNote: adminNote.trim().slice(0, 1000) }
            : {}),
        });
        return true;
      });
      if (!stillPending) {
        if (paymentUpdate['payment.status'] === 'captured' && payment.chargeId) {
          await releaseCharge({ orderId, chargeId: payment.chargeId }).catch((err) =>
            console.error(
              '[approveOrder] REFUND AFTER RACE FAILED — refund manually in Clover:',
              orderId,
              payment.chargeId,
              err,
            ),
          );
        }
        throw new functions.https.HttpsError(
          'aborted',
          `Order ${orderId} was cancelled while it was being approved. Any charge has been refunded.`,
        );
      }
      return { ok: true, orderId, charged: totalAmount };
    } catch (err) {
      await releaseClaim();
      throw err;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// emailHealthCheck — admin-only: ping Resend with the configured API key,
// report what's configured and what isn't, OPTIONALLY send a test email.
//
// Returns a JSON report so the admin can immediately see:
//   • Is RESEND_API_KEY actually set?
//   • Does Resend respond at all? (Did the secret get rotated?)
//   • If `to` is provided, send a real email and report success/failure.
//
// Use from the browser console while signed in as admin:
//   firebase.functions().httpsCallable('emailHealthCheck')({ to: 'your@email.com' })
//
// Or from AdminSettings (if a button is wired up).
// ─────────────────────────────────────────────────────────────────────────────
export const emailHealthCheck = functions.https.onCall(
  { region: 'us-central1', secrets: ['RESEND_API_KEY'], enforceAppCheck: true },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only.');
    }
    const apiKey = process.env.RESEND_API_KEY;
    const data = request.data as { to?: string } | undefined;

    const report: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      RESEND_API_KEY_set: !!apiKey,
      RESEND_API_KEY_length: apiKey?.length ?? 0,
    };
    if (!apiKey) {
      report.error =
        'RESEND_API_KEY is not set in the function environment. ' +
        'Run: firebase functions:secrets:set RESEND_API_KEY then redeploy.';
      return report;
    }

    // Step 1: ping Resend's domains endpoint to verify the key is valid
    // and what domains are configured. This is a SAFE no-side-effects
    // call that uses the same Authorization header we'd use to send.
    try {
      const r = await fetch('https://api.resend.com/domains', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      report.domains_endpoint_status = r.status;
      if (r.ok) {
        const body = (await r.json()) as { data?: Array<{ name: string; status: string }> };
        report.verified_domains = body.data?.map((d) => ({ name: d.name, status: d.status })) ?? [];
      } else {
        const text = await r.text().catch(() => '');
        report.domains_endpoint_error = text.slice(0, 500);
        return report;
      }
    } catch (err) {
      report.domains_endpoint_network_error = (err as Error).message;
      return report;
    }

    // Step 2: if `to` is supplied, send a test email. This actually
    // hits Resend, so admin will see it in their inbox if the
    // configuration is good end-to-end.
    if (data?.to && typeof data.to === 'string') {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Ele Café <orders@elecafe.ca>',
            to: [data.to],
            subject: 'Ele Café — email system health check',
            html: renderEmail({
              brand: await getEmailBrand(),
              preheader: 'Your Ele Café email setup is working.',
              eyebrow: 'Email health check',
              title: 'Email is working',
              body: [
                p(
                  'This is an automated test from the admin email health-check tool. If you received it, transactional emails are configured correctly.',
                ),
                p(`Sent at ${esc(new Date().toISOString())}`, { small: true }),
              ],
            }),
          }),
        });
        report.test_send_status = r.status;
        report.test_send_to = data.to;
        if (!r.ok) {
          const text = await r.text().catch(() => '');
          report.test_send_error = text.slice(0, 500);
        } else {
          report.test_send_ok = true;
        }
      } catch (err) {
        report.test_send_network_error = (err as Error).message;
      }
    }

    return report;
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. onOrderEmail — transactional emails via Resend for every status change
//
//    Covers: pending (card hold placed) · in_progress (approved + charged) ·
//            ready_for_pickup · shipped · delivered · cancelled · rejected ·
//            expired (hold released / refunded)
//
//    Email lookup: Firestore /users/{uid}.email → Firebase Auth → skip
//
//    Activate: firebase functions:secrets:set RESEND_API_KEY
// ─────────────────────────────────────────────────────────────────────────────
export const onOrderEmail = functions.firestore.onDocumentWritten(
  {
    document: 'orders/{orderId}',
    region: 'us-central1',
    secrets: ['RESEND_API_KEY'], // ← declares secret so it&#39;s injected into process.env
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;

    const prevStatus = before?.status as string | undefined;
    const newStatus = after.status as string;
    if (prevStatus === newStatus) return;

    const userId = after.userId as string;
    if (!userId) return;

    // Resolve email and store settings in parallel
    const guestEmail =
      after.isGuest === true && typeof after.customerEmail === 'string' ? after.customerEmail : '';
    const [customerEmail, brand] = await Promise.all([
      guestEmail || getCustomerEmail(userId),
      getEmailBrand(),
    ]);
    if (!customerEmail) return;

    // Settings → "Send fulfilment emails" switch. Covers the ready-for-
    // pickup / shipped / delivered emails only; order, payment and refund
    // emails are governed by sendOrderEmails (see sendEmail).
    if (['ready_for_pickup', 'shipped', 'delivered'].includes(newStatus)) {
      try {
        if ((await db.doc('settings/global').get()).data()?.sendShippingEmails === false) {
          console.log(
            `[onOrderEmail] ${newStatus} email skipped (sendShippingEmails=false) for`,
            event.params.orderId,
          );
          return;
        }
      } catch (err) {
        console.warn('[onOrderEmail] sendShippingEmails read failed; sending anyway', err);
      }
    }

    // ── Order fields ──────────────────────────────────────────────────────
    const orderId = (after.orderId as string) ?? event.params.orderId;
    const totalAmount = (after.totalAmount as number) ?? 0;
    // R2 Bug #19: previously fell back to `totalAmount`. totalAmount
    // already includes shipping + GST − credit, so the email's
    // "Subtotal" line then had shipping baked in AND the totals block
    // added shipping again on top — a double-count. Fall back to 0
    // (which renders "$0.00") so a missing subtotal is visibly wrong
    // rather than silently misleading.
    const subtotal = (after.subtotal as number) ?? 0;
    // Read the canonical fields written by CheckoutPage (`promoDiscount`,
    // `promoCode`) and fall back to the legacy `discount` / `discountCode`
    // names so historical orders still render their discount line.
    const discount = (after.promoDiscount as number) ?? (after.discount as number) ?? 0;
    const discountCode = (after.promoCode as string) ?? (after.discountCode as string) ?? '';
    const creditApplied = (after.creditApplied as number) ?? 0;
    // R3-5 — actual points deducted (post-clamp), so the cancel/reject/
    // expire email can tell the customer exactly how many points were
    // refunded to their balance. Falls back to the claimed
    // creditPointsRedeemed for legacy orders predating the marker field.
    const creditPointsRefunded =
      typeof after.creditPointsActuallyDeducted === 'number'
        ? (after.creditPointsActuallyDeducted as number)
        : ((after.creditPointsRedeemed as number) ?? 0);
    const shippingFee = (after.shippingFee as number) ?? 0;
    const gst = (after.gst as number) ?? 0;
    const fulfillmentMethod = (after.fulfillmentMethod as string) ?? 'delivery';
    // R2 Bug #20: pickup orders have no shippingAddress and were
    // greeted "Hi there!". Read /users/{uid}.displayName as a fallback
    // before settling for the literal "there".
    let rawName = (after.shippingAddress?.name as string) ?? '';
    if (!rawName) {
      try {
        const userSnap = await db.doc(`users/${userId}`).get();
        if (userSnap.exists) {
          const u = userSnap.data() ?? {};
          rawName = (u.displayName as string) || (u.email as string)?.split('@')[0] || '';
        }
      } catch (err) {
        console.warn('[onOrderEmail] user displayName lookup failed for', userId, err);
      }
    }
    const lang = emailLang(after.lang);
    const T = (en: string, fr: string) => L(lang, en, fr);
    const dateLocale = lang === 'fr' ? 'fr-CA' : 'en-CA';
    if (!rawName) rawName = T('there', '');
    const firstName = rawName.split(' ')[0];
    /** "Hi Sam" / "Bonjour Sam" ("Bonjour" alone when the name is unknown). */
    const hi = T(`Hi ${esc(firstName)}`, `Bonjour${firstName ? ` ${esc(firstName)}` : ''}`);
    const trackingNo = (after.trackingNumber as string) ?? '';
    const carrier = (after.carrier as string) ?? '';
    const adminNote = (after.adminNote as string) ?? '';
    const reason = (after.rejectionReason as string) ?? (after.cancellationReason as string) ?? '';
    const shippingAddr = (after.shippingAddress as Record<string, string>) ?? {};
    const items = (after.items as { productName: string; quantity: number; price: number }[]) ?? [];
    const createdDate = after.createdAt?.toDate
      ? after.createdAt
          .toDate()
          .toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString(dateLocale, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
    // R3 file2 Bug #10: use the actually-deducted point count for the
    // receipt annotation so it reflects what was really taken from
    // balance (post-clamp). Fall back to creditPointsRedeemed
    // (the claimed amount) for legacy orders predating the marker.
    const creditPointsForReceipt =
      typeof after.creditPointsActuallyDeducted === 'number'
        ? (after.creditPointsActuallyDeducted as number)
        : ((after.creditPointsRedeemed as number) ?? 0);

    // Idempotency guard: one audit doc per order status. The first
    // execution creates/updates the doc to `pending`, then marks it
    // `sent` only after Resend accepts the message. Retries of the same
    // Firestore event skip once a `sent` record exists.
    // Card payment wording. At the moment the status flips, settleOrderPayment
    // (onOrderWrite) may not have run yet, so phrase from the pre-release
    // state: authorized → hold released, captured → refunded.
    const payment = (after.payment ?? {}) as {
      status?: string;
      last4?: string;
      cardBrand?: string;
    };
    const cardLabel = payment.last4
      ? T(
          `your ${payment.cardBrand ? `${payment.cardBrand} ` : ''}card ending ${payment.last4}`,
          `votre carte ${payment.cardBrand ? `${payment.cardBrand} ` : ''}se terminant par ${payment.last4}`,
        )
      : T('your card', 'votre carte');
    const wasCharged = payment.status === 'captured' || payment.status === 'refunded';
    const hadHold = payment.status === 'authorized' || payment.status === 'released';
    const paymentOutcomeLine = wasCharged
      ? T(
          `We've refunded $${totalAmount.toFixed(2)} to ${cardLabel}. Refunds can take 5–10 business days to appear on your statement.`,
          `Nous avons remboursé ${totalAmount.toFixed(2)} $ sur ${cardLabel}. Le remboursement peut prendre de 5 à 10 jours ouvrables avant d'apparaître sur votre relevé.`,
        )
      : hadHold
        ? T(
            `The hold on ${cardLabel} has been released — you were not charged.`,
            `La retenue sur ${cardLabel} a été libérée — aucuns frais ne vous ont été facturés.`,
          )
        : '';

    const orderEmailLogRef = db.collection('emailLog').doc(`order_${orderId}_${newStatus}`);
    const sendOrderEmailOnce = async (opts: Parameters<typeof sendEmail>[0]): Promise<boolean> => {
      let alreadySent = false;
      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(orderEmailLogRef);
          const data = snap.data() as { state?: string } | undefined;
          if (data?.state === 'sent') {
            alreadySent = true;
            return;
          }
          const now = FS.serverTimestamp();
          tx.set(
            orderEmailLogRef,
            {
              kind: 'order',
              orderId,
              status: newStatus,
              eventId: event.id,
              to: opts.to,
              state: 'pending',
              sentAt: null,
              createdAt: snap.exists ? (snap.data()?.createdAt ?? now) : now,
              updatedAt: now,
            },
            { merge: true },
          );
        });
      } catch (err) {
        console.error('[onOrderEmail] reservation failed for', orderId, newStatus, err);
        return false;
      }

      if (alreadySent) return false;

      const sent = await sendEmail(opts);
      try {
        await orderEmailLogRef.set(
          {
            state: sent ? 'sent' : 'failed',
            sentAt: sent ? FS.serverTimestamp() : null,
            updatedAt: FS.serverTimestamp(),
          },
          { merge: true },
        );
      } catch (err) {
        console.error('[onOrderEmail] log update failed for', orderId, newStatus, err);
      }
      return sent;
    };

    // ── Shared Ele Café email layout (lib/emailLayout.ts) ─────────────────
    const mail = (o: { preheader: string; eyebrow: string; title: string; body: string[] }) =>
      renderEmail({
        brand,
        ...o,
        lang,
        footnote: T(
          'Questions about your order? Just reply to this email.',
          'Des questions sur votre commande? Répondez simplement à ce courriel.',
        ),
      });
    const ordersUrl = `${brand.website}/orders`;
    const shopUrl = `${brand.website}/products`;
    const totals = totalsTable([
      [T('Subtotal', 'Sous-total'), `$${subtotal.toFixed(2)}`],
      ...(discount > 0
        ? [
            [
              `${T('Discount', 'Rabais')}${discountCode ? ` (${discountCode})` : ''}`,
              `-$${discount.toFixed(2)}`,
              'credit',
            ] as [string, string, 'credit'],
          ]
        : []),
      // Points count next to the dollar value so the customer can
      // reconcile their balance against the receipt.
      ...(creditApplied > 0
        ? [
            [
              creditPointsForReceipt > 0
                ? `${T('Credit applied', 'Crédit appliqué')} (${creditPointsForReceipt.toLocaleString(dateLocale)} pts)`
                : T('Credit applied', 'Crédit appliqué'),
              `-$${creditApplied.toFixed(2)}`,
              'credit',
            ] as [string, string, 'credit'],
          ]
        : []),
      shippingFee > 0
        ? [T('Shipping', 'Livraison'), `$${shippingFee.toFixed(2)}`]
        : [T('Shipping', 'Livraison'), T('Free', 'Gratuite'), 'credit'],
      ...(gst > 0 ? [[T('GST (5%)', 'TPS (5 %)'), `$${gst.toFixed(2)}`] as [string, string]] : []),
      [T('Order total', 'Total de la commande'), `$${totalAmount.toFixed(2)} CAD`, 'total'],
    ]);
    const shipBlock = shippingAddr.address ? addressBox(shippingAddr, lang) : '';
    const pointsRefundLine =
      creditPointsRefunded > 0
        ? p(
            T(
              `Your ${strong(`${creditPointsRefunded.toLocaleString()} points`)} have been returned to your balance.`,
              `Vos ${strong(`${creditPointsRefunded.toLocaleString('fr-CA')} points`)} ont été remis dans votre solde.`,
            ),
          )
        : '';

    // ── 4a. Order received (pending, new doc) ─────────────────────────────
    if (!prevStatus && newStatus === 'pending') {
      let expiryHours = 72;
      try {
        const v = (await db.doc('settings/global').get()).data()?.orderExpiryHours;
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) expiryHours = Math.min(v, 120);
      } catch {
        /* default */
      }
      await sendAdminAlert(`New order ${orderId} — $${totalAmount.toFixed(2)} to approve`, [
        `${rawName} placed order ${orderId} (${items.length} item${items.length === 1 ? '' : 's'}, ${fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery'}).`,
        totalAmount > 0
          ? `$${totalAmount.toFixed(2)} is on hold on the customer's card. Approve & charge (or reject) within ${expiryHours} hours — after that the order expires and the hold is released.`
          : 'The order is fully covered by credit — approve it to start preparing.',
      ]);
      await sendOrderEmailOnce({
        to: customerEmail,
        uid: userId,
        category: 'orderUpdates',
        subject: T(
          `Order received — ${orderId} | ${brand.name}`,
          `Commande reçue — ${orderId} | ${brand.name}`,
        ),
        html: mail({
          preheader: T(
            `We've received order ${orderId} and are checking every tea is in stock.`,
            `Nous avons reçu la commande ${orderId} et vérifions que chaque thé est en stock.`,
          ),
          eyebrow: T('Order received', 'Commande reçue'),
          title: T(`Thank you, ${firstName}!`, `Merci${firstName ? `, ${firstName}` : ''}!`),
          body: [
            p(
              T(
                `Your order ${code(orderId)} has been received. We&#39;re checking that every tea is in stock — usually within a few hours.`,
                `Votre commande ${code(orderId)} a bien été reçue. Nous vérifions que chaque thé est en stock — généralement en quelques heures.`,
              ),
            ),
            totalAmount > 0
              ? p(
                  T(
                    `We&#39;ve placed a temporary hold of ${strong(`$${totalAmount.toFixed(2)}`)} on ${esc(cardLabel)}. ${strong('You won&#39;t be charged until we confirm your order')} — if we can&#39;t fill it, the hold is released.`,
                    `Nous avons placé une retenue temporaire de ${strong(`${totalAmount.toFixed(2)} $`)} sur ${esc(cardLabel)}. ${strong('Vous ne serez débité qu&#39;une fois votre commande confirmée')} — si nous ne pouvons pas la remplir, la retenue est libérée.`,
                  ),
                )
              : '',
            infoBox(T('Order summary', 'Résumé de la commande'), [
              [T('Order', 'Commande'), code(orderId)],
              ['Date', esc(createdDate)],
              [T('Items', 'Articles'), String(items.length)],
              ['Total', `$${totalAmount.toFixed(2)} CAD`],
            ]),
            itemsTable(items, undefined, lang),
            shipBlock,
            button(T('View order status', "Voir l'état de la commande"), ordersUrl),
          ],
        }),
      });
      return;
    }

    // ── 4c. Confirmed & charged ───────────────────────────────────────────
    if (newStatus === 'in_progress') {
      await sendOrderEmailOnce({
        to: customerEmail,
        uid: userId,
        category: 'orderUpdates',
        subject: T(
          `Order confirmed — ${orderId} | ${brand.name}`,
          `Commande confirmée — ${orderId} | ${brand.name}`,
        ),
        html: mail({
          preheader: T(
            `Every tea in order ${orderId} is in stock — we're preparing it now.`,
            `Tous les thés de la commande ${orderId} sont en stock — nous la préparons.`,
          ),
          eyebrow: T('Order confirmed', 'Commande confirmée'),
          title: T('Your order is confirmed', 'Votre commande est confirmée'),
          body: [
            p(
              T(
                `${hi}, every tea in order ${code(orderId)} is in stock${totalAmount > 0 ? ` and we&#39;ve charged ${strong(`$${totalAmount.toFixed(2)}`)} to ${esc(cardLabel)}` : ''}. We&#39;re preparing it now and will let you know ${fulfillmentMethod === 'pickup' ? 'when it&#39;s ready to pick up' : 'as soon as it ships'}.`,
                `${hi}, tous les thés de la commande ${code(orderId)} sont en stock${totalAmount > 0 ? ` et nous avons débité ${strong(`${totalAmount.toFixed(2)} $`)} sur ${esc(cardLabel)}` : ''}. Nous la préparons et vous aviserons ${fulfillmentMethod === 'pickup' ? 'dès qu&#39;elle sera prête à être ramassée' : 'dès son expédition'}.`,
              ),
            ),
            adminNote
              ? p(`${strong(T('Note from us:', 'Un mot de notre part :'))} ${esc(adminNote)}`)
              : '',
            itemsTable(items, T('Order summary', 'Résumé de la commande'), lang),
            items.length ? totals : '',
            button(T('Track your order', 'Suivre votre commande'), ordersUrl),
          ],
        }),
      });
      return;
    }

    // ── 4c-pickup. Ready for pickup ───────────────────────────────────────
    if (newStatus === 'ready_for_pickup') {
      const tel = phoneTel(brand.phone);
      await sendOrderEmailOnce({
        to: customerEmail,
        uid: userId,
        category: 'orderUpdates',
        subject: T(
          `Ready for pickup — ${orderId} | ${brand.name}`,
          `Prête à ramasser — ${orderId} | ${brand.name}`,
        ),
        html: mail({
          preheader: T(
            `Order ${orderId} is ready at ${brand.name}.`,
            `La commande ${orderId} est prête chez ${brand.name}.`,
          ),
          eyebrow: T('Ready for pickup', 'Prête à ramasser'),
          title: T('Your order is ready', 'Votre commande est prête'),
          body: [
            p(
              T(
                `${hi}, your order ${code(orderId)} is ready to pick up at our café. Please bring your order number when you arrive.`,
                `${hi}, votre commande ${code(orderId)} est prête à être ramassée à notre café. Veuillez apporter votre numéro de commande.`,
              ),
            ),
            infoBox(T('Pickup location', 'Lieu de ramassage'), [
              [T('Store', 'Boutique'), esc(brand.name)],
              ...(brand.address
                ? [
                    [
                      T('Address', 'Adresse'),
                      `<a href="${esc(brand.mapsUrl)}" style="color:#0f1c26;text-decoration:none;">${esc(brand.address)}</a>`,
                    ] as [string, string],
                  ]
                : []),
              ...(tel
                ? [
                    [
                      T('Phone', 'Téléphone'),
                      `<a href="tel:${esc(tel)}" style="color:#0f1c26;text-decoration:none;">${esc(brand.phone)}</a>`,
                    ] as [string, string],
                  ]
                : []),
            ]),
            itemsTable(items, T('Items', 'Articles'), lang),
            items.length ? totals : '',
            button(T('View order', 'Voir la commande'), ordersUrl),
          ],
        }),
      });
      return;
    }

    // ── 4d. Shipped ───────────────────────────────────────────────────────
    if (newStatus === 'shipped') {
      await sendOrderEmailOnce({
        to: customerEmail,
        uid: userId,
        category: 'orderUpdates',
        subject: T(
          `Your tea is on its way — ${orderId} | ${brand.name}`,
          `Votre thé est en route — ${orderId} | ${brand.name}`,
        ),
        html: mail({
          preheader: T(
            `Order ${orderId} has shipped${trackingNo ? ' — tracking inside' : ''}.`,
            `La commande ${orderId} a été expédiée${trackingNo ? " — suivi à l'intérieur" : ''}.`,
          ),
          eyebrow: T('Shipped', 'Expédiée'),
          title: T('Your tea is on its way', 'Votre thé est en route'),
          body: [
            p(
              T(
                `${hi}, order ${code(orderId)} has shipped.${trackingNo ? ' Use the tracking details below to follow your parcel.' : ''}`,
                `${hi}, la commande ${code(orderId)} a été expédiée.${trackingNo ? ' Utilisez les renseignements de suivi ci-dessous pour suivre votre colis.' : ''}`,
              ),
            ),
            trackingNo
              ? infoBox(T('Shipping', 'Expédition'), [
                  [T('Tracking number', 'Numéro de suivi'), code(trackingNo)],
                  ...(carrier
                    ? [[T('Carrier', 'Transporteur'), esc(carrier)] as [string, string]]
                    : []),
                ])
              : '',
            itemsTable(items, undefined, lang),
            shipBlock,
            button(T('Track your order', 'Suivre votre commande'), ordersUrl),
          ],
        }),
      });
      return;
    }

    // ── 4e. Delivered / picked up ─────────────────────────────────────────
    if (newStatus === 'delivered') {
      const isPickup = fulfillmentMethod === 'pickup';
      // Only mention points when some were actually earned (earn audit row).
      let ptsEarnedLine = '';
      try {
        const earnAudit = await db.collection('creditTransactions').doc(`earn_${orderId}`).get();
        const ptsEarned = earnAudit.exists ? ((earnAudit.data()?.points as number) ?? 0) : 0;
        if (ptsEarned > 0)
          ptsEarnedLine = p(
            T(
              `You earned ${strong(`${ptsEarned.toLocaleString()} loyalty points`)} on this order — check your balance in your account.`,
              `Vous avez gagné ${strong(`${ptsEarned.toLocaleString('fr-CA')} points de fidélité`)} avec cette commande — consultez votre solde dans votre compte.`,
            ),
          );
      } catch (auditReadErr) {
        console.warn('[email delivered] earn audit read failed for', orderId, auditReadErr);
      }
      // "Rate your teas": one link per tea in the order, straight to its
      // review form. Items that aren't catalog teas (gift boxes) are skipped.
      let rateBlock = '';
      try {
        const ids = [
          ...new Set(
            ((after.items as { productId?: string }[]) ?? [])
              .map((i) => i.productId)
              .filter((x): x is string => typeof x === 'string' && !!x),
          ),
        ].slice(0, 6);
        const snaps = ids.length
          ? await db.getAll(...ids.map((id) => db.collection('teas').doc(id)))
          : [];
        const links = snaps
          .filter((d) => d.exists && d.get('slug') && d.get('category'))
          .map((d) => {
            const name = (lang === 'fr' && d.get('nameFr')) || d.get('name') || d.get('slug');
            const url = `${brand.website}/tea-profile/${encodeURIComponent(d.get('category'))}/${encodeURIComponent(d.get('slug'))}#reviews`;
            return `<a href="${esc(url)}" style="color:#b8924a;font-weight:600;text-decoration:none;">★ ${esc(T(`Rate ${name}`, `Évaluer ${name}`))}</a>`;
          });
        if (links.length) {
          rateBlock = note(
            T('Rate your teas', 'Évaluez vos thés'),
            `${T('A quick review helps other tea lovers find the right blend.', 'Un petit avis aide d&#39;autres amateurs de thé à trouver le bon mélange.')}<br/>${links.join('<br/>')}`,
          );
        }
      } catch (err) {
        console.warn('[email delivered] review links failed for', orderId, err);
      }
      await sendOrderEmailOnce({
        to: customerEmail,
        uid: userId,
        category: 'orderUpdates',
        subject: isPickup
          ? T(
              `Picked up — order ${orderId} | ${brand.name}`,
              `Ramassée — commande ${orderId} | ${brand.name}`,
            )
          : T(
              `Delivered — order ${orderId} | ${brand.name}`,
              `Livrée — commande ${orderId} | ${brand.name}`,
            ),
        html: mail({
          preheader: isPickup
            ? T(
                'Thanks for picking up your order — enjoy every sip.',
                "Merci d'avoir ramassé votre commande — savourez chaque gorgée.",
              )
            : T(
                'Your order has been delivered — enjoy every sip.',
                'Votre commande a été livrée — savourez chaque gorgée.',
              ),
          eyebrow: isPickup ? T('Picked up', 'Ramassée') : T('Delivered', 'Livrée'),
          title: T('Enjoy every sip', 'Savourez chaque gorgée'),
          body: [
            p(
              T(
                `${hi}! ${isPickup ? 'Thanks for stopping by — your order is in your hands.' : 'Your order has been delivered.'} We hope you love every cup.`,
                `${hi}! ${isPickup ? 'Merci de votre visite — votre commande est entre vos mains.' : 'Votre commande a été livrée.'} Nous espérons que vous adorerez chaque tasse.`,
              ),
            ),
            infoBox(isPickup ? T('Pickup note', 'Ramassage') : T('Delivery note', 'Livraison'), [
              [T('Order', 'Commande'), code(orderId)],
              [
                isPickup ? T('Picked up', 'Ramassée le') : T('Delivered', 'Livrée le'),
                esc(
                  new Date().toLocaleDateString(dateLocale, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }),
                ),
              ],
              ...(isPickup || !rawName
                ? []
                : [[T('Delivered to', 'Livrée à'), esc(rawName)] as [string, string]]),
            ]),
            itemsTable(
              items,
              isPickup
                ? T('Items collected', 'Articles ramassés')
                : T('Items delivered', 'Articles livrés'),
              lang,
            ),
            items.length ? totals : '',
            ptsEarnedLine,
            rateBlock ||
              p(
                T(
                  'If you have a moment, a quick review helps other tea lovers find the right blend.',
                  'Si vous avez un moment, un petit avis aide d&#39;autres amateurs de thé à trouver le bon mélange.',
                ),
                { small: true },
              ),
            button(T('Shop more teas', "Découvrir d'autres thés"), shopUrl),
          ],
        }),
      });
      return;
    }

    // ── 4f. Cancelled ─────────────────────────────────────────────────────
    if (newStatus === 'cancelled') {
      await sendOrderEmailOnce({
        to: customerEmail,
        uid: userId,
        category: 'orderUpdates',
        subject: T(
          `Order cancelled — ${orderId} | ${brand.name}`,
          `Commande annulée — ${orderId} | ${brand.name}`,
        ),
        html: mail({
          preheader: T(
            `Order ${orderId} has been cancelled.`,
            `La commande ${orderId} a été annulée.`,
          ),
          eyebrow: T('Order cancelled', 'Commande annulée'),
          title: T(`Order ${orderId} cancelled`, `Commande ${orderId} annulée`),
          body: [
            reason
              ? p(`${strong(T('Reason:', 'Raison :'))} ${esc(reason)}`)
              : p(T('Your order has been cancelled.', 'Votre commande a été annulée.')),
            paymentOutcomeLine ? p(esc(paymentOutcomeLine)) : '',
            pointsRefundLine,
            p(
              T(
                'If you believe this was a mistake or have questions, reply to this email and we&#39;ll sort it out right away.',
                'Si vous croyez qu&#39;il s&#39;agit d&#39;une erreur ou avez des questions, répondez à ce courriel et nous réglerons la situation rapidement.',
              ),
              { small: true },
            ),
            button(T('Continue shopping', 'Continuer vos achats'), shopUrl),
          ],
        }),
      });
      return;
    }

    // ── 4g. Rejected ──────────────────────────────────────────────────────
    if (newStatus === 'rejected') {
      await sendOrderEmailOnce({
        to: customerEmail,
        uid: userId,
        category: 'orderUpdates',
        subject: T(
          `Order update — ${orderId} | ${brand.name}`,
          `Mise à jour de la commande — ${orderId} | ${brand.name}`,
        ),
        html: mail({
          preheader: T(
            `We couldn't process order ${orderId}.`,
            `Nous n'avons pas pu traiter la commande ${orderId}.`,
          ),
          eyebrow: T('Order update', 'Mise à jour de la commande'),
          title: T("We couldn't process your order", "Nous n'avons pas pu traiter votre commande"),
          body: [
            reason
              ? p(`${strong(T('Reason:', 'Raison :'))} ${esc(reason)}`)
              : p(
                  T(
                    `We were unable to process order ${code(orderId)} at this time.`,
                    `Nous n&#39;avons pas pu traiter la commande ${code(orderId)} pour le moment.`,
                  ),
                ),
            paymentOutcomeLine ? p(esc(paymentOutcomeLine)) : '',
            pointsRefundLine,
            p(
              T(
                'We&#39;re sorry for the inconvenience. Reply to this email and we&#39;ll do our best to help.',
                'Nous sommes désolés pour cet inconvénient. Répondez à ce courriel et nous ferons de notre mieux pour vous aider.',
              ),
              { small: true },
            ),
            button(T('Browse our teas', 'Parcourir nos thés'), shopUrl),
          ],
        }),
      });
      return;
    }

    // ── 4h. Expired ───────────────────────────────────────────────────────
    if (newStatus === 'expired') {
      await sendOrderEmailOnce({
        to: customerEmail,
        uid: userId,
        category: 'orderUpdates',
        subject: T(
          `Order expired — ${orderId} | ${brand.name}`,
          `Commande expirée — ${orderId} | ${brand.name}`,
        ),
        html: mail({
          preheader: T(
            `Order ${orderId} expired — you were not charged.`,
            `La commande ${orderId} a expiré — aucuns frais ne vous ont été facturés.`,
          ),
          eyebrow: T('Order expired', 'Commande expirée'),
          title: T(`Order ${orderId} has expired`, `La commande ${orderId} a expiré`),
          body: [
            p(
              T(
                'We weren&#39;t able to confirm your order in time, so it has been cancelled.',
                'Nous n&#39;avons pas pu confirmer votre commande à temps; elle a donc été annulée.',
              ),
            ),
            paymentOutcomeLine ? p(esc(paymentOutcomeLine)) : '',
            pointsRefundLine,
            p(
              T(
                'If you&#39;d still like these teas, you&#39;re welcome to place a new order.',
                'Si vous souhaitez toujours ces thés, n&#39;hésitez pas à passer une nouvelle commande.',
              ),
              { small: true },
            ),
            button(T('Shop again', 'Magasiner de nouveau'), shopUrl),
          ],
        }),
      });
      return;
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. onNewUser — Firebase Auth trigger
//
//    Runs server-side via the Admin SDK, so it bypasses Firestore rules.
//    This is the ONLY place welcome credits are bootstrapped — the client
//    AuthContext used to do this directly, but the /credits create rule
//    requires balance == 0 (preventing self-grants), so the client write
//    failed silently and new users never received their welcome points.
//    Moving the bootstrap server-side fixes that and tightens the rules
//    (clients can no longer create creditTransactions at all).
// ─────────────────────────────────────────────────────────────────────────────
// Default welcome bonus when /settings/global doesn't have a custom
// value. Kept in sync with src/schemas/credit.schema.ts and the admin
// settings UI default. Admin can override via /admin/settings → Credit
// System → "Welcome bonus (pts)".
const DEFAULT_WELCOME_BONUS_POINTS = 500;

export const onNewUser = functionsV1.auth.user().onCreate(async (user) => {
  // Per-employee inventory sessions (uid inv-…) are staff identities, not
  // customers: no signup alert, no credits.
  if (isInventorySessionUid(user.uid)) return;
  // Guest-checkout sessions are anonymous: no email, no account.
  if (!user.email && user.providerData.length === 0) return;
  if (isInventoryEmail(user.email)) {
    console.log('[onNewUser] Skipping welcome credits for inventory account');
    return;
  }

  // Read the admin-configured welcome bonus from settings. If the
  // doc/field doesn't exist, fall back to the default — so brand-new
  // deploys with no settings doc still grant the bonus.
  let welcomeBonus = DEFAULT_WELCOME_BONUS_POINTS;
  try {
    const settingsSnap = await db.doc('settings/global').get();
    if (settingsSnap.exists) {
      const v = settingsSnap.data()?.welcomeBonusPoints;
      // Only override the default when the value is a finite non-negative number.
      // This guards against admin typos producing NaN or negative values.
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        welcomeBonus = Math.floor(v);
      }
    }
  } catch (err) {
    console.warn('[onNewUser] Settings read failed, using default bonus:', err);
  }

  // 1. Notify admin of the new signup
  await notifyOnce(
    keyForSignup(userIdOf(user.uid)),
    'admin',
    'admin_new_signup',
    'New customer: ' + (user.displayName || user.email || 'Unknown'),
    (user.email || '') + ' joined',
    {
      customerEmail: user.email || '',
      customerName: user.displayName || '',
      joinDate: new Date().toISOString(),
    },
  );

  // 2. Bootstrap /credits/{uid}.
  //
  // Welcome bonus gate: the bonus is granted ONLY when the user's email
  // is verified. This covers:
  //   • Google sign-in users → email is auto-verified by OAuth at
  //     creation time; we grant immediately.
  //   • Email/password signups → email starts unverified; we create
  //     the credit doc with balance=0, and a separate trigger
  //     (onUserVerifiedGrantBonus, see below) grants the bonus when
  //     the user later confirms their email.
  //
  // This prevents the abuse pattern where attackers create thousands
  // of fake email/password accounts to mine welcome bonuses without
  // ever confirming a real inbox. The credits doc still gets bootstrapped
  // for anyone — just without points until verification.
  const creditRef = db.doc(`credits/${user.uid}`);
  const isAlreadyVerified = user.emailVerified === true;
  // Only Google (and other OAuth providers Firebase trusts) are auto-
  // verified at creation. Pass-through identity providers may flip this
  // on too — we treat any of them the same way.
  const grantBonusNow = isAlreadyVerified && welcomeBonus > 0;

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(creditRef);
      if (snap.exists) return; // already bootstrapped

      const now = FS.serverTimestamp();
      tx.set(creditRef, {
        userId: user.uid,
        balance: grantBonusNow ? welcomeBonus : 0,
        lifetimeEarned: grantBonusNow ? welcomeBonus : 0,
        lifetimeRedeemed: 0,
        lifetimeSpend: 0,
        orderCount: 0,
        // Mark welcomeBonusGiven only when we actually granted at signup.
        // The verify-trigger function below uses this flag to know
        // whether it still needs to grant.
        welcomeBonusGiven: grantBonusNow,
        // welcomeBonusGrantedAt is set ONLY on actual grant — used by
        // the annual reset's grace-period check to skip recently-issued
        // bonuses (a Dec signup shouldn't lose their gift on Jan 1).
        ...(grantBonusNow ? { welcomeBonusGrantedAt: now } : {}),
        // R3 file2 Bug #16: lastEarnedAt removed (dead field).
        createdAt: now,
        updatedAt: now,
      });
      // Audit log entry — only for the immediate-grant path.
      if (grantBonusNow) {
        const txRef = db.collection('creditTransactions').doc();
        tx.set(txRef, {
          userId: user.uid,
          type: 'welcome',
          points: welcomeBonus,
          balanceAfter: welcomeBonus,
          createdAt: now,
        });
      }
    });
    // Welcome modal/notification — same gate as the points themselves.
    // Email/password users who haven't verified yet won't see the
    // celebration modal until they verify — which is correct, because
    // they don't have any points to celebrate yet.
    if (grantBonusNow) {
      await notifyOnce(
        keyForWelcomeBonus(userIdOf(user.uid)),
        user.uid,
        'customer_welcome_bonus',
        `Welcome — ${welcomeBonus.toLocaleString()} points are yours`,
        `Thanks for joining! Your bonus is ready to use on your first order.`,
        { pointsEarned: welcomeBonus },
        'orderUpdates',
      );
    }
  } catch (err) {
    console.error('[onNewUser] Failed to bootstrap credits for', user.uid, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b. onUserVerifiedGrantBonus — Firestore trigger
//
// Fires when /users/{uid} is updated. If the doc transitions from
// emailVerified=false (or missing) to emailVerified=true, AND the
// welcome bonus hasn't been granted yet, grant it now.
//
// This implements the "no points until you verify" guard. The client
// (EmailVerificationModal + AuthContext) writes emailVerified=true to
// the user doc once the User object's emailVerified flips to true
// (after they click the verification link). That write triggers this
// function.
//
// Idempotent: checks /credits/{uid}.welcomeBonusGiven flag. Will only
// grant once per user, even if their /users/{uid} doc is touched
// multiple times after verification.
// ─────────────────────────────────────────────────────────────────────────────
export const onUserVerifiedGrantBonus = functionsV1.firestore
  .document('users/{uid}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const uid = context.params.uid as string;

    // Trigger condition: emailVerified flipped from not-true to true.
    const wasVerified = before?.emailVerified === true;
    const nowVerified = after?.emailVerified === true;
    if (wasVerified || !nowVerified) return;

    if (isInventoryEmail(after?.email)) {
      console.log('[onUserVerifiedGrantBonus] Skipping welcome credits for inventory account');
      return;
    }

    // Read admin-configured bonus (same source as onNewUser).
    let welcomeBonus = DEFAULT_WELCOME_BONUS_POINTS;
    try {
      const settingsSnap = await db.doc('settings/global').get();
      if (settingsSnap.exists) {
        const v = settingsSnap.data()?.welcomeBonusPoints;
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
          welcomeBonus = Math.floor(v);
        }
      }
    } catch (err) {
      console.warn('[onUserVerifiedGrantBonus] Settings read failed:', err);
    }
    if (welcomeBonus <= 0) return; // bonus disabled

    const creditRef = db.doc(`credits/${uid}`);
    try {
      const granted = await db.runTransaction(async (tx) => {
        const snap = await tx.get(creditRef);
        // Existing doc check: it should exist (onNewUser bootstrapped it).
        // If it doesn't, bootstrap with the bonus directly.
        if (!snap.exists) {
          const now = FS.serverTimestamp();
          tx.set(creditRef, {
            userId: uid,
            balance: welcomeBonus,
            lifetimeEarned: welcomeBonus,
            lifetimeRedeemed: 0,
            lifetimeSpend: 0,
            orderCount: 0,
            welcomeBonusGiven: true,
            // Used by onAnnualCreditReset's grace-period check so a
            // recently-granted bonus isn't wiped on Jan 1.
            welcomeBonusGrantedAt: now,
            // R3 file2 Bug #16: lastEarnedAt removed (dead field).
            createdAt: now,
            updatedAt: now,
          });
          const txRef = db.collection('creditTransactions').doc();
          tx.set(txRef, {
            userId: uid,
            type: 'welcome',
            points: welcomeBonus,
            balanceAfter: welcomeBonus,
            createdAt: now,
          });
          return true;
        }
        // Existing doc — only grant if bonus hasn't been given yet.
        const data = snap.data() ?? {};
        if (data.welcomeBonusGiven === true) return false;

        const currentBalance = (data.balance as number | undefined) ?? 0;
        const lifetimeEarned = (data.lifetimeEarned as number | undefined) ?? 0;
        const newBalance = currentBalance + welcomeBonus;
        const now = FS.serverTimestamp();

        tx.update(creditRef, {
          balance: newBalance,
          lifetimeEarned: lifetimeEarned + welcomeBonus,
          welcomeBonusGiven: true,
          welcomeBonusGrantedAt: now,
          // R3 file2 Bug #16: lastEarnedAt removed (dead field).
          updatedAt: now,
        });
        const txRef = db.collection('creditTransactions').doc();
        tx.set(txRef, {
          userId: uid,
          type: 'welcome',
          points: welcomeBonus,
          balanceAfter: newBalance,
          createdAt: now,
        });
        return true;
      });

      if (granted) {
        await notifyOnce(
          keyForWelcomeBonus(userIdOf(uid)),
          uid,
          'customer_welcome_bonus',
          `Welcome — ${welcomeBonus.toLocaleString()} points are yours`,
          `Thanks for verifying your email! Your bonus is ready to use on your first order.`,
          { pointsEarned: welcomeBonus },
          'orderUpdates',
        );
      }
    } catch (err) {
      console.error('[onUserVerifiedGrantBonus] Grant failed for', uid, err);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 6. onAnnualCreditReset — midnight PT on January 1st
// ─────────────────────────────────────────────────────────────────────────────
export const onAnnualCreditReset = functions.scheduler.onSchedule(
  { schedule: '0 8 1 1 *', timeZone: 'America/Vancouver', region: 'us-central1' },
  async () => {
    // Paginate the credits collection so this scheduler holds up at any
    // store size. Calling .get() on the whole collection at once would
    // load the entire user base into memory and risk timing out / OOM
    // crashing the function. We page through ordered by doc ID, which
    // is a stable order Firestore can serve from the index.
    const PAGE_SIZE = 500;
    const LIMIT = 400; // batch ops cap (see flush())
    let batch = db.batch(),
      ops = 0,
      count = 0,
      skippedGrace = 0;
    const pushes: PendingPush[] = [];
    const flush = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    };

    // Bug 10 — welcome-bonus grace period.
    //
    // A user who signs up Dec 28 and gets a welcome bonus shouldn't have
    // it wiped 4 days later by the Jan 1 reset. We skip accounts whose
    // welcomeBonusGrantedAt is within the grace window. Existing users
    // (pre-fix) without this field fall through to normal reset — same
    // behaviour as before, no regression.
    const GRACE_DAYS = 90;
    const graceCutoffMs = Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000;

    // Year tag for deterministic doc IDs (Bug 8). Using PT calendar year
    // since the schedule runs Jan 1 PT — keeps IDs human-readable in the
    // audit log and stable across retries within the same execution.
    const resetYear = new Date().getFullYear();

    let lastDocId: string | null = null;
    let pages = 0;
    const MAX_PAGES = 200; // safety stop — 100k accounts × full reset

    while (pages < MAX_PAGES) {
      let q = db
        .collection('credits')
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(PAGE_SIZE);
      if (lastDocId) q = q.startAfter(lastDocId);
      const snap = await q.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const data = doc.data();
        const points = (data.balance as number) ?? 0;
        if (points === 0) continue;

        // Welcome-bonus grace — skip the reset if welcomeBonusGrantedAt
        // is recent. Field is a Firestore Timestamp; toMillis() if so.
        const wbGrantedAt = data.welcomeBonusGrantedAt;
        const wbGrantedMs =
          wbGrantedAt && typeof wbGrantedAt.toMillis === 'function' ? wbGrantedAt.toMillis() : 0;
        if (wbGrantedMs > graceCutoffMs) {
          skippedGrace++;
          continue;
        }

        batch.update(doc.ref, { balance: 0, updatedAt: FS.serverTimestamp() });
        ops++;

        // Bug 8 — deterministic IDs `expired_<uid>_<year>` so a scheduler
        // retry (transient error mid-page) doesn't create duplicate
        // audit rows or duplicate "Points reset" notifications. The
        // balance update is naturally idempotent (set 0 → 0 again is
        // a no-op), but without deterministic IDs the audit + notif
        // writes were producing duplicates.
        const txRef = db.collection('creditTransactions').doc(`expired_${doc.id}_${resetYear}`);
        batch.set(txRef, {
          userId: data.userId,
          type: 'expired',
          points: -points,
          balanceAfter: 0,
          createdAt: FS.serverTimestamp(),
        });
        ops++;

        const notifRef = db.collection('notifications').doc(`reset_${doc.id}_${resetYear}`);
        const title = 'Points reset — Happy New Year';
        const body = `Your ${points.toLocaleString()} pts were reset on January 1st. Start earning again!`;
        pushes.push({
          uid: data.userId,
          title,
          body,
          notifId: notifRef.id,
          type: 'customer_credit_reset',
        });
        batch.set(notifRef, {
          recipientId: data.userId,
          type: 'customer_credit_reset',
          title,
          body,
          data: { pointsExpired: points, newBalance: 0 },
          isRead: false,
          createdAt: FS.serverTimestamp(),
        });
        ops++;
        count++;

        if (ops >= LIMIT) await flush();
      }
      await flush();

      lastDocId = snap.docs[snap.docs.length - 1].id;
      if (snap.size < PAGE_SIZE) break;
      pages++;
    }

    await sendPendingPushes(pushes);
    console.log(
      `Annual credit reset: ${count} accounts zeroed, ${skippedGrace} preserved by welcome-bonus grace, across ${pages + 1} page(s).`,
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 6b. onCreditExpiryWarning — December 15 PT warning before Jan 1 reset
// ─────────────────────────────────────────────────────────────────────────────
//
// R3-7 — the `customer_credit_expiry_warning` notification type was
// declared in the schema, wired into the message builder and emoji
// table, but no cloud function ever fired it. Customers were never
// warned before their points reset on January 1st — the "expiry
// warning" feature was a UI-only promise.
//
// This function fires every December 15th at noon PT, pages through
// /credits, and writes a `customer_credit_expiry_warning` notification
// for every user with balance > 0. Same idempotency-by-deterministic-ID
// pattern as onAnnualCreditReset so a scheduler retry doesn't produce
// duplicate notifications: doc ID is `expiry_warning_${uid}_${year}`
// (year of the upcoming reset, so Dec 15 2025 fires for the Jan 1 2026
// reset).
//
// Welcome-bonus grace is NOT applied here — even users in grace get
// the warning (it doesn't cost them anything to know about the
// upcoming reset, and grace itself can change).
export const onCreditExpiryWarning = functions.scheduler.onSchedule(
  { schedule: '0 12 15 12 *', timeZone: 'America/Vancouver', region: 'us-central1' },
  async () => {
    const PAGE_SIZE = 500;
    const LIMIT = 400;
    let batch = db.batch(),
      ops = 0,
      count = 0;
    const pushes: PendingPush[] = [];
    const flush = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    };

    // Year of the upcoming reset. Dec 15 of year N → reset is Jan 1
    // of year N+1. The notification doc ID uses this so a re-fire
    // within the same December is a no-op overwrite.
    const upcomingResetYear = new Date().getFullYear() + 1;
    const expiresOnLabel = `January 1, ${upcomingResetYear}`;

    let lastDocId: string | null = null;
    let pages = 0;
    const MAX_PAGES = 200;

    while (pages < MAX_PAGES) {
      let q = db
        .collection('credits')
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(PAGE_SIZE);
      if (lastDocId) q = q.startAfter(lastDocId);
      const snap = await q.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const data = doc.data();
        const points = (data.balance as number) ?? 0;
        if (points <= 0) continue;

        const notifRef = db
          .collection('notifications')
          .doc(`expiry_warning_${doc.id}_${upcomingResetYear}`);
        const title = `${points.toLocaleString()} points expiring soon`;
        const body = `Use them before ${expiresOnLabel} or they'll reset.`;
        pushes.push({
          uid: data.userId,
          title,
          body,
          notifId: notifRef.id,
          type: 'customer_credit_expiry_warning',
        });
        batch.set(notifRef, {
          recipientId: data.userId,
          type: 'customer_credit_expiry_warning',
          title,
          body,
          data: { pointsExpiring: points, expiresOn: expiresOnLabel },
          isRead: false,
          createdAt: FS.serverTimestamp(),
        });
        ops++;
        count++;
        if (ops >= LIMIT) await flush();
      }
      await flush();

      lastDocId = snap.docs[snap.docs.length - 1].id;
      if (snap.size < PAGE_SIZE) break;
      pages++;
    }

    await sendPendingPushes(pushes);
    console.log(
      `Credit expiry warning: ${count} customers notified about ${expiresOnLabel} reset across ${pages + 1} page(s).`,
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. onCreditTransactionCreate — notify customer when admin adjusts credit
// ─────────────────────────────────────────────────────────────────────────────
//
// adminAdjustCredit (called from AdminCustomers) writes both /credits/{uid}
// and /creditTransactions/{id} in a single transaction. This trigger
// observes the creditTransactions write and fires a customer-facing
// notification — was previously silent, so customers saw their balance
// change with no explanation.
//
// Notification types produced here:
//   - admin_add / admin_deduct → customer_credit_admin_added
//   - refund                   → customer_credit_admin_added (reuses the
//                                same bell shape; copy adapts via title)
//   - earn_reversed            → customer_credit_admin_added (same)
//
// R3 file2 Bug #6: refund and earn_reversed audit rows are written by
// restoreStockAndCredit when admin moves a delivered order to cancelled
// (or the pending-edit reconciliation refunds unused credit). The
// customer's balance can swing by thousands of points with no
// explanation. Now we fire notifications for those types too, with copy
// that points to the order so the customer can correlate.
//
// Earn/redeem/welcome/expired remain unhandled here because they have
// their own notification paths (customer_credit_earned at delivery,
// customer_welcome_bonus on signup, customer_credit_reset at year-end).
// 'redeem' at checkout is intentionally silent — the discount is
// already visible on the order.
export const onCreditTransactionCreate = functionsV1.firestore
  .document('creditTransactions/{txId}')
  .onCreate(async (snap) => {
    const data = snap.data() ?? {};
    const type = data.type as string | undefined;
    // R3 file2 Bug #6: include refund + earn_reversed.
    const SURFACED_TYPES = ['admin_add', 'admin_deduct', 'refund', 'earn_reversed'] as const;
    if (!type || !(SURFACED_TYPES as readonly string[]).includes(type)) return;

    const userId = data.userId as string | undefined;
    const pointsRaw = Number(data.points ?? 0);
    const balanceRaw = Number(data.balanceAfter ?? 0);
    // R3-11 — defensive NaN guard. A hand-written or migration-broken
    // tx row with points=undefined / balanceAfter=undefined would yield
    // NaN here; `NaN === 0` is false so the function continued and
    // rendered "+NaN bonus points" in the notification title. Bail
    // explicitly on non-finite numeric fields rather than fabricate.
    if (!Number.isFinite(pointsRaw) || !Number.isFinite(balanceRaw)) {
      console.warn('[onCreditTransactionCreate] non-finite points/balance for tx', snap.id);
      return;
    }
    const points = pointsRaw;
    const balanceAfter = balanceRaw;
    const adminNote = (data.adminNote as string) ?? '';
    const orderId = (data.orderId as string) ?? '';
    if (!userId || points === 0) return;

    const isAddition = points > 0;
    const absPoints = Math.abs(points);
    // R3 file2 Bug #6: type-specific copy. Refund and earn_reversed
    // have their own narratives so the customer can correlate the
    // balance change with the order.
    let title: string;
    let body: string;
    if (type === 'refund') {
      title = `+${absPoints.toLocaleString()} points refunded`;
      body = orderId
        ? `Order ${orderId} was cancelled — your points are back in your balance (${balanceAfter.toLocaleString()} pts).`
        : `Points refunded — your balance is now ${balanceAfter.toLocaleString()} pts.`;
    } else if (type === 'earn_reversed') {
      title = `${absPoints.toLocaleString()} earned points reversed`;
      body = orderId
        ? `Order ${orderId} was cancelled after delivery — points earned on it have been reversed. Balance: ${balanceAfter.toLocaleString()} pts.`
        : `Earned points have been reversed — your balance is now ${balanceAfter.toLocaleString()} pts.`;
    } else {
      // admin_add / admin_deduct — original copy.
      title = isAddition
        ? `+${absPoints.toLocaleString()} bonus points`
        : `-${absPoints.toLocaleString()} points adjusted`;
      body = adminNote
        ? `"${adminNote}" — Balance: ${balanceAfter.toLocaleString()} pts`
        : `Your balance is now ${balanceAfter.toLocaleString()} pts`;
    }

    try {
      // Phase 11.5 — preferences gate. Credit adjustments (admin_add,
      // admin_deduct, refund, earn_reversed) are transactional — they
      // map to 'orderUpdates'. Fail-open: if the prefs read errors,
      // userAcceptsCategory returns the default (true) so the
      // notification is still delivered.
      const { userAcceptsCategory } = await import('./lib/notificationPrefs');
      const accepts = await userAcceptsCategory(userId, 'orderUpdates');
      if (!accepts) {
        console.log(
          `[onCreditTransactionCreate] suppressed — uid=${userId} opted out of orderUpdates`,
        );
        return;
      }

      // Use a deterministic doc ID derived from the source
      // creditTransactions ID so Cloud Functions retries (Firestore
      // at-least-once delivery) don't create duplicate notifications.
      // If the function fires twice for the same source doc, the
      // second .set() lands on the same notification doc and is a
      // no-op overwrite. The doc ID is human-readable for debugging:
      // an admin auditing /notifications can match `credit_<txId>`
      // back to the originating /creditTransactions/<txId> row.
      // notifyOnce writes the bell doc AND sends the Web Push (this
      // path used to write the bell directly and skipped push).
      await notifyOnce(
        keyForCreditAdminAdjust(txIdOf(snap.id)),
        userId,
        'customer_credit_admin_added',
        title,
        body,
        {
          pointsAdded: points, // signed — bell shows +/- correctly
          newBalance: balanceAfter,
          adminNote,
          ...(orderId ? { orderId } : {}),
          sourceType: type, // 'admin_add'/'admin_deduct'/'refund'/'earn_reversed'
        },
      );
    } catch (err) {
      console.error('[onCreditTransactionCreate] Notify failed for', userId, err);
      // Don't throw — the transaction itself already succeeded; the
      // notification is best-effort. Failing the function would retry
      // and could create duplicate notifications.
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 7b. onCreditDocumentChange — flag balance changes that lack an audit row
// ─────────────────────────────────────────────────────────────────────────────
//
// R3-9 — admin can write `/credits/{uid}` directly via the Firebase
// Console (the rule allows admin writes so the AdminCustomers panel
// can call adminAdjustCredit from the browser). Direct console edits
// bypass adminAdjustCredit and therefore don't create a corresponding
// /creditTransactions audit row — balance and lifetime fields drift
// from the audit log silently.
//
// We can't tighten the rule without breaking the AdminCustomers UI
// (it would have to be moved to a callable Cloud Function). Instead,
// this trigger watches every /credits write, computes the balance
// delta, and checks whether a matching audit row landed within the
// last 60 seconds. If not, it logs a high-visibility warning so
// monitoring can surface untracked changes — and writes a synthetic
// 'admin_add' / 'admin_deduct' audit row capturing the diff so the
// audit chain stays intact.
//
// False-positive guard: skip when the balance is unchanged (e.g.,
// admin updated some other field on the doc) and when the doc is
// being created (no `before`).
export const onCreditDocumentChange = functionsV1.firestore
  .document('credits/{uid}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const oldBalance = (before?.balance as number) ?? 0;
    const newBalance = (after?.balance as number) ?? 0;
    if (oldBalance === newBalance) return; // no balance change → nothing to audit
    const delta = newBalance - oldBalance;

    const uid = context.params.uid as string;
    const writeTimeMs = Date.now();
    const lookbackMs = 60_000; // 60s window — generous to allow Cloud Function clock skew

    // Look for a creditTransactions row written for this user with a
    // matching delta within the lookback window. We accept any row
    // where points === delta (covers earn/redeem/refund/admin_add/
    // admin_deduct/welcome/expired/earn_reversed) — the type doesn't
    // matter, only that some legitimate path recorded the change.
    try {
      const cutoff = admin.firestore.Timestamp.fromMillis(writeTimeMs - lookbackMs);
      const recent = await db
        .collection('creditTransactions')
        .where('userId', '==', uid)
        .where('createdAt', '>=', cutoff)
        .get();
      const matched = recent.docs.some((d) => {
        const p = (d.data().points as number) ?? 0;
        return p === delta;
      });
      if (matched) return; // legitimate path — already audited

      // No matching audit row → orphan write. Log loudly so monitoring
      // can flag it, and write a synthetic audit row so the audit chain
      // stays usable for reconciliation. We can't know who wrote it
      // from the trigger context, so adminNote captures that fact.
      console.error(
        '[onCreditDocumentChange] Orphan balance change detected for',
        uid,
        '— delta:',
        delta,
        '— no matching /creditTransactions row in the last',
        lookbackMs,
        'ms.',
        'Likely a direct console edit. Writing synthetic audit row.',
      );
      const syntheticRef = db
        .collection('creditTransactions')
        .doc(`synthetic_${uid}_${writeTimeMs}`);
      await syntheticRef.set({
        userId: uid,
        type: delta > 0 ? 'admin_add' : 'admin_deduct',
        points: delta,
        balanceAfter: newBalance,
        adminNote: 'Synthetic: untracked balance change (likely direct Firestore edit)',
        addedByAdmin: 'system',
        createdAt: FS.serverTimestamp(),
      });
    } catch (err) {
      console.error('[onCreditDocumentChange] audit reconciliation failed for', uid, err);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 8. onOrderExpiry — every hour, expire pending orders nobody approved in time
//
// A pending order holds money on the customer's card. Card holds lapse
// after ~7 days (Visa), so an order not approved within
// settings.orderExpiryHours (default 72h, capped at 120h) is expired;
// onOrderWrite then releases the hold and notifies the customer.
// ─────────────────────────────────────────────────────────────────────────────
export const onOrderExpiry = functions.scheduler.onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'America/Vancouver', region: 'us-central1' },
  async () => {
    let expiryHours = 72;
    try {
      const settingsRef = db.doc('settings/global');
      const settings = (await settingsRef.get()).data() ?? {};
      const v = settings.orderExpiryHours;
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) expiryHours = Math.min(v, 120);
    } catch (err) {
      console.warn('onOrderExpiry: settings read failed, using 72h', err);
    }
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - expiryHours * 60 * 60 * 1000);
    const snap = await db
      .collection('orders')
      .where('status', '==', 'pending')
      .where('createdAt', '<=', cutoff)
      .get();

    if (snap.empty) {
      console.log('onOrderExpiry: no expired orders');
      return;
    }

    const LIMIT = 400;
    let batch = db.batch(),
      ops = 0;
    const flush = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    };

    for (const doc of snap.docs) {
      batch.update(doc.ref, { status: 'expired', updatedAt: FS.serverTimestamp() });
      ops++;
      if (ops >= LIMIT) await flush();
    }
    await flush();
    console.log(`onOrderExpiry: expired ${snap.size} order(s) older than ${expiryHours}h`);
  },
);

/**
 * Public HTTP function that returns the live sitemap XML.
 *
 * Why dynamic instead of build-time:
 *   The product catalog is admin-managed via /admin/products, which writes
 *   directly to Firestore. A build-time sitemap (parsed from
 *   src/data/mockProducts.ts) only reflects the seed data and would drift
 *   the moment an admin adds, removes, or hides a tea. This function reads
 *   /teas live so the sitemap is always in sync with what's actually in
 *   the store.
 *
 * Wired into Hosting via firebase.json:
 *     { "source": "/sitemap.xml", "function": "getSitemap" }
 *
 * Caching:
 *   1-hour browser + edge cache (Cache-Control: max-age=3600,
 *   s-maxage=3600). Crawlers typically hit /sitemap.xml at most once per
 *   day, so this is well under the function free tier even with caching
 *   bypassed. The cache mostly protects against accidental hot loops
 *   (e.g. a crawler retry storm).
 *
 * Failure mode:
 *   If Firestore read fails, we still return a usable sitemap with just
 *   the static URLs — better than 500-ing the crawler. The static set
 *   alone is enough to keep the homepage and main shop pages indexed.
 */
const SITE_BASE = 'https://elecafe.ca';

const STATIC_SITEMAP_URLS: Array<{ loc: string; priority: string; changefreq: string }> = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  { loc: '/products', priority: '0.9', changefreq: 'daily' },
  { loc: '/cafe', priority: '0.9', changefreq: 'weekly' },
  { loc: '/rewards', priority: '0.7', changefreq: 'monthly' },
  { loc: '/franchise', priority: '0.5', changefreq: 'monthly' },
  { loc: '/gifts', priority: '0.7', changefreq: 'weekly' },
  { loc: '/about', priority: '0.5', changefreq: 'monthly' },
  { loc: '/contact', priority: '0.5', changefreq: 'monthly' },
  { loc: '/shipping-policy', priority: '0.3', changefreq: 'yearly' },
  { loc: '/refund-policy', priority: '0.3', changefreq: 'yearly' },
  { loc: '/privacy-policy', priority: '0.3', changefreq: 'yearly' },
  { loc: '/terms', priority: '0.3', changefreq: 'yearly' },
];

// Every category with landing-page copy (lib/seoCatalog.ts). The sitemap
// lists only those that currently have an active tea, so a new category
// (e.g. powder) appears automatically once its first product goes live.
const CATEGORY_IDS = Object.keys(CATEGORY_SEO);

type SitemapTea = CollectionTea & {
  slug: string;
  category: string;
  lastmod: string;
  image: string;
};

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSitemapXml(
  teas: SitemapTea[],
  pairings: Array<{ slug: string; lastmod: string; image: string }>,
  today: string,
  giftsOn = true,
): string {
  // Static + category URLs — single lastmod (the build/now date), no image.
  const simpleEntry = (loc: string, priority: string, changefreq: string) => `  <url>
    <loc>${xmlEscape(SITE_BASE + loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;

  // Per-tea entries: per-tea lastmod, plus an <image:image> entry when the
  // tea has an image. Crawlers eligible for Google Image search use this.
  //
  // Phase 11 URL fix — canonicalize the slug at emit time. Even if the
  // /teas document has a slug field that drifted from canonical form
  // (apostrophes, mixed case, spaces — which can happen from older
  // imports or hand edits), the sitemap always emits the URL Google
  // should canonicalize on. Mirrors src/lib/slugify.ts toSlug, kept
  // local to functions/ to avoid client-bundle leakage.
  const canonicalSlug = (s: string): string => {
    if (!s) return '';
    return s
      .toLowerCase()
      .replace(/['\u2018\u2019\u201B\u2032"\u201C\u201D]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };
  const teaEntry = (t: { slug: string; category: string; lastmod: string; image: string }) => {
    const url = `/tea-profile/${encodeURIComponent(t.category)}/${encodeURIComponent(canonicalSlug(t.slug))}`;
    const imageBlock = t.image
      ? `
    <image:image>
      <image:loc>${xmlEscape(t.image)}</image:loc>
    </image:image>`
      : '';
    return `  <url>
    <loc>${xmlEscape(SITE_BASE + url)}</loc>
    <lastmod>${t.lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>${imageBlock}
  </url>`;
  };

  const lines: string[] = [];
  // /gifts only while Admin → Settings → Gift Builder is on.
  for (const u of STATIC_SITEMAP_URLS) {
    if (u.loc === '/gifts' && !giftsOn) continue;
    lines.push(simpleEntry(u.loc, u.priority, u.changefreq));
  }
  // Only categories / collections with at least one live tea — an empty
  // landing page is thin content and wastes crawl budget.
  const liveCats = CATEGORY_IDS.filter((id) => teas.some((t) => t.category === id));
  for (const id of liveCats) lines.push(simpleEntry(`/products/${id}`, '0.8', 'weekly'));
  // Programmatic-SEO collection landing pages (lib/seoCatalog.ts).
  const liveCollections = SEO_COLLECTIONS.filter((c) => teas.some(c.match));
  for (const c of liveCollections)
    lines.push(simpleEntry(`/collections/${c.slug}`, '0.7', 'weekly'));
  // /pairings index page — Phase 12 fix. The combo gallery's primary
  // social-share value is the /pairings/{slug} URLs, but the previous
  // sitemap omitted them entirely so Google could only discover them
  // via inbound social links (which are usually nofollow/noindex).
  // The index page anchors the collection so individual pairings get
  // crawled from a single canonical entry point.
  lines.push(simpleEntry('/pairings', '0.7', 'weekly'));
  for (const t of teas) lines.push(teaEntry(t));

  // Per-pairing entries. Image block when available (Google Image
  // search eligibility). Lower priority than teas because pairings are
  // a cross-sell aid, not the primary product.
  const pairingEntry = (p: { slug: string; lastmod: string; image: string }) => {
    const url = `/pairings/${encodeURIComponent(p.slug)}`;
    const imageBlock = p.image
      ? `
    <image:image>
      <image:loc>${xmlEscape(p.image)}</image:loc>
    </image:image>`
      : '';
    return `  <url>
    <loc>${xmlEscape(SITE_BASE + url)}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>${imageBlock}
  </url>`;
  };
  for (const p of pairings) lines.push(pairingEntry(p));

  // French twins: every server-rendered page also exists under /fr. Both
  // entries carry the same hreflang set so Google pairs them.
  const FR_PAGE_RE =
    /^\/(?:$|products|cafe|rewards|franchise|about|contact|pairings|collections|tea-profile)/;
  const withFrench = (entry: string): string => {
    const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '';
    const path = loc.slice(SITE_BASE.length) || '/';
    if (!FR_PAGE_RE.test(path)) return entry;
    const frLoc = `${SITE_BASE}/fr${path === '/' ? '' : path}`;
    const links = [
      `<xhtml:link rel="alternate" hreflang="en" href="${loc}"/>`,
      `<xhtml:link rel="alternate" hreflang="fr" href="${frLoc}"/>`,
      `<xhtml:link rel="alternate" hreflang="x-default" href="${loc}"/>`,
    ].join('\n    ');
    const en = entry.replace('</loc>', `</loc>\n    ${links}`);
    const fr = en.replace(`<loc>${loc}</loc>`, `<loc>${frLoc}</loc>`);
    return `${en}\n${fr}`;
  };
  const allLines = lines.map(withFrench);
  const frCount = allLines.length
    ? allLines.join('\n').split('<url>').length - 1 - lines.length
    : 0;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Generated live by the getSitemap Cloud Function from /teas + /comboGalleryItems in Firestore.
  ${lines.length + frCount} URLs (${STATIC_SITEMAP_URLS.length} static + ${liveCats.length} categories + ${liveCollections.length} collections + ${teas.length} teas + ${pairings.length} pairings, plus ${frCount} French /fr pages).
  Per-row <lastmod> uses the Firestore updatedAt (or createdAt) timestamp.
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${allLines.join('\n')}
</urlset>
`;
}

/** Convert a Firestore Timestamp / Date / serialized form to an ISO date. */
function toLastmodDate(raw: unknown, fallback: string): string {
  if (!raw) return fallback;
  // admin.firestore.Timestamp has toDate(); firebase-admin returns those.
  // We don't import the type to keep the import surface small — duck-type it.
  if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    try {
      return (raw as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
    } catch (err) {
      console.warn('[toLastmodDate] Failed to convert timestamp:', err);
      return fallback;
    }
  }
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return fallback;
}

export const getSitemap = functions.https.onRequest(
  {
    region: 'us-central1',
    cors: false,
    // Sitemap is small + reads Firestore once per cache-miss. Cold
    // starts add ~700 ms to the first request after idle, but
    // crawler hits to /sitemap.xml are sparse (Google ~daily, Bing
    // ~weekly) and Google doesn't penalize sitemap latency. So we
    // run with minInstances=0 to save the ~$5.50/month idle cost.
    // Bump to 1 if Search Console ever flags slow sitemap responses.
    minInstances: 0,
    maxInstances: 10,
  },
  async (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);

    let teas: SitemapTea[] = [];
    try {
      // Only active teas with both a slug and a category — anything else
      // would generate a broken URL.
      const snap = await db.collection('teas').where('isActive', '!=', false).get();
      for (const doc of snap.docs) {
        const data = doc.data();
        const slug = typeof data.slug === 'string' ? data.slug : '';
        const category = typeof data.category === 'string' ? data.category : '';
        if (!slug || !category) continue;
        if (!CATEGORY_IDS.includes(category)) continue;
        const lastmod = toLastmodDate(data.updatedAt, toLastmodDate(data.createdAt, today));
        const image = typeof data.image === 'string' && data.image.trim() ? data.image : '';
        teas.push({
          slug,
          category,
          lastmod,
          image,
          name: typeof data.name === 'string' ? data.name : '',
          caffeine: typeof data.caffeine === 'string' ? data.caffeine : undefined,
          isOrganic: data.isOrganic === true,
          ratingCount: typeof data.ratingCount === 'number' ? data.ratingCount : 0,
          origin: typeof data.origin === 'string' ? data.origin : undefined,
          servingSuggestions: Array.isArray(data.servingSuggestions)
            ? data.servingSuggestions
            : undefined,
        });
      }
    } catch (err) {
      // Fall back to static-only sitemap rather than 500 the crawler.
      console.error('getSitemap: Firestore read failed, returning static-only sitemap', err);
      teas = [];
    }

    // Phase 12 — combo pairings. Read all enabled items with a non-empty
    // slug. The `enabled !== false` JS filter (not a Firestore `!=`) is
    // intentional — legacy docs without the field count as enabled.
    // See `fetchComboBySlug` for the same pattern in `renderSeo`.
    let pairings: Array<{ slug: string; lastmod: string; image: string }> = [];
    try {
      const snap = await db.collection('comboGalleryItems').get();
      for (const doc of snap.docs) {
        const data = doc.data();
        const slug = typeof data.slug === 'string' ? data.slug.trim() : '';
        if (!slug) continue;
        if (data.enabled === false) continue;
        const lastmod = toLastmodDate(data.updatedAt, toLastmodDate(data.createdAt, today));
        const image =
          typeof data.imageUrl === 'string' && data.imageUrl.trim() ? data.imageUrl : '';
        pairings.push({ slug, lastmod, image });
      }
    } catch (err) {
      // Same defense as teas — log and emit a sitemap without pairings
      // rather than failing the whole response.
      console.error('getSitemap: pairings read failed, omitting from sitemap', err);
      pairings = [];
    }

    let giftsOn = false;
    try {
      giftsOn = (await db.doc('settings/global').get()).get('giftBuilderEnabled') === true;
    } catch {
      /* leave /gifts out when unsure */
    }
    const xml = buildSitemapXml(teas, pairings, today, giftsOn);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.status(200).send(xml);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// renderSeo — dynamic per-route <head> rendering for tea-profile + category
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Returns HTML with route-specific meta/JSON-LD baked into the <head>,
 * reading product data from Firestore live so admin-added teas (via
 * /admin/products) get correct prerendered SEO immediately, without a
 * code deploy.
 *
 * Wired into Hosting via firebase.json — applies to:
 *   • /tea-profile/{category}/{slug}    → full Product JSON-LD + OG product
 *   • /products/{category}              → category-specific title/desc/OG
 *
 * Cold-start strategy:
 *   The HTML response needs <script src="/assets/main-{hash}.js"> tags
 *   that match the current Vite build. Hash values change every deploy.
 *   So on cold start, the function fetches https://elecafe.ca/index.html
 *   once to grab the current SPA shell (with right hashes), then caches
 *   it in memory for 5 min. After a deploy the function instance might
 *   serve a slightly stale template until cache expiry — at most ~5 min
 *   of staleness, harmless because the old asset hashes are still on
 *   the CDN until the next purge.
 *
 * Caching strategy:
 *   Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400
 *   - Browser caches 5 min
 *   - Firebase Hosting CDN caches 1 hour
 *   - After 1 hour, serves stale while revalidating in background up to 1 day
 *   Most requests are served by the CDN edge in <100ms; the function
 *   itself fires roughly once per route per hour.
 *
 * Failure mode:
 *   If the Firestore read fails or the tea isn't found, we return the
 *   plain template (no patched head). The user lands on a working page
 *   and React's runtime <SeoHead> still emits the right meta after
 *   mount. Better than 500-ing a crawler.
 */

const SEO_SITE_BASE = 'https://elecafe.ca';
// Default share image — the admin's "OG Image URL" setting when set
// (refreshed every 5 min by refreshSeoDefaultOg), else the hosted PNG.
// PNG not SVG: Facebook / iMessage / Slack don't render SVG previews.
const SEO_FALLBACK_OG = `${SEO_SITE_BASE}/og-default.png`;
let SEO_DEFAULT_OG = SEO_FALLBACK_OG;
// Store facts (address, phone, hours, shipping…) from Admin → Settings —
// every page this function renders uses them, so a settings edit reaches
// Google within ~5 min (+ CDN cache) with no deploy.
let SEO_STORE: StoreContent = readStoreContent({});
let seoSettingsFetchedAt = 0;
async function refreshSeoSettings(): Promise<void> {
  if (Date.now() - seoSettingsFetchedAt < 5 * 60 * 1000) return;
  seoSettingsFetchedAt = Date.now();
  try {
    const d = (await db.doc('settings/global').get()).data() ?? {};
    const v = d.ogImageUrl;
    SEO_DEFAULT_OG =
      typeof v === 'string' && /^https:\/\/\S+$/.test(v.trim()) ? v.trim() : SEO_FALLBACK_OG;
    SEO_STORE = readStoreContent(d);
  } catch (err) {
    console.warn('[renderSeo] settings read failed; using last values', err);
  }
}
const SEO_BUSINESS_ID = `${SEO_SITE_BASE}/#business`;
// 0 = fetch the shell on every render (renders only happen on CDN misses).
// Its hashed asset URLs change on every hosting deploy; a cached shell
// would point at deleted bundles and the CDN would then cache that
// broken page. The last good copy is still kept as a fetch-failure fallback.
const SEO_TEMPLATE_TTL = 0;

const SEO_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_SEO).map(([id, c]) => [id, c.label]),
);

/**
 * Per-category brewing parameters used by FAQPage + HowTo JSON-LD.
 * Values reflect standard tea-shop brewing recommendations. ISO 8601
 * durations on totalTimeISO are required by HowTo schema.
 */
const SEO_BREWING_PARAMS: Record<
  string,
  {
    temp: string;
    time: string;
    gramsPerCup: string;
    totalTimeISO: string;
    caffeineNote: string;
  }
> = {
  black: {
    temp: '95°C (203°F)',
    time: '3–5 minutes',
    gramsPerCup: '2.5g (one teaspoon)',
    totalTimeISO: 'PT5M',
    caffeineNote: 'Yes — black teas typically contain 40–70 mg of caffeine per cup.',
  },
  green: {
    temp: '75–80°C (167–176°F)',
    time: '2–3 minutes',
    gramsPerCup: '2g (one teaspoon)',
    totalTimeISO: 'PT3M',
    caffeineNote: 'Yes — green teas contain about 20–45 mg of caffeine per cup.',
  },
  white: {
    temp: '75–80°C (167–176°F)',
    time: '4–5 minutes',
    gramsPerCup: '2g (one teaspoon)',
    totalTimeISO: 'PT5M',
    caffeineNote:
      'Yes — white teas contain about 15–30 mg of caffeine per cup, the lowest among true teas.',
  },
  oolong: {
    temp: '85–95°C (185–203°F)',
    time: '3–5 minutes',
    gramsPerCup: '2.5g (one teaspoon)',
    totalTimeISO: 'PT5M',
    caffeineNote: 'Yes — oolong teas typically contain 30–50 mg of caffeine per cup.',
  },
  rooibos: {
    temp: '95–100°C (203–212°F)',
    time: '5–7 minutes',
    gramsPerCup: '2.5g (one teaspoon)',
    totalTimeISO: 'PT7M',
    caffeineNote: 'No — rooibos is naturally caffeine-free.',
  },
  herbal: {
    temp: '95–100°C (203–212°F)',
    time: '5–7 minutes',
    gramsPerCup: '2.5g (one teaspoon)',
    totalTimeISO: 'PT7M',
    caffeineNote:
      'Most herbal blends are caffeine-free; check the ingredients list for tea or yerba maté if caffeine matters to you.',
  },
  flower: {
    temp: '85–95°C (185–203°F)',
    time: '3–5 minutes',
    gramsPerCup: '2g (one teaspoon)',
    totalTimeISO: 'PT5M',
    caffeineNote:
      'Most pure flower infusions are caffeine-free; blends with tea leaves contain caffeine.',
  },
  fruit: {
    temp: '95–100°C (203–212°F)',
    time: '5–7 minutes',
    gramsPerCup: '2.5g (one teaspoon)',
    totalTimeISO: 'PT7M',
    caffeineNote:
      'Most fruit infusions are caffeine-free; check the ingredients list for any tea content.',
  },
  powder: {
    temp: '70–80°C (158–176°F)',
    time: 'whisk 20–30 seconds',
    gramsPerCup: '2g (one teaspoon) per 70–100 ml',
    totalTimeISO: 'PT1M',
    caffeineNote:
      'Matcha contains about 60–70 mg of caffeine per serving; roasted hojicha is much lower, around 10–20 mg.',
  },
};

/** French brewing text (temperatures are the same in both languages). */
const SEO_BREWING_FR: Record<string, { time: string; gramsPerCup: string; caffeineNote: string }> =
  {
    black: {
      time: '3 à 5 minutes',
      gramsPerCup: '2,5 g (une cuillère à thé)',
      caffeineNote:
        'Oui — les thés noirs contiennent généralement 40 à 70 mg de caféine par tasse.',
    },
    green: {
      time: '2 à 3 minutes',
      gramsPerCup: '2 g (une cuillère à thé)',
      caffeineNote: 'Oui — les thés verts contiennent environ 20 à 45 mg de caféine par tasse.',
    },
    white: {
      time: '4 à 5 minutes',
      gramsPerCup: '2 g (une cuillère à thé)',
      caffeineNote:
        'Oui — les thés blancs contiennent environ 15 à 30 mg de caféine par tasse, le moins de tous les vrais thés.',
    },
    oolong: {
      time: '3 à 5 minutes',
      gramsPerCup: '2,5 g (une cuillère à thé)',
      caffeineNote:
        'Oui — les thés oolong contiennent généralement 30 à 50 mg de caféine par tasse.',
    },
    rooibos: {
      time: '5 à 7 minutes',
      gramsPerCup: '2,5 g (une cuillère à thé)',
      caffeineNote: 'Non — le rooibos est naturellement sans caféine.',
    },
    herbal: {
      time: '5 à 7 minutes',
      gramsPerCup: '2,5 g (une cuillère à thé)',
      caffeineNote:
        'La plupart des tisanes sont sans caféine; vérifiez la liste d’ingrédients pour du thé ou du maté si la caféine vous importe.',
    },
    flower: {
      time: '3 à 5 minutes',
      gramsPerCup: '2 g (une cuillère à thé)',
      caffeineNote:
        'La plupart des infusions de fleurs pures sont sans caféine; les mélanges avec des feuilles de thé en contiennent.',
    },
    fruit: {
      time: '5 à 7 minutes',
      gramsPerCup: '2,5 g (une cuillère à thé)',
      caffeineNote:
        'La plupart des infusions de fruits sont sans caféine; vérifiez la liste d’ingrédients pour la présence de thé.',
    },
    powder: {
      time: 'fouetter 20 à 30 secondes',
      gramsPerCup: '2 g (une cuillère à thé) pour 70 à 100 ml',
      caffeineNote:
        'Le matcha contient environ 60 à 70 mg de caféine par portion; le hojicha torréfié en contient beaucoup moins, environ 10 à 20 mg.',
    },
  };

/** Category brewing defaults in the page language. */
function seoBrewing(category: string) {
  const en = SEO_BREWING_PARAMS[category] ?? SEO_BREWING_PARAMS.black;
  const fr = SEO_BREWING_FR[category] ?? SEO_BREWING_FR.black;
  return seoFr() ? { ...en, ...fr } : en;
}

let seoTemplateCache: { html: string; expires: number } | null = null;

/**
 * Embedded fallback template — used when Hosting is unreachable on cold
 * start. This shell has no script tags (so users get a "please reload"
 * page) but still carries the brand `<head>` metadata that crawlers
 * actually care about. Better to ship a usable SEO response with a
 * degraded user experience than to 503 the crawler entirely.
 *
 * The user-facing meta-refresh + reload button covers the small window
 * where Hosting is down but the function is up — vanishingly rare in
 * practice but worth handling.
 */
const SEO_FALLBACK_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="refresh" content="3" />
<title>Ele Café | Premium Loose Leaf Tea — Vancouver</title>
<meta name="description" content="Premium loose-leaf tea, ceremonial matcha and fresh coffee at Ele Café, Vancouver." />
<link rel="canonical" href="https://elecafe.ca" />
<meta property="og:type" content="website" />
<meta property="og:title" content="Ele Café" />
<meta property="og:description" content="Premium loose-leaf tea, ceremonial matcha and fresh coffee at Ele Café — Vancouver." />
<meta property="og:url" content="https://elecafe.ca" />
<meta property="og:image" content="https://elecafe.ca/og-default.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Ele Café" />
<meta name="twitter:description" content="Premium loose-leaf tea, ceremonial matcha and fresh coffee at Ele Café — Vancouver." />
<meta name="twitter:image" content="https://elecafe.ca/og-default.png" />
<style>body{margin:0;font:16px/1.5 system-ui;background:#fdfaf5;color:#1a2530;display:grid;place-items:center;min-height:100vh;text-align:center;padding:1rem}a{color:#0f1c26}</style>
</head>
<body>
<div><h1>Ele Café</h1><p>Loading… <a href="/">Reload</a></p></div>
</body>
</html>`;

/**
 * Fetch the live SPA shell from Hosting. Retries with exponential backoff
 * on transient failure (3 attempts: 0 ms, 200 ms, 600 ms). Throws on final
 * failure — caller is responsible for falling back to SEO_FALLBACK_TEMPLATE.
 */
async function fetchTemplateWithRetry(): Promise<string> {
  const delays = [0, 200, 600];
  let lastErr: unknown = null;
  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      // app.html is the SPA shell (a copy of index.html — see package.json
      // "build"). index.html itself isn't deployed, so "/" reaches this
      // function via the firebase.json rewrite.
      const res = await fetch(`${SEO_SITE_BASE}/app.html`, {
        headers: { 'Cache-Control': 'no-cache' },
        // Functions runtime supports AbortSignal.timeout in Node 20+
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        lastErr = new Error(`template fetch returned ${res.status}`);
        continue;
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('template fetch failed after retries');
}

async function getSeoTemplate(): Promise<string> {
  const now = Date.now();
  if (seoTemplateCache && seoTemplateCache.expires > now) {
    return seoTemplateCache.html;
  }
  try {
    const html = await fetchTemplateWithRetry();
    seoTemplateCache = { html, expires: now + SEO_TEMPLATE_TTL };
    return html;
  } catch (err) {
    // Cache the fallback for a short window so we don't hammer Hosting
    // while it's down. 30-second TTL — short enough to recover quickly,
    // long enough to absorb a burst of crawler hits.
    console.error('renderSeo: template fetch failed after retries', err);
    // A slightly stale real shell beats the no-JS fallback page.
    if (seoTemplateCache && seoTemplateCache.html !== SEO_FALLBACK_TEMPLATE) {
      seoTemplateCache.expires = now + 30_000;
      return seoTemplateCache.html;
    }
    seoTemplateCache = { html: SEO_FALLBACK_TEMPLATE, expires: now + 30_000 };
    return SEO_FALLBACK_TEMPLATE;
  }
}

function seoEscHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function seoClamp(s: string, max = 155): string {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function seoEmbedJson(obj: unknown): string {
  // </script> inside JSON-LD would close the script tag prematurely.
  // Defense in depth — schema content here is structured product data,
  // but the admin description field is user-controllable.
  return JSON.stringify(obj).replace(/<\//g, '<\\/');
}

// ── French pages (/fr/…) ────────────────────────────────────────────────────
//
// Every server-rendered page also exists under /fr with French title,
// description, content and internal links, and both versions point at each
// other with hreflang. The page builders below are synchronous, so the
// language is a module variable set only for the duration of one builder
// call (withSeoLang) — never across an await, where concurrent requests
// on the same instance could interleave.

type SeoLang = 'en' | 'fr';
let SEO_LANG: SeoLang = 'en';

function withSeoLang<T>(lang: SeoLang, fn: () => T): T {
  const prev = SEO_LANG;
  SEO_LANG = lang;
  try {
    return fn();
  } finally {
    SEO_LANG = prev;
  }
}

const seoFr = () => SEO_LANG === 'fr';
/** English or French copy for the page being rendered. */
const SL = (en: string, fr: string) => (SEO_LANG === 'fr' ? fr : en);
/** Absolute URL of a site path in the language being rendered. */
function seoUrl(path = '/'): string {
  const rest = path === '/' ? '' : path;
  return `${SEO_SITE_BASE}${SEO_LANG === 'fr' ? '/fr' : ''}${rest}`;
}
/** A tea's own text in the page language (French field when it's filled). */
const seoTl = (en: string | undefined, fr: string | null | undefined): string =>
  (SEO_LANG === 'fr' && typeof fr === 'string' && fr.trim() ? fr : en) ?? '';
const seoMoney = (n: number) => (SEO_LANG === 'fr' ? moneyFr(n) : money(n));
const seoCatLabel = (id: string): string =>
  (seoFr() ? CATEGORY_SEO[id]?.labelFr : CATEGORY_SEO[id]?.label) ?? SL('Tea', 'Thé');
const seoCollTitle = (c: CollectionDef) => (seoFr() ? c.titleFr : c.title);
const seoShipping = (store: StoreContent) => shippingText(store, SEO_LANG);
const seoHours = (store: StoreContent) => hoursText(store.hours, SEO_LANG);

/** Serving-suggestion labels from Admin → Products, in French. */
const SERVED_AS_FR: Record<string, string> = {
  'infused tea': 'thé infusé',
  'hot tea': 'thé chaud',
  'iced tea': 'thé glacé',
  'milk tea': 'thé au lait',
  'tea latte': 'thé latté',
};

/** Swap the shell's static <noscript> (between the seo-noscript markers in
 *  index.html) for this page's live fallback content. Older shells without
 *  markers get the block appended after #root instead. */
function replaceNoscript(html: string, block: string): string {
  const marked = /<!-- seo-noscript:start -->[\s\S]*?<!-- seo-noscript:end -->/;
  if (marked.test(html)) return html.replace(marked, () => block);
  return html.replace(/<div id="root"><\/div>/, () => `<div id="root"></div>${block}`);
}

/** "Visit us at … or call …. Open …" — from Admin → Settings. */
/** "Taste it in Vancouver before you buy it online" — the café as a trust signal. */
function seoTasteLine(
  store: StoreContent,
  lead = SL(
    'Taste it in Vancouver before you buy it online',
    'Goûtez-le à Vancouver avant de l’acheter en ligne',
  ),
): string {
  const [street] = addressLines(store.address);
  if (!street) return '';
  return seoFr()
    ? `<p><strong>${seoEscHtml(lead)}</strong> : visitez notre café de thé au ${seoEscHtml(street)}, avec cueillette gratuite pour les commandes en ligne.</p>`
    : `<p><strong>${seoEscHtml(lead)}</strong>: visit our tea café at ${seoEscHtml(street)}, with free pickup for online orders.</p>`;
}

function seoContactHtml(store: StoreContent): string {
  const parts: string[] = [];
  if (store.address)
    parts.push(
      `${SL('Visit us at', 'Visitez-nous au')} <strong>${seoEscHtml(store.address)}</strong>`,
    );
  const tel = phoneTel(store.phone);
  if (tel)
    parts.push(
      `${SL('call', 'appelez le')} <a href="tel:${seoEscHtml(tel)}">${seoEscHtml(store.phone)}</a>`,
    );
  const hours = seoHours(store);
  // Loyalty programme (RewardUp) — linked from every server-rendered page.
  const rewards = `<p><a href="${seoUrl('/rewards')}">Ele Rewards</a>${SL(
    ': our free loyalty program, 10% off when you join.',
    ' : notre programme de fidélité gratuit, 10 % de rabais à l’inscription.',
  )}</p>`;
  if (!parts.length && !hours) return rewards;
  return `<p>${parts.join(SL(' or ', ' ou '))}${parts.length ? '.' : ''}${hours ? ` ${SL('Open', 'Ouvert')} ${seoEscHtml(hours)}.` : ''}</p>${rewards}`;
}

interface TeaSeoFields {
  name: string;
  slug: string;
  category: string;
  description?: string;
  // French text (auto-translated by translate.ts, editable in Admin).
  nameFr?: string | null;
  descriptionFr?: string | null;
  ingredientsFr?: string | null;
  benefitsFr?: string | null;
  originFr?: string | null;
  regionsFr?: string | null;
  price?: number;
  image?: string;
  isActive?: boolean;
  /** Inventory projection (onInventoryWrite) — false when sold out. */
  available?: boolean;
  // Rich product metadata — used to enrich Product/FAQ/HowTo schemas.
  // Every field is optional and defended in the rendering code; nothing
  // here is required for the page to render.
  ingredients?: string;
  benefits?: string;
  origin?: string;
  regions?: string;
  brewingTemp?: string; // e.g. '95°C' — overrides category default
  brewingTime?: string; // e.g. '3-5 minutes' — overrides category default
  weight?: string; // e.g. '90g'
  servingSuggestions?: CollectionTea['servingSuggestions'];
  isOrganic?: boolean;
  caffeine?: string; // 'None' | 'Low' | 'Medium' | 'High' (compare lower-cased)
  allergens?: string[];
  avgRating?: number; // stored as SUM in Firestore (legacy decision);
  //   display value = avgRating / ratingCount
  ratingCount?: number;
}

/** A published review as shown on the tea page (no account ids). */
interface SeoReview {
  id: string;
  userName: string;
  rating: number;
  comment?: string;
  createdAt: number;
  verifiedPurchase?: boolean;
}

async function fetchSeoReviews(teaId: string): Promise<SeoReview[]> {
  const snap = await db
    .collection(`teas/${teaId}/reviews`)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();
  return snap.docs
    .map((d) => {
      const r = d.data();
      const at = r.createdAt?.toMillis?.() ?? 0;
      return {
        id: d.id,
        userName: typeof r.userName === 'string' ? r.userName : '',
        rating: Number(r.rating) || 0,
        ...(typeof r.comment === 'string' && r.comment.trim() ? { comment: r.comment } : {}),
        createdAt: at,
        ...(r.verifiedPurchase === true ? { verifiedPurchase: true } : {}),
      };
    })
    .filter((r) => r.rating >= 1 && r.rating <= 5);
}

/** Firestore values → plain JSON (timestamps become epoch ms). */
function toPlainJson(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  const ts = v as { toMillis?: () => number };
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (Array.isArray(v)) return v.map(toPlainJson);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlainJson(x)]));
}

function patchHeadForTea(
  template: string,
  raw: TeaSeoFields,
  catalog: CatalogTea[] = [],
  ssr?: { id: string; doc: Record<string, unknown>; reviews: SeoReview[] },
): string {
  // The tea's own text in the page language (French fields when filled).
  const tea: TeaSeoFields = {
    ...raw,
    name: seoTl(raw.name, raw.nameFr),
    description: seoTl(raw.description, raw.descriptionFr) || undefined,
    ingredients: seoTl(raw.ingredients, raw.ingredientsFr) || undefined,
    benefits: seoTl(raw.benefits, raw.benefitsFr) || undefined,
    origin: seoTl(raw.origin, raw.originFr) || undefined,
    regions: seoTl(raw.regions, raw.regionsFr) || undefined,
  };
  const url = seoUrl(`/tea-profile/${tea.category}/${tea.slug}`);
  const catLabel = seoCatLabel(tea.category);
  const title = teaSeoTitle(tea.name, tea.category, SEO_LANG);
  const price = (typeof tea.price === 'number' ? tea.price : 18).toFixed(2);
  const image = (tea.image && tea.image.trim()) || SEO_DEFAULT_OG;
  const hasReal = !!(tea.image && tea.image.trim()); // for LCP preload decision

  // Description: prefer the tea's own description; otherwise synthesize a
  // reasonable fallback that mentions key facts. Stays under 155 chars
  // after seoClamp.
  const descParts = [tea.description?.trim()].filter(Boolean) as string[];
  if (descParts.length === 0) {
    const bits = [
      SL(
        `Premium ${catLabel.toLowerCase()} from Ele Café Vancouver — ${tea.name}`,
        `${catLabel} haut de gamme d’Ele Café Vancouver — ${tea.name}`,
      ),
    ];
    if (tea.origin) bits.push(`${SL('Origin: ', 'Origine : ')}${tea.origin}`);
    if (tea.isOrganic) bits.push(SL('Certified organic', 'Certifié biologique'));
    descParts.push(bits.join('. ') + '.');
  }
  // Full text for the product data and page body; `desc` is the search snippet.
  const fullDesc = descParts.join(' ');
  const desc = teaMetaDescription(
    {
      name: tea.name,
      description: descParts.join(' '),
      price: tea.price,
      weight: tea.weight,
      category: tea.category,
    },
    SEO_LANG,
  );

  // Brewing: per-category default, but allow per-tea overrides.
  const catBrew = seoBrewing(tea.category);
  const brewTemp = (tea.brewingTemp && tea.brewingTemp.trim()) || catBrew.temp;
  const brewTime = (tea.brewingTime && tea.brewingTime.trim()) || catBrew.time;

  // Caffeine note: prefer per-tea caffeine level over the category default.
  const caffeine = (tea.caffeine ?? '').toLowerCase();
  const caffeineNote = (() => {
    if (caffeine === 'none')
      return SL(
        `${tea.name} is naturally caffeine-free.`,
        `${tea.name} est naturellement sans caféine.`,
      );
    if (caffeine === 'low')
      return SL(
        `${tea.name} has a low caffeine level — typically under 25 mg per cup.`,
        `${tea.name} est faible en caféine — généralement moins de 25 mg par tasse.`,
      );
    if (caffeine === 'medium')
      return SL(
        `${tea.name} has a moderate caffeine level — typically 25–50 mg per cup.`,
        `${tea.name} a une teneur modérée en caféine — généralement 25 à 50 mg par tasse.`,
      );
    if (caffeine === 'high')
      return SL(
        `${tea.name} has a high caffeine level — typically 50–80 mg per cup.`,
        `${tea.name} est riche en caféine — généralement 50 à 80 mg par tasse.`,
      );
    return catBrew.caffeineNote;
  })();

  // Offer: live stock status, shipping from Admin → Settings, and the
  // real (final-sale) return policy.
  const store = SEO_STORE;
  const inStock = tea.available !== false;
  const shipRate = shippingRateFor(Number(price), store);
  const offer: Record<string, unknown> = {
    '@type': 'Offer',
    '@id': `${url}#offer`,
    url: url,
    priceCurrency: 'CAD',
    price: price,
    availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: 'Ele Café', '@id': SEO_BUSINESS_ID },
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: shipRate.toFixed(2), currency: 'CAD' },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'CA' },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 2, unitCode: 'DAY' },
        transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 8, unitCode: 'DAY' },
      },
    },
    hasMerchantReturnPolicy: RETURN_POLICY_LD,
  };

  const productLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: tea.name,
    description: fullDesc,
    image: image,
    sku: tea.slug,
    brand: { '@type': 'Brand', name: 'Ele Café', '@id': SEO_BUSINESS_ID },
    category: catLabel,
    offers: offer,
  };

  // Optional rich fields — only emit when actually present. Empty/falsy
  // values get dropped so we never ship null/empty schema fields
  // (Google flags those as warnings in Rich Results test).
  if (tea.ingredients?.trim()) productLd.material = tea.ingredients.trim();
  if (tea.weight?.trim())
    productLd.weight = { '@type': 'QuantitativeValue', value: tea.weight.trim() };
  if (tea.origin?.trim())
    productLd.countryOfOrigin = { '@type': 'Country', name: tea.origin.trim() };

  // AggregateRating: avgRating is stored as a TRUE mean clamped to
  // [0, 5] by the review submission transaction in TeaProfilePage. An
  // older writer used to store the SUM, but that path was rewritten in
  // a previous iteration. Dividing by ratingCount here would render a
  // 4.5★ tea as 0.9★ to crawlers (rating ÷ count). Just use it as-is
  // with a defensive clamp for legacy docs that may have leaked through
  // before the migration ran.
  if (
    typeof tea.avgRating === 'number' &&
    tea.avgRating > 0 &&
    typeof tea.ratingCount === 'number' &&
    tea.ratingCount > 0
  ) {
    const display = Math.min(5, Math.max(1, tea.avgRating));
    productLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: display.toFixed(1),
      reviewCount: tea.ratingCount,
      bestRating: '5',
      worstRating: '1',
    };
    // The written reviews themselves (review snippets), newest first.
    const written = (ssr?.reviews ?? []).filter((r) => r.comment && r.userName).slice(0, 5);
    if (written.length) {
      productLd.review = written.map((r) => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: r.userName.split(' ')[0] },
        reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        reviewBody: r.comment,
        ...(r.createdAt ? { datePublished: new Date(r.createdAt).toISOString().slice(0, 10) } : {}),
      }));
    }
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SL('Home', 'Accueil'), item: seoUrl('/') },
      {
        '@type': 'ListItem',
        position: 2,
        name: SL('Our Teas', 'Nos thés'),
        item: seoUrl('/products'),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: catLabel,
        item: seoUrl(`/products/${tea.category}`),
      },
      { '@type': 'ListItem', position: 4, name: tea.name, item: url },
    ],
  };

  // FAQPage — questions templated, answers from the tea's actual data.
  // Never emit a question we can't answer well.
  const faqEntries: Array<{ q: string; a: string }> = [
    {
      q: SL(`How do I brew ${tea.name}?`, `Comment infuser ${tea.name}?`),
      a: SL(
        `Use ${catBrew.gramsPerCup} of ${tea.name} per cup. Heat water to ${brewTemp} and steep for ${brewTime}. Adjust to taste.`,
        `Utilisez ${catBrew.gramsPerCup} de ${tea.name} par tasse. Chauffez l’eau à ${brewTemp} et laissez infuser ${brewTime}. Ajustez selon vos goûts.`,
      ),
    },
    {
      q: SL(`Does ${tea.name} contain caffeine?`, `Y a-t-il de la caféine dans ${tea.name}?`),
      a: caffeineNote,
    },
  ];
  if (tea.ingredients?.trim()) {
    faqEntries.push({
      q: SL(`What is in ${tea.name}?`, `Que contient ${tea.name}?`),
      a: SL(
        `${tea.name} contains: ${tea.ingredients.trim()}.`,
        `${tea.name} contient : ${tea.ingredients.trim()}.`,
      ),
    });
  }
  if (tea.origin?.trim()) {
    const where = `${tea.origin.trim()}${tea.regions?.trim() ? ` (${tea.regions.trim()})` : ''}`;
    faqEntries.push({
      q: SL(`Where does ${tea.name} come from?`, `D’où vient ${tea.name}?`),
      a: SL(`${tea.name} is sourced from ${where}.`, `${tea.name} provient de : ${where}.`),
    });
  }
  if (tea.isOrganic) {
    faqEntries.push({
      q: SL(`Is ${tea.name} organic?`, `Est-ce que ${tea.name} est biologique?`),
      a: SL(
        `Yes — ${tea.name} is certified organic.`,
        `Oui — ${tea.name} est certifié biologique.`,
      ),
    });
  }
  faqEntries.push(
    {
      q: SL(`How is ${tea.name} shipped?`, `Comment est expédié ${tea.name}?`),
      a: SL(
        `We ship across Canada. ${seoShipping(store)} Orders typically arrive within 1–8 business days. ` +
          `Free pickup is also available${store.address ? ` at ${store.address}` : ' in Vancouver'}.`,
        `Nous livrons partout au Canada. ${seoShipping(store)} Les commandes arrivent généralement en 1 à 8 jours ouvrables. ` +
          `La cueillette gratuite est aussi offerte${store.address ? ` au ${store.address}` : ' à Vancouver'}.`,
      ),
    },
    {
      q: SL('What is the return policy?', 'Quelle est la politique de retour?'),
      a: SL(
        'Because tea is a food product, sales are final. If your tea arrives spoiled or damaged, contact us within 7 days and we’ll refund or replace it.',
        'Le thé étant un produit alimentaire, toutes les ventes sont finales. Si votre thé arrive abîmé ou endommagé, écrivez-nous dans les 7 jours et nous le rembourserons ou le remplacerons.',
      ),
    },
  );
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqEntries.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  // HowTo — step-by-step brewing.
  const howtoLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: SL(`How to brew ${tea.name}`, `Comment infuser ${tea.name}`),
    description: SL(
      `Step-by-step brewing instructions for ${tea.name}.`,
      `Instructions d’infusion étape par étape pour ${tea.name}.`,
    ),
    totalTime: catBrew.totalTimeISO,
    supply: [
      {
        '@type': 'HowToSupply',
        name: SL(`${catBrew.gramsPerCup} of ${tea.name}`, `${catBrew.gramsPerCup} de ${tea.name}`),
      },
      { '@type': 'HowToSupply', name: SL('Filtered water', 'Eau filtrée') },
    ],
    tool: [
      { '@type': 'HowToTool', name: SL('Teapot or infuser', 'Théière ou infuseur') },
      { '@type': 'HowToTool', name: SL('Kettle', 'Bouilloire') },
    ],
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: SL('Heat water', 'Chauffer l’eau'),
        text: SL(`Heat fresh water to ${brewTemp}.`, `Chauffez de l’eau fraîche à ${brewTemp}.`),
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: SL('Measure tea', 'Mesurer le thé'),
        text: SL(
          `Measure ${catBrew.gramsPerCup} of loose-leaf ${tea.name} per cup.`,
          `Mesurez ${catBrew.gramsPerCup} de ${tea.name} en vrac par tasse.`,
        ),
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: SL('Steep', 'Infuser'),
        text: SL(
          `Pour water over the leaves and steep for ${brewTime}.`,
          `Versez l’eau sur les feuilles et laissez infuser ${brewTime}.`,
        ),
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: SL('Strain & serve', 'Filtrer et servir'),
        text: SL(
          'Strain the leaves and serve. The same leaves can usually be re-steeped 1–2 more times.',
          'Retirez les feuilles et servez. Les mêmes feuilles peuvent généralement être infusées encore 1 à 2 fois.',
        ),
      },
    ],
  };

  // Speakable — markup voice assistants (Google Assistant, Siri, Alexa)
  // can read aloud as a snippet response. Optional but cheap.
  const speakableLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url: url,
    name: title,
    description: desc,
    inLanguage: SL('en-CA', 'fr-CA'),
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['h1', '[data-speakable]', 'meta[name="description"]'],
    },
    isPartOf: { '@id': `${SEO_SITE_BASE}/#website` },
  };

  // Patch <head> first, then inject the LCP preload hint if we have a
  // real image. The preload tells the browser to start fetching the hero
  // image in parallel with the main JS bundle, which usually shaves
  // 200–600 ms off the LCP timing on tea-profile pages.
  let html = patchTemplateHead(template, {
    title,
    description: desc,
    canonical: url,
    ogType: 'product',
    ogImage: image,
    extraOgMeta: [
      ['product:price:amount', price],
      ['product:price:currency', 'CAD'],
      ['product:availability', inStock ? 'in stock' : 'out of stock'],
    ],
    extraJsonLd: [productLd, breadcrumbLd, faqLd, howtoLd, speakableLd],
  });

  if (hasReal) {
    // Preload exactly what the page shows: when the tea has WebP copies
    // (imageVariants.ts) the hero is a <picture> WebP source with sizes
    // SIZES.teaHero — preloading the original instead wasted ~1.7 MB on
    // phones and delayed the real image.
    const v = (
      raw as { imageVariants?: { src?: string; set?: Array<{ w?: number; url?: string }> } }
    ).imageVariants;
    const set =
      v && v.src === raw.image && Array.isArray(v.set)
        ? v.set
            .filter((x) => typeof x?.w === 'number' && typeof x?.url === 'string')
            .sort((a, b) => (a.w as number) - (b.w as number))
        : [];
    const tag = set.length
      ? `<link rel="preload" as="image" type="image/webp" href="${seoEscHtml(set[0].url as string)}" imagesrcset="${seoEscHtml(set.map((x) => `${x.url} ${x.w}w`).join(', '))}" imagesizes="(min-width: 768px) 50vw, 100vw" fetchpriority="high" />`
      : `<link rel="preload" as="image" href="${seoEscHtml(image)}" fetchpriority="high" />`;
    html = html.replace(/(\s*)<\/head>/, `\n    ${tag}$1</head>`);
  }

  // Phase 8.3 — Inject a <noscript> body block with the tea content
  // as plain semantic HTML. This serves three audiences:
  //
  //   1. No-JS crawlers (archive.org, some smaller indexers, link
  //      preview bots that don't execute JS) see real content
  //      instead of <div id="root"></div>.
  //   2. Users with JS disabled or blocked get a usable read-only
  //      page that lists the tea, its origin, brewing, and a buy link.
  //   3. View-source: on the URL shows real content — which satisfies
  //      the Phase 8.3 roadmap success gate without requiring the
  //      full vite-ssg framework integration (which is blocked by
  //      React Router 7 incompatibility with vite-react-ssg).
  //
  // The <noscript> only renders when JS is disabled — JS-enabled
  // clients (the vast majority) see <div id="root"></div> as before
  // and React hydrates over it. No conflict with the SPA flow.
  // Served-as list, related teas and collections — internal links + context.
  const servedAsList = (tea.servingSuggestions ?? [])
    .map((x) => (typeof x === 'string' ? { label: x, enabled: true } : x))
    .filter((x) => x && x.enabled !== false && x.label)
    .map((x) => String(x.label).toLowerCase())
    .map((x) => (seoFr() ? (SERVED_AS_FR[x] ?? x) : x));
  const related = catalog
    .filter((t) => t.category === tea.category && t.slug !== tea.slug)
    .slice(0, 6);
  const inCollections = SEO_COLLECTIONS.filter(
    (c) => c.slug !== 'best-sellers' && c.match(tea as CollectionTea),
  );
  const noscriptBlock = `
    <noscript>
      <article class="seo-fallback">
        <header>
          <p>${seoEscHtml(catLabel)}</p>
          <h1>${seoEscHtml(tea.name)}</h1>
          ${tea.origin ? `<p>${SL('Origin:', 'Origine :')} <strong>${seoEscHtml(tea.origin)}</strong></p>` : ''}
          <p>${SL('Price:', 'Prix :')} <strong>${seoEscHtml(seoMoney(Number(price)))}</strong></p>
        </header>
        ${tea.image ? `<img src="${seoEscHtml(image)}" alt="${seoEscHtml(tea.name)}" loading="lazy" width="600" height="600" />` : ''}
        <section>
          <h2>Description</h2>
          <p>${seoEscHtml(fullDesc)}</p>
        </section>
        <section>
          <h2>${SL('Brewing', 'Infusion')}</h2>
          <p>${SL('Water temperature:', 'Température de l’eau :')} ${seoEscHtml(brewTemp)}<br />${SL('Steep time:', 'Temps d’infusion :')} ${seoEscHtml(brewTime)}<br />${seoEscHtml(caffeineNote)}</p>
        </section>
        ${
          tea.ingredients
            ? `<section>
          <h2>${SL('Ingredients', 'Ingrédients')}</h2>
          <p>${seoEscHtml(tea.ingredients)}</p>
        </section>`
            : ''
        }
        ${
          tea.benefits
            ? `<section>
          <h2>${SL('Tasting notes &amp; benefits', 'Notes de dégustation et bienfaits')}</h2>
          <p>${seoEscHtml(tea.benefits)}</p>
        </section>`
            : ''
        }
        ${tea.regions ? `<p>${SL('Growing region:', 'Région de culture :')} ${seoEscHtml(tea.regions)}</p>` : ''}
        ${
          servedAsList.length
            ? `<section>
          <h2>${SL('Enjoy it at Ele Café', 'Savourez-le chez Ele Café')}</h2>
          <p>${SL(
            `We serve ${seoEscHtml(tea.name)} at our Vancouver café as ${seoEscHtml(servedAsList.join(', ').replace(/, ([^,]*)$/, ' or $1'))}.`,
            `Nous servons ${seoEscHtml(tea.name)} à notre café de Vancouver en ${seoEscHtml(servedAsList.join(', ').replace(/, ([^,]*)$/, ' ou $1'))}.`,
          )}</p>
        </section>`
            : ''
        }
        ${tea.isOrganic ? `<p><em>${SL('Certified organic.', 'Certifié biologique.')}</em></p>` : ''}
        ${seoTasteLine(store, SL('Taste it first at our café', 'Goûtez-le d’abord à notre café'))}
        ${
          related.length
            ? `<section>
          <h2>${SL(`More ${seoEscHtml(catLabel)}`, `Plus de choix : ${seoEscHtml(catLabel)}`)}</h2>
          ${teaListHtml(related)}
          <p><a href="${seoUrl(`/products/${seoEscHtml(tea.category)}`)}">${SL(`All ${seoEscHtml(catLabel)}`, `${seoEscHtml(catLabel)} : toute la sélection`)}</a> · <a href="${seoUrl('/products')}">${SL('All teas', 'Tous les thés')}</a></p>
        </section>`
            : ''
        }
        ${inCollections.length ? `<p>${SL('Find it in:', 'Présent dans :')} ${inCollections.map((c) => `<a href="${seoUrl(`/collections/${seoEscHtml(c.slug)}`)}">${seoEscHtml(seoCollTitle(c))}</a>`).join(' · ')}</p>` : ''}
        <p>
          <a href="${seoEscHtml(url)}">${SL(`View ${seoEscHtml(tea.name)} on Ele Café`, `Voir ${seoEscHtml(tea.name)} sur Ele Café`)}</a>
        </p>
        ${inStock ? '' : `<p><strong>${SL('Currently sold out.', 'Actuellement en rupture de stock.')}</strong></p>`}
        ${seoContactHtml(store)}
      </article>
    </noscript>`;
  html = replaceNoscript(html, noscriptBlock);

  // Hand the tea and its reviews to the app (lib/ssrTea.ts): the page shows
  // real stock, price and reviews at once — and still does when Firestore
  // can't be read (crawlers fail the App Check challenge, which otherwise
  // left Google looking at a "sold out" fallback).
  if (ssr) {
    const payload = JSON.stringify({
      slug: tea.slug,
      tea: { ...(toPlainJson(ssr.doc) as Record<string, unknown>), id: ssr.id },
      reviews: ssr.reviews,
    }).replace(/</g, '\\u003c');
    html = html.replace(
      /(\s*)<\/head>/,
      () => `\n    <script type="application/json" id="ele-ssr-tea">${payload}</script>\n  </head>`,
    );
  }

  return html;
}

// ── Crawlable tea lists (/products, /products/{cat}, /collections/{slug}) ────
//
// Every listing page ships its actual teas in the server-rendered HTML —
// name, price, a one-line description and a link to the tea page — plus
// ItemList JSON-LD, so search engines see the catalog without running JS.
// One cached catalog read (5 min per warm instance) serves all of them.

interface CatalogTea {
  name: string;
  slug: string;
  category: string;
  price?: number;
  description?: string;
  available?: boolean;
  nameFr?: string | null;
  descriptionFr?: string | null;
}

let catalogCache: { at: number; teas: CatalogTea[] } | null = null;

async function fetchCatalogForSeo(): Promise<CatalogTea[]> {
  if (catalogCache && Date.now() - catalogCache.at < 5 * 60_000) return catalogCache.teas;
  const snap = await db
    .collection('teas')
    .select(
      'name',
      'slug',
      'category',
      'price',
      'description',
      'isActive',
      'available',
      'nameFr',
      'descriptionFr',
    )
    .get();
  const teas: CatalogTea[] = [];
  for (const doc of snap.docs) {
    const d = doc.data() as TeaSeoFields;
    if (d.isActive === false || !d.slug || !d.category || !d.name) continue;
    teas.push({
      name: d.name,
      slug: d.slug,
      category: d.category,
      price: d.price,
      description: d.description,
      available: d.available,
      nameFr: d.nameFr,
      descriptionFr: d.descriptionFr,
    });
  }
  teas.sort((a, b) => a.name.localeCompare(b.name));
  catalogCache = { at: Date.now(), teas };
  return teas;
}

const teaUrlFor = (t: { category: string; slug: string }) =>
  seoUrl(`/tea-profile/${encodeURIComponent(t.category)}/${encodeURIComponent(t.slug)}`);

/** First sentence of a description, capped for a list line. */
function teaBlurb(desc?: string): string {
  const s = (desc ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const first = s.match(/^.+?[.!?](\s|$)/)?.[0]?.trim() ?? s;
  return first.length > 160 ? `${first.slice(0, 157).trimEnd()}…` : first;
}

function teaListHtml(teas: readonly CatalogTea[]): string {
  return `<ul>
          ${teas
            .map((t) => {
              const price =
                typeof t.price === 'number' && t.price > 0
                  ? ` — ${seoEscHtml(seoMoney(t.price))}`
                  : '';
              const blurb = teaBlurb(seoTl(t.description, t.descriptionFr));
              const sold = t.available === false ? SL(' (sold out)', ' (épuisé)') : '';
              return `<li><a href="${seoEscHtml(teaUrlFor(t))}">${seoEscHtml(seoTl(t.name, t.nameFr))}</a>${price}${sold}${blurb ? `. ${seoEscHtml(blurb)}` : ''}</li>`;
            })
            .join('\n          ')}
          </ul>`;
}

function itemListLd(
  name: string,
  url: string,
  teas: readonly CatalogTea[],
  description?: string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    url,
    name,
    ...(description ? { description } : {}),
    isPartOf: { '@id': `${SEO_SITE_BASE}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      name,
      numberOfItems: teas.length,
      itemListElement: teas.map((t, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: teaUrlFor(t),
        name: seoTl(t.name, t.nameFr),
      })),
    },
  };
}

const PRODUCTS_TITLE = 'Shop Loose Leaf Tea Online in Canada — All Teas | Ele Café Vancouver';
const PRODUCTS_TITLE_FR = 'Thé en vrac en ligne au Canada — Tous nos thés | Ele Café Vancouver';

function patchHeadForProducts(template: string, teas: CatalogTea[]): string {
  const url = seoUrl('/products');
  const cats = Object.keys(SEO_CATEGORY_LABELS).filter((id) => teas.some((t) => t.category === id));
  const catList = cats.map((c) => seoCatLabel(c).toLowerCase()).join(', ');
  const intro = SL(
    `Shop ${teas.length} loose leaf teas online in Canada — ${catList} — blended and packed at our Vancouver tea café. ${seoShipping(SEO_STORE)}`,
    `Achetez ${teas.length} thés en vrac en ligne au Canada — ${catList} — mélangés et emballés dans notre café de thé à Vancouver. ${seoShipping(SEO_STORE)}`,
  );
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SL('Home', 'Accueil'), item: seoUrl('/') },
      { '@type': 'ListItem', position: 2, name: SL('Our Teas', 'Nos thés'), item: url },
    ],
  };
  const html = patchTemplateHead(template, {
    title: SL(PRODUCTS_TITLE, PRODUCTS_TITLE_FR),
    description: seoClamp(intro),
    canonical: url,
    ogType: 'website',
    ogImage: SEO_DEFAULT_OG,
    extraOgMeta: [],
    extraJsonLd: [itemListLd(SL('Our Teas', 'Nos thés'), url, teas, seoClamp(intro)), breadcrumbLd],
  });
  const sections = cats
    .map((c) => {
      const inCat = teas.filter((t) => t.category === c);
      return `<section>
          <h2><a href="${seoUrl(`/products/${seoEscHtml(c)}`)}">${seoEscHtml(seoCatLabel(c))}</a> (${inCat.length})</h2>
          ${teaListHtml(inCat)}
        </section>`;
    })
    .join('\n        ');
  const collections = SEO_COLLECTIONS.map(
    (col) =>
      `<a href="${seoUrl(`/collections/${seoEscHtml(col.slug)}`)}">${seoEscHtml(seoCollTitle(col))}</a>`,
  ).join(' · ');
  return replaceNoscript(
    html,
    `
    <noscript>
      <article class="seo-fallback">
        <header>
          <p>Ele Café · Vancouver</p>
          <h1>${SL('Our Teas', 'Nos thés')}</h1>
          <p>${seoEscHtml(intro)}</p>
        </header>
        ${sections}
        <section>
          <h2>${SL('Tea collections', 'Collections de thé')}</h2>
          <p>${collections}</p>
        </section>
        <p><a href="${seoUrl('/cafe')}">${SL('Café menu', 'Menu du café')}</a> · <a href="${seoUrl('/pairings')}">${SL('Tea &amp; pastry pairings', 'Accords thé et pâtisserie')}</a>${SEO_STORE.giftBuilderEnabled ? ` · <a href="${seoUrl('/gifts')}">${SL('Gift builder', 'Coffrets-cadeaux')}</a>` : ''}</p>
        ${seoContactHtml(SEO_STORE)}
      </article>
    </noscript>`,
  );
}

function patchHeadForCategory(template: string, catId: string, catalog: CatalogTea[] = []): string {
  const url = seoUrl(`/products/${catId}`);
  const label = seoCatLabel(catId);
  const title = `${label} | Ele Café Vancouver`;
  const intro =
    (seoFr() ? CATEGORY_SEO[catId]?.introFr : CATEGORY_SEO[catId]?.intro) ??
    SL(
      `Shop premium loose leaf ${label.toLowerCase()} at Ele Café, Vancouver's tea shop.`,
      `${label} en vrac haut de gamme chez Ele Café, la boutique de thé de Vancouver.`,
    );
  const desc = seoClamp(intro);

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SL('Home', 'Accueil'), item: seoUrl('/') },
      {
        '@type': 'ListItem',
        position: 2,
        name: SL('Our Teas', 'Nos thés'),
        item: seoUrl('/products'),
      },
      { '@type': 'ListItem', position: 3, name: label, item: url },
    ],
  };

  let html = patchTemplateHead(template, {
    title,
    description: desc,
    canonical: url,
    ogType: 'website',
    ogImage: SEO_DEFAULT_OG,
    extraOgMeta: [],
    extraJsonLd: [
      itemListLd(
        label,
        url,
        catalog.filter((t) => t.category === catId),
        desc,
      ),
      breadcrumbLd,
    ],
  });
  const inCat = catalog.filter((t) => t.category === catId);

  // Phase 8.3 — Inject a <noscript> body block with category content
  // so /products/:category URLs show real HTML in view-source: for
  // no-JS crawlers. JS-enabled clients see <div id="root"></div> and
  // React mounts the SPA over it as before.
  const noscriptBlock = `
    <noscript>
      <article class="seo-fallback">
        <header>
          <p>${SL('Category', 'Catégorie')}</p>
          <h1>${seoEscHtml(label)}</h1>
        </header>
        <section>
          <p>${seoEscHtml(intro)}</p>
          <p>${seoEscHtml(seoShipping(SEO_STORE))}</p>
        </section>
        ${
          inCat.length
            ? `<section>
          <h2>${SL(
            `${inCat.length} ${seoEscHtml(label)} ${inCat.length === 1 ? 'tea' : 'teas'}`,
            `${seoEscHtml(label)} : ${inCat.length} ${inCat.length === 1 ? 'thé' : 'thés'}`,
          )}</h2>
          ${teaListHtml(inCat)}
        </section>`
            : ''
        }
        <p>
          ${SL('Browse the full catalog:', 'Parcourez tout le catalogue :')} <a href="${seoUrl('/products')}">${SL('all teas', 'tous les thés')}</a>.
        </p>
        ${seoContactHtml(SEO_STORE)}
      </article>
    </noscript>`;
  html = replaceNoscript(html, noscriptBlock);

  return html;
}

// ── Programmatic SEO: collection landing pages ──────────────────────────────
//
// Auto-generated landing pages for high-intent search queries that can't
// be served by the per-category page (which is just a single category).
// Customers searching "caffeine-free tea Vancouver" or "organic tea
// Canada" hit one of these. Each one aggregates teas by an attribute
// query against Firestore.
//
// Route shape: /collections/{slug}
// Slug is one of the keys below. Adding a new collection takes ~5 lines
// (label, description, query). Internal links from category pages point
// here when relevant.
//
// CollectionDef, SEO_COLLECTIONS and SEO_COLLECTION_BY_SLUG live in
// lib/seoCatalog.ts (shared with the storefront's /collections/:slug page).

async function buildCollectionData(def: CollectionDef): Promise<TeaSeoFields[]> {
  // Pull the active catalog and run the filter in memory. ≤500 docs is
  // a single Firestore page; reasonable cost.
  // Filter isActive in memory: a `!= false` query would also drop teas
  // that simply have no isActive field (the storefront shows those).
  const snap = await db.collection('teas').get();
  const all: TeaSeoFields[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as TeaSeoFields;
    if (data.isActive === false || !data.slug || !data.category || !data.name) continue;
    all.push(data);
  }
  return all.filter(def.match).slice(0, 50); // cap for sanity
}

function patchHeadForCollection(
  template: string,
  def: CollectionDef,
  teas: TeaSeoFields[],
): string {
  const url = seoUrl(`/collections/${def.slug}`);
  const defTitle = seoCollTitle(def);
  const title = `${defTitle} | Ele Café Vancouver`;
  const desc = seoClamp(
    `${seoFr() ? def.descriptionFr : def.description} ${seoShipping(SEO_STORE)}`,
  );

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SL('Home', 'Accueil'), item: seoUrl('/') },
      {
        '@type': 'ListItem',
        position: 2,
        name: SL('Our Teas', 'Nos thés'),
        item: seoUrl('/products'),
      },
      { '@type': 'ListItem', position: 3, name: defTitle, item: url },
    ],
  };

  // CollectionPage with embedded ItemList. Each tea referenced by URL +
  // name + position so Google can build sitelinks-style result tiles.
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    url: url,
    name: defTitle,
    description: desc,
    isPartOf: { '@id': `${SEO_SITE_BASE}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      name: defTitle,
      numberOfItems: teas.length,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: teas.map((tea, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: teaUrlFor(tea),
        name: seoTl(tea.name, tea.nameFr),
      })),
    },
  };

  let html = patchTemplateHead(template, {
    title,
    description: desc,
    canonical: url,
    ogType: 'website',
    ogImage: SEO_DEFAULT_OG,
    extraOgMeta: [],
    extraJsonLd: [
      collectionLd,
      breadcrumbLd,
      ...(COLLECTION_GUIDES[def.slug]
        ? [faqJsonLd(seoFr() ? COLLECTION_GUIDES[def.slug].faqFr : COLLECTION_GUIDES[def.slug].faq)]
        : []),
    ],
  });
  const guide = COLLECTION_GUIDES[def.slug];
  const guideSections = guide ? (seoFr() ? guide.sectionsFr : guide.sections) : [];
  const guideFaq = guide ? (seoFr() ? guide.faqFr : guide.faq) : [];
  const guideHtml = guide
    ? `
        ${guideSections
          .map(
            (sec) => `<section>
          <h2>${seoEscHtml(sec.h)}</h2>
          <p>${seoEscHtml(sec.p)}</p>
        </section>`,
          )
          .join('\n        ')}
        <section>
          <h2>${seoEscHtml(defTitle)}${SL(': questions', ' : questions fréquentes')}</h2>
          <dl>
          ${guideFaq.map((f) => `<dt>${seoEscHtml(f.q)}</dt><dd>${seoEscHtml(f.a)}</dd>`).join('\n          ')}
          </dl>
        </section>`
    : '';

  // Phase 8.3 — Inject a <noscript> body block listing the collection's
  // teas as semantic HTML. Crawlers + no-JS clients see real content
  // (collection title + description + list of links to each tea)
  // rather than <div id="root"></div>. JS-enabled clients see the SPA
  // shell and React mounts.
  //
  // We list up to 12 teas to keep the noscript block bounded; the
  // collection page itself shows everything once JS hydrates. 12 covers
  // the typical collection size (caffeine-free has ~15 teas, organic
  // has ~25). Going beyond 12 here would bloat the first-byte response
  // for negligible SEO gain — Google indexes the head metadata, not
  // the noscript footprint.
  const teaList = teaListHtml(
    teas.map((t) => ({
      name: t.name,
      slug: t.slug,
      category: t.category,
      price: t.price,
      description: t.description,
      available: t.available,
      nameFr: t.nameFr,
      descriptionFr: t.descriptionFr,
    })),
  );

  const noscriptBlock = `
    <noscript>
      <article class="seo-fallback">
        <header>
          <p>Collection</p>
          <h1>${seoEscHtml(defTitle)}</h1>
        </header>
        <section>
          <p>${seoEscHtml(desc)}</p>
        </section>
        ${
          teas.length > 0
            ? `
        <section>
          <h2>${SL(
            `${seoEscHtml(String(teas.length))} ${teas.length === 1 ? 'tea' : 'teas'} in this collection`,
            `${seoEscHtml(String(teas.length))} ${teas.length === 1 ? 'thé' : 'thés'} dans cette collection`,
          )}</h2>
          ${teaList}
        </section>`
            : `<p>${SL('No teas currently match this collection.', 'Aucun thé ne correspond à cette collection pour le moment.')}</p>`
        }
        ${guideHtml}
        <section>
          <h2>${SL('More tea collections', 'Autres collections de thé')}</h2>
          <p>${SEO_COLLECTIONS.filter((c) => c.slug !== def.slug)
            .map(
              (c) =>
                `<a href="${seoUrl(`/collections/${seoEscHtml(c.slug)}`)}">${seoEscHtml(seoCollTitle(c))}</a>`,
            )
            .join(' · ')}</p>
          <p>${Object.keys(SEO_CATEGORY_LABELS)
            .map(
              (id) =>
                `<a href="${seoUrl(`/products/${seoEscHtml(id)}`)}">${seoEscHtml(seoCatLabel(id))}</a>`,
            )
            .join(' · ')}</p>
        </section>
        <p>${SL('Browse', 'Parcourez')} <a href="${seoUrl('/products')}">${SL('all teas', 'tous les thés')}</a>.</p>
        ${seoContactHtml(SEO_STORE)}
      </article>
    </noscript>`;
  html = replaceNoscript(html, noscriptBlock);

  return html;
}

// ── Combo / pairing landing page SEO ─────────────────────────────────────────
//
// /pairings/{slug} pages are designed for Instagram-story / social-DM
// sharing. Per-combo OG metadata means when a customer pastes the URL
// into IG, Slack, Messenger, etc., the link card shows THIS combo's
// image and title — not a generic site preview. Without these
// per-combo headers, every share would look identical regardless of
// which pairing was being shared.
interface ComboSeoFields {
  slug: string;
  title: string;
  description: string;
  titleFr?: string;
  descriptionFr?: string;
  vegan?: boolean;
  diet?: string[];
  calories?: number;
  imageUrl: string;
  price: number;
  currency?: string;
}

async function fetchComboBySlug(slug: string): Promise<ComboSeoFields | null> {
  // Defensive read: the admin enforces slug uniqueness on its side, but
  // a manual Firestore edit could create dupes. We take the first match
  // ordered by createdAt (oldest wins, since that's the URL the share
  // links were generated against).
  //
  // The `enabled != false` filter was removed from the query because
  // Firestore's `!=` semantics treat documents missing the field as
  // NOT-matching — so any combo doc seeded before `enabled` was
  // introduced (or any admin-created doc with the field defaulted off)
  // would be excluded entirely. We post-filter in JS instead, treating
  // `enabled === undefined` as "enabled" for backward compat.
  const snap = await db.collection('comboGalleryItems').where('slug', '==', slug).limit(5).get();
  if (snap.empty) return null;
  const docs = snap.docs.filter((d) => d.data().enabled !== false);
  if (docs.length === 0) return null;
  const data = docs[0].data();
  if (typeof data.title !== 'string' || typeof data.imageUrl !== 'string') return null;
  return {
    slug,
    title: data.title,
    description: typeof data.description === 'string' ? data.description : '',
    titleFr: typeof data.titleFr === 'string' ? data.titleFr : undefined,
    descriptionFr: typeof data.descriptionFr === 'string' ? data.descriptionFr : undefined,
    vegan: data.vegan === true,
    diet: Array.isArray(data.diet) ? data.diet : undefined,
    calories: typeof data.calories === 'number' ? data.calories : undefined,
    imageUrl: data.imageUrl,
    price: typeof data.price === 'number' ? data.price : 0,
    currency: typeof data.currency === 'string' ? data.currency : 'CAD',
  };
}

function patchHeadForPairing(template: string, raw: ComboSeoFields): string {
  const combo: ComboSeoFields = {
    ...raw,
    title: seoTl(raw.title, raw.titleFr),
    description: seoTl(raw.description, raw.descriptionFr),
  };
  const url = seoUrl(`/pairings/${combo.slug}`);
  const title = SL(
    `${combo.title} — Pair with our tea | Ele Café Vancouver`,
    `${combo.title} — À savourer avec notre thé | Ele Café Vancouver`,
  );
  const desc = seoClamp(
    combo.description ||
      SL(
        `Pair ${combo.title} with our hand-selected loose-leaf teas — premium curated pairings from Ele Café Vancouver.`,
        `Accompagnez ${combo.title} de nos thés en vrac choisis à la main — des accords haut de gamme d’Ele Café Vancouver.`,
      ),
  );
  const price = combo.price.toFixed(2);
  const image = combo.imageUrl;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SL('Home', 'Accueil'), item: seoUrl('/') },
      {
        '@type': 'ListItem',
        position: 2,
        name: SL('Pairings', 'Accords'),
        item: seoUrl('/pairings'),
      },
      { '@type': 'ListItem', position: 3, name: combo.title, item: url },
    ],
  };

  // Treated as a Product so Google Shopping + Pinterest pull richer
  // cards. Brand + offer mirror the tea-profile schema for
  // consistency. No aggregateRating because combos don't accept reviews
  // (yet — could be added if customer reviews launch).
  //
  // availability: `InStoreOnly` is the honest signal here. The customer-
  // side carousel has no Add-to-Cart for combos; they're a cross-sell
  // hint pointing at the café counter. Marking them `InStock` would
  // let Google Shopping ingest them as buyable SKUs and then ding the
  // page for having no purchase path. `InStoreOnly` keeps the rich
  // card on Pinterest/IG while opting out of Shopping.
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: combo.title,
    description: desc,
    image: image,
    sku: `combo-${combo.slug}`,
    brand: { '@type': 'Brand', name: 'Ele Café', '@id': SEO_BUSINESS_ID },
    category: 'Food / Pastry / Pairing',
    offers: {
      '@type': 'Offer',
      '@id': `${url}#offer`,
      url: url,
      priceCurrency: combo.currency || 'CAD',
      price: price,
      availability: 'https://schema.org/InStoreOnly',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'Ele Café', '@id': SEO_BUSINESS_ID },
    },
  };

  // Patch <head>. og:type=product is the right value for shoppable
  // link previews on IG / FB / WhatsApp — they show the price chip
  // in the link card. Twitter Card uses summary_large_image (set in
  // the template already) which gives a big-image preview ideal for
  // pastry shots.
  let html = patchTemplateHead(template, {
    title,
    description: desc,
    canonical: url,
    ogType: 'product',
    ogImage: image,
    extraOgMeta: [
      ['product:price:amount', price],
      ['product:price:currency', combo.currency || 'CAD'],
      // Aligned with the JSON-LD `InStoreOnly` signal above — combos
      // are café-counter cross-sell, not shippable products. Facebook
      // / Pinterest's OG-product reader accepts this value alongside
      // 'in stock', 'oos', 'pending', 'discontinued'.
      ['product:availability', 'in store only'],
    ],
    extraJsonLd: [productLd, breadcrumbLd],
  });

  // LCP preload — the hero image is unambiguously the LCP candidate
  // on this page, so a preload pulls it in parallel with the JS
  // bundle. Same pattern as the tea-profile page.
  html = html.replace(
    /(\s*)<\/head>/,
    `\n    <link rel="preload" as="image" href="${seoEscHtml(image)}" fetchpriority="high" />$1</head>`,
  );

  // Phase 8.3 — Inject a <noscript> body block with pairing content
  // so /pairings/:slug URLs ship real HTML for crawlers + no-JS clients.
  const noscriptBlock = `
    <noscript>
      <article class="seo-fallback">
        <header>
          <p>${SL('Pairing', 'Accord')}${seoDietText(combo) ? ` · ${seoDietText(combo)}` : ''}</p>
          <h1>${seoEscHtml(combo.title)}</h1>
          <p>${SL('Price:', 'Prix :')} <strong>${seoEscHtml(seoMoney(combo.price))} ${seoEscHtml(combo.currency || 'CAD')}</strong></p>
        </header>
        ${combo.imageUrl ? `<img src="${seoEscHtml(image)}" alt="${seoEscHtml(combo.title)}" loading="lazy" width="600" height="400" />` : ''}
        <section>
          <h2>${SL('About this pairing', 'À propos de cet accord')}</h2>
          <p>${seoEscHtml(desc)}</p>
        </section>
        <p>
          <a href="${seoEscHtml(url)}">${SL(`View ${seoEscHtml(combo.title)} on Ele Café`, `Voir ${seoEscHtml(combo.title)} sur Ele Café`)}</a>
        </p>
        <p>
          ${SL('Browse', 'Voir')} <a href="${seoUrl('/pairings')}">${SL('all pairings', 'tous les accords')}</a>
          ${SL('or', 'ou')} <a href="${seoUrl('/products')}">${SL('browse teas', 'parcourir nos thés')}</a>.
        </p>
      </article>
    </noscript>`;
  html = replaceNoscript(html, noscriptBlock);

  return html;
}

// ── Homepage (/) ────────────────────────────────────────────────────────────
//
// index.html isn't deployed (firebase.json hosting.ignore), so "/" is
// rewritten here and the first-byte homepage carries live facts: the
// active tea count per collection, the café's address / phone / hours
// (LocalBusiness), and the same FAQ the React homepage shows (both built
// by lib/storeContent.ts from Admin → Settings).

type TeaSummary = CollectionTea & {
  name: string;
  slug: string;
  category: string;
  featured?: boolean;
  price?: number;
  description?: string;
  available?: boolean;
  nameFr?: string | null;
  descriptionFr?: string | null;
};

async function fetchActiveTeaSummaries(): Promise<TeaSummary[]> {
  const snap = await db
    .collection('teas')
    .select(
      'name',
      'slug',
      'category',
      'isActive',
      'caffeine',
      'isOrganic',
      'ratingCount',
      'origin',
      'servingSuggestions',
      'featured',
      'price',
      'description',
      'available',
      'nameFr',
      'descriptionFr',
    )
    .get();
  const out: TeaSummary[] = [];
  for (const doc of snap.docs) {
    const d = doc.data() as TeaSeoFields;
    if (d.isActive === false || !d.slug || !d.category || !d.name) continue;
    out.push({
      name: d.name,
      slug: d.slug,
      category: d.category,
      caffeine: d.caffeine,
      isOrganic: d.isOrganic,
      ratingCount: d.ratingCount,
      origin: d.origin,
      servingSuggestions: d.servingSuggestions,
      featured: (d as { featured?: boolean }).featured === true,
      price: d.price,
      description: d.description,
      available: d.available,
      nameFr: d.nameFr,
      descriptionFr: d.descriptionFr,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ── /pairings: tea & pastry pairings index ──────────────────────────────────

/** "vegan, gluten free · 400 Cal" for a pastry, in the page language. */
function seoDietText(c: { diet?: unknown; vegan?: unknown; calories?: unknown }): string {
  const tags = comboDiet(c).map((t) => DIET_LABEL[t][seoFr() ? 'fr' : 'en'].toLowerCase());
  const cal = comboCalories(c);
  return [tags.join(', '), cal ? `${cal} Cal` : ''].filter(Boolean).join(' · ');
}

/** Pastry combos with their title / description in the page language. */
const seoCombos = (combos: CafeCombo[]): CafeCombo[] =>
  combos.map((c) => ({
    ...c,
    title: seoTl(c.title, c.titleFr),
    description: seoTl(c.description, c.descriptionFr) || undefined,
  }));

function patchHeadForPairings(template: string, rawCombos: CafeCombo[]): string {
  const combos = seoCombos(rawCombos);
  const url = seoUrl('/pairings');
  const pageName = SL('Tea & Pastry Pairings', 'Accords thé et pâtisserie');
  const pageDesc = SL(PAIRINGS_DESCRIPTION, PAIRINGS_DESCRIPTION_FR);
  const html = patchTemplateHead(template, {
    title: SL(PAIRINGS_TITLE, PAIRINGS_TITLE_FR),
    description: seoClamp(pageDesc),
    canonical: url,
    ogType: 'website',
    ogImage: combos[0]?.imageUrl || SEO_DEFAULT_OG,
    extraOgMeta: [],
    extraJsonLd: [
      infoBreadcrumb(pageName, url),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': `${url}#collection`,
        url,
        name: pageName,
        description: pageDesc,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: combos.length,
          itemListElement: combos
            .filter((c) => c.slug)
            .map((c, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: seoUrl(`/pairings/${c.slug}`),
              name: c.title,
            })),
        },
      },
    ],
  });
  const items = combos
    .map((c) => {
      const name = c.slug
        ? `<a href="${seoUrl(`/pairings/${seoEscHtml(c.slug)}`)}">${seoEscHtml(c.title)}</a>`
        : seoEscHtml(c.title);
      const vegan = seoDietText(c) ? ` (${seoDietText(c)})` : '';
      return `<li>${name}${vegan} — ${seoEscHtml(seoMoney(c.price))}${c.description ? `. ${seoEscHtml(teaBlurb(c.description))}` : ''}</li>`;
    })
    .join('\n          ');
  return replaceNoscript(
    html,
    `
    <noscript>
      <article class="seo-fallback">
        <header>
          <p>Ele Café · Vancouver</p>
          <h1>${seoEscHtml(pageName)}</h1>
          <p>${seoEscHtml(pageDesc)}</p>
        </header>
        ${
          items
            ? `<section>
          <h2>${SL('Our pairings', 'Nos accords')}</h2>
          <ul>
          ${items}
          </ul>
        </section>`
            : ''
        }
        <p><a href="${seoUrl('/cafe')}">${SL('Café menu', 'Menu du café')}</a> · <a href="${seoUrl('/products')}">${SL('Shop our teas', 'Nos thés')}</a></p>
        ${seoContactHtml(SEO_STORE)}
      </article>
    </noscript>`,
  );
}

// ── /about and /contact ─────────────────────────────────────────────────────
// Same copy and the same Admin → Settings values (address, phone, email,
// hours) as AboutPage / ContactPage, so crawlers and AI tools see exactly
// the facts visitors do — one source of truth.

function infoBreadcrumb(name: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SL('Home', 'Accueil'), item: seoUrl('/') },
      { '@type': 'ListItem', position: 2, name, item: url },
    ],
  };
}

function patchHeadForAbout(template: string): string {
  const store = SEO_STORE;
  const url = seoUrl('/about');
  const [street] = addressLines(store.address);
  const desc = SL(
    `Learn about ${store.name} — Vancouver's loose-leaf tea destination${street ? ` at ${street}` : ''}.`,
    `Découvrez ${store.name} — la destination du thé en vrac à Vancouver${street ? `, au ${street}` : ''}.`,
  );
  const html = patchTemplateHead(template, {
    title: SL('About Us | Ele Café', 'À propos | Ele Café'),
    description: seoClamp(desc),
    canonical: url,
    ogType: 'website',
    ogImage: SEO_DEFAULT_OG,
    extraOgMeta: [],
    extraJsonLd: [
      infoBreadcrumb(SL('About Us', 'À propos'), url),
      localBusinessLd(store, SEO_SITE_BASE),
    ],
  });
  const body = seoFr()
    ? `<h1>À propos</h1>
        <p>Ele Café a commencé son aventure à Vancouver (C.-B.) en ${FOUNDING_YEAR}, animé par la passion de partager des thés en vrac d’exception venus du monde entier. Chaque thé de notre collection est choisi avec soin pour sa qualité, son caractère et l’histoire unique de son origine.</p>
        <p>Notre adresse${street ? ` au ${seoEscHtml(street)}` : ''} est plus qu’un café — c’est un lieu pour tous ceux qui croient qu’une bonne tasse de thé est l’un des plaisirs simples de la vie, du matcha de cérémonie japonais fouetté à la commande aux oolongs rares et aux thés noirs de caractère.</p>
        <h2>Nos valeurs</h2>
        <p>Nous misons sur la transparence quant à l’origine de chaque thé et cherchons à créer un espace accueillant où découvrir le goût, l’arôme et les bienfaits naturels des thés du monde entier.</p>
        <p><a href="${seoUrl('/products')}">Nos thés</a> · <a href="${seoUrl('/cafe')}">Menu du café</a> · <a href="${seoUrl('/contact')}">Nous joindre</a></p>`
    : `<h1>About Us</h1>
        <p>Ele Café began its journey in Vancouver, BC in ${FOUNDING_YEAR} with a passion for sharing exceptional loose-leaf teas from around the world. Every tea in our collection is carefully selected for its quality, character, and the unique story behind its origin.</p>
        <p>Our location${street ? ` at ${seoEscHtml(street)}` : ''} is more than a café — it is a place for anyone who believes a great cup of tea is one of life’s simple pleasures, from Japanese ceremonial matcha whisked to order to rare oolongs and distinctive black teas.</p>
        <h2>Our Values</h2>
        <p>We value transparency in the origin of every tea we offer and strive to create a welcoming space where people can discover the taste, aroma, and natural benefits of teas from around the world.</p>
        <p><a href="${seoUrl('/products')}">Shop our teas</a> · <a href="${seoUrl('/cafe')}">Café menu</a> · <a href="${seoUrl('/contact')}">Contact us</a></p>`;
  return replaceNoscript(
    html,
    `
    <noscript>
      <article class="seo-fallback">
        ${body}
        ${seoContactHtml(store)}
      </article>
    </noscript>`,
  );
}

function patchHeadForContact(template: string): string {
  const store = SEO_STORE;
  const url = seoUrl('/contact');
  const hours = seoHours(store);
  const desc = SL(
    `Visit ${store.name}${store.address ? ` at ${store.address}` : ' in Vancouver'}.${hours ? ` Open ${hours}.` : ''} Phone, email and directions.`,
    `Visitez ${store.name}${store.address ? ` au ${store.address}` : ' à Vancouver'}.${hours ? ` Ouvert ${hours}.` : ''} Téléphone, courriel et itinéraire.`,
  );
  const tel = phoneTel(store.phone);
  const html = patchTemplateHead(template, {
    title: SL('Contact Us | Ele Café', 'Nous joindre | Ele Café'),
    description: seoClamp(desc),
    canonical: url,
    ogType: 'website',
    ogImage: SEO_DEFAULT_OG,
    extraOgMeta: [],
    extraJsonLd: [
      infoBreadcrumb(SL('Contact Us', 'Nous joindre'), url),
      localBusinessLd(store, SEO_SITE_BASE),
    ],
  });
  return replaceNoscript(
    html,
    `
    <noscript>
      <article class="seo-fallback">
        <h1>${SL('Contact Us', 'Nous joindre')}</h1>
        <p>${SL(
          'We’d love to hear from you. Drop in to taste teas with us, or reach out by phone or email — we’ll get back to you within one business day.',
          'Nous serions ravis d’avoir de vos nouvelles. Passez déguster nos thés, ou écrivez-nous ou appelez-nous — nous vous répondrons en un jour ouvrable.',
        )}</p>
        <dl>
          ${store.address ? `<dt>${SL('Address', 'Adresse')}</dt><dd>${store.mapsUrl ? `<a href="${seoEscHtml(store.mapsUrl)}">${seoEscHtml(store.address)}</a>` : seoEscHtml(store.address)}</dd>` : ''}
          ${tel ? `<dt>${SL('Phone', 'Téléphone')}</dt><dd><a href="tel:${seoEscHtml(tel)}">${seoEscHtml(store.phone)}</a></dd>` : ''}
          ${store.email ? `<dt>${SL('Email', 'Courriel')}</dt><dd><a href="mailto:${seoEscHtml(store.email)}">${seoEscHtml(store.email)}</a></dd>` : ''}
          ${hours ? `<dt>${SL('Hours', 'Heures')}</dt><dd>${seoEscHtml(hours)}</dd>` : ''}
        </dl>
        <p><a href="${seoUrl('/cafe')}">${SL('Café menu', 'Menu du café')}</a> · <a href="${seoUrl('/products')}">${SL('Shop our teas', 'Nos thés')}</a></p>
      </article>
    </noscript>`,
  );
}

// ── /franchise: franchise inquiries (lib/franchise.ts) ─────────────────────

function patchHeadForFranchise(template: string): string {
  const url = seoUrl('/franchise');
  const email = SEO_STORE.email || FRANCHISE_EMAIL_FALLBACK;
  const breadcrumbLd = infoBreadcrumb('Franchise', url);
  const html = patchTemplateHead(template, {
    title: SL(FRANCHISE_TITLE, FRANCHISE_TITLE_FR),
    description: seoClamp(SL(FRANCHISE_DESCRIPTION, FRANCHISE_DESCRIPTION_FR)),
    canonical: url,
    ogType: 'website',
    ogImage: SEO_DEFAULT_OG,
    extraOgMeta: [],
    extraJsonLd: [breadcrumbLd],
  });
  return replaceNoscript(
    html,
    `
    <noscript>
      <article class="seo-fallback">
        <header>
          <p>${SL('Franchise opportunities', 'Occasions de franchise')}</p>
          <h1>${SL('Open an Ele Café in your city', 'Ouvrez un Ele Café dans votre ville')}</h1>
          <p>${seoEscHtml(franchiseIntro(SEO_LANG))}</p>
          <p><a href="${seoEscHtml(franchiseMailto(email, SEO_LANG))}">${SL('Email us about franchising', 'Écrivez-nous au sujet de la franchise')}</a> (${seoEscHtml(email)})</p>
        </header>
        <section>
          <h2>${SL('The concept', 'Le concept')}</h2>
          <ul>
          ${FRANCHISE_CONCEPT.map((p) => `<li><strong>${seoEscHtml(SL(p.title, p.titleFr))}</strong> — ${seoEscHtml(SL(p.text, p.textFr))}</li>`).join('\n          ')}
          </ul>
        </section>
        <section>
          <h2>${SL("Who we're looking for", 'Qui nous recherchons')}</h2>
          <ul>
          ${FRANCHISE_PARTNER.map((p) => `<li>${seoEscHtml(SL(p.en, p.fr))}</li>`).join('\n          ')}
          </ul>
        </section>
        <p><a href="${seoUrl('/cafe')}">${SL('Café menu', 'Menu du café')}</a> · <a href="${seoUrl('/about')}">${SL('About Ele Café', 'À propos d’Ele Café')}</a></p>
        ${seoContactHtml(SEO_STORE)}
      </article>
    </noscript>`,
  );
}

// ── /rewards: Ele Rewards loyalty program (lib/rewards.ts) ─────────────────

function patchHeadForRewards(template: string): string {
  const url = seoUrl('/rewards');
  const faq = buildRewardsFaq(SEO_LANG);
  const breadcrumbLd = infoBreadcrumb('Ele Rewards', url);
  const html = patchTemplateHead(template, {
    title: SL(REWARDS_TITLE, REWARDS_TITLE_FR),
    description: seoClamp(SL(REWARDS_DESCRIPTION, REWARDS_DESCRIPTION_FR)),
    canonical: url,
    ogType: 'website',
    ogImage: SEO_DEFAULT_OG,
    extraOgMeta: [],
    extraJsonLd: [faqJsonLd(faq), breadcrumbLd],
  });
  const list = (items: typeof REWARDS_EARN) =>
    items
      .map(
        (i) =>
          `<li><strong>${seoEscHtml(SL(i.title, i.titleFr))}</strong> — ${seoEscHtml(SL(i.detail, i.detailFr))}</li>`,
      )
      .join('\n          ');
  const faqHtml = faq
    .map((f) => `<dt>${seoEscHtml(f.q)}</dt><dd>${seoEscHtml(f.a)}</dd>`)
    .join('\n          ');
  return replaceNoscript(
    html,
    `
    <noscript>
      <article class="seo-fallback">
        <header>
          <p>${SL('Ele Café loyalty program', 'Programme de fidélité d’Ele Café')}</p>
          <h1>Ele Rewards</h1>
          <p>${seoEscHtml(rewardsIntro(SEO_LANG))}</p>
          <p><a href="${REWARDS_URL}">${SL('Join Ele Rewards and get 10% off', 'Joignez Ele Rewards et obtenez 10 % de rabais')}</a></p>
        </header>
        <section>
          <h2>${SL('Ways to earn points', 'Façons d’accumuler des points')}</h2>
          <ul>
          ${list(REWARDS_EARN)}
          </ul>
        </section>
        <section>
          <h2>${SL('Ways to redeem', 'Façons d’échanger vos points')}</h2>
          <ul>
          ${list(REWARDS_REDEEM)}
          </ul>
        </section>
        <section>
          <h2>${SL('Ele Rewards FAQ', 'FAQ Ele Rewards')}</h2>
          <dl>
          ${faqHtml}
          </dl>
        </section>
        <p><a href="${seoUrl('/cafe')}">${SL('Café menu', 'Menu du café')}</a> · <a href="${seoUrl('/products')}">${SL('Shop our loose leaf teas', 'Nos thés en vrac')}</a></p>
        ${seoContactHtml(SEO_STORE)}
      </article>
    </noscript>`,
  );
}

// ── /cafe: the in-store café menu ───────────────────────────────────────────
//
// Copy, drinks and FAQ come from lib/cafeMenu.ts (shared with CafePage);
// pastry combos are read live from Admin → Pairings, the same filter the
// storefront uses (enabled + has a photo), so prices always match.

async function fetchCafeCombos(): Promise<CafeCombo[]> {
  const snap = await db.collection('comboGalleryItems').orderBy('order', 'asc').get();
  const out: CafeCombo[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.enabled === false) continue;
    if (typeof d.imageUrl !== 'string' || !d.imageUrl.trim()) continue;
    if (typeof d.title !== 'string' || typeof d.price !== 'number') continue;
    out.push({
      title: d.title,
      price: d.price,
      imageUrl: d.imageUrl,
      description: typeof d.description === 'string' ? d.description : undefined,
      slug: typeof d.slug === 'string' && d.slug.trim() ? d.slug.trim() : undefined,
      titleFr: typeof d.titleFr === 'string' && d.titleFr.trim() ? d.titleFr : undefined,
      descriptionFr: typeof d.descriptionFr === 'string' ? d.descriptionFr : undefined,
      vegan: d.vegan === true,
      diet: Array.isArray(d.diet) ? d.diet : undefined,
      calories: typeof d.calories === 'number' ? d.calories : undefined,
    });
  }
  return out;
}

function patchHeadForCafe(template: string, rawCombos: CafeCombo[]): string {
  const store = SEO_STORE;
  const combos = seoCombos(rawCombos);
  const url = seoUrl('/cafe');
  const faq = buildCafeFaq(store, SEO_LANG);
  const breadcrumbLd = infoBreadcrumb(SL('Café Menu', 'Menu du café'), url);
  let html = patchTemplateHead(template, {
    title: SL(CAFE_TITLE, CAFE_TITLE_FR),
    description: seoClamp(SL(CAFE_DESCRIPTION, CAFE_DESCRIPTION_FR)),
    canonical: url,
    ogType: 'website',
    ogImage: combos[0]?.imageUrl || SEO_DEFAULT_OG,
    extraOgMeta: [],
    extraJsonLd: [cafeMenuLd(seoUrl('/'), combos, SEO_LANG), faqJsonLd(faq), breadcrumbLd],
  });
  const drinkPrice = (d: { price?: number; price12?: number; price16?: number }) =>
    typeof d.price === 'number'
      ? ` — ${seoMoney(d.price)}`
      : typeof d.price12 === 'number'
        ? ` — ${seoMoney(d.price12)} (12 oz) / ${seoMoney(d.price16 ?? d.price12)} (16 oz)`
        : '';
  const drinks = CAFE_MENU.map(
    (sec) => `<section>
          <h2>${seoEscHtml(SL(sec.title, sec.titleFr))}</h2>
          <p>${seoEscHtml(SL(sec.tagline, sec.taglineFr))}</p>
          <ul>
          ${[
            ...sec.drinks,
            ...[sec.flavoured, sec.puree].filter((o): o is NonNullable<typeof o> => !!o),
          ]
            .map(
              (d) =>
                `<li><strong>${seoEscHtml(SL(d.name, d.nameFr))}</strong>${seoEscHtml(drinkPrice(d))} — ${seoEscHtml(SL(d.description, d.descriptionFr))}</li>`,
            )
            .join('\n          ')}
          </ul>
          ${
            sec.favourites?.length
              ? `<p>${SL('House favourites, as a hot tea latte or iced milk tea:', 'Favoris de la maison, en thé latté chaud ou en thé au lait glacé :')} ${sec.favourites
                  .map(
                    (f) =>
                      `<a href="${seoUrl(`/tea-profile/${seoEscHtml(f.tea.category)}/${seoEscHtml(f.tea.slug)}`)}">${seoEscHtml(SL(f.name, f.nameFr))}</a>`,
                  )
                  .join(', ')}.</p>`
              : ''
          }
        </section>`,
  ).join('\n        ');
  const pastries = combos
    .map((c) => {
      const name = c.slug
        ? `<a href="${seoUrl(`/pairings/${seoEscHtml(c.slug)}`)}">${seoEscHtml(c.title)}</a>`
        : seoEscHtml(c.title);
      const vegan = seoDietText(c) ? ` (${seoDietText(c)})` : '';
      return `<li>${name}${vegan} ${SL('with tea or Americano', 'avec thé ou Americano')} — ${seoEscHtml(seoMoney(c.price))}</li>`;
    })
    .join('\n          ');
  const faqHtml = faq
    .map((f) => `<dt>${seoEscHtml(f.q)}</dt><dd>${seoEscHtml(f.a)}</dd>`)
    .join('\n          ');
  const noscriptBlock = `
    <noscript>
      <article class="seo-fallback">
        <header>
          <p>Ele Café · Vancouver</p>
          <h1>${SL('Café Menu', 'Menu du café')}</h1>
          <p>${seoEscHtml(cafeIntro(store, SEO_LANG))}</p>
        </header>
        ${drinks}
        ${
          pastries
            ? `<section>
          <h2>${SL('Pastry combos — with tea or Americano', 'Combos pâtisserie — avec thé ou Americano')}</h2>
          <ul>
          ${pastries}
          </ul>
        </section>`
            : ''
        }
        <section>
          <h2>${SL('Café FAQ', 'FAQ du café')}</h2>
          <dl>
          ${faqHtml}
          </dl>
        </section>
        <p><a href="${seoUrl('/products')}">${SL('Shop our loose leaf teas', 'Nos thés en vrac')}</a> · <a href="${seoUrl('/pairings')}">${SL('Tea &amp; pastry pairings', 'Accords thé et pâtisserie')}</a></p>
        ${seoContactHtml(store)}
      </article>
    </noscript>`;
  return replaceNoscript(html, noscriptBlock);
}

/** Split out the hero's critical CSS that scripts/critical-home.mjs stores
 *  in the shell as inert text: only the home page uses it. */
function splitCriticalHomeCss(shell: string): { shell: string; css: string } {
  const re = /\s*<script type="text\/plain" id="critical-home-css">([\s\S]*?)<\/script>/;
  const m = shell.match(re);
  return m
    ? { shell: shell.replace(re, ''), css: m[1].replace(/<\\\//g, '</') }
    : { shell, css: '' };
}

function patchHeadForHome(template: string, teas: TeaSummary[], criticalCss = ''): string {
  const store = SEO_STORE;
  const faq = buildHomeFaq(store, SEO_LANG);
  const desc = seoClamp(homeDescription(teas.length, store, SEO_LANG));

  const catLinks = Object.keys(SEO_CATEGORY_LABELS)
    .map((id) => {
      const n = teas.filter((t) => t.category === id).length;
      if (!n) return '';
      return `<li><a href="${seoUrl(`/products/${id}`)}">${seoEscHtml(seoCatLabel(id))}</a> (${n})</li>`;
    })
    .filter(Boolean)
    .join('\n          ');
  const collLinks = SEO_COLLECTIONS.filter((c) => teas.some(c.match))
    .map(
      (c) =>
        `<li><a href="${seoUrl(`/collections/${c.slug}`)}">${seoEscHtml(seoCollTitle(c))}</a></li>`,
    )
    .join('\n          ');
  const faqHtml = faq
    .map((f) => `<dt>${seoEscHtml(f.q)}</dt><dd>${seoEscHtml(f.a)}</dd>`)
    .join('\n          ');

  let html = patchTemplateHead(template, {
    title: SL(HOME_TITLE, HOME_TITLE_FR),
    description: desc,
    canonical: seoUrl('/'),
    ogType: 'website',
    ogImage: SEO_DEFAULT_OG,
    extraOgMeta: [],
    extraJsonLd: [faqJsonLd(faq)],
  });
  // The hero line quotes the tea count; handing it over in the HTML lets
  // the app paint its final text at once (it's the mobile LCP element)
  // instead of re-rendering when the Firestore count arrives.
  if (teas.length) {
    html = html.replace(
      /(\s*)<\/head>/,
      `\n    <meta name="ele:tea-count" content="${teas.length}" />$1</head>`,
    );
  }
  // The hero itself, in the app's own markup (lib/homeHero.ts): phones paint
  // it — the LCP element — before the JavaScript loads; React then swaps in
  // identical DOM. Wrapped like AppShell → main → .hp-page so nothing moves.
  const hero = homeHeroHtml({
    lang: SEO_LANG,
    teaCount: teas.length,
    giftOn: store.giftBuilderEnabled,
    street: addressLines(store.address)[0] ?? '',
    mapsUrl: store.mapsUrl,
    base: seoFr() ? '/fr' : '',
  });
  // The shell loads its stylesheets asynchronously. The hero's own rules
  // (scripts/critical-home.mjs) go inline so it's drawn in its final layout
  // straight away — placed BEFORE the main stylesheet, which still wins
  // every tie once it loads. Without them the hero would wait for the full
  // CSS (display:none), which is the slower fallback.
  html = criticalCss
    ? html.replace(
        /<link rel="preload" as="style"[^>]*href="\/assets\/index-[^"]+\.css"[^>]*>/,
        (link) => `<style id="critical-home">${criticalCss}</style>\n    ${link}`,
      )
    : html.replace(
        /(\s*)<\/head>/,
        '\n    <style>#root>.min-h-screen{display:none}</style>$1</head>',
      );
  html = html.replace(
    '<div id="root"></div>',
    () =>
      `<div id="root"><div class="min-h-screen flex flex-col"><main id="main-content" class="flex-1"><div class="hp-page">${hero}</div></main></div></div>`,
  );

  const noscriptBlock = `
    <noscript>
      <article class="seo-fallback">
        <header>
          <h1>${seoEscHtml(store.name)} — ${SL('Premium Loose Leaf Tea, Vancouver', 'Thé en vrac haut de gamme, Vancouver')}</h1>
          <p>${SL(
            `${teas.length ? `${teas.length} loose leaf teas` : 'Loose leaf teas'} — black, green, white, oolong, rooibos, herbal, flower and fruit tea${teas.some((t) => t.category === 'powder') ? ', plus matcha and hojicha powder' : ''} — shipped across Canada or ready for free pickup in Vancouver.`,
            `${teas.length ? `${teas.length} thés en vrac` : 'Thés en vrac'} — noir, vert, blanc, oolong, rooibos, tisanes, thés aux fleurs et aux fruits${teas.some((t) => t.category === 'powder') ? ', ainsi que matcha et hojicha en poudre' : ''} — expédiés partout au Canada ou prêts pour la cueillette gratuite à Vancouver.`,
          )} ${seoEscHtml(seoShipping(store))}</p>
          ${seoTasteLine(store)}
        </header>
        <section>
          <h2>${SL('Shop loose leaf tea by type', 'Magasinez le thé en vrac par type')}</h2>
          <ul>
          ${catLinks}
          </ul>
          <p><a href="${seoUrl('/products')}">${SL('All teas', 'Tous les thés')}</a> · <a href="${seoUrl('/cafe')}">${SL('Café menu: matcha lattes, tea &amp; croissants', 'Menu du café : lattes au matcha, thé et croissants')}</a></p>
        </section>
        ${(() => {
          // Featured teas (Admin → Products → Featured), else the most
          // reviewed — the homepage links straight to product pages.
          const picks = [
            ...teas.filter((t) => t.featured),
            ...teas
              .filter((t) => !t.featured)
              .sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0)),
          ]
            .filter((t) => t.available !== false)
            .slice(0, 8);
          return picks.length
            ? `<section>
          <h2>${SL('Featured teas', 'Thés en vedette')}</h2>
          ${teaListHtml(picks.map((t) => ({ name: t.name, slug: t.slug, category: t.category, price: t.price, description: t.description, available: t.available, nameFr: t.nameFr, descriptionFr: t.descriptionFr })))}
        </section>`
            : '';
        })()}
        ${
          collLinks
            ? `<section>
          <h2>${SL('Popular tea collections', 'Collections de thé populaires')}</h2>
          <ul>
          ${collLinks}
          </ul>
        </section>`
            : ''
        }
        <section>
          <h2>${SL('Tea shop FAQ', 'FAQ de la boutique de thé')}</h2>
          <dl>
          ${faqHtml}
          </dl>
        </section>
        ${seoContactHtml(store)}
      </article>
    </noscript>`;
  html = replaceNoscript(html, noscriptBlock);
  return html;
}

interface SeoHeadPatch {
  title: string;
  description: string;
  canonical: string;
  ogType: 'website' | 'product';
  ogImage: string;
  /** When set, emits a <link rel="preload" as="image"> for the LCP image —
   *  browser starts the image fetch on first byte of HTML, before JS
   *  parses. Real LCP improvement for image-led pages (tea profile). */
  preloadImage?: string;
  extraOgMeta: Array<[string, string]>;
  extraJsonLd: unknown[];
}

function patchTemplateHead(template: string, h: SeoHeadPatch): string {
  let out = template;
  const t = seoEscHtml(h.title);
  const d = seoEscHtml(h.description);
  const u = seoEscHtml(h.canonical);
  const im = seoEscHtml(h.ogImage);

  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${t}</title>`);
  // Language: <html lang>, og:locale, and hreflang links between the English
  // page and its /fr twin (every server-rendered page has both).
  const enUrl = h.canonical.replace(/^(https:\/\/[^/]+)\/fr(?=\/|$)/, '$1');
  const frUrl =
    enUrl === SEO_SITE_BASE
      ? `${SEO_SITE_BASE}/fr`
      : enUrl.replace(SEO_SITE_BASE, `${SEO_SITE_BASE}/fr`);
  out = out.replace(/<html lang="[^"]*"/i, `<html lang="${seoFr() ? 'fr-CA' : 'en-CA'}"`);
  out = out.replace(
    /<meta\s+property="og:locale"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:locale" content="${seoFr() ? 'fr_CA' : 'en_CA'}" />\n    <meta property="og:locale:alternate" content="${seoFr() ? 'en_CA' : 'fr_CA'}" />`,
  );
  const langLinks = [
    `<link rel="alternate" hreflang="en" href="${seoEscHtml(enUrl)}" />`,
    `<link rel="alternate" hreflang="fr" href="${seoEscHtml(frUrl)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${seoEscHtml(enUrl)}" />`,
    `<meta name="ele:lang" content="${SEO_LANG}" />`,
  ].join('\n    ');
  out = out.replace(/<\/title>/i, () => `</title>\n    ${langLinks}`);
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${d}" />`,
  );
  // The shell carries no canonical (it's served for every route), so add
  // one; older shells that still have one get it replaced.
  const canonicalTag = `<link rel="canonical" href="${u}" />`;
  const canonicalRe = /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i;
  out = canonicalRe.test(out)
    ? out.replace(canonicalRe, () => canonicalTag)
    : out.replace(/<\/title>/i, () => `</title>\n    ${canonicalTag}`);
  out = out.replace(
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:type" content="${h.ogType}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${t}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${d}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${u}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${im}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${t}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${d}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${im}" />`,
  );

  // Preload the LCP image — only when it's an actual product image
  // (not the default OG, which isn't displayed on the page anyway).
  const preloadBlock = h.preloadImage
    ? `\n    <!-- ── LCP preload: tea hero image ── -->\n    <link rel="preload" as="image" fetchpriority="high" href="${seoEscHtml(h.preloadImage)}" />\n`
    : '';

  // Inject route-specific OG meta + JSON-LD just before </head>
  const extraOgBlock = h.extraOgMeta.length
    ? '\n    <!-- ── Dynamic SEO: route-specific OG ── -->\n' +
      h.extraOgMeta
        .map(([k, v]) => `    <meta property="${seoEscHtml(k)}" content="${seoEscHtml(v)}" />`)
        .join('\n') +
      '\n'
    : '';
  // Every server-rendered page carries the café's LocalBusiness entity
  // (live address / phone / hours) that product offers point at by @id.
  const jsonLd = [localBusinessLd(SEO_STORE, SEO_SITE_BASE), ...h.extraJsonLd];
  const extraJsonBlock = jsonLd.length
    ? '\n    <!-- ── Dynamic SEO: route-specific JSON-LD ── -->\n' +
      jsonLd
        .map((j) => `    <script type="application/ld+json">${seoEmbedJson(j)}</script>`)
        .join('\n') +
      '\n'
    : '';

  out = out.replace(/(\s*)<\/head>/, `${preloadBlock}${extraOgBlock}${extraJsonBlock}$1</head>`);
  return out;
}

/** Express response as handed to onRequest handlers. */
type SeoResponse = import('express').Response;

/**
 * Firebase Hosting doesn't compress what a function returns, so pages from
 * renderSeo went out as ~28 KB of plain HTML. Brotli/gzip them here (~6 KB);
 * the CDN caches one copy per encoding (it already varies on
 * Accept-Encoding).
 */
function compressHtmlResponses(req: functions.https.Request, res: SeoResponse): void {
  const accept = String(req.headers['accept-encoding'] ?? '');
  const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
  res.vary('Accept-Encoding');
  if (!enc) return;
  const send = res.send.bind(res);
  res.send = ((body?: unknown) => {
    if (typeof body !== 'string' || body.length < 1024 || res.headersSent) return send(body);
    const buf =
      enc === 'br'
        ? zlib.brotliCompressSync(body, {
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
          })
        : zlib.gzipSync(body, { level: 6 });
    res.set('Content-Encoding', enc);
    if (!res.get('Content-Type')) res.set('Content-Type', 'text/html; charset=utf-8');
    return send(buf);
  }) as typeof res.send;
}

export const renderSeo = functions.https.onRequest(
  {
    region: 'us-central1',
    cors: false,
    // A full vCPU (billed only while a page is being built — well inside
    // the free tier at this traffic). At 256 MiB Cloud Run gives ~1/6 of a
    // CPU, which made a cold start take ~4 s.
    memory: '512MiB',
    cpu: 1,
    // minInstances=0 — cold starts add 500–1000 ms to the first
    // request after idle, but the Firebase Hosting CDN caches
    // responses for an hour (s-maxage=3600 in Cache-Control), so
    // only first-hits or cache-evicted URLs reach the function.
    // For a low-to-mid-traffic shop, the warm-instance cost
    // (~$5.50/month) outweighs the rare cold-start penalty.
    // Bump to 1 if Search Console flags slow indexing or social
    // link previews start timing out.
    minInstances: 0,
    // Allow a moderate burst — SEO traffic is bursty (Googlebot crawls
    // 20–50 URLs in a tight loop). 100 max is well below the regional
    // quota and prevents one crawler exhausting our concurrency.
    maxInstances: 100,
    concurrency: 80,
  },
  async (req, res) => {
    compressHtmlResponses(req, res);
    // Safety net: never leave a visitor or crawler waiting. If a page
    // can't be built within 9 s (e.g. a slow cold start), serve the
    // plain app shell right away — the SPA still renders the page — and
    // don't let the CDN cache that fallback.
    const guard = setTimeout(() => {
      if (res.headersSent) return;
      console.warn(`renderSeo: ${req.path} took >9s — serving the app shell`);
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      res.status(200).send(seoTemplateCache?.html ?? SEO_FALLBACK_TEMPLATE);
    }, 9000);
    try {
      await renderSeoHandler(req, res);
    } catch (err) {
      if (!res.headersSent) throw err;
      console.warn(
        'renderSeo: finished after the fallback was sent',
        err instanceof Error ? err.message : err,
      );
    } finally {
      clearTimeout(guard);
    }
  },
);

async function renderSeoHandler(req: functions.https.Request, res: SeoResponse): Promise<void> {
  {
    await refreshSeoSettings();
    // /fr/… is the French version of the same page.
    const rawPath = req.path || '/';
    const lang: SeoLang = rawPath === '/fr' || rawPath.startsWith('/fr/') ? 'fr' : 'en';
    const reqPath = lang === 'fr' ? rawPath.slice(3) || '/' : rawPath;
    // Run a (synchronous) page builder in this request's language.
    const render = <A extends unknown[]>(fn: (...args: A) => string, ...args: A): string =>
      withSeoLang(lang, () => fn(...args));

    // getSeoTemplate always returns something — either the cached/fresh
    // SPA shell or the embedded fallback. We can't 503 here.
    const { shell: template, css: criticalHomeCss } = splitCriticalHomeCss(await getSeoTemplate());

    // Homepage
    if (reqPath === '/' || reqPath === '/index.html') {
      try {
        const html = render(
          patchHeadForHome,
          template,
          await fetchActiveTeaSummaries(),
          criticalHomeCss,
        );
        res.set('Content-Type', 'text/html; charset=utf-8');
        // Browser always revalidates (new deploys must reach users at
        // once); the CDN keeps it 10 min, then serves stale while it
        // refreshes — a settings or catalog change shows within minutes.
        res.set('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
        res.status(200).send(html);
        return;
      } catch (err) {
        console.error('renderSeo: homepage render failed', err);
      }
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=0, s-maxage=60');
      res.status(200).send(template);
      return;
    }

    // /pairings — the pairings index (individual pairings are below).
    if (reqPath === '/pairings' || reqPath === '/pairings/') {
      try {
        const html = render(patchHeadForPairings, template, await fetchCafeCombos());
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
        res.status(200).send(html);
        return;
      } catch (err) {
        console.error('renderSeo: pairings render failed', err);
      }
    }

    // /about and /contact — facts from Admin → Settings.
    if (
      reqPath === '/about' ||
      reqPath === '/about/' ||
      reqPath === '/contact' ||
      reqPath === '/contact/'
    ) {
      const html = reqPath.startsWith('/about')
        ? render(patchHeadForAbout, template)
        : render(patchHeadForContact, template);
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
      res.status(200).send(html);
      return;
    }

    // /franchise — franchise inquiries.
    if (reqPath === '/franchise' || reqPath === '/franchise/') {
      const html = render(patchHeadForFranchise, template);
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
      res.status(200).send(html);
      return;
    }

    // /rewards — Ele Rewards loyalty program.
    if (reqPath === '/rewards' || reqPath === '/rewards/') {
      const html = render(patchHeadForRewards, template);
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
      res.status(200).send(html);
      return;
    }

    // /cafe — in-store café menu (drinks + live pastry combos).
    if (reqPath === '/cafe' || reqPath === '/cafe/') {
      try {
        const html = render(patchHeadForCafe, template, await fetchCafeCombos());
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
        res.status(200).send(html);
        return;
      } catch (err) {
        console.error('renderSeo: cafe render failed', err);
      }
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=0, s-maxage=60');
      res.status(200).send(template);
      return;
    }

    // Match /tea-profile/{category}/{slug}
    const teaMatch = reqPath.match(/^\/tea-profile\/([^/]+)\/([^/]+)\/?$/);
    if (teaMatch) {
      const [, , slug] = teaMatch;
      try {
        const snap = await db.collection('teas').where('slug', '==', slug).limit(1).get();
        if (!snap.empty) {
          const data = snap.docs[0].data() as TeaSeoFields;
          if (data.isActive !== false && data.slug && data.category) {
            let catalog: CatalogTea[] = [];
            try {
              catalog = await fetchCatalogForSeo();
            } catch {
              /* related teas are optional */
            }
            const docId = snap.docs[0].id;
            let reviews: SeoReview[] = [];
            try {
              reviews = await fetchSeoReviews(docId);
            } catch {
              /* reviews are optional */
            }
            const html = render(patchHeadForTea, template, data, catalog, {
              id: docId,
              doc: snap.docs[0].data(),
              reviews,
            });
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.set(
              'Cache-Control',
              'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
            );
            res.status(200).send(html);
            return;
          }
        }
      } catch (err) {
        console.error('renderSeo: tea fetch failed', err);
      }
      // Tea not found / inactive — return plain template, SPA handles 404.
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=60');
      res.status(200).send(template);
      return;
    }

    // /products — the whole catalog, grouped by category.
    if (reqPath === '/products' || reqPath === '/products/') {
      try {
        const html = render(patchHeadForProducts, template, await fetchCatalogForSeo());
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set(
          'Cache-Control',
          'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
        );
        res.status(200).send(html);
        return;
      } catch (err) {
        console.error('renderSeo: products render failed', err);
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=60');
        res.status(200).send(template);
        return;
      }
    }

    // Match /products/{category}
    const catMatch = reqPath.match(/^\/products\/([^/]+)\/?$/);
    if (catMatch) {
      const [, catId] = catMatch;
      if (SEO_CATEGORY_LABELS[catId]) {
        let catalog: CatalogTea[] = [];
        try {
          catalog = await fetchCatalogForSeo();
        } catch (err) {
          console.warn('renderSeo: catalog fetch failed', err);
        }
        const html = render(patchHeadForCategory, template, catId, catalog);
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set(
          'Cache-Control',
          'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
        );
        res.status(200).send(html);
        return;
      }
      // Unknown category — return plain template, SPA handles routing.
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=60');
      res.status(200).send(template);
      return;
    }

    // Match /collections/{slug} — programmatic SEO landing pages
    const collMatch = reqPath.match(/^\/collections\/([^/]+)\/?$/);
    if (collMatch) {
      const [, collSlug] = collMatch;
      const def = SEO_COLLECTION_BY_SLUG[collSlug];
      if (def) {
        try {
          const teas = await buildCollectionData(def);
          const html = render(patchHeadForCollection, template, def, teas);
          res.set('Content-Type', 'text/html; charset=utf-8');
          res.set(
            'Cache-Control',
            'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
          );
          res.status(200).send(html);
          return;
        } catch (err) {
          console.error('renderSeo: collection fetch failed', err);
          // Fall through to plain template; SPA will still render the
          // collection from its own Firestore reads.
        }
      }
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=60');
      res.status(200).send(template);
      return;
    }

    // Match /pairings/{slug} — combo landing page for IG/social shares.
    // The whole point of this page is the per-combo OG card, so a
    // failure to look up the combo is worth logging as an error
    // (not a warn) — IG would otherwise show a generic site card.
    const pairMatch = reqPath.match(/^\/pairings\/([^/]+)\/?$/);
    if (pairMatch) {
      const [, pairSlug] = pairMatch;
      try {
        const combo = await fetchComboBySlug(pairSlug);
        if (combo) {
          const html = render(patchHeadForPairing, template, combo);
          res.set('Content-Type', 'text/html; charset=utf-8');
          res.set(
            'Cache-Control',
            'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
          );
          res.status(200).send(html);
          return;
        }
      } catch (err) {
        console.error('renderSeo: pairing fetch failed', err);
      }
      // Combo not found — SPA renders the "pairing not found" UI.
      // Short cache so admin fixes (e.g. adding a missing slug)
      // appear quickly.
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=60');
      res.status(200).send(template);
      return;
    }

    // Path that shouldn't have hit this function — return plain template.
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=60');
    res.status(200).send(template);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// onTeaWrite — Operations: ping search engines on catalog changes
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Firestore-triggered function that fires whenever a tea is created,
 * updated, or deleted. It pings Google + Bing's sitemap-resubmit
 * endpoints so search engines re-crawl the sitemap and pick up the
 * change faster than waiting for their normal recrawl cadence.
 *
 * This is the "operations" layer of dynamic SEO — without it, a new
 * tea added by admin would only get discovered when Google's normal
 * crawl rotation revisits the sitemap (typically days). With it, the
 * crawl is requested immediately.
 *
 * Implementation notes:
 * • Both Google and Bing's "ping" endpoints are unauthenticated GET
 *   requests; they don't require any setup or API key. They return
 *   200 on success, but search engines treat them as advisory — no
 *   guarantee Google will crawl immediately.
 * • Fire-and-forget. We don't await the responses; the trigger
 *   completes regardless. If a ping fails, we log it but don't
 *   retry — search engines will pick up the change on their next
 *   normal crawl anyway.
 * • Skip pings on field-level changes that don't affect SEO (avgRating,
 *   ratingCount only). Those are bumped frequently by review writes
 *   and don't warrant a recrawl.
 *
 * Note on Google's deprecation:
 *   Google deprecated the /ping endpoint in 2023 — it returns 404 now.
 *   We keep the call but only log the failure. Bing and Yandex still
 *   support pinging. The real long-term play is using Google Search
 *   Console's URL Inspection API for per-URL submission, but that
 *   requires OAuth credentials owned by the site operator — out of
 *   scope for a Cloud Function. For a small-shop catalog, Bing ping
 *   plus Google's normal sitemap recrawl is sufficient.
 */
const SEO_SITEMAP_URL = `${SEO_SITE_BASE}/sitemap.xml`;

function diffIsSeoRelevant(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): boolean {
  // Created or deleted — always relevant.
  if (!before || !after) return true;
  // Fields that affect SEO output (sitemap entries + renderSeo HTML).
  const seoFields = ['slug', 'name', 'category', 'description', 'price', 'image', 'isActive'];
  for (const f of seoFields) {
    if (before[f] !== after[f]) return true;
  }
  return false;
}

async function pingSitemapEndpoint(url: string): Promise<void> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    console.log(`onTeaWrite: ${url} → ${res.status}`);
  } catch (err) {
    console.warn(`onTeaWrite: ping failed for ${url}`, err);
  }
}

export const onTeaWrite = functionsV1.firestore
  .document('teas/{slug}')
  .onWrite(async (change, _context) => {
    const before = change.before.exists ? (change.before.data() ?? null) : null;
    const after = change.after.exists ? (change.after.data() ?? null) : null;

    if (!diffIsSeoRelevant(before, after)) {
      console.log('onTeaWrite: skipping ping — SEO-irrelevant change');
      return;
    }

    // Fire pings in parallel; don't await.
    await Promise.allSettled([
      // Bing — still active.
      pingSitemapEndpoint(
        `https://www.bing.com/ping?sitemap=${encodeURIComponent(SEO_SITEMAP_URL)}`,
      ),
      // Google — deprecated but harmless to call. Logged on 404.
      pingSitemapEndpoint(
        `https://www.google.com/ping?sitemap=${encodeURIComponent(SEO_SITEMAP_URL)}`,
      ),
    ]);
  });

// ─────────────────────────────────────────────────────────────────────────────
// seoHealth — operational health check for the SEO pipeline
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Lightweight HTTP endpoint that verifies the SEO infrastructure is
 * working end-to-end. Hit by external uptime monitors (UptimeRobot,
 * Pingdom, BetterStack, or `firebase-tools` in CI) to detect:
 *
 * • Firestore unreachable / quota exceeded
 * • Template fetch from Hosting failing (cold-start fallback engaged)
 * • Catalog accidentally empty (deploy regression that wiped /teas)
 *
 * Returns:
 *   200 + JSON  on healthy
 *   503 + JSON  on any check failure (so monitors alert)
 *
 * Mounted at `/_health/seo` via firebase.json. Not in the sitemap, not
 * indexable — robots.txt should disallow if needed (already does via
 * the existing /admin and /account disallow patterns? No — add
 * explicitly if monitoring exposes the URL publicly).
 */
export const seoHealth = functions.https.onRequest(
  {
    region: 'us-central1',
    cors: false,
    memory: '128MiB',
    minInstances: 0,
    maxInstances: 5,
  },
  async (_req, res) => {
    const started = Date.now();
    const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

    // 1. Firestore /teas count
    const t0 = Date.now();
    try {
      const snap = await db.collection('teas').where('isActive', '!=', false).limit(10).get();
      checks.firestore = { ok: snap.size > 0, ms: Date.now() - t0 };
      if (snap.size === 0) checks.firestore.error = 'catalog is empty';
    } catch (err) {
      checks.firestore = { ok: false, ms: Date.now() - t0, error: String(err) };
    }

    // 2. Template fetch from Hosting (renderSeo's hard dependency)
    const t1 = Date.now();
    try {
      const html = await getSeoTemplate();
      checks.template = {
        ok: html.length > 1000 && html.includes('<title>') && html.includes('</head>'),
        ms: Date.now() - t1,
      };
      if (!checks.template.ok) checks.template.error = 'template missing required tags';
    } catch (err) {
      checks.template = { ok: false, ms: Date.now() - t1, error: String(err) };
    }

    // 3. Sitemap renders (run a sample build to verify the function works)
    const t2 = Date.now();
    try {
      const xml = buildSitemapXml([], [], new Date().toISOString().slice(0, 10));
      checks.sitemap = {
        ok: xml.length > 500 && xml.includes('<urlset'),
        ms: Date.now() - t2,
      };
    } catch (err) {
      checks.sitemap = { ok: false, ms: Date.now() - t2, error: String(err) };
    }

    const allOk = Object.values(checks).every((c) => c.ok);
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.status(allOk ? 200 : 503).send(
      JSON.stringify(
        {
          status: allOk ? 'ok' : 'degraded',
          timestamp: new Date().toISOString(),
          duration_ms: Date.now() - started,
          checks,
        },
        null,
        2,
      ),
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// recordRum — RUM (real-user monitoring) beacon receiver
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Receives Web Vitals beacons from src/lib/rum.ts. Phase 0.1 of the UI/UX
 * roadmap. Writes to /rum/{auto-id}; the rumCleanup scheduler below
 * trims docs older than 90 days nightly.
 *
 * Wire to /api/rum via firebase.json rewrite:
 *   { "source": "/api/rum", "function": "recordRum" }
 *
 * Volume model:
 *   ~5 metrics × ~10 page views × N daily users. At 1 000 DAU that's
 *   50 000 writes/day — the edge of Firestore's free tier. If you cross
 *   it, swap the write target to BigQuery via a Pub/Sub fanout. The
 *   schema below is BigQuery-friendly (flat top-level fields, JSON for
 *   nested net info).
 *
 * Anti-abuse:
 *   - Body size cap (32 KB — beacons are ~1 KB; anything bigger is
 *     malicious or buggy).
 *   - Origin check (only this app's domain may write).
 *   - No auth requirement — RUM by design fires on every page load,
 *     including pre-signin. The Firestore rule (in firestore.rules)
 *     denies all client reads from /rum so the data is admin-only.
 */
export const recordRum = functions.https.onRequest(
  {
    region: 'us-central1',
    cors: true,
    /* 128 MiB was exceeded continuously (instance restarts + 500s). */
    memory: '256MiB',
    /* Beacons are sent with navigator.sendBeacon (fire-and-forget), so a
     * cold start never delays a visitor — no always-on instance needed. */
    minInstances: 0,
    maxInstances: 50,
    /* Avoid log spam: the function is called extremely frequently. */
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }
    // Body-size cap — drop oversized payloads early. Express has already
    // parsed the body, so this is a defense against future regressions
    // (someone adds a giant attribution field).
    const raw = JSON.stringify(req.body ?? {});
    if (raw.length > 32_000) {
      res.status(413).send('Payload too large');
      return;
    }

    // Validate the shape — anything else is dropped silently. Returning
    // 200 even for malformed payloads is intentional: the client never
    // retries based on RUM responses, so 4xx vs 200 has no effect on
    // them but does cost us a wasted retry slot in the browser.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name : null;
    const value = typeof body.value === 'number' ? body.value : null;
    const route = typeof body.route === 'string' ? body.route.slice(0, 120) : '';
    const sid = typeof body.sid === 'string' ? body.sid.slice(0, 64) : '';
    const id = typeof body.id === 'string' ? body.id.slice(0, 64) : '';

    if (!name || value === null || !sid) {
      res.status(204).send('');
      return;
    }
    // Whitelist metric names — defends against arbitrary metric injection
    // (someone could otherwise spam '/api/rum' with thousands of distinct
    // metric names and explode the dashboard).
    //
    // Phase 8.7.2 improvement: LONGTASK was added when the client-side
    // long-task observer was wired (src/lib/rum.ts). Each long task >50ms
    // is reported as a separate beacon to let the dashboard answer
    // "which sync task is regressing our INP." Per-session capped at 50.
    //
    // Phase 13: PAIRING_VIEW added so the admin dashboard can rank
    // /pairings/{slug} traffic. The same `value` field is unused for
    // this event (the client sends `1` as a placeholder); the dashboard
    // counts beacons by `route`.
    const ALLOWED = new Set(['CLS', 'INP', 'LCP', 'FCP', 'TTFB', 'LONGTASK', 'PAIRING_VIEW']);
    if (!ALLOWED.has(name)) {
      res.status(204).send('');
      return;
    }
    // Sanity-bound the value — anything wildly out of range is buggy data.
    // CLS shouldn't exceed 5; LCP/INP/FCP/TTFB shouldn't exceed 5 minutes.
    const max = name === 'CLS' ? 50 : 5 * 60 * 1000;
    if (value < 0 || value > max) {
      res.status(204).send('');
      return;
    }

    // ──── Phase 22 — per-IP rate limit ────────────────────────────────────
    //
    // The endpoint is public by design (it must accept beacons from
    // pre-signin sessions — App Check would block legitimate traffic).
    // All the validation above (size, shape, allowlist, value bounds)
    // defends against payload abuse but doesn't stop a motivated
    // attacker from hammering us with 10K valid-looking beacons per
    // second to inflate Firestore writes ($0.18 per 100K writes past
    // the free tier).
    //
    // Cap: 100 beacons per IP per rolling minute. Real users send
    // ~5–15 beacons per page nav, so 100/min is roughly 6–20 active
    // pages per minute from one IP — well above any legit user pattern
    // even with multiple browser tabs.
    //
    // Strategy: hash IP → SHA-256 → 24-char bucket key (matches the
    // `validateInventoryAccessCode` pattern in inventory.ts). We never
    // store raw IPs. The bucket doc carries `expiresAt` so Firestore TTL
    // policy can auto-clean stale buckets — one-time setup: enable TTL
    // on the `rum_rate_buckets` collection pointing at `expiresAt`.
    //
    // Cost: legit traffic pays +1 read + +1 write per beacon (bucket
    // increment). For ~50K legit beacons/day that's ~$0.05/month
    // extra — negligible. Abusive traffic gets dropped at the bucket
    // check and never touches the /rum collection.
    const RATE_LIMIT_MAX = 100; // beacons per IP per window
    const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute rolling
    const rawIp =
      req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 'unknown';
    const ipHash = crypto.createHash('sha256').update(rawIp).digest('hex').slice(0, 24);
    const bucketRef = db.collection('rum_rate_buckets').doc(ipHash);
    const nowMs = Date.now();
    try {
      const bucketSnap = await bucketRef.get();
      const bucketData = bucketSnap.exists
        ? (bucketSnap.data() as { count?: number; windowStartedAt?: number })
        : {};
      const count = bucketData.count ?? 0;
      const startedAt = bucketData.windowStartedAt ?? nowMs;
      const windowFresh = nowMs - startedAt < RATE_LIMIT_WINDOW_MS;

      if (windowFresh && count >= RATE_LIMIT_MAX) {
        // Over the limit — drop silently. 204 (not 429) on purpose:
        // a 429 would tell the attacker the limit's identity and let
        // them tune timing. 204 looks identical to a malformed-payload
        // drop.
        res.status(204).send('');
        return;
      }

      // Increment counter. Use FieldValue.increment so concurrent
      // beacons can't both read count=99 and both increment to 100
      // (which would let one extra through). New window resets fresh.
      if (bucketSnap.exists && windowFresh) {
        await bucketRef.update({
          count: admin.firestore.FieldValue.increment(1),
          expiresAt: admin.firestore.Timestamp.fromMillis(startedAt + RATE_LIMIT_WINDOW_MS),
        });
      } else {
        await bucketRef.set({
          count: 1,
          windowStartedAt: nowMs,
          expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + RATE_LIMIT_WINDOW_MS),
        });
      }
    } catch (err) {
      // Bucket failure is non-fatal — if Firestore is degraded, we'd
      // rather still accept the beacon than block legit telemetry.
      // The bucket is a defensive layer, not the primary control.
      console.warn('[recordRum] rate-limit bucket failed:', err);
    }
    // ──────────────────────────────────────────────────────────────────────

    try {
      await db.collection('rum').add({
        name,
        value,
        rating: typeof body.rating === 'string' ? body.rating : null,
        delta: typeof body.delta === 'number' ? body.delta : null,
        beaconId: id,
        navType: typeof body.navType === 'string' ? body.navType : null,
        route,
        sid,
        net: typeof body.net === 'object' && body.net !== null ? body.net : null,
        mem: typeof body.mem === 'number' ? body.mem : null,
        rmotion: typeof body.rmotion === 'boolean' ? body.rmotion : null,
        release: typeof body.release === 'string' ? body.release.slice(0, 32) : null,
        // Phase 8 improvement — store the attribution object when the
        // client included it (LCP element, INP target, CLS shift source).
        // Capped at 1KB serialized to bound write size; the client
        // already truncates each string field.
        attr:
          typeof body.attr === 'object' &&
          body.attr !== null &&
          JSON.stringify(body.attr).length <= 1024
            ? body.attr
            : null,
        // Server-side enrichments — useful for slicing without trusting
        // the client to send them honestly.
        ua: (req.headers['user-agent'] || '').toString().slice(0, 200),
        country:
          (req.headers['x-country-code'] || req.headers['x-appengine-country'] || '')
            .toString()
            .slice(0, 2) || null,
        ts: FS.serverTimestamp(),
      });
    } catch (err) {
      // Don't 500 — that triggers the browser's beacon retry which we
      // don't want on a fire-and-forget channel. Just log and ack.
      console.warn('[recordRum] write failed:', err);
    }

    res.status(204).send('');
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// rumCleanup — daily TTL trimming for /rum docs older than 90 days
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Phase 0.1 of the UI/UX roadmap. RUM volume grows fast — 50 K docs/day
 * at 1 K DAU. 90 days × 50 K = 4.5 M docs, which is fine for Firestore
 * but starts to cost on storage. Trim aggressively; the value of RUM is
 * the trend, not historical archives.
 */
export const rumCleanup = functions.scheduler.onSchedule(
  {
    region: 'us-central1',
    schedule: 'every day 03:00',
    timeZone: 'America/Los_Angeles',
    retryCount: 1,
  },
  async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 90 * 24 * 60 * 60 * 1000);
    let totalDeleted = 0;

    // Loop with a small page size — Firestore deletes one batch at a
    // time. 500 is the batched-write maximum.
    while (totalDeleted < 50_000) {
      const snap = await db.collection('rum').where('ts', '<', cutoff).limit(500).get();
      if (snap.empty) break;

      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      totalDeleted += snap.size;
    }

    if (totalDeleted > 0) {
      console.log(`[rumCleanup] trimmed ${totalDeleted} docs older than 90 days`);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// testLogin — Playwright auth fixture mint
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Phase 0.4 of the UI/UX roadmap. Mints a Firebase custom token for a
 * known test user so Playwright can drive an authenticated browser
 * session in CI. Without this, the visual + a11y suites can't cover
 * /checkout, /orders, /account, or any /admin/* route.
 *
 * Security model:
 *   This function is GATED IN MULTIPLE LAYERS:
 *   1. The function only mints when ALLOW_TEST_LOGIN env is the literal
 *      string '1'. This is a Cloud Functions environment variable set
 *      via `firebase functions:config:set` and only present on the test
 *      Firebase project.
 *   2. Even when allowed, the only UIDs it will mint for are
 *      explicitly whitelisted below. A real customer UID can never be
 *      auth-impersonated through this endpoint.
 *   3. The `admin: true` claim is only added for the explicit
 *      ADMIN_UID; the customer UID gets no privileged claims.
 *
 *   Deployment guidance:
 *     • Production Firebase project: do NOT set ALLOW_TEST_LOGIN.
 *       This function will return 403 on every call.
 *     • Test Firebase project: set ALLOW_TEST_LOGIN=1 + provision the
 *       two test UIDs as real auth users via the Console (or the
 *       admin SDK in a one-off seed script).
 *
 * If you forget to gate it, anyone on the internet could mint admin
 * tokens for the test UIDs. For the test project that's an annoyance;
 * for the production project that's catastrophic. The triple gate
 * (env flag + UID whitelist + claim whitelist) makes "leaking
 * production access via a misconfigured deploy" require all three
 * mistakes simultaneously.
 */
export const testLogin = functions.https.onRequest(
  {
    region: 'us-central1',
    cors: true,
    memory: '128MiB',
    minInstances: 0,
    maxInstances: 3,
  },
  async (req, res) => {
    // Gate 0 — never on the production project, whatever the env says.
    // This endpoint mints sign-in tokens; one stray env flag must not be
    // able to open it on the live store.
    const projectId =
      process.env.GCLOUD_PROJECT ??
      process.env.GCP_PROJECT ??
      JSON.parse(process.env.FIREBASE_CONFIG ?? '{}').projectId;
    if (projectId === 'ele-cafe-d7237') {
      res.status(403).send('Disabled');
      return;
    }
    // Gate 1 — env flag must be set.
    if (process.env.ALLOW_TEST_LOGIN !== '1') {
      res.status(403).send('Disabled');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Gate 2 — UID must be whitelisted. Anything else, 403.
    // These are the FIXED UIDs Playwright signs in as. They must be
    // pre-provisioned in Firebase Auth on the test project.
    const TEST_USER_UID = 'playwright-test-user';
    const TEST_ADMIN_UID = 'playwright-test-admin';
    const ALLOWED_UIDS = new Set([TEST_USER_UID, TEST_ADMIN_UID]);

    const uid = (req.query.uid ?? req.body?.uid) as string | undefined;
    if (!uid || !ALLOWED_UIDS.has(uid)) {
      res.status(403).send('UID not whitelisted');
      return;
    }

    // Gate 3 — only the admin test UID gets the admin claim.
    const claims: Record<string, unknown> = {};
    if (uid === TEST_ADMIN_UID) claims.admin = true;

    try {
      const token = await auth.createCustomToken(uid, claims);
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', 'text/plain');
      res.status(200).send(token);
    } catch (err) {
      console.error('[testLogin] mint failed:', err);
      res.status(500).send('Mint failed');
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 0.7.2 — RUM-driven Slack alert (P75 INP > 250ms / LCP > 2500ms).
// Implementation lives in ./rumAlerts.ts to keep this file under 5K lines.
// Activation: `firebase functions:secrets:set SLACK_WEBHOOK_URL`
// ─────────────────────────────────────────────────────────────────────────────
export { rumAlertHourly } from './rumAlerts';

// Automatic English → French for admin-entered content (see translate.ts).
export {
  autoTranslateTea,
  autoTranslatePairing,
  autoTranslateCategory,
  autoTranslateSettings,
  autoTranslatePromotion,
  translateToFrench,
} from './translate';

// Promotions, new-arrival and cart-reminder notifications (see marketing.ts).
export { onPromotionWrite, notifyPromotion, onTeaPublished, marketingTick } from './marketing';

// Small WebP copies of tea / pairing photos (see imageVariants.ts).
export { teaImageVariants, pairingImageVariants, imageVariantsSweep } from './imageVariants';

// "Verified purchase" on tea reviews (see reviews.ts).
export { onReviewWrite } from './reviews';

// One-click unsubscribe for marketing email (see unsubscribe.ts).
export { unsubscribe } from './unsubscribe';

// ─────────────────────────────────────────────────────────────────────────────
// backfillTeaWeights — Admin callable for one-shot migration
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Iterates every /teas doc and writes weightGrams=100 to any tea
 * that's missing it. Safe to run multiple times — idempotent (skips
 * docs that already have the field).
 *
 * Why a callable instead of a trigger:
 *   - Triggers (onTeaWrite) firing on every doc write to set a
 *     default risks write loops if the trigger condition isn't
 *     tightened correctly. A one-shot callable is auditable, runs
 *     under explicit admin intent, and stops cleanly.
 *   - The client-side resolveWeightGrams() helper already returns 100
 *     when the field is missing, so the storefront renders correctly
 *     even before this runs. Backfill is hygiene, not correctness.
 *
 * Migration legacy "weight" strings: if the doc has a legacy
 * weight field (e.g. "100g", "50") and no weightGrams, the callable
 * parses the string and stores the parsed numeric value. Falls back
 * to 100 if the string is unparseable.
 *
 * Returns:
 *   { scanned: number, updated: number, skipped: number }
 *
 * Idempotent because:
 *   - Skips docs that already have a numeric weightGrams > 0.
 *   - Re-running on a fully-backfilled collection touches no docs.
 */
function parseLegacyWeightString(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(g|gram|grams|kg|kilogram|kilograms|oz|lb)?$/);
  if (!match) return null;
  const n = parseFloat(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = match[2] ?? 'g';
  if (unit === 'kg' || unit === 'kilogram' || unit === 'kilograms') return n * 1000;
  if (unit === 'oz') return Math.round(n * 28.3495);
  if (unit === 'lb') return Math.round(n * 453.592);
  return n;
}

export const backfillTeaWeights = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: true, timeoutSeconds: 300 },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only.');
    }

    const teasSnap = await admin.firestore().collection('teas').get();
    let scanned = 0;
    let updated = 0;
    let skipped = 0;

    // Batch writes for efficiency. Firestore caps batches at 500
    // operations; for a small catalog this is one batch, but the
    // chunking pattern is here in case the collection grows.
    const BATCH_SIZE = 400;
    let batch = admin.firestore().batch();
    let opsInBatch = 0;

    for (const doc of teasSnap.docs) {
      scanned++;
      const data = doc.data() as { weightGrams?: unknown; weight?: unknown };

      // Skip docs that already have a valid numeric weightGrams.
      if (typeof data.weightGrams === 'number' && data.weightGrams > 0) {
        skipped++;
        continue;
      }

      // Derive a sensible value: parse legacy `weight` string first,
      // fall back to the shop's standard 90g bag.
      const parsed = parseLegacyWeightString(data.weight);
      const grams = parsed && parsed > 0 ? Math.round(parsed) : 90;

      batch.update(doc.ref, {
        weightGrams: grams,
        // Mark when the field was added so the audit trail is
        // explicit — useful if you ever need to ask "when did we
        // gain this column?"
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      updated++;
      opsInBatch++;

      if (opsInBatch >= BATCH_SIZE) {
        await batch.commit();
        batch = admin.firestore().batch();
        opsInBatch = 0;
      }
    }

    if (opsInBatch > 0) await batch.commit();

    console.log(`[backfillTeaWeights] scanned=${scanned} updated=${updated} skipped=${skipped}`);
    return { scanned, updated, skipped };
  },
);
