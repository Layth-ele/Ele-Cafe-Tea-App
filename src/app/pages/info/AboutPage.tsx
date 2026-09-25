import { StaticPage, StoreContactLine } from './StaticPage';
import { useStoreContent } from '@/hooks/useStoreContent';
import { addressLines, FOUNDING_YEAR } from '../../../../functions/src/lib/storeContent';

import { useT } from '@/i18n/useT';
/**
 * About Us — short brand story page.
 *
 * Copy lives inline rather than in /admin/settings because the
 * narrative tone, paragraph structure, and the "Our Values" section
 * heading are intentionally tightly written and not something an
 * admin would routinely tweak. If we ever need admin-editable copy,
 * a `settings.aboutCopy` rich-text field would slot in here.
 *
 * Address + phone come from Admin → Settings (useStoreContent), the
 * same source as the footer, contact card and Google's LocalBusiness data.
 *
 * Phase 3 migration: 7 inline styles → 0. Reuses the .ip-* class set
 * from PrivacyPolicyPage.
 */
export default function AboutPage() {
  const t = useT();
  const store = useStoreContent();
  const [street] = addressLines(store.address);
  return (
    <StaticPage title="About Us" seoDesc={`Learn about ${store.name} — Vancouver's loose-leaf tea destination${street ? ` at ${street}` : ''}.`}>
      <p className="ip-p">
        {t('Ele Café began its journey in Vancouver, BC in {year} with a passion for sharing exceptional loose-leaf teas from around the world. Every tea in our collection is carefully selected for its quality, character, and the unique story behind its origin.', { year: FOUNDING_YEAR })}
      </p>
      <p className="ip-p">
        {t(street
          ? 'Our location at {street} is more than a café — it is a place for anyone who believes a great cup of tea is one of life’s simple pleasures. From Japanese ceremonial matcha whisked to order to rare oolongs and distinctive black teas, every tea we serve offers an opportunity to discover different cultures, flavours, and traditions in every cup.'
          : 'Our location is more than a café — it is a place for anyone who believes a great cup of tea is one of life’s simple pleasures. From Japanese ceremonial matcha whisked to order to rare oolongs and distinctive black teas, every tea we serve offers an opportunity to discover different cultures, flavours, and traditions in every cup.', { street })}
      </p>
      <h2 className="ip-h2 ip-h2-section">{t('Our Values')}</h2>
      <p className="ip-p">
        {t('We believe tea is more than just a drink — it is an experience. We value transparency in the origin of every tea we offer and strive to create a welcoming space where people can discover the taste, aroma, and natural benefits of teas from around the world.')}
      </p>
      <p className="ip-p">
        {t('At Ele Café, our goal is simple: to help our Vancouver community experience the richness of global tea culture, one cup at a time.')}
      </p>
      <StoreContactLine />
    </StaticPage>
  );
}
