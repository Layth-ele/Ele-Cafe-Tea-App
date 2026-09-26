/**
 * functions/src/inventory.ts — Cloud Functions for the inventory subsystem.
 *
 * Exports (registered in functions/src/index.ts):
 *   setEmployeeAccessCode       — HTTPS callable, admin-only. scrypts the
 *                                 4-digit code and writes employees_access/{id}.
 *                                 Plaintext never lands in Firestore.
 *   validateInventoryAccessCode — HTTPS callable. Requires sign-in to the
 *                                 shared inventory account (App Check
 *                                 enforced + per-IP rate limit). Tries
 *                                 scrypt.compare against every active
 *                                 employee in constant time. Returns
 *                                 { matched, employeeName }.
 *   onInventoryWrite            — Firestore trigger on /inventory/{teaId}.
 *                                 Derives status from level, projects
 *                                 available + availabilityLabel onto
 *                                 /teas/{teaId}, and writes an audit log
 *                                 entry to /inventory_logs/{auto}.
 *   onTeaCreate                 — Firestore trigger on /teas/{teaId} create.
 *                                 Auto-provisions a matching inventory doc
 *                                 so new teas immediately have a record.
 *   onTeaDelete                 — Firestore trigger on /teas/{teaId} delete.
 *                                 Cascade-deletes the inventory doc.
 *                                 Audit log entries deliberately preserved.
 *
 * Why no bcrypt: Node 22 ships `crypto.scrypt` which is equivalent in
 * strength (memory-hard, salted), zero dependencies. Hashes are stored
 * as `${saltHex}:${derivedKeyHex}` so we can verify without a separate
 * salt column.
 */

import * as functions from 'firebase-functions/v2';
import * as admin from './lib/admin';
import * as crypto from 'crypto';
import { userAcceptsCategory } from './lib/notificationPrefs';
import {
  isInventoryEmail,
  INVENTORY_SESSION_UID_PREFIX,
  INVENTORY_SESSION_HOURS,
  type InventorySessionClaims,
} from './lib/inventoryAccount';
import { buildBackInStockEmail } from './lib/backInStockEmail';
import { emailBrandFrom, emailLang, type EmailBrand, type EmailLang } from './lib/emailLayout';
import { sendPushToUser } from './lib/push';

// admin SDK is initialized in functions/src/index.ts before this file
// is imported; we just reuse the default app.
const db = () => admin.firestore();

// ── Tunables ──────────────────────────────────────────────────────────────
const SCRYPT_KEY_LEN = 64;
const SCRYPT_COST = 2 ** 14; // N — memory/time factor (~tens of ms)
const RATE_LIMIT_MAX = 5; // failed attempts per IP per window
const RATE_LIMIT_MS = 5 * 60_000; // 5-minute lockout window
const REGION = 'us-central1';
const RESEND_FROM = 'Ele Café <noreply@elecafe.ca>';

/* -------------------------------------------------------------------------- */
/*                            HASH HELPERS (scrypt)                           */
/* -------------------------------------------------------------------------- */

function scryptHash(plain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(plain, salt, SCRYPT_KEY_LEN, { N: SCRYPT_COST }, (err, key) => {
      if (err) return reject(err);
      resolve(`${salt.toString('hex')}:${key.toString('hex')}`);
    });
  });
}

function scryptVerify(plain: string, stored: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [saltHex, keyHex] = stored.split(':');
    if (!saltHex || !keyHex) return resolve(false);
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    // Defense in depth: reject any stored hash whose key segment isn't
    // exactly SCRYPT_KEY_LEN bytes. A corrupted record with a short
    // key could otherwise cause scrypt to produce a short derivation
    // with trivial collision space. The salt-segment length isn't
    // validated separately because scrypt accepts variable salts; the
    // key length is the part that determines the comparison's strength.
    if (expected.length !== SCRYPT_KEY_LEN) return resolve(false);
    crypto.scrypt(plain, salt, expected.length, { N: SCRYPT_COST }, (err, key) => {
      if (err) return reject(err);
      // timingSafeEqual prevents timing-side-channel comparison
      resolve(key.length === expected.length && crypto.timingSafeEqual(key, expected));
    });
  });
}

