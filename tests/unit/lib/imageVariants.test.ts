/**
 * Tests for src/lib/imageVariants.ts.
 *
 * The variant builder is pure string manipulation but the URL shape
 * is fiddly (path-encoded slashes, query string preservation, format
 * extension swap). These tests pin the contract against the Firebase
 * Resize Images extension naming convention.
 */
import { describe, test, expect } from 'vitest';
import {
  getResponsiveImage,
  SIZES,
  VARIANT_WIDTHS,
  AVIF_WIDTH,
  buildVariantUrl,
  clearVariantCache,
  getVariantCacheStats,
} from '@/lib/imageVariants';

const FIREBASE_URL = 'https://firebasestorage.googleapis.com/v0/b/elecafe-prod.appspot.com/o/teas%2F1714000000_assam.jpg?alt=media&token=abc-123';

describe('getResponsiveImage', () => {
  test('passes through empty src', () => {
    const r = getResponsiveImage('');
    expect(r.src).toBe('');
    expect(r.hasVariants).toBe(false);
    expect(r.avif).toBeUndefined();
    expect(r.webp).toBeUndefined();
    expect(r.srcSet).toBeUndefined();
  });

  test('passes through non-Firebase URLs unchanged', () => {
    const r = getResponsiveImage('https://images.example.com/tea.jpg');
    expect(r.src).toBe('https://images.example.com/tea.jpg');
    expect(r.hasVariants).toBe(false);
    // Non-Firebase: no variants are knowable, only single-URL render.
    expect(r.avif).toBeUndefined();
    expect(r.webp).toBeUndefined();
    expect(r.srcSet).toBeUndefined();
  });

  test('passes through data: and blob: URLs', () => {
    const r1 = getResponsiveImage('data:image/png;base64,AAAA');
    expect(r1.hasVariants).toBe(false);
    expect(r1.webp).toBeUndefined();
    const r2 = getResponsiveImage('blob:https://example.com/abc-123');
    expect(r2.hasVariants).toBe(false);
    expect(r2.webp).toBeUndefined();
  });

  test('builds a webp srcSet at all VARIANT_WIDTHS for a Firebase URL', () => {
    const r = getResponsiveImage(FIREBASE_URL);
    expect(r.hasVariants).toBe(true);
    expect(r.webp).toBeDefined();
    // Each width must appear with its `w` descriptor.
    for (const w of VARIANT_WIDTHS) {
      expect(r.webp).toContain(`_${w}x${w}.webp`);
      expect(r.webp).toContain(`${w}w`);
    }
  });

  test('builds an AVIF source at the configured AVIF_WIDTH', () => {
    const r = getResponsiveImage(FIREBASE_URL);
    expect(r.avif).toBeDefined();
    expect(r.avif).toContain(`_${AVIF_WIDTH}x${AVIF_WIDTH}.avif`);
  });

  test('preserves the alt=media + token query on every variant', () => {
    const r = getResponsiveImage(FIREBASE_URL);
    expect(r.avif).toContain('?alt=media&token=abc-123');
    expect(r.webp).toContain('?alt=media&token=abc-123');
    expect(r.srcSet).toContain('?alt=media&token=abc-123');
  });

  test('keeps the path-encoded teas%2F prefix intact', () => {
    const r = getResponsiveImage(FIREBASE_URL);
    // %2F is the URL-encoded slash separating teas/ from the filename.
    // If we accidentally normalized it the URL would 404.
    expect(r.webp).toContain('teas%2F');
  });

  test('handles uppercase JPEG extension', () => {
    const url = FIREBASE_URL.replace('.jpg', '.JPEG');
    const r = getResponsiveImage(url);
    // Extension is matched case-insensitively but the variant ext is
    // always lowercase webp/avif (storage paths are case-sensitive,
    // so the extension installs both lowercase variants).
    expect(r.webp).toContain('.webp?alt=media');
    expect(r.avif).toContain('.avif?alt=media');
  });

  test('handles png originals', () => {
    const url = FIREBASE_URL.replace('.jpg', '.png');
    const r = getResponsiveImage(url);
    expect(r.webp).toContain(`_${AVIF_WIDTH}x${AVIF_WIDTH}.webp`);
    // Default-format srcSet swaps in the original extension for the
    // last-resort fallback.
    expect(r.srcSet).toContain('.png?alt=media');
  });

  test('returns single src for Firebase URLs without a known image extension', () => {
    // Defensive: if someone uploaded a `.HEIC` or `.tiff`, we don't
    // have the extension in our allowlist. Fall back to single-URL
    // render rather than building broken variant URLs.
    const url = FIREBASE_URL.replace('.jpg', '.heic');
    const r = getResponsiveImage(url);
    expect(r.src).toBe(url);
    expect(r.hasVariants).toBe(false);
    expect(r.webp).toBeUndefined();
    expect(r.avif).toBeUndefined();
  });

  test('memoizes results by source URL', () => {
    clearVariantCache();
    const a = getResponsiveImage(FIREBASE_URL);
    const b = getResponsiveImage(FIREBASE_URL);
    expect(a).toBe(b);
  });
});

describe('single variant helper and cache diagnostics', () => {
  test('buildVariantUrl returns a single variant with query preserved', () => {
    const u = buildVariantUrl(FIREBASE_URL, 640, 'webp');
    expect(u).toContain('_640x640.webp');
    expect(u).toContain('?alt=media&token=abc-123');
  });

  test('cache stats reflect clearVariantCache()', () => {
    clearVariantCache();
    expect(getVariantCacheStats().size).toBe(0);
    getResponsiveImage(FIREBASE_URL);
    expect(getVariantCacheStats().size).toBe(1);
    clearVariantCache();
    expect(getVariantCacheStats().size).toBe(0);
  });
});

describe('SIZES presets', () => {
  test('all presets are non-empty strings', () => {
    for (const v of Object.values(SIZES)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  test('teaCard uses three breakpoints (mobile, tablet, desktop)', () => {
    // Sanity check on the layout assumption — if the grid columns
    // change, this preset needs to change too.
    expect(SIZES.teaCard).toMatch(/min-width: 1024px/);
    expect(SIZES.teaCard).toMatch(/min-width: 640px/);
  });
});
