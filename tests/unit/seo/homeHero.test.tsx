import { describe, test, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { HomeHero } from '@/app/components/home/HomeHero';
import { homeHeroHtml, type HeroLang } from '../../../functions/src/lib/homeHero';

// renderSeo paints this hero before the JavaScript loads; React must swap
// in byte-identical markup or the page shifts / flickers.
const cases: Array<{
  lang: HeroLang;
  teaCount: number;
  giftOn: boolean;
  street: string;
  mapsUrl: string;
}> = [
  {
    lang: 'en',
    teaCount: 77,
    giftOn: false,
    street: '895 West Broadway',
    mapsUrl: 'https://maps.google.com/?q=Ele+Cafe',
  },
  { lang: 'en', teaCount: 0, giftOn: true, street: '895 West Broadway', mapsUrl: '' },
  {
    lang: 'fr',
    teaCount: 78,
    giftOn: true,
    street: '895 West Broadway',
    mapsUrl: 'https://maps.google.com/?q=a&b',
  },
  { lang: 'fr', teaCount: 5, giftOn: false, street: '', mapsUrl: '' },
];

describe('home hero: server HTML matches the React component', () => {
  for (const c of cases) {
    test(`${c.lang} count=${c.teaCount} gift=${c.giftOn} street=${!!c.street}`, () => {
      const react = renderToStaticMarkup(
        createElement(MemoryRouter, null, createElement(HomeHero, c)),
      );
      expect(homeHeroHtml({ ...c, base: '' })).toBe(react);
    });
  }
});
