/**
 * HomeGuideSections — the homepage's editorial content: Shop by mood,
 * the loose leaf tea guide (type + brewing), Why Ele Café and the FAQ.
 *
 * This is the text search engines and first-time visitors need to
 * understand what we sell. Store facts come from Admin → Settings via
 * useStoreContent; the FAQ text is built by buildHomeFaq in
 * functions/src/lib/storeContent.ts — the same function renderSeo uses
 * for the server-rendered homepage, so the page and Google always agree.
 */
import { Link } from 'react-router';
import { useGiftsComingSoon } from '@/hooks/useGiftsComingSoon';
import { ArrowRight } from 'lucide-react';
import { ROUTES } from '@/lib/routes';
import { categories } from '@/data/categories';
import { MOODS, TEA_GUIDE } from '@/data/teaGuide';
import { money, type FaqItem, type StoreContent } from '../../../../functions/src/lib/storeContent';

import { useT, useLang } from '@/i18n/useT';
import { useVisibleCategoryIds } from '@/hooks/useVisibleCategoryIds';
function Header({ overline, title, intro }: { overline: string; title: string; intro?: string }) {
  return (
    <div className="hg-header">
      <span className="overline">{overline}</span>
      <h2 className="hp-section-h2">{title}</h2>
      {intro && <p className="hg-intro">{intro}</p>}
    </div>
  );
}

export function ShopByMood() {
  const t = useT();
  const giftsClick = useGiftsComingSoon();
  return (
    <section className="section-sm hg-mood-section" aria-labelledby="hg-mood-title">
      <div className="container">
        <div className="hg-header">
          <span className="overline">{t('Find your tea')}</span>
          <h2 id="hg-mood-title" className="hp-section-h2">
            {t('Shop Tea by Mood')}
          </h2>
        </div>
        <div className="hg-mood-grid">
          {MOODS.map((m) => (
            <Link
              key={m.title}
              to={m.to}
              className="hg-mood-card"
              onClick={m.to === '/gifts' ? giftsClick : undefined}
            >
              <span className="hg-mood-title">{t(m.title)}</span>
              <span className="hg-mood-sub">{t(m.sub)}</span>
              <ArrowRight size={15} className="hg-mood-arrow" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TeaGuide() {
  const t = useT();
  const lang = useLang();
  const visibleCats = useVisibleCategoryIds();
  return (
    <section className="section-sm hg-guide-section">
      <div className="container">
        <Header
          overline={t('Loose Leaf Tea 101')}
          title={t('A Guide to Tea Types & Brewing')}
          intro={t(
            'Not sure where to start? Here’s how each of our collections tastes, whether it has caffeine, and how to brew it. Use about one teaspoon (2–3 g) of leaves per 250 ml cup.',
          )}
        />
        <div className="hg-guide-grid">
          {TEA_GUIDE.filter((g) => visibleCats.has(g.id)).map((g) => {
            const cat = categories.find((c) => c.id === g.id);
            if (!cat) return null;
            return (
              <article key={g.id} className="hg-guide-card" data-cat={g.id}>
                <h3 className="hg-guide-name">{t(cat.name)}</h3>
                <p className="hg-guide-desc">{lang === 'fr' ? g.descriptionFr : g.description}</p>
                <dl className="hg-guide-facts">
                  <div>
                    <dt>{t('Water')}</dt>
                    <dd>{g.temp}</dd>
                  </div>
                  <div>
                    <dt>{g.timeFr ? t('Prepare') : t('Steep')}</dt>
                    <dd>{lang === 'fr' && g.timeFr ? g.timeFr : g.time}</dd>
                  </div>
                  <div>
                    <dt>{t('Caffeine')}</dt>
                    <dd>{t(g.caffeine)}</dd>
                  </div>
                </dl>
                <Link to={ROUTES.PRODUCTS_CAT(g.id)} className="hg-guide-link">
                  {t('Shop {category}', { category: t(cat.name).toLowerCase() })}{' '}
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function WhyEleCafe({ store }: { store: StoreContent }) {
  const t = useT();
  const threshold = store.freeShippingThreshold;
  const perDollar = store.pointsPerDollar;
  const [street] = store.address.split(',');
  const points = [
    {
      title: t('A real Vancouver tea café'),
      body: street
        ? t('Visit us at {street} to smell and taste our loose leaf teas before you buy.', {
            street: street.trim(),
          })
        : t('Visit us to smell and taste our loose leaf teas before you buy.'),
    },
    {
      title: t('Free pickup or Canada-wide shipping'),
      body:
        threshold > 0
          ? t(
              'Pick up free in Vancouver, usually within 2 hours, or get free shipping across Canada on orders over {amount}.',
              { amount: money(threshold) },
            )
          : t(
              'Pick up free in Vancouver, usually within 2 hours, or get free shipping anywhere in Canada.',
            ),
    },
    {
      title: t('Charged only when it’s in stock'),
      body: t(
        'We place a hold, confirm every tea is in stock, and only then charge your card — no refunds to chase for sold-out teas.',
      ),
    },
    ...(store.freeSample
      ? [
          {
            title: t('A free sample with every online order'),
            body: t(
              'Every online order includes a complimentary sample, so each order introduces you to something new.',
            ),
          },
        ]
      : []),
    {
      title: t('Certified organic options'),
      body: t(
        'A selection of certified organic loose leaf teas, clearly labelled and easy to filter in the shop.',
      ),
    },
    ...(perDollar > 0
      ? [
          {
            title: t('Rewards on every cup'),
            body: t('Earn {count} points per dollar and turn them into credit on future orders.', {
              count: perDollar,
            }),
          },
        ]
      : []),
  ];
  return (
    <section className="section-sm hg-why-section">
      <div className="container">
        <Header overline={t('Why Ele Café')} title={t('Fresh Loose Leaf Tea from Vancouver')} />
        <ul className="hg-why-grid">
          {points.map((p) => (
            <li key={p.title} className="hg-why-item">
              <h3 className="hg-why-title">{p.title}</h3>
              <p className="hg-why-body">{p.body}</p>
            </li>
          ))}
        </ul>
        <p className="hg-why-more">
          <Link to={ROUTES.ABOUT}>{t('Our story')}</Link> ·{' '}
          <Link to={ROUTES.SHIPPING_POLICY}>{t('Shipping')}</Link> ·{' '}
          <Link to={ROUTES.REFUND_POLICY}>{t('Refunds')}</Link>
        </p>
      </div>
    </section>
  );
}

export function HomeFaq({ items, title }: { items: FaqItem[]; title?: string }) {
  const t = useT();
  return (
    <section className="section-sm hg-faq-section">
      <div className="container hg-faq-container">
        <Header overline={t('Good to know')} title={title ?? t('Tea Shop FAQ')} />
        <div className="hg-faq-list">
          {items.map((f) => (
            <details key={f.q} className="hg-faq-item">
              <summary className="hg-faq-q">{f.q}</summary>
              <p className="hg-faq-a">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
