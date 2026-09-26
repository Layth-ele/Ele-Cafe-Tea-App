/**
 * shippingUpsell — which teas to suggest when the cart is short of free
 * shipping. Pure (no Firebase) so it's unit-tested.
 *
 * Ranking, best first:
 *   1. adding it on its own reaches free shipping (price ≥ gap)
 *   2. same category as something already in the cart
 *   3. featured, then best rated, then name
 * Only teas that are in stock, active, priced, and not already in the cart.
 */
import type { Product } from '@/schemas/product.schema';
import { isProductAvailable } from '@/lib/availability';

export interface UpsellPick {
  product: Product;
  unlocks: boolean;
}

export function pickShippingUpsell(
  teas: readonly Product[],
  cart: readonly { id: string; category?: string }[],
  gap: number,
  limit = 3,
): UpsellPick[] {
  if (gap <= 0) return [];
  const inCart = new Set(cart.map((i) => i.id));
  const cats = new Set(cart.map((i) => i.category).filter(Boolean) as string[]);
  return teas
    .filter((t) => t.isActive !== false && typeof t.price === 'number' && t.price > 0)
    .filter((t) => !inCart.has(t.id ?? '') && !inCart.has(t.slug ?? ''))
    .filter((t) => isProductAvailable(t))
    .map((t) => ({
      product: t,
      unlocks: (t.price as number) >= gap,
      score:
        ((t.price as number) >= gap ? 4 : 0) +
        (cats.has(t.category ?? '') ? 2 : 0) +
        (t.featured ? 1 : 0),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.product.avgRating ?? 0) - (a.product.avgRating ?? 0) ||
        (a.product.name ?? '').localeCompare(b.product.name ?? ''),
    )
    .slice(0, limit)
    .map(({ product, unlocks }) => ({ product, unlocks }));
}
