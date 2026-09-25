
import { useT, useTx } from '@/i18n/useT';
interface ProductsEmptyStateProps {
  deferredSearch: string;
  selectedCats: Set<string>;
  inStock: boolean;
  outOfStock: boolean;
  organicOnly: boolean;
  caffFilter: Set<string>;
  ingredientFilter: Set<string>;
  functFilter: Set<string>;
  setSearch: (value: string) => void;
  resetAll: () => void;
}

export function ProductsEmptyState({
  deferredSearch,
  selectedCats,
  inStock,
  outOfStock,
  organicOnly,
  caffFilter,
  ingredientFilter,
  functFilter,
  setSearch,
  resetAll,
}: ProductsEmptyStateProps) {
  const t = useT();
  const tx = useTx();
  const hasSearch = !!deferredSearch.trim();
  const onlySearch = hasSearch && selectedCats.size === 0 && !inStock && !outOfStock && !organicOnly
    && caffFilter.size === 0 && ingredientFilter.size === 0 && functFilter.size === 0;
  const onlyOneCat = !hasSearch && selectedCats.size === 1 && !inStock && !outOfStock && !organicOnly
    && caffFilter.size === 0 && ingredientFilter.size === 0 && functFilter.size === 0;

  if (onlySearch) {
    return (
      <div className="pp-empty-state">
        <p className="pp-empty-msg">{tx('No teas match {query}.', { query: <strong>"{deferredSearch}"</strong> })}</p>
        <p className="pp-empty-hint">{t('Try a different keyword or browse all teas.')}</p>
        <div className="pp-empty-actions">
          <button onClick={() => setSearch('')} className="btn btn-outline btn-sm">
            {t('Clear search')}
          </button>
          <button onClick={resetAll} className="btn btn-dark btn-sm">
            {t('Browse all teas')}
          </button>
        </div>
      </div>
    );
  }

  if (onlyOneCat) {
    const catName = Array.from(selectedCats)[0];
    return (
      <div className="pp-empty-state">
        <p className="pp-empty-msg">{tx('No teas in {category} right now.', { category: <strong>{t(catName)}</strong> })}</p>
        <p className="pp-empty-hint">{t('Check back later or browse a different category.')}</p>
        <button onClick={resetAll} className="btn btn-dark btn-sm">
          {t('Browse all teas')}
        </button>
      </div>
    );
  }

  return (
    <div className="pp-empty-state">
      <p className="pp-empty-msg">{t('No teas match your filters.')}</p>
      <p className="pp-empty-hint">{t('Try removing one or two filters to broaden the search.')}</p>
      <button onClick={resetAll} className="btn btn-dark btn-sm">
        {t('Clear all filters')}
      </button>
    </div>
  );
}
