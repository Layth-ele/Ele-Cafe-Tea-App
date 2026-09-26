/**
 * ProductsPage — Enterprise filter rewrite
 *
 * Zero-blink architecture:
 * 1. navigate() COMPLETELY REMOVED — all state in query params only
 *    (navigate() causes full React Router remount = visible blink on every filter click)
 * 2. CSS grid-template-rows: 0fr → 1fr accordion — no JS height measurement
 * 3. FilterSidebar as stable React.memo — never remounts
 * 4. Open/closed state lives in parent — never lost
 * 5. 6 products per page with client-side pagination
 * 6. Sidebar is scrollable, sticky, max-height viewport
 * 7. useDeferredValue on search — input stays 60fps while filter defers
 */

import { useState, useMemo, useCallback, useRef, useEffect, startTransition } from 'react';
import { useTeasRealtime } from '@/hooks/useTeasRealtime';
import { useCategoriesRealtime } from '@/hooks/useCategoriesRealtime';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { ROUTES, TEA_CATEGORIES, SITE_BASE } from '@/lib/routes';
import type { Product } from '@/types';
import { useT, useLang, categoryName } from '@/i18n/useT';
import { CATEGORY_SEO } from '../../../functions/src/lib/seoCatalog';
import { prefetchRoutesForPage } from '@/lib/prefetchRoute';
import { useProductsFilters } from '@/hooks/useProductsFilters';
// Day 16: filter sidebar/search bar/CSS extracted to shared modules so
// the gift-builder Step 2 can reuse them. Constants come from teaFilters.
import { TeaFilterSidebar } from '@/app/components/products/TeaFilterSidebar';
import { TeaSearchBar } from '@/app/components/products/TeaSearchBar';
import { ProductsActiveChips } from '@/app/components/products/ProductsActiveChips';
import { CafeMenuFor } from '@/app/components/cafe/CafeMenuBoard';
import { ProductsEmptyState } from '@/app/components/products/ProductsEmptyState';
import { ProductsPageHeader } from '@/app/components/products/ProductsPageHeader';
import { ProductsCardSkeleton, ProductsTeaCard } from '@/app/components/products/ProductsTeaCard';
import { Pagination } from '@/app/components/ui/Pagination';
// Phase 23 — react-flip-toolkit removed. The library (v7.2.4) was
// causing a hard crash ("Something went wrong" error boundary) on every
// filter check/uncheck/select/reset because its internal registry gets
// out of sync with React 19's concurrent renderer. Each filter mutation
// calls startTransition() which lets React partially commit / un-commit
// children before Flipper finishes measuring them — Flipper then calls
// removeChild on nodes React has already unmounted, throwing a
// DOMException: NotFoundError.
//
// Phase 10's earlier workaround (removing filter state from flipKey)
// addressed the symptom only for SEQUENTIAL filter changes. Combined
// with React 19's transition semantics it didn't hold up.
//
// We've replaced the FLIP morph animation with a CSS opacity+translateY
// fade on each card. Visually similar at the 380ms duration, native
// browser implementation, can't crash. Honors prefers-reduced-motion
// via the existing @media query in design.css.
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import {
  type FilterOpenSections,
  type TeaFilterState,
  DEFAULT_OPEN_SECTIONS,
  matchesTeaFilters,
  deriveFilterVocabulary,
  facetCounts,
} from '@/lib/teaFilters';
import '../components/products/TeaFilters.css';

// Default page size for the catalogue grid. Customers can override via
// the GCP-style "Items per page" dropdown in the Pagination component;
// state below holds the live value. We keep a default constant so the
// initial skeleton render matches the eventual count.
const DEFAULT_PAGE_SIZE = 6;
const PAGE_SIZE_OPTIONS = [6, 12, 24, 48];

