/**
 * playwright.setup.ts — Global setup for the visual + a11y test suites.
 *
 * Phase 0.4 of the UI/UX roadmap. Mints a Firebase custom token for
 * each test UID via the testLogin Cloud Function, signs the
 * Playwright browser in once, and persists the resulting Firebase
 * Auth state to disk as `tests/.auth/{user,admin}.json`. Subsequent
 * test runs reuse those state files via Playwright's `storageState`
 * option, so every test starts already-signed-in without paying the
 * sign-in cost on every test.
 *
 * What the protected projects in playwright.config.ts now cover:
 *   user-state  → /checkout, /orders, /account
 *   admin-state → /admin/* (every page in the tree)
 *
 * Hard preconditions (your CI must satisfy these):
 *   1. The TEST Firebase project has the testLogin function deployed
 *      AND the ALLOW_TEST_LOGIN env var set to '1' on the function.
 *      Production Firebase projects MUST NOT set this var.
 *
 *   2. Two auth users exist in the test project with the fixed UIDs
 *      below. Provision once via:
 *          firebase auth:import users.json --hash-algo HMAC_SHA256
 *      where users.json contains entries for these UIDs. The
 *      passwords don't matter (we never use password sign-in here).
 *
 *   3. The user `playwright-test-user` has at least one order in the
 *      test project's Firestore so /orders renders something
 *      meaningful (rather than the empty state, which is also fine
 *      for visual regression but less informative). Set up via your
 *      seed script or admin actions on the test project.
 *
 *   4. The user `playwright-test-admin` has the `admin: true` custom
 *      claim. The testLogin function adds this claim AT MINT TIME so
 *      every refresh of the storageState is admin-claim-equipped, but
 *      Firestore's security rules check the doc-level role too — make
 *      sure either the rules accept request.auth.token.admin === true,
 *      OR the test admin's user doc has role: 'admin'. The current
 *      rules use the latter (`request.auth.token.role == 'admin'`), so
 *      seed `users/playwright-test-admin` with `role: 'admin'`.
 *
 * Local usage:
 *   Without the test Firebase project + env, the auth-bearing test
 *   projects are simply skipped (the fixture catches the network
 *   failure and the test reports an actionable "couldn't sign in"
 *   message). The non-auth `desktop` and `mobile` projects continue
 *   to run normally, exactly as before.
 */
import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const AUTH_DIR = path.resolve(__dirname, 'tests/.auth');

/* The exact UIDs the testLogin Cloud Function whitelists. Changing
 * these without changing the function won't work — the function
 * rejects unknown UIDs with 403. */
const TEST_USER_UID  = 'playwright-test-user';
const TEST_ADMIN_UID = 'playwright-test-admin';

const userStatePath  = path.join(AUTH_DIR, 'user.json');
const adminStatePath = path.join(AUTH_DIR, 'admin.json');

/* The base URL is the same one every Playwright project uses to talk
 * to the dev server. We also need a way to reach the testLogin Cloud
 * Function — which can be either:
 *   a) the dev server with Firebase emulator rewrites (default), or
 *   b) a direct Cloud Functions URL via env override.
 */
const BASE_URL    = process.env.PLAYWRIGHT_BASE_URL    || 'http://localhost:5173';
const TEST_LOGIN  = process.env.PLAYWRIGHT_TEST_LOGIN  || `${BASE_URL}/api/test-login`;

async function buildAuthState(uid: string, outFile: string): Promise<void> {
  // 1. Mint a custom token via the function. If this fails we want a
  //    descriptive error so the developer knows what to fix.
  let customToken: string;
  try {
    const url  = `${TEST_LOGIN}?uid=${encodeURIComponent(uid)}`;
    const resp = await fetch(url, { method: 'POST' });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '<unreadable>');
      throw new Error(
        `testLogin returned ${resp.status} ${resp.statusText} for uid=${uid}\n` +
        `  URL: ${url}\n` +
        `  Body: ${text}\n\n` +
        `Likely causes:\n` +
        `  • ALLOW_TEST_LOGIN env not set on the function (production safety gate).\n` +
        `  • UID '${uid}' not whitelisted in functions/src/index.ts testLogin.\n` +
        `  • The function isn't deployed or rewrite isn't wired in firebase.json.`
      );
    }
    customToken = (await resp.text()).trim();
  } catch (err) {
    throw new Error(
      `[playwright.setup] Failed to mint test token for uid=${uid}: ${(err as Error).message}\n\n` +
      `If this is local dev without a test Firebase project, you can:\n` +
      `  • Start the Firebase emulator suite: firebase emulators:start --only auth,functions,firestore\n` +
      `  • Set ALLOW_TEST_LOGIN=1 on the function (already required in prod-test).\n` +
      `  • Or skip auth-protected tests by running:  npm run test:visual -- --project=desktop --project=mobile\n`
    );
  }

  // 2. Open a browser, navigate to the app, sign in with the custom
  //    token via the Firebase JS SDK that's already loaded in the page.
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page    = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Inject the token + sign in. We dynamically import firebase/auth
    // from inside the running app's bundle so we get whatever Firebase
    // version the app actually uses (avoiding skew between the test's
    // node-side SDK and the browser-side SDK).
    await page.evaluate(async (token) => {
      const auth = await import('firebase/auth');
      const app  = await import('firebase/app');

      // The app's init module is at /src/lib/firebase.ts via Vite's
      // dev server module rewriting. In production builds it's a
      // hashed chunk, so we can't import('/src/...'); instead, we
      // rely on the fact that the page has already initialized
      // Firebase (initRUM/initSentry both run after createRoot, and
      // the app's own auth context kicks Firebase init by then).
      //
      // We just grab the existing app and use it.
      const fbApp = app.getApps()[0];
      if (!fbApp) {
        throw new Error('No Firebase app initialized — page probably failed to load.');
      }
      const fbAuth = auth.getAuth(fbApp);
      await auth.signInWithCustomToken(fbAuth, token);

      // Wait for the auth state to actually persist to IndexedDB
      // (Firebase's default persistence). Without this, the
      // storageState we save on the next line might not contain the
      // signed-in token because IndexedDB writes are async.
      await new Promise<void>((resolve) => {
        const unsub = fbAuth.onIdTokenChanged((u) => {
          if (u) { unsub(); resolve(); }
        });
        // Safety timeout — if IDtoken never fires, we'd hang the
        // whole test setup. 10s is enormous for IndexedDB.
        setTimeout(resolve, 10_000);
      });
    }, customToken);

    // 3. Persist state. Firebase Auth uses IndexedDB by default; the
    //    storageState option includes IndexedDB.
    await context.storageState({ path: outFile, indexedDB: true });
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Skip auth setup entirely if AUTH_FIXTURE=skip — useful for running
  // just the public suites locally without a working test Firebase
  // project.
  if (process.env.AUTH_FIXTURE === 'skip') {
    console.log('[playwright.setup] AUTH_FIXTURE=skip → skipping auth state generation');
    return;
  }

  // Make sure the output dir exists. (Gitignored — see .gitignore.)
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  console.log('[playwright.setup] Building auth state for', TEST_USER_UID);
  await buildAuthState(TEST_USER_UID, userStatePath);

  console.log('[playwright.setup] Building auth state for', TEST_ADMIN_UID);
  await buildAuthState(TEST_ADMIN_UID, adminStatePath);

  console.log('[playwright.setup] Auth state ready.');
}
