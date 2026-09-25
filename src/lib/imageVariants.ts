/**
 * imageVariants.ts — generate responsive-image URLs from a base URL
 *
 * Tea images live in Firebase Storage. The Firebase "Resize Images"
 * extension (firebase-extensions/storage-resize-images) watches the
 * /teas bucket and, on every upload, generates resized + reformatted
 * variants alongside the original. Filename convention:
 *
 *   original:  teas/1714000000_assam.jpg
 *   variants:  teas/1714000000_assam_320x320.webp
 *              teas/1714000000_assam_640x640.webp
 *              teas/1714000000_assam_1280x1280.webp
 *              teas/1714000000_assam_640x640.avif
 *
 * The download URL Firebase serves is path-encoded:
 *   https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{ENCODED_PATH}?alt=media&token={uuid}
 *
 * To produce a variant URL we take the encoded path, swap the
 * extension for the variant suffix + format, and keep the query
 * (alt=media + token) intact — the tokens are bucket-level on
 * default config, so they apply to siblings too.
 *
 * Why this helper instead of building variants at app build time:
 *   • Tea images are uploaded by admin at runtime — they don't exist
 *     during `npm run build`, so a Sharp/vite-imagetools step can't
 *     reach them.
 *   • The extension runs once per upload as a background task. Cost
 *     per tea is a few cents over its lifetime; the runtime CDN
 *     savings dwarf that.
 *   • If the extension hasn't generated a variant yet (eventually-
 *     consistent — typically <5s after upload) the <picture> source
 *     404s and the browser falls back through to the next source.
 *     The original URL is always the last resort, so worst-case the
 *     user sees the original full-size image — same as before.
 *
 * If you're using a different image CDN (Cloudflare, Imgix, etc.)
 * point WIDTHS + the URL builder at it instead — the consumer
 * contract (`buildResponsiveSrcSet`) is stable.
 *
 * Setup checklist for the Firebase Resize Images extension is in
 * IMAGE_PIPELINE.md at the repo root.
 */

/** Widths we generate variants at. Three breakpoints cover most viewports:
 *    320 — phone (1× DPR) and phone-half (2× DPR)
 *    640 — phone (2× DPR), tablet, and desktop tea-card
 *    1280 — desktop hero, retina tablet, retina desktop tea-card
 *
 *  AVIF is generated at 640 only — single best-format entry below the
 *  WebP set. Modern browsers prefer AVIF but the size delta from 320
 *  to 640 is marginal at AVIF's compression and saving 320 doesn't
 *  buy much. */
export const VARIANT_WIDTHS = [320, 640, 1280] as const;
export const AVIF_WIDTH = 640;

/** Upper bound to prevent unbounded memory growth in long sessions. */
const MAX_VARIANT_CACHE_ENTRIES = 500;

// ---------------------------------------------------------------------------
// Internal memoization cache
// ---------------------------------------------------------------------------
// `getResponsiveImage` is called on every render for every <TeaImage> in a
// list. Re-computing URL string manipulation (regex, slice, join) on every
// call is wasteful. A plain Map keyed by the original src is sufficient — the
// number of distinct tea image URLs in a session is bounded and small (≤ a few
// hundred), so memory pressure is negligible.
//
// Call `clearVariantCache()` in tests or after a programmatic re-upload to
// ensure fresh URL construction.
const _variantCache = new Map<string, ResponsiveImage>();
const _variantFallbackEmitted = new Set<string>();

function setCache(src: string, value: ResponsiveImage): ResponsiveImage {
  // FIFO eviction: predictable and fast for this small cache.
  if (_variantCache.size >= MAX_VARIANT_CACHE_ENTRIES) {
    const first = _variantCache.keys().next();
    if (!first.done) _variantCache.delete(first.value);
  }
  _variantCache.set(src, value);
  return value;
}

function emitVariantFallback(src: string, reason: string): void {
  // Fire-and-forget instrumentation. Consumers can subscribe via:
  //   window.addEventListener('image:variant_fallback', ...)
  // Kept resilient and silent to avoid impacting rendering.
  if (typeof window === 'undefined') return;
  if (_variantFallbackEmitted.has(src)) return;
  _variantFallbackEmitted.add(src);

  try {
    window.dispatchEvent(
      new CustomEvent('image:variant_fallback', {
        detail: { src, reason, ts: Date.now() },
      }),
    );
  } catch (err) {
    console.warn('[imageVariants] Failed to emit fallback event:', err);
  }
}

