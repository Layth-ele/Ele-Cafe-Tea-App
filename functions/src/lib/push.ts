/**
 * Web Push via FCM — shared by index.ts (order/credit bell notifications)
 * and inventory.ts (back-in-stock alerts).
 */
import * as admin from './admin';

// ── sendPushToUser — deliver a Web Push alongside every Firestore bell write ──
//
// Reads the target user's FCM token documents from
// /users/{uid}/fcmTokens/{tokenHash} and sends a multicast push via the
// Firebase Admin Messaging SDK. Non-blocking, fire-and-forget from the
// caller's perspective — push is an enhancement on top of the in-app bell,
// not a replacement.
//
// Token cleanup: sendEachForMulticast returns per-token results. Tokens that
// the FCM server says are invalid or unregistered are deleted immediately so
// they don't accumulate and slow down future sends.
//
// Admin notifications (recipientId === 'admin') are intentionally excluded
// here. The admin panel is always-open-and-watching; OS push for every new
// order would be noisy. A separate "admin push digest" feature is a future
// roadmap item.
//
// URL routing: the push payload carries a `url` field. The SW's
// notificationclick handler navigates to that URL when the user taps the
// push. We map notification types to their most useful destination:
//   order events          → /orders
//   credit adjustments    → /account
//   welcome bonus         → /account
//   everything else       → /
export async function sendPushToUser(
  uid: string,
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<void> {
  if (!uid || uid === 'admin') return;

  try {
    const tokenSnap = await admin.firestore()
      .collection('users').doc(uid)
      .collection('fcmTokens')
      .get();

    if (tokenSnap.empty) return;

    const tokens = tokenSnap.docs
      .map(d => String(d.data().token ?? ''))
      .filter(Boolean);

    if (tokens.length === 0) return;

    // Determine the in-app destination for notificationclick.
    const url = data.url ?? (
      data.type?.startsWith('customer_order')  ? '/orders'  :
      data.type?.startsWith('customer_credit') ? '/account' :
      data.type === 'customer_welcome_bonus'   ? '/account' :
      '/'
    );

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: { title, body },
      webpush: {
        notification: {
          icon:  'https://elecafe.ca/icons/icon-192.png',
          badge: 'https://elecafe.ca/icons/icon-192.png',
          tag:   data.notifId ?? `ele-${Date.now()}`,
          renotify: false,
        },
        fcmOptions: { link: `https://elecafe.ca${url}` },
      },
      data: { ...data, url, notifId: data.notifId ?? '' },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // Remove tokens that FCM reports as invalid — stale registrations
    // from uninstalled apps, device resets, browser profile deletions.
    if (response.failureCount > 0) {
      const stale: Promise<void>[] = [];
      response.responses.forEach((res, idx) => {
        if (!res.success) {
          const code = res.error?.code ?? '';
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            stale.push(tokenSnap.docs[idx].ref.delete().then(() => undefined).catch(() => {}));
          }
        }
      });
      await Promise.all(stale);
    }
  } catch (err) {
    // Non-fatal — in-app bell still works; log at warn level.
    console.warn('[sendPushToUser] failed:', String(err).slice(0, 300));
  }
}
