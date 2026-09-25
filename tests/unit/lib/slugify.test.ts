/**
 * Tests for the shared slug normalizer.
 *
 * Regression guard for the URL-robustness fix (Phase 11): visitors
 * who type or share `/tea-profile/black/monk's-blend` must reach the
 * same tea as the canonical `/tea-profile/black/monks-blend`.
 */
import { describe, it, expect } from 'vitest';
import { toSlug, isCanonicalSlug, normalizeSlugFromUrl } from '../../../src/lib/slugify';

describe('toSlug', () => {
  it('strips apostrophes (the reported bug)', () => {
    expect(toSlug("Monk's Blend")).toBe('monks-blend');
    expect(toSlug("Devil's Tea")).toBe('devils-tea');
  });

  it('collapses spaces and punctuation into single dashes', () => {
    expect(toSlug('Earl Grey (Bold)')).toBe('earl-grey-bold');
    expect(toSlug('Tea & Cookies')).toBe('tea-cookies');
    expect(toSlug('Lapsang  Souchong')).toBe('lapsang-souchong');
  });

  it('trims leading and trailing dashes', () => {
    expect(toSlug('  Earl Grey  ')).toBe('earl-grey');
    expect(toSlug('!!Mint!!')).toBe('mint');
  });

  it('lowercases', () => {
    expect(toSlug('ENGLISH BREAKFAST')).toBe('english-breakfast');
    expect(toSlug('Pu-Erh')).toBe('pu-erh');
  });

  it('handles already-canonical input idempotently', () => {
    expect(toSlug('monks-blend')).toBe('monks-blend');
    expect(toSlug('english-breakfast')).toBe('english-breakfast');
  });

  it('drops accented characters (current behavior; documented)', () => {
    expect(toSlug('Café au Lait')).toBe('caf-au-lait');
    expect(toSlug('Naïve Tea')).toBe('na-ve-tea');
  });

  it('returns empty string for empty input', () => {
    expect(toSlug('')).toBe('');
    expect(toSlug('   ')).toBe('');
    expect(toSlug('!!!')).toBe('');
  });

  it('handles numbers in names', () => {
    expect(toSlug('Tea #1')).toBe('tea-1');
    expect(toSlug('Year 2026 Blend')).toBe('year-2026-blend');
  });
});

describe('isCanonicalSlug', () => {
  it('returns true for canonical slugs', () => {
    expect(isCanonicalSlug('monks-blend')).toBe(true);
    expect(isCanonicalSlug('english-breakfast')).toBe(true);
    expect(isCanonicalSlug('tea-2026')).toBe(true);
  });

  it('returns false for slugs with apostrophes', () => {
    expect(isCanonicalSlug("monk's-blend")).toBe(false);
  });

  it('returns false for slugs with uppercase', () => {
    expect(isCanonicalSlug('Monks-Blend')).toBe(false);
  });

  it('returns false for slugs with spaces', () => {
    expect(isCanonicalSlug('monks blend')).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(isCanonicalSlug('')).toBe(false);
  });
});

describe('normalizeSlugFromUrl', () => {
  it('normalizes apostrophe URLs to canonical', () => {
    expect(normalizeSlugFromUrl("monk's-blend")).toBe('monks-blend');
  });

  it('handles percent-encoded apostrophes', () => {
    expect(normalizeSlugFromUrl('monk%27s-blend')).toBe('monks-blend');
  });

  it('handles already-canonical URL slugs', () => {
    expect(normalizeSlugFromUrl('monks-blend')).toBe('monks-blend');
  });

  it('does not crash on malformed percent sequences', () => {
    // %ZZ is invalid; should fall back to treating as literal.
    expect(() => normalizeSlugFromUrl('monk%ZZs-blend')).not.toThrow();
  });

  it('handles spaces (URL-encoded as %20)', () => {
    expect(normalizeSlugFromUrl('earl%20grey')).toBe('earl-grey');
  });
});
