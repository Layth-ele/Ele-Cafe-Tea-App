/**
 * CartUpsell — tea suggestions while the cart is below free shipping.
 *
 * Sits under the "You're $X away from free shipping" bar in CartDrawer and
 * on CartPage. Picks come from lib/shippingUpsell (same-category teas the
 * customer doesn't have yet, in stock, best first; any tea that reaches
 * free shipping on its own is tagged). Dark-pattern-free: informational
 * copy, nothing added automatically, no invented urgency.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTeas } from '@/lib/firebaseQueries';
import { useCartStore } from '@/store/cartStore';
import { useSettingsQuery } from '@/hooks/useSettings';
import { formatPricePerWeight } from '@/lib/priceFormat';
import { pickShippingUpsell } from '@/lib/shippingUpsell';
import { TeaImage } from './TeaImage';

import { useT, localizeTea, useLang } from '@/i18n/useT';

interface Props {
  /** Class applied to the root section. */
  className?: string;
}

/**
 * Shown under the "You're $X away from free shipping" bar (cart drawer +
 * cart page) whenever the cart is below the threshold: up to 3 teas the
 * customer is likely to want (see lib/shippingUpsell), with a tag on any
 * that reach free shipping on their own. Never auto-adds; no urgency.
 */
export function CartUpsell({ className }: Props) {
  const tr = useT();
  const lang = useLang();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.totalPrice);
  const addToCart = useCartStore((s) => s.addToCart);
  const { data: settings } = useSettingsQuery();
  const { data: allTeas } = useQuery({
    queryKey: ['teas'],
    queryFn: () => fetchTeas(),
    staleTime: 5 * 60 * 1000,
  });

  // Same rule as the progress bar: 0 = always free, default $100.
  const threshold =
    typeof settings?.freeShippingThreshold === 'number' ? settings.freeShippingThreshold : 100;
  const gap = threshold > 0 ? threshold - subtotal : 0;

  const picks = useMemo(
    () => (items.length > 0 && gap > 0 && allTeas ? pickShippingUpsell(allTeas, items, gap) : []),
    [allTeas, items, gap],
  );
  if (picks.length === 0) return null;
  const suggestions = picks.map((x) => x.product);
  const unlocks = new Set(picks.filter((x) => x.unlocks).map((x) => x.product));

  return (
    <section
      aria-labelledby="cart-upsell-heading"
      className={['cart-upsell', className].filter(Boolean).join(' ')}
    >
      <p id="cart-upsell-heading" className="cart-upsell-prompt">
        {unlocks.size > 0
          ? tr('Add one of these to unlock free shipping')
          : tr('You might also like')}
      </p>
      {suggestions.length > 0 && (
        <ul className="cart-upsell-suggestions" role="list">
          {suggestions.map((p) => {
            const id = p.id ?? p.slug ?? '';
            const name = p.name ?? 'Tea';
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
                  {unlocks.has(p) && (
                    <span className="cart-upsell-unlock">{tr('Unlocks free shipping')}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="cart-upsell-add"
                  aria-label={tr('Add {name} to cart for {price}', {
                    name: displayName,
                    price: formatPricePerWeight(price, p),
                  })}
                  onClick={() =>
                    addToCart({
                      id,
                      name,
                      nameFr: p.nameFr ?? undefined,
                      price,
                      image,
                      category,
                      gstApplicable: p.gstApplicable ?? false,
                    })
                  }
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
