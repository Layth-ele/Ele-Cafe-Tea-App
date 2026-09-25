/**
 * Step2PickTeas.tsx — Pick paid teas (Step 2 of 6).
 *
 * Roadmap §6-step modal flow. The old Step 2 had a tab switcher that
 * crammed two unrelated decisions (paid teas + free samples) into one
 * screen. That's been split: this step is now teas-only. Free samples
 * move to Step3PickSamples, which the modal auto-skips for Taster
 * (sampleCount === 0).
 *
 * Selection semantics: tap to select, capped at bundle.teaCount, with
 * a one-time-per-cap toast when the user tries to over-select.
 *
 * Layout (unchanged): filter sidebar (240px) · grid (flex 1) · chip
 * rail (260px) on desktop. On narrow viewports the sidebar collapses
 * into a drawer trigger and the chip rail moves below the grid.
 */

import { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { useTeasRealtime } from '@/hooks/useTeasRealtime';
import { useCategoriesRealtime } from '@/hooks/useCategoriesRealtime';
import { toast } from 'sonner';
import { Filter as FilterIcon } from 'lucide-react';

import { useGiftBuilderStore } from '@/store/giftBuilderStore';
import { findBundle } from '@/app/components/gift-builder/data/bundles';
import type { Product } from '@/types';
import { TEA_CATEGORIES } from '@/lib/routes';
import {
  DEFAULT_OPEN_SECTIONS,
  type FilterOpenSections,
  type TeaFilterState,
  matchesTeaFilters,
  deriveFilterVocabulary,
  facetCounts,
} from '@/lib/teaFilters';

import { TeaFilterSidebar } from '@/app/components/products/TeaFilterSidebar';
import { TeaSearchBar }     from '@/app/components/products/TeaSearchBar';
import { DualCounter }      from '@/app/components/gift-builder/components/DualCounter';
import { SelectedChips }    from '@/app/components/gift-builder/components/SelectedChips';
import { BundleTeaCard, type CardState } from '@/app/components/gift-builder/components/BundleTeaCard';
import { isProductAvailable } from '@/lib/availability';

import { useT, tNow } from '@/i18n/useT';
export function Step2PickTeas() {
  const tr = useT();
  const bundleSlug      = useGiftBuilderStore(s => s.bundleSlug);
  const selectedTeas    = useGiftBuilderStore(s => s.selectedTeas);
  const selectedSamples = useGiftBuilderStore(s => s.selectedSamples);
  const toggleTea       = useGiftBuilderStore(s => s.toggleTea);
  // toggleSample is wired only to the chip-rail's remove-button so the
  // user can drop a sample they already picked without navigating to
  // Step 3. The grid on this step is teas-only — toggleSample is never
  // called from card clicks here.
  const toggleSample    = useGiftBuilderStore(s => s.toggleSample);

  const bundle = bundleSlug ? findBundle(bundleSlug) : null;

  const [drawerOpen, setDrawerOpen] = useState(false);
  // One-time hint when the user hits the tea cap — silenced on subsequent
  // taps so a frustrated user doesn't get spammed every click.
  const toastShownRef = useRef(false);

  const { data: products = [], isLoading } = useTeasRealtime();
  const liveCategories = useCategoriesRealtime();

  // ── Filter state — local to the modal, not URL-synced ─────────────────────
  const [openSections, setOpenSections] = useState<FilterOpenSections>(DEFAULT_OPEN_SECTIONS);
  const toggleSection = (key: keyof FilterOpenSections) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const [selectedCats,     setSelectedCats]     = useState<Set<string>>(new Set());
  const [inStock,          setInStock]          = useState(false);
  const [outOfStock,       setOutOfStock]       = useState(false);
  const [organicOnly,      setOrganicOnly]      = useState(false);
  const [caffFilter,       setCaffFilter]       = useState<Set<string>>(new Set());
  const [ingredientFilter, setIngredientFilter] = useState<Set<string>>(new Set());
  const [functFilter,      setFunctFilter]      = useState<Set<string>>(new Set());
  const [search,           setSearch]           = useState('');

  const deferredSearch = useDeferredValue(search);

  const toggleCat        = (id: string) =>
    setSelectedCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCaff       = (v: string) =>
    setCaffFilter(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const toggleIngredient = (v: string) =>
    setIngredientFilter(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const toggleFunct      = (v: string) =>
    setFunctFilter(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });

  const totalActive = selectedCats.size + (inStock ? 1 : 0) + (outOfStock ? 1 : 0) +
    (organicOnly ? 1 : 0) + caffFilter.size + ingredientFilter.size + functFilter.size;

  const filtered = useMemo(() => {
    const filters: TeaFilterState = {
      selectedCats, inStock, outOfStock, organicOnly,
      caffFilter, ingredientFilter, functFilter,
    };
    return products.filter((p: Product) =>
      matchesTeaFilters(p, filters, deferredSearch));
  }, [products, selectedCats, deferredSearch, inStock, outOfStock,
      organicOnly, caffFilter, ingredientFilter, functFilter]);

  // Visible list — exclude teas already chosen as samples so the user
  // doesn't accidentally double-add the same tea on both lists (spec:
  // "same tea cannot be both"). On Step 3 the inverse filter runs.
  const sampleIds = useMemo(
    () => new Set(selectedSamples.map(t => t.id ?? '')),
    [selectedSamples],
  );
  const visible = useMemo(
    () => filtered.filter(p => !sampleIds.has(p.id ?? '')),
    [filtered, sampleIds],
  );

  // Reset the cap-hint toast guard when the user removes a tea so the
  // hint can fire again next time they max out. Better than once-per-session
  // (a user who under-shoots, removes one, then re-fills should still see it).
  //
  // Hooks before the bundle-guard early return so the hook order stays
  // stable on every render (rules-of-hooks).
  useEffect(() => {
    if (!bundle) return;
    if (selectedTeas.length < bundle.teaCount) toastShownRef.current = false;
  }, [bundle, selectedTeas.length]);

  const filterVocab = useMemo(
    () => deriveFilterVocabulary(products),
    [products]
  );
  // Live "how many teas" next to every filter option.
  const filterCounts = useMemo(
    () => facetCounts(products, {
      selectedCats, inStock, outOfStock, organicOnly,
      caffFilter, ingredientFilter, functFilter,
    }, deferredSearch),
    [products, selectedCats, inStock, outOfStock, organicOnly, caffFilter, ingredientFilter, functFilter, deferredSearch],
  );

  // ── Defensive bundle-guard ────────────────────────────────────────────────
  if (!bundle) {
    return (
      <p className="s2-fallback">
        {tr('Pick a bundle first, please.')}
      </p>
    );
  }

  function cardStateFor(tea: Product): CardState {
    if (!bundle) return 'default';
    const id = tea.id ?? '';
    // Turn 6 state priority:
    //   1. selected — wins even when unavailable, so a customer who
    //      picked a tea before it went OOS can still deselect it.
    //      Otherwise they'd be stuck unable to advance past Step 2.
    //   2. unavailable — gate sold-out teas; "Sold out" label on the
    //      card and click is a no-op (toast explains).
    //   3. limit — bundle full; toast on attempted add.
    //   4. default.
    if (sampleIds.has(id)) return 'default'; // already filtered out, defensive
    const teaIds = new Set(selectedTeas.map(t => t.id ?? ''));
    if (teaIds.has(id)) return 'selected';
    if (!isProductAvailable(tea)) return 'unavailable';
    if (selectedTeas.length >= bundle.teaCount) return 'limit';
    return 'default';
  }

  function handleCardClick(tea: Product) {
    if (!bundle) return;
    const state = cardStateFor(tea);
    if (state === 'unavailable') {
      // Be explicit. The card already shows "Sold out", but if the
      // customer keyboards onto it and presses Enter the visual cue
      // isn't enough — a toast confirms why nothing happened.
      toast(tNow('{name} is sold out right now.', { name: tea.name ?? tNow('This tea') }));
      return;
    }
    if (state === 'limit') {
      if (!toastShownRef.current) {
        toastShownRef.current = true;
        const max = bundle.teaCount;
        toast(tNow(max === 1 ? 'Pick {count} tea total. Tap a selected one to swap.' : 'Pick {count} teas total. Tap a selected one to swap.', { count: max }));
      }
      return;
    }
    toggleTea(tea);
  }

  function resetAll() {
    setSelectedCats(new Set()); setInStock(false); setOutOfStock(false);
    setOrganicOnly(false); setCaffFilter(new Set());
    setIngredientFilter(new Set()); setFunctFilter(new Set());
    setSearch('');
  }

  const filterProps = {
    openSections, toggleSection,
    selectedCats, inStock, outOfStock,
    organicOnly, caffFilter, ingredientFilter, functFilter,
    toggleCat, setSelectedCats,
    setInStock, setOutOfStock, setOrganicOnly,
    setCaffFilter, setIngredientFilter, setFunctFilter,
    toggleCaff, toggleIngredient, toggleFunct,
    ingredients: filterVocab.ingredients,
    functions:   filterVocab.functions,
    counts:      filterCounts,
    categories:  liveCategories,
  };

  return (
    <div className="s2-root">
      {/* Header — bundle name + tea-only counter */}
      <div className="s2-head">
        <div>
          <h3 className="s2-bundle-name">
            {tr(bundle.name)}
          </h3>
          <p className="s2-bundle-tag">
            {tr(bundle.tagline)}
          </p>
        </div>
        {/* DualCounter degrades to a single counter because samplesMax === 0
            renders nothing (existing showSamples branch). Reused as-is so
            the visual contract on Step 3 (samples) and any future step
            stays consistent. */}
        <DualCounter
          teasSelected={selectedTeas.length} teasMax={bundle.teaCount}
          samplesSelected={selectedSamples.length} samplesMax={0}
        />
      </div>

      {/* Three-column layout: filter / grid / chips */}
      <div className="gb-step2-layout">
        <aside className="gb-step2-sidebar products-sidebar">
          <TeaFilterSidebar {...filterProps} />
        </aside>

        <div className="gb-step2-main">
          <div className="s2-toolbar">
            <TeaSearchBar
              value={search}
              onChange={setSearch}
              placeholder={(products.length ? tr('Search {count} teas…', { count: products.length }) : tr('Search teas…'))}
            />
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="gb-step2-mobile-filter-btn s2-mobile-filter-btn"
            >
              <FilterIcon size={14} />
              {tr('Filters')}{totalActive > 0 ? ` (${totalActive})` : ''}
            </button>
          </div>

          {totalActive > 0 && (
            <div className="s2-chips">
              {[...selectedCats].map(id => {
                const c = TEA_CATEGORIES.find(x => x.id === id);
                return (
                  <ChipPill key={id} label={c?.label ?? id} onClick={() => toggleCat(id)} />
                );
              })}
              {[...caffFilter].map(v => <ChipPill key={v} label={v} onClick={() => toggleCaff(v)} />)}
              {organicOnly && <ChipPill label={tr('Organic')} onClick={() => setOrganicOnly(false)} />}
              {[...ingredientFilter].map(ing => <ChipPill key={ing} label={ing} onClick={() => toggleIngredient(ing)} />)}
              {[...functFilter].map(fn => <ChipPill key={fn} label={fn} onClick={() => toggleFunct(fn)} />)}
              <button onClick={resetAll} className="s2-clear-all">
                {tr('Clear all')}
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="s2-empty">
              {tr('Loading teas…')}
            </div>
          ) : visible.length === 0 ? (
            <div className="s2-empty">
              {tr('No teas match your filters.')}
              <div className="s2-empty-actions">
                <button onClick={resetAll} className="s2-empty-btn">
                  {tr('Clear filters')}
                </button>
              </div>
            </div>
          ) : (
            <div className="s2-grid">
              {visible.map(p => (
                <BundleTeaCard
                  key={p.id ?? p.slug}
                  product={p}
                  state={cardStateFor(p)}
                  addLabel={tr('Add to bundle')}
                  onClick={() => handleCardClick(p)}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="gb-step2-chips">
          <div className="s2-chiprail">
            <h4 className="s2-chiprail-h4">
              {tr('Your bundle so far')}
            </h4>
            <SelectedChips
              teas={selectedTeas}        teasMax={bundle.teaCount}
              samples={selectedSamples}  samplesMax={bundle.sampleCount}
              onRemoveTea={toggleTea}
              onRemoveSample={toggleSample}
            />
          </div>
        </aside>
      </div>

      {drawerOpen && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            className="gb-step2-drawer-overlay"
          />
          <div className="gb-step2-drawer-panel">
            <div className="s2-drawer-head">
              <span className="s2-drawer-title">
                {tr('Filters')}
              </span>
              <button onClick={() => setDrawerOpen(false)} className="s2-drawer-close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <TeaFilterSidebar {...filterProps} />
            <button onClick={() => setDrawerOpen(false)} className="s2-drawer-apply">
              {tr('Show {count} results', { count: visible.length })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── ChipPill (active filter chip) ──────────────────────────────────────────
function ChipPill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="filter-chip" type="button">
      {label}
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
        <path d="M2 2L8 8M8 2L2 8" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    </button>
  );
}
