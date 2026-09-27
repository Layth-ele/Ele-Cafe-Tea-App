import { describe, test, expect } from 'vitest';
import { normalizeSlugFromUrl, stripSharedText } from '@/lib/slugify';

describe('links with shared text glued on', () => {
  test('keeps only the slug when a sentence follows', () => {
    expect(
      normalizeSlugFromUrl(
        'matcha-vegan-tart%20Earthy,%20creamy,%20and%20smooth%20%E2%80%94%20this%20tart',
      ),
    ).toBe('matcha-vegan-tart');
  });
  test('a hand-typed name with a space still slugifies whole', () => {
    expect(stripSharedText("monk's blend")).toBe("monk's blend");
    expect(normalizeSlugFromUrl("monk's%20blend")).toBe('monks-blend');
  });
});
