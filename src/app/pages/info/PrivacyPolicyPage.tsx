import { ShieldCheck } from 'lucide-react';
import { StaticPage, StoreContactLine } from './StaticPage';
import { useStoreContent } from '@/hooks/useStoreContent';

import { useT, useTx } from '@/i18n/useT';
/**
 * Privacy Policy — concise, jurisdiction-neutral.
 *
 * The page intentionally avoids legal-template boilerplate. Visitors
 * tend to scan privacy pages for the actionable bits: what you take,
 * how you use it, and how to opt out / delete. Those three answers
 * are kept short and direct.
 *
 * Layout matches the AboutPage / RefundPolicyPage / ShippingPolicyPage
 * pattern — same h2 typography, same gold-card treatment for the
 * customer-actionable block (Your Rights), same address/phone footer.
 * Visual consistency across all info pages.
 *
 * Phase 3 migration: 18 inline styles → 0. The shared .ip-* classes
 * in design.css now drive every visual; future info pages can compose
 * the same primitives and the luxury-card pattern with no new CSS.
 */
export default function PrivacyPolicyPage() {
  const t = useT();
  const tx = useTx();
  const { email } = useStoreContent();
  return (
    <StaticPage title="Privacy Policy" seoDesc="Ele Café privacy policy — how we collect, use, and protect your personal information.">
      <p className="ip-meta">
        {t('Last updated: April 2025')}
      </p>

      <h2 className="ip-h2">
        {t('Information We Collect')}
      </h2>
      <p className="ip-p">
        {t('When you place an order, we may collect your name, email address, phone number, and shipping address in order to complete your purchase. Card payments are processed by our payment provider, Clover — your card number is entered in Clover\'s secure form and never reaches or is stored on our servers. We keep only the card brand and last four digits to show on your order.')}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">
        {t('How We Use Your Information')}
      </h2>
      <p className="ip-p">
        {t('We use your information to process orders, communicate with you about your purchase, and, if you choose, send updates about new teas and special offerings.')}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">
        {t('Cookies')}
      </h2>
      <p className="ip-p">
        {t('Our website may use essential cookies to help the site function properly, including keeping your cart and browsing session active.')}
      </p>

      {/* ── Your Rights — luxury gold card, mirrors the Quality Guarantee
          on RefundPolicyPage and In-Store Pickup on ShippingPolicyPage.
          This is the actionable customer block — making it visually
          prominent encourages people to actually use their rights
          rather than scroll past a wall of legal-style text. */}
      <div className="ip-luxury-card">
        <div className="ip-luxury-grid">
          <div className="ip-luxury-icon">
            <ShieldCheck size={26} aria-hidden="true" />
          </div>

          <div>
            <h2 className="ip-luxury-title">
              {t('Your Rights')}
            </h2>
            <p className="ip-luxury-eyebrow">
              {t('Access · Correct · Delete')}
            </p>

            <p className="ip-luxury-body">
              {tx('You may request {access}, {correction}, or {deletion} your personal information at any time by contacting us.', { access: <strong>{t('access to')}</strong>, correction: <strong>{t('correction of')}</strong>, deletion: <strong>{t('deletion of')}</strong> })}
            </p>

            <p className="ip-luxury-tail">
              {t('Email us at')}{' '}
              <a href={`mailto:${email}`} className="ip-luxury-link">
                {email}
              </a>.
            </p>
          </div>
        </div>
      </div>

      {/* Contact footer — matches AboutPage / RefundPolicyPage pattern */}
      <StoreContactLine />
    </StaticPage>
  );
}
