/**
 * marketing.ts — the three opt-out notification kinds from Account →
 * Notifications that aren't tied to an order:
 *
 *   promotions  → a promotion goes live (auto when "Email customers" is
 *                 ticked on the promotion, or the admin's "Notify
 *                 customers" button → announcePromotion callable)
 *   newArrivals → a new tea is published (queued, sent as one digest by
 *                 the hourly tick so adding 5 teas ≠ 5 emails)
 *   reminders   → items left in the cart for 24–72 h (hourly tick, at
 *                 most one reminder per customer per week)
 *
 * Each recipient gets an email (in their site language, users/{uid}.lang),
 * an in-app bell entry and a push. Recipients are filtered through
 * userAcceptsCategory, so the Account toggles are honoured on every send.
 */
import * as functions from 'firebase-functions/v2';
import * as admin from './lib/admin';
import { userAcceptsCategory, type NotificationCategory } from './lib/notificationPrefs';
import { sendPushToUser } from './lib/push';
import { isInventoryEmail } from './lib/inventoryAccount';
import { unsubscribeHeaders, unsubscribeToken, unsubscribeUrl } from './unsubscribe';
import { translateBatchToFrench } from './translate';
import { runWatchdog } from './watchdog';
import {
  renderEmail,
  emailBrandFrom,
  emailLang,
  L,
  p,
  strong,
  code,
  button,
  image,
  note,
  esc,
  itemsTable,
  type EmailBrand,
  type EmailLang,
} from './lib/emailLayout';

const REGION = 'us-central1';
const FROM = 'Ele Café <news@elecafe.ca>';
const SITE = 'https://elecafe.ca';
const db = () => admin.firestore();
const FS = admin.firestore.FieldValue;

// ── Shared plumbing ─────────────────────────────────────────────────────────

interface Recipient {
  uid: string;
  email: string;
  lang: EmailLang;
  firstName: string;
  /** Personal one-click unsubscribe link for this email's category. */
  unsubUrl: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Timestamp | Date | ISO/`YYYY-MM-DD` string | millis → millis (NaN if unknown). */
function millis(v: unknown): number {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function')
    return (v as admin.firestore.Timestamp).toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v) return Date.parse(v.length === 10 ? `${v}T00:00:00-07:00` : v);
  return NaN;
}

async function brand(): Promise<EmailBrand> {
  try {
    return emailBrandFrom((await db().doc('settings/global').get()).data());
  } catch {
    return emailBrandFrom({});
  }
}

async function toRecipient(
  uid: string,
  d: FirebaseFirestore.DocumentData | undefined,
  category: NotificationCategory,
): Promise<Recipient | null> {
  const email = str(d?.email);
  if (!email || isInventoryEmail(email)) return null;
  if (!(await userAcceptsCategory(uid, category))) return null;
  const token = await unsubscribeToken(uid, d?.unsubToken);
  return {
    uid,
    email,
    lang: emailLang(d?.lang),
    firstName: str(d?.displayName).split(' ')[0] ?? '',
    unsubUrl: unsubscribeUrl(token, category),
  };
}

/** Every customer who hasn't turned `category` off. */
async function recipientsFor(category: NotificationCategory): Promise<Recipient[]> {
  const snap = await db()
    .collection('users')
    .select('email', 'lang', 'displayName', 'unsubToken')
    .get();
  const out: Recipient[] = [];
  for (let i = 0; i < snap.docs.length; i += 50) {
    const chunk = await Promise.all(
      snap.docs.slice(i, i + 50).map((d) => toRecipient(d.id, d.data(), category)),
    );
    for (const r of chunk) if (r) out.push(r);
  }
  return out;
}

interface Outgoing {
  to: string;
  subject: string;
  html: string;
  /** One-click unsubscribe URL (List-Unsubscribe headers). */
  unsub?: string;
}

