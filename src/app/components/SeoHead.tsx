/**
 * SeoHead — complete SEO meta-tag + structured data component
 *
 * Features:
 * - Title, description, canonical, robots
 * - Full Open Graph (Facebook/WhatsApp/LinkedIn)
 * - Twitter Card
 * - JSON-LD: Product, BreadcrumbList, AggregateRating
 * - hreflang for EN/AR
 * - noIndex for private pages
 */
import { useLayoutEffect } from 'react';
import { SITE_BASE } from '@/lib/routes';
import { useSettings } from '@/hooks/useSettings';

// Static <head> tags from the HTML shell (index.html, or renderSeo's
// server-rendered copy) that SeoHead re-renders for each page. Captured at
// module load — before any SeoHead renders — and removed on first mount,
// so the page carries ONE title / description / canonical / OG set, not
// the shell's generic homepage copy alongside the page's own.
const SHELL_TAGS: Element[] = typeof document === 'undefined' ? [] : [
  ...document.head.querySelectorAll(
    'title, meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], link[rel="alternate"][hreflang]',
  ),
];
let shellTagsRemoved = false;

const SITE_NAME  = 'Ele Café';
const BASE_URL   = SITE_BASE;
// PNG, not SVG — Facebook / iMessage / Slack don't render SVG previews.
const DEFAULT_IMG = `${BASE_URL}/og-default.png`;
const BUSINESS_ID = `${BASE_URL}/#business`;

export interface BreadcrumbItem { name: string; url: string; }

export interface SeoHeadProps {
  title:            string;
  description:      string;
  image?:           string;
  url?:             string;
  type?:            'website' | 'product';
  noIndex?:         boolean;
  breadcrumbs?:     BreadcrumbItem[];
  /**
   * Optional page-specific JSON-LD blocks. Useful for route-specific
   * schemas (e.g. OfferCatalog on /gifts) without forking SeoHead.
   */
  extraJsonLd?:     Record<string, unknown> | Array<Record<string, unknown>>;
  // Product-specific (for tea profile pages)
  product?: {
    name:          string;
    description:   string;
    image:         string;
    price:         number;
    currency?:     string;
    inStock:       boolean;
    sku?:          string;
    brand?:        string;
    category?:     string;
    avgRating?:    number;   // 0–5
    reviewCount?:  number;
  };
}

