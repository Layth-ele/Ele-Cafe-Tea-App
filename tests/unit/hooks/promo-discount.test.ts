/**
 * promo-discount.test.ts — regression coverage for promo math.
 *
 * The discount calculation feeds directly into the order's
 * `promoDiscount` field, which the Firestore rules-layer arithmetic
 * check uses (see orderMath.ts → orderArithmeticPassesRule). A bug
 * here would either:
 *
 *   - Silently overcharge the customer (discount under-applied), OR
 *   - Get every promo order rejected by the rule (discount over-applied
 *     because totalAmount math diverges from the rule's expectation), OR
 *   - Send totalAmount negative on a 200% discount or fixed-promo
 *     larger than subtotal.
 *
 * `calcPromoDiscount` is the single source of truth — usePromoCode
 * calls it, and these tests pin the boundaries it must hold.
 *
 * NOT covered here: the live Firestore lookup, date-range checks,
 * usage-limit / per-user-limit checks. Those are integration concerns
 * tested separately against the emulator.
 */
import { describe, test, expect } from 'vitest';
import { calcPromoDiscount } from '@/hooks/usePromoCode';

describe('calcPromoDiscount — percentage discounts', () => {
  test('10% off $50 = $5', () => {
    expect(calcPromoDiscount({
      subtotal: 50, discountType: 'percentage', discountValue: 10,
    })).toBe(5);
  });

  test('25% off $100 = $25', () => {
    expect(calcPromoDiscount({
      subtotal: 100, discountType: 'percentage', discountValue: 25,
    })).toBe(25);
  });

  test('100% off $50 = $50 (full freebie)', () => {
    expect(calcPromoDiscount({
      subtotal: 50, discountType: 'percentage', discountValue: 100,
    })).toBe(50);
  });

  test('rounding: 7% off $19.99 = $1.40 (rounded from 1.3993)', () => {
    expect(calcPromoDiscount({
      subtotal: 19.99, discountType: 'percentage', discountValue: 7,
    })).toBe(1.4);
  });

  test('over-100% percent value is CAPPED at 100% (defensive against bad admin data)', () => {
    // A dirty promo doc with discountValue=200 would otherwise return
    // -$50 (subtotal 50 × 2.0 = $100 off a $50 cart). The clamp keeps
    // it at 100% so the worst case is still a legitimate freebie.
    expect(calcPromoDiscount({
      subtotal: 50, discountType: 'percentage', discountValue: 200,
    })).toBe(50);
  });
});

describe('calcPromoDiscount — maxDiscount cap on percentage promos', () => {
  test('cap applied when percentage would exceed it', () => {
    // 50% off $100 = $50, but cap is $20
    expect(calcPromoDiscount({
      subtotal: 100, discountType: 'percentage', discountValue: 50, maxDiscount: 20,
    })).toBe(20);
  });

  test('cap NOT applied when percentage is below it', () => {
    // 10% off $50 = $5, cap is $20 — discount stays at $5
    expect(calcPromoDiscount({
      subtotal: 50, discountType: 'percentage', discountValue: 10, maxDiscount: 20,
    })).toBe(5);
  });

  test('cap ignored when null / 0 / negative (admin convention for "no cap")', () => {
    expect(calcPromoDiscount({
      subtotal: 100, discountType: 'percentage', discountValue: 50, maxDiscount: null,
    })).toBe(50);
    expect(calcPromoDiscount({
      subtotal: 100, discountType: 'percentage', discountValue: 50, maxDiscount: 0,
    })).toBe(50);
    expect(calcPromoDiscount({
      subtotal: 100, discountType: 'percentage', discountValue: 50, maxDiscount: -5,
    })).toBe(50);
  });

  test('cap with insanely-large maxDiscount cannot push discount above subtotal', () => {
    // 50% off $20 = $10. maxDiscount=$999 is bigger than that AND
    // bigger than the cart. Discount stays at $10, not $999.
    // Prevents the "200% effective discount" failure mode.
    expect(calcPromoDiscount({
      subtotal: 20, discountType: 'percentage', discountValue: 50, maxDiscount: 999,
    })).toBe(10);
  });
});

describe('calcPromoDiscount — fixed-amount discounts', () => {
  test('fixed $10 off $50 = $10', () => {
    expect(calcPromoDiscount({
      subtotal: 50, discountType: 'fixed', discountValue: 10,
    })).toBe(10);
  });

  test('fixed > subtotal is CAPPED at subtotal (never owe negative)', () => {
    // $50 promo on $20 cart should produce a $20 discount, NOT $50.
    // Otherwise totalAmount would go negative.
    expect(calcPromoDiscount({
      subtotal: 20, discountType: 'fixed', discountValue: 50,
    })).toBe(20);
  });

  test('fixed equal to subtotal = subtotal (full coverage)', () => {
    expect(calcPromoDiscount({
      subtotal: 30, discountType: 'fixed', discountValue: 30,
    })).toBe(30);
  });

  test('maxDiscount is IGNORED on fixed-type promos (max only caps percentage)', () => {
    // Per the schema's intent, maxDiscount only applies to percentage
    // promos. A fixed promo of $25 with maxDiscount=$10 should still
    // give $25 (subject to the subtotal cap).
    expect(calcPromoDiscount({
      subtotal: 100, discountType: 'fixed', discountValue: 25, maxDiscount: 10,
    })).toBe(25);
  });
});

describe('calcPromoDiscount — defensive input handling', () => {
  test('zero subtotal → zero discount (no errors)', () => {
    expect(calcPromoDiscount({
      subtotal: 0, discountType: 'percentage', discountValue: 50,
    })).toBe(0);
    expect(calcPromoDiscount({
      subtotal: 0, discountType: 'fixed', discountValue: 10,
    })).toBe(0);
  });

  test('negative subtotal sanitised to 0', () => {
    expect(calcPromoDiscount({
      subtotal: -10, discountType: 'percentage', discountValue: 50,
    })).toBe(0);
  });

  test('NaN subtotal sanitised to 0', () => {
    expect(calcPromoDiscount({
      subtotal: NaN, discountType: 'fixed', discountValue: 10,
    })).toBe(0);
  });

  test('zero / negative discountValue → zero discount', () => {
    expect(calcPromoDiscount({
      subtotal: 50, discountType: 'percentage', discountValue: 0,
    })).toBe(0);
    expect(calcPromoDiscount({
      subtotal: 50, discountType: 'percentage', discountValue: -10,
    })).toBe(0);
  });

  test('infinite discountValue sanitised to 0', () => {
    expect(calcPromoDiscount({
      subtotal: 50, discountType: 'percentage', discountValue: Infinity,
    })).toBe(0);
  });
});

describe('calcPromoDiscount — penny-precision rounding', () => {
  test('discount always rounded to 2 decimal places', () => {
    // 33.33% off $30 = $9.999, must round to $10.00 (not $9.99 or $10).
    // The rules-layer arithmetic check compares with $0.01 tolerance,
    // so the cents granularity matters.
    const d = calcPromoDiscount({
      subtotal: 30, discountType: 'percentage', discountValue: 33.33,
    });
    // Round to 2 dp gives 10.00 — and the function must NOT return
    // 9.999 even if floating-point arithmetic produced it internally.
    expect(d).toBe(10);
    expect(Number((d * 100).toFixed(0)) / 100).toBe(d); // exact-cents check
  });

  test('15% off $19.99 lands on a clean cent boundary', () => {
    // 19.99 × 0.15 = 2.9985 → rounded to 3.00
    expect(calcPromoDiscount({
      subtotal: 19.99, discountType: 'percentage', discountValue: 15,
    })).toBe(3);
  });
});
