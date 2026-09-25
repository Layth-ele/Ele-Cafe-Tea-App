/**
 * LastUpdateBanner.tsx — Inline strip at the top of every inventory
 * table showing when the category was last touched and by whom.
 *
 * Computes its own "most recent" timestamp from the rows passed in,
 * so the parent doesn't have to think about it. If rows is empty
 * (new category with no items yet, or a brand-new tea collection),
 * renders the "Never updated" state.
 *
 * Output examples:
 *   "Last updated Today at 7:42 PM by Sarah"
 *   "Last updated Yesterday at 9:01 AM by Marco"
 *   "Last updated Mon Mar 4 at 6:30 PM (Vancouver) by Devi"   (remote viewer)
 *   "Never updated"                                            (empty category)
 *
 * a11y: rendered as plain text inside a region with an icon. No
 * role="status" / aria-live because this isn't a transient
 * announcement — it's a stable label that screen readers will
 * encounter while traversing the page.
 */

import { Clock } from 'lucide-react';
import {
  formatVancouverDateTime,
  vancouverSuffix,
} from '@/features/inventory/lib/formatVancouverTime';

interface UpdateInfo {
  updatedAt: Date;
  updatedBy: string;
}

interface LastUpdateBannerProps {
  /** Rows from useInventoryList (tea) or useInventoryItems (items).
   *  Only the updatedAt + updatedBy fields are read. */
  rows: UpdateInfo[];
}

export function LastUpdateBanner({ rows }: LastUpdateBannerProps) {
  // Find the row with the latest updatedAt. We don't reduce over
  // every row in a useMemo because the row count is small (a few
  // dozen at most) and this re-derives once per render naturally.
  let latest: UpdateInfo | null = null;
  for (const row of rows) {
    if (!row.updatedAt || row.updatedAt.getTime() === 0) continue;
    if (!latest || row.updatedAt > latest.updatedAt) {
      latest = row;
    }
  }

  if (!latest) {
    return (
      <div className="lub" data-state="empty">
        <Clock size={14} aria-hidden="true" className="lub-icon" />
        <span className="lub-text">Never updated</span>
      </div>
    );
  }

  const when = formatVancouverDateTime(latest.updatedAt);
  const who  = latest.updatedBy?.trim() || 'unknown';
  // For the inventory account every update is stamped with the
  // employee name they signed in as. Admin stamps use the admin's
  // email. Trim "@elecafe.ca" off admin stamps so the line stays
  // compact on small screens.
  const whoClean = who.endsWith('@elecafe.ca') ? who.slice(0, who.length - '@elecafe.ca'.length) : who;
  const suffix = vancouverSuffix();

  return (
    <div className="lub" data-state="ok">
      <Clock size={14} aria-hidden="true" className="lub-icon" />
      <span className="lub-text">
        Last updated <span className="lub-when">{when}{suffix}</span> by <span className="lub-who">{whoClean}</span>
      </span>
    </div>
  );
}
