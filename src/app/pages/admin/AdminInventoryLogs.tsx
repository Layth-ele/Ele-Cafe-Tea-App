/**
 * AdminInventoryLogs.tsx — Audit log of every inventory change.
 *
 * Reads /inventory_logs (paginated, most recent first). Each row
 * shows when, who, which tea, level change, and status transition.
 *
 * What you can NOT do here on purpose:
 *   - Edit log entries. The audit trail is immutable by Firestore
 *     rules (admin can read but not write). Cloud Function is the
 *     only writer.
 *   - Filter or search. Turn 5 keeps the viewer simple — most recent
 *     N entries, load more. Filter UI is a future enhancement once
 *     real audit usage shows what dimensions matter (per-tea,
 *     per-employee, date range).
 *
 * Auth: nested under /admin via the layout outlet → ProtectedRoute
 * requireAdmin gate. No further auth check here.
 */

import { SeoHead } from '@/app/components/SeoHead';
import { useInventoryLogs, type InventoryLogRow } from '@/features/inventory/hooks/useInventoryLogs';
import type { InventoryStatus } from '@/features/inventory/schemas/inventory.schema';

import { AdminPageHeader } from '@/app/components/admin/AdminPageHeader';
function AdminInventoryLogs() {
  const { rows, loading, loadingMore, error, hasMore, loadMore } = useInventoryLogs();

  return (
    <div className="space-y-6">
      <SeoHead title="Audit Log | Ele Café Admin" description="Inventory change history." noIndex />

      <AdminPageHeader
        eyebrow="Inventory"
        title="Audit log"
        description="Every stock change, recorded automatically with who made it and when. Most recent first."
      />

      {error && (
        <div className="ial-error" role="alert">{error}</div>
      )}

      {loading ? (
        <div className="ial-loading" aria-live="polite">Loading audit log…</div>
      ) : rows.length === 0 ? (
        <div className="ial-empty">
          <p>No inventory changes recorded yet.</p>
          <p className="ial-empty-sub">
            Entries appear here whenever an employee updates a tea's level on the
            inventory page. Logs are written server-side by the
            <code>onInventoryWrite</code> Cloud Function trigger.
          </p>
        </div>
      ) : (
        <>
          <div className="ial-table-wrap">
            <table className="ial-table">
              <caption className="sr-only">
                Inventory audit log. Each row shows the time, employee, tea, level change, and status transition for one inventory update.
              </caption>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Tea</th>
                  <th>Level</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <LogRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="ial-pager">
            {hasMore ? (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                aria-busy={loadingMore}
                className="ial-load-more"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            ) : (
              <span className="ial-end" aria-live="polite">
                — End of log —
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** One row in the table. Pulled out for readability + so React can
 *  memoize if we ever virtualize (long logs benefit from windowing). */
function LogRow({ row }: { row: InventoryLogRow }) {
  const delta = row.newLevel - row.previousLevel;
  const statusChanged = row.previousStatus !== row.newStatus;

  // Defensive ISO time for the <time dateTime> attribute. NaN Date
  // throws on toISOString in some browsers; epoch zero is a fallback
  // value from the hook for malformed Timestamps and shouldn't be
  // advertised as machine-readable. Empty string = no dateTime attr.
  const isoTime = (() => {
    const t = row.updatedAt.valueOf();
    if (!Number.isFinite(t) || t === 0) return '';
    try { return row.updatedAt.toISOString(); }
    catch (err) {
      console.warn('[AdminInventoryLogs] Failed to format ISO time:', err);
      return '';
    }
  })();

  return (
    <tr>
      <td className="ial-cell-when">
        <time dateTime={isoTime || undefined}>
          {formatTime(row.updatedAt)}
        </time>
      </td>
      <td className="ial-cell-who">{row.employeeName}</td>
      <td className="ial-cell-tea">
        {row.targetName}
        {row.kind === 'item' && row.categoryName && (
          <span className="emp-role-badge" data-role={row.kind}>
            {row.categoryName}
          </span>
        )}
      </td>
      <td className="ial-cell-level">
        <span className="ial-level-num">{row.previousValue}</span>
        <span className="ial-level-arrow" aria-hidden="true">→</span>
        <span className="ial-level-num">{row.newValue}</span>
        {row.kind === 'item' && row.unit && (
          <span className="ist-unit">{row.unit}</span>
        )}
        <span
          className="ial-level-delta"
          data-direction={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}
          aria-label={
            delta > 0 ? `Increased by ${delta}` :
            delta < 0 ? `Decreased by ${-delta}` :
                        'No change'
          }
        >
          {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '0'}
        </span>
      </td>
      <td className="ial-cell-status">
        {statusChanged ? (
          <span className="ial-status-transition">
            <StatusBadge status={row.previousStatus} />
            <span className="ial-arrow" aria-hidden="true">→</span>
            <StatusBadge status={row.newStatus} />
          </span>
        ) : (
          <StatusBadge status={row.newStatus} />
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: InventoryStatus }) {
  const label =
    status === 'in_stock'     ? 'In stock' :
    status === 'low_stock'    ? 'Low'      :
                                'Out';
  return <span className="ial-status-badge" data-status={status}>{label}</span>;
}

/** Pretty-print a Date as "May 18, 3:24 PM" (or whatever the
 *  user's locale prefers). Avoids pulling in date-fns for one
 *  format string.
 *
 *  Defensive against the two malformed-date paths:
 *    - new Date(0) — what the hook falls back to when the Firestore
 *      doc has no Timestamp (shouldn't happen in production but
 *      could on a corrupt write). Showing "Jan 1, 12:00 AM" would
 *      be misleading.
 *    - new Date(NaN) — "Invalid Date". toLocaleString returns
 *      "Invalid Date" string in some browsers, throws RangeError in
 *      others. Either way, em-dash is clearer than either.
 */
function formatTime(d: Date): string {
  const t = d.valueOf();
  if (!Number.isFinite(t) || t === 0) return '—';
  try {
    return d.toLocaleString(undefined, {
      month:  'short',
      day:    'numeric',
      hour:   'numeric',
      minute: '2-digit',
    });
  } catch (err) {
    console.warn('[AdminInventoryLogs] Failed to format locale time:', err);
    // Extreme dates can make toLocaleString throw in some locales —
    // fall back to a guaranteed-safe representation.
    return '—';
  }
}

export default AdminInventoryLogs;
