/**
 * Tests for shipping helpers in useSettings.ts.
 *
 * The threshold-zero case is the most important: previously the cart
 * code did `?? 75` which silently fell back to $75 when admin set
 * threshold to 0. These tests pin the corrected behavior so a future
 * "simplification" can't reintroduce the bug.
 */
import { describe, test, expect } from 'vitest';
import { calcShippingFee, formatFreeShippingSubline } from '@/lib/shipping';

describe('formatFreeShippingSubline', () => {
  test('threshold = 0 → "On all orders"', () => {
    expect(formatFreeShippingSubline(0)).toBe('On all orders');
  });

  test('undefined threshold → "On all orders"', () => {
    // Defensive: missing settings field should not render "$NaN"
    expect(formatFreeShippingSubline(undefined)).toBe('On all orders');
  });

  test('whole-dollar threshold renders without decimals', () => {
    expect(formatFreeShippingSubline(75)).toBe('On orders over $75');
    expect(formatFreeShippingSubline(100)).toBe('On orders over $100');
  });

  test('non-round threshold keeps two decimals', () => {
    expect(formatFreeShippingSubline(49.99)).toBe('On orders over $49.99');
  });

  test('negative threshold treated as 0 (defensive)', () => {
    expect(formatFreeShippingSubline(-10)).toBe('On all orders');
  });
});

describe('calcShippingFee', () => {
  test('threshold = 0 → always free, regardless of subtotal', () => {
    expect(calcShippingFee(0,    { freeShippingThreshold: 0, defaultShippingFee: 5.99 })).toBe(0);
    expect(calcShippingFee(20,   { freeShippingThreshold: 0, defaultShippingFee: 5.99 })).toBe(0);
    expect(calcShippingFee(1000, { freeShippingThreshold: 0, defaultShippingFee: 5.99 })).toBe(0);
  });

  test('subtotal at or above threshold → free', () => {
    expect(calcShippingFee(75,  { freeShippingThreshold: 75, defaultShippingFee: 5.99 })).toBe(0);
    expect(calcShippingFee(100, { freeShippingThreshold: 75, defaultShippingFee: 5.99 })).toBe(0);
  });

  test('subtotal below threshold → flat fee', () => {
    expect(calcShippingFee(50,    { freeShippingThreshold: 75, defaultShippingFee: 5.99 })).toBe(5.99);
    expect(calcShippingFee(74.99, { freeShippingThreshold: 75, defaultShippingFee: 5.99 })).toBe(5.99);
  });

  test('flat fee = 0 → free even below threshold', () => {
    // "Below threshold but flat rate also zero" = effectively free.
    // Some merchants want to advertise "free shipping over $75" while
    // also charging nothing for under-threshold orders during a
    // promotion. This behavior should not surprise either party.
    expect(calcShippingFee(20, { freeShippingThreshold: 75, defaultShippingFee: 0 })).toBe(0);
  });

  test('missing settings → free (defensive)', () => {
    expect(calcShippingFee(50, undefined)).toBe(0);
    expect(calcShippingFee(50, {})).toBe(0);
  });

  test('negative flat fee treated as 0 (defensive)', () => {
    expect(calcShippingFee(50, { freeShippingThreshold: 75, defaultShippingFee: -5 })).toBe(0);
  });
});
