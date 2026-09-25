/**
 * This browser's FCM push registration: /users/{uid}/fcmTokens/{hash}.
 *
 * Kept outside usePushNotifications so AuthContext can unregister the
 * device on sign-out (dynamic import — keeps the messaging SDK out of the
 * auth bundle) without an import cycle through the hook.
 */
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { getMessagingLazy, deleteToken } from './firebaseMessagingLazy';

/** The token registered in this tab, so sign-out knows what to remove. */
let activeDevice: { uid: string; token: string } | null = null;

/** Stable hash for the FCM token — used as the Firestore doc ID. */
async function tokenHash(token: string): Promise<string> {
  if (typeof crypto !== 'undefined' && 'subtle' in crypto) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 40);
  }
  // Fallback for environments without SubtleCrypto (should be rare on modern browsers).
  return token.slice(0, 40).replace(/[^A-Za-z0-9]/g, '_');
}

export async function storeFcmToken(uid: string, token: string): Promise<void> {
  const hash = await tokenHash(token);
  await setDoc(
    doc(db, 'users', uid, 'fcmTokens', hash),
    {
      token,
      platform: navigator.platform ?? 'unknown',
      userAgent: navigator.userAgent.slice(0, 200),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }, // merge so createdAt isn't overwritten on token refresh
  );
  activeDevice = { uid, token };
}

/**
 * Stop this device receiving the signed-in user's pushes. Must run BEFORE
 * signOut — the Firestore delete needs the user's auth. Best-effort: never
 * throws, so sign-out always proceeds.
 */
export async function unregisterPushDevice(): Promise<void> {
  const device = activeDevice;
  if (!device) return;
  activeDevice = null;
  try {
    const hash = await tokenHash(device.token);
    await deleteDoc(doc(db, 'users', device.uid, 'fcmTokens', hash));
  } catch (err) {
    console.warn('[pushDevice] token doc delete failed:', err);
  }
  try {
    const messaging = await getMessagingLazy();
    if (messaging) await deleteToken(messaging);
  } catch (err) {
    console.warn('[pushDevice] deleteToken failed:', err);
  }
}
