/**
 * TeaImage — convenience wrapper around LazyImage for tea catalog images.
 *
 * Why this wrapper exists:
 *   Most tea images on the site share three concerns the raw LazyImage
 *   API leaves to the caller:
 *     1. Generating the responsive srcSet from a single Firestore URL.
 *     2. Picking the right `sizes` preset for the layout context.
 *     3. Wiring the optional blurhash from the product record.
 *
 *   Calling LazyImage directly with all that wiring is verbose and
 *   easy to get wrong (wrong sizes preset = wrong image picked = wasted
 *   bytes or blurry image). This wrapper handles it once.
 *
 * The `variant` prop maps to layout context, NOT image dimensions —
 * the image still fills its container. Picking the right variant
 * tells the browser which `sizes` preset to use:
 *
 *   card    — grid card on /products. ~280px on desktop, ~45vw on tablet,
 *             ~90vw on mobile.
 *   hero    — top of /tea-profile/{slug}. Half-bleed on desktop, full on phone.
 *   thumb   — small inline thumbnail (cart, related teas). 120px fixed.
 *   bundle  — gift-builder card. ~33vw on desktop.
 *
 * To keep the storefront reliable, this wrapper always renders the
 * original Storage download URL. Responsive variants are only useful
 * when the generated files are guaranteed to exist; otherwise the
 * browser can lock onto a missing source and the image disappears.
 *
 * If we later re-enable the Resize Images pipeline, this wrapper is
 * the single place to restore that optimization.
 *
 * See IMAGE_PIPELINE.md for the operational setup.
 */

import { LazyImage } from './LazyImage';
import { SIZES } from '@/lib/imageVariants';
import type { Product } from '@/schemas/product.schema';

type TeaImageVariant = 'card' | 'hero' | 'thumb' | 'bundle';

interface TeaImageProps {
  product:       Pick<Product, 'image' | 'name' | 'blurhash' | 'variantsAvailable'>;
  variant?:      TeaImageVariant;
  /** Above-the-fold? Disables lazy load + sets fetchpriority=high. */
  priority?:     boolean;
  className?:    string;
  style?:        React.CSSProperties;
  aspectRatio?:  string;
  borderRadius?: string;
  objectFit?:    'cover' | 'contain' | 'fill';
}

const SIZES_BY_VARIANT: Record<TeaImageVariant, string> = {
  card:   SIZES.teaCard,
  hero:   SIZES.teaHero,
  thumb:  SIZES.teaThumb,
  bundle: SIZES.teaBundle,
};

export function TeaImage({
  product,
  variant = 'card',
  priority = false,
  className,
  style,
  aspectRatio = '1/1',
  borderRadius = '0',
  objectFit = 'cover',
}: TeaImageProps) {
  const src = product.image ?? '';

  return (
    <LazyImage
      src={src}
      sizes={SIZES_BY_VARIANT[variant]}
      blurhash={product.blurhash}
      alt={product.name ?? ''}
      priority={priority}
      className={className}
      style={style}
      aspectRatio={aspectRatio}
      borderRadius={borderRadius}
      objectFit={objectFit}
    />
  );
}

export default TeaImage;
