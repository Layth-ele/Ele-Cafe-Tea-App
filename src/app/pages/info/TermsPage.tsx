import { Link } from 'react-router';
import { Scale } from 'lucide-react';
import { StaticPage, StoreContactLine } from './StaticPage';
import { useStoreContent } from '@/hooks/useStoreContent';
import { ROUTES } from '@/lib/routes';

import { useT, useTx } from '@/i18n/useT';
/**
 * Terms of Service — the rules for using elecafe.ca and ordering.
 *
 * Linked from the footer and from the Google sign-in consent screen
 * (Google Cloud → Branding → Terms of Service link). Plain-language and
 * short like the other info pages; it defers to the Shipping, Refund
 * and Privacy pages for the details instead of restating them, so each
 * rule lives in one place.
 *
 * Layout follows PrivacyPolicyPage (.ip-* classes, one gold card for the
 * customer-actionable block, contact footer).
 */
export default function TermsPage() {
  const t = useT();
  const tx = useTx();
  const { email } = useStoreContent();
  const link = (to: string, label: string) => (
    <Link to={to} className="ip-luxury-link">
      {t(label)}
    </Link>
  );
  return (
    <StaticPage
      title="Terms of Service"
      seoDesc="Ele Café terms of service — the rules for using elecafe.ca, ordering tea online, payments, shipping, rewards and your account."
    >
      <p className="ip-meta">{t('Last updated: September 2026')}</p>

      <p className="ip-p">
        {t(
          'These terms apply when you use elecafe.ca, create an account, or place an order with Ele Café in Vancouver, British Columbia. By using the site or ordering, you agree to them.',
        )}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">{t('Your Account')}</h2>
      <p className="ip-p">
        {t(
          'You can sign in with your email and password or with Google. Please keep your sign-in details private and give us accurate contact and delivery information. You are responsible for activity on your account; tell us right away if you think someone else has used it.',
        )}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">{t('Orders and Prices')}</h2>
      <p className="ip-p">
        {t(
          'All prices are in Canadian dollars, and applicable taxes are added at checkout. Placing an order is an offer to buy; it is accepted once we confirm that your teas are in stock. We may decline or cancel an order — for example if an item is unavailable or a price was shown in error — and if we do, you are not charged.',
        )}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">{t('Payment')}</h2>
      <p className="ip-p">
        {t(
          'Card payments are processed securely by Clover. When you order, we place a temporary hold for the total; your card is charged only once the order is confirmed. If we cannot fill it, the hold is released.',
        )}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">{t('Shipping, Pickup and Refunds')}</h2>
      <p className="ip-p">
        {tx(
          'Delivery times and in-store pickup are described in our {shipping}. For food-safety reasons tea sales are final, but our quality guarantee covers anything that arrives spoiled or damaged — see our {refund}.',
          {
            shipping: link(ROUTES.SHIPPING_POLICY, 'Shipping Policy'),
            refund: link(ROUTES.REFUND_POLICY, 'Refund Policy'),
          },
        )}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">{t('Rewards, Promotions and Gift Offers')}</h2>
      <p className="ip-p">
        {t(
          'Reward points, store credit and promotional codes have no cash value, cannot be transferred or exchanged for money, and may expire as shown in your account or in the offer. Each promotion applies only under its stated conditions and cannot be combined unless it says so. We may change or end a program or offer, and we may cancel points or credits obtained through misuse.',
        )}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">{t('Our Teas and Health Information')}</h2>
      <p className="ip-p">
        {t(
          'Tea is a natural product, so colour, aroma and flavour can vary from batch to batch and from the photos. Brewing tips, caffeine figures and our caffeine calculator give typical values for general information only — they are not medical advice. If you are pregnant, have allergies or a health condition, please check ingredients and ask your doctor.',
        )}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">{t('Reviews and Content You Share')}</h2>
      <p className="ip-p">
        {t(
          'Reviews and photos you post must be honest and your own, and must not be offensive or unlawful. By posting them you allow us to display them on our site and social channels. We may remove content that breaks these rules.',
        )}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">{t('Using the Site')}</h2>
      <p className="ip-p">
        {t(
          'The Ele Café name, logo, photos and text belong to Ele Café. Please do not copy them for commercial use, interfere with the site, or use bots to place orders or collect data. You are welcome to link to our pages.',
        )}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">{t('Liability')}</h2>
      <p className="ip-p">
        {t(
          'We work to keep the site accurate and available, but it is provided as is. To the extent the law allows, Ele Café is not liable for indirect or consequential losses, and our total liability for an order is limited to the amount you paid for it. Nothing in these terms limits your rights under consumer protection law.',
        )}
      </p>

      <h2 className="ip-h2 ip-h2-spaced">{t('Changes and Governing Law')}</h2>
      <p className="ip-p">
        {tx(
          'We may update these terms; the date at the top shows the latest version, and orders follow the terms in place when they were placed. These terms are governed by the laws of British Columbia and of Canada. How we handle your personal information is explained in our {privacy}.',
          {
            privacy: link(ROUTES.PRIVACY_POLICY, 'Privacy Policy'),
          },
        )}
      </p>

      <div className="ip-luxury-card">
        <div className="ip-luxury-grid">
          <div className="ip-luxury-icon">
            <Scale size={26} aria-hidden="true" />
          </div>
          <div>
            <h2 className="ip-luxury-title">{t('Questions?')}</h2>
            <p className="ip-luxury-eyebrow">{t('We are happy to help')}</p>
            <p className="ip-luxury-body">
              {t(
                'If anything in these terms is unclear, or you have a concern about an order, get in touch and we will sort it out.',
              )}
            </p>
            <p className="ip-luxury-tail">
              {t('Email us at')}{' '}
              <a href={`mailto:${email}`} className="ip-luxury-link">
                {email}
              </a>
              .
            </p>
          </div>
        </div>
      </div>

      <StoreContactLine />
    </StaticPage>
  );
}
