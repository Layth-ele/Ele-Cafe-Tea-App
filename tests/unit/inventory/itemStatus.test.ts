/**
 * Back-of-house stock status: below the category threshold is always
 * "Low stock"; an item's own threshold can raise the bar, never lower it.
 */
import { describe, test, expect } from 'vitest';
import { deriveItemStatus, effectiveLowThreshold, DEFAULT_LOW_THRESHOLD } from '../../../functions/src/lib/inventoryStatus';

describe('effectiveLowThreshold', () => {
  test('category threshold is the floor', () => {
    expect(effectiveLowThreshold(1, 3)).toBe(3);      // Banana Caramel case
    expect(effectiveLowThreshold(null, 3)).toBe(3);
    expect(effectiveLowThreshold(6, 3)).toBe(6);      // item can raise it
  });
  test('falls back to the default when the category has none', () => {
    expect(effectiveLowThreshold(null, null)).toBe(DEFAULT_LOW_THRESHOLD);
    expect(effectiveLowThreshold(1, null)).toBe(DEFAULT_LOW_THRESHOLD);
  });
});

describe('deriveItemStatus with threshold 3', () => {
  test.each([[0, 'out_of_stock'], [1, 'low_stock'], [2, 'low_stock'], [3, 'in_stock'], [10, 'in_stock']] as const)(
    'quantity %i → %s', (q, status) => {
      expect(deriveItemStatus(q, effectiveLowThreshold(1, 3))).toBe(status);
    });
});
