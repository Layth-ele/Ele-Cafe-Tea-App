/**
 * firebaseFunctionsLazy.ts — Cloud Functions client, dynamically imported
 *
 * Same pattern as firebaseAuthLazy + firebaseStorageLazy: this module is
 * NEVER imported eagerly. It's only loaded via getFunctionsLazy() in
 * firebase.ts, which is itself called only at the moment a callable is
 * about to fire (form submit, admin action). That keeps firebase/functions
 * (~10 KB gzip) out of every customer's first-paint bundle when most
 * sessions never trigger a callable at all.
 *
 * The exports below mirror what consumers used to import from
 * 'firebase/functions' directly:
 *   - functions: the Functions instance, region-pinned to us-central1
 *   - httpsCallable: the wrapper factory
 *
 * Callers must now `await getFunctionsLazy()` to get this module, then
 * destructure `{ functions, httpsCallable }` from it.
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { HttpsCallableResult } from 'firebase/functions';
import { app } from './firebase';

// us-central1 matches the deploy region of every function the
// front-end calls (placeOrder, verifyRecaptcha, setAdminRole,
// emailHealthCheck). Keep this in sync with `firebase.json`'s
// `functions.region` if that ever changes.
export const functions = getFunctions(app, 'us-central1');

export { httpsCallable };
export type { HttpsCallableResult };
