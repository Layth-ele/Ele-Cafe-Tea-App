/**
 * firestoreRetry — small helper for wrapping Firestore reads with
 * retry-on-offline behaviour during the early-mount window.
 *
 * Why this exists:
 * The Firestore Web SDK throws `FirebaseError: client is offline`
 * (code 'unavailable') when reads queue against a long-poll
 * connection that hasn't been established yet. This is most common
 * in the first 100-2000ms after page load when:
 *   • the SDK is initialised
 *   • the auth state is being resolved
 *   • the Firestore long-poll handshake to firestore.googleapis.com
 *     is still in flight
 * Reads issued in that window are rejected with the misleading
 * "offline" message even when the user has perfectly good
 * connectivity. The standard SDK behaviour is to drop the queued
 * read rather than wait for the connection.
 *
 * The fix is universal: if we get a "unavailable" error from a
 * Firestore read, wait briefly and retry. Other error codes
 * (permission-denied, not-found, etc.) are real failures we
 * shouldn't retry on.
 *
 * This file replaces the ad-hoc retry loop that was duplicated in
 * useCartSync; AuthContext and any other early-mount reader can
 * import it instead.
 */

/**
 * True when a Firestore (or related) error is a transient offline
 * condition that may resolve with a short retry. Other Firebase
 * error codes (permission-denied, not-found, invalid-argument, etc.)
 * are real failures we should NOT retry.
 */
export function isOfflineError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: string; message?: string };
  if (e.code === 'unavailable') return true;
  if (e.code === 'failed-precondition') return false; // index missing — real bug
  // Some Firebase errors only carry the human-readable message, not
  // a code (e.g. when bubbled through a wrapper). Match defensively.
  const msg = e.message ?? '';
  return msg.includes('client is offline') || msg.includes('Failed to get document');
}

/**
 * Run a Firestore read function, retrying ONLY on offline errors.
 * Returns the function's result on success. On final failure, the
 * last error is re-thrown so the caller can decide what to do
 * (typically: log at warn level and proceed with local state).
 *
 * Default budget: 4 attempts (initial + 3 retries) at 400/800/1600ms
 * — total ~2.8s of patience. Tuned for the early-mount window
 * which empirically resolves in well under 2s on real networks.
 *
 * Optional `cancelled` callback lets the caller signal that the
 * retry should give up early — e.g. component unmounted, user
 * switched.
 *
 * Usage:
 *   const snap = await runWithOfflineRetry(
 *     () => getDoc(doc(db, 'users', uid)),
 *     { cancelled: () => unmountedRef.current },
 *   );
 */
export async function runWithOfflineRetry<T>(
  fn: () => Promise<T>,
  options: {
    delaysMs?: number[];
    cancelled?: () => boolean;
  } = {},
): Promise<T> {
  const delays = options.delaysMs ?? [400, 800, 1600];
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (options.cancelled?.()) {
      throw lastErr ?? new Error('cancelled before attempt');
    }
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // Stop retrying on non-transient errors.
      if (!isOfflineError(e)) throw e;
      // Stop after the last attempt.
      if (attempt === delays.length) break;
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr;
}

/**
 * Sugar wrapper that runs `runWithOfflineRetry` and converts any
 * still-failing offline error into a `null` return — for callers
 * that want to fail soft (proceed with local state) rather than
 * propagate the error. Real errors (permission-denied etc.) still
 * throw.
 *
 * Usage:
 *   const snap = await tryReadWithOfflineRetry(
 *     () => getDoc(doc(db, 'users', uid)),
 *     '[AuthProvider] /users read',
 *   );
 *   if (snap?.exists()) { ... }
 */
export async function tryReadWithOfflineRetry<T>(
  fn: () => Promise<T>,
  context: string,
  options: { cancelled?: () => boolean } = {},
): Promise<T | null> {
  try {
    return await runWithOfflineRetry(fn, options);
  } catch (e) {
    if (isOfflineError(e)) {
      // Transient — log at warn level and let the caller proceed.
      // The Firestore SDK retries pending reads automatically once
      // the connection is back, so any same-doc listener (onSnapshot)
      // will eventually deliver fresh data. One-shot reads that
      // failed are simply skipped.
      console.warn(`${context}: offline (will retry on next operation)`);
      return null;
    }
    // Real error — let it propagate.
    throw e;
  }
}
