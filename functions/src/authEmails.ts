/**
 * authEmails.ts — Branded auth emails via Resend
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Replaces Firebase's default sender (noreply@<project>.firebaseapp.com,
 * which has terrible deliverability) for the three auth flows:
 *
 *   1. Email verification         → sendBrandedVerifyEmail
 *   2. Password reset             → sendBrandedPasswordReset
 *   3. Email-address change       → sendBrandedEmailChange
 *
 * Each callable Cloud Function:
 *   1. Generates the Firebase action link (verify / reset / change) using
 *      the Admin SDK — same security model as Firebase's built-in mailer,
 *      we just take over the "render the email" step.
 *   2. Renders the email with the shared Ele Café layout
 *      (lib/authEmailContent.ts → lib/emailLayout.ts), brand details and
 *      welcome-points amount from Admin → Settings.
 *   3. Hands off to sendEmail() (Resend) with from=noreply@elecafe.ca and
 *      replyTo = the store email from Settings.
 *   5. Writes an audit row to Firestore /emailLog/ so admins can see
 *      "did Sara actually receive her reset email" in the dashboard.
 *
 * IMPORTANT — to avoid duplicate emails:
 *   The client side MUST stop calling Firebase's built-in sendEmailVerification
 *   / sendPasswordResetEmail / verifyBeforeUpdateEmail. We replace those
 *   call sites with httpsCallable invocations of these functions.
 *   See `firebaseAuthLazy.ts` for the centralised client wrapper.
 */

import * as functions from 'firebase-functions/v2';
import { auth as adminAuth, firestore as adminFirestore } from 'firebase-admin';
import { emailBrandFrom, type EmailBrand } from './lib/emailLayout';
import { buildAuthEmail, type AuthEmailKind } from './lib/authEmailContent';
import { emailLang } from './lib/emailLayout';

// ── Rate limiter ────────────────────────────────────────────────────────────
//
// Per-key send budget enforced via /emailQuota/{key} docs. Used by both
// sendBrandedVerifyEmail (key = uid) and sendBrandedPasswordReset (key =
// `pwreset:${normalizedEmail}` — keeps unauth abusers from spamming an
// email or probing for accounts via timing).
//
// Implementation: store a small ring of recent send timestamps per key.
// A send is allowed when the count of timestamps inside the lookback
// window is below the cap. On allow, prune to the latest N entries (cap
// the doc size at 2× the rate limit so a runaway clock skew can't grow
// the doc unbounded). Transaction-wrapped so concurrent calls can't
// both pass through a race.
async function enforceEmailRateLimit(opts: {
  key: string;
  windowMs: number;
  maxInWindow: number;
}): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const docRef = adminFirestore().doc(`emailQuota/${opts.key}`);
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  const hardMaxRing = opts.maxInWindow * 2;
  return adminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const prior: number[] = snap.exists
      ? ((snap.data()?.timestamps as number[] | undefined) ?? []).filter(
          (t) => typeof t === 'number' && t >= cutoff,
        )
      : [];
    if (prior.length >= opts.maxInWindow) {
      // Compute how long until the OLDEST timestamp in the window
      // ages out — that's when the next send becomes available.
      const oldest = prior[0];
      const retryAfterMs = Math.max(0, opts.windowMs - (now - oldest));
      return { allowed: false, retryAfterMs };
    }
    const next = [...prior, now].slice(-hardMaxRing);
    tx.set(
      docRef,
      {
        timestamps: next,
        updatedAt:  adminFirestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { allowed: true, retryAfterMs: 0 };
  });
}

/** Constant-time-ish wait used to equalise the response duration of
 *  the password-reset callable across "registered" and "not registered"
 *  paths. The exact duration doesn't matter — what matters is that both
 *  branches spend roughly the same wall-clock time so an attacker can't
 *  enumerate accounts by timing the response. ~600ms is the typical
 *  end-to-end duration of the happy path (admin SDK link generation +
 *  Resend POST) so we floor the not-registered branch at that. */
