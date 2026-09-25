import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, initializeFirestore } from 'firebase/firestore';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from 'firebase/app-check';

export const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// ── Runtime env guard ────────────────────────────────────────────────────────
// vite.config.ts has a build-time guard that fails `vite build` if any
// required Firebase env var is missing. This is the runtime second line
// of defence:
//
//   • DEV: warn loudly via the console so a fresh clone sees the missing
//     keys before they hit a confusing "auth/invalid-api-key" error
//     trying to sign in.
//
//   • PROD: **hard throw**. Pre-fix this was a console.warn-only path —
//     a production build with a missing API key would boot the SPA,
//     show the landing page, and then silently fail every Firebase
//     call. Customers would see a working-looking site that couldn't
//     sign them in or accept orders. Throwing at module-load surfaces
//     the misconfig immediately and at the right layer (you find out
//     during smoke-test, not from a customer email).
//
//   The vite build-time guard SHOULD catch this earlier; the runtime
//   throw is here for any deploy path that bypasses `vite build`
//   (preview builds, hot reloads, etc.).

const REQUIRED_FIREBASE_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

function missingRequiredFirebaseVars(): string[] {
  return REQUIRED_FIREBASE_ENV.filter((k) => !import.meta.env[k]);
}

const _missing = missingRequiredFirebaseVars();
if (import.meta.env.DEV && _missing.length > 0) {
  console.warn(
    '[firebase] Missing required env vars: ' + _missing.join(', ') + '. ' +
    'Sign-in and Firestore writes will fail with auth/invalid-api-key. ' +
    'Add them to .env.local from Firebase Console → Project Settings → Web app config.',
  );
} else if (import.meta.env.PROD && _missing.length > 0) {
  // Hard fail. Throwing at module top-level means the app simply does
  // not boot — exactly what we want for a misconfigured deploy.
  const msg =
    '[firebase] CRITICAL: production build is missing required env vars: ' +
    _missing.join(', ') +
    '. The app cannot reach Firebase without them. Configure these in the ' +
    'deploy environment (Firebase Hosting build secrets / CI env / .env.production) ' +
    'and redeploy.';
  // Surface in both error consoles AND throw so monitoring picks it up.
  console.error(msg);
  throw new Error(msg);
}

// ── Optional non-Firebase env vars — soft warning, never fatal ───────────────
// These are nice-to-have at deploy time but their absence doesn't break
// the app:
//   • VITE_FIREBASE_APP_CHECK_KEY  — App Check token signer. When missing,
//     requests still go through but carry no token. If Console-side
//     Enforcement is ON, requests are rejected — but that's a misconfig
//     symptom, not an app-startup blocker.
//   • VITE_SENTRY_DSN              — error reporting. When missing,
//     errors only land in the browser console.
//   • VITE_RESEND_API_KEY          — used server-side, no client surface.
//     Listed for documentation only; not checked here.
//
// We surface ONE consolidated warning in prod so the deploy-time review
// has a single line to grep for.
if (import.meta.env.PROD) {
  const softMissing: string[] = [];
  if (!import.meta.env.VITE_FIREBASE_APP_CHECK_KEY) softMissing.push('VITE_FIREBASE_APP_CHECK_KEY (App Check disabled — requests will be rejected if Enforcement is ON in Console)');
  if (!import.meta.env.VITE_SENTRY_DSN)             softMissing.push('VITE_SENTRY_DSN (errors will only land in the browser console, not Sentry)');
  if (softMissing.length > 0) {
    console.warn('[firebase] Production preflight — optional env vars missing:\n  • ' + softMissing.join('\n  • '));
  }
}

/**
 * Programmatic preflight — call from monitoring / smoke tests / a
 * deploy-gate page to verify the runtime environment is wired up.
 * Returns `{ ok: true }` when every CRITICAL env var is present, or
 * `{ ok: false, missing: [...] }` listing what's absent.
 *
 * The optional-vars list (App Check, Sentry) is reported via
 * `softMissing` — present-but-degraded counts as ok:true.
 *
 * Usage in a deploy smoke test:
 *
 *   import { firebaseEnvPreflight } from '@/lib/firebase';
 *   const r = firebaseEnvPreflight();
 *   if (!r.ok) throw new Error('Deploy is broken: ' + r.missing.join(', '));
 */
