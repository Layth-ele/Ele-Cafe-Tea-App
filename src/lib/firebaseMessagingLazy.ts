/**
 * firebaseMessagingLazy.ts — lazy Firebase Cloud Messaging wrapper.
 *
 * Follows the same memoised-dynamic-import pattern as firebaseAuthLazy.ts
 * to keep FCM out of the eager bundle. Customers who never grant notification
 * permission never download any messaging code.
 *
 * Named static imports (NOT namespace spread) so Vite can tree-shake.
 * See ARCHITECTURE.md §"Lazy-loaded Firebase modules" for the full
 * explanation of why namespace spreads defeat tree-shaking.
 */
import { getMessaging, getToken, onMessage, deleteToken } from 'firebase/messaging';
import type { Messaging, MessagePayload }                 from 'firebase/messaging';

export type { Messaging, MessagePayload };
export { getToken, onMessage, deleteToken };

let _messagingPromise: Promise<Messaging> | null = null;

/**
 * Return the singleton Messaging instance, creating it on first call.
 *
 * Returns null (does NOT throw) when:
 *   - Running in a non-browser context (SSR, Vitest)
 *   - `Notification` API is not available (old browsers, some iframe origins)
 *   - `serviceWorker` API is not available (same causes)
 *   - Firebase hasn't been initialised yet (getApps().length === 0)
 *
 * Callers must null-check before using.
 */
export async function getMessagingLazy(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window)) return null;
  if (!('serviceWorker' in navigator)) return null;

  if (!_messagingPromise) {
    _messagingPromise = (async () => {
      const { getApp, getApps } = await import('firebase/app');
      if (getApps().length === 0) {
        // Firebase not yet initialised (e.g. called before firebase.ts runs).
        throw new Error('Firebase not initialised');
      }
      return getMessaging(getApp());
    })();
  }

  try {
    return await _messagingPromise;
  } catch (err) {
    console.warn('[firebaseMessagingLazy] Messaging init failed:', err);
    _messagingPromise = null;
    return null;
  }
}
