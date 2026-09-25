import { MapPin } from 'lucide-react';
import { StaticPage } from './StaticPage';
import { useSettingsQuery } from '@/hooks/useSettings';
import { useStoreContent } from '@/hooks/useStoreContent';
import { phoneTel } from '../../../../functions/src/lib/storeContent';

import { useT, useTx } from '@/i18n/useT';
import { formatMoneyShort } from '@/lib/money';
/**
 * Shipping Policy — copies the threshold + flat rate from live store
 * settings so a single admin edit (in /admin/settings → Order Rules)
 * propagates across this page, the homepage pillar, the footer perk,
 * the cart drawer, and the checkout. Avoids the previous problem of
 * the policy page contradicting the cart's actual rates.
 *
 * Pickup address, phone and maps link come from Admin → Settings
 * (useStoreContent) — the same values as the footer and contact card.
 *
 * Phase 3 migration: 17 inline styles → 0. Uses the .ip-* class set
 * shared with the other info pages. The previous JS-driven hover on
 * the address link (onMouseEnter/onMouseLeave) is replaced with CSS
 * `:hover` (.ip-pickup-address) per PHASE_3_PLAYBOOK §step-4 — faster,
 * survives React StrictMode, and reduced-motion-aware via the
 * existing duration token.
 */


export default function ShippingPolicyPage() {
  const t = useT();
  const tx = useTx();
  const { data: settings } = useSettingsQuery();
  const store = useStoreContent();
  const tel = phoneTel(store.phone);
  const threshold  = Number(settings?.freeShippingThreshold) || 0;
  const flatRate   = Number(settings?.defaultShippingFee)    || 0;

  // Format helpers — keep prices readable. Whole-dollar amounts drop
  // the .00; non-round amounts keep two decimals.
  const fmt = (n: number) => formatMoneyShort(n);

  // Lead sentence varies based on threshold. We avoid showing
  // "Free shipping on orders over $0" when admin has set the
  // threshold to zero — that's actually "free for everyone" which
  // deserves clearer language.
  const freeShippingLead =
    threshold <= 0
      ? t('All orders qualify for free standard shipping anywhere in Canada, regardless of order size.')
      : t('All orders over {amount} (before taxes) qualify for free standard shipping anywhere in Canada.', { amount: fmt(threshold) });

  // Only mention the flat rate if it's actually charged. When admin
  // sets defaultShippingFee to 0 alongside a threshold, sub-threshold
  // orders are still free — no need to include a confusing sentence.
  const showFlatRateSentence = threshold > 0 && flatRate > 0;

  // SEO description tracks the live threshold too so search snippets
  // stay consistent with the page body.
  const seoDesc =
    threshold <= 0
      ? 'Ele Café shipping information — free shipping on all orders across Canada.'
      : `Ele Café shipping information — free shipping on orders over ${fmt(threshold)} across Canada.`;

  // settings.mapsUrl when set, else a maps search for the store address.
  const mapsUrl = store.mapsUrl;

  return (
    <StaticPage title="Shipping Policy" seoDesc={seoDesc}>
      <h2 className="ip-h2">{t('Free Shipping')}</h2>
      <p className="ip-p">
        {freeShippingLead}
        {showFlatRateSentence && (
          ` ${t('Orders under {amount} are charged a flat rate of {fee}.', { amount: fmt(threshold), fee: fmt(flatRate) })}`
        )}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">{t('Processing Time')}</h2>
      <p className="ip-p">
        {t('When you place an order we hold the total on your card and confirm your teas are in stock, usually within a few hours. Your card is charged only once the order is confirmed; orders are then processed within 1–2 business days. You will receive a shipping confirmation email with tracking information once your order has been dispatched.')}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">{t('Delivery Estimates')}</h2>
      <ul className="ip-list">
        <li>{t('British Columbia: 1–7 business days')}</li>
        <li>{t('Alberta, Saskatchewan, Manitoba: 3–7 business days')}</li>
        <li>{t('Ontario, Québec: 4–7 business days')}</li>
        <li>{t('Atlantic Provinces: 5–8 business days')}</li>
        <li>{t('Territories: 7–14 business days')}</li>
      </ul>

      {/* ── In-Store Pickup — luxury card ─────────────────────────────────
          Gold-tinted surface, gold border, soft glow. Same visual
          vocabulary as the announcement-bar chip and gift-builder
          hero, so it reads as a "premium" block to the user without
          shouting. The clickable address is the focal action. */}
      <div className="ip-luxury-card ip-luxury-card-pickup">
        <div className="ip-luxury-grid">
          <div className="ip-luxury-icon">
            <MapPin size={26} aria-hidden="true" />
          </div>

          {/* Content column */}
          <div>
            <h2 className="ip-luxury-title-lg">
              {t('In-Store Pickup')}
            </h2>
            <p className="ip-luxury-eyebrow">
              {t('Free · Ready in 2 hours')}
            </p>

            {/* Clickable address — opens Google Maps in a new tab */}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('Open {address} in Google Maps', { address: store.address })}
              className="ip-pickup-address"
            >
              {store.address}
            </a>

            {tel && (
              <p className="ip-pickup-phone-wrap">
                <a href={`tel:${tel}`} className="ip-pickup-phone">
                  {store.phone}
                </a>
              </p>
            )}

            <p className="ip-luxury-tail">
              {tx('Select {pickup} at checkout and your order will be ready within 2 hours during business hours.', { pickup: <strong className="ip-pickup-em">{t('"Pickup"')}</strong> })}
            </p>
          </div>
        </div>
      </div>
    </StaticPage>
  );
}
