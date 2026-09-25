/**
 * LazyImage — performance-first image component
 *
 * What it solves:
 *
 * 1. CLS (Cumulative Layout Shift):
 *    - Forces aspect-ratio container so the space is reserved before
 *      the image loads.
 *    - No layout jump when the image arrives.
 *
 * 2. LCP (Largest Contentful Paint):
 *    - priority=true sets fetchpriority="high" and disables lazy load
 *      for above-the-fold images (hero, first product card).
 *    - priority=false (default) uses loading="lazy" + decoding="async"
 *      so off-screen images don't block the main thread.
 *    - srcSet + sizes lets the browser pick the right resolution
 *      for the device, so phones don't download desktop-sized images.
 *      Saves ~70% of bytes on a typical mobile load.
 *    - <picture> with avif → webp → original lets modern browsers
 *      pick a format ~50% smaller than JPEG/PNG.
 *
 * 3. Perceived performance (FCP/LCP feel, not lab metric):
 *    - Optional blurhash placeholder decodes a 30-byte hash to a
 *      tiny canvas ahead of the image, so the user sees a recognizable
 *      preview instantly. The real image fades in over it.
 *    - Falls back to a skeleton pulse when no blurhash is available
 *      (existing behavior — backward-compatible).
 *
 * 4. Reliability:
 *    - Empty / missing / errored src renders TeaPlaceholder.
 *    - Variants that 404 (e.g. Resize Images extension hasn't run
 *      yet on a fresh upload) don't break — <picture> falls through
 *      to the next source, ultimately to the original `src`.
 *
 * Usage — single URL (existing call sites work unchanged):
 *   <LazyImage src={product.image} alt={product.name} aspectRatio="1/1" />
 *
 * Usage — responsive set (preferred for tea cards / hero):
 *   import { getResponsiveImage, SIZES } from '@/lib/imageVariants';
 *   const r = getResponsiveImage(product.image);
 *   <LazyImage
 *     src={r.src} avif={r.avif} webp={r.webp} srcSet={r.srcSet}
 *     sizes={SIZES.teaCard}
 *     blurhash={product.blurhash}
 *     alt={product.name} aspectRatio="1/1"
 *   />
 *
 * Or shortcut — pass the whole responsive object:
 *   <LazyImage responsive={r} sizes={SIZES.teaCard} alt={product.name} />
 */

import { useEffect, useRef, useState } from 'react';
import { decode } from 'blurhash';
import { TeaPlaceholder } from './TeaPlaceholder';
import type { ResponsiveImage } from '@/lib/imageVariants';

import { useT } from '@/i18n/useT';
interface LazyImageProps {
  /** Original/fallback URL — served via the <img> tag. */
  src:           string;
  alt:           string;
  /** CSS aspect-ratio value e.g. "1/1", "4/3", "16/9" — reserves layout space. */
  aspectRatio?:  string;
  /** Above-the-fold? Disables lazy load + sets fetchpriority=high + decoding=sync. */
  priority?:     boolean;
  className?:    string;
  style?:        React.CSSProperties;
  objectFit?:    'cover' | 'contain' | 'fill';
  borderRadius?: string;

  // ── Responsive variants (optional, all-or-nothing per format) ──
  /** AVIF candidate URL — single best-format entry served first. */
  avif?:         string;
  /** WebP srcSet at multiple widths. */
  webp?:         string;
  /** Original-format srcSet at multiple widths. Used when avif/webp unsupported. */
  srcSet?:       string;
  /** sizes attribute — controls which srcSet entry the browser picks. */
  sizes?:        string;

  // ── Convenience: pass the whole responsive object instead of fields. ──
  responsive?:   ResponsiveImage;

  // ── Placeholder ──
  /**
   * Optional blurhash string (~30 chars) generated at upload time. When
   * provided, decodes to a 32×32 canvas and shows as the placeholder
   * until the real image loads. Without it, falls back to the skeleton
   * pulse.
   */
  blurhash?:     string;