/* -------------------------------------------------------------------------- */
/*                  1.  setEmployeeAccessCode — admin callable                */
/* -------------------------------------------------------------------------- */

/**
 * Admin creates or rotates an employee's access code. Idempotent: if an
 * employee with the same name exists, their record is updated rather
 * than duplicated.
 *
 * Request:  { name: string, accessCode: string  /^\d{4}$/  }
 * Response: { id: string }
 */
export const setEmployeeAccessCode = functions.https.onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can set employee access codes.',
      );
    }

    const { name, accessCode, role } = (request.data ?? {}) as {
      name?: string;
      accessCode?: string;
      role?: string;
    };
    if (typeof name !== 'string' || name.trim().length < 2) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Employee name is required (min 2 chars).',
      );
    }
    // Role gate: must be one of the allowed values when provided.
    if (role !== undefined && role !== 'edit' && role !== 'readonly') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        "Role must be 'edit' or 'readonly'.",
      );
    }
    // accessCode is now OPTIONAL on update (admin may want to change
    // only the role without rotating the 4-digit code). On CREATE it's
    // still required — checked inside the transaction after we know
    // whether the doc exists.
    if (
      accessCode !== undefined &&
      (typeof accessCode !== 'string' || !/^\d{4}$/.test(accessCode))
    ) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Access code must be exactly 4 digits.',
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const newHash = accessCode ? await scryptHash(accessCode) : null;

    // Atomic upsert by name, inside a Firestore transaction. Without
    // the transaction, two admins calling this simultaneously could
    // both see "no existing record" and both .add(), producing
    // duplicate employee docs with the same name. Real-world race
    // window is tiny but the fix is small and defensive.
    //
    // For multi-Sarah teams (which require disambiguation), switch to
    // an explicit employeeId argument from the admin UI; the read+write
    // would then key off the id and skip the query entirely. For a
    // small café team where name is unambiguous, this transaction is
    // sufficient.
    const trimmedName = name.trim();
    const result = await db().runTransaction(async (tx) => {
      const existing = await tx.get(
        db().collection('employees_access').where('name', '==', trimmedName).limit(1),
      );
      if (!existing.empty) {
        // UPDATE path. Mutate only the fields the caller sent.
        const doc = existing.docs[0];
        const patch: Record<string, unknown> = { active: true, updatedAt: now };
        if (newHash !== null) patch.codeHash = newHash;
        if (role !== undefined) patch.role = role;
        tx.update(doc.ref, patch);
        return { id: doc.id };
      }
      // CREATE path. accessCode is required on create.
      if (newHash === null) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Access code is required when creating a new employee.',
        );
      }
      const newRef = db().collection('employees_access').doc();
      tx.set(newRef, {
        name: trimmedName,
        codeHash: newHash,
        active: true,
        role: role ?? 'edit',
        createdAt: now,
        updatedAt: now,
      });
      return { id: newRef.id };
    });
    return result;
  },
);

/* -------------------------------------------------------------------------- */
/*           2.  validateInventoryAccessCode — public (App Check) callable    */
/* -------------------------------------------------------------------------- */

/**
 * Employee enters 4 digits at the modal. We fetch every active employee
 * and scrypt.compare each — non-deterministic hashes can't be queried
 * by value, but N is tiny (handful of staff) so the loop is fine.
 *
 * Brute-force defense:
 *   - App Check is enforced (project-wide setting).
 *   - Per-IP failure counter in /inventory_access_attempts/{ipHash}.
 *     5 fails inside a 5-minute window → locked.
 *
 * Request:  { accessCode: string  /^\d{4}$/  }
 * Response: { matched: boolean, employeeName?: string }
 */
