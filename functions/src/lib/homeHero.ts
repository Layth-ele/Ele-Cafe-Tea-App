/**
 * homeHero.ts — the home page hero (headline, tea count, buttons, café line).
 *
 * Shared by the React HomeHero component and renderSeo, which writes the
 * same markup into #root on "/" and "/fr". Phones then paint the hero —
 * the LCP element — as soon as HTML + CSS arrive instead of after ~300 KB
 * of JavaScript; React replaces it with identical DOM. A unit test
 * (tests/unit/seo/homeHero.test.tsx) renders the React component and
 * checks it matches homeHeroHtml() exactly, so the two can't drift.
 *
 * No imports — bundled into both the client and functions.
 */

export type HeroLang = 'en' | 'fr';

export const HOME_HERO_COPY = {
  en: {
    kicker: 'Premium loose leaf tea · Vancouver, Canada',
    artOf: 'The Art of ',
    artOfAfter: '',
    fineTea: 'Fine Tea',
    sub: (n: number) =>
      n > 0
        ? `${n} loose leaf teas — black, green, white, oolong, rooibos, herbal, flower & fruit — shipped across Canada or ready for pickup in Vancouver`
        : 'Loose leaf teas — black, green, white, oolong, rooibos, herbal, flower & fruit — shipped across Canada or ready for pickup in Vancouver',
    shop: 'Shop Collection',
    gift: 'Gift Builder',
    pairings: 'Tea pairings',
    trustLead: 'Taste it in Vancouver before you buy it online',
    pickup: 'Free pickup',
  },
  fr: {
    kicker: 'Thé en vrac d’exception · Vancouver, Canada',
    artOf: 'L’art du ',
    artOfAfter: '',
    fineTea: 'thé d’exception',
    sub: (n: number) =>
      n > 0
        ? `${n} thés en vrac — noirs, verts, blancs, oolong, rooibos, tisanes, fleurs et fruits — livrés partout au Canada ou prêts à ramasser à Vancouver`
        : 'Thés en vrac — noirs, verts, blancs, oolong, rooibos, tisanes, fleurs et fruits — livrés partout au Canada ou prêts à ramasser à Vancouver',
    shop: 'Découvrir la collection',
    gift: 'Créer un coffret',
    pairings: 'Accords gourmands',
    trustLead: 'Goûtez-le à Vancouver avant de l’acheter en ligne',
    pickup: 'Cueillette gratuite',
  },
} as const;

/** lucide-react <MapPin size={16}> as React renders it. */
const MAP_PIN_16 =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin ctl-icon" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path><circle cx="12" cy="10" r="3"></circle></svg>';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[c] as string,
  );

export interface HomeHeroOptions {
  lang: HeroLang;
  teaCount: number;
  /** First line of the café address ('' hides the café line). */
  street: string;
  mapsUrl: string;
  /** '' for English, '/fr' for French — prefixes the in-app links. */
  base: string;
}

/** The hero <section> exactly as the React HomeHero renders it. */
export function homeHeroHtml(o: HomeHeroOptions): string {
  const c = HOME_HERO_COPY[o.lang];
  const href = (p: string) => esc(`${o.base}${p}`);
  const where = o.mapsUrl
    ? `<a href="${esc(o.mapsUrl)}" target="_blank" rel="noopener noreferrer" class="ctl-where">${esc(o.street)}</a>`
    : `<a class="ctl-where" href="${href('/contact')}" data-discover="true">${esc(o.street)}</a>`;
  const trust = o.street
    ? `<p class="ctl ctl-hero">${MAP_PIN_16}<span><strong class="ctl-lead">${esc(c.trustLead)}</strong> · ${where} · ${esc(c.pickup)}</span></p>`
    : '';
  return (
    `<section class="hero"><div class="container hp-hero-container">` +
    `<h1 class="hero-title hero-title-flourish"><span class="hp-hero-kicker">${esc(c.kicker)}</span>${esc(c.artOf)}<em>${esc(c.fineTea)}</em>${esc(c.artOfAfter)}</h1>` +
    `<div class="hp-hero-rule"></div>` +
    `<p class="hero-sub">${esc(c.sub(o.teaCount))}</p>` +
    `<div class="hero-btns fade-up fade-up-d3">` +
    `<a class="btn btn-dark btn-lg" href="${href('/products')}" data-discover="true">${esc(c.shop)}</a>` +
    // Always shown; while gifts are off the app answers a click with "coming soon".
    `<a class="btn btn-outline btn-lg" href="${href('/gifts')}" data-discover="true">${esc(c.gift)}</a>` +
    `<a class="btn btn-gold btn-lg" href="${href('/pairings')}" data-discover="true">${esc(c.pairings)}</a>` +
    `</div>${trust}</div></section>`
  );
}
