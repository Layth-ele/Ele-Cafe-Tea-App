/**
 * inventorySession.ts — the employee's own Firebase connection for
 * inventory data.
 *
 * After the shared-account password and the 4-digit code both pass,
 * validateInventoryAccessCode returns a custom token for uid
 * `inv-{employeeId}` carrying { inv, invEmp, invRole, invExp } claims.
 * We sign in with it on a SECOND, memory-only Firebase app so that:
 *
 *   - the main app stays signed in as inventory@ (navbar, sign-out and
 *     the rest of the site behave exactly as before);
 *   - a page reload drops the session, so the code is asked again —
 *     the same behaviour the in-memory access store always had;
 *   - firestore.rules can require the claims on every inventory
 *     read/write, enforce the read-only role, and verify that
 *     `updatedBy` / `loggedBy` is the signed-in employee.
 *
 * Admins never start a session; inventoryDb() then returns the main
 * Firestore instance and the admin rules apply.
 */
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, CustomProvider, getToken } from 'firebase/app-check';
import { connectFirestoreEmulator, initializeFirestore, type Firestore } from 'firebase/firestore';
import { connectAuthEmulator, initializeAuth, inMemoryPersistence, signInWithCustomToken, signOut, type Auth } from 'firebase/auth';
import { appCheck, db, firebaseConfig, USE_EMULATORS } from '@/lib/firebase';

interface Session { app: FirebaseApp; auth: Auth; db: Firestore }

let session: Session | null = null;
let seq = 0;

/** Sign in to the employee's inventory session (replaces any previous one). */
export async function startInventorySession(customToken: string): Promise<void> {
  await endInventorySession();
  const app = initializeApp(firebaseConfig, `inventory-session-${++seq}`);
  // Reuse the main app's App Check token (same Firebase app id) so the
  // second app passes App Check enforcement without a second reCAPTCHA.
  const mainAppCheck = appCheck;
  if (mainAppCheck) {
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          const t = await getToken(mainAppCheck, false);
          return { token: t.token, expireTimeMillis: Date.now() + 30 * 60_000 };
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });
  }
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  if (USE_EMULATORS) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  try {
    await signInWithCustomToken(auth, customToken);
  } catch (err) {
    await deleteApp(app).catch(() => undefined);
    throw err;
  }
  const sdb = initializeFirestore(app, { ignoreUndefinedProperties: true, experimentalAutoDetectLongPolling: true });
  if (USE_EMULATORS) connectFirestoreEmulator(sdb, '127.0.0.1', 8080);
  session = { app, auth, db: sdb };
}

/** Sign the employee session out and tear its app down. Safe to call anytime. */
export async function endInventorySession(): Promise<void> {
  const s = session;
  session = null;
  if (!s) return;
  await signOut(s.auth).catch(() => undefined);
  await deleteApp(s.app).catch(() => undefined);
}

/** uid of the signed-in employee session (inv-…), or null. */
export function inventorySessionUid(): string | null {
  return session?.auth.currentUser?.uid ?? null;
}

export function hasInventorySession(): boolean {
  return session !== null;
}

/** Firestore for inventory data: the employee session if one is active, else the main app (admins). */
export function inventoryDb(): Firestore {
  return session?.db ?? db;
}
