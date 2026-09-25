import { Check, Sprout } from 'lucide-react';
import { StaticPage, StoreContactLine } from './StaticPage';
import { useStoreContent } from '@/hooks/useStoreContent';

import { useT, useTx } from '@/i18n/useT';
/**
 * Refund Policy — kept terse and reassuring.
 *
 * The store is a tea shop, so the policy is "all sales final" for
 * health/food-safety reasons. That's a strict stance, so the page
 * is intentionally designed to soften the blow:
 *   1. Open with the food-safety reasoning so customers understand
 *      why before they hit the "no refunds" line.
 *   2. Highlight the free-sample / $2.99-in-store offers as the
 *      counter-balance — "you can try before you buy."
 *   3. Close with a Quality Guarantee card (luxury gold treatment)
 *      so the page ends on a reassuring note, not on a warning.
 *
 * Phase 3 migration: 23 inline styles → 0. Shares the .ip-* class
 * set with PrivacyPolicyPage, AboutPage, and ShippingPolicyPage.
 */
export default function RefundPolicyPage() {
  const t = useT();
  const tx = useTx();
  const { email } = useStoreContent();
  return (
    <StaticPage title="Refund Policy" seoDesc="Ele Café refund policy — quality guarantee for spoiled or damaged products. All other tea sales final for food-safety reasons.">
      <p className="ip-p">
        {t('At Ele Café, the quality of every tea we offer is very important to us. Because tea is a food product, we maintain strict health and food safety standards for all purchases.')}
      </p>

      {/* ── No Refunds — bordered notice, not alarming, just clear ─────── */}
      <div className="ip-notice-card">
        <h2 className="ip-notice-h2">
          {t('No Refunds or Exchanges')}
        </h2>
        <p className="ip-notice-body">
          {t('For health and food safety reasons, all tea purchases are final and cannot be refunded or exchanged once sold.')}
        </p>

        {/* Sample callout — small gold-tinted pills INSIDE the notice
            so the "but you can sample first" message is visually
            attached to the policy it softens. */}
        <p className="ip-notice-tail">
          {t('To help you choose with confidence, you can sample any tea before committing:')}
        </p>
        <div className="ip-pill-group">
          <div className="ip-pill">
            <Sprout size={14} className="ip-pill-icon" aria-hidden="true" />
            <span>
              {tx('{sample} with every online loose-leaf order', { sample: <strong className="ip-pill-em">{t('Complimentary sample')}</strong> })}
            </span>
          </div>
          <div className="ip-pill">
            <Sprout size={14} className="ip-pill-icon" aria-hidden="true" />
            <span>
              {tx('{samples} of any tea before purchase', { samples: <strong className="ip-pill-em">{t('$2.99 in-café samples')}</strong> })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Quality Guarantee — luxury card, mirrors the in-store pickup
          treatment on ShippingPolicyPage. Ends the page on a reassuring,
          customer-positive note rather than the strict notice above. */}
      <div className="ip-luxury-card">
        <div className="ip-luxury-grid">
          <div className="ip-luxury-icon">
            <Check size={26} aria-hidden="true" />
          </div>

          <div>
            <h2 className="ip-luxury-title">
              {t('Quality Guarantee')}
            </h2>
            <p className="ip-luxury-eyebrow">
              {t('Our promise to you')}
            </p>

            <p className="ip-luxury-body">
              {tx('If your tea arrives spoiled, damaged, or there is an issue with the product quality, please contact us within {window}. After review, we will gladly provide a full refund or replacement for the affected item.', { window: <strong>{t('7 days of purchase or delivery')}</strong> })}
            </p>

            <p className="ip-luxury-body">
              {t('Refunds go back to the card you paid with and usually appear within 5–10 business days. If we can\'t fill your order, you\'re never charged — the temporary hold on your card is simply released.')}
            </p>

            <p className="ip-luxury-tail">
              {t('For assistance, please contact')}{' '}
              <a href={`mailto:${email}`} className="ip-luxury-link">
                {email}
              </a>.
            </p>
          </div>
        </div>
      </div>

      {/* Contact footer — matches AboutPage pattern */}
      <StoreContactLine />
    </StaticPage>
  );
}