export function firebaseEnvPreflight(): {
  ok: boolean;
  missing: string[];
  softMissing: string[];
} {
  const missing = missingRequiredFirebaseVars();
  const softMissing: string[] = [];
  if (!import.meta.env.VITE_FIREBASE_APP_CHECK_KEY) softMissing.push('VITE_FIREBASE_APP_CHECK_KEY');
  if (!import.meta.env.VITE_SENTRY_DSN)             softMissing.push('VITE_SENTRY_DSN');
  return {
    ok: missing.length === 0,
    missing,
    softMissing,
  };
}

// ── App Check debug token (DEV ONLY) ────────────────────────────────────────
// reCAPTCHA v3 doesn't issue tokens for localhost — Google's service
// requires a public domain. So in dev, we enable Firebase's debug provider
// which generates a randomised token that we register manually in
// Firebase Console → App Check → Apps → Manage debug tokens.
//
// CRITICAL: this assignment must happen BEFORE initializeAppCheck runs.
// The App Check SDK reads `self.FIREBASE_APPCHECK_DEBUG_TOKEN` at init
// time and decides whether to use the debug provider based on its value.
// Setting it after init has no effect — you'd get "AppCheck: ReCAPTCHA
// site key is required" errors instead.
//
// On first dev session, the SDK logs the generated token to the console:
//   "App Check debug token: 12345-abcd-... Add it in the Firebase
//    console to use it for testing."
// Copy that token into Console → Project Settings → App Check → Apps →
// your web app → ⋮ menu → Manage debug tokens. After registering, dev
// requests carry the debug token and pass App Check enforcement.
//
// In production builds (`import.meta.env.DEV === false`) this block is
// skipped entirely — Vite's dead-code elimination removes it from the
// shipped bundle, so the production app NEVER touches the debug provider.
if (import.meta.env.DEV) {
  // The cast is necessary because `self` doesn't have the property
  // typed by default — App Check augments globalThis at runtime.
  // Guard with typeof check so this doesn't crash in Node.js (vitest
  // runs unit tests in node environment where `self` is not defined).
  //
  // If VITE_APPCHECK_DEBUG_TOKEN is set, every browser uses that fixed
  // token (register it once); otherwise the SDK generates one per browser.
  if (typeof self !== 'undefined') {
    const fixedToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined;
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string })
      .FIREBASE_APPCHECK_DEBUG_TOKEN = fixedToken || true;
  }
}

// ── Firebase app ────────────────────────────────────────────────────────────
export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ── App Check ───────────────────────────────────────────────────────────────
// Initialize SYNCHRONOUSLY between initializeApp and initializeFirestore.
// Order matters: every Firebase SDK call that happens AFTER this point
// will attach an App Check token; calls that happen BEFORE it won't.
//
// Why initialize here rather than in a lazy module:
//   The whole point of App Check is to gate the very first Firestore /
//   Auth / Storage / Functions request. Lazy-loading it would create a
//   race window where early requests go out without tokens — exactly the
//   "outdated client" symptom the audit found in Firebase Console (44K
//   Firestore requests, 0 verified). Synchronous init eliminates the race.
//
// Why try/catch wraps it:
//   Init can fail for legitimate reasons in dev (missing site key, the
//   env var hasn't been added yet, the user hasn't registered the
//   provider in Firebase Console). We log loudly but don't crash —
//   App Check enforcement is OFF until the customer toggles it on in
//   the Console, so the app keeps working with reduced security guarantees
//   while a developer fixes the config.
let appCheck: AppCheck | null = null;
const APP_CHECK_KEY = import.meta.env.VITE_FIREBASE_APP_CHECK_KEY as string | undefined;

