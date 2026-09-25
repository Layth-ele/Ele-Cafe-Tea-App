/**
 * imageRegistry — original photo URL → WebP srcset of its small copies.
 *
 * The imageVariants Cloud Function stores `imageVariants: { src, set }`
 * on tea and pairing docs. Wherever those docs are read, the copies are
 * registered here, and LazyImage picks them up by the photo's URL — so
 * every place a tea photo appears (cards, tea page, cart, gift builder,
 * pairings) serves ~30 KB WebP instead of the ~1.8 MB original without
 * each call site having to know about it.
 */
const registry = new Map<string, string>();

interface RawVariants { src?: unknown; set?: unknown }

/** Record a doc's `imageVariants` (ignored unless well-formed and current). */
export function registerImageVariants(image: unknown, variants: unknown): void {
  if (typeof image !== 'string' || !variants || typeof variants !== 'object') return;
  const v = variants as RawVariants;
  // Made from an older photo → ignore; the function will remake them.
  if (v.src !== image || !Array.isArray(v.set)) return;
  const parts = v.set
    .filter((x): x is { w: number; url: string } =>
      !!x && typeof x.w === 'number' && x.w > 0 && typeof x.url === 'string' && x.url.startsWith('https://'))
    .sort((a, b) => a.w - b.w)
    .map((x) => `${x.url} ${x.w}w`);
  if (parts.length) registry.set(image, parts.join(', '));
}

/** WebP srcset for a photo, if its copies are known. */
export function variantSrcSet(src: string | undefined): string | undefined {
  return src ? registry.get(src) : undefined;
}
