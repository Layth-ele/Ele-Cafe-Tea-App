/**
 * CollectionPage — /collections/:slug keyword landing pages
 * (caffeine-free, organic, matcha powder, Japanese tea, iced tea, chai…).
 *
 * The collection definitions — title, keyword copy and which teas belong —
 * come from functions/src/lib/seoCatalog.ts, the same module renderSeo uses
 * for the server-rendered <head>/<noscript> and getSitemap uses to list
 * only non-empty collections. So the hydrated page, the crawler HTML and
 * the sitemap always agree.
 *
 * Unknown slugs fall through to the NotFound page; a known collection with
 * no live teas renders a noindex empty state (thin content stays out of
 * the index until a matching tea is published).
 */
import { CafeMenuFor } from '@/app/components/cafe/CafeMenuBoard';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { ProductsCardSkeleton, ProductsTeaCard } from '@/app/components/products/ProductsTeaCard';
import { ProductsPageHeader } from '@/app/components/products/ProductsPageHeader';
import { useTeasRealtime } from '@/hooks/useTeasRealtime';
import { ROUTES, SITE_BASE } from '@/lib/routes';
import { useT, useLang } from '@/i18n/useT';
import { NotFoundPage } from '@/app/pages/NotFoundPage';
import { SEO_COLLECTIONS, SEO_COLLECTION_BY_SLUG } from '../../../functions/src/lib/seoCatalog';
import { COLLECTION_GUIDES } from '../../../functions/src/lib/collectionGuides';
import { faqJsonLd } from '../../../functions/src/lib/storeContent';
import { HomeFaq } from '@/app/components/home/HomeGuideSections';

function CollectionPage() {
  const t = useT();
  const lang = useLang();
  const { slug = '' } = useParams<{ slug: string }>();
  const def = SEO_COLLECTION_BY_SLUG[slug];
  const guide = COLLECTION_GUIDES[slug];
  const { data: products = [], isLoading } = useTeasRealtime();

  const teas = useMemo(() => (def ? products.filter((p) => def.match(p)) : []), [def, products]);
  // Sibling collections that currently have teas — internal links.
  const related = useMemo(
    () => SEO_COLLECTIONS.filter((c) => c.slug !== slug && products.some((p) => c.match(p))),
    [slug, products],
  );

  if (!def) return <NotFoundPage />;

  const title = lang === 'fr' ? def.titleFr : def.title;
  const intro = lang === 'fr' ? def.descriptionFr : def.description;
  const url = `${SITE_BASE}${ROUTES.COLLECTION(def.slug)}`;

  return (
    <div className="pp-page">
      <SeoHead
        title={`${def.title} | Ele Café Vancouver`}
        description={def.description}
        url={url}
        noIndex={!isLoading && teas.length === 0}
        breadcrumbs={[
          { name: 'Home', url: SITE_BASE },
          { name: 'Our Teas', url: `${SITE_BASE}${ROUTES.PRODUCTS}` },
          { name: def.title, url },
        ]}
        extraJsonLd={guide ? [faqJsonLd(guide.faq)] : undefined}
      />
      <div className="bc-page-wrap">
        <Breadcrumbs
          withoutSchema
          items={[
            { name: 'Home', url: ROUTES.HOME },
            { name: t('Our Teas'), url: ROUTES.PRODUCTS },
            { name: title, url: ROUTES.COLLECTION(def.slug) },
          ]}
        />
      </div>

      <ProductsPageHeader
        title={title}
        intro={intro}
        resultCount={teas.length}
        page={1}
        totalPages={1}
        loading={isLoading}
      />

      <div className="cl-body">
        {isLoading ? (
          <div className="pp-grid pp-grid-skel">
            {Array.from({ length: 6 }, (_, i) => (
              <ProductsCardSkeleton key={i} />
            ))}
          </div>
        ) : teas.length > 0 ? (
          <div className="pp-grid pp-grid-results">
            {teas.map((p, i) => (
              <div key={p.id ?? p.slug ?? i} data-card-anim>
                <ProductsTeaCard product={p} priority={i < 6} />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>{t('No teas in this collection right now — check back soon.')}</p>
          </div>
        )}

        <p className="cl-all">
          <Link to={ROUTES.PRODUCTS} className="hg-guide-link">
            {t('Browse all teas')} <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </p>

        {guide && (
          <section className="cg-guide" aria-label={t('Guide')}>
            {(lang === 'fr' ? guide.sectionsFr : guide.sections).map((sec) => (
              <div key={sec.h} className="cg-guide-block">
                <h2 className="cg-guide-h2">{sec.h}</h2>
                <p className="cg-guide-p">{sec.p}</p>
              </div>
            ))}
          </section>
        )}

        {def.slug === 'matcha-powder' && (
          <>
            <CafeMenuFor id="matcha" />
            <CafeMenuFor id="hojicha" />
          </>
        )}

        {guide && (
          <HomeFaq
            items={lang === 'fr' ? guide.faqFr : guide.faq}
            title={t('{name}: questions', { name: lang === 'fr' ? def.titleFr : def.title })}
          />
        )}

        {related.length > 0 && (
          <nav className="cl-related" aria-label={t('More tea collections')}>
            <h2 className="cl-related-title">{t('More tea collections')}</h2>
            <ul>
              {related.map((c) => (
                <li key={c.slug}>
                  <Link to={ROUTES.COLLECTION(c.slug)}>{lang === 'fr' ? c.titleFr : c.title}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}

export default CollectionPage;