export const validateInventoryAccessCode = functions.https.onCall(
  // scrypt (N=2^14) uses ~16 MB per verify and each call checks every
  // active employee; 512 MiB + a modest concurrency cap keeps parallel
  // sign-ins at shift change well under the limit (256 MiB was exceeded).
  { region: REGION, enforceAppCheck: true, memory: '512MiB', concurrency: 8 },
  async (request) => {
    // Caller MUST already be signed into the shared inventory account.
    // The 4-digit code is a SECOND factor on top of the account
    // password; without this check, any customer with an account
    // could burn through brute-force attempts (annoying the lockout
    // bucket and wasting Function invocations).
    const callerEmail = request.auth?.token?.email;
    if (!isInventoryEmail(callerEmail)) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Sign in to the inventory account before entering an access code.',
      );
    }

    const { accessCode } = (request.data ?? {}) as { accessCode?: string };
    if (typeof accessCode !== 'string' || !/^\d{4}$/.test(accessCode)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Access code must be exactly 4 digits.',
      );
    }

    // Identify the caller for rate-limit bucketing. Hash the IP so we
    // don't store raw addresses long-term.
    const rawIp = request.rawRequest.ip ?? 'unknown';
    const ipHash = crypto.createHash('sha256').update(rawIp).digest('hex').slice(0, 24);
    const bucket = db().collection('inventory_access_attempts').doc(ipHash);

    const now = Date.now();
    const snap = await bucket.get();
    const data = snap.exists ? (snap.data() as { fails?: number; firstFailAt?: number }) : {};
    const fails = data.fails ?? 0;
    const firstAt = data.firstFailAt ?? now;
    const inWindow = now - firstAt < RATE_LIMIT_MS;

    if (inWindow && fails >= RATE_LIMIT_MAX) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        `Too many failed attempts. Try again in ${Math.ceil((RATE_LIMIT_MS - (now - firstAt)) / 60_000)} min.`,
      );
    }

    const activeSnap = await db().collection('employees_access').where('active', '==', true).get();

    // Constant-time-ish loop: run scryptVerify against EVERY active
    // employee, even after a match. Without this, the function returns
    // at index N when the matched employee is at position N, and an
    // attacker measuring response times could deduce the position and
    // thus infer the matched employee's identity. Walking the full
    // list makes elapsed time depend on N (the team size), not on
    // which specific employee matched.
    //
    // Cost: ~50ms per active employee on a warm function. For a 5-
    // person café that's <300ms total, well inside the callable budget.
    // Document iteration order is preserved so behaviour is deterministic.
    let matchedName: string | null = null;
    let matchedId: string | null = null;
    let matchedRole: 'edit' | 'readonly' = 'edit';
    for (const doc of activeSnap.docs) {
      const e = doc.data() as { name?: string; codeHash?: string; role?: string };
      if (!e.codeHash || !e.name) continue;
      const ok = await scryptVerify(accessCode, e.codeHash);
      // Capture the FIRST match but keep iterating. If multiple
      // employees somehow share a hash (collision = ~astronomically
      // improbable), the first one wins, matching the prior behaviour.
      if (ok && matchedName === null) {
        matchedName = e.name;
        matchedId = doc.id;
        // Legacy docs without `role` default to 'edit' (preserves
        // existing behavior). Any unrecognized value also normalizes
        // to 'edit' rather than locking the employee out.
        matchedRole = e.role === 'readonly' ? 'readonly' : 'edit';
      }
    }

    if (matchedName !== null) {
      // Success — reset the failure bucket.
      if (snap.exists) await bucket.delete();
      // Per-employee session: a custom token the client signs in with on
      // its memory-only inventory app. firestore.rules check these claims
      // on every inventory read/write (see lib/inventoryAccount.ts).
      const expiresAt = now + INVENTORY_SESSION_HOURS * 3_600_000;
      const claims: InventorySessionClaims = {
        inv: true,
        invEmp: matchedName,
        invEmpId: matchedId as string,
        invRole: matchedRole,
        invExp: expiresAt,
      };
      const sessionToken = await admin
        .auth()
        .createCustomToken(`${INVENTORY_SESSION_UID_PREFIX}${matchedId}`, { ...claims });
      return {
        matched: true,
        employeeName: matchedName,
        role: matchedRole,
        sessionToken,
        expiresAt,
      };
    }

    // Miss — bump the counter. The `expiresAt` field exists so the
    // Firestore TTL policy can auto-cleanup stale buckets (one-time
    // setup: enable TTL on the `inventory_access_attempts` collection
    // pointing to the `expiresAt` field; see README §Deploy).
    //
    // Use FieldValue.increment so two concurrent failed attempts can't
    // both read fails=4 and both write fails=5 (which would give the
    // attacker an extra try before the lockout kicks in). The window
    // anchor (`expiresAt`) stays pinned to firstAt + RATE_LIMIT_MS, so
    // the lockout window doesn't extend on each fail inside it.
    if (snap.exists && inWindow) {
      await bucket.update({
        fails: admin.firestore.FieldValue.increment(1),
        expiresAt: admin.firestore.Timestamp.fromMillis(firstAt + RATE_LIMIT_MS),
      });
    } else {
      await bucket.set({
        fails: 1,
        firstFailAt: now,
        expiresAt: admin.firestore.Timestamp.fromMillis(now + RATE_LIMIT_MS),
      });
    }
    return { matched: false };
  },
);

