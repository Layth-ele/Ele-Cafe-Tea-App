import { currentLang, localeFor } from '@/i18n/useT';
/**
 * priceFormat.ts — Shared formatting helpers for tea pricing.
 *
 * The canonical unit-price model: every tea has a `price` and a
 * `weightGrams`. The storefront and detail page show "$X.XX / Yg"
 * so customers can compare value across teas with different
 * package sizes.
 *
 * Defaults: 90g when weightGrams is missing (the shop's standard bag —
 * every tea is sold as $18 / 90g; before this
 * field was added).
 */

export const DEFAULT_TEA_WEIGHT_GRAMS = 90;

/**
 * Extract a numeric weight in grams from a legacy `weight` display
 * string. Supports "100g", "50 g", "1kg", "1.5 kg", "100" (assumes
 * grams). Returns null for unparseable values.
 *
 * Used by `resolveWeightGrams` below as a fallback for docs that
 * still only have the legacy string field.
 */
export function parseWeightString(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return null;

  // Match "<number> <unit>" with optional space and unit. Unit
  // defaults to grams when absent.
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(g|gram|grams|kg|kilogram|kilograms|oz|lb)?$/);
  if (!match) return null;
  const n = parseFloat(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;

  const unit = match[2] ?? 'g';
  if (unit === 'kg' || unit === 'kilogram' || unit === 'kilograms') return n * 1000;
  if (unit === 'oz') return Math.round(n * 28.3495);
  if (unit === 'lb') return Math.round(n * 453.592);
  return n;
}

/**
 * Resolve the effective weight (in grams) for a tea product,
 * preferring the canonical numeric field, falling back to a parsed
 * legacy string, then to the default.
 *
 * Returns a guaranteed-positive integer.
 */
export function resolveWeightGrams(p: {
  weightGrams?: number;
  weight?: string;
}): number {
  if (typeof p.weightGrams === 'number' && p.weightGrams > 0) {
    return Math.round(p.weightGrams);
  }
  const parsed = parseWeightString(p.weight);
  if (parsed !== null) return Math.round(parsed);
  return DEFAULT_TEA_WEIGHT_GRAMS;
}

/**
 * Format weight for display: "100g" or "1.5kg" depending on size.
 * Above 1000g we switch to kilograms for readability.
 */
export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000;
    // Trim trailing zeros but keep at most 2 decimals.
    return `${kg.toFixed(2).replace(/\.?0+$/, '')}kg`;
  }
  return `${Math.round(grams)}g`;
}

/**
 * Full price-per-weight label: "$18 / 90g" ($15.50 / 90g when not whole).
 *
 * `price` is the canonical CAD price stored on the product;
 * `product` is the source of truth for the weight (see
 * resolveWeightGrams above). The locale defaults to en-CA so the
 * dollar sign and decimal style match the rest of the storefront.
 */
export function formatPricePerWeight(
  price: number,
  product: { weightGrams?: number; weight?: string },
  locale: string = localeFor(currentLang()),
): string {
  const grams = resolveWeightGrams(product);
  // Whole-dollar prices read cleaner without cents: "$18 / 90g".
  const whole = Number.isInteger(price);
  const priceLabel = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CAD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price);
  return `${priceLabel} / ${formatWeight(grams)}`;
}
