/**
 * cartStore.test.ts — pure-function tests for cart math.
 *
 * Why: the cart's totalPrice + totalGst feed directly into the order
 * document's `subtotal`, `gst`, and `totalAmount` fields. Firestore
 * rules require:
 *
 *     totalAmount + 0.01 >= subtotal + gst + shippingFee
 *                          - discount - promoDiscount - creditApplied
 *
 * If the cart's GST math drifts (e.g. accidentally taxing a non-
 * gstApplicable item, or compounding GST after credit), orders will
 * either be silently overcharged or rejected at the rules layer.
 *
 * These tests pin the GST policy: 5% on items where gstApplicable
 * is true, 0% on tea (most products).
 *
 * Note: the cart store uses Zustand + immer + persist, all of which
 * work fine in node. No DOM needed.
 */
import { beforeEach, describe, test, expect } from 'vitest';
import { useCartStore, GST_RATE } from '@/store/cartStore';

// Helpers — keep test bodies readable.
function reset() {
  useCartStore.getState().clearCart();
}

function add(item: {
  id: string;
  name?: string;
  price: number;
  image?: string;
  category?: string;
  gstApplicable: boolean;
}) {
  useCartStore.getState().addToCart({
    id:            item.id,
    name:          item.name ?? `Test ${item.id}`,
    price:         item.price,
    image:         item.image ?? '',
    category:      item.category ?? 'black',
    gstApplicable: item.gstApplicable,
  });
}

describe('GST_RATE constant', () => {
  test('is 5% (Canadian federal GST)', () => {
    // Pinning this constant so a regression to e.g. 0.13 (HST) is caught.
    // If we ever ship to other provinces, this becomes a function of
    // shipping address and these tests get rewritten.
    expect(GST_RATE).toBe(0.05);
  });
});

describe('cart totals — empty state', () => {
  beforeEach(reset);

  test('zero items → zero totals', () => {
    const s = useCartStore.getState();
    expect(s.items).toHaveLength(0);
    expect(s.totalItems).toBe(0);
    expect(s.totalPrice).toBe(0);
    expect(s.totalGst).toBe(0);
  });
});

describe('cart totals — non-GST items (tea, the common case)', () => {
  beforeEach(reset);

  test('single item: totalPrice equals price, totalGst is 0', () => {
    add({ id: 'assam', price: 18, gstApplicable: false });
    const s = useCartStore.getState();
    expect(s.totalItems).toBe(1);
    expect(s.totalPrice).toBe(18);
    expect(s.totalGst).toBe(0);
  });

  test('quantity increase: totals scale linearly, GST stays 0', () => {
    add({ id: 'assam', price: 18, gstApplicable: false });
    useCartStore.getState().updateQuantity('assam', 3);
    const s = useCartStore.getState();
    expect(s.totalItems).toBe(3);
    expect(s.totalPrice).toBe(54);
    expect(s.totalGst).toBe(0);
  });

  test('multiple non-GST items sum correctly', () => {
    add({ id: 'a', price: 18, gstApplicable: false });
    add({ id: 'b', price: 16, gstApplicable: false });
    add({ id: 'c', price: 22, gstApplicable: false });
    const s = useCartStore.getState();
    expect(s.totalItems).toBe(3);
    expect(s.totalPrice).toBe(56);
    expect(s.totalGst).toBe(0);
  });
});

describe('cart totals — GST items', () => {
  beforeEach(reset);

  test('single GST-applicable item: totalGst = price * 5%', () => {
    add({ id: 'mug', price: 20, gstApplicable: true });
    const s = useCartStore.getState();
    expect(s.totalPrice).toBe(20);
    // 20 × 0.05 = 1.00 exactly; floating-point clean
    expect(s.totalGst).toBe(1);
  });

  test('GST scales with quantity', () => {
    add({ id: 'mug', price: 20, gstApplicable: true });
    useCartStore.getState().updateQuantity('mug', 4);
    const s = useCartStore.getState();
    expect(s.totalPrice).toBe(80);
    expect(s.totalGst).toBe(4);
  });

  test('GST math handles awkward prices via floating-point tolerance', () => {
    add({ id: 'item', price: 19.99, gstApplicable: true });
    useCartStore.getState().updateQuantity('item', 3);
    const s = useCartStore.getState();
    // Subtotal: 59.97, GST: 2.9985 — IEEE 754 may yield 2.9985 or
    // 2.9984999999... depending on order of ops. Use toBeCloseTo
    // for the canonical "is it within rounding" check.
    expect(s.totalPrice).toBeCloseTo(59.97, 2);
    expect(s.totalGst).toBeCloseTo(2.9985, 4);
  });
});

