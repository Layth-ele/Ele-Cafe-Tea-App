import { useCallback, useDeferredValue, useEffect, useRef, useState, startTransition } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ingredientKey } from '@/lib/teaFilters';

export type ProductSortBy = 'best' | 'price-asc' | 'price-desc' | 'name';

interface UseProductsFiltersArgs {
  defaultPageSize: number;
  validCategoryIds: Set<string>;
}

export function useProductsFilters({ defaultPageSize, validCategoryIds }: UseProductsFiltersArgs) {
  const { category: urlCategory } = useParams<{ category?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Latest location for the debounced URL sync (kept out of its deps so
  // the sync's own navigation doesn't re-trigger it).
  const locationRef = useRef(location);
  locationRef.current = location;

  const [selectedCats, setSelectedCats] = useState<Set<string>>(() => {
    // Priority 1: path param /products/:category (single selection)
    if (urlCategory && validCategoryIds.has(urlCategory)) return new Set([urlCategory]);
    // Priority 2: ?cats=a,b,c (multi-select — what the outbound sync writes)
    const cats = searchParams.get('cats');
    if (cats) {
      const valid = cats.split(',').filter(c => validCategoryIds.has(c));
      if (valid.length) return new Set(valid);
    }
    // Priority 3: legacy ?category=x — kept for backward compat with
    // old shared links from before the refactor to plural cats param.
    const q = searchParams.get('category');
    if (q && validCategoryIds.has(q)) return new Set([q]);
    return new Set();
  });

  const [inStock, setInStock] = useState(searchParams.get('inStock') === '1');
  const [outOfStock, setOutOfStock] = useState(searchParams.get('outOfStock') === '1');
  const [organicOnly, setOrganicOnly] = useState(searchParams.get('organic') === '1');
  const [caffFilter, setCaffFilter] = useState<Set<string>>(() => {
    const v = searchParams.get('caffeine');
    return v ? new Set(v.split(',')) : new Set();
  });
  const [ingredientFilter, setIngredientFilter] = useState<Set<string>>(() => {
    // Normalised so older shared links ("Green Tea") still tick the option.
    const v = searchParams.get('ingredients');
    return v ? new Set(v.split(',').map(ingredientKey)) : new Set();
  });
  const [functFilter, setFunctFilter] = useState<Set<string>>(() => {
    const v = searchParams.get('functionality');
    return v ? new Set(v.split(',')) : new Set();
  });
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [sortBy, setSortBy] = useState<ProductSortBy>(() => {
    const raw = searchParams.get('sort');
    return raw === 'price-asc' || raw === 'price-desc' || raw === 'name' || raw === 'best'
      ? raw
      : 'best';
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);

  const deferredSearch = useDeferredValue(search);

  // Arriving on /products/:category (link, back/forward) selects that
  // category. Keyed on the id + its validity only — NOT on the
  // validCategoryIds Set itself, whose identity changes on every live
  // categories snapshot and used to re-force the path category back on
  // right after the customer unchecked it.
  const urlCategoryValid = !!urlCategory && validCategoryIds.has(urlCategory);
  useEffect(() => {
    if (!urlCategory || !urlCategoryValid) return;
    setSelectedCats(prev => {
      if (prev.size === 1 && prev.has(urlCategory)) return prev;
      setPage(1);
      return new Set([urlCategory]);
    });
  }, [urlCategory, urlCategoryValid]);

  const toggleCat = useCallback((id: string) => {
    startTransition(() => {
      setSelectedCats(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      });
      setPage(1);
    });
  }, []);

  const toggleCaff = useCallback((v: string) => {
    startTransition(() => {
      setCaffFilter(prev => {
        const n = new Set(prev);
        n.has(v) ? n.delete(v) : n.add(v);
        return n;
      });
      setPage(1);
    });
  }, []);

  const toggleIngredient = useCallback((v: string) => {
    startTransition(() => {
      setIngredientFilter(prev => {
        const n = new Set(prev);
        n.has(v) ? n.delete(v) : n.add(v);
        return n;
      });
      setPage(1);
    });
  }, []);

  const toggleFunct = useCallback((v: string) => {
    startTransition(() => {
      setFunctFilter(prev => {
        const n = new Set(prev);
        n.has(v) ? n.delete(v) : n.add(v);
        return n;
      });
      setPage(1);
    });
  }, []);

  const resetAll = useCallback(() => {
    startTransition(() => {
      setSelectedCats(new Set());
      setInStock(false);
      setOutOfStock(false);
      setOrganicOnly(false);
      setCaffFilter(new Set());
      setIngredientFilter(new Set());
      setFunctFilter(new Set());
      setSearch('');
      setSortBy('best');
      setPage(1);
    });
  }, []);

  // Phase 27 — Snapshot breadcrumb-context query params ONCE on mount.
  // Putting them in a ref keeps them out of the URL-sync effect's deps
  // (which would otherwise loop: read params → write params → read again).
  // The user's "I came from a pairing" context is set in stone for the
  // duration of the page mount.
  const preservedParamsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const ctx   = searchParams.get('fromPairing');
    const title = searchParams.get('fromPairingTitle');
    if (ctx)   preservedParamsRef.current.fromPairing      = ctx;
    if (title) preservedParamsRef.current.fromPairingTitle = title;
    // Run only on mount — we capture the entry context and ignore later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      const params: Record<string, string> = {};
      if (deferredSearch) params.q = deferredSearch;
      if (inStock) params.inStock = '1';
      if (outOfStock) params.outOfStock = '1';
      if (organicOnly) params.organic = '1';
      if (caffFilter.size) params.caffeine = [...caffFilter].join(',');
      if (ingredientFilter.size) params.ingredients = [...ingredientFilter].join(',');
      if (functFilter.size) params.functionality = [...functFilter].join(',');
      if (sortBy !== 'best') params.sort = sortBy;
      // The URL follows the selection (the checkboxes are the source of
      // truth): exactly one category → /products/:category, otherwise
      // /products with ?cats=a,b (or nothing).
      const single = selectedCats.size === 1 ? [...selectedCats][0] : null;
      if (selectedCats.size > 1) params.cats = [...selectedCats].join(',');
      // Phase 27 — re-include preserved breadcrumb-context params so
      // they survive every filter interaction. Without this, clicking
      // any filter would replace the entire query string with only
      // the filter keys above, dropping ?fromPairing= and silently
      // breaking the breadcrumb chain back to the pairing page.
      Object.assign(params, preservedParamsRef.current);
      const pathname = single ? `/products/${encodeURIComponent(single)}` : '/products';
      const search = new URLSearchParams(params).toString();
      const cur = locationRef.current;
      if (cur.pathname !== pathname || cur.search.replace(/^\?/, '') !== search) {
        navigate({ pathname, search: search ? `?${search}` : '' }, { replace: true, preventScrollReset: true });
      }
    }, 120);
    return () => clearTimeout(syncTimer.current);
  }, [
    selectedCats,
    inStock,
    outOfStock,
    organicOnly,
    caffFilter,
    ingredientFilter,
    functFilter,
    deferredSearch,
    sortBy,
    navigate,
  ]);

  const availCount = (inStock ? 1 : 0) + (outOfStock ? 1 : 0);
  const moreCount = (organicOnly ? 1 : 0) + caffFilter.size + ingredientFilter.size + functFilter.size;
  const totalActive = selectedCats.size + availCount + moreCount;

  return {
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
    // Phase 27 — Expose the captured pairing-context so consumers
    // (ProductsPage breadcrumbs) can render a journey-aware chain
    // back to /pairings/{slug} instead of resetting to Home > Teas.
    // Both fields are null when the user did not arrive from a pairing.
    pairingCtx: {
      slug:  preservedParamsRef.current.fromPairing      ?? null,
      title: preservedParamsRef.current.fromPairingTitle ?? null,
    },
  };
}
