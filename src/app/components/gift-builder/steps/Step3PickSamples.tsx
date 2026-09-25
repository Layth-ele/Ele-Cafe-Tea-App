/**
 * Step3PickSamples.tsx — Pick free samples (Step 3 of 6).
 *
 * Roadmap §6-step modal flow. Extracted from the old Step 2's
 * "Choose samples" tab. Same filterable tea grid, but selection
 * routes through `toggleSample` and the visible list excludes any
 * tea already picked as a paid pick (spec: "same tea cannot be both").
 *
 * Auto-skip: when `bundle.sampleCount === 0` (Taster), the modal
 * (via `useGiftBuilderStore.getNextStep`/`getPrevStep`) never lands
 * here — and the stepper hides this dot. The defensive bundle-guard
 * below is the third belt: if someone deep-links to step 3 with a
 * sample-less bundle, we render a soft "nothing to pick" state and
 * `canContinue === true` (sample length === sampleCount === 0) lets
 * them keep going.
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
export function Step3PickSamples() {
  const tr = useT();
  const bundleSlug      = useGiftBuilderStore(s => s.bundleSlug);
  const selectedTeas    = useGiftBuilderStore(s => s.selectedTeas);
  const selectedSamples = useGiftBuilderStore(s => s.selectedSamples);
  const toggleTea       = useGiftBuilderStore(s => s.toggleTea);
  const toggleSample    = useGiftBuilderStore(s => s.toggleSample);

  const bundle = bundleSlug ? findBundle(bundleSlug) : null;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const toastShownRef = useRef(false);

  const { data: products = [], isLoading } = useTeasRealtime();
  const liveCategories = useCategoriesRealtime();

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

  // Exclude teas already picked as paid (mirror of Step 2's exclusion).
  const teaIds = useMemo(
    () => new Set(selectedTeas.map(t => t.id ?? '')),
    [selectedTeas],
  );
  const visible = useMemo(
    () => filtered.filter(p => !teaIds.has(p.id ?? '')),
    [filtered, teaIds],
  );

  useEffect(() => {
    if (!bundle) return;
    if (selectedSamples.length < bundle.sampleCount) toastShownRef.current = false;
  }, [bundle, selectedSamples.length]);

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

  if (!bundle) {
    return (
      <p className="s2-fallback">
        {tr('Pick a bundle first, please.')}
      </p>
    );
  }

  // Belt #3 in the smart-skip defense. The modal shouldn't navigate here
  // for sample-less bundles; if it somehow did, give the user a soft
  // explanation and let the footer Continue carry them forward
  // (canContinue is true since 0 === sampleCount).
  if (bundle.sampleCount === 0) {
    return (
      <p className="s2-fallback">
        {tr('This bundle doesn\'t include free samples. Continue to the next step.')}
      </p>
    );
  }

  function cardStateFor(tea: Product): CardState {
    if (!bundle) return 'default';
    const id = tea.id ?? '';
    // Same state priority as Step 2 — selected wins over unavailable
    // so a sample already in the bundle can be deselected even if it
    // went OOS after selection.
    const sampleIds = new Set(selectedSamples.map(t => t.id ?? ''));
    if (sampleIds.has(id)) return 'selected';
    if (!isProductAvailable(tea)) return 'unavailable';
    if (selectedSamples.length >= bundle.sampleCount) return 'limit';
    return 'default';
  }

  function handleCardClick(tea: Product) {
    if (!bundle) return;
    const state = cardStateFor(tea);
    if (state === 'unavailable') {
      toast(tNow('{name} is sold out right now.', { name: tea.name ?? tNow('This tea') }));
      return;
    }
    if (state === 'limit') {
      if (!toastShownRef.current) {
        toastShownRef.current = true;
        const max = bundle.sampleCount;
        toast(tNow(max === 1 ? 'Pick {count} sample total. Tap a selected one to swap.' : 'Pick {count} samples total. Tap a selected one to swap.', { count: max }));
      }
      return;
    }
    toggleSample(tea);
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
      <div className="s2-head">
        <div>
          <h3 className="s2-bundle-name">
            {tr('Free samples')}
          </h3>
          <p className="s2-bundle-tag">
            {tr(bundle.sampleCount === 1 ? 'Try 1 more tea, on us.' : 'Try {count} more teas, on us.', { count: bundle.sampleCount })}
          </p>
        </div>
        <DualCounter
          teasSelected={0} teasMax={0}
          samplesSelected={selectedSamples.length} samplesMax={bundle.sampleCount}
        />
      </div>

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
                  addLabel={tr('Add as sample')}
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
