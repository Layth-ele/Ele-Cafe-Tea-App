import { test, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'https://elecafe.ca';

test.describe('Gifts SEO (hydrated head)', () => {
  test('gifts page exposes canonical + OfferCatalog JSON-LD after hydration', async ({ page }) => {
    await page.goto(`${BASE}/gifts`, { waitUntil: 'networkidle' });

    await expect(page).toHaveTitle(/Build a Tea Gift Bundle/i);

    const canonicalHref = await page
      .locator('head link[rel="canonical"]')
      .first()
      .getAttribute('href');
    expect(canonicalHref).toBe(`${BASE}/gifts`);

    const jsonLdBlocks = await page.$$eval(
      'script[type="application/ld+json"]',
      (nodes) => nodes
        .map((n) => n.textContent || '')
        .filter(Boolean)
        .map((txt) => {
          try {
            return JSON.parse(txt);
          } catch {
            return null;
          }
        })
        .filter(Boolean),
    );

    const flattened = jsonLdBlocks.flatMap((b) => Array.isArray(b) ? b : [b]) as Array<Record<string, unknown>>;

    const offerCatalogPage = flattened.find((b) =>
      b['@type'] === 'WebPage'
      && typeof b.mainEntity === 'object'
      && (b.mainEntity as Record<string, unknown>)['@type'] === 'OfferCatalog',
    ) as Record<string, unknown> | undefined;

    expect(offerCatalogPage, 'WebPage with OfferCatalog mainEntity missing on /gifts').toBeTruthy();

    const offerCatalog = offerCatalogPage!.mainEntity as Record<string, unknown>;
    const offers = (offerCatalog.itemListElement as Array<Record<string, unknown>>) ?? [];
    expect(offers.length).toBeGreaterThanOrEqual(4);
    for (const offer of offers) {
      expect(offer['@type']).toBe('Offer');
      expect(offer.priceCurrency).toBe('CAD');
      expect(String(offer.url || '')).toContain('/gifts#');
    }
  });
});
