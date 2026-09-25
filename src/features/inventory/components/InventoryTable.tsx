/**
 * InventoryTable.tsx — Composes filters + rows into one usable
 * inventory dashboard.
 *
 * Reused by:
 *   - /inventory          (employee view, updatedBy = employeeName)
 *   - /admin/inventory    (admin view, updatedBy = admin email)
 *
 * Post-M1 refactor: data comes in via props. The parent calls
 * useInventoryList() once and shares the result with anything else
 * on the page that needs the rows (e.g. AdminInventory's PDF export).
 * Previously the table subscribed independently, so /admin/inventory
 * ran TWO listeners + TWO merge pipelines on every snapshot. The
 * Firestore SDK dedupes the wire reads, but the JS work was wasted.
 *
 * The component is now presentational + filter logic only — writes
 * are delegated to the parent-supplied `onUpdate` callback and stamped
 * with the `updatedBy` value the parent provides.
 */

import { useEffect, useMemo, useState } from 'react';
import { type InventoryRow as InventoryRowData } from '@/features/inventory/hooks/useInventoryList';
import { InventoryRow } from './InventoryRow';
import { InventoryFilters, type StatusFilter, type CategoryFilter } from './InventoryFilters';
import { LastUpdateBanner } from './LastUpdateBanner';
import type { InventoryStatus, UpdateInventoryInput } from '@/features/inventory/schemas/inventory.schema';
import { categories } from '@/data/categories';

interface InventoryTableProps {
  /** Live merged rows from useInventoryList — owned by the parent. */
  rows:     InventoryRowData[];
  loading:  boolean;
  error:    string | null;
  /** Stamped on every write to /inventory.updatedBy. Required so the
   *  audit log can attribute each level change. */
  updatedBy: string;
  /** Writer from useInventoryList. Passed through to each row. */
  onUpdate: (teaId: string, patch: UpdateInventoryInput) => Promise<void>;
  /** When true, every editable control inside each row disables and
   *  per-row save-state indicators hide. Pass `true` for read-only
   *  employee sessions. */
  readOnly?: boolean;
}

