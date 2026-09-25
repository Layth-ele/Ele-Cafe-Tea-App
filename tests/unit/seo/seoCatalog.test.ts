/**
 * seoCatalog — category + collection landing-page rules shared by the
 * storefront (/collections/:slug, category intros) and renderSeo/getSitemap.
 * A rule change here changes which teas Google sees on each landing page.
 */
import { describe, test, expect } from 'vitest';
import { CATEGORY_SEO, SEO_COLLECTIONS, SEO_COLLECTION_BY_SLUG } from '../../../functions/src/lib/seoCatalog';
import { categories } from '@/data/categories';
import { TEA_GUIDE } from '@/data/teaGuide';

const match = (slug: string, tea: Parameters<(typeof SEO_COLLECTIONS)[number]['match']>[0]) =>
  SEO_COLLECTION_BY_SLUG[slug].match(tea);

describe('CATEGORY_SEO', () => {
  test('every storefront category has EN + FR landing copy', () => {
    for (const c of categories) {
      const seo = CATEGORY_SEO[c.id];
      expect(seo, c.id).toBeDefined();
      expect(seo.intro.length).toBeGreaterThan(120);
      expect(seo.introFr.length).toBeGreaterThan(120);
      expect(seo.label).toBe(c.name);
    }
  });

  test('every category has a brewing-guide entry', () => {
    expect(new Set(TEA_GUIDE.map(g => g.id))).toEqual(new Set(categories.map(c => c.id)));
  });

  test('powder copy targets matcha + hojicha searches', () => {
    expect(CATEGORY_SEO.powder.intro).toMatch(/matcha powder/i);
    expect(CATEGORY_SEO.powder.intro).toMatch(/hojicha/i);
  });
});

describe('SEO_COLLECTIONS', () => {
  test('slugs are unique, URL-safe and fully translated', () => {
    const slugs = SEO_COLLECTIONS.map(c => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of SEO_COLLECTIONS) {
      expect(c.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(c.titleFr).toBeTruthy();
      expect(c.descriptionFr).toBeTruthy();
    }
  });

  test('keeps the original four indexed collection URLs', () => {
    for (const slug of ['caffeine-free', 'organic', 'high-caffeine', 'best-sellers']) {
      expect(SEO_COLLECTION_BY_SLUG[slug]).toBeDefined();
    }
  });

  test('membership rules', () => {
    expect(match('caffeine-free', { category: 'herbal', caffeine: 'None' })).toBe(true);
    expect(match('caffeine-free', { category: 'rooibos' })).toBe(true);
    expect(match('caffeine-free', { category: 'black', caffeine: 'High' })).toBe(false);

    expect(match('organic', { isOrganic: true })).toBe(true);
    expect(match('organic', { isOrganic: false })).toBe(false);

    expect(match('high-caffeine', { category: 'black' })).toBe(true);
    expect(match('high-caffeine', { category: 'green', caffeine: 'Medium' })).toBe(false);

    expect(match('best-sellers', { ratingCount: 5 })).toBe(true);
    expect(match('best-sellers', { ratingCount: 4 })).toBe(false);

    expect(match('matcha-powder', { category: 'powder', name: 'Hojicha Powder' })).toBe(true);
    expect(match('matcha-powder', { category: 'green', name: 'Matcha Genmaicha' })).toBe(true);
    expect(match('matcha-powder', { category: 'green', name: 'Sencha' })).toBe(false);

    expect(match('japanese-tea', { name: 'Sencha' })).toBe(true);
    expect(match('japanese-tea', { name: 'Jasmine Pearls', origin: 'Fujian, China' })).toBe(false);
    expect(match('japanese-tea', { name: 'Kabuse', origin: 'Shizuoka, Japan' })).toBe(true);

    expect(match('iced-tea', { category: 'fruit', name: 'Berry Blast' })).toBe(true);
    expect(match('iced-tea', { category: 'herbal', name: 'Hibiscus Cooler' })).toBe(true);
    expect(match('iced-tea', { category: 'black', name: 'Assam' })).toBe(false);

    expect(match('chai-tea', { name: 'Masala Chai' })).toBe(true);
    expect(match('chai-tea', { name: 'Chaitanya Oolong' })).toBe(false);
  });
});

describe('serving-suggestion collections', () => {
  const on  = (label: string) => ({ label, enabled: true });
  const off = (label: string) => ({ label, enabled: false });
  test('milk-tea and tea-latte follow Admin → Products serving suggestions', () => {
    expect(match('milk-tea', { servingSuggestions: [on('Milk Tea')] })).toBe(true);
    expect(match('milk-tea', { servingSuggestions: [off('Milk Tea')] })).toBe(false);
    expect(match('milk-tea', { servingSuggestions: ['milk tea'] })).toBe(true);
    expect(match('tea-latte', { servingSuggestions: [on('Tea Latte')] })).toBe(true);
    expect(match('tea-latte', { servingSuggestions: [on('Iced Tea')] })).toBe(false);
    expect(match('tea-latte', { category: 'powder' })).toBe(true);
  });
});