// ── Main page ──────────────────────────────────────────────────────────────────
export function ProductsPage() {
  const t = useT();
  const lang = useLang();

  // Phase 8 improvement — idle-time prefetch of teaProfile + cart
  // chunks. Most-likely next clicks from /products are a tea card
  // (→ /tea-profile) or the cart icon. Prefetching during browser
  // idle removes the JS-load wait on those clicks.
  useEffect(() => {
    prefetchRoutesForPage('products');
  }, []);

  // Live subscription — admin edits appear here within ~1s of the
  // Firestore write, no 5-min staleTime to wait through. Falls back
  // to mockProducts on empty/error (same as fetchTeas).
  const { data: products = [], isLoading: loading, error: productsError } = useTeasRealtime();

  // Live category list. Falls back to the hardcoded baseline if
  // /categories is empty or the subscription errors. Lets admin add
  // a new category (e.g. "Pu-erh") via Firestore Console + tag teas
  // with that category, and customers immediately see the new filter
  // checkbox without a code deploy.
  const liveCategories = useCategoriesRealtime();

  // ── Section open/closed state — in parent so never lost ────────────────────
  // Accordion behavior: opening a section auto-closes all the others,
  // so at most ONE filter category is open at a time. Toggling an
  // already-open section closes it (= all-closed state). This is the
  // pattern users requested — keeps the sidebar compact and stops it
  // from scrolling forever when many sections expand at once.
  const [openSections, setOpenSections] = useState<FilterOpenSections>(DEFAULT_OPEN_SECTIONS);
  const toggleSection = useCallback((key: keyof FilterOpenSections) => {
    setOpenSections((prev) => {
      const isOpening = !prev[key];
      // Start from all-closed, then flip the clicked key to its new
      // state. When opening: only this one is open. When closing:
      // everything is closed. Object literal is safer than reduce
      // because it documents the exact key set inline.
      return {
        cats: false,
        avail: false,
        more: false,
        ing: false,
        funct: false,
        [key]: isOpening,
      };
    });
  }, []);

  const categoryCatalog = useMemo(
    () => (liveCategories.length > 0 ? liveCategories : TEA_CATEGORIES),
    [liveCategories],
  );
  const validCatIds = useMemo<Set<string>>(
    () => new Set(categoryCatalog.map((c) => c.id)),
    [categoryCatalog],
  );
  const {
    urlCategory,
    selectedCats,
    setSelectedCats,
    inStock,
    setInStock,
    outOfStock,
    setOutOfStock,
    organicOnly,
    setOrganicOnly,
    caffFilter,
    setCaffFilter,
    ingredientFilter,
    setIngredientFilter,
    functFilter,
    setFunctFilter,
    search,
    setSearch,
    sortBy,
    setSortBy,
    page,
    setPage,
    pageSize,
    setPageSize,
    deferredSearch,
    toggleCat,
    toggleCaff,
    toggleIngredient,
    toggleFunct,
    resetAll,
    availCount,
    moreCount,
    totalActive,
    pairingCtx,
  } = useProductsFilters({ defaultPageSize: DEFAULT_PAGE_SIZE, validCategoryIds: validCatIds });

  const [drawerOpen, setDrawerOpen] = useState(false);

  // Reset to page 1 when filters change
  const prevFilterKey = useRef('');

  // ── Filter all products ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const filters: TeaFilterState = {
      selectedCats,
      inStock,
      outOfStock,
      organicOnly,
      caffFilter,
      ingredientFilter,
      functFilter,
    };
    let r = products.filter((p: Product) => matchesTeaFilters(p, filters, deferredSearch));
    // Sort behaviour stays here because it's ProductsPage-specific
    // (gift-builder Step 2 has no sort dropdown).
    if (sortBy === 'price-asc') r = [...r].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    if (sortBy === 'price-desc') r = [...r].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    if (sortBy === 'name') r = [...r].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    return r;
  }, [
    products,
    selectedCats,
    deferredSearch,
    inStock,
    outOfStock,
    organicOnly,
    caffFilter,
    ingredientFilter,
    functFilter,
    sortBy,
  ]);

  // Reset page when filtered results change
  const filterKey = filtered.length + '_' + totalActive;
  useEffect(() => {
    if (filterKey !== prevFilterKey.current) {
      setPage(1);
      prevFilterKey.current = filterKey;
    }
  }, [filterKey, setPage]);

  // ── Pagination ──────────────────────────────────────────────────────────────
  const dynamicPageSizeOptions = useMemo(() => {
    const maxCount = Math.max(1, filtered.length);
    const opts = new Set<number>();

    for (const n of PAGE_SIZE_OPTIONS) {
      if (n <= maxCount) opts.add(n);
    }

    // Always include current selection if it's valid for the current result set.
    if (pageSize <= maxCount) opts.add(pageSize);

    // Include exact result count so users can show "all filtered" in one page.
    if (filtered.length > 0) opts.add(filtered.length);

    if (opts.size === 0) opts.add(maxCount);
    return [...opts].sort((a, b) => a - b);
  }, [filtered.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageStart = (page - 1) * pageSize;
  const paginated = filtered.slice(pageStart, pageStart + pageSize);

  const goPage = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Changing the page size mid-session should always send the user
  // back to page 1 — slot index N on a size=12 view doesn't map to
  // slot N on a size=24 view, and most users expect "show me more"
  // to reveal the FIRST page worth of results, not stay where the
  // existing scroll happened to be.
  const handlePageSizeChange = (n: number) => {
    setPageSize(n);
    setPage(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── SEO ─────────────────────────────────────────────────────────────────────
  // Show category name as title ONLY when the single selected category
  // is the sole active filter — any other filter (organic, caffeine, etc.)
  // would make the title misleading (e.g. "White Tea" when filtered by Organic)
  const onlyCatFilter =
    selectedCats.size === 1 && availCount === 0 && moreCount === 0 && !deferredSearch;
  const activeCatMeta = onlyCatFilter
    ? categoryCatalog.find((c) => selectedCats.has(c.id))
    : urlCategory && totalActive === 0
      ? categoryCatalog.find((c) => c.id === urlCategory)
      : null;

  // Canonical URL strategy — when filters / pagination / sort / search are
  // applied, the canonical points at the clean "primary" URL so duplicate
  // variations don't get indexed as separate pages. /products/black is a
  // real route (App.tsx — see the optional :category segment), so we
  // canonicalize either to /products or /products/{category}, never to a
  // query-param permutation.
  const catSeo = activeCatMeta ? CATEGORY_SEO[activeCatMeta.id] : undefined;
  const catIntro = catSeo ? (lang === 'fr' ? catSeo.introFr : catSeo.intro) : undefined;

  const canonicalUrl = activeCatMeta
    ? `${SITE_BASE}/products/${activeCatMeta.id}`
    : `${SITE_BASE}/products`;

  // Day 16: filterProps now matches TeaFilterSidebarProps. The shared sidebar
  // derives availCount and moreCount internally, so we no longer pass them.
  // Dynamic filter vocabulary — derive ingredient/function checkboxes
  // from loaded products so admin-added vocabulary appears in the
  // sidebar without a code change. The helper merges with the curated
  // baseline lists, so the sidebar is never empty even on a fresh
  // deploy with no teas seeded.
  const filterVocab = useMemo(() => deriveFilterVocabulary(products), [products]);
  // Live "how many teas" next to every filter option.
  const filterCounts = useMemo(
    () =>
      facetCounts(
        products,
        {
          selectedCats,
          inStock,
          outOfStock,
          organicOnly,
          caffFilter,
          ingredientFilter,
          functFilter,
        },
        deferredSearch,
      ),
    [
      products,
      selectedCats,
      inStock,
      outOfStock,
      organicOnly,
      caffFilter,
      ingredientFilter,
      functFilter,
      deferredSearch,
    ],
  );

  const filterProps = {
    openSections,
    toggleSection,
    selectedCats,
    inStock,
    outOfStock,
    organicOnly,
    caffFilter,
    ingredientFilter,
    functFilter,
    toggleCat,
    setSelectedCats,
    setInStock,
    setOutOfStock,
    setOrganicOnly,
    setCaffFilter,
    setIngredientFilter,
    setFunctFilter,
    toggleCaff,
    toggleIngredient,
    toggleFunct,
    ingredients: filterVocab.ingredients,
    functions: filterVocab.functions,
    counts: filterCounts,
    categories: liveCategories,
  };

  return (
    <div className="pp-page">
      <SeoHead
        title={
          activeCatMeta
            ? `${activeCatMeta.label} | Ele Café Vancouver`
            : 'Shop Loose Leaf Tea Online in Canada — All Teas | Ele Café Vancouver'
        }
        description={
          activeCatMeta
            ? (catSeo?.intro ??
              `Shop premium loose leaf ${activeCatMeta.label.toLowerCase()} at Ele Café, Vancouver's tea shop.`)
            : "Shop loose leaf tea online in Canada — black, green, oolong, rooibos, herbal and fruit tea from Ele Café, Vancouver's tea café."
        }
        url={canonicalUrl}
        breadcrumbs={(() => {
          // Phase 27 — When the user arrived from a pairing page,
          // useProductsFilters preserved the ?fromPairing= context
          // through filter URL syncs. Read it here to render a
          // breadcrumb chain that continues the journey rather than
          // resetting to "Home > Our Teas".
          const fromPairing = pairingCtx.slug;
          const fromPairingTitle = pairingCtx.title;
          if (fromPairing && fromPairingTitle) {
            return [
              { name: 'Home', url: SITE_BASE },
              { name: 'Pairings', url: `${SITE_BASE}/pairings` },
              { name: fromPairingTitle, url: `${SITE_BASE}/pairings/${fromPairing}` },
              ...(activeCatMeta
                ? [{ name: activeCatMeta.label, url: `${SITE_BASE}/products/${activeCatMeta.id}` }]
                : [{ name: 'Our Teas', url: `${SITE_BASE}/products` }]),
            ];
          }
          return [
            { name: 'Home', url: SITE_BASE },
            { name: t('Our Teas'), url: `${SITE_BASE}/products` },
            ...(activeCatMeta
              ? [{ name: activeCatMeta.label, url: `${SITE_BASE}/products/${activeCatMeta.id}` }]
              : []),
          ];
        })()}
      />

      {/* Visible breadcrumbs — only on category routes (the bare /products
          is already a top-level destination and doesn't need them). The
          JSON-LD copy is already inside <SeoHead breadcrumbs=…>; we pass
          withoutSchema to avoid duplicate ld+json scripts.
          Phase 27 — also rendered on the bare /products route when the
          user arrived from a pairing, so the back-trail to the pairing
          is always visible. */}
      {(activeCatMeta || (pairingCtx.slug && pairingCtx.title)) && (
        <div className="bc-page-wrap">
          <Breadcrumbs
            withoutSchema
            items={(() => {
              const fromPairing = pairingCtx.slug;
              const fromPairingTitle = pairingCtx.title;
              if (fromPairing && fromPairingTitle) {
                return [
                  { name: 'Home', url: ROUTES.HOME },
                  { name: 'Pairings', url: ROUTES.PAIRINGS },
                  { name: fromPairingTitle, url: ROUTES.PAIRING(fromPairing) },
                  ...(activeCatMeta
                    ? [
                        {
                          name: categoryName(activeCatMeta, lang),
                          url: ROUTES.PRODUCTS_CAT(activeCatMeta.id),
                        },
                      ]
                    : [{ name: 'Our Teas', url: ROUTES.PRODUCTS }]),
                ];
              }
              return [
                { name: 'Home', url: ROUTES.HOME },
                { name: 'Teas', url: ROUTES.PRODUCTS },
                {
                  name: categoryName(activeCatMeta!, lang),
                  url: ROUTES.PRODUCTS_CAT(activeCatMeta!.id),
                },
              ];
            })()}
          />
        </div>
      )}

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <ProductsPageHeader
        title={
          activeCatMeta
            ? categoryName(activeCatMeta, lang)
            : deferredSearch
              ? `"${deferredSearch}"`
              : totalActive > 0
                ? t('Filtered Teas')
                : t('Our Teas')
        }
        intro={catIntro}
        resultCount={filtered.length}
        page={page}
        totalPages={totalPages}
        loading={loading}
      />

      {/* ── Layout ──────────────────────────────────────────────────────────── */}
      <div className="pp-layout">
        {/* ── Desktop sidebar — sticky + scrollable ──────────────────────── */}
        <aside className="products-sidebar pp-sidebar">
          <TeaFilterSidebar {...filterProps} />
        </aside>

        {/* ── Main ────────────────────────────────────────────────────────── */}
        <div className="pp-main">
          {/* Toolbar */}
          <div className="pp-toolbar">
            {/* Day 16: floating-pill search extracted to TeaSearchBar so the
                gift-builder Step 2 can reuse the same input chrome. */}
            <TeaSearchBar
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder={
                products.length
                  ? t('Search {count} teas…', { count: products.length })
                  : t('Search teas…')
              }
            />

            {/* Sort */}
            <div className="pp-sort-wrap">
              <span className="pp-sort-label">{t('Sort:')}</span>
              <select
                value={sortBy}
                onChange={(e) => {
                  // Phase 8 improvement — startTransition for sort change.
                  // The sort change triggers a full grid re-render plus FLIP
                  // measure+animate, which can be 50-150ms on a tea-rich
                  // catalog. Wrapping the state update marks the work as
                  // non-urgent so the select itself responds instantly and
                  // the new sort applies in the next tick. INP win directly.
                  const next = e.target.value as typeof sortBy;
                  startTransition(() => {
                    setSortBy(next);
                    setPage(1);
                  });
                }}
                aria-label={t('Sort products by')}
                className="field pp-sort-select"
              >
                <option value="best">{t('Best selling')}</option>
                <option value="price-asc">{t('Price: Low → High')}</option>
                <option value="price-desc">{t('Price: High → Low')}</option>
                <option value="name">{t('Name A–Z')}</option>
              </select>
            </div>

            {/* Mobile filter button */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="products-mobile-filter-btn pp-mobile-filter-btn"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="8" y1="12" x2="16" y2="12" />
                <line x1="10" y1="18" x2="14" y2="18" />
              </svg>
              {t('Filters')}
              {totalActive > 0 ? ` (${totalActive})` : ''}
            </button>
          </div>

          {/* Active filter chips */}
          {totalActive > 0 && (
            <ProductsActiveChips
              selectedCats={selectedCats}
              caffFilter={caffFilter}
              ingredientFilter={ingredientFilter}
              functFilter={functFilter}
              organicOnly={organicOnly}
              inStock={inStock}
              outOfStock={outOfStock}
              categories={categoryCatalog}
              ingredientOptions={filterVocab.ingredients}
              toggleCat={toggleCat}
              toggleCaff={toggleCaff}
              toggleIngredient={toggleIngredient}
              toggleFunct={toggleFunct}
              setOrganicOnly={setOrganicOnly}
              setInStock={setInStock}
              setOutOfStock={setOutOfStock}
              resetAll={resetAll}
            />
          )}

          {/* Grid */}
          {productsError && (
            <div className="empty-state pp-error-banner" role="alert">
              <p>
                {t('Some tea data could not load right now. Showing the best available catalog.')}
              </p>
            </div>
          )}
          <div
            className="pp-grid-wrap"
            role="region"
            aria-label={t('Tea collection')}
            aria-live="polite"
            aria-busy={loading}
          >
            {loading ? (
              <div className="pp-grid pp-grid-skel">
                {Array.from({ length: pageSize }).map((_, i) => (
                  <ProductsCardSkeleton key={i} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <ProductsEmptyState
                deferredSearch={deferredSearch}
                selectedCats={selectedCats}
                inStock={inStock}
                outOfStock={outOfStock}
                organicOnly={organicOnly}
                caffFilter={caffFilter}
                ingredientFilter={ingredientFilter}
                functFilter={functFilter}
                setSearch={setSearch}
                resetAll={resetAll}
              />
            ) : (
              <>
                {/* Phase 23 — Plain CSS grid (no react-flip-toolkit).
                    Local ErrorBoundary contains any future grid-only
                    crash so the rest of the page (header, filters, chips,
                    pagination) stays usable. The inline fallback is
                    inside <main>, so the customer can still navigate.

                    Key stability: id ?? slug ?? `idx-${i}`. The triple
                    fallback prevents undefined-key collisions when a
                    product doc somehow ships without either field
                    (shouldn't happen — Turn 12 made slug the doc ID —
                    but cheap defense-in-depth).

                    Card entrance animation is a CSS @keyframes (see
                    .pp-grid-results > * in design.css) — same ~380ms
                    duration, native browser, can't crash. */}
                <ErrorBoundary
                  fallback={
                    <div className="empty-state" role="alert">
                      <p>
                        {t('The product grid hit an unexpected error. Please refresh the page.')}
                      </p>
                    </div>
                  }
                >
                  <div className="pp-grid pp-grid-results">
                    {paginated.map((p: Product, i: number) => {
                      const stableKey = p.id ?? p.slug ?? `idx-${pageStart + i}`;
                      return (
                        <div key={stableKey} data-card-anim>
                          <ProductsTeaCard product={p} priority={i < 6} />
                        </div>
                      );
                    })}
                  </div>
                </ErrorBoundary>

                {/* Pagination — Google Cloud Console-style data-table footer.
                    Always rendered when there are results so the size
                    selector is always available; the chevrons disable
                    themselves when only one page exists. */}
                <div className="pp-pagination-wrap">
                  <Pagination
                    page={page}
                    pageSize={pageSize}
                    totalItems={filtered.length}
                    onPageChange={goPage}
                    onPageSizeChange={handlePageSizeChange}
                    pageSizeOptions={dynamicPageSizeOptions}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tea Powders: what we make with them in the café. */}
      {selectedCats.size === 1 && selectedCats.has('powder') && (
        <div className="cmb-page-wrap">
          <CafeMenuFor id="matcha" />
          <CafeMenuFor id="hojicha" />
        </div>
      )}

      {/* ── Mobile drawer ─────────────────────────────────────────────────── */}
      <div
        className={`filter-drawer-overlay${drawerOpen ? '' : ' hidden'}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <div className={`filter-drawer-panel${drawerOpen ? '' : ' closed'}`}>
        <div className="pp-drawer-head">
          <span className="pp-drawer-title">{t('Filters')}</span>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label={t('Close filters')}
            className="pp-drawer-close"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <TeaFilterSidebar {...filterProps} />
        <button onClick={() => setDrawerOpen(false)} className="pp-drawer-apply">
          {t('Show {count} results', { count: filtered.length })}
        </button>
      </div>
    </div>
  );
}
export default ProductsPage;
