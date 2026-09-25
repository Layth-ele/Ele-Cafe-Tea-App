/**
 * TeaFilterSidebar.tsx — Stateless filter sidebar shared by ProductsPage
 * and the gift-builder Step 2.
 *
 * Why stateless?
 * --------------
 * ProductsPage syncs filter state to the URL via setSearchParams. The
 * gift-builder modal does NOT — its state is ephemeral and lives in the
 * Zustand giftBuilderStore. Forcing a single state owner inside this
 * component would lock both consumers into the same persistence model.
 * Instead, both consumers own their state and pass it in as props.
 *
 * Accessibility:
 * --------------
 * - Real <input type="checkbox"> elements with visually-hidden positioning
 *   (NOT display:none) so they remain in the tab order and screen readers
 *   announce them correctly.
 * - Toggles are <button role="switch" aria-checked> per WAI-ARIA — keyboard
 *   focusable, Space/Enter activatable.
 * - Closed accordion bodies are aria-hidden + inert so focusables inside
 *   don't pollute the tab order.
 * - All interactive targets meet the 44px min touch-target rule.
 * - :focus-visible rings on every interactive element.
 *
 * CSS strategy: the styles (.fs-header, .check-row, .toggle-track etc.)
 * are imported HERE so they load wherever the sidebar mounts — including
 * the gift-builder modal. Vite deduplicates CSS imports at the bundler
 * level, so importing from multiple places is safe and idempotent.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  TEA_CATEGORIES,
} from '@/lib/routes';
import {
  CAFF_LEVELS,
  type FacetCounts,
  type FilterOption,
  type FilterOpenSections,
  type TeaFilterState,
  type TeaFilterActions,
} from '@/lib/teaFilters';
import './TeaFilters.css';

import { useT, tNow, useLang, categoryName } from '@/i18n/useT';
import { useVisibleCategoryIds } from '@/hooks/useVisibleCategoryIds';
// ── FilterSection — accordion shell ──────────────────────────────────────────
function FilterSection({
  id, title, count, open, onToggle, children,
}: {
  id: string;
  title: string;
  /** Number of active items in this section — rendered as a small pill
   *  badge next to the title when > 0. */
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const bodyId = `fs-body-${id}`;
  return (
    <div className="fs-section">
      <button
        type="button"
        className="fs-header"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <span className="fs-title">
          {title}
          {count != null && count > 0 && (
            <span className="fs-count-pill" aria-label={tNow('{count} active', { count })}>{count}</span>
          )}
        </span>
        <svg className={`fs-chevron${open ? ' open' : ''}`} viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div
        id={bodyId}
        className={`fs-body${open ? ' open' : ''}`}
        aria-hidden={!open}
        // `inert` removes focusable children from the tab order when
        // the section is collapsed. Modern browsers (2023+) all support
        // it natively. React 19's types accept boolean — pass undefined
        // when open so the attribute isn't set, true when closed.
        inert={!open || undefined}
      >
        <div className="fs-inner">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── CheckRow ─────────────────────────────────────────────────────────────────
const CheckRow = React.memo(function CheckRow({
  label, checked, onChange, count,
}: { label: string; checked: boolean; onChange: () => void; /** Teas this option would show. */ count?: number }) {
  // An option that would return nothing is dimmed (still clickable, so a
  // ticked one can always be unticked).
  const empty = count === 0 && !checked;
  return (
    <label className={`check-row${checked ? ' checked' : ''}${empty ? ' is-empty' : ''}`}>
      {/* Visually hidden but keyboard-focusable input. The visible
          `.check-box` span mirrors its state via the parent's
          `.checked` class (set above). Using sr-only positioning
          instead of display:none preserves the tab order and lets
          screen readers announce the checkbox. */}
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={onChange}
      />
      <span className="check-box" aria-hidden="true">
        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
          <path d="M1 4L4.2 7.5L10 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
      <span className="check-label">{label}</span>
      {count != null && <span className="check-count" aria-hidden="true">{count}</span>}
    </label>
  );
});

/** Long option lists show the most common first, with "Show all". */
const COLLAPSED_LIMIT = 10;
function OptionList({ options, selected, onToggle, counts, labelOf }: {
  options: readonly FilterOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  counts?: Map<string, number>;
  labelOf: (o: FilterOption) => string;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const long = options.length > COLLAPSED_LIMIT + 2;
  const shown = !long || expanded
    ? options
    : options.filter((o, i) => i < COLLAPSED_LIMIT || selected.has(o.value));
  return (
    <>
      {shown.map((o) => (
        <CheckRow key={o.value} label={labelOf(o)} count={counts ? counts.get(o.value) ?? 0 : undefined}
          checked={selected.has(o.value)} onChange={() => onToggle(o.value)} />
      ))}
      {long && (
        <button type="button" className="fs-more-btn" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? t('Show fewer') : t('Show all ({count})', { count: options.length })}
        </button>
      )}
    </>
  );
}

// ── ToggleRow ────────────────────────────────────────────────────────────────
const ToggleRow = React.memo(function ToggleRow({
  label, checked, onChange, count,
}: { label: string; checked: boolean; onChange: (v: boolean) => void; count?: number }) {
  // role="switch" is the proper ARIA pattern for an on/off toggle that
  // doesn't need a tristate. Better than role="checkbox" because it
  // signals "this is a single-purpose toggle" to assistive tech.
  return (
    <div className={`toggle-row${checked ? ' checked' : ''}`}>
      <span className="toggle-label">{label}</span>
      {count != null && <span className="check-count" aria-hidden="true">{count}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`toggle-track${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  );
});

// ── ResetLink — small "N selected · Reset" pair shown above each section ────
function ResetLink({ count, onReset }: { count: number; onReset: () => void }) {
  const t = useT();
  if (count === 0) return null;
  return (
    <div className="fs-reset-row">
      <span className="fs-reset-count">{t('{count} selected', { count })}</span>
      <button
        type="button"
        onClick={onReset}
        className="fs-reset-btn"
      >
        {t('Reset')}
      </button>
    </div>
  );
}

// ── Sidebar footer — total count + "Reset all" + marketing line ──────────────
const SidebarFooter = React.memo(function SidebarFooter({
  totalActive, onResetAll,
}: { totalActive: number; onResetAll: () => void }) {
  const t = useT();
  return (
    <div className="fs-footer">
      <div className="fs-footer-status">
        <span
          className="fs-status-dot"
          data-active={totalActive > 0 ? 'true' : 'false'}
          aria-hidden="true"
        />
        <span
          className="fs-status-text"
          data-active={totalActive > 0 ? 'true' : 'false'}
        >
          {totalActive === 0
            ? t('No filters active')
            : t(totalActive === 1 ? '{count} filter active' : '{count} filters active', { count: totalActive })}
        </span>
        {totalActive > 0 && (
          <button
            type="button"
            onClick={onResetAll}
            className="fs-reset-all-btn"
          >
            {t('Reset all')}
          </button>
        )}
      </div>

      {totalActive === 0 && (
        <p className="fs-footer-hint">
          {t('Use the filters above to narrow your selection.')}
        </p>
      )}
    </div>
  );
});

// ── Public component ─────────────────────────────────────────────────────────
export interface TeaFilterSidebarProps extends TeaFilterState, TeaFilterActions {
  openSections:  FilterOpenSections;
  toggleSection: (key: keyof FilterOpenSections) => void;
  /** Ingredient options from deriveFilterVocabulary(liveTeas) — follows
   *  whatever the admin enters, no code change needed. */
  ingredients?: readonly FilterOption[];
  /** Functionality options (only groups some tea actually has). */
  functions?:   readonly FilterOption[];
  /** Live "how many teas" per option (facetCounts). */
  counts?:      FacetCounts;
  /** Optional dynamic category list — typically from useCategoriesRealtime
   *  so admin-added categories appear in the filter live. Falls back to
   *  the hardcoded TEA_CATEGORIES baseline when not provided. */
  categories?:  readonly { id: string; label: string }[];
}

/**
 * React.memo'd so it never re-renders on parent mutations that don't
 * affect its props. ProductsPage relies on this to keep filter state
 * fluid while the tea grid re-renders behind it.
 */
export const TeaFilterSidebar = React.memo(function TeaFilterSidebar({
  openSections, toggleSection,
  selectedCats, inStock, outOfStock,
  organicOnly, caffFilter, ingredientFilter, functFilter,
  toggleCat, setSelectedCats,
  setInStock, setOutOfStock, setOrganicOnly,
  setCaffFilter, setIngredientFilter, setFunctFilter,
  toggleCaff, toggleIngredient, toggleFunct,
  ingredients = [],
  functions   = [],
  categories  = TEA_CATEGORIES,
  counts,
}: TeaFilterSidebarProps) {
  const t = useT();
  const visibleCats = useVisibleCategoryIds();
  const lang = useLang();
  // Derived counts — memo'd so they don't recompute on every render
  // when the underlying Sets haven't changed.
  const active = useMemo(() => {
    const avail = (inStock ? 1 : 0) + (outOfStock ? 1 : 0);
    // Ingredients / functionality have their own sections and pills.
    const more  = (organicOnly ? 1 : 0) + caffFilter.size;
    const total = selectedCats.size + caffFilter.size + ingredientFilter.size +
                  functFilter.size + avail + (organicOnly ? 1 : 0);
    return { avail, more, total };
  }, [
    selectedCats, inStock, outOfStock, organicOnly,
    caffFilter, ingredientFilter, functFilter,
  ]);

  // Stable callback for "Reset all" — uses bulk setSelectedCats so we
  // get ONE re-render instead of N (was previously calling toggleCat
  // once per category, triggering N parent setState calls + N URL
  // syncs in ProductsPage).
  const resetAll = useCallback(() => {
    setIngredientFilter(new Set());
    setFunctFilter(new Set());
    setCaffFilter(new Set());
    setInStock(false);
    setOutOfStock(false);
    setOrganicOnly(false);
    setSelectedCats(new Set());
  }, [
    setIngredientFilter, setFunctFilter, setCaffFilter,
    setInStock, setOutOfStock, setOrganicOnly, setSelectedCats,
  ]);

  return (
    <div className="tea-filter-sidebar">
      <FilterSection
        id="cats"
        title={t('Categories')}
        count={selectedCats.size}
        open={openSections.cats}
        onToggle={() => toggleSection('cats')}
      >
        <ResetLink count={selectedCats.size} onReset={() => setSelectedCats(new Set())} />
        {categories.filter(c => visibleCats.has(c.id) || selectedCats.has(c.id)).map(c => (
          <CheckRow key={c.id} label={categoryName(c, lang)} count={counts ? counts.cats.get(c.id) ?? 0 : undefined}
            checked={selectedCats.has(c.id)} onChange={() => toggleCat(c.id)} />
        ))}
      </FilterSection>

      <FilterSection
        id="avail"
        title={t('Availability')}
        count={active.avail}
        open={openSections.avail}
        onToggle={() => toggleSection('avail')}
      >
        <ResetLink count={active.avail} onReset={() => { setInStock(false); setOutOfStock(false); }} />
        <ToggleRow label={t('In stock')}     count={counts?.inStock}    checked={inStock}    onChange={setInStock} />
        <ToggleRow label={t('Out of stock')} count={counts?.outOfStock} checked={outOfStock} onChange={setOutOfStock} />
      </FilterSection>

      <FilterSection
        id="more"
        title={t('More Filters')}
        count={active.more}
        open={openSections.more}
        onToggle={() => toggleSection('more')}
      >
        <ResetLink count={active.more} onReset={() => { setOrganicOnly(false); setCaffFilter(new Set()); }} />
        <CheckRow label={t('Organic')} count={counts?.organic} checked={organicOnly} onChange={() => setOrganicOnly(v => !v)} />
        {CAFF_LEVELS.map(level => (
          <CheckRow key={level} label={t('Caffeine: {level}', { level: t(level) })}
            count={counts ? counts.caffeine.get(level) ?? 0 : undefined}
            checked={caffFilter.has(level)} onChange={() => toggleCaff(level)} />
        ))}
      </FilterSection>

      <FilterSection
        id="ing"
        title={t('Ingredients')}
        count={ingredientFilter.size}
        open={openSections.ing}
        onToggle={() => toggleSection('ing')}
      >
        <ResetLink count={ingredientFilter.size} onReset={() => setIngredientFilter(new Set())} />
        <OptionList options={ingredients} selected={ingredientFilter} onToggle={toggleIngredient}
          counts={counts?.ingredients} labelOf={(o) => (lang === 'fr' && o.labelFr) || t(o.label)} />
      </FilterSection>

      <FilterSection
        id="funct"
        title={t('Functionality')}
        count={functFilter.size}
        open={openSections.funct}
        onToggle={() => toggleSection('funct')}
      >
        <ResetLink count={functFilter.size} onReset={() => setFunctFilter(new Set())} />
        <OptionList options={functions} selected={functFilter} onToggle={toggleFunct}
          counts={counts?.functions} labelOf={(o) => t(o.label)} />
      </FilterSection>

      <SidebarFooter totalActive={active.total} onResetAll={resetAll} />
    </div>
  );
});