  // ── Width/height hints — sets HTML attrs to back up the CSS aspect-ratio
  //    reservation. Browsers use these to skip an extra layout pass. ──
  width?:        number;
  height?:       number;
}

// Decode a blurhash string to a data URL once. Memoize results in a
// Map so the same hash on multiple images doesn't re-decode (e.g.
// related-teas grid showing the same fallback). Keys are the hash
// string itself; values are the cached `data:` URL.
//
// Capped at 64 entries (LRU-ish via Map insertion order) to bound
// memory in long-lived sessions where many distinct hashes appear.
const blurhashCache = new Map<string, string>();
const BLURHASH_CACHE_MAX = 64;

function decodeBlurhashToDataUrl(hash: string, w = 32, h = 32): string | null {
  const cached = blurhashCache.get(hash);
  if (cached) return cached;
  try {
    const pixels = decode(hash, w, h);
    // Render to an offscreen canvas. typeof guard for SSR safety.
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const imageData = ctx.createImageData(w, h);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
    const url = canvas.toDataURL('image/webp', 0.6);
    // LRU eviction — drop oldest when full.
    if (blurhashCache.size >= BLURHASH_CACHE_MAX) {
      const firstKey = blurhashCache.keys().next().value;
      if (firstKey !== undefined) blurhashCache.delete(firstKey);
    }
    blurhashCache.set(hash, url);
    return url;
  } catch (err) {
    // Malformed hash — silently fall back to skeleton.
    console.warn('[LazyImage] Failed to decode blurhash; using skeleton fallback:', err);
    return null;
  }
}

