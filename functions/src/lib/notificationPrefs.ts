/**
 * Phase 11.5 — Notification preferences enforcement on the Cloud
 * Function side.
 *
 * The client-side `NotificationPreferencesSection` in AccountPage
 * writes `/users/{uid}/preferences/notifications` with five toggles:
 * orderUpdates, lowStock, promotions, newArrivals, reminders. The
 * toggles are useless unless the CFs that send emails READ this
 * doc before dispatching.
 *
 * Every mail-sending function should call userAcceptsCategory(uid,
 * category) and skip the send if it returns false. The helper:
 *
 *   - Fails OPEN (returns the default for the category) on Firestore
 *     errors. Better to occasionally email a user who's offline-
 *     toggled-off than to silently drop transactional emails when
 *     Firestore is degraded.
 *   - Treats missing prefs doc as defaults (CASL-compliant):
 *     everything ON (see DEFAULTS).
 *   - Caches per-function-invocation. Order-shipped emails often
 *     read the same prefs twice (one for the recipient, one for the
 *     gift sender); caching skips the second read.
 *
 * Mapping of notification → category:
 *
 *   orderPlaced, orderApproved, orderShipped, orderDelivered,
 *   orderCancelled, paymentReceived  →  'orderUpdates'
 *   wishlistBackInStock              →  'lowStock'
 *   promoBlast, saleLaunch           →  'promotions'
 *   newArrivalsInCategory            →  'newArrivals'
 *   cartAbandonment, winBack         →  'reminders'
 *
 * Usage:
 *
 *   import { userAcceptsCategory } from './lib/notificationPrefs';
 *
 *   export const orderApprovedEmail = onDocumentUpdated(...,
 *     async (event) => {
 *       const order = event.data?.after?.data();
 *       if (!order || order.status !== 'in_progress') return;
 *       const accepts = await userAcceptsCategory(order.userId, 'orderUpdates');
 *       if (!accepts) {
 *         logger.info('[orderApprovedEmail] user opted out, skipping', { uid: order.userId });
 *         return;
 *       }
 *       await sendEmail(...);
 *     });
 */
import * as admin from './admin';
import { logger } from 'firebase-functions/v2';

export type NotificationCategory =
  | 'orderUpdates'
  | 'lowStock'
  | 'promotions'
  | 'newArrivals'
  | 'reminders';

// Everything ON until the customer turns it off (store owner's choice).
// Every marketing email links to the toggles in /account. Must match
// src/schemas/userPreferences.schema.ts.
export const DEFAULTS: Record<NotificationCategory, boolean> = {
  orderUpdates: true,
  lowStock:     true,
  promotions:   true,
  newArrivals:  true,
  reminders:    true,
};

// Short-lived cache: warm function instances are reused across events,
// so entries expire quickly — a customer who turns a toggle off must be
// respected on the very next send. Null means "no prefs doc".
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; prefs: Partial<Record<NotificationCategory, boolean>> | null }>();

function db() { return admin.firestore(); }

/**
 * Check whether the given user has opted into a notification category.
 *
 * Returns the category's DEFAULT (see DEFAULTS above) when:
 *   - uid is empty
 *   - The user has no preferences doc
 *   - Firestore read errors (fails-open per the module doc)
 *   - The doc exists but the specific category field is missing
 */
export async function userAcceptsCategory(
  uid: string,
  category: NotificationCategory,
): Promise<boolean> {
  if (!uid) return DEFAULTS[category];

  // Cache hit — same uid, same invocation.
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    const v = hit.prefs?.[category];
    return typeof v === 'boolean' ? v : DEFAULTS[category];
  }

  try {
    const snap = await db()
      .doc(`users/${uid}/preferences/notifications`)
      .get();

    if (!snap.exists) {
      cache.set(uid, { at: Date.now(), prefs: null });
      return DEFAULTS[category];
    }

    const data = snap.data() ?? {};
    // Defensive: coerce only the fields we care about; ignore arbitrary
    // extras that might have been written to the doc.
    const prefs: Partial<Record<NotificationCategory, boolean>> = {
      orderUpdates: typeof data.orderUpdates === 'boolean' ? data.orderUpdates : undefined,
      lowStock:     typeof data.lowStock     === 'boolean' ? data.lowStock     : undefined,
      promotions:   typeof data.promotions   === 'boolean' ? data.promotions   : undefined,
      newArrivals:  typeof data.newArrivals  === 'boolean' ? data.newArrivals  : undefined,
      reminders:    typeof data.reminders    === 'boolean' ? data.reminders    : undefined,
    };
    cache.set(uid, { at: Date.now(), prefs });
    const v = prefs[category];
    return typeof v === 'boolean' ? v : DEFAULTS[category];

  } catch (err) {
    // Fail-open: log and return the default. The alternative — failing
    // closed — would silently drop transactional emails when Firestore
    // is degraded, which is worse than honoring stale defaults.
    logger.warn('[notificationPrefs] read failed; returning default', {
      uid, category, err: String(err).slice(0, 300),
    });
    return DEFAULTS[category];
  }
}

/**
 * Clear the per-invocation cache. Exported for testing; production
 * code shouldn't need to call this (each CF invocation gets a fresh
 * process or at least a fresh cache).
 */
export function _clearNotificationPrefsCache(): void {
  cache.clear();
}
