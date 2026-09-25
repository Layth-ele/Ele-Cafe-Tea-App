/**
 * InventoryFilters.tsx — Search + status filter pills.
 *
 * Stateless component: parent owns the filter state. The "All" / "In
 * stock" / "Low stock" / "Out of stock" pills are mutually exclusive
 * (single-select). Counts come from the parent so we show the actual
 * tally per status without re-deriving here.
 */

import { ChevronDown, Search } from 'lucide-react';
import { categories } from '@/data/categories';
import type { InventoryStatus } from '@/features/inventory/schemas/inventory.schema';

export type StatusFilter = 'all' | InventoryStatus;
export type CategoryFilter = 'all' | (typeof categories)[number]['id'];

interface InventoryFiltersProps {
  search:        string;
  onSearch:      (next: string) => void;
  status:        StatusFilter;
  onStatus:      (next: StatusFilter) => void;
  category:      CategoryFilter;
  onCategory:    (next: CategoryFilter) => void;
  /** Per-bucket counts so the pills can show "Low stock (3)". */
  counts:        Record<StatusFilter, number>;
  categoryCounts: Record<CategoryFilter, number>;
}

const PILLS: { value: StatusFilter; label: string }[] = [
  { value: 'all',           label: 'All'           },
  { value: 'in_stock',      label: 'In stock'      },
  { value: 'low_stock',     label: 'Low stock'     },
  { value: 'out_of_stock',  label: 'Out of stock'  },
];

export function InventoryFilters({
  search,
  onSearch,
  status,
  onStatus,
  category,
  onCategory,
  counts,
  categoryCounts,
}: InventoryFiltersProps) {
  return (
    <div className="invf">
      <div className="invf-row">
        <label className="invf-field invf-field--search">
          <Search size={18} aria-hidden="true" className="invf-icon" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search teas…"
            aria-label="Search teas"
            className="invf-input"
          />
        </label>

        <label className="invf-field invf-field--select">
          <span className="sr-only">Filter by category</span>
          <select
            value={category}
            onChange={(e) => onCategory(e.target.value as CategoryFilter)}
            className="invf-input invf-select"
          >
            <option value="all">All categories ({categoryCounts.all ?? 0})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({categoryCounts[c.id] ?? 0})
              </option>
            ))}
          </select>
          <ChevronDown size={18} aria-hidden="true" className="invf-chev" />
        </label>
      </div>

      <div className="invf-seg" role="group" aria-label="Filter by stock status">
        {PILLS.map((p) => {
          const count    = counts[p.value] ?? 0;
          const selected = status === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onStatus(p.value)}
              aria-pressed={selected}
              className="invf-seg-btn"
              data-status={p.value}
            >
              <span className="invf-seg-label">
                {p.value !== 'all' && <span className="invf-dot" aria-hidden="true" />}
                {p.label}
              </span>
              <span className="invf-seg-count">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
