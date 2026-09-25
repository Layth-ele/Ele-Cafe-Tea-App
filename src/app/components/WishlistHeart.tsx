/**
 * WishlistHeart — Phase 11.4.
 *
 * Heart icon that adds/removes a tea from the wishlist. Used in two
 * places:
 *   - On every TeaCard (small variant, top-right corner)
 *   - On TeaProfilePage near the title (regular variant, beside the
 *     "Add to cart" button)
 *
 * Accessibility:
 *   - role implicit via <button>; aria-pressed reflects current state
 *   - aria-label changes based on state ("Add to wishlist" / "Remove
 *     from wishlist") so the screen reader announces the action that
 *     pressing will perform, not just the noun
 *   - Heart svg has aria-hidden=true; the button's accessible name
 *     is the aria-label
 *   - Focus-visible inherits the project's standard 2px gold ring
 *
 * Motion:
 *   - The fill transition uses --dur-fast var(--ease-spring) so the
 *     heart "pops" when added. Reduced-motion users get a snap.
 *   - The press scale comes from the global .btn rule but this
 *     button isn't .btn (it's iconic), so we wire the scale directly
 *     under prefers-reduced-motion: no-preference.
 */
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useWishlist } from '@/store/wishlistStore';

import { tNow } from '@/i18n/useT';
export interface WishlistHeartProps {
  slug:     string;
  name:     string;
  category: string;
  image:    string;
  /** Price in dollars at time of save. */
  price:    number;
  /** Visual size. 'sm' for grid cards, 'md' for detail pages. */
  size?:    'sm' | 'md';
  className?: string;
}

export function WishlistHeart({
  slug, name, category, image, price, size = 'sm', className,
}: WishlistHeartProps) {
  // Subscribe only to the boolean — re-render this button when the
  // wishlist changes but only if THIS slug's membership flipped.
  const isInWishlist = useWishlist((s) => s.has(slug));
  const toggle = useWishlist((s) => s.toggle);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const action = toggle({ slug, name, category, image, priceAtSave: price });
    if (action === 'added') {
      toast.success(tNow('{name} added to wishlist', { name }));
    }
    // No toast on removal — the visual flip is feedback enough,
    // and a toast for every un-heart feels naggy.
  }, [toggle, slug, name, category, image, price]);

  const label = isInWishlist
    ? `Remove ${name} from wishlist`
    : `Add ${name} to wishlist`;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isInWishlist}
      aria-label={label}
      data-size={size}
      data-active={isInWishlist ? 'true' : 'false'}
      className={['wl-heart-btn', className].filter(Boolean).join(' ')}
    >
      <svg
        viewBox="0 0 24 24"
        width={size === 'md' ? 22 : 18}
        height={size === 'md' ? 22 : 18}
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M12 20.5s-7.5-4.5-7.5-10.2C4.5 7.2 6.9 5 9.8 5c1.7 0 3.2.8 4.2 2.1C15 5.8 16.5 5 18.2 5c2.9 0 5.3 2.2 5.3 5.3 0 5.7-7.5 10.2-7.5 10.2"
          transform="translate(-2 0)"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          fill={isInWishlist ? 'currentColor' : 'none'}
        />
      </svg>
    </button>
  );
}
