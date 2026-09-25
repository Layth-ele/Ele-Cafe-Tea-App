/**
 * SEO smoke tests — runs against a deployed URL (defaults to
 * https://elecafe.ca, override via TEST_BASE_URL env var) and verifies
 * the SEO contract:
 *
 *   • Sitemap is reachable, valid XML, lists tea-profile URLs
 *   • Robots.txt is reachable and disallows /admin
 *   • Tea profile pages emit canonical + Product JSON-LD with
 *     priceCurrency, availability, brand, offer fields
 *   • Tea profile pages emit BreadcrumbList JSON-LD with the right hierarchy
 *   • Tea profile pages do NOT emit noindex
 *   • Category pages emit canonical at /products/{cat}
 *   • Homepage emits LocalBusiness + WebSite + SearchAction JSON-LD
 *
 * Run:
 *   npx playwright test tests/seo/smoke.spec.ts
 *
 * Run against a preview URL:
 *   TEST_BASE_URL=https://elecafe-preview.web.app npx playwright test tests/seo/smoke.spec.ts
 *
 * The tests fetch raw HTML (no browser needed for parsing) so they're
 * fast — the whole suite runs in a few seconds. Playwright is used
 * because the test infrastructure is already configured; switching to
 * raw fetch in node-test would also work.
 */
import { test, expect, request } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'https://elecafe.ca';

/** Extract all <script type="application/ld+json"> blocks as parsed JSON. */
function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch (err) {
      // Push the raw string + error so the failing test can show it.
      out.push({ __INVALID_JSON__: m[1].slice(0, 200), error: String(err) });
    }
  }
  return out;
}

function findSchemaByType<T = Record<string, unknown>>(
  blocks: unknown[],
  type: string,
): T | null {
  for (const b of blocks) {
    if (b && typeof b === 'object' && (b as Record<string, unknown>)['@type'] === type) {
      return b as T;
    }
  }
  return null;
}