/** Resend batch API (100 per request, ~2 requests/s). Returns how many were accepted. */
async function sendBatch(
  mails: Outgoing[],
  replyTo: string,
): Promise<{ sent: number; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: 0, error: 'RESEND_API_KEY not set' };
  let sent = 0;
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100);
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(
        chunk.map((m) => ({
          from: FROM,
          to: [m.to],
          subject: m.subject,
          html: m.html,
          ...(replyTo ? { reply_to: replyTo } : {}),
          headers: m.unsub
            ? unsubscribeHeaders(m.unsub)
            : { 'List-Unsubscribe': `<${SITE}/account>` },
        })),
      ),
    }).catch((err: unknown) => err as Error);
    if (res instanceof Error || !res.ok) {
      const detail =
        res instanceof Error
          ? res.message
          : `${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`;
      console.error('[marketing.sendBatch] Resend failed:', detail);
      return { sent, error: detail };
    }
    sent += chunk.length;
    if (i + 100 < mails.length) await new Promise((r) => setTimeout(r, 600));
  }
  return { sent };
}

/** Bell entries (batched) + push, a few at a time. */
async function bellAndPush(
  rs: Recipient[],
  idFor: (r: Recipient) => string,
  type: string,
  msg: (r: Recipient) => { title: string; body: string },
  data: Record<string, unknown>,
  url: string,
) {
  for (let i = 0; i < rs.length; i += 400) {
    const batch = db().batch();
    for (const r of rs.slice(i, i + 400)) {
      const m = msg(r);
      batch.set(db().doc(`notifications/${idFor(r)}`), {
        recipientId: r.uid,
        type,
        title: m.title,
        body: m.body,
        data,
        isRead: false,
        createdAt: FS.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  for (let i = 0; i < rs.length; i += 25) {
    await Promise.allSettled(
      rs.slice(i, i + 25).map((r) => {
        const m = msg(r);
        return sendPushToUser(r.uid, m.title, m.body, { notifId: idFor(r), type, url });
      }),
    );
  }
}

const manageNote = (lang: EmailLang, why: string, unsubUrl?: string) =>
  note(
    L(lang, 'Why you got this', 'Pourquoi ce courriel'),
    `${esc(why)} <a href="${SITE}/account" style="color:#b8924a;text-decoration:none;">${L(lang, 'Manage email preferences', 'Gérer mes préférences de courriel')}</a>${
      unsubUrl
        ? ` · <a href="${esc(`${unsubUrl}${lang === 'fr' ? '&l=fr' : ''}`)}" style="color:#b8924a;text-decoration:none;">${L(lang, 'Unsubscribe', 'Se désabonner')}</a>`
        : ''
    }`,
  );

// ── Promotions ──────────────────────────────────────────────────────────────

type Promo = {
  code?: string;
  description?: string;
  descriptionFr?: string;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  minPurchase?: number;
  startDate?: unknown;
  endDate?: unknown;
  isActive?: boolean;
  usageLimit?: number;
  usageCount?: number;
  announce?: boolean;
  announcedAt?: unknown;
  announcingAt?: number;
};

export function promoIsLive(d: Promo, now = Date.now()): boolean {
  if (d.isActive === false || !str(d.code)) return false;
  const start = millis(d.startDate);
  const end = millis(d.endDate);
  if (Number.isFinite(start) && start > now) return false;
  // endDate is a calendar day — live through the end of it.
  if (Number.isFinite(end) && end + 24 * 3600_000 < now) return false;
  if (typeof d.usageLimit === 'number' && (d.usageCount ?? 0) >= d.usageLimit) return false;
  return true;
}

function offerText(d: Promo, lang: EmailLang): string {
  const v = Number(d.discountValue ?? 0);
  const base =
    d.discountType === 'fixed'
      ? L(lang, `$${v} off`, `${v} $ de rabais`)
      : L(lang, `${v}% off`, `${v} % de rabais`);
  const min = Number(d.minPurchase ?? 0);
  return min > 0
    ? `${base}${L(lang, ` on orders over $${min}`, ` sur les commandes de plus de ${min} $`)}`
    : base;
}

function promoEmail(d: Promo, r: Recipient, b: EmailBrand): Outgoing {
  const lang = r.lang;
  const T = (en: string, fr: string) => L(lang, en, fr);
  const codeTxt = str(d.code).toUpperCase();
  const offer = offerText(d, lang);
  const end = millis(d.endDate);
  const endTxt = Number.isFinite(end)
    ? new Date(end + 12 * 3600_000).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
        month: 'long',
        day: 'numeric',
        timeZone: 'America/Vancouver',
      })
    : '';
  const desc = (lang === 'fr' && str(d.descriptionFr)) || str(d.description);
  return {
    to: r.email,
    unsub: r.unsubUrl,
    subject: T(
      `${offer} with code ${codeTxt} | ${b.name}`,
      `${offer} avec le code ${codeTxt} | ${b.name}`,
    ),
    html: renderEmail({
      brand: b,
      lang,
      preheader: T(
        `Use code ${codeTxt} at checkout${endTxt ? ` — ends ${endTxt}` : ''}.`,
        `Utilisez le code ${codeTxt} à la caisse${endTxt ? ` — jusqu'au ${endTxt}` : ''}.`,
      ),
      eyebrow: T('A new offer', 'Nouvelle offre'),
      title: offer,
      body: [
        p(
          T(
            `${r.firstName ? `Hi ${esc(r.firstName)}, ` : ''}here&#39;s something for your next cup.`,
            `${r.firstName ? `Bonjour ${esc(r.firstName)}, ` : ''}voici de quoi agrémenter votre prochaine tasse.`,
          ),
        ),
        desc ? p(esc(desc)) : '',
        p(
          `${T('Use code', 'Utilisez le code')} ${code(codeTxt)} ${T('at checkout', 'à la caisse')}${endTxt ? T(` — ends ${strong(esc(endTxt))}`, ` — jusqu&#39;au ${strong(esc(endTxt))}`) : ''}.`,
        ),
        button(T('Shop now', 'Magasiner'), `${SITE}/products`),
        manageNote(
          lang,
          T(
            'You get Ele Café offers because Promotions is on in your account.',
            'Vous recevez les offres Ele Café, car les promotions sont activées dans votre compte.',
          ),
          r.unsubUrl,
        ),
      ],
    }),
  };
}

/** Email + bell + push a promotion to everyone subscribed. Claims the
 *  promotion first so two callers can't double-send. */
async function announcePromotion(
  promoId: string,
  force = false,
): Promise<{ sent: number; skipped?: string; error?: string }> {
  const ref = db().doc(`promotions/${promoId}`);
  const d = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    const data = s.data() as Promo;
    if (!force && data.announcedAt) return null;
    if (data.announcingAt && Date.now() - data.announcingAt < 15 * 60_000) return null;
    tx.update(ref, { announcingAt: Date.now() });
    return data;
  });
  if (!d) return { sent: 0, skipped: 'already announced or in progress' };
  if (!promoIsLive(d)) {
    await ref.update({ announcingAt: FS.delete() });
    return { sent: 0, skipped: 'promotion is not live' };
  }

  // The French description may still be in flight from autoTranslatePromotion.
  if (str(d.description) && !str(d.descriptionFr)) {
    try {
      d.descriptionFr = (await translateBatchToFrench([str(d.description)]))[0];
    } catch {
      /* English fallback */
    }
  }
  const [b, rs] = await Promise.all([brand(), recipientsFor('promotions')]);
  const result = await sendBatch(
    rs.map((r) => promoEmail(d, r, b)),
    b.email,
  );
  const codeTxt = str(d.code).toUpperCase();
  await bellAndPush(
    rs,
    (r) => `promo_${promoId}_${r.uid}`,
    'customer_promotion',
    (r) => ({
      title: L(
        r.lang,
        `${offerText(d, 'en')} with code ${codeTxt}`,
        `${offerText(d, 'fr')} avec le code ${codeTxt}`,
      ),
      body: L(r.lang, 'Use the code at checkout.', 'Utilisez le code à la caisse.'),
    }),
    {
      code: codeTxt,
      discountType: d.discountType ?? 'percentage',
      discountValue: Number(d.discountValue ?? 0),
      minPurchase: Number(d.minPurchase ?? 0),
      url: '/products',
    },
    '/products',
  );
  await ref.update({
    announcingAt: FS.delete(),
    announcedAt: FS.serverTimestamp(),
    announcedCount: result.sent,
    announceError: result.error ?? FS.delete(),
  });
  console.log(
    `[announcePromotion] ${promoId}: ${result.sent}/${rs.length} emails${result.error ? ` (error: ${result.error})` : ''}`,
  );
  return { sent: result.sent, ...(result.error ? { error: result.error } : {}) };
}

