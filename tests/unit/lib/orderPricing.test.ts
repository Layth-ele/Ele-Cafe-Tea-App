/**
 * Server-side order pricing — the amount held on the customer's card.
 * Must match what the checkout page shows (shipping, promo, credit, GST).
 */
import { describe, test, expect } from 'vitest';
import {
  computeOrderTotals, evaluatePromotion, shippingFeeFor,
} from '../../../functions/src/lib/orderPricing';

const settings = { freeShippingThreshold: 100, defaultShippingFee: 12.99 };

describe('shippingFeeFor', () => {
  test('pickup is always free', () => {
    expect(shippingFeeFor(20, 'pickup', settings)).toBe(0);
  });
  test('delivery under the threshold pays the flat fee', () => {
    expect(shippingFeeFor(99.99, 'delivery', settings)).toBe(12.99);
  });
  test('delivery at/over the threshold is free', () => {
    expect(shippingFeeFor(100, 'delivery', settings)).toBe(0);
  });
  test('threshold 0 means all delivery is free', () => {
    expect(shippingFeeFor(10, 'delivery', { freeShippingThreshold: 0, defaultShippingFee: 12.99 })).toBe(0);
  });
});

describe('computeOrderTotals', () => {
  test('matches the checkout math', () => {
    const t = computeOrderTotals({
      items: [
        { price: 18, quantity: 2 },
        { price: 30, quantity: 1, gstApplicable: true },
      ],
      promoDiscount: 6,
      creditApplied: 5,
      fulfillment: 'delivery',
      settings,
    });
    expect(t.subtotal).toBe(66);
    expect(t.shippingFee).toBe(12.99);   // subtotal under $100
    expect(t.gst).toBe(1.5);             // 5% of the taxable $30 line
    expect(t.totalAmount).toBe(69.49);   // 66 - 6 - 5 + 12.99 + 1.5
  });

  test('credit and promo can never push the total below shipping + GST', () => {
    const t = computeOrderTotals({
      items: [{ price: 20, quantity: 1 }],
      promoDiscount: 50,
      creditApplied: 50,
      fulfillment: 'pickup',
      settings,
    });
    expect(t.promoDiscount).toBe(20);
    expect(t.creditApplied).toBe(0);
    expect(t.totalAmount).toBe(0);
  });

  test('rounds to cents', () => {
    const t = computeOrderTotals({
      items: [{ price: 10.005, quantity: 3 }],
      promoDiscount: 0, creditApplied: 0, fulfillment: 'pickup', settings,
    });
    expect(t.totalAmount).toBe(30.02);
  });
});

describe('evaluatePromotion', () => {
  const now = new Date('2026-09-22T12:00:00Z');
  const base = { isActive: true, discountType: 'percentage', discountValue: 10 };

  test('percentage discount, capped by maxDiscount', () => {
    expect(evaluatePromotion(base, { subtotal: 80, now, timesUsedByUser: 0 })).toEqual({ ok: true, discount: 8 });
    expect(evaluatePromotion({ ...base, maxDiscount: 5 }, { subtotal: 80, now, timesUsedByUser: 0 }))
      .toEqual({ ok: true, discount: 5 });
  });

  test('fixed discount never exceeds the subtotal', () => {
    expect(evaluatePromotion({ ...base, discountType: 'fixed', discountValue: 50 }, { subtotal: 30, now, timesUsedByUser: 0 }))
      .toEqual({ ok: true, discount: 30 });
  });

  test.each([
    ['inactive',            { ...base, isActive: false },                              0],
    ['expired',             { ...base, endDate: new Date('2026-01-01') },             0],
    ['not started',         { ...base, startDate: new Date('2027-01-01') },           0],
    ['usage limit reached', { ...base, usageLimit: 5, usageCount: 5 },                0],
    ['below minimum',       { ...base, minPurchase: 100 },                             0],
    ['per-user limit',      { ...base, perUserLimit: 1 },                              1],
    ['misconfigured',       { ...base, discountValue: -5 },                            0],
  ])('rejects %s', (_label, promo, used) => {
    expect(evaluatePromotion(promo, { subtotal: 80, now, timesUsedByUser: used }).ok).toBe(false);
  });

  test('accepts Firestore Timestamp-like dates', () => {
    const ts = (d: string) => ({ toDate: () => new Date(d) });
    expect(evaluatePromotion({ ...base, startDate: ts('2026-01-01'), endDate: ts('2026-12-31') },
      { subtotal: 80, now, timesUsedByUser: 0 }).ok).toBe(true);
  });
});
