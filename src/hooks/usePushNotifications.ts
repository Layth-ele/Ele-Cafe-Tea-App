/**
 * usePushNotifications.ts — Enterprise Web Push lifecycle hook.
 *
 * Responsibilities:
 *   1. Permission state management (reads current state, exposes requestPermission)
 *   2. FCM token acquisition and refresh
 *   3. Token persistence: writes to /users/{uid}/fcmTokens/{tokenHash}
 *   4. Foreground message handling: deduplicates with Firestore bell
 *      (Firestore onSnapshot already adds the notification to the bell;
 *       we show a brief Sonner toast so the user knows without opening the bell)
 *   5. Token cleanup on sign-out
 *
 * Architecture:
 *   Permission is NOT requested on page load — that's the #1 push UX mistake
 *   and Chrome will stop showing the permission prompt if the site has too
 *   many "block" clicks. Permission is requested from PushPermissionPrompt,
 *   which renders ONLY after the user has shown purchase intent (opened cart,
 *   completed an order, or explicitly clicked "Enable notifications").
 *
 * FCM token lifecycle:
 *   - Token is acquired AFTER permission is granted.
 *   - Token is written to Firestore with a hash as the doc ID (so the same
 *     token on the same device doesn't create duplicates on re-registration).
 *   - On sign-out, deleteToken() is called and the Firestore doc is removed.
 *   - Token rotation: FCM rotates tokens silently; onMessage's tokenRefresh
 *     callback writes the new token. The old one is cleaned up server-side
 *     when it fails to deliver (see sendPushToUser in Cloud Functions).
 *
 * Foreground message handling:
 *   When the app is open, FCM delivers messages via onMessage (NOT via the SW's
 *   onBackgroundMessage). We show a Sonner toast — the Firestore onSnapshot
 *   listener in NotificationContext already updated the bell, so we just need
 *   the user to notice something arrived. We do NOT call showNotification() in
 *   the foreground because the browser suppresses it in many contexts anyway.
 *
 * Badge API:
 *   Exported `setBadge(count)` / `clearBadge()` so NotificationContext can
 *   keep the PWA icon badge in sync with the in-app unread count.
 */

import { useEffect, useState } from 'react';
import { toast }                                      from 'sonner';
import { storeFcmToken }                              from '@/lib/pushDevice';
import { useAuth }                                    from '@/contexts/AuthContext';
import {
  getMessagingLazy,
  getToken, onMessage,
  type MessagePayload,
}                                                     from '@/lib/firebaseMessagingLazy';
import { NOTIFICATION_META }                          from '@/lib/notificationMessages';
import type { NotificationType }                      from '@/schemas/notification.schema';

// ── Types ──────────────────────────────────────────────────────────────────────

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export interface PushNotificationsHook {
  permissionState: PushPermissionState;
  /** Request OS notification permission. Resolves to the new state. */
  requestPermission: () => Promise<PushPermissionState>;
  /** True once the FCM token has been stored in Firestore. */
  isRegistered: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

// ── Badge API helpers (exported for use in NotificationContext) ────────────────

function isBadgeSupported(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
}

export function setBadge(count: number): void {
  if (!isBadgeSupported()) return;
  const nav = navigator as Navigator & {
    setAppBadge: (n?: number) => Promise<void>;
    clearAppBadge: () => Promise<void>;
  };
  if (count > 0) {
    nav.setAppBadge(count).catch(() => {});
  } else {
    nav.clearAppBadge().catch(() => {});
  }
  // Also inform the SW so the badge is updated even if the main thread
  // doesn't have the Badge API (e.g. older Chrome on Android).
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SET_BADGE',
      count,
    });
  }
}

export function clearBadge(): void {
  setBadge(0);
}

// ── Permission requests ───────────────────────────────────────────────────────

/** Fired after a permission request so every mounted hook re-reads state. */
const PERMISSION_EVENT = 'ele:push-permission';

