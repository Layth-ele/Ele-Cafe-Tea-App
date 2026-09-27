/**
 * HomeHero — the home page hero. Its text and markup mirror
 * functions/src/lib/homeHero.ts, which renderSeo writes into the page so
 * phones paint the hero before the JavaScript loads; React then swaps in
 * this identical DOM (parity test: tests/unit/seo/homeHero.test.tsx).
 */
import { Link } from 'react-router';
import { MapPin } from 'lucide-react';
import { ROUTES } from '@/lib/routes';
import { HOME_HERO_COPY, type HeroLang } from '../../../../functions/src/lib/homeHero';

export function HomeHero({
  lang,
  teaCount,
  giftOn,
  street,
  mapsUrl,
}: {
  lang: HeroLang;
  teaCount: number;
  giftOn: boolean;
  street: string;
  mapsUrl: string;
}) {
  const c = HOME_HERO_COPY[lang];
  return (
    <section className="hero">
      <div className="container hp-hero-container">
        {/* LCP element on desktop (no fade: an animated element's LCP waits
            for the animation). */}
        <h1 className="hero-title hero-title-flourish">
          <span className="hp-hero-kicker">{c.kicker}</span>
          {c.artOf}
          <em>{c.fineTea}</em>
          {c.artOfAfter}
        </h1>
        <div className="hp-hero-rule" />
        {/* LCP element on phones — also unanimated. */}
        <p className="hero-sub">{c.sub(teaCount)}</p>
        <div className="hero-btns fade-up fade-up-d3">
          <Link to={ROUTES.PRODUCTS} className="btn btn-dark btn-lg">
            {c.shop}
          </Link>
          {giftOn && (
            <Link to={ROUTES.GIFTS} className="btn btn-outline btn-lg">
              {c.gift}
            </Link>
          )}
          <Link to={ROUTES.PAIRINGS} className="btn btn-gold btn-lg">
            {c.pairings}
          </Link>
        </div>
        {street && (
          <p className="ctl ctl-hero">
            <MapPin size={16} aria-hidden="true" className="ctl-icon" />
            <span>
              <strong className="ctl-lead">{c.trustLead}</strong>
              {' · '}
              {mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="ctl-where">
                  {street}
                </a>
              ) : (
                <Link to={ROUTES.CONTACT} className="ctl-where">
                  {street}
                </Link>
              )}
              {' · '}
              {c.pickup}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
