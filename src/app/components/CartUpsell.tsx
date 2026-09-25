/**
 * CartUpsell — Phase 11.3.
 *
 * Renders inside CartDrawer above the totals. Two states:
 *
 *   1. Subtotal is BELOW the free-shipping threshold by less than
 *      $20 (configurable). Show: "Add $X.XX more for free shipping"
 *      and 3 suggested add-ons priced to bring the cart over the
 *      threshold without overshooting it by much.
 *
 *   2. Subtotal is AT or ABOVE the threshold. Render the "You've
 *      unlocked free shipping ✓" confirmation, briefly. After 5s
 *      the component hides itself so it doesn't compete with the
 *      checkout CTA for attention.
 *
 * No upsell shown if the user is doing pickup (fulfillmentMethod is
 * resolved at checkout, not in the drawer — so we always show the
 * upsell here; the user can ignore it if they're going to pickup).
 *
 * Design choice — dark-pattern-free:
 *   - The threshold message is informational, not coercive ("Add
 *     $X for free shipping", not "Only $X away from FREE!!!").
 *   - The suggestions never auto-add; the user clicks.
 *   - We never invent urgency ("hurry, limited time!").
 */
import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTeas } from '@/lib/firebaseQueries';
import { useCartStore } from '@/store/cartStore';
import { useSettingsQuery } from '@/hooks/useSettings';
import { isProductAvailable } from '@/lib/availability';
import { formatPricePerWeight } from '@/lib/priceFormat';
import type { Product } from '@/schemas/product.schema';
import { TeaImage } from './TeaImage';

import { useT, useTx, localizeTea, useLang } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
const SHOW_BELOW_GAP_USD = 20;  // Only prompt if within $20 of threshold
const CONFIRMATION_TIMEOUT_MS = 5000;

interface Props {
  /** Class applied to the root section. */
  className?: string;
}

export function CartUpsell({ className }: Props) {
  const tr = useT();
  const lang = useLang();
  const tx = useTx();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.totalPrice);
  const addToCart = useCartStore((s) => s.addToCart);
  const { data: settings } = useSettingsQuery();
  const { data: allTeas } = useQuery({
    queryKey: ['teas'],
    queryFn: () => fetchTeas(),
    staleTime: 5 * 60 * 1000,
  });

  // Settings doc holds the free-shipping threshold. Default to $75
  // if the doc isn't loaded yet (matches the current default in
  // formatFreeShippingSubline).
  const threshold = typeof settings?.freeShippingThreshold === 'number'
    ? settings.freeShippingThreshold
    : 75;

  const gap = threshold - subtotal;
  const isAbove = subtotal >= threshold && subtotal > 0;
  const isWithinPromptRange = !isAbove && gap > 0 && gap < SHOW_BELOW_GAP_USD;

  // Auto-hide the "unlocked!" confirmation after a few seconds.
  const [hideConfirmation, setHideConfirmation] = useState(false);
  useEffect(() => {
    if (!isAbove) { setHideConfirmation(false); return; }
    const t = setTimeout(() => setHideConfirmation(true), CONFIRMATION_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isAbove]);

  // Compute suggested add-ons: teas priced between (gap) and
  // (gap + $15), prefer top-rated, exclude items already in cart.
  const suggestions = useMemo(() => {
    if (!isWithinPromptRange || !allTeas) return [] as Product[];
    const cartSlugs = new Set(items.map((i) => i.id));
    return allTeas
      .filter((t) => t.isActive !== false)
      .filter((t) => !cartSlugs.has(t.id ?? t.slug ?? ''))
      // Turn 6: only suggest teas the customer can actually buy right
      // now. Without this filter, an unavailable tea would appear in
      // the upsell, the customer clicks Add, the cart accepts it
      // (client-side defense is on TeaProfilePage / ProductsTeaCard,
      // not here), then checkout fails server-side. Cleaner to never
      // suggest it.
      .filter((t) => isProductAvailable(t))
      .filter((t) => typeof t.price === 'number')
      .filter((t) => {
        const p = t.price as number;
        return p >= gap && p <= gap + 15;
      })
      .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
      .slice(0, 3);
  }, [allTeas, items, gap, isWithinPromptRange]);

  if (isAbove) {
    if (hideConfirmation) return null;
    return (
      <section
        role="status"
        aria-live="polite"
        className={['cart-upsell', 'cart-upsell-confirmed', className].filter(Boolean).join(' ')}
      >
        <span aria-hidden="true" className="cart-upsell-icon">✓</span>
        <span>{tr('You\'ve unlocked free shipping.')}</span>
      </section>
    );
  }

  if (!isWithinPromptRange) return null;

  return (
    <section
      aria-labelledby="cart-upsell-heading"
      className={['cart-upsell', className].filter(Boolean).join(' ')}
    >
      <p id="cart-upsell-heading" className="cart-upsell-prompt">
        {tx('Add {amount} more for free shipping.', { amount: <strong>{formatMoney(gap)}</strong> })}
      </p>
      {suggestions.length > 0 && (
        <ul className="cart-upsell-suggestions" role="list">
          {suggestions.map((p) => {
            const id    = p.id ?? p.slug ?? '';
            const name  = p.name ?? 'Tea';
            const displayName = localizeTea(p, lang).name || name;
            const price = typeof p.price === 'number' ? p.price : 0;
            const image = p.image ?? '';
            const category = p.category ?? 'other';
            return (
              <li key={id} className="cart-upsell-item">
                <TeaImage
                  product={{ image, name, variantsAvailable: false }}
                  variant="thumb"
                  borderRadius="var(--radius-sm)"
                  className="cart-upsell-img"
                />
                <div className="cart-upsell-meta">
                  <span className="cart-upsell-name">{displayName}</span>
                  <span className="cart-upsell-price">{formatPricePerWeight(price, p)}</span>
                </div>
                <button
                  type="button"
                  className="cart-upsell-add"
                  aria-label={tr('Add {name} to cart for {price}', { name: displayName, price: formatPricePerWeight(price, p) })}
                  onClick={() => addToCart({
                    id, name, nameFr: p.nameFr ?? undefined, price, image, category,
                    gstApplicable: p.gstApplicable ?? false,
                  })}
                >
                  {tr('Add')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
