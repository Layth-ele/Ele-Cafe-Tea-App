/**
 * PairingsIndexPage — public collection page for all enabled combo pairings.
 *
 * Lives at `/pairings`. Phase 12: this page exists to close the soft-404
 * gap the breadcrumbs were creating. Both ComboPairingPage and renderSeo's
 * `patchHeadForPairing` emit `Pairings → /pairings` as the second
 * breadcrumb segment, but the route wasn't registered — so a user (or
 * Google) clicking that breadcrumb hit the SPA's NotFoundPage.
 *
 * It also gives the sitemap a single canonical entry point: Google crawls
 * `/pairings`, sees the grid of links, and crawls the individual
 * `/pairings/{slug}` pages from there.
 *
 * Anatomy:
 *   1. SeoHead with collection-level title/description
 *   2. Page header (eyebrow, h1, sub)
 *   3. Grid of pairing cards — LazyImage thumb + title + price
 *      Each card links to /pairings/{slug}
 *   4. Empty state when nothing is enabled
 *
 * Data shape: reuses `useComboGallery()` — the same hook the carousel
 * uses. That keeps a single subscription path; an admin disabling a
 * combo here reflects in real time.
 *
 * Hidden when the global toggle (`comboGalleryEnabled`) is off — same
 * gate as the carousel. Renders a friendly "no pairings yet" message
 * if the toggle is on but no items exist.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { DietBadges, caloriesText } from '@/app/components/DietBadges';
import {
  DIET_TAGS,
  DIET_LABEL,
  comboDiet,
  type DietTag,
} from '../../../functions/src/lib/cafeMenu';
import { ArrowRight } from 'lucide-react';
import { ROUTES, SITE_BASE } from '@/lib/routes';
import { useComboGallery } from '@/app/components/ComboGallery';
import { LazyImage } from '@/app/components/LazyImage';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { Skeleton } from '@/app/components/ui/skeleton';
import { ShareButton } from '@/app/components/ShareButton';

import { useT, localizeCombo, useLang } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
import { PAIRINGS_TITLE, PAIRINGS_DESCRIPTION } from '../../../functions/src/lib/cafeMenu';
// Prices are CAD: the site's own format ("$9.25" / "9,25 $"), not
// Intl's "CA$9.25".
function formatPrice(price: number, _currency = 'CAD'): string {
  return formatMoney(price);
}

function PairingsIndexPage() {
  const t = useT();
  const lang = useLang();
  const { enabled, items: allItems, loading } = useComboGallery();
  // "Vegan" filter — shown only when at least one pairing is vegan.
  const [dietFilter, setDietFilter] = useState<DietTag | null>(null);
  const dietCounts = DIET_TAGS.map(
    (tag) => [tag, allItems.filter((i) => comboDiet(i).includes(tag)).length] as const,
  ).filter(([, n]) => n > 0);
  const items = dietFilter ? allItems.filter((i) => comboDiet(i).includes(dietFilter)) : allItems;

  // Toggle-off: render an apologetic empty page rather than 404, so a
  // link from social media to /pairings doesn't bounce the visitor
  // back to nowhere. The SeoHead is still useful (canonical URL) but
  // we mark it noindex so search engines don't preserve a useless
  // landing page in their index while the feature is off.
  if (!enabled) {
    return (
      <>
        <SeoHead
          title="Pairings — Ele Café"
          description="Curated pastry and food pairings for our premium teas."
          url={`${SITE_BASE}/pairings`}
          noIndex
        />
        <main id="main-content" className="pix-bg">
          <div className="pix-empty">
            <p className="cpp-eyebrow-gold">{t('Pairings')}</p>
            <h1 className="pix-empty-title">{t('Pairings coming soon')}</h1>
            <p className="pix-empty-body">
              {t(
                'We’re curating a new round of pastries and bites that pair beautifully with our teas. Check back soon.',
              )}
            </p>
            <Link to={ROUTES.PRODUCTS} className="btn btn-lg cpp-cta-dark">
              {t('Browse all teas')} <ArrowRight size={15} />
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <SeoHead
        title={PAIRINGS_TITLE}
        description={PAIRINGS_DESCRIPTION}
        url={`${SITE_BASE}/pairings`}
        breadcrumbs={[
          { name: 'Home', url: SITE_BASE },
          { name: 'Pairings', url: `${SITE_BASE}/pairings` },
        ]}
      />

      <main id="main-content" className="pix-bg">
        <div className="bc-page-wrap">
          <Breadcrumbs
            withoutSchema
            items={[
              { name: 'Home', url: '/' },
              { name: 'Pairings', url: '/pairings' },
            ]}
          />
        </div>

        <header className="pix-header">
          <p className="cpp-eyebrow-gold">{t('Curated pairings')}</p>
          <h1 className="pix-h1">{t('Pairs with our tea')}</h1>
          <p className="pix-sub">
            {t(
              'Hand-selected pastries, cakes, and bites that bring out the best in every cup. Click any pairing to see what teas it loves most.',
            )}
          </p>
          {/* Phase 20 — share affordance. Lets visitors send the pairings
              index to a friend; on mobile this opens the native share
              sheet (Messages / Mail / WhatsApp / etc.); on desktop it
              falls back to copying the URL to the clipboard. */}
          <div className="pix-share-row">
            <ShareButton
              variant="pill"
              title={t('Tea pairings at Ele Café')}
              url={`${SITE_BASE}/pairings`}
              text={t('Curated pairings of pastries and teas from Ele Café in Vancouver.')}
            />
          </div>
          <div className="cg-rule" />
        </header>

        {dietCounts.length > 0 && (
          <div className="pix-filter" role="group" aria-label={t('Filter pairings')}>
            <button
              type="button"
              className="pix-filter-chip"
              aria-pressed={!dietFilter}
              onClick={() => setDietFilter(null)}
            >
              {t('All')} <span>{allItems.length}</span>
            </button>
            {dietCounts.map(([tag, n]) => (
              <button
                key={tag}
                type="button"
                className="pix-filter-chip"
                aria-pressed={dietFilter === tag}
                onClick={() => setDietFilter(tag)}
              >
                {DIET_LABEL[tag][lang === 'fr' ? 'fr' : 'en']} <span>{n}</span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="pix-grid" aria-busy="true" aria-label={t('Loading pairings')}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton.Card key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="pix-empty">
            <p className="pix-empty-body">{t('No pairings available right now.')}</p>
            <Link to={ROUTES.PRODUCTS} className="btn btn-lg cpp-cta-dark">
              {t('Browse all teas')} <ArrowRight size={15} />
            </Link>
          </div>
        ) : (
          <section className="pix-grid">
            {items.map((item) => {
              const hasSlug = typeof item.slug === 'string' && item.slug.length > 0;
              const card = (
                <>
                  <LazyImage
                    src={item.imageUrl}
                    alt={localizeCombo(item, lang).title}
                    aspectRatio="4/3"
                    borderRadius="14px"
                    className="pix-card-img"
                  />
                  <div className="pix-card-body">
                    <DietBadges item={item} />
                    <h2 className="pix-card-title">{localizeCombo(item, lang).title}</h2>
                    <p className="pix-card-desc">{localizeCombo(item, lang).description}</p>
                    {typeof item.price === 'number' && item.price > 0 && (
                      <p className="pix-card-price">
                        {formatPrice(item.price, item.currency || 'CAD')}
                        {caloriesText(item) && (
                          <span className="pix-card-cal"> · {caloriesText(item)}</span>
                        )}
                      </p>
                    )}
                  </div>
                </>
              );

              // Card is only clickable when the combo has a slug (i.e.
              // a /pairings/{slug} landing page exists). Legacy combos
              // without slugs render as static cards — they still
              // appear on the carousel and the index, just not as
              // shareable URLs.
              return hasSlug ? (
                <Link
                  key={item.id}
                  to={ROUTES.PAIRING(item.slug as string)}
                  className="pix-card"
                  aria-label={t('View pairing details for {name}', {
                    name: localizeCombo(item, lang).title,
                  })}
                >
                  {card}
                </Link>
              ) : (
                <article key={item.id} className="pix-card pix-card-static">
                  {card}
                </article>
              );
            })}
          </section>
        )}

        <section className="pix-cta-section">
          <p className="cpp-eyebrow-gold">{t('Best with tea')}</p>
          <h2 className="pix-cta-h2">{t('Find the perfect cup')}</h2>
          <p className="pix-cta-body">
            {t(
              'Browse our full collection of premium loose-leaf teas — we’ll help you find the one that completes the pairing.',
            )}
          </p>
          <Link to={ROUTES.PRODUCTS} className="btn btn-lg cpp-cta-dark">
            {t('Browse all teas')} <ArrowRight size={15} />
          </Link>
        </section>
      </main>
    </>
  );
}

export default PairingsIndexPage;
