/**
 * CafePage — /cafe, the in-store café menu.
 *
 * Targets local "visit" searches (best café in Vancouver, matcha latte,
 * croissant, Americano…). Copy, drinks and FAQ come from
 * functions/src/lib/cafeMenu.ts, shared with renderSeo's server-rendered
 * /cafe. Pastry combos are live from Admin → Pairings (useComboGallery),
 * so photos and prices are always the admin's current ones. Address and
 * hours come from Admin → Settings (useStoreContent).
 */
import { useEffect } from 'react';
import { DietBadges, caloriesText } from '@/app/components/DietBadges';
import { Link, useLocation } from 'react-router';
import { CafeMenuNav, CafeMenuSectionView } from '@/app/components/cafe/CafeMenuBoard';
import { ArrowRight, MapPin, Clock } from 'lucide-react';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { LazyImage } from '@/app/components/LazyImage';
import { Skeleton } from '@/app/components/ui/skeleton';
import { useComboGallery } from '@/app/components/ComboGallery';
import { HomeFaq } from '@/app/components/home/HomeGuideSections';
import { useStoreContent } from '@/hooks/useStoreContent';
import { useT, useLang, localizeCombo } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
import { ROUTES, SITE_BASE } from '@/lib/routes';
import { faqJsonLd, hoursText, localBusinessLd } from '../../../functions/src/lib/storeContent';
import {
  CAFE_DESCRIPTION,
  CAFE_MENU,
  CAFE_TITLE,
  buildCafeFaq,
  cafeIntro,
  cafeMenuLd,
} from '../../../functions/src/lib/cafeMenu';

function CafePage() {
  const t = useT();
  const lang = useLang();
  const store = useStoreContent();
  const { items, loading } = useComboGallery();

  const faq = buildCafeFaq(store);
  const combos = items.map((i) => ({
    title: i.title,
    description: i.description,
    price: i.price,
    slug: i.slug || undefined,
    imageUrl: i.imageUrl,
    vegan: i.vegan === true,
    diet: i.diet,
    calories: i.calories,
  }));
  const url = `${SITE_BASE}${ROUTES.CAFE}`;

  // Links like /cafe#menu-matcha (from the matcha / hojicha pages) land
  // on that board once the page has rendered.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    const timer = window.setTimeout(
      () => document.getElementById(id)?.scrollIntoView({ block: 'start' }),
      60,
    );
    return () => window.clearTimeout(timer);
  }, [hash]);

  return (
    <div className="pp-page">
      <SeoHead
        title={CAFE_TITLE}
        description={CAFE_DESCRIPTION}
        url={url}
        image={items[0]?.imageUrl}
        breadcrumbs={[
          { name: 'Home', url: SITE_BASE },
          { name: 'Café Menu', url },
        ]}
        extraJsonLd={[
          cafeMenuLd(SITE_BASE, combos),
          faqJsonLd(faq),
          localBusinessLd(store, SITE_BASE),
        ]}
      />
      <div className="bc-page-wrap">
        <Breadcrumbs
          withoutSchema
          items={[
            { name: 'Home', url: ROUTES.HOME },
            { name: t('Café Menu'), url: ROUTES.CAFE },
          ]}
        />
      </div>

      <header className="pp-page-header">
        <span className="overline">{t('Ele Café · Vancouver')}</span>
        <h1 className="pp-page-h1">{t('Café Menu')}</h1>
        <p className="pp-page-intro">{cafeIntro(store, lang)}</p>
        {(store.address || store.hours.length > 0) && (
          <ul className="cafe-visit">
            {store.address && (
              <li>
                <MapPin size={14} aria-hidden="true" />
                {store.mapsUrl ? (
                  <a href={store.mapsUrl} target="_blank" rel="noopener noreferrer">
                    {store.address}
                  </a>
                ) : (
                  store.address
                )}
              </li>
            )}
            {store.hours.length > 0 && (
              <li>
                <Clock size={14} aria-hidden="true" />
                {hoursText(store.hours, lang)}
              </li>
            )}
          </ul>
        )}
      </header>

      <div className="cafe-section">
        <CafeMenuNav />
        {CAFE_MENU.map((section) => (
          <CafeMenuSectionView key={section.id} section={section} />
        ))}
      </div>

      <section className="cafe-section" aria-labelledby="cafe-pastries">
        <h2 id="cafe-pastries" className="cafe-h2">
          {t('Pastry combos')}
        </h2>
        <p className="cafe-sub">{t('Every pastry comes with your choice of tea or Americano.')}</p>
        {loading ? (
          <div className="pix-grid" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton.Card key={i} />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="pix-grid">
            {items.map((item) => {
              const loc = localizeCombo(item, lang);
              const body = (
                <>
                  <LazyImage
                    src={item.imageUrl}
                    alt={loc.title}
                    aspectRatio="4/3"
                    borderRadius="14px"
                    className="pix-card-img"
                  />
                  <div className="pix-card-body">
                    <DietBadges item={item} />
                    <h3 className="pix-card-title">{loc.title}</h3>
                    <p className="pix-card-desc">{loc.description}</p>
                    {item.price > 0 && (
                      <p className="pix-card-price">
                        {formatMoney(item.price)}
                        {caloriesText(item) && (
                          <span className="pix-card-cal"> · {caloriesText(item)}</span>
                        )}
                        <span className="pix-card-combo">{t('Combo · with tea or Americano')}</span>
                      </p>
                    )}
                  </div>
                </>
              );
              return item.slug ? (
                <Link key={item.id} to={ROUTES.PAIRING(item.slug)} className="pix-card">
                  {body}
                </Link>
              ) : (
                <article key={item.id} className="pix-card pix-card-static">
                  {body}
                </article>
              );
            })}
          </div>
        ) : null}
        <p className="cl-all">
          <Link to={ROUTES.PAIRINGS} className="hg-guide-link">
            {t('See all tea & pastry pairings')} <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </p>
        <p className="cl-all">
          <Link to={ROUTES.REWARDS} className="hg-guide-link">
            {t('Earn points on every cup with Ele Rewards')}{' '}
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </p>
      </section>

      <HomeFaq items={lang === 'fr' ? buildCafeFaq(store, 'fr') : faq} title={t('Café FAQ')} />

      <section className="pix-cta-section">
        <h2 className="pix-cta-h2">{t('Take your favourite tea home')}</h2>
        <p className="pix-cta-body">
          {t(
            'Every loose leaf tea we brew in the café is for sale online, with free pickup in Vancouver.',
          )}
        </p>
        <Link to={ROUTES.PRODUCTS} className="btn btn-lg cpp-cta-dark">
          {t('Browse all teas')} <ArrowRight size={15} />
        </Link>
      </section>
    </div>
  );
}

export default CafePage;
