/**
 * inventoryStatus.ts — the one rule for back-of-house item stock status.
 * Shared by the onInventoryItemWrite trigger / setInventoryItem callable
 * and the dashboard (live row badge, counts), so they can never disagree.
 */
export type ItemStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

/** Used when the category has no threshold set. */
export const DEFAULT_LOW_THRESHOLD = 3;

/**
 * Quantity strictly below this is "Low stock". The category threshold is
 * the floor: an item's own threshold can RAISE it (e.g. milk at 6) but
 * never lower it — so "below 3 = low" for Pastries/Vegan Tarts always holds.
 */
export function effectiveLowThreshold(itemThreshold: number | null | undefined, categoryThreshold: number | null | undefined): number {
  const floor = typeof categoryThreshold === 'number' && categoryThreshold >= 0 ? categoryThreshold : DEFAULT_LOW_THRESHOLD;
  return typeof itemThreshold === 'number' && itemThreshold > floor ? itemThreshold : floor;
}

export function deriveItemStatus(quantity: number, threshold: number): ItemStatus {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity < threshold) return 'low_stock';
  return 'in_stock';
}