export function InventoryTable({ rows, loading, error, updatedBy, onUpdate, readOnly }: InventoryTableProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  // Tea sub-category groups (Black Tea, Green Tea, etc.) start COLLAPSED
  // by default. Reasons:
  //   - The page is long; an admin opening the inventory page is more
  //     often coming to refill a known tea than to scan the whole list.
  //   - Mobile users especially benefit — they can see the whole
  //     category overview at a glance and tap into just the one
  //     they're working on.
  //   - "Expand all" remains one click away for the rare "scan everything"
  //     workflow.
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => (
    Object.fromEntries(categories.map((c) => [c.id, false])) as Record<string, boolean>
  ));

  useEffect(() => {
    // When the user filters to a specific tea-type category, auto-open
    // that group so they see results immediately.
    if (category === 'all') return;
    setExpandedCategories((prev) => ({ ...prev, [category]: true }));
  }, [category]);

  // Derived state: filtered rows + per-bucket counts. useMemo because
  // the table can be ~80 rows × multiple statuses × every keystroke;
  // recomputing on every render would be wasteful.
  const { filteredRows, counts, categoryCounts, groupedRows } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (category !== 'all' && r.category !== category) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const bucket: Record<StatusFilter, number> = {
      all:           rows.length,
      in_stock:      0,
      low_stock:     0,
      out_of_stock:  0,
    };
    for (const r of rows) bucket[r.status as InventoryStatus]++;
    const categoryBucket: Record<CategoryFilter, number> = {
      all: rows.length,
      black: 0,
      green: 0,
      white: 0,
      oolong: 0,
      rooibos: 0,
      herbal: 0,
      flower: 0,
      fruit: 0,
      powder: 0,
    };
    for (const r of rows) {
      const key = (r.category as CategoryFilter | undefined) ?? 'all';
      if (key in categoryBucket && key !== 'all') {
        categoryBucket[key]++;
      }
    }

    const grouped = categories
      .map((cat) => ({
        category: cat.id,
        label: cat.name,
        rows: filtered
          .filter((r) => r.category === cat.id)
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name) || a.teaId.localeCompare(b.teaId)),
      }))
      .filter((group) => group.rows.length > 0);

    return {
      filteredRows: filtered,
      counts: bucket,
      categoryCounts: categoryBucket,
      groupedRows: grouped,
    };
  }, [rows, search, status, category]);

  const showSingleCategory = category !== 'all';

  const expandAll = () => {
    setExpandedCategories(
      Object.fromEntries(categories.map((c) => [c.id, true])) as Record<string, boolean>,
    );
  };

  const collapseAll = () => {
    setExpandedCategories(
      Object.fromEntries(categories.map((c) => [c.id, false])) as Record<string, boolean>,
    );
  };

  const toggleGroup = (catId: string) => {
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const visibleGroups = showSingleCategory
    ? groupedRows.filter((group) => group.category === category)
    : groupedRows;

  if (error) {
    return (
      <div className="inv-error" role="alert">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="inv-loading" aria-live="polite">
        Loading inventory…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="inv-empty">
        <p>No inventory records to show.</p>
        <p className="inv-empty-sub">
          Inventory rows appear here for every <strong>active</strong> tea in
          the catalog. New teas are auto-provisioned by the
          <code>onTeaCreate</code> Cloud Function; teas marked inactive in
          <code>/admin/products</code> are hidden from this list even though
          their inventory record still exists. If nothing shows up and you
          expect rows, check both places.
        </p>
      </div>
    );
  }

  return (
    <>
      <LastUpdateBanner rows={rows} />
      <InventoryFilters
        search={search}
        onSearch={setSearch}
        status={status}
        onStatus={setStatus}
        category={category}
        onCategory={setCategory}
        counts={counts}
        categoryCounts={categoryCounts}
      />

      {/* One bar under the filters: result count (aria-live, so screen
          readers hear the list change) on the left, group controls right. */}
      <div className="invf-bar">
        <p className="invf-count" role="status" aria-live="polite">
          {filteredRows.length === rows.length
            ? `${rows.length} ${rows.length === 1 ? 'tea' : 'teas'}`
            : `Showing ${filteredRows.length} of ${rows.length} ${rows.length === 1 ? 'tea' : 'teas'}`}
        </p>
        <div className="invf-bar-actions" aria-label="Category groups">
          <button type="button" className="invf-text-btn" onClick={expandAll}>Expand all</button>
          <span className="invf-bar-sep" aria-hidden="true" />
          <button type="button" className="invf-text-btn" onClick={collapseAll}>Collapse all</button>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="inv-empty">
          No teas match the current filter.
        </div>
      ) : (
        <div className="inv-groups">
          {visibleGroups.map((group) => {
            const isOpen = expandedCategories[group.category] ?? false;
            return (
              <section key={group.category} className="inv-group" aria-labelledby={`inv-group-${group.category}`}>
                <button
                  type="button"
                  className="inv-group-head"
                  onClick={() => toggleGroup(group.category)}
                  aria-expanded={isOpen}
                  id={`inv-group-${group.category}`}
                  data-group-color={group.category}
                >
                  <span className="inv-group-head-left">
                    <span className="inv-group-name">{group.label}</span>
                    <span className="inv-group-meta">{group.rows.length} teas</span>
                  </span>
                  <span className="inv-group-chev" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                </button>

                {isOpen && (
                  <div className="inv-table-wrap">
                    <table className="inv-table">
                      <caption className="sr-only">
                        Tea inventory levels for {group.label}. For each tea: level slider 0 to 10, status badge, and weight in grams (2000 g = level 10).
                      </caption>
                      <thead>
                        <tr>
                          <th className="inv-th-name">Tea</th>
                          <th className="inv-th-level">Level</th>
                          <th className="inv-th-status">Status</th>
                          <th className="inv-th-weight">Weight (g)</th>
                          <th className="inv-th-state" aria-label="Save state"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row: InventoryRowData) => (
                          <InventoryRow
                            key={row.teaId}
                            data={row}
                            updatedBy={updatedBy}
                            onSave={onUpdate}
                            readOnly={readOnly}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
