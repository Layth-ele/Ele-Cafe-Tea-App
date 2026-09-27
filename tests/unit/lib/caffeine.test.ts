import { describe, test, expect } from 'vitest';
import { caffeineTotal, CAFFEINE_LIMITS } from '../../../functions/src/lib/caffeine';
import { readStoreContent } from '../../../functions/src/lib/storeContent';

describe('tea caffeine calculator', () => {
  test('adds the typical range per serving', () => {
    expect(caffeineTotal({ black: 2, green: 1 })).toEqual({ min: 100, max: 185 });
    expect(caffeineTotal({ rooibos: 3 })).toEqual({ min: 0, max: 0 });
    expect(caffeineTotal({ black: -1, unknown: 5 })).toEqual({ min: 0, max: 0 });
  });
  test('Health Canada limits', () => {
    expect(CAFFEINE_LIMITS.map((l) => l.mg)).toEqual([400, 300]);
  });
});

describe('profile links (sameAs)', () => {
  test('one per line, https only, no duplicates', () => {
    const s = readStoreContent({
      socialInstagram: 'https://www.instagram.com/elecafe_',
      socialProfiles:
        'https://www.yelp.ca/biz/ele-cafe\n\nnot a url\nhttps://www.yelp.ca/biz/ele-cafe\nhttps://g.page/r/abc',
    });
    expect(s.sameAs).toEqual(
      expect.arrayContaining(['https://www.yelp.ca/biz/ele-cafe', 'https://g.page/r/abc']),
    );
    expect(s.sameAs.filter((u) => u.includes('yelp')).length).toBe(1);
    expect(s.sameAs.some((u) => u.includes('not'))).toBe(false);
  });
});