function isFirebaseStorageUrl(src: string): boolean {
  // Fast path for the dominant case.
  if (!src.includes('firebasestorage.googleapis.com')) return false;

  // Defensive parse to avoid false positives from arbitrary strings.
  try {
    const u = new URL(src);
    return u.hostname === 'firebasestorage.googleapis.com';
  } catch (err) {
    console.warn('[imageVariants] Failed to parse storage URL:', err);
    return false;
  }
}

/**
 * Clear the internal `getResponsiveImage` memo cache.
 *
 * Useful in:
 *   - Vitest / Jest tests that need deterministic URL construction
 *   - Admin upload flows where a re-uploaded image replaces an old one
 *     (the token stays the same on default extension config but the
 *     variants are regenerated — clearing ensures the app re-derives
 *     the new URLs on next render)
 */
export function clearVariantCache(): void {
  _variantCache.clear();
  _variantFallbackEmitted.clear();
}

/** Lightweight diagnostics hook for observability/debug panels. */
export function getVariantCacheStats(): { size: number; maxEntries: number } {
  return {
    size: _variantCache.size,
    maxEntries: MAX_VARIANT_CACHE_ENTRIES,
  };
}

/** Result shape — what <picture> + <img> need. */
export interface ResponsiveImage {
  /** Original URL passed in. Used as the <img src=> fallback. */
  src:    string;
  /** AVIF candidate, single width, served via <source type="image/avif">. */
  avif?:  string;
  /** WebP srcSet at all widths, served via <source type="image/webp">. */
  webp?:  string;
  /** Width descriptor srcSet — one per width in VARIANT_WIDTHS. */
  srcSet?: string;
  /**
   * True when at least one variant URL was successfully constructed.
   * Consumers can use this as a quick gate before rendering a <picture>
   * vs. a plain <img>.
   */
  hasVariants: boolean;
}

/**
 * Build a variant URL from a Firebase Storage download URL by
 * inserting `_{width}x{width}` before the file extension and
 * (optionally) replacing the extension with a target format.
 *
 * Returns `null` when the URL doesn't look like a Firebase Storage
 * download URL — caller can fall back to the original src in that
 * case.
 */
function buildFirebaseVariantUrl(
  src: string,
  width: number,
  format?: 'webp' | 'avif',
): string | null {
  // Guard against accidental invalid width values.
  if (!Number.isInteger(width) || width <= 0) return null;

  // Quick gate: the helper only knows how to derive variants for
  // Firebase Storage URLs. Pass-through for anything else (CDN URLs,
  // mock data URLs, blob: URLs).
  if (!isFirebaseStorageUrl(src)) return null;

  // Firebase URL structure:
  //   .../o/{path-encoded%2Fwith%2Fslashes}?alt=media&token=...
  // Split at '?' so we can mutate the path without touching the query.
  const qIdx = src.indexOf('?');
  const path = qIdx >= 0 ? src.slice(0, qIdx) : src;
  const query = qIdx >= 0 ? src.slice(qIdx) : '';

  // Pull off the extension. Path is URL-encoded, so '.' is literal.
  // We accept jpg, jpeg, png, webp, avif as input formats; the
  // extension swaps in the target format if specified.
  const extMatch = path.match(/\.(jpe?g|png|webp|avif)$/i);
  if (!extMatch) return null;
  const ext = format ?? extMatch[1].toLowerCase();
  const stem = path.slice(0, path.length - extMatch[0].length);

  return `${stem}_${width}x${width}.${ext}${query}`;
}

/**
 * Compose a srcSet string at the given widths.
 *
 *   "url-320 320w, url-640 640w, url-1280 1280w"
 *
 * Returns null when no variant URLs can be built (e.g. non-Firebase
 * src, or a string that doesn't look like an image URL at all).
 */
