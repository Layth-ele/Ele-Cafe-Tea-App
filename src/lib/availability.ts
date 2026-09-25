/**
 * availability.ts — Single source of truth for "is this product
 * available to buy" across the storefront.
 *
 * Post-Turn-6: reads ONLY the inventory-projected fields:
 *   - `available` (boolean)         — written by onInventoryWrite trigger
 *   - `availabilityLabel` (enum)    — same trigger, derived from level 0-10
 *
 * The legacy `stock` field has been removed from the Product schema
 * (Turn 6 cleanup). Every tea doc should now have `available` /
 * `availabilityLabel` populated, because:
 *   1. onTeaCreate auto-provisions an inventory doc at level=10
 *   2. onInventoryWrite immediately projects available=true,
 *      availabilityLabel='in_stock' onto /teas/{teaId}
 *
 * Fail-closed: if both fields are undefined (which would only happen
 * for a tea doc that somehow predates Turn 1 AND has never been
 * touched by inventory), we treat it as unavailable rather than
 * available. The cost of a false "out of stock" is a missed sale;
 * the cost of a false "in stock" is overselling and a refund. The
 * Turn 1 migration script (scripts/migrate-inventory.mjs) backfills
 * inventory docs for any tea missing one, so this should not happen
 * in practice.
 */

// No Product import: each helper takes the smallest structural type
// it needs. That means callers can pass partial product shapes (e.g.
// cart line items, gift-builder candidates) without needing the full
// Product type. The schema in src/schemas/product.schema.ts is the
// source of truth for the projected fields used here.

export type AvailabilityLabel = 'in_stock' | 'low_stock' | 'out_of_stock';

/**
 * English source-language labels. These ARE the i18n keys — every
 * entry here has a matching row in `src/i18n/translations.ts`. Call
 * sites are expected to wrap the return value of getAvailabilityLabel
 * in t(): e.g. `t(getAvailabilityLabel(product) ?? 'Available')`. The
 * customer-facing TeaProfilePage does this; admin tooling intentionally
 * shows the English source per the roadmap's admin-i18n decision.
 *
 * This module is a hook-free helper (used in server-side render paths
 * and outside React trees), so it can't call useT directly.
 */
const LABEL_TEXT: Record<AvailabilityLabel, string> = {
  in_stock:     'In stock',
  low_stock:    'Low stock',
  out_of_stock: 'Out of stock',
};

/** Can the customer add this product to cart right now?
 *  Reads the inventory-projected `available` field. Fails CLOSED
 *  (false) when the field is missing — see the file-level note. */
export function isProductAvailable(product: { available?: boolean } | null | undefined): boolean {
  if (!product) return false;
  return product.available === true;
}

/** Display label for the storefront stock badge. Returns null when
 *  the projection is missing — caller decides whether to hide the
 *  badge or show a neutral fallback like t('Available'). */
export function getAvailabilityLabel(product: { availabilityLabel?: AvailabilityLabel } | null | undefined): string | null {
  if (!product || !product.availabilityLabel) return null;
  return LABEL_TEXT[product.availabilityLabel];
}

/** Status discriminator for badge color styling. Returns one of the
 *  enum values when the projection exists, null otherwise. */
export function getAvailabilityStatus(product: { availabilityLabel?: AvailabilityLabel } | null | undefined): AvailabilityLabel | null {
  if (!product || !product.availabilityLabel) return null;
  return product.availabilityLabel;
}
