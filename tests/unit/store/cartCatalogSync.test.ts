/**
 * syncWithCatalog — persisted carts re-price to the live catalog, so a
 * price change (e.g. every tea moving to $18 / 90g) never leaves a stale
 * price in a returning customer's cart or checkout total.
 */
import { beforeEach, describe, test, expect } from 'vitest';
import { useCartStore } from '@/store/cartStore';

const add = (id: string, price: number) => useCartStore.getState().addToCart({
  id, name: `Tea ${id}`, price, image: '', category: 'black', gstApplicable: false,
});

describe('cartStore.syncWithCatalog', () => {
  beforeEach(() => useCartStore.getState().clearCart());

  test('re-prices stale lines and recomputes totals', () => {
    add('a', 15);
    add('b', 18);
    useCartStore.getState().updateQuantity('a', 2);
    const changed = useCartStore.getState().syncWithCatalog([
      { id: 'a', price: 18 }, { id: 'b', price: 18 },
    ]);
    const s = useCartStore.getState();
    expect(changed).toBe(1);
    expect(s.items.find(i => i.id === 'a')?.price).toBe(18);
    expect(s.totalPrice).toBe(54);
  });

  test('is a no-op when prices already match', () => {
    add('a', 18);
    expect(useCartStore.getState().syncWithCatalog([{ id: 'a', price: 18 }])).toBe(0);
    expect(useCartStore.getState().totalPrice).toBe(18);
  });

  test('ignores teas missing from the catalog and invalid prices', () => {
    add('a', 15);
    add('b', 15);
    const changed = useCartStore.getState().syncWithCatalog([{ id: 'b', price: 0 }]);
    expect(changed).toBe(0);
    expect(useCartStore.getState().totalPrice).toBe(30);
  });

  test('refreshes the French name for bilingual carts', () => {
    add('a', 18);
    useCartStore.getState().syncWithCatalog([{ id: 'a', price: 18, nameFr: 'Thé A' }]);
    expect(useCartStore.getState().items[0].nameFr).toBe('Thé A');
  });
});