export function SeoHead({
  title,
  description,
  image,
  url,
  type      = 'website',
  noIndex   = false,
  breadcrumbs,
  extraJsonLd,
  product,
}: SeoHeadProps) {
  useLayoutEffect(() => {
    if (shellTagsRemoved) return;
    shellTagsRemoved = true;
    for (const el of SHELL_TAGS) el.remove();
  }, []);
  const canonical = url ?? (typeof window !== 'undefined' ? window.location.href : BASE_URL);
  // Clamp on a word boundary (same rule as renderSeo's seoClamp) so the
  // snippet never ends mid-word.
  const safeDesc  = description.length <= 155
    ? description
    : description.slice(0, 154).replace(/\s+\S*$/, '') + '…';
  // Page image → admin's default share image (Settings → OG Image URL) → hosted PNG.
  const { ogImageUrl } = useSettings();
  const adminOg   = typeof ogImageUrl === 'string' && /^https:\/\/\S+$/.test(ogImageUrl.trim()) ? ogImageUrl.trim() : '';
  const ogImage   = image || adminOg || DEFAULT_IMG;

  // ── Build JSON-LD array ─────────────────────────────────────────────────
  const schemas: object[] = [];

  // BreadcrumbList
  if (breadcrumbs && breadcrumbs.length > 0) {
    schemas.push({
      '@context':      'https://schema.org',
      '@type':         'BreadcrumbList',
      itemListElement: breadcrumbs.map((b, i) => ({
        '@type':  'ListItem',
        position: i + 1,
        name:     b.name,
        item:     b.url,
      })),
    });
  }

  // Product schema with AggregateRating
  if (product) {
    /** Local type for the JSON-LD Product subset we emit. The
     *  optional aggregateRating field allows the conditional
     *  assignment below to type-check without an `any` cast. */
    type ProductSchema = {
      '@context':   string;
      '@type':      'Product';
      name:         string;
      description:  string;
      image:        string;
      sku:          string;
      brand:        Record<string, string>;
      category:     string;
      offers:       Record<string, unknown>;
      aggregateRating?: {
        '@type':     'AggregateRating';
        ratingValue: string;
        reviewCount: number;
        bestRating:  string;
        worstRating: string;
      };
    };
    const productSchema: ProductSchema = {
      '@context':   'https://schema.org',
      '@type':      'Product',
      name:         product.name,
      description:  product.description,
      image:        product.image,
      sku:          product.sku ?? product.name.toLowerCase().replace(/\s+/g, '-'),
      brand: {
        '@type': 'Brand',
        name:    product.brand ?? 'Ele Café',
        '@id':   BUSINESS_ID,
      },
      category:     product.category ?? 'Tea',
      offers: {
        '@type':          'Offer',
        '@id':            `${canonical}#offer`,
        priceCurrency:    product.currency ?? 'CAD',
        price:            product.price.toFixed(2),
        availability:     product.inStock
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        itemCondition:    'https://schema.org/NewCondition',
        seller: {
          '@type': 'Organization',
          name:    'Ele Café',
          '@id':   BUSINESS_ID,
        },
        shippingDetails: {
          '@type':              'OfferShippingDetails',
          shippingDestination: {
            '@type':          'DefinedRegion',
            addressCountry:   'CA',
          },
          doesNotShip: false,
        },
      },
    };

    // Add AggregateRating if product has reviews. avgRating is now
    // stored as a true average (0-5 per schema) so we can use it directly.
    // (Previously this re-multiplied by reviewCount and divided again,
    // which was a no-op masking a deeper bug in TeaProfilePage's writer.)
    if (product.avgRating && product.avgRating > 0 && product.reviewCount && product.reviewCount > 0) {
      productSchema.aggregateRating = {
        '@type':       'AggregateRating',
        ratingValue:   Math.min(5, Math.max(1, product.avgRating)).toFixed(1),
        reviewCount:   product.reviewCount,
        bestRating:    '5',
        worstRating:   '1',
      };
    }

    schemas.push(productSchema);
  }

  if (extraJsonLd) {
    if (Array.isArray(extraJsonLd)) schemas.push(...extraJsonLd);
    else schemas.push(extraJsonLd);
  }

  // Escape `</` to `<\/` so a malicious product field containing
  // "</script>" can't break out of the <script> tag. JSON parsers
  // accept `\/` as valid (it decodes to `/`), so search engines still
  // read the structured data correctly. Without this, an admin-written
  // string like "Best tea ever</script><script>alert(1)</script>"
  // would execute on every product page.
  const jsonLd = schemas.length > 0
    ? JSON.stringify(schemas.length === 1 ? schemas[0] : schemas)
        .replace(/<\/(script|style)/gi, '<\\/$1')
        .replace(/<!--/g, '<\\!--')
    : null;

  return (
    <>
      {/* ── Primary ────────────────────────────────────────────────────── */}
      <title>{title}</title>
      <meta name="description"   content={safeDesc} />
      <link rel="canonical"      href={canonical} />
      {noIndex
        ? <meta name="robots" content="noindex,nofollow" />
        : <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1" />
      }

      {/* ── hreflang ─────────────────────────────────────────────────────
           The app uses client-side language switching (EN/FR via Zustand
           store) — same URL serves different content. URL-based language
           routing isn't implemented yet, so we don't emit per-language
           hreflang URLs that would point crawlers at fake URLs. We do
           still emit `x-default` as a clean canonical-equivalent.
           When real /fr/* routes ship, restore the fr alternate. */}
      <link rel="alternate" hrefLang="x-default" href={canonical} />
      <link rel="alternate" hrefLang="en"        href={canonical} />

      {/* ── Open Graph ─────────────────────────────────────────────────── */}
      <meta property="og:site_name"    content={SITE_NAME} />
      <meta property="og:type"         content={type} />
      <meta property="og:locale"       content="en_CA" />
      <meta property="og:title"        content={title} />
      <meta property="og:description"  content={safeDesc} />
      <meta property="og:image"        content={ogImage} />
      {ogImage.endsWith('.svg') && (
        <meta property="og:image:type" content="image/svg+xml" />
      )}
      <meta property="og:image:alt"    content={title} />
      <meta property="og:url"          content={canonical} />

      {/* ── Twitter Card ───────────────────────────────────────────────── */}
      <meta name="twitter:card"        content="summary_large_image" />
      <meta name="twitter:title"       content={title} />
      <meta name="twitter:description" content={safeDesc} />
      <meta name="twitter:image"       content={ogImage} />
      <meta name="twitter:image:alt"   content={title} />

      {/* ── JSON-LD Structured Data ─────────────────────────────────────── */}
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
    </>
  );
}
