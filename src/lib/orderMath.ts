/**
 * orderMath.ts — canonical money math for the cart → order pipeline.
 *
 * The same arithmetic flows through:
 *
 *   - CheckoutPage    (preview + submitted order doc)
 *   - CartSummary     (drawer + cart page total)
 *   - AdminOrders     (admin-edit recalculation)
 *   - NotificationBell (admin approve flow's shipping-fee recalc)
 *   - functions/src/index.ts (server-side recompute on edit + the
 *     rules-layer arithmetic check)
 *
 * Pre-extraction the formula was duplicated inline in every one of
 * those sites. They had drifted in small ways — afterPromo clamping,
 * GST timing, the order of operations between credit and shipping —
 * and a single off-by-cents bug here would either silently overcharge
 * customers or get every order rejected by the firestore rule:
 *
 *     totalAmount + 0.01 >= subtotal + gst + shippingFee
 *                           - discount - promoDiscount - creditApplied
 *
 * Now this module is the single definition. Every consumer imports
 * `calcOrderTotal` and unit tests pin the boundaries (clamping at
 * zero, percentage promos, credit larger than subtotal, awkward
 * floating-point prices, etc).
 *
 * Behaviour:
 *   1. Apply promo discount first (off subtotal, clamped at 0).
 *   2. Apply credit redemption next (off the promo-discounted amount,
 *      clamped at 0). This order matters: credit redemption is in
 *      DOLLARS, and applying it BEFORE the promo would let a customer
 *      double-dip ("20% off the post-credit amount"). Pinning this
 *      order here means the rule, the client, and the server all
 *      agree.
 *   3. Shipping fee and GST are added LAST. GST is on the original
 *      cart subtotal of taxable items (not the post-discount amount)
 *      — that matches how the cart store computes it per-line, and
 *      it's what Canada's CRA expects for prepaid promos.
 *
 * No I/O, no Firebase. Pure function — easy to test, safe to call
 * from anywhere.
 */

export interface OrderTotalInput {
  /** Sum of price × quantity across all cart lines (pre-GST). */
  subtotal:      number;
  /** GST computed per-line on gstApplicable items only. See cartStore.recomputeTotals. */
  gst?:          number;
  /** Flat or percentage promo discount in dollars. Already capped per the promo's rules. */
  promoDiscount?: number;
  /** Legacy alias for promoDiscount — old order docs use `discount`. Keep both addable. */
  discount?:     number;
  /** Dollar value of points redeemed at checkout. */
  creditApplied?: number;
  /** Shipping fee. Pickup is always 0; delivery is admin-set, threshold-discounted. */
  shippingFee?:  number;
}

export interface OrderTotalBreakdown {
  /** Subtotal after promo (clamped at 0). */
  afterPromo:   number;
  /** Subtotal after credit (clamped at 0). */
  afterCredit:  number;
  /** Final amount the customer pays. Always >= 0. */
  totalAmount:  number;
}

/**
 * Compute the full order-total breakdown. Returns the intermediate
 * `afterPromo` and `afterCredit` values too — these are useful for
 * UI (CheckoutPage displays "subtotal after promo", "subtotal after
 * credit") and for the points-earned calculation (`calcPointsEarned`
 * runs on `afterCredit`, not the original subtotal — points are
 * earned on the amount actually paid).
 */
export function calcOrderTotal(input: OrderTotalInput): OrderTotalBreakdown {
  const subtotal      = sanitiseMoney(input.subtotal);
  const gst           = sanitiseMoney(input.gst);
  // Combined promo discount — `promoDiscount` is the canonical field,
  // `discount` is the legacy alias kept for back-compat with old
  // order docs. Both contribute; new writes only set promoDiscount.
  const promoDiscount = sanitiseMoney(input.promoDiscount) + sanitiseMoney(input.discount);
  const creditApplied = sanitiseMoney(input.creditApplied);
  const shippingFee   = sanitiseMoney(input.shippingFee);

  // Step 1: promo discount off subtotal, clamped at 0.
  const afterPromo  = Math.max(0, subtotal - promoDiscount);
  // Step 2: credit off the post-promo subtotal, clamped at 0.
  const afterCredit = Math.max(0, afterPromo - creditApplied);
  // Step 3: GST + shipping added last. Both are added to whatever
  // the customer would otherwise owe — even if afterCredit hit 0
  // (the customer covered the goods with points), they still owe
  // GST + shipping in cash.
  const totalAmount = round2(afterCredit + gst + shippingFee);

  return {
    afterPromo:  round2(afterPromo),
    afterCredit: round2(afterCredit),
    totalAmount,
  };
}

/**
 * Helper: round to 2 decimal places. JS numbers can't store dollar
 * amounts exactly (0.1 + 0.2 = 0.30000000000000004), so every
 * monetary output passes through here to land on a cent boundary.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Helper: coerce a value to a non-negative finite number, falling
 * back to 0 on null/undefined/NaN/Infinity/negative. Guards against
 * dirty order docs producing NaN totals via arithmetic propagation.
 */
function sanitiseMoney(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Firestore order-rule arithmetic check, made callable in tests.
 *
 * The order-create rule allows the write iff:
 *
 *     totalAmount + 0.01 >= subtotal + gst + shippingFee
 *                           - discount - promoDiscount - creditApplied
 *
 * This function returns true when the inequality holds. Used by
 * unit tests to verify that every (cart, promo, credit) combination
 * the UI produces would actually pass the rule. If this ever
 * returns false in a test, the corresponding flow would silently
 * fail at checkout in production.
 */
export function orderArithmeticPassesRule(input: {
  totalAmount:    number;
  subtotal:       number;
  gst?:           number;
  shippingFee?:   number;
  discount?:      number;
  promoDiscount?: number;
  creditApplied?: number;
}): boolean {
  const rhs = sanitiseMoney(input.subtotal)
            + sanitiseMoney(input.gst)
            + sanitiseMoney(input.shippingFee)
            - sanitiseMoney(input.discount)
            - sanitiseMoney(input.promoDiscount)
            - sanitiseMoney(input.creditApplied);
  return input.totalAmount + 0.01 >= rhs;
}