/* -------------------------------------------------------------------------- */
/*               3.  onInventoryWrite — trigger on /inventory/{teaId}         */
/* -------------------------------------------------------------------------- */

/**
 * Fires on any create/update/delete of an inventory doc. Two jobs:
 *   1. Project safe fields (`available`, `availabilityLabel`) onto the
 *      matching /teas/{teaId} so storefront pages can read them without
 *      touching the private inventory collection.
 *   2. Write an audit log entry to /inventory_logs/{auto}.
 *
 * Both happen server-side so the level → status mapping can never be
 * spoofed by a malicious client and the log can never be skipped.
 */
type InventoryDoc = {
  level?: number;
  weight?: number | null;
  updatedBy?: string;
};

function deriveStatus(level: number): 'in_stock' | 'low_stock' | 'out_of_stock' {
  if (level >= 4) return 'in_stock';
  if (level >= 1) return 'low_stock';
  return 'out_of_stock';
}

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[inventory.sendEmail] RESEND_API_KEY not set — skipped "${opts.subject}" to ${opts.to}`,
    );
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
        from: opts.from ?? RESEND_FROM,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
  } catch (err) {
    console.error('[inventory.sendEmail] Network error calling Resend:', err);
    return false;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[inventory.sendEmail] Resend ${res.status}: ${body}`);
    return false;
  }

  console.log(`[inventory.sendEmail] ✓ "${opts.subject}" → ${opts.to}`);
  return true;
}

/**
 * Email everyone waiting on a tea that just came back in stock.
 *
 * Each waiting user gets an email, an in-app bell notification, and a
 * push to any device where they allowed notifications (installed PWA).
 *
 * Who's waiting: /users/{uid}/wishlist/{slug} docs for this tea.
 *   - notify === true  → explicit "Notify me" request. Always emailed
 *     (the customer asked for exactly this), then notify is cleared so
 *     it's a one-time email.
 *   - otherwise        → a plain wishlist heart. Emailed only if the
 *     user opted into the lowStock category.
 *
 * Needs the collection-group index on wishlist.slug (firestore.indexes.json).
 */
