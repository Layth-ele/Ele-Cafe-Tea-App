/**
 * slugify — canonical slug normalizer.
 *
 * Single source of truth for the slug shape used throughout the app:
 *   - Lowercase
 *   - Apostrophes, quotes, parens, ampersands, etc. → dropped
 *   - Whitespace and any non-alphanumeric run → single `-`
 *   - Leading/trailing `-` trimmed
 *
 * The same algorithm has been duplicated in `src/app/pages/admin/AdminProducts.tsx`
 * and `src/app/components/admin/ComboGalleryAdmin.tsx` for over a year.
 * This module is now THE implementation; those call sites can import
 * from here.
 *
 * Reason this exists as a separate module: the slug rules also need
 * to run at URL-resolve time (in TeaProfilePage) so that a visitor
 * who paste-types `/tea-profile/black/monk's-blend` (with the
 * apostrophe still in it — that's a valid URL per RFC 3986, just
 * not our canonical form) gets redirected to the canonical
 * `/tea-profile/black/monks-blend`. Without the shared module, the
 * write-side and read-side rules would drift.
 */

/**
 * Convert a free-form string to a canonical slug.
 *
 * Examples:
 *   toSlug("Monk's Blend")      → "monks-blend"
 *   toSlug("Earl Grey (Bold)")  → "earl-grey-bold"
 *   toSlug("Lapsang Souchong")  → "lapsang-souchong"
 *   toSlug("  Café au Lait  ")  → "caf-au-lait"   ← deliberately drops accents;
 *                                                   change to `unidecode` if accents
 *                                                   are common in your catalog.
 */
export function toSlug(input: string): string {
  if (!input) return '';
  return (
    input
      .toLowerCase()
      // Strip apostrophes and quote characters FIRST. Without this step
      // "Monk's Blend" would become "monk-s-blend" (the apostrophe
      // collapsing into a dash between 'k' and 's'). Industry convention
      // (Hugo, Jekyll, WordPress, Rails parameterize) is to drop these
      // chars entirely, then collapse the remaining whitespace +
      // punctuation runs into single dashes.
      .replace(/['\u2018\u2019\u201B\u2032"\u201C\u201D]/g, '')
      // Anything that isn't a-z, 0-9, or already a `-` becomes `-`.
      // After the quote-strip above, this collapses spaces and remaining
      // punctuation into single dashes.
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

/**
 * Is this slug already in canonical form? Returns false for slugs
 * that contain apostrophes, uppercase, repeated dashes, etc.
 *
 * Used at URL-resolve time: if `isCanonicalSlug(urlSlug)` is false,
 * the caller should redirect to `toSlug(urlSlug)` (replace mode so
 * the browser back-button doesn't loop on the non-canonical URL).
 */
export function isCanonicalSlug(slug: string): boolean {
  if (!slug) return false;
  return toSlug(slug) === slug;
}

/**
 * Same logic but treats the input as already URL-decoded
 * (decodeURIComponent has already run). React Router's useParams()
 * returns decoded values, so a URL `/black/monk%27s-blend` arrives
 * here as `monk's-blend`. Both forms normalize to `monks-blend`.
 */
export function normalizeSlugFromUrl(rawFromUrl: string): string {
  // Defense in depth: even if the runtime didn't decode (which
  // shouldn't happen but happens) try decodeURIComponent. Catch
  // malformed sequences and leave them alone.
  let decoded = rawFromUrl;
  try {
    if (/%[0-9A-Fa-f]{2}/.test(rawFromUrl)) decoded = decodeURIComponent(rawFromUrl);
  } catch (err) {
    console.warn('[slugify] Failed to decode URL slug:', err);
  }
  return toSlug(stripSharedText(decoded));
}

/**
 * Some apps glue a shared description onto the link
 * ("…/pairings/matcha-vegan-tart Earthy, creamy, and smooth…"). When a
 * sentence (3+ words) follows a space, keep only what's before it; a
 * hand-typed "monk's blend" still reaches toSlug whole.
 */
export function stripSharedText(s: string): string {
  const m = s.trim().match(/^(\S+)\s+(.+)$/);
  return m && m[2].trim().split(/\s+/).length >= 3 ? m[1] : s;
}