/** Auto-announce when a promotion with "Email customers" ticked goes live. */
export const onPromotionWrite = functions.firestore.onDocumentWritten(
  {
    region: REGION,
    document: 'promotions/{id}',
    secrets: ['RESEND_API_KEY'],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (event) => {
    const after = event.data?.after?.data() as Promo | undefined;
    const before = event.data?.before?.data() as Promo | undefined;
    if (!after || after.announce !== true || after.announcedAt || !promoIsLive(after)) return;
    // Only on the change that made it announceable — not on our own bookkeeping writes.
    if (before && before.announce === true && promoIsLive(before)) return;
    await announcePromotion(event.params.id);
  },
);

/** Admin "Notify customers" button. */
export const notifyPromotion = functions.https.onCall(
  {
    region: REGION,
    enforceAppCheck: true,
    secrets: ['RESEND_API_KEY'],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request) => {
    if (request.auth?.token?.role !== 'admin')
      throw new functions.https.HttpsError('permission-denied', 'Admins only.');
    const { promotionId, force } = (request.data ?? {}) as {
      promotionId?: unknown;
      force?: unknown;
    };
    if (typeof promotionId !== 'string' || !promotionId)
      throw new functions.https.HttpsError('invalid-argument', 'promotionId required.');
    return announcePromotion(promotionId, force === true);
  },
);

// ── New arrivals ────────────────────────────────────────────────────────────

type Tea = {
  name?: string;
  nameFr?: string;
  slug?: string;
  category?: string;
  image?: string;
  price?: number;
  isActive?: boolean;
  createdAt?: unknown;
};

/** Queue a tea when it's first published (created active, or activated
 *  within 30 days of being created). Re-activating an old tea doesn't count. */
export const onTeaPublished = functions.firestore.onDocumentWritten(
  { region: REGION, document: 'teas/{id}' },
  async (event) => {
    const after = event.data?.after?.data() as Tea | undefined;
    if (!after || after.isActive === false) return;
    const before = event.data?.before?.data() as Tea | undefined;
    if (before && before.isActive !== false) return;
    const created = millis(after.createdAt);
    if (before && !(Number.isFinite(created) && Date.now() - created < 30 * 86400_000)) return;
    const ref = db().doc(`newArrivalQueue/${event.params.id}`);
    await db().runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return; // queued or announced before
      tx.set(ref, { queuedAt: Date.now(), sentAt: null });
    });
  },
);

