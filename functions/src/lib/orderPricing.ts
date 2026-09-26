/**
 * Authoritative order pricing — the amount held on the customer's card.
 *
 * Mirrors the checkout page's display math (src/app/pages/CheckoutPage.tsx,
 * src/lib/shipping.ts, src/hooks/usePromoCode.ts) so the customer is held
 * for exactly the total they saw. Every input here comes from Firestore
 * (canonical prices, promotion docs, settings) — never from the client's
 * claimed totals. Pure functions, no Firestore access: unit-tested in
 * tests/unit/lib/orderPricing.test.ts.
 */

export const GST_RATE = 0.05;

const cents = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export interface PricedItem {
  price:          number;
  quantity:       number;
  gstApplicable?: boolean;
}

/** Same rule as src/lib/shipping.ts calcShippingFee: pickup free; delivery
 *  free at/over the threshold (on the pre-discount subtotal), else flat. */
export function shippingFeeFor(
  subtotal: number,
  fulfillment: 'delivery' | 'pickup',
  settings: { freeShippingThreshold?: unknown; defaultShippingFee?: unknown },
): number {
  if (fulfillment === 'pickup') return 0;
  const threshold = num(settings.freeShippingThreshold);
  if (threshold <= 0 || subtotal >= threshold) return 0;
  return cents(Math.max(0, num(settings.defaultShippingFee)));
}

// ── Promotions ───────────────────────────────────────────────────────────────

export interface PromotionDoc {
  isActive?:      unknown;
  discountType?:  unknown;
  discountValue?: unknown;
  maxDiscount?:   unknown;
  minPurchase?:   unknown;
  usageLimit?:    unknown;
  usageCount?:    unknown;
  perUserLimit?:  unknown;
  startDate?:     unknown;
  endDate?:       unknown;
}

function asDate(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === 'object' && typeof (v as { toDate?: unknown }).toDate === 'function') {
    try { return (v as { toDate: () => Date }).toDate(); } catch { return null; }
  }
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

/** Validate a promotion for this order and return its discount, or the
 *  reason it can't be used. Same rules as usePromoCode on the client. */
export function evaluatePromotion(
  p: PromotionDoc,
  ctx: { subtotal: number; now: Date; timesUsedByUser: number },
): { ok: true; discount: number } | { ok: false; reason: string } {
  if (p.isActive !== true) return { ok: false, reason: 'This promo code is no longer active.' };
  const value = num(p.discountValue);
  if (value <= 0 || (p.discountType !== 'percentage' && p.discountType !== 'fixed')) {
    return { ok: false, reason: 'This promo code is misconfigured.' };
  }
  const start = asDate(p.startDate);
  const end   = asDate(p.endDate);
  if (start && start > ctx.now) return { ok: false, reason: 'This promo code is not active yet.' };
  if (end && end < ctx.now)     return { ok: false, reason: 'This promo code has expired.' };
  if (typeof p.usageLimit === 'number' && num(p.usageCount) >= p.usageLimit) {
    return { ok: false, reason: 'This promo code has reached its usage limit.' };
  }
  if (num(p.minPurchase) > 0 && ctx.subtotal < num(p.minPurchase)) {
    return { ok: false, reason: `This promo code needs a minimum purchase of $${num(p.minPurchase).toFixed(2)}.` };
  }
  if (num(p.perUserLimit) > 0 && ctx.timesUsedByUser >= num(p.perUserLimit)) {
    return { ok: false, reason: "You've already used this promo code the maximum number of times." };
  }

  const subtotal = Math.max(0, ctx.subtotal);
  let discount = p.discountType === 'percentage'
    ? subtotal * (Math.min(100, value) / 100)
    : Math.min(value, subtotal);
  const max = num(p.maxDiscount);
  if (p.discountType === 'percentage' && max > 0) discount = Math.min(discount, max);
  return { ok: true, discount: cents(Math.min(discount, subtotal)) };
}

// ── Totals ───────────────────────────────────────────────────────────────────

export interface OrderTotals {
  subtotal:      number;
  promoDiscount: number;
  creditApplied: number;
  shippingFee:   number;
  gst:           number;
  totalAmount:   number;
}

export function computeOrderTotals(input: {
  items:         PricedItem[];
  promoDiscount: number;
  /** Already rate-validated against the points redeemed. */
  creditApplied: number;
  fulfillment:   'delivery' | 'pickup';
  settings:      { freeShippingThreshold?: unknown; defaultShippingFee?: unknown };
}): OrderTotals {
  const subtotal = cents(input.items.reduce((s, i) => s + num(i.price) * num(i.quantity), 0));
  const promoDiscount = cents(Math.min(Math.max(0, input.promoDiscount), subtotal));
  const afterPromo = subtotal - promoDiscount;
  const creditApplied = cents(Math.min(Math.max(0, input.creditApplied), afterPromo));
  const shippingFee = shippingFeeFor(subtotal, input.fulfillment, input.settings);
  // GST on taxable lines at their pre-discount price — same as the cart.
  const gst = cents(input.items.reduce(
    (s, i) => s + (i.gstApplicable ? num(i.price) * num(i.quantity) * GST_RATE : 0), 0));
  const totalAmount = cents(Math.max(0, afterPromo - creditApplied) + shippingFee + gst);
  return { subtotal, promoDiscount, creditApplied, shippingFee, gst, totalAmount };
}
