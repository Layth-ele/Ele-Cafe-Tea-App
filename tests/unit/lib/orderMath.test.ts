/**
 * orderMath.test.ts — regression coverage for the cart → order
 * arithmetic that feeds CheckoutPage, AdminOrders, NotificationBell,
 * and the Firestore order-create rule.
 *
 * The same formula runs in 4+ places. Before extraction (May 2026
 * audit) it was duplicated inline at each site with small drift —
 * one path applied credit before promo, another after; one rounded
 * shipping into the subtotal, another kept it separate; admin edits
 * recomputed differently than initial creation. The CONSEQUENCE of
 * any drift here is either a customer overcharge or an order that
 * gets stuck at the rules-layer rejection with no useful error.
 *
 * orderMath.ts is now the single source. These tests pin the order
 * of operations and the boundary cases.
 *
 * Companion to:
 *   - tests/unit/store/cartStore.test.ts   (cart subtotal + GST)
 *   - tests/unit/hooks/promo-discount.test.ts (promo discount math)
 *   - tests/unit/schemas/credit.schema.test.ts (credit constants)
 */
import { describe, test, expect } from 'vitest';
import { calcOrderTotal, orderArithmeticPassesRule } from '@/lib/orderMath';

describe('calcOrderTotal — simplest happy paths', () => {
  test('subtotal only → totalAmount equals subtotal', () => {
    expect(calcOrderTotal({ subtotal: 30 }))
      .toEqual({ afterPromo: 30, afterCredit: 30, totalAmount: 30 });
  });

  test('subtotal + GST → totalAmount = subtotal + GST', () => {
    expect(calcOrderTotal({ subtotal: 30, gst: 1.5 }))
      .toEqual({ afterPromo: 30, afterCredit: 30, totalAmount: 31.5 });
  });

  test('subtotal + shipping → totalAmount = subtotal + shipping', () => {
    expect(calcOrderTotal({ subtotal: 30, shippingFee: 12.99 }))
      .toEqual({ afterPromo: 30, afterCredit: 30, totalAmount: 42.99 });
  });
});

describe('calcOrderTotal — order of operations (promo BEFORE credit)', () => {
  // Order matters because applying credit BEFORE promo would let a
  // customer double-dip: a $10 credit on a $100 cart, then 20% off
  // the remaining $90, gives $72 total. Applying promo first gives
  // $80 - $10 = $70 — the customer-friendly direction. This was the
  // original cart's intent and is what the rule expects; pinning it
  // here means a refactor can't silently flip the order.

  test('promo then credit: $100 cart, $20 promo, $10 credit → $70', () => {
    expect(calcOrderTotal({
      subtotal: 100, promoDiscount: 20, creditApplied: 10,
    })).toEqual({ afterPromo: 80, afterCredit: 70, totalAmount: 70 });
  });

  test('full stack: $100 cart, $20 promo, $10 credit, $5 shipping, $4 GST → $79', () => {
    // afterPromo = 80, afterCredit = 70, +5 shipping +4 GST = $79
    expect(calcOrderTotal({
      subtotal: 100, promoDiscount: 20, creditApplied: 10,
      shippingFee: 5, gst: 4,
    })).toEqual({ afterPromo: 80, afterCredit: 70, totalAmount: 79 });
  });
});

describe('calcOrderTotal — clamping (never owe negative)', () => {
  test('promo larger than subtotal: afterPromo clamps to 0', () => {
    expect(calcOrderTotal({ subtotal: 30, promoDiscount: 50 }))
      .toEqual({ afterPromo: 0, afterCredit: 0, totalAmount: 0 });
  });

  test('credit larger than subtotal: afterCredit clamps to 0', () => {
    expect(calcOrderTotal({ subtotal: 30, creditApplied: 50 }))
      .toEqual({ afterPromo: 30, afterCredit: 0, totalAmount: 0 });
  });

  test('credit larger than subtotal BUT GST + shipping still owed', () => {
    // Common real flow: customer redeems enough credit to cover the
    // goods, but they still owe GST + shipping in cash. Total = GST + shipping.
    expect(calcOrderTotal({
      subtotal: 20, gst: 1, shippingFee: 12.99, creditApplied: 50,
    })).toEqual({ afterPromo: 20, afterCredit: 0, totalAmount: 13.99 });
  });

  test('promo + credit BOTH exceed subtotal: total = GST + shipping only', () => {
    expect(calcOrderTotal({
      subtotal: 10, gst: 0.5, shippingFee: 5,
      promoDiscount: 20, creditApplied: 100,
    })).toEqual({ afterPromo: 0, afterCredit: 0, totalAmount: 5.5 });
  });
});

describe('calcOrderTotal — legacy `discount` alias (back-compat)', () => {
  test('legacy discount adds on top of promoDiscount', () => {
    // Old order docs used `discount`; new ones use `promoDiscount`.
    // Both are honored, additive. Useful for admin-edited orders
    // that mix legacy and new fields.
    expect(calcOrderTotal({
      subtotal: 100, discount: 10, promoDiscount: 5,
    })).toEqual({ afterPromo: 85, afterCredit: 85, totalAmount: 85 });
  });
});