function teaPath(t: Tea) {
  return t.category && t.slug
    ? `/tea-profile/${encodeURIComponent(t.category)}/${encodeURIComponent(t.slug)}`
    : `/products`;
}

async function sendNewArrivals(): Promise<void> {
  // Wait 30 min after publishing so the French translation settles, and
  // hold a tea until it has a photo (a new-tea email without a picture
  // sells nothing) — up to 7 days, then announce it anyway.
  const q = await db().collection('newArrivalQueue').where('sentAt', '==', null).get();
  const ready: typeof q.docs = [];
  const teas: Array<Tea & { id: string }> = [];
  for (const d of q.docs) {
    const age = Date.now() - Number(d.get('queuedAt') ?? 0);
    if (age < 30 * 60_000) continue;
    const t = (await db().doc(`teas/${d.id}`).get()).data() as Tea | undefined;
    const hasPhoto = !!(t && typeof t.image === 'string' && t.image.trim());
    if (t && t.isActive !== false && !hasPhoto && age < 7 * 86400_000) continue;
    ready.push(d);
    if (t && t.isActive !== false) teas.push({ ...t, id: d.id });
  }
  if (!ready.length) return;
  // Claim first so an overlapping run can't resend.
  const claim = db().batch();
  ready.forEach((d) => claim.update(d.ref, { sentAt: Date.now() }));
  await claim.commit();
  if (!teas.length) return;

  const [b, rs] = await Promise.all([brand(), recipientsFor('newArrivals')]);
  const nameOf = (t: Tea, lang: EmailLang) =>
    (lang === 'fr' && str(t.nameFr)) || str(t.name) || t.slug || '';
  const shown = teas.slice(0, 6);
  const mails = rs.map((r): Outgoing => {
    const lang = r.lang;
    const T = (en: string, fr: string) => L(lang, en, fr);
    const first = nameOf(teas[0], lang);
    const one = teas.length === 1;
    return {
      to: r.email,
      unsub: r.unsubUrl,
      subject: one
        ? T(`New at ${b.name}: ${first}`, `Nouveau chez ${b.name} : ${first}`)
        : T(`${teas.length} new teas at ${b.name}`, `${teas.length} nouveaux thés chez ${b.name}`),
      html: renderEmail({
        brand: b,
        lang,
        preheader: one
          ? T(
              `${first} just arrived — be among the first to try it.`,
              `${first} vient d'arriver — soyez parmi les premiers à le goûter.`,
            )
          : T(
              'Fresh teas just arrived — be among the first to try them.',
              "De nouveaux thés viennent d'arriver — soyez parmi les premiers à les goûter.",
            ),
        eyebrow: T('New arrivals', 'Nouveautés'),
        title: one ? first : T('Fresh from our shelves', 'Tout juste arrivés'),
        body: [
          ...shown.flatMap((t) => [
            one ? image(str(t.image), nameOf(t, lang)) : '',
            p(
              `${strong(esc(nameOf(t, lang)))}${typeof t.price === 'number' && t.price > 0 ? ` · ${T(`$${t.price.toFixed(2)}`, `${t.price.toFixed(2)} $`)}` : ''} — <a href="${SITE}${teaPath(t)}" style="color:#b8924a;text-decoration:none;">${T('View tea', 'Voir le thé')}</a>`,
            ),
          ]),
          teas.length > shown.length
            ? p(
                T(
                  `…and ${teas.length - shown.length} more.`,
                  `…et ${teas.length - shown.length} de plus.`,
                ),
                { small: true },
              )
            : '',
          button(
            one ? T('View tea', 'Voir le thé') : T('Shop new teas', 'Découvrir les nouveautés'),
            one ? `${SITE}${teaPath(teas[0])}` : `${SITE}/products`,
          ),
          manageNote(
            lang,
            T(
              'You get new-tea alerts because New arrivals is on in your account.',
              'Vous recevez les alertes de nouveautés, car « Nouveautés » est activé dans votre compte.',
            ),
            r.unsubUrl,
          ),
        ],
      }),
    };
  });
  const result = await sendBatch(mails, b.email);
  const key = teas
    .map((t) => t.id)
    .sort()
    .join('_')
    .slice(0, 200);
  await bellAndPush(
    rs,
    (r) => `newtea_${key}_${r.uid}`.slice(0, 700),
    'customer_new_arrival',
    (r) =>
      teas.length === 1
        ? {
            title: L(
              r.lang,
              `New tea: ${nameOf(teas[0], 'en')}`,
              `Nouveau thé : ${nameOf(teas[0], 'fr')}`,
            ),
            body: L(
              r.lang,
              'Be among the first to try it.',
              'Soyez parmi les premiers à le goûter.',
            ),
          }
        : {
            title: L(
              r.lang,
              `${teas.length} new teas just arrived`,
              `${teas.length} nouveaux thés viennent d'arriver`,
            ),
            body: L(
              r.lang,
              'Be among the first to try them.',
              'Soyez parmi les premiers à les goûter.',
            ),
          },
    {
      count: teas.length,
      teaName: nameOf(teas[0], 'en'),
      teaNameFr: nameOf(teas[0], 'fr'),
      url: teas.length === 1 ? teaPath(teas[0]) : '/products',
    },
    teas.length === 1 ? teaPath(teas[0]) : '/products',
  );
  console.log(
    `[newArrivals] ${teas.length} tea(s): ${result.sent}/${rs.length} emails${result.error ? ` (error: ${result.error})` : ''}`,
  );
}