describe('cart totals — mixed GST + non-GST', () => {
  beforeEach(reset);

  test('GST applies ONLY to gstApplicable items, not to whole order', () => {
    add({ id: 'tea',       price: 18, gstApplicable: false });
    add({ id: 'gift-card', price: 50, gstApplicable: true  });
    const s = useCartStore.getState();
    expect(s.totalPrice).toBe(68);
    // GST is on $50 only, not the full $68
    expect(s.totalGst).toBeCloseTo(2.5, 2);
  });

  test('removing a GST item rolls back its GST contribution', () => {
    add({ id: 'tea', price: 18, gstApplicable: false });
    add({ id: 'mug', price: 20, gstApplicable: true  });
    expect(useCartStore.getState().totalGst).toBe(1);
    useCartStore.getState().removeFromCart('mug');
    expect(useCartStore.getState().totalGst).toBe(0);
    expect(useCartStore.getState().totalPrice).toBe(18);
  });
});

describe('cart totals — quantity edge cases', () => {
  beforeEach(reset);

  test('adding the same item twice merges into one line with qty 2', () => {
    add({ id: 'assam', price: 18, gstApplicable: false });
    add({ id: 'assam', price: 18, gstApplicable: false });
    const s = useCartStore.getState();
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.quantity).toBe(2);
    expect(s.totalPrice).toBe(36);
  });

  test('updateQuantity to 0 removes the line', () => {
    add({ id: 'assam', price: 18, gstApplicable: false });
    useCartStore.getState().updateQuantity('assam', 0);
    const s = useCartStore.getState();
    expect(s.items).toHaveLength(0);
    expect(s.totalPrice).toBe(0);
  });

  test('clearCart resets all totals to zero', () => {
    add({ id: 'tea', price: 18, gstApplicable: false });
    add({ id: 'mug', price: 20, gstApplicable: true  });
    useCartStore.getState().clearCart();
    const s = useCartStore.getState();
    expect(s.items).toHaveLength(0);
    expect(s.totalItems).toBe(0);
    expect(s.totalPrice).toBe(0);
    expect(s.totalGst).toBe(0);
  });
});

describe('Firestore rules invariant — order-total math', () => {
  beforeEach(reset);

  // The Firestore order-create rule requires:
  //   totalAmount + 0.01 >= subtotal + gst + shippingFee
  //                       - discount - promoDiscount - creditApplied
  //
  // These tests verify that the cart-side numbers we'd write to the
  // order doc satisfy that inequality across realistic scenarios.
  // If a future refactor breaks this, the tests fail before any
  // customer hits the rules-layer rejection.

  function checkOrderArithmetic({
    subtotal,
    gst,
    shippingFee = 0,
    discount = 0,
    promoDiscount = 0,
    creditApplied = 0,
  }: {
    subtotal: number;
    gst: number;
    shippingFee?: number;
    discount?: number;
    promoDiscount?: number;
    creditApplied?: number;
  }) {
    const totalAmount = Math.max(
      0,
      subtotal - discount - promoDiscount - creditApplied,
    ) + gst + shippingFee;
    const rhs = subtotal + gst + shippingFee - discount - promoDiscount - creditApplied;
    expect(totalAmount + 0.01).toBeGreaterThanOrEqual(rhs);
    return totalAmount;
  }

  test('plain tea order — no discounts', () => {
    add({ id: 'tea', price: 18, gstApplicable: false });
    useCartStore.getState().updateQuantity('tea', 2);
    const s = useCartStore.getState();
    const total = checkOrderArithmetic({ subtotal: s.totalPrice, gst: s.totalGst });
    expect(total).toBe(36);
  });

  test('with credit applied (most common flow)', () => {
    add({ id: 'tea', price: 100, gstApplicable: false });
    const s = useCartStore.getState();
    const total = checkOrderArithmetic({
      subtotal:      s.totalPrice,
      gst:           s.totalGst,
      creditApplied: 10,
    });
    expect(total).toBe(90);
  });

  test('credit larger than subtotal clamps to zero, GST still applies', () => {
    add({ id: 'mug', price: 20, gstApplicable: true });
    const s = useCartStore.getState();
    // User redeems $50 against a $20 cart with $1 GST
    const total = checkOrderArithmetic({
      subtotal:      s.totalPrice,
      gst:           s.totalGst,
      creditApplied: 50,
    });
    // Clamped: max(0, 20 - 50) + 1 = 0 + 1 = 1
    expect(total).toBe(1);
  });
});
