/**
 * CartSummary.tsx — Single shared cart totals component.
 *
 * Used by:  CartPage · CheckoutPage · (CartDrawer footer uses a lighter inline version)
 *
 * GST logic:
 *   - Most products (tea, foodstuffs) are zero-rated in Canada — gstApplicable: false
 *   - Non-food accessories / equipment can be flagged gstApplicable: true on the product
 *   - GST row only renders when at least one cart item has gstApplicable === true
 *   - Rate: 5% federal GST on the taxable line total (not on credit-adjusted subtotal)
 *
 * Pricing:
 *   Subtotal (all items)
 *   − Credit applied (capped at subtotal)
 *   + GST on taxable items only     ← shown only when > 0
 *   + Shipping                      ← free at/above settings.freeShippingThreshold,
 *                                     otherwise pending / calculated. Threshold = 0
 *                                     means "free for everyone" — see useSettings.
 *   ──────────────────────────────
 *   Total / Estimated total
 *
 * Phase 3 migration note:
 *   Previously this file held 25 inline `style={{}}` instances. The
 *   bulk are now driven by `.cart-summary-*` classes in design.css —
 *   see the css block of the same name. The few remaining inline
 *   styles below are genuinely dynamic (state-driven shipping color,
 *   conditional margin-bottom on the info box). When in doubt, prefer
 *   adding a class to design.css over an inline style.
 */

import type { CartItem } from '@/store/cartStore';
import { GST_RATE, cartItemName } from '@/store/cartStore';
import { useSettings } from '@/hooks/useSettings';

import { useT, useTx, useLang } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
// ── Types ─────────────────────────────────────────────────────────────────────