// ── Cart reminders ──────────────────────────────────────────────────────────

// ── Refill reminders ────────────────────────────────────────────────────────
//
// ~30 days after an order is delivered (or picked up), a "Time for a
// refill?" email with the teas they bought (those still in stock), a
// Reorder button and two teas from the same categories. Once per order
// (refillReminders/{orderId}); skipped if they have ordered again since,
// or turned Cart reminders off.

type RefillTea = Tea & { id: string; available?: boolean };

const REFILL_MIN_DAYS = 30;
const REFILL_MAX_DAYS = 45;

async function sendRefillReminders(): Promise<void> {
  const now = Date.now();
  const delivered = await db().collection('orders').where('status', '==', 'delivered').get();
  const due = delivered.docs.filter((o) => {
    const at = millis(o.get('updatedAt'));
    const days = (now - at) / 86_400_000;
    return (
      Number.isFinite(at) &&
      days >= REFILL_MIN_DAYS &&
      days <= REFILL_MAX_DAYS &&
      typeof o.get('userId') === 'string'
    );
  });
  if (!due.length) return;

  const b = await brand();
  const allTeas = (await db().collection('teas').get()).docs
    .map((d): RefillTea => ({
      ...(d.data() as Tea),
      id: d.id,
      available: d.get('available') as boolean | undefined,
    }))
    .filter((t) => t.isActive !== false && t.available !== false && t.slug && t.category);
  const byId = new Map(
    allTeas.flatMap(
      (t) =>
        [
          [t.id, t],
          [t.slug as string, t],
        ] as const,
    ),
  );
  const mails: Outgoing[] = [];

  for (const o of due) {
    const logRef = db().doc(`refillReminders/${o.id}`);
    if ((await logRef.get()).exists) continue;
    const uid = o.get('userId') as string;
    const deliveredAt = millis(o.get('updatedAt'));
    // Already ordered again since this delivery → no nudge needed.
    const later = await db().collection('orders').where('userId', '==', uid).get();
    if (later.docs.some((x) => x.id !== o.id && millis(x.get('createdAt')) > deliveredAt)) {
      await logRef.set({ skipped: 'reordered', at: now });
      continue;
    }
    const r = await toRecipient(uid, (await db().doc(`users/${uid}`).get()).data(), 'reminders');
    if (!r) {
      await logRef.set({ skipped: 'opted-out-or-no-email', at: now });
      continue;
    }

    const bought = [
      ...new Set(((o.get('items') as { productId?: string }[]) ?? []).map((i) => i.productId)),
    ]
      .map((id) => (id ? byId.get(id) : undefined))
      .filter((t): t is RefillTea => !!t)
      .slice(0, 4);
    if (!bought.length) {
      await logRef.set({ skipped: 'nothing-in-stock', at: now });
      continue;
    }
    const cats = new Set(bought.map((t) => t.category));
    const boughtIds = new Set(bought.map((t) => t.id));
    const suggest = allTeas.filter((t) => cats.has(t.category) && !boughtIds.has(t.id)).slice(0, 2);

    const lang = r.lang;
    const T = (en: string, fr: string) => L(lang, en, fr);
    const nameOf = (t: Tea) => (lang === 'fr' && str(t.nameFr)) || str(t.name) || str(t.slug);
    const line = (t: RefillTea) =>
      `<a href="${SITE}${teaPath(t)}" style="color:#0f1c26;font-weight:600;text-decoration:none;">${esc(nameOf(t))}</a>${typeof t.price === 'number' && t.price > 0 ? ` · ${T(`$${t.price}`, `${t.price} $`)}` : ''}`;

    mails.push({
      to: r.email,
      unsub: r.unsubUrl,
      subject:
        bought.length === 1
          ? T(
              `Running low on ${nameOf(bought[0])}? | ${b.name}`,
              `Bientôt à court de ${nameOf(bought[0])}? | ${b.name}`,
            )
          : T(
              `Time for a tea refill? | ${b.name}`,
              `Le temps de refaire vos réserves de thé? | ${b.name}`,
            ),
      html: renderEmail({
        brand: b,
        lang,
        preheader: T(
          'Your favourites are in stock and ready to ship or pick up.',
          'Vos favoris sont en stock, prêts à expédier ou à ramasser.',
        ),
        eyebrow: T('Time for a refill', 'Réapprovisionnement'),
        title: T('Running low on your tea?', 'Bientôt à court de thé?'),
        body: [
          p(
            T(
              `${r.firstName ? `Hi ${esc(r.firstName)}, ` : ''}it’s been about a month since your last order. If your tins are getting light, your favourites are in stock:`,
              `${r.firstName ? `Bonjour ${esc(r.firstName)}, ` : ''}cela fait environ un mois depuis votre dernière commande. Si vos boîtes s’allègent, vos favoris sont en stock :`,
            ),
          ),
          p(bought.map(line).join('<br/>')),
          button(T('Reorder in one tap', 'Recommander en un clic'), `${SITE}/orders`),
          suggest.length
            ? p(
                `${strong(T('You might also like', 'Vous aimerez aussi'))}<br/>${suggest.map(line).join('<br/>')}`,
              )
            : '',
          manageNote(
            lang,
            T(
              'You get refill reminders because Cart reminders is on in your account.',
              'Vous recevez ces rappels, car « Rappels de panier » est activé dans votre compte.',
            ),
            r.unsubUrl,
          ),
        ],
      }),
    });
    await logRef.set({ sentAt: now, uid });
  }
  if (!mails.length) return;
  const result = await sendBatch(mails, b.email);
  console.log(
    `[refillReminders] ${result.sent}/${mails.length} emails${result.error ? ` (error: ${result.error})` : ''}`,
  );
}

