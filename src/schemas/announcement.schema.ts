import { z } from 'zod';

/**
 * announcement.schema.ts — schema for the rotating announcement bar.
 *
 * Each announcement is a single message that scrolls in the top strip
 * of the site. The optional `highlight` is the "flashy bit" — a price,
 * promo code, or date — rendered as a small luxury chip alongside the
 * message text. Use it to draw the eye to the actionable part of the
 * announcement (e.g. SAVE15, $2.99, JUL 1).
 *
 * Date range is optional — leave both blank for an evergreen
 * announcement (e.g. "free shipping on all orders"). Set both for a
 * scheduled campaign that auto-shows/hides without admin intervention
 * (e.g. Canada Day banners running June 28 → July 2).
 *
 * Used by:
 *  - AdminSettings (the editor UI)
 *  - Navbar (the marquee renderer)
 *  - useSettings (reads from /settings/global.announcements)
 */

export const announcementSchema = z.object({
  /** Stable identifier — used as React key + admin re-order target.
   *  Generated client-side at create time (crypto.randomUUID() shape). */
  id: z.string().min(1),
  /** The main announcement text. Required, non-empty after trim.
   *  Example: "Free shipping on orders over $75" */
  message: z.string().trim().min(1).max(140),
  /** Optional highlight chip — short promotional anchor.
   *  Example: "SAVE15", "$2.99", "JUL 1", "HAPPY HOUR".
   *  Kept short (max 24 chars) so the chip fits the marquee height
   *  without wrapping. */
  highlight: z.string().trim().max(24).optional().or(z.literal('')),
  /** French versions (shown when the site is in French; English is used
   *  when blank). */
  messageFr:   z.string().trim().max(140).optional().or(z.literal('')),
  highlightFr: z.string().trim().max(24).optional().or(z.literal('')),
  /** Master enable flag. Disabled announcements stay in the list
   *  (admin convenience — toggle on for next sale) but don't render. */
  enabled: z.boolean().default(true),
  /** Optional ISO date strings (YYYY-MM-DD) for time-boxed campaigns.
   *  Stored as strings (not Timestamps) because admin edits them as
   *  date inputs and we don't need server-time precision — the start/
   *  end check happens client-side at render. */
  startDate: z.string().optional().or(z.literal('')),
  endDate:   z.string().optional().or(z.literal('')),
});

export type Announcement = z.infer<typeof announcementSchema>;

export const announcementsArraySchema = z.array(announcementSchema);

/** Generate a new empty announcement with sane defaults. Admin UI
 *  uses this when the admin clicks "Add announcement". */
export function createEmptyAnnouncement(): Announcement {
  return {
    id:        typeof crypto !== 'undefined' && 'randomUUID' in crypto
                  ? crypto.randomUUID()
                  : `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message:   '',
    highlight: '',
    enabled:   true,
    startDate: '',
    endDate:   '',
  };
}

/**
 * Filter an announcement list to only those that should render right now.
 * Pure function — easy to unit-test (and easy to call from the marquee
 * + the admin preview).
 *
 * Rules:
 *  - Skip if disabled
 *  - Skip if startDate is in the future
 *  - Skip if endDate is in the past (end-of-day inclusive — Canada Day
 *    posts should stay up through July 1 23:59 in the user's timezone)
 *
 * `now` parameter is injected so unit tests can pin the clock.
 */
export function filterActiveAnnouncements(
  list: Announcement[],
  now: Date = new Date(),
): Announcement[] {
  // Compare date-only strings — no timezone math needed because
  // admin enters local-store dates and customers see them in their
  // local timezone. End-of-day inclusivity is implicit because we
  // compare YYYY-MM-DD strings lexicographically.
  //
  // Build the date string from LOCAL time (not toISOString, which is
  // UTC). For a Vancouver storefront with admin endDate='2026-07-02',
  // toISOString() ticks over to '2026-07-03' at 4 PM Pacific — making
  // a Canada Day announcement vanish 8 hours before midnight in the
  // user's actual timezone. Local-time string-build keeps it visible
  // for the entire calendar day the admin intended.
  const today =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return list.filter(a => {
    if (!a.enabled)                              return false;
    if (!a.message || !a.message.trim())         return false;  // never render empty
    if (a.startDate && a.startDate > today)      return false;
    if (a.endDate   && a.endDate   < today)      return false;
    return true;
  });
}

/**
 * Migrate the legacy `announcementText` (single string with various
 * separators) to the new array shape. Splits on the same set of
 * separators the old marquee used so existing settings don't lose
 * their messages on first read after deploy.
 *
 * Returns null when there's nothing to migrate, so the caller can
 * leave settings untouched in that case.
 */
export function migrateLegacyAnnouncementText(legacy: string | undefined): Announcement[] | null {
  if (!legacy || !legacy.trim()) return null;
  const messages = legacy
    .split(/[·\-–—]/)
    .map(m => m.trim())
    .filter(Boolean);
  if (messages.length === 0) return null;
  return messages.map(message => ({
    id:        typeof crypto !== 'undefined' && 'randomUUID' in crypto
                  ? crypto.randomUUID()
                  : `legacy-${Math.random().toString(36).slice(2, 10)}`,
    message,
    highlight: '',
    enabled:   true,
    startDate: '',
    endDate:   '',
  }));
}