export interface CartSummaryProps {
  items:              CartItem[];
  subtotal:           number;
  creditApplied?:     number;   // $ amount of credit applied
  promoDiscount?:     number;   // $ amount from promo code
  ptsWillEarn?:       number;   // loyalty points that will be earned
  /** Render per-item list above breakdown (checkout sidebar) */
  showItems?:         boolean;
  /** Show loyalty points earn badge */
  showEarnBadge?:     boolean;
  /** Label on the total row */
  totalLabel?:        string;
  /** Customer-selected shipping fee. When provided, overrides the internal
   *  free-at-threshold logic and the fee is included in the grand total.
   *  Used by CheckoutPage where the customer picks pickup/delivery up-front
   *  and sees the exact fee BEFORE submitting. CartPage / CartDrawer leave
   *  this undefined to keep the existing "calculated later" behavior. */
  actualShippingFee?: number;
  /** Selected fulfillment method — surfaces in the shipping line label
   *  ("Shipping" → "Pickup" / "Delivery") so the customer sees what they
   *  picked reflected in the cost summary. */
  fulfillmentMethod?: 'pickup' | 'delivery';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CartSummary({
  items,
  subtotal,
  creditApplied    = 0,
  promoDiscount    = 0,
  ptsWillEarn      = 0,
  showItems        = false,
  showEarnBadge    = false,
  totalLabel       = 'Total',
  actualShippingFee,
  fulfillmentMethod,
}: CartSummaryProps) {
  const t = useT();
  const lang = useLang();
  const tx = useTx();
  const settings = useSettings();
  // R2 Bug #11: previously `settings?.freeShippingThreshold ?? 100`
  // collapsed an explicit 0 (admin's intent: "free shipping for
  // everyone") into 100 because `??` only catches null/undefined and
  // 0 falls through unchanged — that part was actually correct, but
  // the SETTING_DEFAULTS ships with `freeShippingThreshold: 100`, so
  // an admin clearing the field via the settings UI ends up with
  // either undefined (→ 100) OR 0. The previous code treated only
  // 0 as "always free" and rejected the case where admin clears the
  // setting. Now we treat both null/undefined AND 0 (and any negative)
  // as "always free", which matches the documented contract: an
  // unset / cleared / zero / negative threshold means store-wide
  // free shipping. A real threshold is a positive number.
  const rawThreshold   = settings?.freeShippingThreshold;
  const FREE_THRESHOLD = (typeof rawThreshold === 'number' && rawThreshold > 0)
    ? rawThreshold : 0;
  const alwaysFree     = FREE_THRESHOLD <= 0;

  // ── GST — computed per-item on taxable lines only ──────────────────────────
  // GST is calculated on the raw line total (before credit).
  // Credit reduces the tea (non-taxable) subtotal only.
  const gstTotal = items.reduce((sum, item) =>
    sum + (item.gstApplicable ? item.price * item.quantity * GST_RATE : 0), 0
  );
  const hasGst = gstTotal > 0;

  // ── Subtotals ──────────────────────────────────────────────────────────────
  const afterPromo   = Math.max(0, subtotal - promoDiscount);
  // R2 Bug #12: this `creditCapped` formula MUST stay in lockstep with
  // CheckoutPage's local copy. They both clamp `creditApplied` to
  // `afterPromo` so the displayed and submitted dollar amounts agree.
  // If the cap formula changes (e.g., to also factor in shipping or
  // GST), update BOTH places — drift between them produces the silent
  // customer-loss path we patched on the CheckoutPage side. A future
  // cleanup is to extract a `computeCreditCapped(subtotal, promo,
  // applied)` helper and import from one location.
  const creditCapped = Math.min(creditApplied, afterPromo);
  const afterCredit  = Math.max(0, afterPromo - creditCapped);
  // Free-shipping check uses the RAW subtotal — same basis as
  // calcShippingFee in CheckoutPage. The two surfaces MUST agree on
  // the same input or the user gets a bait-and-switch (cart says
  // "free shipping unlocked", checkout charges shipping anyway, or
  // vice versa). Earlier this used `afterCredit` based on a faulty
  // belief that CheckoutPage did the same; CheckoutPage actually
  // uses raw subtotal (see its inline rationale, line ~205) and
  // this is now realigned to match.
  //
  // Trade-off acknowledged: a customer at $80 subtotal who applies a
  // $50 promo would pay "$30 of goods + shipping" — i.e. they don't
  // ALSO get free shipping by virtue of the promo dropping them below
  // the threshold. Intentional: shipping cost reflects what's being
  // shipped (the goods), not what the customer pays after discounts.
  const shippingFree = alwaysFree || subtotal >= FREE_THRESHOLD;

  // Grand total shown to user = after-credit amount + GST + shipping (if known).
  // CartPage / CartDrawer leave actualShippingFee undefined (shipping is
  // shown as Free or "calculated later"), so grandTotal there omits it.
  // CheckoutPage passes the customer-selected fee → it's included.
  const grandTotal = afterCredit + gstTotal + (actualShippingFee ?? 0);

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="card card-body">

      {/* ── Title ─────────────────────────────────────────────── */}
      {showItems && <h3 className="cart-summary-title">{t('Order Summary')}</h3>}

      {/* ── Per-item lines (checkout sidebar) ─────────────────── */}
      {showItems && items.length > 0 && (
        <>
          <div className="cart-summary-rows">
            {items.map(item => (
              <div key={item.id} className="cart-summary-row">
                <span className="text-muted cart-summary-item-name">
                  {item.bundle ? t(item.name) : cartItemName(item, lang)} × {item.quantity}
                  {item.gstApplicable && <span className="cart-summary-gst-flag">{t('+GST')}</span>}
                </span>
                <span className="cart-summary-row-price">{formatMoney((item.price * item.quantity))}</span>
              </div>
            ))}
          </div>
          <div className="divider cart-summary-divider-tight" />
        </>
      )}

      {/* ── Breakdown rows ────────────────────────────────────── */}
      <div className="cart-summary-rows">

        {/* Subtotal */}
        <div className="cart-summary-row">
          <span className="text-muted">
            {t('Subtotal')}{!showItems ? ` (${t(totalQty === 1 ? '{count} item' : '{count} items', { count: totalQty })})` : ''}
          </span>
          <span>{formatMoney(subtotal)}</span>
        </div>

        {/* Promo discount — only when > 0 */}
        {promoDiscount > 0 && (
          <div className="cart-summary-row cart-summary-row-success">
            <span>{t('Promo discount')}</span>
            <span>−{formatMoney(promoDiscount)}</span>
          </div>
        )}

        {/* Credit applied — only when > 0 */}
        {creditCapped > 0 && (
          <div className="cart-summary-row cart-summary-row-success">
            <span>{t('Credit applied')}</span>
            <span>−{formatMoney(creditCapped)}</span>
          </div>
        )}

        {/* GST — only rendered when cart contains GST-applicable items */}
        {hasGst && (
          <div className="cart-summary-row">
            <span className="text-muted">
              {t('GST (5%)')}
              <span className="cart-summary-gst-italic">{t('taxable items only')}</span>
            </span>
            <span>{formatMoney(gstTotal)}</span>
          </div>
        )}

        {/* Shipping — three rendering modes:
              1. actualShippingFee provided & 0  → "Free" (pickup, or delivery free-over-threshold)
              2. actualShippingFee provided & >0 → dollar amount (delivery flat fee)
              3. actualShippingFee undefined     → legacy "calculated later" / threshold logic.
            Each branch swaps a different class on the value <span> so the
            color/weight reflects the state without inline styles. */}
        <div className="cart-summary-row">
          <span className="text-muted">
            {fulfillmentMethod === 'pickup'   ? t('Pickup')
             : fulfillmentMethod === 'delivery' ? t('Delivery')
             : t('Shipping')}
          </span>
          {actualShippingFee !== undefined ? (
            <span className={actualShippingFee === 0 ? 'cart-summary-shipping-free' : 'cart-summary-shipping-fee'}>
              {actualShippingFee === 0 ? t('Free') : formatMoney(actualShippingFee)}
            </span>
          ) : (
            <span className={shippingFree ? 'cart-summary-shipping-free' : 'cart-summary-shipping-pending'}>
              {shippingFree ? t('Free') : t('Calculated at checkout')}
            </span>
          )}
        </div>
      </div>

      <div className="divider mb-3" />

      {/* ── Grand total ───────────────────────────────────────── */}
      <div className="cart-summary-total-row">
        <span className="cart-summary-total-label">{totalLabel}</span>
        <span className="cart-summary-total-amount">
          {formatMoney(grandTotal)} CAD
        </span>
      </div>

      {/* GST notice when applicable */}
      {hasGst && (
        <p className="cart-summary-gst-notice">
          {t('GST applies to non-food items only. Tea is zero-rated.')}
        </p>
      )}

      {/* ── Loyalty earn badge (checkout) ────────────────────── */}
      {showEarnBadge && ptsWillEarn > 0 && (
        <div className="cart-summary-earn-badge">
          <span className="cart-summary-earn-icon">✦</span>
          <span className="cart-summary-earn-text">
            {tx('Earn {points} once delivered', { points: <strong className="cart-summary-earn-amount">{t('{count} pts', { count: ptsWillEarn.toLocaleString() })}</strong> })}
          </span>
        </div>
      )}
    </div>
  );
}
