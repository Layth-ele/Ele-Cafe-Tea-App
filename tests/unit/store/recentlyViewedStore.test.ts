/**
 * Phase 11.1 — recentlyViewedStore unit tests.
 *
 * The store's value depends on three invariants:
 *   1. Dedupes by slug (recording the same tea twice → list still has 1 entry)
 *   2. Caps at 10 (the 11th view evicts the oldest)
 *   3. Newest-first ordering (the most recently recorded sits at index 0)
 *
 * If any of these regress, the home page's "Pick up where you left
 * off" surface mislabels what the user did, which is the worst kind
 * of personalization (wrong-confident).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useRecentlyViewed } from '../../../src/store/recentlyViewedStore';

const sample = (slug: string) => ({
  slug,
  name: `Tea ${slug}`,
  category: 'black',
  image: '/img.png',
  priceAtView: 9.99,
});

describe('useRecentlyViewed store', () => {
  beforeEach(() => {
    useRecentlyViewed.setState({ entries: [] });
  });

  it('records a single view', () => {
    useRecentlyViewed.getState().record(sample('earl-grey'));
    expect(useRecentlyViewed.getState().entries).toHaveLength(1);
    expect(useRecentlyViewed.getState().entries[0].slug).toBe('earl-grey');
    expect(useRecentlyViewed.getState().entries[0].viewedAt).toBeTypeOf('number');
  });

  it('dedupes by slug, moves repeat view to the front', () => {
    useRecentlyViewed.getState().record(sample('a'));
    useRecentlyViewed.getState().record(sample('b'));
    useRecentlyViewed.getState().record(sample('a'));    // re-view 'a'
    const slugs = useRecentlyViewed.getState().entries.map((e) => e.slug);
    expect(slugs).toEqual(['a', 'b']);
    // Newest-first after re-view:
    expect(slugs[0]).toBe('a');
  });

  it('caps at 10 entries — 11th evicts the oldest', () => {
    for (let i = 0; i < 11; i++) {
      useRecentlyViewed.getState().record(sample(`tea-${i}`));
    }
    const entries = useRecentlyViewed.getState().entries;
    expect(entries).toHaveLength(10);
    // Oldest (tea-0) should be gone; newest (tea-10) at the front.
    expect(entries[0].slug).toBe('tea-10');
    expect(entries.find((e) => e.slug === 'tea-0')).toBeUndefined();
  });

  it('clear empties the store', () => {
    useRecentlyViewed.getState().record(sample('a'));
    useRecentlyViewed.getState().clear();
    expect(useRecentlyViewed.getState().entries).toHaveLength(0);
  });
});
