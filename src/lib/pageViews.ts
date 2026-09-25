/**
 * pageViews.ts — fire-and-forget page-view logger.
 *
 * Tracks ALL visitors (anonymous + signed-in) by writing one
 * Firestore doc per page navigation to /pageViews. The admin
 * dashboard at /admin/visits-analytics queries this collection
 * with date filters.
 *
 * Visitor ID strategy:
 *   • Anonymous: a UUID stored in sessionStorage (so the same
 *     visitor counts as one visitor for the duration of their
 *     session, but loses identity across browser restarts —
 *     intentional, no persistent tracking).
 *   • Signed-in: the user's auth uid, also stored on the userId
 *     field for cross-reference with /users.
 *
 * Privacy:
 *   • No IP address logged (Firestore SDK doesn't expose it).
 *   • UA + referrer capped at 500 chars by rule.
 *   • Anonymous IDs rotate every browser session — no persistent
 *     cross-session linking.
 *
 * Best-effort:
 *   • Never throws.
 *   • A failed write never blocks navigation.
 *   • Skipped entirely if SSR / no window.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const VISITOR_KEY = 'ele:anonVisitorId';

/**
 * Get or generate the anonymous visitor ID for this session.
 * Stored in sessionStorage (cleared when the tab closes), so the
 * same visitor browsing for an hour counts as 1 unique visitor for
 * that hour, then gets a fresh ID on their next visit.
 */
function getAnonVisitorId(): string {
  try {
    let id = sessionStorage.getItem(VISITOR_KEY);
    if (!id) {
      // crypto.randomUUID is available in all evergreen browsers and
      // returns a 36-char string. Fallback for old Safari just uses a
      // timestamp + random number.
      const cryptoObj = (typeof crypto !== 'undefined' ? crypto : undefined) as
        (Crypto & { randomUUID?: () => string }) | undefined;
      id = cryptoObj?.randomUUID
        ? cryptoObj.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
      sessionStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch (err) {
    // sessionStorage disabled — generate a per-call id. Will count
    // each navigation as a new visitor; not ideal but rare.
    console.warn('[pageViews] sessionStorage visitor id failed:', err);
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }
}

/**
 * Log a page view. Fire-and-forget.
 *
 * @param path     pathname only (no query/hash) — admin views get
 *                 noisy fast if we include them. Caller decides.
 * @param userId   uid if signed in, null/undefined otherwise.
 */
export async function logPageView(
  path: string,
  userId?: string | null,
): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!path) return;
  try {
    const visitorId = getAnonVisitorId();
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : '';
    // document.referrer is empty when visitor came via direct nav,
    // bookmark, or after referrer-policy stripped it. That's fine —
    // the dashboard treats empty as "(direct)".
    const referrer = typeof document !== 'undefined' ? (document.referrer ?? '').slice(0, 500) : '';
    const payload: Record<string, unknown> = {
      path: path.slice(0, 500),
      visitorId,
      isAuthed: !!userId,
      referrer,
      userAgent: ua,
      createdAt: serverTimestamp(),
    };
    if (userId) payload.userId = String(userId).slice(0, 128);
    await addDoc(collection(db, 'pageViews'), payload);
  } catch (err) {
    // Best-effort — never surface or block navigation.
    console.warn('[pageViews] log failed:', err);
  }
}