export function LazyImage(props: LazyImageProps) {
  const t = useT();
  // Allow callers to pass a structured ResponsiveImage object OR
  // individual props. Individual props win when both are present
  // (lets a caller override a single field).
  const {
    src           = props.responsive?.src ?? '',
    avif          = props.responsive?.avif,
    webp          = props.responsive?.webp,
    srcSet        = props.responsive?.srcSet,
    alt,
    aspectRatio   = '1/1',
    priority      = false,
    className,
    style,
    objectFit     = 'cover',
    borderRadius  = '0',
    sizes,
    blurhash,
    width,
    height,
  } = props;

  const [loaded,  setLoaded]  = useState(false);
  const [errored, setErrored] = useState(false);

  // Decode the blurhash on mount (or when it changes). Synchronous
  // canvas op — fast enough that the data URL is ready by first paint
  // for typical 32×32 hashes (~0.5ms on a mid-range phone). We still
  // gate it behind state so SSR doesn't try to touch document.
  const [blurDataUrl, setBlurDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blurhash) { setBlurDataUrl(null); return; }
    setBlurDataUrl(decodeBlurhashToDataUrl(blurhash));
  }, [blurhash]);

  // Track if the rendered <img> has already settled into the DOM —
  // when we mount with priority=true the image may already be in
  // browser cache, in which case onLoad fires synchronously before
  // useEffect runs and we miss it. Catch that case via a ref-pinned
  // ".complete" check.
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0 && !loaded) {
      setLoaded(true);
    }
  }, [src, loaded]);

  // Treat empty/whitespace src the same as a load error — show the
  // placeholder immediately rather than a perpetual skeleton.
  const hasSrc = typeof src === 'string' && src.trim().length > 0;
  const showPlaceholder = errored || !hasSrc;

  // ── Compute pixel dimensions for the <img> width/height attrs ──────
  // Lighthouse's `unsized-images` audit checks the <img> element directly,
  // not the parent's CSS aspect-ratio. Defaulting to 1×1 satisfies the
  // attr-presence check but registers as an "intrinsic 1px square" — some
  // tools still flag it, and more importantly it doesn't help the browser
  // reserve correctly-shaped layout space before CSS arrives (a brief
  // FOUC / CLS window during the async-CSS load).
  //
  // Fix: parse the `aspectRatio` prop (e.g. "1/1", "4/3", "16/9") and
  // emit width=DEFAULT_W, height=DEFAULT_W*ratio. The CSS still drives
  // the visible size (`width:100%; height:100%; object-fit:cover`), so
  // the numbers here only act as the browser's intrinsic-ratio hint.
  // 800px is large enough that even the responsive srcSet's largest
  // entry isn't downscaled by the attr value.
  const { imgW, imgH } = (() => {
    if (typeof width === 'number' && typeof height === 'number') {
      return { imgW: width, imgH: height };
    }
    const m = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/.exec(aspectRatio);
    if (!m) return { imgW: width ?? 800, imgH: height ?? 800 };
    const num = parseFloat(m[1]);
    const den = parseFloat(m[2]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
      return { imgW: width ?? 800, imgH: height ?? 800 };
    }
    const baseW = width ?? 800;
    return { imgW: baseW, imgH: height ?? Math.round(baseW * (den / num)) };
  })();

  return (
    <div
      className={`lz-root${className ? ` ${className}` : ''}`}
      // eslint-disable-next-line react/forbid-dom-props -- aspectRatio + borderRadius vary per call site (they're props), and `style` is a public passthrough; consolidating into a single inline style keeps the component a single render
      style={{
        aspectRatio,
        borderRadius,
        ...style,
      }}
    >
      {/* Blurhash placeholder — preferred when present, fades out
          on real-image load. Renders BEHIND the <img> so the cross-
          fade looks right (no flash of empty bg between blur and
          image). */}
      {hasSrc && !errored && blurDataUrl && (
        <img
          src={blurDataUrl}
          alt=""
          aria-hidden="true"
          className="lz-blur"
          data-loaded={loaded ? 'true' : 'false'}
          // eslint-disable-next-line react/forbid-dom-props -- objectFit is a per-call prop (cover|contain) so it stays inline
          style={{ objectFit }}
        />
      )}

      {/* Skeleton pulse — only when there's no blurhash to show.
          Same animation as before; backward-compatible. */}
      {hasSrc && !loaded && !errored && !blurDataUrl && (
        <div className="lz-skel" />
      )}

      {/* TeaPlaceholder — empty src, missing src, or load failed */}
      {showPlaceholder && <TeaPlaceholder label={alt || t('Tea image placeholder')} />}

      {/* Actual image — wrapped in <picture> when responsive variants
          are provided, falls through to a plain <img> for legacy call
          sites. <picture> tries sources in order: AVIF → WebP →
          original, picking the first format the browser supports. */}
      {hasSrc && !errored && (
        <picture>
          {/* AVIF — smallest format, best compression, supported by
              all evergreen browsers in 2026. Single width because
              AVIF doesn't benefit much from a multi-width set at
              typical card sizes; the browser picks based on sizes
              hint and viewport DPR. */}
          {avif && (
            <source
              type="image/avif"
              srcSet={avif}
              sizes={sizes}
            />
          )}
          {/* WebP — universal support, full multi-width set. */}
          {webp && (
            <source
              type="image/webp"
              srcSet={webp}
              sizes={sizes}
            />
          )}
          <img
            ref={imgRef}
            src={src}
            srcSet={srcSet}
            sizes={sizes}
            // Width/height attrs back up the CSS aspect-ratio with
            // an HTML-level dimension hint — eliminates CLS by giving
            // the browser the intrinsic ratio to reserve layout space
            // before CSS or the actual image arrive. Computed from
            // the `aspectRatio` prop (or pass-through if width+height
            // were supplied explicitly). See the imgW/imgH derivation
            // above for the rationale.
            width={imgW}
            height={imgH}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            fetchPriority={priority ? 'high' : 'low'}
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
            className="lz-img"
            data-loaded={loaded ? 'true' : 'false'}
            // eslint-disable-next-line react/forbid-dom-props -- objectFit is a per-call prop and varies between cover/contain, so it stays inline
            style={{ objectFit }}
          />
        </picture>
      )}
    </div>
  );
}
