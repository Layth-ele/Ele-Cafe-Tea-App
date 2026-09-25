/**
 * SelectedChips.tsx — Live chip list for Step 2.
 *
 * Day 16. Two grouped lists ("Selected teas (2 of 3)" and "Free samples
 * (0 of 2)") with × buttons that remove individual selections. Stays
 * visible during all of Step 2 — right rail on desktop, stacked under
 * the grid on mobile.
 *
 * Visual style is intentionally close to the existing `.filter-chip`
 * (midnight pill on cream background) — the gift-builder modal reuses
 * the same `TeaFilters.css` import that defines it.
 */

import type { Product } from '@/types';

import { useT, tNow } from '@/i18n/useT';
interface SelectedChipsProps {
  teas:           Product[];
  teasMax:        number;
  samples:        Product[];
  samplesMax:     number;
  onRemoveTea:    (tea: Product) => void;
  onRemoveSample: (tea: Product) => void;
}

export function SelectedChips({
  teas, teasMax, samples, samplesMax,
  onRemoveTea, onRemoveSample,
}: SelectedChipsProps) {
  const t = useT();
  return (
    <div className="sc-root">
      <ChipGroup
        title={t('Selected teas')}
        selected={teas.length}
        max={teasMax}
        items={teas}
        onRemove={onRemoveTea}
        emptyText={t('(empty — pick teas in the grid)')}
      />
      {samplesMax > 0 && (
        <ChipGroup
          title={t('Free samples')}
          selected={samples.length}
          max={samplesMax}
          items={samples}
          onRemove={onRemoveSample}
          emptyText={t(samplesMax === 1 ? '(empty — pick {count} sample below)' : '(empty — pick {count} samples below)', { count: samplesMax })}
        />
      )}
    </div>
  );
}

interface ChipGroupProps {
  title:     string;
  selected:  number;
  max:       number;
  items:     Product[];
  onRemove:  (t: Product) => void;
  emptyText: string;
}

function ChipGroup({ title, selected, max, items, onRemove, emptyText }: ChipGroupProps) {
  const t = useT();
  return (
    <div>
      <div className="sc-group-title">
        {t('{title} ({n} of {max})', { title, n: selected, max })}
      </div>
      {items.length === 0 ? (
        <p className="sc-empty">
          {emptyText}
        </p>
      ) : (
        <div className="sc-list">
          {items.map(t => (
            <button
              key={t.id ?? t.slug}
              type="button"
              onClick={() => onRemove(t)}
              aria-label={tNow('Remove {name}', { name: t.name ?? '' })}
              className="sc-chip"
            >
              <span className="sc-chip-label">
                {t.name}
              </span>
              <span className="sc-chip-x">
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2L8 8M8 2L2 8" stroke="currentColor"
                    strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
