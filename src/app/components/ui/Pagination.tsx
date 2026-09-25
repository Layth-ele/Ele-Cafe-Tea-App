/**
 * Pagination — Google Cloud Console-style page control.
 *
 * Visual match for the standard GCP / Material data-table pagination:
 *
 *   Items per page: [50 ▼]   1–4   <   >
 *
 * Right-aligned by default; muted greys; circular hover state on the
 * chevrons; disabled chevrons fade out. Matches both light and dark
 * themes via the existing `--muted` / `--text` / `--border` tokens.
 *
 * Usage — minimum (no page-size selector):
 *   <Pagination
 *     page={page}
 *     pageSize={PAGE_SIZE}
 *     totalItems={totalItems}
 *     onPageChange={setPage}
 *   />
 *
 * Usage — with size selector:
 *   <Pagination
 *     page={page}
 *     pageSize={pageSize}
 *     totalItems={totalItems}
 *     onPageChange={setPage}
 *     onPageSizeChange={setPageSize}
 *     pageSizeOptions={[10, 25, 50, 100]}
 *   />
 *
 * The component computes its own range string (`1–N`) from
 * `page` × `pageSize` against `totalItems`, so callers don't need
 * to hand-roll display logic. It also clamps `page` defensively if
 * `totalItems` shrinks below the current page (e.g., a filter is
 * applied that drops items) — but it does NOT call onPageChange in
 * that case; callers are expected to reset to page 1 themselves
 * when filters change. The clamp is purely for display safety.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useT } from '@/i18n/useT';
export interface PaginationProps {
  /** 1-indexed current page. */
  page: number;
  /** How many items are on each page. */
  pageSize: number;
  /** Total number of items across all pages. */
  totalItems: number;
  /** Called with the new page number when the user navigates. */
  onPageChange: (page: number) => void;
  /** Optional — when provided, renders an interactive page-size <select>. */
  onPageSizeChange?: (size: number) => void;
  /** Page-size dropdown options. Defaults to [10, 25, 50, 100]. */
  pageSizeOptions?: number[];
  /** Optional class for the outer wrapper, e.g. for spacing tweaks. */
  className?: string;
  /** Override the "Items per page:" label (i18n). */
  labelText?: string;
}

const DEFAULT_OPTIONS = [10, 25, 50, 100];

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_OPTIONS,
  className,
  labelText,
}: PaginationProps) {
  const t = useT();
  // Compute total pages defensively. An empty list still renders one
  // logical "page 1" so the chevrons behave consistently (both disabled).
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  // Clamp page to valid range for display purposes only (see header
  // comment). This guards against a filter dropping the active page
  // out from under us before the parent's setPage(1) runs.
  const safePage = Math.min(Math.max(1, page), totalPages);

  // Display range: "1–10 of 47" style, but Google's version omits the
  // "of N" — it shows just "1–10" and the chevrons disable when out
  // of range. We follow that convention to match the screenshot.
  const rangeStart = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd   = Math.min(safePage * pageSize, totalItems);
  const rangeText  = t('{from}–{to} of {total}', totalItems === 0 ? { from: 0, to: 0, total: 0 } : { from: rangeStart, to: rangeEnd, total: totalItems });
  const label      = labelText ?? t('Items per page:');

  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  return (
    <div className={`pagination-root${className ? ` ${className}` : ''}`}>
      <span className="pagination-label">{label}</span>

      {onPageSizeChange ? (
        <div className="pagination-select-wrap">
          <select
            className="pagination-select"
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
            aria-label={label}
          >
            {pageSizeOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      ) : (
        // Static display when caller doesn't expose a size setter — keeps
        // the visual rhythm identical to the interactive variant.
        <span className="pagination-size-static">{pageSize}</span>
      )}

      <span className="pagination-range">{rangeText}</span>

      <button
        type="button"
        className="pagination-chevron"
        onClick={() => onPageChange(safePage - 1)}
        disabled={!canPrev}
        aria-label={t('Previous page')}
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        className="pagination-chevron"
        onClick={() => onPageChange(safePage + 1)}
        disabled={!canNext}
        aria-label={t('Next page')}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

export default Pagination;
