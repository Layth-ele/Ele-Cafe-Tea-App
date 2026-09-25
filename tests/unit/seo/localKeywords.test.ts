/**
 * Local keyword map — every `via: 'copy'` term in LOCAL_KEYWORDS must be
 * covered by its target page's own copy, so an edit that drops a keyword
 * from a landing page fails CI instead of silently losing rankings.
 * Matching is word-based and accent/case/plural-insensitive (how search
 * engines match), not exact-phrase.
 */
import { describe, test, expect } from 'vitest';
import {
  LOCAL_KEYWORDS, CAFE_TITLE, CAFE_DESCRIPTION, CAFE_DRINKS, PAIRINGS_TITLE, PAIRINGS_DESCRIPTION,
  cafeIntro, buildCafeFaq,
} from '../../../functions/src/lib/cafeMenu';
import { SEO_COLLECTION_BY_SLUG } from '../../../functions/src/lib/seoCatalog';
import { HOME_TITLE, buildHomeFaq, homeDescription, readStoreContent } from '../../../functions/src/lib/storeContent';

const store = readStoreContent({ storeAddress: '895 West Broadway, Vancouver, BC V5Z 1J9' });

function pageCopy(page: string): string {
  if (page === '/cafe') {
    return [CAFE_TITLE, CAFE_DESCRIPTION, cafeIntro(store),
      ...CAFE_DRINKS.flatMap(d => [d.name, d.description]),
      ...buildCafeFaq(store).flatMap(f => [f.q, f.a])].join(' ');
  }
  if (page === '/pairings') return `${PAIRINGS_TITLE} ${PAIRINGS_DESCRIPTION}`;
  if (page === '/') {
    return [HOME_TITLE, homeDescription(75, store), ...buildHomeFaq(store).flatMap(f => [f.q, f.a])].join(' ');
  }
  const coll = page.match(/^\/collections\/(.+)$/);
  if (coll) {
    const def = SEO_COLLECTION_BY_SLUG[coll[1]];
    return def ? `${def.title} ${def.description}` : '';
  }
  return '';
}

// Accent/case/plural-insensitive like search engines: "croissants" covers "croissant".
const words = (s: string) => (s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? [])
  .map(w => (w.length > 3 ? w.replace(/s$/, '') : w));

describe('LOCAL_KEYWORDS', () => {
  test('lists 25 unique keywords', () => {
    expect(LOCAL_KEYWORDS).toHaveLength(25);
    expect(new Set(LOCAL_KEYWORDS.map(k => k.keyword.toLowerCase())).size).toBe(25);
  });

  test.each(LOCAL_KEYWORDS.filter(k => k.via === 'copy'))('"$keyword" is covered by $page', ({ keyword, page }) => {
    const copy = new Set(words(pageCopy(page)));
    expect(copy.size, `no copy found for ${page}`).toBeGreaterThan(0);
    const missing = words(keyword).filter(w => !copy.has(w));
    expect(missing, `${page} is missing: ${missing.join(', ')}`).toEqual([]);
  });
});
