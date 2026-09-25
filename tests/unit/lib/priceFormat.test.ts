/**
 * priceFormat — the "$18 / 90g" label on every tea card and profile.
 */
import { describe, test, expect } from 'vitest';
import { formatPricePerWeight, DEFAULT_TEA_WEIGHT_GRAMS } from '@/lib/priceFormat';
import { resolveVisibleCategoryIds } from '@/lib/categoryVisibility';

describe('formatPricePerWeight', () => {
  test('whole-dollar price reads $18 / 90g', () => {
    expect(formatPricePerWeight(18, { weightGrams: 90 }, 'en-CA')).toBe('$18 / 90g');
  });
  test('falls back to the 90 g default size', () => {
    expect(DEFAULT_TEA_WEIGHT_GRAMS).toBe(90);
    expect(formatPricePerWeight(18, {}, 'en-CA')).toBe('$18 / 90g');
  });
  test('keeps cents for non-whole prices', () => {
    expect(formatPricePerWeight(18.5, { weightGrams: 90 }, 'en-CA')).toBe('$18.50 / 90g');
  });
});

describe('resolveVisibleCategoryIds', () => {
  const all = ['black', 'green', 'powder'];
  test('gated category hidden until stocked (fail closed)', () => {
    expect([...resolveVisibleCategoryIds(all, ['powder'], undefined)]).toEqual(['black', 'green']);
    expect([...resolveVisibleCategoryIds(all, ['powder'], [])]).toEqual(['black', 'green']);
  });
  test('gated category shows once it has an active product', () => {
    expect([...resolveVisibleCategoryIds(all, ['powder'], ['powder'])]).toEqual(all);
  });
});
