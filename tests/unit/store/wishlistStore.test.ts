/**
 * Phase 11.4 — wishlistStore unit tests.
 *
 * Locks in the contract: add/remove/toggle/has are idempotent and
 * dedupe by slug; share-token encoding round-trips losslessly through
 * URL-safe base64; malformed tokens return null (not throw).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useWishlist,
  encodeWishlistShareToken,
  parseWishlistShareToken,
} from '../../../src/store/wishlistStore';

const sample = (slug: string, name = `Tea ${slug}`) => ({
  slug,
  name,
  category: 'black',
  image: '/img.png',
  priceAtSave: 9.99,
});

describe('useWishlist store', () => {
  beforeEach(() => {
    // Reset between tests — Zustand stores are module-singletons.
    useWishlist.setState({ items: [] });
  });

  describe('back-in-stock (notify)', () => {
    it('accepts a tea with no photo yet', () => {
      useWishlist.getState().add({ ...sample('mango-mist'), image: '' });
      expect(useWishlist.getState().has('mango-mist')).toBe(true);
    });

    it('setNotify turns the request on and off for that slug only', () => {
      useWishlist.getState().add(sample('earl-grey'));
      useWishlist.getState().add(sample('assam'));
      useWishlist.getState().setNotify('earl-grey', true);
      const bySlug = (s: string) => useWishlist.getState().items.find((i) => i.slug === s);
      expect(bySlug('earl-grey')?.notify).toBe(true);
      expect(bySlug('assam')?.notify).toBeUndefined();
      useWishlist.getState().setNotify('earl-grey', false);
      expect(bySlug('earl-grey')?.notify).toBe(false);
    });

    it('setNotify on a slug not in the list is a no-op', () => {
      useWishlist.getState().setNotify('missing', true);
      expect(useWishlist.getState().items).toHaveLength(0);
    });
  });

  describe('add', () => {
    it('adds new slug to the front', () => {
      useWishlist.getState().add(sample('earl-grey'));
      expect(useWishlist.getState().items).toHaveLength(1);
      expect(useWishlist.getState().items[0].slug).toBe('earl-grey');
    });

    it('is idempotent — adding same slug twice does not duplicate', () => {
      useWishlist.getState().add(sample('earl-grey'));
      useWishlist.getState().add(sample('earl-grey'));
      expect(useWishlist.getState().items).toHaveLength(1);
    });

    it('preserves addedAt on duplicate add (no refresh)', () => {
      useWishlist.getState().add(sample('earl-grey'));
      const t1 = useWishlist.getState().items[0].addedAt;
      // Advance time so a refreshed timestamp would be detectable.
      const realNow = Date.now;
      Date.now = () => t1 + 60_000;
      useWishlist.getState().add(sample('earl-grey'));
      Date.now = realNow;
      expect(useWishlist.getState().items[0].addedAt).toBe(t1);
    });
  });

  describe('remove', () => {
    it('removes by slug', () => {
      useWishlist.getState().add(sample('earl-grey'));
      useWishlist.getState().add(sample('chai'));
      useWishlist.getState().remove('earl-grey');
      expect(useWishlist.getState().items.map((i) => i.slug)).toEqual(['chai']);
    });

    it('is idempotent — removing absent slug is a no-op', () => {
      useWishlist.getState().add(sample('earl-grey'));
      useWishlist.getState().remove('not-here');
      expect(useWishlist.getState().items).toHaveLength(1);
    });
  });

  describe('has', () => {
    it('true when present, false when absent', () => {
      expect(useWishlist.getState().has('earl-grey')).toBe(false);
      useWishlist.getState().add(sample('earl-grey'));
      expect(useWishlist.getState().has('earl-grey')).toBe(true);
    });
  });

  describe('toggle', () => {
    it('returns "added" then "removed" on alternating calls', () => {
      const t = useWishlist.getState();
      expect(t.toggle(sample('earl-grey'))).toBe('added');
      expect(t.toggle(sample('earl-grey'))).toBe('removed');
      expect(useWishlist.getState().has('earl-grey')).toBe(false);
    });
  });

  describe('clear', () => {
    it('drops everything', () => {
      useWishlist.getState().add(sample('earl-grey'));
      useWishlist.getState().add(sample('chai'));
      useWishlist.getState().clear();
      expect(useWishlist.getState().items).toHaveLength(0);
    });
  });

  describe('replaceAll', () => {
    it('overwrites the list', () => {
      useWishlist.getState().add(sample('earl-grey'));
      useWishlist.getState().replaceAll([
        { ...sample('chai'), addedAt: 1 },
        { ...sample('matcha'), addedAt: 2 },
      ]);
      expect(useWishlist.getState().items.map((i) => i.slug)).toEqual(['chai', 'matcha']);
    });
  });
});

describe('share-token codec', () => {
  it('round-trips a typical list', () => {
    const slugs = ['earl-grey', 'chai', 'matcha-latte'];
    const token = encodeWishlistShareToken(slugs);
    expect(parseWishlistShareToken(token)).toEqual(slugs);
  });

  it('round-trips an empty list', () => {
    expect(parseWishlistShareToken(encodeWishlistShareToken([]))).toEqual([]);
  });

  it('uses URL-safe characters only (no +, /, =)', () => {
    const token = encodeWishlistShareToken(['??', '???', '////']);
    expect(token).not.toMatch(/[+/=]/);
  });

  describe('parseWishlistShareToken on bad input', () => {
    it('returns null on empty', () => {
      expect(parseWishlistShareToken('')).toBe(null);
    });

    it('returns null on garbage', () => {
      expect(parseWishlistShareToken('!!!not-base64!!!')).toBe(null);
    });

    it('returns null when decoded payload is not an array of strings', () => {
      // Encoded JSON: {"foo": 1}
      const badToken = btoa('{"foo":1}').replace(/[+/=]/g, '');
      expect(parseWishlistShareToken(badToken)).toBe(null);
    });

    it('caps decoded slug list at 100 (defense against malicious tokens)', () => {
      const huge = Array.from({ length: 500 }, (_, i) => `s${i}`);
      const token = encodeWishlistShareToken(huge);
      const parsed = parseWishlistShareToken(token);
      expect(parsed).not.toBe(null);
      expect(parsed!.length).toBeLessThanOrEqual(100);
    });
  });
});
