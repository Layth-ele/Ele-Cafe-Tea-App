/**
 * InventoryItemTable.tsx — Table of items in one inventory category.
 *
 * Reused by:
 *   - /inventory          (employee view, updatedBy = employeeName)
 *   - /admin/inventory    (admin view, updatedBy = admin email)
 *
 * Rows come in via props (parent owns the useInventoryItems
 * subscription) so admin pages can share one subscription between
 * the table and any sibling actions like CSV export.
 *
 * Admin-only actions (Add / Edit / Archive) appear when the parent
 * passes the corresponding callback props.
 */

import React from 'react';
import { Plus } from 'lucide-react';
import type { InventoryItemRowData } from '@/features/inventory/hooks/useInventoryItems';
import type {
  InventoryCategory,
} from '@/features/inventory/schemas/inventoryCategory.schema';
import type { UpdateInventoryItemInput } from '@/features/inventory/schemas/inventoryItem.schema';
import {
  getItemStatus,
  effectiveLowThreshold,
} from '@/features/inventory/schemas/inventoryItem.schema';
import { InventoryItemRow } from './InventoryItemRow';
import { LastUpdateBanner } from './LastUpdateBanner';

interface InventoryItemTableProps {
  category: InventoryCategory;
  rows:     InventoryItemRowData[];
  loading:  boolean;
  error:    string | null;
  updatedBy: string;
  onUpdate: (id: string, patch: UpdateInventoryItemInput) => Promise<void>;
  /** Admin-only — opens the create modal. Pass undefined to hide. */
  onAdd?:     () => void;
  /** Admin-only — opens the edit modal. */
  onEdit?:    (item: InventoryItemRowData) => void;
  /** Admin-only — archives the item. */
  onArchive?: (item: InventoryItemRowData) => void;
  /** Admin-only — hard-deletes the item. */
  onDelete?:  (item: InventoryItemRowData) => void;
  /** Show the category name heading (off when the page header already shows it). */
  showTitle?: boolean;
  /** Disables every editable control (and hides per-row save state).
   *  Pass true for read-only employee sessions. */
  readOnly?:  boolean;
}

export function InventoryItemTable({
  category,
  rows,
  loading,
  error,
  updatedBy,
  onUpdate,
  onAdd,
  onEdit,
  onArchive,
  onDelete,
  readOnly,
  showTitle = true,
}: InventoryItemTableProps) {
  // Phase 19 — search removed from non-tea categories per merchant
  // request. Tea uses InventoryTable.tsx which keeps its own search
  // (tea catalog is much larger and benefits from text filtering).
  // Item categories are typically 3-15 items, where scanning is
  // faster than typing. A summary chip row replaces the search input
  // so the admin can see status distribution at a glance.

  // Status breakdown for the summary chips.
  const summary = React.useMemo(() => {
    const counts = { in_stock: 0, low_stock: 0, out_of_stock: 0 };
    for (const row of rows) {
      const threshold = effectiveLowThreshold(row.lowThreshold, category.lowThreshold);
      const status = getItemStatus(row.quantity, threshold);
      counts[status] += 1;
    }
    return counts;
  }, [rows, category.lowThreshold]);

  if (error) {
    return <div className="inv-error" role="alert">{error}</div>;
  }
  if (loading) {
    return <div className="iit-loading" aria-live="polite">Loading items…</div>;
  }

  return (
    <div className="iit-wrap">
      <LastUpdateBanner rows={rows} />
      <div className="iit-head">
        <div>
          {showTitle && <h3 className="iit-head-title">{category.name}</h3>}
          <p className="iit-head-sub">
            {rows.length} {rows.length === 1 ? 'item' : 'items'}
            {category.unit ? ` · default unit: ${category.unit}` : ''}
            {category.lowThreshold !== null ? ` · low at < ${category.lowThreshold}` : ''}
          </p>
        </div>
        <div className="iit-head-actions">
          {onAdd && (
            <button type="button" className="iit-add-btn" onClick={onAdd}>
              <Plus size={14} aria-hidden="true" />
              Add item
            </button>
          )}
        </div>
      </div>

      {/* Phase 19 — Summary chips. Replaces the per-category search
          input. Shows item count by status so the admin / staff
          can see the overall health of the category at a glance
          without scanning every row. */}
      {rows.length > 0 && (
        <div className="iit-summary" role="status" aria-label={`Inventory summary for ${category.name}`}>
          <span className="iit-summary-chip iit-summary-chip--total">
            {rows.length} {rows.length === 1 ? 'item' : 'items'} total
          </span>
          {summary.in_stock > 0 && (
            <span className="iit-summary-chip iit-summary-chip--ok">
              <span className="iit-summary-dot" aria-hidden="true" />
              {summary.in_stock} in stock
            </span>
          )}
          {summary.low_stock > 0 && (
            <span className="iit-summary-chip iit-summary-chip--warn">
              <span className="iit-summary-dot" aria-hidden="true" />
              {summary.low_stock} low
            </span>
          )}
          {summary.out_of_stock > 0 && (
            <span className="iit-summary-chip iit-summary-chip--danger">
              <span className="iit-summary-dot" aria-hidden="true" />
              {summary.out_of_stock} out
            </span>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="iit-empty">
          <p>No items in {category.name} yet.</p>
          <p className="iit-empty-sub">
            {onAdd
              ? `Click "Add item" to set up the first one.`
              : `An admin can add items from the admin dashboard.`}
          </p>
        </div>
      ) : (
        <div className="iit-table-wrap">
          <table className="iit-table">
            <caption className="sr-only">
              {category.name} inventory. For each item: name, quantity stepper, status badge, and (admin) row actions.
            </caption>
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Status</th>
                <th aria-label="Save state"></th>
                {(onEdit || onArchive || onDelete) && <th aria-label="Actions"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <InventoryItemRow
                  key={row.id}
                  data={row}
                  categoryThreshold={category.lowThreshold}
                  categoryUnit={category.unit}
                  updatedBy={updatedBy}
                  onSave={onUpdate}
                  onEdit={onEdit}
                  onArchive={onArchive}
                  onDelete={onDelete}
                  readOnly={readOnly}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
