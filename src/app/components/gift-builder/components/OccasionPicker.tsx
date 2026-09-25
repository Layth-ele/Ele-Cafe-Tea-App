/**
 * OccasionPicker.tsx — Icon grid picker for Step 3.
 *
 * Day 16. 12 preset occasions + an "Other" tile that, when selected,
 * reveals a free-text input below the grid (capped at 30 chars per spec).
 *
 * Single-select. Selection feedback matches BundleCard: gold border +
 * subtle elevation. Keyboard accessible — Tab cycles tiles, Space/Enter
 * selects.
 */

import { OCCASIONS, type OccasionId } from '@/app/components/gift-builder/data/bundles';

import { useT } from '@/i18n/useT';
interface OccasionPickerProps {
  value:           OccasionId | '';
  customValue:     string;
  onChange:        (id: OccasionId | '') => void;
  onCustomChange:  (text: string) => void;
}

export function OccasionPicker({
  value, customValue, onChange, onCustomChange,
}: OccasionPickerProps) {
  const t = useT();
  return (
    <div>
      <div className="op-grid">
        {OCCASIONS.map(occ => {
          const selected = value === occ.id;
          return (
            <button
              key={occ.id}
              type="button"
              onClick={() => onChange(selected ? '' : occ.id)}
              aria-pressed={selected}
              aria-label={t(occ.label)}
              className="op-tile"
              data-selected={selected ? 'true' : 'false'}
            >
              <span className="op-icon">{occ.icon}</span>
              <span className="op-label">
                {t(occ.label)}
              </span>
            </button>
          );
        })}
      </div>

      {value === 'other' && (
        <div className="op-custom-wrap">
          <input
            type="text"
            value={customValue}
            onChange={e => onCustomChange(e.target.value.slice(0, 30))}
            placeholder={t('Custom occasion (max 30 chars)')}
            aria-label={t('Custom occasion')}
            maxLength={30}
            className="op-custom-input"
          />
          <p className="op-counter">
            {customValue.length} / 30
          </p>
        </div>
      )}
    </div>
  );
}
