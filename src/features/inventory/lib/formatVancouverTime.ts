/**
 * formatVancouverTime.ts — Date formatting helpers that pin output to
 * the America/Vancouver timezone (PST in winter, PDT in summer).
 *
 * Why pin the timezone explicitly? The inventory dashboard is used by
 * employees on premises in Vancouver. If we let the formatter default
 * to the browser's local timezone:
 *   - A manager checking the audit log from out of town sees times
 *     in their travel timezone, which doesn't match what staff on
 *     the floor saw when they did the update.
 *   - "Updated 2 minutes ago" reads fine, but "Updated at 6:42 PM" is
 *     wrong if the viewer is on UTC.
 * Pinning to Vancouver gives every viewer the same answer: "this
 * happened at THIS clock time on the floor."
 *
 * Format choices:
 *   - "Mon Mar 4 at 7:42 PM" — short weekday + short month/day + time.
 *     Long enough to disambiguate week boundaries; short enough for a
 *     narrow phone column.
 *   - Includes the "(Vancouver)" suffix when the viewer's locale
 *     differs from Vancouver, so a remote manager isn't confused by
 *     unfamiliar clock times.
 *
 * Both functions return `'Never'` for missing/invalid input — the
 * tables use this to render "Never updated" rows without further
 * null-checks at the call site.
 */

const TZ = 'America/Vancouver';

/** Returns true when the viewer's resolved timezone differs from
 *  Vancouver. Used to decide whether to suffix the formatted string
 *  with "(Vancouver)" — for staff working in Vancouver it's just
 *  noise. */
export function viewerIsOutsideVancouver(): boolean {
  try {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return local !== TZ;
  } catch {
    return false; // be conservative; some old browsers throw on resolvedOptions
  }
}

/**
 * Format a Date for inventory update banners.
 * Example outputs:
 *   "Mon Mar 4 at 7:42 PM"
 *   "Today at 2:18 PM"   (when the update happened earlier today)
 *   "Yesterday at 9:01 AM"
 *   "Never"              (null / invalid Date)
 */
export function formatVancouverDateTime(date: Date | null | undefined): string {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime()) || date.getTime() === 0) {
    return 'Never';
  }

  // Use Intl with the pinned timezone. We compose date + time
  // separately so we can short-circuit to "Today" / "Yesterday" when
  // the calendar date in Vancouver matches.
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);

  // Compute the date in Vancouver as a YYYY-MM-DD key. Comparing
  // Date.getDate() directly would be wrong for viewers in other
  // timezones — they'd see "yesterday" for events that were "today"
  // in Vancouver.
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  if (dateKey === todayKey) {
    return `Today at ${time}`;
  }

  // Yesterday in Vancouver. Subtract 24h from now then re-format —
  // close enough for the relative label (DST transitions can shift
  // the boundary by an hour at the edge cases; the labels stay
  // sensible).
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(yesterday);
  if (dateKey === yesterdayKey) {
    return `Yesterday at ${time}`;
  }

  // Older — show the full weekday + month + day.
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric',
  }).format(date);
  return `${day} at ${time}`;
}

/** Convenience suffix the tables append when the viewer's local
 *  timezone differs from Vancouver. Returns "" for in-Vancouver
 *  viewers so the line stays clean. */
export function vancouverSuffix(): string {
  return viewerIsOutsideVancouver() ? ' (Vancouver)' : '';
}
