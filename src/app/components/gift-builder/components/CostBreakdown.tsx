/**
 * CostBreakdown.tsx — Right-rail cost summary in Step 4.
 *
 * Day 16. Renders the bundle price, subtotal, shipping (free over the
 * admin-configured threshold from /admin/settings, falling back to the
 * flat fee otherwise), and GST. GST policy matches `cartStore.ts`: tea
 * is zero-rated in Canada, so for a tea-only bundle GST is computed
 * only on shipping when shipping is paid. (If you flip `gstApplicable`
 * to true on bundles in cartStore, the breakdown will pick that up via
 * the `gstApplicableSubtotal` prop.)
 *
 * The component is presentational — the parent computes amounts and
 * passes them in.
 */

import { GST_RATE } from '@/store/cartStore';

import { useT } from '@/i18n/useT';
import { formatMoney, formatMoneyShort } from '@/lib/money';
interface CostBreakdownProps {
  bundleName:   string;
  bundlePrice:  number;
  /** Free over `freeShippingThreshold`, otherwise `flatShippingFee`. */
  freeShippingThreshold: number;
  flatShippingFee:       number;
  /** Whether the bundle itself is GST-applicable. Default false (tea zero-rated). */
  bundleGstApplicable?:  boolean;
  /** When true, shipping is always free regardless of subtotal. Used by
   *  gift bundles since they're a curated premium offering and shipping
   *  should be included in the gift experience, not gated by a price
   *  cliff that may sit just below the regular threshold. */
  alwaysFreeShipping?:   boolean;
}

export function CostBreakdown({
  bundleName, bundlePrice,
  freeShippingThreshold, flatShippingFee,
  bundleGstApplicable = false,
  alwaysFreeShipping  = false,
}: CostBreakdownProps) {
  const t = useT();
  const subtotal = bundlePrice;
  const shipping = alwaysFreeShipping
    ? 0
    : (subtotal >= freeShippingThreshold ? 0 : flatShippingFee);
  // GST applies to GST-applicable items + (always) to shipping when shipping is paid.
  const gstableBase =
    (bundleGstApplicable ? subtotal : 0) +
    shipping;
  const gst   = gstableBase * GST_RATE;
  const total = subtotal + shipping + gst;

  return (
    <div className="cb-card">
      <h3 className="cb-h3">
        {t('Cost summary')}
      </h3>

      <Row label={bundleName} value={formatMoney(bundlePrice)} />
      <Divider />
      <Row label={t('Subtotal')} value={formatMoney(subtotal)} bold />
      <Row
        label={
          shipping === 0
            ? (alwaysFreeShipping ? t('Shipping (included)') : t('Shipping (free over {amount})', { amount: formatMoneyShort(freeShippingThreshold) }))
            : t('Shipping')
        }
        value={shipping === 0 ? 'Free' : formatMoney(shipping)}
        muted={shipping === 0}
      />
      <Row label={t('GST (5%)')} value={formatMoney(gst)} />
      <Divider strong />
      <Row label={t('Total')} value={formatMoney(total)} bold large />

      {/* Hint only when shipping is conditional and not yet earned.
          Suppressed when alwaysFreeShipping is on — there's no
          threshold to climb toward, so showing one would be misleading. */}
      {!alwaysFreeShipping && subtotal < freeShippingThreshold && (
        <p className="cb-hint">
          {t('Free shipping on orders {amount}+', { amount: formatMoneyShort(freeShippingThreshold) })}
        </p>
      )}
    </div>
  );
}

function Row({
  label, value, bold, muted, large,
}: { label: string; value: string; bold?: boolean; muted?: boolean; large?: boolean }) {
  return (
    <div
      className="cb-row"
      data-bold={bold ? 'true' : 'false'}
      data-muted={muted ? 'true' : 'false'}
      data-large={large ? 'true' : 'false'}
    >
      <span className="cb-row-label">
        {label}
      </span>
      <span className="cb-row-value" data-bold={bold ? 'true' : 'false'}>
        {value}
      </span>
    </div>
  );
}

function Divider({ strong }: { strong?: boolean }) {
  return (
    <div className="cb-divider" data-strong={strong ? 'true' : 'false'}/>
  );
}