type CartItem = { name?: string; nameFr?: string; quantity?: number; price?: number };

async function sendCartReminders(): Promise<void> {
  const now = Date.now();
  const snap = await db()
    .collection('carts')
    .where('updatedAt', '<=', now - 24 * 3600_000)
    .where('updatedAt', '>=', now - 72 * 3600_000)
    .get();
  if (snap.empty) return;
  const b = await brand();
  const due: Array<{ r: Recipient; items: CartItem[]; updatedAt: number }> = [];
  for (const c of snap.docs) {
    const items = (Array.isArray(c.get('items')) ? c.get('items') : []) as CartItem[];
    if (!items.length) continue;
    const logRef = db().doc(`cartReminders/${c.id}`);
    const log = (await logRef.get()).data();
    const updatedAt = Number(c.get('updatedAt'));
    if (log && (log.cartUpdatedAt === updatedAt || now - Number(log.sentAt ?? 0) < 7 * 86400_000))
      continue;
    const r = await toRecipient(c.id, (await db().doc(`users/${c.id}`).get()).data(), 'reminders');
    if (!r) continue;
    await logRef.set({ sentAt: now, cartUpdatedAt: updatedAt });
    due.push({ r, items, updatedAt });
  }
  if (!due.length) return;

  const mails = due.map(({ r, items }): Outgoing => {
    const lang = r.lang;
    const T = (en: string, fr: string) => L(lang, en, fr);
    return {
      to: r.email,
      unsub: r.unsubUrl,
      subject: T(`Your cart is waiting | ${b.name}`, `Votre panier vous attend | ${b.name}`),
      html: renderEmail({
        brand: b,
        lang,
        preheader: T(
          'Your teas are still in your cart.',
          'Vos thés sont toujours dans votre panier.',
        ),
        eyebrow: T('Still thinking it over?', 'Vous hésitez encore?'),
        title: T('Your cart is waiting', 'Votre panier vous attend'),
        body: [
          p(
            T(
              `${r.firstName ? `Hi ${esc(r.firstName)}, you` : 'You'} left a few teas in your cart. They&#39;re saved for you whenever you&#39;re ready.`,
              `${r.firstName ? `Bonjour ${esc(r.firstName)}, vous` : 'Vous'} avez laissé quelques thés dans votre panier. Ils vous attendent quand vous serez prêt.`,
            ),
          ),
          itemsTable(
            items.map((it) => ({
              productName: (lang === 'fr' && str(it.nameFr)) || str(it.name) || T('Tea', 'Thé'),
              quantity: Number(it.quantity ?? 1),
              price: Number(it.price ?? 0),
            })),
            T('In your cart', 'Dans votre panier'),
            lang,
          ),
          button(T('Return to cart', 'Retour au panier'), `${SITE}/cart`),
          manageNote(
            lang,
            T(
              'You get cart reminders because Cart reminders is on in your account.',
              'Vous recevez ces rappels, car « Rappels de panier » est activé dans votre compte.',
            ),
            r.unsubUrl,
          ),
        ],
      }),
    };
  });
  const result = await sendBatch(mails, b.email);
  await bellAndPush(
    due.map((x) => x.r),
    (r) => `cart_${r.uid}_${due.find((x) => x.r.uid === r.uid)?.updatedAt ?? now}`,
    'customer_cart_reminder',
    (r) => {
      const n =
        due
          .find((x) => x.r.uid === r.uid)
          ?.items.reduce((s, it) => s + Number(it.quantity ?? 1), 0) ?? 1;
      return {
        title: L(r.lang, 'Your cart is waiting', 'Votre panier vous attend'),
        body:
          n === 1
            ? L(
                r.lang,
                'An item is waiting in your cart.',
                'Un article vous attend dans votre panier.',
              )
            : L(
                r.lang,
                `${n} items are waiting in your cart.`,
                `${n} articles vous attendent dans votre panier.`,
              ),
      };
    },
    { url: '/cart' },
    '/cart',
  );
  console.log(
    `[cartReminders] ${result.sent}/${due.length} emails${result.error ? ` (error: ${result.error})` : ''}`,
  );
}

// ── Hourly tick ─────────────────────────────────────────────────────────────

/** Promotions that went live on their start date, new-arrival digests,
 *  and cart reminders. Each part is independent — one failing doesn't
 *  stop the others. */
export const marketingTick = functions.scheduler.onSchedule(
  {
    region: REGION,
    schedule: 'every 60 minutes',
    secrets: ['RESEND_API_KEY'],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    try {
      const promos = await db().collection('promotions').where('announce', '==', true).get();
      for (const d of promos.docs) {
        const data = d.data() as Promo;
        if (!data.announcedAt && promoIsLive(data)) await announcePromotion(d.id);
      }
    } catch (err) {
      console.error('[marketingTick] promotions failed:', err);
    }
    try {
      await sendNewArrivals();
    } catch (err) {
      console.error('[marketingTick] new arrivals failed:', err);
    }
    try {
      await sendCartReminders();
    } catch (err) {
      console.error('[marketingTick] cart reminders failed:', err);
    }
    try {
      await sendRefillReminders();
    } catch (err) {
      console.error('[marketingTick] refill reminders failed:', err);
    }
    try {
      await runWatchdog();
    } catch (err) {
      console.error('[marketingTick] watchdog failed:', err);
    }
  },
);
