/**
 * BundleTeaCard.tsx — Tea card for Step 2 of the gift builder.
 *
 * Day 16. Adapts the visual look of the products-page tea card but
 * swaps "Add to Cart" for "Add to bundle" / "Add as sample" and
 * handles these states:
 *
 *   1. Default       — shows action label, fully opaque
 *   2. Selected      — gold border + checkmark, "Selected" label, click toggles off
 *   3. At-limit      — 40% opacity, button disabled, "Limit reached" text
 *   4. Unavailable   — Turn 6: tea is out of stock per inventory projection;
 *                      disabled with "Sold out" label so the customer doesn't
 *                      build a bundle the checkout will reject.
 *
 * The card itself is presentational — the parent passes selection
 * state and click handlers, so the same component works for both
 * the "Choose teas" and "Choose samples" tabs.
 */

import React from 'react';
import { Check } from 'lucide-react';
import type { Product } from '@/types';
import { categories } from '@/data/categories';
import { LazyImage } from '@/app/components/LazyImage';

import { useT, localizeTea, useLang } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
export type CardState = 'default' | 'selected' | 'limit' | 'unavailable';

interface BundleTeaCardProps {
  product:  Product;
  state:    CardState;
  /** Action label. Differs per tab — "Add to bundle" / "Add as sample". */
  addLabel: string;
  onClick:  () => void;
}

export const BundleTeaCard = React.memo(function BundleTeaCard({
  product, state, addLabel, onClick,
}: BundleTeaCardProps) {
  const t = useT();
  const name      = localizeTea(product, useLang()).name || 'Unnamed';
  const price     = typeof product.price === 'number' ? product.price : 0;
  const image     = product.image ?? '';
  const category  = product.category ?? 'other';
  const catName   = categories.find(c => c.id === category)?.name ?? category;

  const isSelected  = state === 'selected';
  const atLimit     = state === 'limit';
  const unavailable = state === 'unavailable';
  // Disable click for both reached-limit AND unavailable. Selected teas
  // are still clickable (so customer can deselect to swap).
  const disabled    = atLimit || unavailable;

  return (
    <div
      onClick={disabled ? undefined : onClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={e => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-pressed={isSelected}
      aria-disabled={disabled}
      className="btc-card"
      data-state={state}
    >
      {/* Selected checkmark — top-right */}
      {isSelected && (
        <span className="btc-check">
          <Check size={14} strokeWidth={3} />
        </span>
      )}

      {/* Image */}
      <div className="btc-image">
        <LazyImage
          src={image}
          alt={name}
          aspectRatio="1/1"
          className="btc-img"
        />
        {product.isOrganic && (
          <span className="btc-organic">
            {t('Organic')}
          </span>
        )}
      </div>

      {/* Category */}
      <span className="btc-cat">
        {t(catName)}
      </span>

      {/* Name */}
      <span
        className="btc-name"
        title={name}
      >
        {name}
      </span>

      {/* Price */}
      <span className="btc-price">
        {formatMoney(price)}
      </span>

      {/* Action label — visual only, the whole card is the click target.
          Priority: selected > unavailable > limit > default. Unavailable
          beats limit because if it can't be bought, showing "Limit reached"
          would be misleading. */}
      <span className="btc-action" data-state={state}>
        {isSelected   ? t('Selected')
        : unavailable ? t('Sold out')
        : atLimit     ? t('Limit reached')
                      : addLabel}
      </span>
    </div>
  );
});
