/**
 * firebaseAuthLazy.ts — Auth helpers
 *
 * Drop-in replacements for Firebase's built-in mailers:
 *   sendEmailVerification(user, settings?)     → calls sendBrandedVerifyEmail
 *   sendPasswordResetEmail(auth, email)        → calls sendBrandedPasswordReset
 *   verifyBeforeUpdateEmail(user, newEmail)    → calls sendBrandedEmailChange
 *
 * Why we replaced them:
 *   Firebase's default sender is noreply@<project>.firebaseapp.com which
 *   has poor deliverability — Gmail / Outlook silently drop a chunk of
 *   them. Routing auth mail through our Resend pipeline gets us:
 *     • Branded HTML (matches order emails)
 *     • Verified @elecafe.ca sender (much better deliverability)
 *     • One unified email pipeline (one API key, one place to debug)
 *
 * The signatures intentionally mirror the Firebase ones so every call
 * site only changes by a few characters — see Navbar.tsx, AuthContext.tsx,
 * EmailVerificationModal.tsx for the migrations.
 */

import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup as fbSignInWithPopup,
  signInWithRedirect as fbSignInWithRedirect,
  getRedirectResult as fbGetRedirectResult,
  GoogleAuthProvider,
  reload,
  type Auth,
  type AuthProvider,
  type User,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, USE_EMULATORS } from './firebase';
import { useLanguageStore } from '@/store/languageStore';
import type { Lang } from '@/i18n/translations';

/** Account emails go out in the language the site is showing. */
const siteLang = (): Lang => useLanguageStore.getState().language;

// initializeAuth (not getAuth) so the Google sign-in helper — a ~90 KB
// /__/auth/iframe.js plus Google's gapi script — isn't loaded on every
// page view. Only the popup/redirect calls below bring it in, by passing
// the resolver explicitly. Same persistence order getAuth uses.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
});
if (USE_EMULATORS) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

// Functions instance — region must match the deployed Cloud Functions
// (us-central1, see CALLABLE_OPTS in functions/src/authEmails.ts).
const functions = getFunctions(app, 'us-central1');

// ── Callable wrappers ───────────────────────────────────────────────────────
// These return Promise<void> to match the Firebase SDK signatures the rest
// of the app already calls. Errors propagate so the existing try/catch
// blocks at the call sites continue to work unchanged.

const _sendBrandedVerify = httpsCallable<unknown, { ok: boolean; alreadyVerified?: boolean }>(
  functions,
  'sendBrandedVerifyEmail',
);
const _sendBrandedReset = httpsCallable<{ email: string; lang: Lang }, { ok: boolean }>(
  functions,
  'sendBrandedPasswordReset',
);
const _sendBrandedChange = httpsCallable<{ newEmail: string; lang: Lang }, { ok: boolean }>(
  functions,
  'sendBrandedEmailChange',
);

/**
 * Sends a branded verification email to the currently signed-in user.
 *
 * The second argument (`settings`) used to be Firebase's `actionCodeSettings`.
 * We accept and ignore it for backwards compatibility with existing call
 * sites — the Cloud Function uses a fixed POST_ACTION_URL pointing at
 * /account, which is what every existing call site was passing anyway.
 *
 * Rate-limited server-side: 5 sends per hour per uid. Throws
 * functions/resource-exhausted with a retryAfterMs payload when the cap
 * is hit. Callers should surface a friendly "try again in N minutes"
 * message instead of an opaque error toast.
 */
export async function sendEmailVerification(
  _user: User, // unused — server reads request.auth.uid
  _settings?: unknown, // unused — see comment above
): Promise<void> {
  await _sendBrandedVerify({ lang: siteLang() });
}

/**
 * Sends a branded password reset email if the email is registered.
 *
 * Security-hardened return shape: ALWAYS resolves successfully on any
 * known-email-shape input. Does NOT tell the caller whether the email
 * matched a real account — the response is uniform on purpose so the
 * UI can't be used as an account-enumeration oracle (see authEmails.ts
 * for the full rationale, including timing equalisation and per-email
 * rate limiting at 3/hour).
 *
 * Throws on unrecoverable errors (invalid email format, internal
 * Firebase failure, rate limit hit). Callers should render a single
 * neutral confirmation regardless of whether the email was actually
 * sent: "If an account exists for that address, we've sent a reset
 * link." Differential modals ("we sent it" vs "no such account") are
 * the leak that prompted this change.
 */
export async function sendPasswordResetEmail(_auth: unknown, email: string): Promise<void> {
  await _sendBrandedReset({ email, lang: siteLang() });
}

/**
 * Sends a branded "confirm your new email" email to the new address.
 * Replaces Firebase's verifyBeforeUpdateEmail. The actual email change
 * happens server-side when the user clicks the link (Firebase's hosted
 * action handler processes the code and updates the account email).
 */
export async function verifyBeforeUpdateEmail(_user: User, newEmail: string): Promise<void> {
  await _sendBrandedChange({ newEmail, lang: siteLang() });
}

// ── Google sign-in (popup, with redirect fallback) ─────────────────────────
// A redirect sign-in sets this flag, so only the page load that returns
// from Google checks for a result (and loads the iframe to do it).
const REDIRECT_FLAG = 'ele:authRedirect';

export function signInWithPopup(a: Auth, provider: AuthProvider) {
  return fbSignInWithPopup(a, provider, browserPopupRedirectResolver);
}

export function signInWithRedirect(a: Auth, provider: AuthProvider) {
  try {
    sessionStorage.setItem(REDIRECT_FLAG, '1');
  } catch {
    /* storage blocked: the result check below is skipped */
  }
  return fbSignInWithRedirect(a, provider, browserPopupRedirectResolver);
}

export async function getRedirectResult(a: Auth) {
  try {
    if (sessionStorage.getItem(REDIRECT_FLAG) !== '1') return null;
    sessionStorage.removeItem(REDIRECT_FLAG);
  } catch {
    return null;
  }
  return fbGetRedirectResult(a, browserPopupRedirectResolver);
}

export {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  reload,
};