function buildSrcSet(src: string, widths: readonly number[], format?: 'webp' | 'avif'): string | null {
  const parts: string[] = [];
  for (const w of widths) {
    const u = buildFirebaseVariantUrl(src, w, format);
    if (!u) return null;
    parts.push(`${u} ${w}w`);
  }
  return parts.join(', ');
}

/**
 * Top-level helper used by LazyImage / TeaImage.
 *
 * Returns the structured set of URLs needed for a `<picture>` element.
 * If the URL doesn't support variants (mock data, blob URL, third-
 * party host), only `src` is populated and the consumer renders a
 * plain `<img>` — same behavior as before the responsive refactor.
 *
 * Results are memoized for the lifetime of the page. Call
 * `clearVariantCache()` if you need to force re-derivation.
 */
export function getResponsiveImage(src: string): ResponsiveImage {
  // Empty / nullish src — pass through. LazyImage handles the
  // empty-src placeholder.
  if (!src) return { src: '', hasVariants: false };

  // Return cached result if available.
  const cached = _variantCache.get(src);
  if (cached) return cached;

  // Non-Firebase URLs: pass through. We don't try to fabricate
  // variant URLs we can't actually serve.
  const webp = buildSrcSet(src, VARIANT_WIDTHS, 'webp');
  if (!webp) {
    const isFirebase = isFirebaseStorageUrl(src);
    if (import.meta.env.DEV && isFirebase) {
      console.warn(
        '[imageVariants] Firebase URL detected but variant URLs could not be built. ' +
        'Check that the URL contains a recognised extension (jpg, jpeg, png, webp, avif).\n' +
        'URL:', src,
      );
    }
    if (isFirebase) emitVariantFallback(src, 'unsupported_extension_or_shape');
    const result = Object.freeze({ src, hasVariants: false }) as ResponsiveImage;
    return setCache(src, result);
  }

  const avif = buildFirebaseVariantUrl(src, AVIF_WIDTH, 'avif') ?? undefined;
  // Fallback srcSet uses the original format — covers the case where
  // the browser doesn't support webp/avif (vanishingly rare in 2026)
  // but the variants of the original format do exist.
  const srcSet = buildSrcSet(src, VARIANT_WIDTHS) ?? undefined;

  const result = Object.freeze({ src, avif, webp, srcSet, hasVariants: true }) as ResponsiveImage;
  return setCache(src, result);
}

/**
 * Convenience helper for consumers that only need a single variant URL
 * (e.g. Open Graph meta tags, email templates, server-rendered previews)
 * without the full `<picture>` srcSet machinery.
 *
 * Returns `null` when the URL isn't a supported Firebase Storage URL
 * or when variant construction fails — caller should fall back to the
 * original `src`.
 *
 * @example
 *   const og = buildVariantUrl(product.imageUrl, 640, 'webp') ?? product.imageUrl;
 */
export function buildVariantUrl(
  src: string,
  width: (typeof VARIANT_WIDTHS)[number] | typeof AVIF_WIDTH,
  format?: 'webp' | 'avif',
): string | null {
  return buildFirebaseVariantUrl(src, width, format);
}

/**
 * Standard `sizes` attribute presets for common layout contexts.
 * The browser uses `sizes` together with `srcSet` to pick the
 * best-matching source — wrong values here mean the browser
 * downloads the wrong size (too big = wasted bytes, too small =
 * blurry).
 *
 *   teaCard:    grid card. 1col mobile, 2col tablet, 3-4col desktop.
 *   teaHero:    full-bleed top of TeaProfilePage. ~50vw on desktop.
 *   teaThumb:   small inline thumbnails (cart, related teas).
 *   teaBundle:  gift-builder card. ~33vw on desktop.
 *   modal:      lightbox / image-zoom overlay. Up to 90vw / 80vh.
 *   fullBleed:  edge-to-edge section backgrounds and banners.
 */
export const SIZES = {
  teaCard:   '(min-width: 1024px) 280px, (min-width: 640px) 45vw, 90vw',
  teaHero:   '(min-width: 768px) 50vw, 100vw',
  teaThumb:  '120px',
  teaBundle: '(min-width: 768px) 33vw, 90vw',
  modal:     '(min-width: 1024px) 800px, 90vw',
  fullBleed: '100vw',
} as const;
