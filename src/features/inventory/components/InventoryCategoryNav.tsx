/**
 * InventoryCategoryNav.tsx — the inventory category menu.
 *
 *   variant="menu"    — the /inventory landing page: one large, touch-
 *                       friendly row per category (all screen sizes).
 *   variant="sidebar" — beside a category page on desktop (≥1024px) only,
 *                       so switching category is one click; hidden on
 *                       phones/tablets, where the page's back button
 *                       returns to the menu.
 *
 * Every entry is a real link (/inventory/:category) — bookmarkable and
 * the browser back button works. Badges: `alerts[id]` shows "2 low" /
 * "1 due"; otherwise `totals[id]` shows the item count.
 */
import { Link } from 'react-router';
import { ChevronRight, Plus } from 'lucide-react';
import type { InventoryCategory } from '@/features/inventory/schemas/inventoryCategory.schema';

export interface CategoryAlert {
  count: number;
  /** Short word after the count, e.g. "low" or "due". */
  label: string;
}

interface InventoryCategoryNavProps {
  variant:        'menu' | 'sidebar';
  categories:     InventoryCategory[];
  activeId?:      string;
  /** Marked "Last opened" in the menu. */
  lastOpenedId?:  string | null;
  hrefFor:        (id: string) => string;
  alerts?:        Record<string, CategoryAlert | undefined>;
  totals?:        Record<string, number | undefined>;
  onAddCategory?: () => void;
}

export function InventoryCategoryNav({
  variant, categories, activeId, lastOpenedId, hrefFor, alerts = {}, totals = {}, onAddCategory,
}: InventoryCategoryNavProps) {
  if (categories.length === 0) return null;

  return (
    <nav className={`icn icn--${variant}`} aria-label="Inventory categories">
      <ul className="icn-list">
        {categories.map((c) => {
          const active = c.id === activeId;
          const alert = alerts[c.id];
          const total = totals[c.id];
          const hasAlert = !!alert && alert.count > 0;
          const srAlert = hasAlert ? `, ${alert.count} ${alert.label}` : '';
          return (
            <li key={c.id}>
              <Link
                to={hrefFor(c.id)}
                className="icn-link"
                data-color={c.color}
                aria-current={active ? 'page' : undefined}
                aria-label={`${c.name}${srAlert}`}
              >
                <span className="icn-dot" aria-hidden="true" />
                <span className="icn-name">
                  {c.name}
                  {variant === 'menu' && c.id === lastOpenedId && <span className="icn-last">Last opened</span>}
                </span>
                {hasAlert ? (
                  <span className="icn-badge icn-badge--alert" aria-hidden="true">{alert.count} {alert.label}</span>
                ) : typeof total === 'number' ? (
                  <span className="icn-badge" aria-hidden="true">{total}</span>
                ) : null}
                {variant === 'menu' && <ChevronRight size={18} aria-hidden="true" className="icn-chev" />}
              </Link>
            </li>
          );
        })}
        {onAddCategory && (
          <li>
            <button type="button" className="icn-link icn-add" onClick={onAddCategory}>
              <Plus size={16} aria-hidden="true" />
              <span className="icn-name">Add category</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}