async function notifyBackInStock(teaId: string, eventId: string): Promise<void> {
  const teaSnap = await db().doc(`teas/${teaId}`).get();
  const tea = (teaSnap.data() ?? {}) as {
    name?: string;
    nameFr?: string;
    slug?: string;
    category?: string;
    image?: string;
    price?: number;
  };
  const teaName = tea.name?.trim() || tea.slug?.trim() || teaId;
  const teaPath =
    tea.category && tea.slug
      ? `/tea-profile/${encodeURIComponent(tea.category)}/${encodeURIComponent(tea.slug)}`
      : '/products';
  const teaUrl = `https://elecafe.ca${teaPath}`;

  // Wishlist docs are keyed by the tea's slug; inventory docs by the tea
  // doc id. They're normally identical, but query both to be safe.
  const slugs = Array.from(new Set([teaId, tea.slug].filter((v): v is string => !!v)));
  const snaps = await Promise.all(
    slugs.map((slug) => db().collectionGroup('wishlist').where('slug', '==', slug).get()),
  );

  // One email per user, even if they somehow have both slug variants.
  const byUid = new Map<string, admin.firestore.QueryDocumentSnapshot>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const uid = d.ref.parent.parent?.id;
      if (!uid) continue;
      const prev = byUid.get(uid);
      if (!prev || (d.get('notify') === true && prev.get('notify') !== true)) byUid.set(uid, d);
    }
  }
  if (byUid.size === 0) return;

  const store = await getEmailBranding();
  let sent = 0;

  await Promise.allSettled(
    Array.from(byUid.entries()).map(async ([uid, wishDoc]) => {
      const explicitRequest = wishDoc.get('notify') === true;
      if (!explicitRequest && !(await userAcceptsCategory(uid, 'lowStock'))) {
        console.log(
          `[notifyBackInStock] suppressed — uid=${uid} hearted ${teaId} but lowStock emails are off`,
        );
        return;
      }

      // In-app bell + phone/desktop push (installed PWA). Deterministic
      // doc id so a retried trigger doesn't duplicate the bell entry.
      const notifId = `backinstock_${teaId}_${uid}_${eventId}`;
      const title = `${teaName} is back in stock`;
      const body = 'Grab it before it sells out again.';
      let bellOk = false;
      try {
        await db()
          .doc(`notifications/${notifId}`)
          .set({
            recipientId: uid,
            type: 'customer_back_in_stock',
            title,
            body,
            data: { teaSlug: tea.slug ?? teaId, teaName, url: teaPath },
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        bellOk = true;
      } catch (err) {
        console.warn('[notifyBackInStock] bell write failed:', uid, err);
      }
      await sendPushToUser(uid, title, body, {
        type: 'customer_back_in_stock',
        notifId,
        url: teaPath,
      });

      let emailOk = false;
      const email = await getUserEmail(uid);
      if (email) {
        const lang = await getUserLang(uid);
        const msg = buildBackInStockEmail({
          brand: store,
          teaName: (lang === 'fr' && tea.nameFr?.trim()) || teaName,
          lang,
          teaUrl,
          teaImage: tea.image ?? '',
          price: typeof tea.price === 'number' ? tea.price : 0,
          explicitRequest,
        });
        emailOk = await sendEmail({ to: email, ...msg });
      } else {
        console.warn(`[notifyBackInStock] no email for uid=${uid} — bell/push only`);
      }
      if (!emailOk && !bellOk) return; // nothing delivered — keep notify set so the next restock retries
      sent++;

      if (explicitRequest) {
        await wishDoc.ref
          .update({
            notify: false,
            notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          })
          .catch((err) => console.warn('[notifyBackInStock] clearing notify failed:', uid, err));
      }
    }),
  );

  console.log(`[notifyBackInStock] ${teaId}: notified ${sent} of ${byUid.size} waiting`);
}

/** The customer's site language, saved on their profile by the app. */
async function getUserLang(uid: string): Promise<EmailLang> {
  try {
    return emailLang((await db().doc(`users/${uid}`).get()).data()?.lang);
  } catch {
    return 'en';
  }
}

async function getUserEmail(uid: string): Promise<string> {
  try {
    const fromProfile = String((await db().doc(`users/${uid}`).get()).data()?.email ?? '').trim();
    if (fromProfile) return fromProfile;
  } catch (err) {
    console.warn('[notifyBackInStock] profile lookup failed:', uid, err);
  }
  try {
    return (await admin.auth().getUser(uid)).email ?? '';
  } catch (err) {
    console.warn('[notifyBackInStock] auth lookup failed:', uid, err);
    return '';
  }
}

/** Email brand (name, address, contact, white logo) from Admin → Settings —
 *  the same builder every Ele Café email uses (lib/emailLayout.ts). */
async function getEmailBranding(): Promise<EmailBrand> {
  try {
    return emailBrandFrom((await db().doc('settings/global').get()).data());
  } catch (err) {
    console.warn('[notifyBackInStock] settings lookup failed, using defaults:', err);
    return emailBrandFrom({});
  }
}

/**
 * Self-healing seed: ensures /inventory_categories/tea exists.
 * Called fire-and-forget from onInventoryWrite. Idempotent — does
 * nothing if the doc already exists. This is the v2 equivalent of
 * "set up the tea category at deploy time" without needing a
 * separate migration step.
 */
async function ensureTeaCategorySeeded(): Promise<void> {
  const ref = db().doc('inventory_categories/tea');
  try {
    const snap = await ref.get();
    if (snap.exists) return;
    await ref.set({
      id: 'tea',
      name: 'Tea',
      model: 'level',
      unit: null,
      lowThreshold: null,
      sortOrder: 0,
      color: 'color-tea',
      isSystem: true,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('[inventory] Seeded /inventory_categories/tea');
  } catch (err) {
    console.warn('[inventory] tea-category seed skipped (non-fatal):', err);
  }
}

export const onInventoryWrite = functions.firestore.onDocumentWritten(
  // RESEND_API_KEY must be declared here or process.env won't have it
  // and every back-in-stock email is silently skipped.
  { region: REGION, document: 'inventory/{teaId}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    // v2: opportunistically seed the tea system category. Cheap (one
    // existence check on a known path) and self-healing — every
    // inventory write attempts it; first one wins. Fire-and-forget so
    // it never blocks the main trigger path.
    void ensureTeaCategorySeeded();

    const teaId = event.params.teaId;
    // Match project pattern (see onOrderWrite in index.ts): double
    // optional chain handles the case where event.data is itself
    // undefined. `.data()` returns undefined on non-existent snapshots,
    // so we get a clean null without separately checking .exists.
    const before = (event.data?.before?.data() as InventoryDoc | undefined) ?? null;
    const after = (event.data?.after?.data() as InventoryDoc | undefined) ?? null;

    // Deletion — clear the public fields on /teas/{teaId} and exit.
    if (!after) {
      try {
        await db().doc(`teas/${teaId}`).update({
          available: admin.firestore.FieldValue.delete(),
          availabilityLabel: admin.firestore.FieldValue.delete(),
        });
      } catch (err) {
        // tea may have been deleted in the same transaction — ignore
        console.warn(
          '[onInventoryWrite] Teas cleanup failed for deleted inventory doc:',
          teaId,
          err,
        );
      }
      return;
    }

    const level = typeof after.level === 'number' ? after.level : 0;
    const newStatus = deriveStatus(level);
    const oldStatus = before
      ? deriveStatus(typeof before.level === 'number' ? before.level : 0)
      : null;

    // 1. Project to /teas/{teaId} — the public-safe slice only.
    //
    //    BUG FIX (Phase 29): the original guard was `if (oldStatus !== newStatus)`
    //    which ONLY projected when the status CATEGORY changed (e.g. in_stock
    //    → out_of_stock). This means:
    //
    //      - Updating level 10→8 (both in_stock): oldStatus = newStatus =
    //        'in_stock' → guard BLOCKED projection → any stale `available: false`
    //        on the tea doc was NEVER repaired.
    //
    //      - Tea created via onTeaCreate (level auto-provisioned to 10):
    //        first projection runs correctly. But if the tea doc's `available`
    //        field was later corrupted by a manual Firestore edit or a bug in a
    //        previous deploy, and the admin then saves an in_stock→in_stock level
    //        change, the projection was blocked and the corruption persisted forever.
    //
    //    The result: Assam shows "10/10" in the admin inventory but "Out of stock"
    //    on every public page, the tea profile, and the gift builder.
    //
    //    Fix: ALWAYS project whenever the level is valid. The only time we skip
    //    is the self-triggered re-fire from step 1a below, where the inventory's
    //    status field was JUST written (same value, same level). We detect the
    //    re-fire by checking: level unchanged AND inventory `status` field was
    //    the only thing that changed (i.e. before.status ≠ newStatus but
    //    after.status === newStatus). In that case the previous trigger invocation
    //    already wrote the correct values — skip to avoid a harmless-but-wasteful
    //    second write.
    //
    //    Loop-safety proof:
    //      Fire 1 (admin writes level): project tea + 1a writes status → re-fire
    //      Fire 2 (1a re-fire): isStatusSyncRefire = true → skip projection;
    //                            after.status === newStatus → 1a blocked → done.
    //    Max 2 trigger invocations per admin write. ✓
    //
    //    Use update() not set(merge): if the tea doc doesn't exist
    //    (orphan inventory after a tea deletion, or a manual write to
    //    a stale id), set(merge) would CREATE a tea doc with only the
    //    inventory fields and no name/slug/etc — a worse-than-useless
    //    orphan. update() throws on missing doc; catch and skip. The
    //    inventory_logs entry still gets written below either way.
    const currentStatus = (after as { status?: string }).status;
    const isStatusSyncRefire =
      before !== null &&
      before.level === after.level &&
      currentStatus === newStatus &&
      ((before as { status?: string }).status ?? null) !== newStatus;

    if (!isStatusSyncRefire) {
      try {
        await db()
          .doc(`teas/${teaId}`)
          .update({
            available: newStatus !== 'out_of_stock',
            availabilityLabel: newStatus,
          });
        console.log(
          `[onInventoryWrite] projected ${teaId}: available=${newStatus !== 'out_of_stock'} (${newStatus})`,
        );
      } catch (err) {
        console.warn(`[onInventoryWrite] tea ${teaId} missing — projection skipped`, err);
      }
    }

    // 1a. If the inventory doc itself doesn't yet have the canonical
    //     `status` (clients can only write level/weight; security rules
    //     enforce this), write it back. This triggers a re-fire which
    //     short-circuits via isStatusSyncRefire above.
    if (currentStatus !== newStatus) {
      await db().doc(`inventory/${teaId}`).update({ status: newStatus });
    }

    // 2. Audit log — only when the level actually CHANGED. Skips the
    //    re-fire from 1a (same level) and skips the initial creation
    //    (no `before` doc). Creation isn't a level change, and the
    //    onTeaCreate trigger stamps `updatedBy: 'system:onTeaCreate'`
    //    which would otherwise produce a misleading "system changed
    //    matcha from 0→10" row in the admin's audit feed.
    if (before === null) return;
    const beforeLevel = typeof before?.level === 'number' ? before.level : null;
    if (beforeLevel !== null && beforeLevel === level) return;

    // Back-in-stock email: when a tea moves from out of stock to any
    // available state, notify everyone who wishlisted it.
    // Failures are logged, never thrown — the audit log below must still
    // be written.
    if (oldStatus === 'out_of_stock' && newStatus !== 'out_of_stock') {
      await notifyBackInStock(teaId, event.id).catch((err) =>
        console.error('[onInventoryWrite] back-in-stock notify failed:', teaId, err),
      );
    }

    await db()
      .collection('inventory_logs')
      .add({
        // v2 fields — written alongside the legacy ones for one release
        // cycle so older clients still render.
        kind: 'tea',
        targetId: teaId,
        categoryId: 'tea',
        previousValue: beforeLevel ?? 0,
        newValue: level,
        // Legacy fields — kept for clients on older bundles.
        teaId,
        previousLevel: beforeLevel ?? 0,
        newLevel: level,
        employeeName: after.updatedBy ?? 'unknown',
        previousStatus: deriveStatus(beforeLevel ?? 0),
        newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  },
);

/* -------------------------------------------------------------------------- */
/*               5.  onTeaDelete — trigger on /teas/{teaId} delete            */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*               4.  onTeaCreate — trigger on /teas/{teaId} create            */
/* -------------------------------------------------------------------------- */

/**
 * When an admin creates a new tea, auto-create the matching inventory
 * doc at level 10 (assumes newly-added means freshly-stocked). Without
 * this, the new tea would be missing from inventory queries until an
 * employee touched it.
 */
export const onTeaCreate = functions.firestore.onDocumentCreated(
  { region: REGION, document: 'teas/{teaId}' },
  async (event) => {
    const teaId = event.params.teaId;
    const ref = db().doc(`inventory/${teaId}`);

    // Defensive — if the migration script already pre-created the
    // inventory doc (or a manual seed exists), don't overwrite.
    const existing = await ref.get();
    if (existing.exists) return;

    await ref.set({
      teaId,
      level: 10,
      status: 'in_stock',
      weight: 2000, // a full container (2000 g = level 10)
      updatedBy: 'system:onTeaCreate',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },
);

/* -------------------------------------------------------------------------- */
/*               5.  onTeaDelete — trigger on /teas/{teaId} delete            */
/* -------------------------------------------------------------------------- */

/**
 * Cascade-delete the matching inventory doc when an admin deletes a
 * tea. Without this, inventory docs go stale (the tea they reference
 * no longer exists) and any later write to that inventory doc would
 * have the onInventoryWrite trigger fail-on-update its projection
 * write to /teas (which is the correct behaviour, but cleaner to not
 * leave the orphan inventory hanging around).
 *
 * We deliberately do NOT cascade-delete the inventory_logs entries —
 * they're an audit trail and should survive the tea deletion (e.g.,
 * "this tea was tracked for 3 months before being discontinued" is a
 * legitimate query later).
 */
export const onTeaDelete = functions.firestore.onDocumentDeleted(
  { region: REGION, document: 'teas/{teaId}' },
  async (event) => {
    const teaId = event.params.teaId;
    try {
      await db().doc(`inventory/${teaId}`).delete();
    } catch (err) {
      // Inventory may not exist (tea created and deleted before
      // onTeaCreate fired, or migration never wrote it). Safe to skip.
      console.warn(`onTeaDelete: inventory/${teaId} cleanup skipped`, err);
    }
  },
);

/* -------------------------------------------------------------------------- */
/*          6.  repairInventoryProjections — admin callable (one-shot repair) */
/* -------------------------------------------------------------------------- */

/**
 * One-shot repair: reads every /inventory/{teaId} doc and writes the
 * correct `available` + `availabilityLabel` fields onto the matching
 * /teas/{teaId} doc, regardless of whether the status "changed".
 *
 * WHY THIS EXISTS:
 *   The original onInventoryWrite guard (`if (oldStatus !== newStatus)`)
 *   only projected when the status category changed. Any tea doc whose
 *   `available` field was stale or missing — from a manual Firestore edit,
 *   a pre-inventory-system creation, or a bug in an older deploy — would
 *   NEVER be repaired by normal inventory edits if the level stayed in the
 *   same category (e.g. 10 → 8, both `in_stock`). This produces the symptom:
 *   "Assam shows 10/10 in the admin dashboard but Out of stock on public pages."
 *
 *   This callable fixes all affected teas in one admin button click.
 *   It is idempotent — safe to run multiple times.
 *
 * RESPONSE: { repaired: number, skipped: number, errors: string[] }
 *   repaired — docs where the projected fields were written
 *   skipped  — docs where /teas/{teaId} was missing (orphan inventory)
 *   errors   — any per-doc errors (non-fatal)
 */
export const repairInventoryProjections = functions.https.onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only.');
    }

    const inventorySnap = await db().collection('inventory').get();
    let repaired = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process in batches of 400 (Firestore batch limit is 500; we stay
    // safely under in case some writes are multi-operation).
    const BATCH_SIZE = 400;
    let batch = db().batch();
    let batchCount = 0;

    const flush = async () => {
      if (batchCount === 0) return;
      await batch.commit();
      batch = db().batch();
      batchCount = 0;
    };

    for (const invDoc of inventorySnap.docs) {
      const teaId = invDoc.id;
      const data = invDoc.data() as { level?: number };
      const level = typeof data.level === 'number' ? data.level : 0;
      const newStatus = deriveStatus(level);
      const available = newStatus !== 'out_of_stock';

      // Verify the tea doc exists before writing.
      const teaRef = db().doc(`teas/${teaId}`);
      try {
        const teaSnap = await teaRef.get();
        if (!teaSnap.exists) {
          skipped++;
          errors.push(`${teaId}: tea doc missing — orphan inventory`);
          continue;
        }
        const teaData = teaSnap.data() as
          { available?: boolean; availabilityLabel?: string } | undefined;
        // Skip if already correct — avoids unnecessary writes.
        if (teaData?.available === available && teaData?.availabilityLabel === newStatus) {
          continue;
        }
        batch.update(teaRef, { available, availabilityLabel: newStatus });
        batchCount++;
        repaired++;
        if (batchCount >= BATCH_SIZE) await flush();
      } catch (err) {
        errors.push(`${teaId}: ${String(err)}`);
      }
    }

    await flush();

    console.log(
      `[repairInventoryProjections] repaired=${repaired} skipped=${skipped} errors=${errors.length}`,
    );
    return { repaired, skipped, errors };
  },
);
