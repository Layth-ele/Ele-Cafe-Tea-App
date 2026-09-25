/**
 * BundleCard.tsx — One of the four cards rendered in Step 1.
 *
 * Day 16. Displays bundle name, includes list, price, optional badge
 * ("Most Popular" / "Best Value"), and a placeholder image area
 * (Skeleton — actual product photos to be added in a follow-up).
 *
 * Selection feedback matches the existing wrapping picker: gold border
 * + checkmark icon. Clicking the card auto-advances to Step 2 (per spec
 * lines 76–77).
 */

import { memo } from 'react';
import { Check } from 'lucide-react';
import type { Bundle } from '@/app/components/gift-builder/data/bundles';

import { useT } from '@/i18n/useT';
interface BundleCardProps {
  bundle:    Bundle;
  selected:  boolean;
  onSelect:  () => void;
}

export const BundleCard = memo(function BundleCard({ bundle, selected, onSelect }: BundleCardProps) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${t('Select {name}', { name: t(bundle.name) })}, ${bundle.includes.map((l) => t(l)).join(', ')}, $${bundle.price}`}
      className="bc-card"
      data-selected={selected ? 'true' : 'false'}
    >
      {/* Day 16 v2: reserved top row — checkmark on the left when
          selected, badge on the right when present. Always renders at a
          fixed 28px height so cards stay aligned regardless of which
          combination of mark/badge is shown. Replaces the previous
          absolute positioning that overlapped longer titles. */}
      <div className="bc-top-row">
        {selected ? (
          <span className="bc-check">
            <Check size={16} strokeWidth={3} />
          </span>
        ) : <span />}

        {bundle.badge ? (
          <span className="bc-badge">
            {t(bundle.badge)}
          </span>
        ) : <span />}
      </div>

      {/* Image placeholder — Skeleton until real photos exist */}
      <div className="bc-image">
        {/* Subtle shimmer overlay */}
        <div className="bc-shimmer"/>
        <span className="bc-image-label">{t('Bundle photo')}</span>
      </div>

      {/* Name */}
      <h3 className="bc-name">
        {t(bundle.name)}
      </h3>

      {/* Includes list — 2 lines */}
      <ul className="bc-includes">
        {bundle.includes.map(line => (
          <li key={line} className="bc-includes-row">
            <span className="bc-includes-glyph">✦</span>
            {t(line)}
          </li>
        ))}
      </ul>

      {/* Price */}
      <div className="bc-price-row">
        <span className="bc-price">
          ${bundle.price}
        </span>
        <span className="bc-currency">
          CAD
        </span>
      </div>
    </button>
  );
});
