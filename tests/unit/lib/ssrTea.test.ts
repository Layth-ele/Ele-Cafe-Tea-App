import { describe, test, expect, beforeEach, vi } from 'vitest';

// The tea renderSeo embeds (epoch-ms timestamps, nulls) must parse into a
// Product, so Google sees real stock/price instead of the mock fallback.
describe('ssrProduct', () => {
  beforeEach(() => {
    vi.resetModules();
    const payload = {
      slug: 'assam',
      tea: {
        id: 'assam',
        slug: 'assam',
        name: 'Assam',
        category: 'black',
        price: 18,
        isActive: true,
        available: true,
        availabilityLabel: 'in_stock',
        createdAt: 1776361475637,
        updatedAt: 1776361475637,
        nameAr: null,
        blurhash: null,
      },
      reviews: [
        { id: 'u1', userName: 'Sam', rating: 5, comment: 'Great', createdAt: 1776361475637 },
      ],
    };
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) =>
        id === 'ele-ssr-tea' ? { textContent: JSON.stringify(payload) } : null,
    };
  });

  test('parses the embedded tea and reviews for the matching slug only', async () => {
    const { ssrProduct } = await import('@/lib/firebaseQueries');
    const { ssrReviews } = await import('@/lib/ssrTea');
    const p = ssrProduct('assam');
    expect(p?.name).toBe('Assam');
    expect(p?.available).toBe(true);
    expect(ssrProduct('earl-grey')).toBeNull();
    expect(ssrReviews('assam')).toHaveLength(1);
  });
});
