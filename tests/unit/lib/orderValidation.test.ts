/**
 * placeOrder cart validation — the attack surface of checkout.
 * Everything here comes from the browser and must be treated as hostile.
 */
import { describe, test, expect } from 'vitest';
import {
  validateOrderLines, OrderInputError, BUNDLE_TIERS, cleanText,
} from '../../../functions/src/lib/orderValidation';

const tea = (productId: string, quantity = 1) => ({ productId, quantity, price: 0.01 });
const bundle = (slug: string, teas: number, samples: number, extra: Record<string, unknown> = {}) => ({
  productId: 'bundle-abc123',
  quantity: 1,
  price: 0.01,
  bundle: {
    slug,
    teas: Array.from({ length: teas }, (_, i) => ({ id: `tea-${i}`, name: `Tea ${i}` })),
    samples: Array.from({ length: samples }, (_, i) => ({ id: `sample-${i}` })),
    personalization: { message: 'x'.repeat(5000), recipientName: '<b>Bob</b>' },
    ...extra,
  },
});
const rejects = (items: unknown) => expect(() => validateOrderLines(items)).toThrow(OrderInputError);

describe('validateOrderLines — IDs used in Firestore paths', () => {
  test('accepts plain slugs', () => {
    expect(validateOrderLines([tea('sencha-fuji', 2)])).toEqual([{ kind: 'tea', productId: 'sencha-fuji', quantity: 2 }]);
  });
  test.each([
    'sencha/reviews/attacker',  // path traversal into a doc the client controls
    '../settings/global',
    '',
    'a'.repeat(121),
    'tea with spaces',
  ])('rejects %j', (id) => rejects([tea(id)]));
  test('rejects a bad id inside a bundle', () => {
    rejects([bundle('curators', 3, 0, { teas: [{ id: 'x/y' }, { id: 'a' }, { id: 'b' }] })]);
  });
});

describe('validateOrderLines — quantities', () => {
  test.each([0, -1, 1.5, 51, NaN, '2'])('rejects quantity %j', (q) => rejects([{ productId: 'sencha', quantity: q }]));
  test('rejects an empty or oversized cart', () => {
    rejects([]);
    rejects(Array.from({ length: 101 }, () => tea('sencha')));
  });
});

describe('validateOrderLines — bundles priced by the server', () => {
  test('uses the tier price, never the client price', () => {
    const [line] = validateOrderLines([bundle('curators', 3, 2)]);
    expect(line.kind).toBe('bundle');
    if (line.kind === 'bundle') {
      expect(line.price).toBe(BUNDLE_TIERS.curators.price);
      expect(line.name).toBe('Trio');
      expect(line.teaIds).toEqual(['tea-0', 'tea-1', 'tea-2']);
    }
  });
  test('rejects unknown tiers and wrong tea counts', () => {
    rejects([bundle('free-bundle', 3, 0)]);
    rejects([bundle('curators', 2, 0)]);   // Trio needs exactly 3
    rejects([bundle('curators', 3, 9)]);   // too many samples
  });
  test('bundles are quantity 1', () => rejects([{ ...bundle('curators', 3, 0), quantity: 2 }]));
  test('stores a sanitised, length-capped copy of the bundle', () => {
    const [line] = validateOrderLines([bundle('discovery', 1, 1, { evil: 'payload' })]);
    if (line.kind !== 'bundle') throw new Error('expected bundle');
    expect(line.bundle).not.toHaveProperty('evil');
    const p = line.bundle.personalization as Record<string, string>;
    expect(p.message.length).toBe(1000);
  });
});

test('cleanText trims, caps and drops non-strings', () => {
  expect(cleanText('  hi  ', 10)).toBe('hi');
  expect(cleanText('abcdef', 3)).toBe('abc');
  expect(cleanText({ toString: () => 'x' }, 10)).toBe('');
});