/** True when this browser can receive push AND push is configured. */
export function canUsePush(): boolean {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && !!VAPID_KEY;
}

/**
 * Ask for OS notification permission. Call straight from a click handler —
 * browsers ignore requests that aren't tied to a user gesture.
 *
 * Standalone (not a hook) so pages like TeaProfilePage can offer push
 * without mounting a second usePushNotifications — each instance registers
 * its own foreground onMessage listener, which would double the toasts.
 * Token registration stays in the single app-level instance, which
 * re-reads permission via PERMISSION_EVENT.
 */
export async function requestPushPermission(): Promise<PushPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission as PushPermissionState;
  try {
    return (await Notification.requestPermission()) as PushPermissionState;
  } catch (err) {
    console.warn('[usePushNotifications] permission request failed:', err);
    return 'denied';
  } finally {
    window.dispatchEvent(new Event(PERMISSION_EVENT));
  }
}

// ── Permission state reader ───────────────────────────────────────────────────

function readPermissionState(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as PushPermissionState;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePushNotifications(): PushNotificationsHook {
  const { currentUser } = useAuth();
  const [permissionState, setPermissionState] = useState<PushPermissionState>(readPermissionState);
  const [isRegistered,    setIsRegistered]    = useState(false);


  // ── Register token when already granted ────────────────────────────────────
  // Covers the "returning user who already granted permission in a prior
  // session" case. We acquire + refresh the token on every mount so
  // rotated tokens are stored promptly.
  useEffect(() => {
    if (!currentUser?.uid) { setIsRegistered(false); return; }
    if (permissionState !== 'granted') return;
    if (!VAPID_KEY) return; // No VAPID key → push not configured

    let cancelled = false;
    let unsubOnMessage: (() => void) | null = null;

    (async () => {
      const messaging = await getMessagingLazy();
      if (!messaging || cancelled) return;

      // Get (or refresh) the FCM token.
      let token: string;
      try {
        const swReg = await navigator.serviceWorker.ready;
        token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
      } catch (err) {
        console.warn('[usePushNotifications] getToken failed:', err);
        return;
      }

      if (cancelled) return;

      // Persist to Firestore so Cloud Functions can find this device.
      try {
        await storeFcmToken(currentUser.uid, token);
        if (!cancelled) setIsRegistered(true);
      } catch (err) {
        console.warn('[usePushNotifications] token store failed:', err);
      }

      // Handle FOREGROUND messages (app is open).
      // Background messages are handled by the SW's onBackgroundMessage.
      const unsub = onMessage(messaging, (payload: MessagePayload) => {
        const { title, body } = payload.notification ?? {};
        if (!title) return;

        // Show a brief Sonner toast — the Firestore onSnapshot in
        // NotificationContext has already added the notification to the bell.
        // We don't call showNotification() because the browser suppresses it
        // when the tab is in focus in most contexts anyway.
        const data     = (payload.data ?? {}) as Record<string, string>;
        const typeKey  = data.type as NotificationType | undefined;
        const emoji    = typeKey ? (NOTIFICATION_META[typeKey]?.emoji ?? '🔔') : '🔔';
        const url      = data.url ?? null;

        toast(`${emoji} ${title}`, {
          description: body,
          duration: 5_000,
          ...(url ? {
            action: { label: 'View', onClick: () => { window.location.href = url; } },
          } : {}),
        });
      });

      if (cancelled) {
        unsub();
      } else {
        unsubOnMessage = unsub;
      }
    })();

    return () => {
      cancelled = true;
      unsubOnMessage?.();
    };
  }, [currentUser?.uid, permissionState]);

  // Pick up permission changes made through requestPushPermission().
  useEffect(() => {
    const sync = () => setPermissionState(readPermissionState());
    window.addEventListener(PERMISSION_EVENT, sync);
    return () => window.removeEventListener(PERMISSION_EVENT, sync);
  }, []);

  const requestPermission = requestPushPermission;

  return { permissionState, requestPermission, isRegistered };
}
