import { StaticPage } from './StaticPage';
import { ContactCard } from '@/app/components/ContactCard';
import { SITE_BASE } from '@/lib/routes';
import { useStoreContent } from '@/hooks/useStoreContent';
import { hoursText, localBusinessLd } from '../../../../functions/src/lib/storeContent';

import { useT } from '@/i18n/useT';
/**
 * Contact Us — uses the reusable ContactCard component.
 *
 * Address, hours, phone and email come from Admin → Settings (see
 * useStoreContent); the page also publishes them as LocalBusiness JSON-LD.
 */
export default function ContactPage() {
  const t = useT();
  const store = useStoreContent();
  const hours = hoursText(store.hours);
  return (
    <StaticPage
      title="Contact Us"
      seoDesc={`Visit ${store.name}${store.address ? ` at ${store.address}` : ' in Vancouver'}.${hours ? ` Open ${hours}.` : ''} Phone, email and directions.`}
      extraJsonLd={localBusinessLd(store, SITE_BASE)}
    >
      <p className="contact-page-intro">
        {t('We’d love to hear from you. Drop in to taste teas with us, or reach out by phone or email — we’ll get back to you within one business day.')}
      </p>

      <ContactCard variant="full" />
    </StaticPage>
  );
}