if (APP_CHECK_KEY) {
  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(APP_CHECK_KEY),
      // Auto-refresh tokens before they expire (default tokens last
      // 60min). Without this flag, long sessions would silently lose
      // their token and start failing requests. The refresh runs on
      // a timer in the background, no developer action needed.
      isTokenAutoRefreshEnabled: true,
    });
    if (import.meta.env.DEV) {
      console.log('[firebase] App Check initialized with reCAPTCHA v3 provider');
    }
  } catch (err) {
    // The most common cause: the site key in VITE_FIREBASE_APP_CHECK_KEY
    // is invalid, doesn't match this domain, or hasn't been registered
    // in Firebase Console → App Check → Apps. Other causes: network
    // blocked the reCAPTCHA loader script (corp firewall), or the Firebase
    // project doesn't have App Check enabled.
    console.error(
      '[firebase] App Check init failed — requests will not carry App Check tokens. ' +
      'If Enforcement is ON in Firebase Console, requests will be rejected. ' +
      'Cause:', err
    );
  }
} else if (import.meta.env.PROD) {
  // Production build with no key configured. This is a serious config
  // problem if Enforcement is on — every request will be rejected.
  console.warn(
    '[firebase] VITE_FIREBASE_APP_CHECK_KEY is not set. App Check tokens ' +
    'will not be sent. If Enforcement is enabled in Firebase Console, ' +
    'all Firestore/Auth/Storage/Functions requests will be rejected.'
  );
}

// Re-export for any callers that need to manually trigger token refresh
// (rare — auto-refresh covers the normal case).
export { appCheck };

// ── Firestore ───────────────────────────────────────────────────────────────
let dbInstance;
try {
  const isIOSWebKit = typeof navigator !== 'undefined'
    && /iP(hone|ad|od)/i.test(navigator.userAgent);

  dbInstance = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    // Stabilize realtime streams on networks/proxies that intermittently
    // break WebChannel streaming (seen as status:1 transport errors in the
    // console for Listen/Write RPCs). Auto-detect keeps normal fast paths
    // when possible, and falls back to long polling when streaming is flaky.
    experimentalAutoDetectLongPolling: !isIOSWebKit,
    // iOS WebKit is the most common source of stream reconnect churn.
    // Forcing long-polling there trades a tiny latency cost for much
    // higher connection stability.
    experimentalForceLongPolling: isIOSWebKit,
    // Avoid fetch-based streaming transport, which is more likely to be
    // interrupted by Safari/WebView/corporate proxy middleboxes.
    // Cast required: useFetchStreams is a valid Firestore SDK option but
    // the TypeScript type definition for FirestoreSettings omits it in
    // the current @firebase/firestore typings. Cast through unknown to
    // avoid widening the entire settings object.
  } as unknown as Parameters<typeof initializeFirestore>[1]);
} catch (err) {
  console.warn('[firebase] initializeFirestore failed, falling back to getFirestore():', err);
  dbInstance = getFirestore(app);
}

export const db = dbInstance;

/** Dev only: `VITE_USE_EMULATORS=1 npm run dev` points Firestore + Auth at
 *  the local Firebase emulators (never active in production builds). */
export const USE_EMULATORS = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === '1';
if (USE_EMULATORS) connectFirestoreEmulator(db, '127.0.0.1', 8080);

// ── Lazy submodules ──────────────────────────────────────────────────────────
// auth, storage, and functions are NOT eagerly imported here. The home page
// and product browsing don't use them — they're only needed when the user
// signs in (auth), uploads/downloads media (storage), or hits a callable
// (functions: checkout, recaptcha, admin actions). Deferring them keeps each
// module out of the modulepreload graph for the customer's first paint.
//
// App Check note: even though these load lazily, they pick up App Check
// tokens automatically because App Check is bound to the FirebaseApp
// instance, not to individual SDKs. By the time auth/storage/functions
// load and make their first request, App Check has already been initialized
// above and the token is ready to attach.
//
// The promise-cache pattern means concurrent callers share one network
// fetch — first call triggers the dynamic import, subsequent calls await
// the already-resolved promise.
let authModPromise:      Promise<typeof import('./firebaseAuthLazy')>      | null = null;
let storageModPromise:   Promise<typeof import('./firebaseStorageLazy')>   | null = null;
let functionsModPromise: Promise<typeof import('./firebaseFunctionsLazy')> | null = null;

export function getAuthLazy() {
  if (!authModPromise) authModPromise = import('./firebaseAuthLazy');
  return authModPromise;
}

export function getStorageLazy() {
  if (!storageModPromise) storageModPromise = import('./firebaseStorageLazy');
  return storageModPromise;
}

export function getFunctionsLazy() {
  if (!functionsModPromise) functionsModPromise = import('./firebaseFunctionsLazy');
  return functionsModPromise;
}
