import type { FilterOption } from '@/lib/teaFilters';
import { useT, useLang, categoryName } from '@/i18n/useT';

interface ProductsActiveChipsProps {
  selectedCats: Set<string>;
  caffFilter: Set<string>;
  ingredientFilter: Set<string>;
  functFilter: Set<string>;
  organicOnly: boolean;
  inStock: boolean;
  outOfStock: boolean;
  /** Live categories / filter options, for display labels. */
  categories: readonly { id: string; label: string; labelFr?: string }[];
  ingredientOptions: readonly FilterOption[];
  toggleCat: (id: string) => void;
  toggleCaff: (v: string) => void;
  toggleIngredient: (v: string) => void;
  toggleFunct: (v: string) => void;
  setOrganicOnly: (value: boolean) => void;
  setInStock: (value: boolean) => void;
  setOutOfStock: (value: boolean) => void;
  resetAll: () => void;
}

function ChipXIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

export function ProductsActiveChips({
  selectedCats,
  caffFilter,
  ingredientFilter,
  functFilter,
  organicOnly,
  inStock,
  outOfStock,
  categories,
  ingredientOptions,
  toggleCat,
  toggleCaff,
  toggleIngredient,
  toggleFunct,
  setOrganicOnly,
  setInStock,
  setOutOfStock,
  resetAll,
}: ProductsActiveChipsProps) {
  const t = useT();
  const lang = useLang();
  const Chip = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
    <button className="filter-chip" onClick={onRemove} aria-label={t('Remove filter: {label}', { label })}>
      {label}
      <ChipXIcon />
    </button>
  );
  const ingredientLabel = (v: string) => {
    const o = ingredientOptions.find((x) => x.value === v);
    return o ? (lang === 'fr' && o.labelFr) || t(o.label) : v;
  };

  return (
    <div className="pp-chips">
      {[...selectedCats].map(id => {
        const c = categories.find(x => x.id === id);
        return <Chip key={`c-${id}`} label={c ? categoryName(c, lang) : id} onRemove={() => toggleCat(id)} />;
      })}
      {inStock && <Chip label={t('In stock')} onRemove={() => setInStock(false)} />}
      {outOfStock && <Chip label={t('Out of stock')} onRemove={() => setOutOfStock(false)} />}
      {organicOnly && <Chip label={t('Organic')} onRemove={() => setOrganicOnly(false)} />}
      {[...caffFilter].map(v => (
        <Chip key={`k-${v}`} label={t('Caffeine: {level}', { level: t(v) })} onRemove={() => toggleCaff(v)} />
      ))}
      {[...ingredientFilter].map(v => (
        <Chip key={`i-${v}`} label={ingredientLabel(v)} onRemove={() => toggleIngredient(v)} />
      ))}
      {[...functFilter].map(v => (
        <Chip key={`f-${v}`} label={t(v)} onRemove={() => toggleFunct(v)} />
      ))}

      <button onClick={resetAll} className="pp-clear-all-btn">
        {t('Clear all')}
      </button>
    </div>
  );
}