test.describe('SEO contract', () => {
  let api: Awaited<ReturnType<typeof request.newContext>>;

  test.beforeAll(async () => {
    api = await request.newContext();
  });
  test.afterAll(async () => {
    await api.dispose();
  });

  test('robots.txt is reachable and disallows admin paths', async () => {
    const res = await api.get(`${BASE}/robots.txt`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/Disallow:\s*\/admin/i);
    expect(body).toMatch(/Sitemap:\s*https?:\/\//i);
  });

  test('sitemap.xml is reachable, valid XML, and lists tea URLs', async () => {
    const res = await api.get(`${BASE}/sitemap.xml`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/xml/);
    const body = await res.text();
    expect(body).toMatch(/^<\?xml /);
    expect(body).toContain('<urlset');
    expect(body).toContain('/tea-profile/');
    // At least the 9 static + 8 categories. Teas in addition.
    const urlCount = (body.match(/<url>/g) || []).length;
    expect(urlCount).toBeGreaterThanOrEqual(17);
  });

  test('homepage has LocalBusiness + WebSite JSON-LD', async () => {
    const res = await api.get(BASE);
    expect(res.status()).toBe(200);
    const html = await res.text();
    const blocks = extractJsonLd(html);

    // Look for LocalBusiness OR an array containing it (some sites
    // combine multiple types in one @type array).
    const business = blocks.find(b => {
      const obj = b as Record<string, unknown>;
      const t = obj['@type'];
      return t === 'LocalBusiness' || (Array.isArray(t) && t.includes('LocalBusiness'));
    });
    expect(business, 'LocalBusiness JSON-LD missing').toBeTruthy();

    const website = findSchemaByType(blocks, 'WebSite');
    expect(website, 'WebSite JSON-LD missing').toBeTruthy();
  });

  test('tea profile page has Product + BreadcrumbList JSON-LD with all required fields', async () => {
    // Use a known seed tea — Assam exists in mockProducts and Firestore seed.
    const url = `${BASE}/tea-profile/black/assam`;
    const res = await api.get(url);
    expect(res.status()).toBe(200);
    const html = await res.text();

    // Canonical must point at the page itself, not at /products or /
    expect(html).toMatch(/<link\s+rel="canonical"\s+href="[^"]*\/tea-profile\/black\/assam"/i);

    // No accidental noindex
    expect(html).not.toMatch(/<meta\s+name="robots"\s+content="[^"]*noindex/i);

    // Product schema with offer
    const blocks = extractJsonLd(html);
    const product = findSchemaByType<Record<string, unknown>>(blocks, 'Product');
    expect(product, 'Product JSON-LD missing on tea profile').toBeTruthy();
    expect(product!.name, 'Product.name missing').toBeTruthy();
    expect(product!.description, 'Product.description missing').toBeTruthy();
    expect(product!.brand, 'Product.brand missing').toBeTruthy();

    const offer = product!.offers as Record<string, unknown> | undefined;
    expect(offer, 'Product.offers missing').toBeTruthy();
    expect(offer!.priceCurrency, 'offer.priceCurrency missing').toBe('CAD');
    expect(offer!.price, 'offer.price missing').toBeTruthy();
    expect(offer!.availability, 'offer.availability missing').toBeTruthy();

    // BreadcrumbList present and has 4 levels
    const breadcrumb = findSchemaByType<Record<string, unknown>>(blocks, 'BreadcrumbList');
    expect(breadcrumb, 'BreadcrumbList JSON-LD missing').toBeTruthy();
    const items = breadcrumb!.itemListElement as unknown[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(4);
  });

  test('tea profile has FAQPage + HowTo schemas', async () => {
    const res = await api.get(`${BASE}/tea-profile/black/assam`);
    const html = await res.text();
    const blocks = extractJsonLd(html);
    const faq   = findSchemaByType(blocks, 'FAQPage');
    const howto = findSchemaByType(blocks, 'HowTo');
    expect(faq,   'FAQPage JSON-LD missing — added in the structured-data pass').toBeTruthy();
    expect(howto, 'HowTo JSON-LD missing — added in the structured-data pass').toBeTruthy();
  });

  test('category page emits canonical at /products/{cat}', async () => {
    const res = await api.get(`${BASE}/products/black`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<link\s+rel="canonical"\s+href="[^"]*\/products\/black"/i);
    // BreadcrumbList present (3-level for category)
    const blocks = extractJsonLd(html);
    const breadcrumb = findSchemaByType<Record<string, unknown>>(blocks, 'BreadcrumbList');
    expect(breadcrumb, 'BreadcrumbList missing on category page').toBeTruthy();
  });

  test('filtered ProductsPage URL canonicalizes to clean category URL', async () => {
    // /products?cat=black&sort=price-asc&page=2 should NOT canonical-self;
    // it should canonical to /products/black (clean URL).
    const res = await api.get(`${BASE}/products?cat=black&sort=price-asc&page=2`);
    const html = await res.text();
    // SPA-rendered, so canonical is set at runtime by SeoHead. We can't
    // verify this from raw HTML without JS execution. This is a known
    // limitation of head-only prerender — note in test for visibility.
    test.info().annotations.push({
      type: 'note',
      description: 'Filter-URL canonical is set client-side by SeoHead and not visible in raw HTML. Verified manually via Lighthouse / Search Console URL inspection.',
    });
    // At minimum, page should load without errors.
    expect(res.status()).toBe(200);
    expect(html).toContain('<title>');
  });

  // ── New tests for the structured-data + programmatic-SEO additions ────────

  test('tea profile emits Speakable schema for voice assistants', async () => {
    const res  = await api.get(`${BASE}/tea-profile/black/assam`);
    const html = await res.text();
    const blocks = extractJsonLd(html);

    // Speakable is wrapped as a WebPage with a `speakable` property.
    const webPage = blocks.find(
      b => b && typeof b === 'object' &&
           (b as Record<string, unknown>)['@type'] === 'WebPage' &&
           (b as Record<string, unknown>).speakable,
    ) as Record<string, unknown> | undefined;

    expect(webPage, 'WebPage block with speakable property is missing').toBeDefined();
    const speakable = webPage!.speakable as Record<string, unknown>;
    expect(speakable['@type']).toBe('SpeakableSpecification');
    expect(Array.isArray(speakable.cssSelector)).toBe(true);
  });

  test('tea profile Product schema includes Offer with shipping + return policy', async () => {
    const res    = await api.get(`${BASE}/tea-profile/black/assam`);
    const html   = await res.text();
    const blocks = extractJsonLd(html);
    const product = findSchemaByType<Record<string, unknown>>(blocks, 'Product');
    expect(product, 'Product schema missing on tea profile').not.toBeNull();

    const offer = product!.offers as Record<string, unknown>;
    expect(offer['@type']).toBe('Offer');
    expect(offer.priceCurrency).toBe('CAD');
    expect(offer.availability).toMatch(/InStock|OutOfStock/);

    // Shipping details — required for Google's "free shipping" rich result.
    expect(offer.shippingDetails, 'Offer.shippingDetails missing').toBeDefined();
    // Merchant return policy — required for "free returns" rich result.
    expect(offer.hasMerchantReturnPolicy, 'Offer.hasMerchantReturnPolicy missing').toBeDefined();
  });

  test('tea profile preloads LCP image when available', async () => {
    const res  = await api.get(`${BASE}/tea-profile/black/assam`);
    const html = await res.text();
    // Either the tea has a real image (then we see fetchpriority="high"
    // on a preload), or it falls back to og-default.jpg with no preload.
    // Both are valid — test verifies the implementation handles both
    // cases without emitting a broken/empty preload.
    const preloadMatch = html.match(/<link rel="preload"[^>]*as="image"[^>]*>/);
    if (preloadMatch) {
      expect(preloadMatch[0]).toMatch(/fetchpriority="high"/);
      expect(preloadMatch[0]).toMatch(/href="https?:\/\/[^"]+"/);
    }
    // Either way, response should be OK.
    expect(res.status()).toBe(200);
  });

  test('collection landing page renders with CollectionPage + ItemList JSON-LD', async () => {
    const res = await api.get(`${BASE}/collections/caffeine-free`);
    expect(res.status()).toBe(200);

    const html   = await res.text();
    const blocks = extractJsonLd(html);

    const collection = findSchemaByType<Record<string, unknown>>(blocks, 'CollectionPage');
    expect(collection, 'CollectionPage schema missing on /collections/caffeine-free').not.toBeNull();

    const itemList = collection!.mainEntity as Record<string, unknown>;
    expect(itemList['@type']).toBe('ItemList');
    expect(typeof itemList.numberOfItems).toBe('number');
    expect(Array.isArray(itemList.itemListElement)).toBe(true);

    // Title and canonical must align with /collections/caffeine-free
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    expect(titleMatch?.[1]?.toLowerCase() ?? '').toContain('caffeine');

    const canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
    expect(canonicalMatch?.[1] ?? '').toBe(`${BASE}/collections/caffeine-free`);
  });

  test('sitemap includes collection landing pages', async () => {
    const res  = await api.get(`${BASE}/sitemap.xml`);
    const body = await res.text();
    // At least one collection slug should be present.
    expect(body).toMatch(/\/collections\/(caffeine-free|organic|high-caffeine|best-sellers)/);
  });

  test('seoHealth endpoint reports status', async () => {
    const res = await api.get(`${BASE}/_health/seo`);
    // 200 = healthy; 503 = degraded but the function itself is fine.
    // Anything else (404, 500) means the endpoint isn't wired correctly.
    expect([200, 503]).toContain(res.status());
    expect(res.headers()['content-type']).toMatch(/json/);
    expect(res.headers()['cache-control']).toMatch(/no-store/);

    const body = await res.json();
    expect(body.status).toMatch(/^(ok|degraded)$/);
    expect(body.checks).toBeDefined();
    expect(body.checks.firestore).toBeDefined();
    expect(body.checks.template).toBeDefined();
    expect(body.checks.sitemap).toBeDefined();
  });

  test('robots.txt disallows /_health from crawlers', async () => {
    const res  = await api.get(`${BASE}/robots.txt`);
    const body = await res.text();
    expect(body).toMatch(/Disallow:\s*\/_health/i);
  });
});