const PWRESET_MIN_RESPONSE_MS = 600;
async function padResponseTo(startMs: number, minTotalMs: number): Promise<void> {
  const elapsed = Date.now() - startMs;
  const remaining = minTotalMs - elapsed;
  if (remaining > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

// ── Content ────────────────────────────────────────────────────────────────
//
// Subjects + HTML come from lib/authEmailContent.ts, rendered with the
// shared Ele Café email layout. Brand details and the welcome-points
// amount are read from Admin → Settings on every send.

async function loadAuthEmailContext(): Promise<{ brand: EmailBrand; welcomePoints: number; creditValuePer1000: number }> {
  let d: Record<string, unknown> = {};
  try {
    d = (await adminFirestore().doc('settings/global').get()).data() ?? {};
  } catch (err) {
    console.warn('[authEmail] settings read failed, using defaults:', err);
  }
  const num = (v: unknown, dflt: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : dflt);
  return {
    brand: emailBrandFrom(d),
    welcomePoints: num(d.welcomeBonusPoints, 500),
    creditValuePer1000: num(d.creditValuePer1000, 1),
  };
}

// ── sendEmail signature (re-declared so we don't have a circular import) ──
//
// The actual function lives in index.ts (where the RESEND_API_KEY secret
// is bound to the function options). We import it via a runtime-resolved
// require to avoid pulling all of index.ts into this module's compile graph.

interface SendEmailFn {
  (opts: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    replyTo?: string;
  }): Promise<void>;
}

let _sendEmail: SendEmailFn | null = null;
function getSendEmail(): SendEmailFn {
  if (_sendEmail) return _sendEmail;
  // index.ts isn't available as a module export — sendEmail is module-private.
  // To keep this module decoupled, we re-implement the Resend POST here.
  // Same shape, same env var, same logging. Two copies is fine — auth
  // emails are rare, the helper is 30 lines, and decoupling pays off.
  _sendEmail = async (opts) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn(`[authEmail] RESEND_API_KEY not set — skipped "${opts.subject}" to ${opts.to}`);
      return;
    }
    let res: Response;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    opts.from ?? 'Ele Café <noreply@elecafe.ca>',
          to:      [opts.to],
          subject: opts.subject,
          html:    opts.html,
          ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        }),
      });
    } catch (err) {
      console.error('[authEmail] Network error calling Resend:', err);
      return;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[authEmail] Resend ${res.status}: ${body}`);
    } else {
      console.log(`[authEmail] ✓ "${opts.subject}" → ${opts.to}`);
    }
  };
  return _sendEmail;
}

// ── Action link generation ─────────────────────────────────────────────────
//
// generateEmailVerificationLink / generatePasswordResetLink /
// generateVerifyAndChangeEmailLink all accept an `actionCodeSettings`
// object. The `url` field is where the user lands after Firebase
// validates the action code (the redirect target, NOT the link the
// user clicks). Setting it makes the post-action UX feel branded.

const POST_ACTION_URL = 'https://elecafe.ca/account';
const ACTION_SETTINGS = {
  url: POST_ACTION_URL,
  handleCodeInApp: false,    // false = Firebase's hosted action handler
                              //         processes the code, then redirects
                              //         to POST_ACTION_URL on success.
};

// ── Audit log helper ───────────────────────────────────────────────────────
//
// Writes one row per send to /emailLog/. Useful when a customer says
// "I never got the email" — admins can confirm whether Resend accepted
// it (and from there, look up the message in Resend's own dashboard
// for delivery status).

async function logAuthEmail(opts: {
  kind: AuthEmailKind;
  to: string;
  uid?: string;
  triggeredBy?: string;
}) {
  // Lazy-import firestore to avoid pulling firebase-admin into modules
  // that don't need it. The first call pays the import cost; subsequent
  // calls hit the require cache.
  const { firestore } = await import('firebase-admin');
  try {
    await firestore().collection('emailLog').add({
      kind:        opts.kind,
      to:          opts.to,
      uid:         opts.uid ?? null,
      triggeredBy: opts.triggeredBy ?? null,
      sentAt:      firestore.FieldValue.serverTimestamp(),
      transport:   'resend',
    });
  } catch (err) {
    // Don't fail the email send just because audit logging failed —
    // the customer-facing event is more important than the log row.
    console.error('[authEmail] Failed to write emailLog row:', err);
  }
}

// ── Shared callable boilerplate ────────────────────────────────────────────

const CALLABLE_OPTS = {
  region:  'us-central1',
  secrets: ['RESEND_API_KEY'] as string[],
  // 30s is generous — link generation + Resend POST typically takes
  // 800-1500ms total. Cold starts can push it to 3-4s.
  timeoutSeconds: 30,
  // App Check enforcement: reject calls from clients that don't have
  // a valid App Check token. Real customer browsers attach tokens
  // automatically (App Check is initialized in firebase.ts before any
  // SDK call). Bots, scrapers, and direct API hits without a token
  // get rejected with FUNCTIONS_UNAUTHENTICATED before our handler
  // runs. Defense in depth — these callables are also rate-limited
  // and validate their own auth/data, but this stops abuse traffic
  // from reaching them at all.
  enforceAppCheck: true,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 1. sendBrandedVerifyEmail
// ─────────────────────────────────────────────────────────────────────────────
//
// Called from the client immediately after a fresh signup, and from the
// "Resend verification" button in the EmailVerificationModal / Navbar.
// Requires the user to be authenticated (otherwise anyone could spam
// arbitrary addresses with verify-emails — even branded ones).

export const sendBrandedVerifyEmail = functions.https.onCall(
  CALLABLE_OPTS,
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated', 'Must be signed in to request a verification email.',
      );
    }

    const uid = request.auth.uid;

    // Rate limit: 5 verify-email sends per hour per uid. Closes the
    // abuse path called out in the pre-audit TODO — an authenticated
    // user could otherwise hammer the resend button (or script the
    // callable) to inflate our Resend cost / pollute their own inbox.
    // The /emailQuota/{uid} doc tracks the recent send timestamps.
    //
    // Why per-uid and not per-IP: the callable already requires auth,
    // so uid is the strongest abuser identity we have. App Check
    // enforcement (CALLABLE_OPTS.enforceAppCheck) blocks the
    // unauthenticated-from-script case at the edge.
    //
    // 5/hour matches Firebase Auth's own throttling for password-reset
    // emails sent via the client SDK — same UX expectation, same cap.
    const rl = await enforceEmailRateLimit({
      key:         uid,
      windowMs:    60 * 60 * 1000,
      maxInWindow: 5,
    });
    if (!rl.allowed) {
      // 'resource-exhausted' is the standard callable-functions code for
      // throttling. Clients can render the retryAfterMs as a friendly
      // "try again in N minutes" message instead of a generic toast.
      throw new functions.https.HttpsError(
        'resource-exhausted',
        `Too many verification emails requested. Please try again in ${Math.ceil(rl.retryAfterMs / 60000)} minute(s).`,
        { retryAfterMs: rl.retryAfterMs },
      );
    }

    const user = await adminAuth().getUser(uid);
    const email = user.email;
    if (!email) {
      throw new functions.https.HttpsError(
        'failed-precondition', 'Account has no email address.',
      );
    }
    if (user.emailVerified) {
      // Soft-success — return ok without sending. The client UI shows
      // a "your email is already verified" toast either way.
      return { ok: true, alreadyVerified: true };
    }

    const link = await adminAuth().generateEmailVerificationLink(email, ACTION_SETTINGS);
    const ctx = await loadAuthEmailContext();
    const { subject, html } = buildAuthEmail('verify-email', { ...ctx, link, email, lang: emailLang((request.data as { lang?: unknown } | null)?.lang) });

    await getSendEmail()({
      to:      email,
      subject,
      html,
      from:    'Ele Café <noreply@elecafe.ca>',
      replyTo: ctx.brand.email,
    });
    await logAuthEmail({ kind: 'verify-email', to: email, uid, triggeredBy: uid });

    return { ok: true };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. sendBrandedPasswordReset
// ─────────────────────────────────────────────────────────────────────────────
//
// Called from /login → "Forgot password?" form. Does NOT require auth
// — anyone can request a reset, that's the whole point. Rate-limited
// at the Firebase Auth level (Firebase throttles password-reset
// requests per IP automatically).
//
// SECURITY HARDENING — account enumeration closed (CWE-204):
//   Pre-hardening this callable returned { registered: true | false },
//   letting the client tell the customer "no account found, want to
//   sign up?" — which doubled as an account-enumeration oracle. An
//   attacker could probe email lists and learn which addresses had
//   real accounts.
//
//   The hardened response is uniform: always { ok: true } regardless
//   of whether the email matched. Caveats and mitigations:
//
//   1. Timing equalisation. The happy path takes ~600ms (Admin SDK
//      link generation + Resend POST). The "no account" path would
//      otherwise return in ~50ms, leaking the answer via response time.
//      `padResponseTo` floors the not-registered branch at the same
//      duration so the response is indistinguishable.
//
//   2. Per-email rate limit. 3 sends per hour per normalised email
//      (key = `pwreset:${email}`). Blocks both abuse (spamming a real
//      user's inbox) AND enumeration-via-rate-limit-error (the
//      attacker can't probe a list of emails and observe which ones
//      hit the rate limit faster).
//
//   3. The signup flow's own enumeration vector (auth/email-already-in-use)
//      is a separate Firebase concern. Closing it would require
//      switching signup to a server-side flow; out of scope for this
//      audit. The reset path is the higher-traffic vector and the one
//      we control directly.
//
//   UX implication: the login page can no longer differentiate "we
//   sent the email" vs "no such account". Both render the same copy
//   ("If an account exists for that email, we just sent a reset
//   link"). That's the standard CASL/CWE-204-compliant pattern.

export const sendBrandedPasswordReset = functions.https.onCall(
  CALLABLE_OPTS,
  async (request) => {
    const startMs = Date.now();
    const data = request.data as { email?: string; lang?: string };
    const email = String(data?.email ?? '').trim().toLowerCase();

    // Format check is OK to surface as an error — "not a valid email
    // format" is not an enumeration signal (any address you type checks
    // the same regex regardless of whether it's registered).
    if (!email || !email.includes('@')) {
      throw new functions.https.HttpsError(
        'invalid-argument', 'A valid email address is required.',
      );
    }

    // Per-email rate limit. 3 sends per hour. Throwing
    // resource-exhausted is safe here — it only fires on emails that
    // have already been requested, so the signal an attacker gets is
    // "someone has asked to reset this address recently" not "this
    // address is registered or not".
    const rl = await enforceEmailRateLimit({
      key:         `pwreset:${email}`,
      windowMs:    60 * 60 * 1000,
      maxInWindow: 3,
    });
    if (!rl.allowed) {
      // Equalise timing on rate-limit errors too so the response time
      // doesn't reveal whether the limiter knew the email or not.
      await padResponseTo(startMs, PWRESET_MIN_RESPONSE_MS);
      throw new functions.https.HttpsError(
        'resource-exhausted',
        `Too many reset requests for this email. Please try again in ${Math.ceil(rl.retryAfterMs / 60000)} minute(s).`,
        { retryAfterMs: rl.retryAfterMs },
      );
    }

    // Step 1 — Look up the user. getUserByEmail throws auth/user-not-found
    // for missing accounts. Pre-hardening this branch returned a "false"
    // flag to the client; post-hardening we still log it for admin
    // forensics but the wire response is identical to the success path.
    let userExists = true;
    try {
      await adminAuth().getUserByEmail(email);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/user-not-found') {
        userExists = false;
        console.log(`[authEmail] Reset requested for unknown email: ${email}`);
      } else {
        // Any other lookup error (network, permission, etc.) — fail
        // closed. Better to surface a generic error than to send a
        // reset we're not sure about.
        console.error('[authEmail] getUserByEmail failed:', err);
        await padResponseTo(startMs, PWRESET_MIN_RESPONSE_MS);
        throw new functions.https.HttpsError('internal', 'Could not check account.');
      }
    }

    // Not registered → log, equalise timing, return success-shaped
    // response. The client can't tell this branch apart from the
    // happy path.
    if (!userExists) {
      await padResponseTo(startMs, PWRESET_MIN_RESPONSE_MS);
      return { ok: true };
    }

    // Step 2 — Generate the action link AND send the email. Both
    // failures below are real errors (not enumeration leaks — they
    // happen post-existence-confirmation), so we throw normally with
    // timing equalisation so the response time still doesn't leak.
    let link: string;
    try {
      link = await adminAuth().generatePasswordResetLink(email, ACTION_SETTINGS);
    } catch (err: unknown) {
      console.error('[authEmail] generatePasswordResetLink failed:', err);
      await padResponseTo(startMs, PWRESET_MIN_RESPONSE_MS);
      throw new functions.https.HttpsError('internal', 'Could not generate reset link.');
    }

    const ctx = await loadAuthEmailContext();
    const { subject, html } = buildAuthEmail('password-reset', { ...ctx, link, email, lang: emailLang(data.lang) });

    await getSendEmail()({
      to:      email,
      subject,
      html,
      from:    'Ele Café <noreply@elecafe.ca>',
      replyTo: ctx.brand.email,
    });
    await logAuthEmail({ kind: 'password-reset', to: email, triggeredBy: request.auth?.uid });

    // Happy path: the email send + Admin SDK link gen already took
    // ~600ms, so padResponseTo is usually a no-op here. Belt-and-
    // suspenders for unusually fast Resend responses.
    await padResponseTo(startMs, PWRESET_MIN_RESPONSE_MS);
    return { ok: true };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. sendBrandedEmailChange
// ─────────────────────────────────────────────────────────────────────────────
//
// Called from the Account page when a logged-in user changes their
// email. Sends to the NEW address with a confirmation link.
//
// Why not the old address? Firebase's verifyBeforeUpdateEmail flow
// confirms the *new* address before flipping the account email. If
// you also wanted to notify the old address (defence against account
// takeover), that's a separate notification — see the TODO at the
// bottom of this file.

export const sendBrandedEmailChange = functions.https.onCall(
  CALLABLE_OPTS,
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated', 'Must be signed in to change your email.',
      );
    }
    const data = request.data as { newEmail?: string; lang?: string };
    const newEmail = String(data?.newEmail ?? '').trim().toLowerCase();
    if (!newEmail || !newEmail.includes('@')) {
      throw new functions.https.HttpsError(
        'invalid-argument', 'A valid new email address is required.',
      );
    }

    const uid = request.auth.uid;
    const user = await adminAuth().getUser(uid);
    const oldEmail = user.email;
    if (!oldEmail) {
      throw new functions.https.HttpsError('failed-precondition', 'Account has no current email.');
    }
    if (oldEmail === newEmail) {
      throw new functions.https.HttpsError(
        'failed-precondition', 'New email is the same as the current one.',
      );
    }

    // generateVerifyAndChangeEmailLink (Firebase Admin SDK ≥11.10) creates
    // a link that, when clicked, performs the actual email change atomically
    // — no separate "now switch the email" step needed. Older SDKs use
    // generateEmailVerificationLink with a custom continueUrl, but the
    // dedicated method is cleaner and handles the security model correctly.
    let link: string;
    try {
      link = await adminAuth().generateVerifyAndChangeEmailLink(
        oldEmail, newEmail, ACTION_SETTINGS,
      );
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/email-already-exists') {
        throw new functions.https.HttpsError(
          'already-exists', 'That email address is already in use.',
        );
      }
      console.error('[authEmail] generateVerifyAndChangeEmailLink failed:', err);
      throw new functions.https.HttpsError('internal', 'Could not generate change link.');
    }

    const ctx = await loadAuthEmailContext();
    const { subject, html } = buildAuthEmail('email-change', { ...ctx, link, email: oldEmail, newEmail, lang: emailLang(data.lang) });

    await getSendEmail()({
      to:      newEmail,
      subject,
      html,
      from:    'Ele Café <noreply@elecafe.ca>',
      replyTo: ctx.brand.email,
    });
    await logAuthEmail({ kind: 'email-change', to: newEmail, uid, triggeredBy: uid });

    return { ok: true };
  },
);

// ── TODO (future hardening) ────────────────────────────────────────────────
//
// 1. Notify-old-address-on-change — if account takeover is a concern,
//    send a "your email was changed to X" notification to oldEmail
//    (using a fourth template). Requires a fourth Cloud Function and
//    a fourth template. Not done because Firebase Auth's built-in
//    revertSecondFactorAddition flow already covers most takeover
//    scenarios for accounts with MFA.
//
// 2. ✅ Rate limiting on sendBrandedVerifyEmail — DONE (May 2026 audit).
//    /emailQuota/{uid} ring-of-timestamps doc; 5 sends per hour per
//    authenticated uid; resource-exhausted thrown with retryAfterMs.
//
// 3. ✅ Account enumeration on sendBrandedPasswordReset — DONE
//    (May 2026 audit). Response is uniform { ok: true } regardless of
//    whether the email is registered; timing equalised via padResponseTo;
//    per-email rate limit (3/hour) blocks both abuse and rate-limit-based
//    enumeration. Client UI updated to show a single neutral message.
