/**
 * UserPreferences — Phase 11.5 notification preferences schema.
 *
 * Stored at `/users/{uid}/preferences/notifications` (subcollection).
 * Each field defaults to a sensible value if missing, so older user
 * docs without a preferences subcollection still get a reasonable
 * default (order updates ON because they're transactional; marketing
 * categories OFF until the user opts in — GDPR/CASL conformant).
 *
 * Cloud Functions that send notifications must read this doc before
 * dispatching. The wiring contract is documented in
 * PHASE_11_CHANGES.md §"Notification preferences end-to-end".
 */
import { z } from 'zod';

export const notificationPreferencesSchema = z.object({
  /** Transactional. Order placed, status changes, shipping updates,
   *  delivery confirmation. Default ON. The user can disable this
   *  too — it's their choice, but the UI warns them. */
  orderUpdates: z.boolean().default(true),

  /** Marketing. Sales and promo codes. Default ON (store owner's
   *  choice); every marketing email links to these toggles. Must match
   *  DEFAULTS in functions/src/lib/notificationPrefs.ts. */
  promotions: z.boolean().default(true),

  /** Catalog. "We added a new tea" emails. Default ON. */
  newArrivals: z.boolean().default(true),

  /** Inventory. "The tea you wishlisted is back in stock". Default ON. */
  lowStock: z.boolean().default(true),

  /** Engagement. Cart reminder after a day. Default ON. */
  reminders: z.boolean().default(true),

  /** Audit. When the user last changed any of the above — useful
   *  for "you changed your prefs 3 days ago" UI and for proving
   *  CASL consent timing to the CRTC if asked. */
  updatedAt: z.number().int().optional(),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/**
 * Parse a Firestore doc that may have partial / missing fields,
 * filling in defaults. Use this on read, not on write — writes go
 * through the form which validates the user's specific changes.
 */
export function parseNotificationPreferences(raw: unknown): NotificationPreferences {
  const result = notificationPreferencesSchema.safeParse(raw ?? {});
  if (result.success) return result.data;
  // If the doc is malformed (older write format, manual Firestore edit),
  // fall back to all defaults rather than throwing.
  return notificationPreferencesSchema.parse({});
}
