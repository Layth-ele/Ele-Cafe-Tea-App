import { describe, expect, test } from 'vitest';
import { pickShippingUpsell } from '../../../src/lib/shippingUpsell';
import type { Product } from '../../../src/schemas/product.schema';

const tea = (id: string, category: string, extra: Partial<Product> = {}) =>
  ({
    id,
    slug: id,
    name: id,
    category,
    price: 18,
    isActive: true,
    available: true,
    ...extra,
  }) as Product;

describe('pickShippingUpsell', () => {
  const teas = [
    tea('assam', 'black'),
    tea('earl-grey', 'black', { avgRating: 5 }),
    tea('sencha', 'green'),
    tea('sold-out', 'black', { available: false }),
    tea('hidden', 'black', { isActive: false }),
  ];

  test('nothing when already at free shipping', () => {
    expect(pickShippingUpsell(teas, [{ id: 'assam', category: 'black' }], 0)).toEqual([]);
  });

  test('same category first, skips cart, sold-out and inactive teas', () => {
    const picks = pickShippingUpsell(teas, [{ id: 'assam', category: 'black' }], 40);
    expect(picks.map((p) => p.product.id)).toEqual(['earl-grey', 'sencha']);
    expect(picks.every((p) => !p.unlocks)).toBe(true);
  });

  test('flags teas that reach free shipping on their own and ranks them first', () => {
    const picks = pickShippingUpsell(teas, [{ id: 'assam', category: 'black' }], 10);
    expect(picks[0]).toMatchObject({ unlocks: true });
    expect(picks.every((p) => p.unlocks)).toBe(true);
  });
});