describe('calcOrderTotal — defensive input handling', () => {
  test('NaN inputs sanitised to 0', () => {
    expect(calcOrderTotal({
      subtotal: NaN, gst: NaN, shippingFee: NaN,
      promoDiscount: NaN, creditApplied: NaN,
    })).toEqual({ afterPromo: 0, afterCredit: 0, totalAmount: 0 });
  });

  test('negative inputs sanitised to 0', () => {
    expect(calcOrderTotal({
      subtotal: 50, promoDiscount: -5, creditApplied: -10,
    })).toEqual({ afterPromo: 50, afterCredit: 50, totalAmount: 50 });
  });

  test('missing optional fields are treated as 0', () => {
    expect(calcOrderTotal({ subtotal: 25 }))
      .toEqual({ afterPromo: 25, afterCredit: 25, totalAmount: 25 });
  });
});

describe('calcOrderTotal — penny-precision rounding', () => {
  test('totalAmount lands on cent boundary even with awkward floats', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in raw JS. The function must
    // round to 0.3 so the order doc field doesn't carry the long
    // floating-point tail.
    const r = calcOrderTotal({ subtotal: 0.1, gst: 0.2 });
    expect(r.totalAmount).toBe(0.3);
  });

  test('penny-rounded GST + shipping still satisfies rule', () => {
    // 19.99 × 0.05 = 0.9995 GST. Sum of awkward floats should still
    // round cleanly. The test verifies the rule's $0.01 tolerance
    // covers our rounding direction.
    const r = calcOrderTotal({ subtotal: 19.99, gst: 0.9995, shippingFee: 12.99 });
    expect(r.totalAmount).toBeCloseTo(33.98, 2);
  });
});

describe('orderArithmeticPassesRule — Firestore rule invariant', () => {
  // Pin that calcOrderTotal's output ALWAYS satisfies the rule.
  // If a future refactor breaks this, every order would fail the
  // rules-layer check. These tests catch it before production.

  test('plain cart: rule passes', () => {
    const { totalAmount } = calcOrderTotal({ subtotal: 30 });
    expect(orderArithmeticPassesRule({ totalAmount, subtotal: 30 })).toBe(true);
  });

  test('cart with promo + credit: rule passes', () => {
    const input = { subtotal: 100, promoDiscount: 20, creditApplied: 10, gst: 4, shippingFee: 5 };
    const { totalAmount } = calcOrderTotal(input);
    expect(orderArithmeticPassesRule({ totalAmount, ...input })).toBe(true);
  });

  test('cart fully covered by credit (totalAmount = GST + shipping): rule passes', () => {
    const input = { subtotal: 20, gst: 1, shippingFee: 12.99, creditApplied: 100 };
    const { totalAmount } = calcOrderTotal(input);
    expect(orderArithmeticPassesRule({ totalAmount, ...input })).toBe(true);
  });

  test('floating-point awkwardness: rule passes within $0.01 tolerance', () => {
    const input = { subtotal: 19.99, gst: 0.9995, shippingFee: 12.99 };
    const { totalAmount } = calcOrderTotal(input);
    expect(orderArithmeticPassesRule({ totalAmount, ...input })).toBe(true);
  });

  test('a HAND-MISMATCHED totalAmount fails the rule (sanity check on the rule itself)', () => {
    // If totalAmount is too low for the inputs, rule rejects.
    // Sanity check that the rule function actually catches drift.
    expect(orderArithmeticPassesRule({
      totalAmount: 10, subtotal: 30,
    })).toBe(false);
  });
});

describe('calcOrderTotal — realistic scenarios from observed orders', () => {
  // Scenarios pulled from real orders we've shipped. If any of these
  // start failing it means the production math has drifted from the
  // archived totals.

  test('typical tea + free shipping', () => {
    // 2× Assam @ $18, free shipping (over threshold), no GST (tea)
    const r = calcOrderTotal({ subtotal: 36 });
    expect(r.totalAmount).toBe(36);
  });

  test('tea + mug (GST item) + flat shipping', () => {
    const r = calcOrderTotal({ subtotal: 56, gst: 1, shippingFee: 12.99 });
    expect(r.totalAmount).toBe(69.99);
  });

  test('gift order: bundle + delivery + welcome bonus redeemed', () => {
    // $75 bundle, $12.99 ship, $5 credit redeemed (5000 pts at default rate)
    const r = calcOrderTotal({
      subtotal: 75, shippingFee: 12.99, creditApplied: 5,
    });
    expect(r.totalAmount).toBe(82.99); // 70 + 12.99
  });

  test('promo on a gift order', () => {
    // $75 bundle, SAVE15 (15% off), $12.99 ship
    const r = calcOrderTotal({
      subtotal: 75, promoDiscount: 11.25, shippingFee: 12.99,
    });
    expect(r.afterPromo).toBe(63.75);
    expect(r.totalAmount).toBe(76.74); // 63.75 + 12.99
  });
});
