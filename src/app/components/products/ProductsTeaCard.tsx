import React from 'react';
import { Link } from 'react-router';
import { categories } from '@/data/categories';
import { ROUTES } from '@/lib/routes';
import { useCartStore as useCart } from '@/store/cartStore';
import { useCartFly } from '@/hooks/useCartFly';
import type { Product } from '@/types';
import { Skeleton } from '@/app/components/ui/skeleton';
import { TeaImage } from '@/app/components/TeaImage';
import { WishlistHeart } from '@/app/components/WishlistHeart';
import { isProductAvailable } from '@/lib/availability';
import { formatPricePerWeight } from '@/lib/priceFormat';

import { useT, localizeTea, useLang } from '@/i18n/useT';
export function ProductsCardSkeleton() {
  return <Skeleton.Card />;
}

export const ProductsTeaCard = React.memo(function ProductsTeaCard({
  product,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const t = useT();
  // Per-field selectors — each card only re-renders when its own cart line changes,
  // not on every unrelated cart mutation.
  const addToCart = useCart((s) => s.addToCart);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeFromCart = useCart((s) => s.removeFromCart);
  const { fly } = useCartFly();

  const id = product.id ?? '';
  const name = product.name ?? 'Unnamed';
  const nameFr = product.nameFr ?? undefined;
  const displayName = localizeTea(product, useLang()).name || name;
  const price = typeof product.price === 'number' ? product.price : 0;
  const image = product.image ?? '';
  const category = product.category ?? 'other';
  const slug = product.slug ?? id;
  // Turn 6: dropped `stock` derivation. Inventory projection drives
  // availability; cart line items no longer carry a stock cap.
  // Turn 5 cutover: availability gating from the helper.
  const available = isProductAvailable(product);
  const catName = categories.find((c) => c.id === category)?.name ?? category;
  const cartQty = useCart((s) => s.items.find((i) => i.id === id)?.quantity ?? 0);

  const handleAdd = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Defense-in-depth — UI's disabled attribute is just visual; this
    // is the actual handler-level gate. Server (onOrderWrite) has its
    // own check too. Matches the TeaProfilePage pattern.
    if (!available) return;
    const result = addToCart({
      id,
      name,
      nameFr,
      price,
      image,
      category,
      gstApplicable: product.gstApplicable ?? false,
    });
    if (result.added) {
      fly(e.currentTarget, '+1');
    }
  };

  const handleInc = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!available) return;
    addToCart({
      id,
      name,
      nameFr,
      price,
      image,
      category,
      gstApplicable: product.gstApplicable ?? false,
    });
    fly(e.currentTarget, '+1');
  };

  const handleDec = (e: React.MouseEvent) => {
    e.preventDefault();
    if (cartQty <= 1) removeFromCart(id);
    else updateQuantity(id, cartQty - 1);
  };

  return (
    <div className="tea-card">
      <Link to={ROUTES.TEA_PROFILE(category, slug)}>
        {/* The view-transition-name is set INLINE because it has to be
            unique-per-element-per-page and tied to the product id. */}
        <div
          className="tea-card-img"
          // eslint-disable-next-line react/forbid-dom-props -- viewTransitionName is dynamic per-product for the shared-element transition
          style={{ ['viewTransitionName' as string]: `tea-img-${id}` }}
        >
          <TeaImage product={product} variant="card" priority={priority} />
          {product.isOrganic && <span className="tea-tag tea-tag-green">{t('Organic')}</span>}
          {product.caffeine === 'None' && !product.isOrganic && (
            <span className="tea-tag">{t('Caffeine-free')}</span>
          )}
          {cartQty > 0 && <span className="hp-tc-cart-badge">{cartQty}</span>}

          <WishlistHeart
            slug={slug}
            name={name}
            category={category}
            image={image}
            price={price}
            size="sm"
            className="wl-heart-card"
          />
        </div>
      </Link>

      <span className="tea-cat">{t(catName)}</span>
      <Link to={ROUTES.TEA_PROFILE(category, slug)}>
        <span className="tea-name">{displayName}</span>
      </Link>
      <span className="tea-price">{formatPricePerWeight(price, product)}</span>
      {(product.ratingCount ?? 0) > 0 && (product.avgRating ?? 0) > 0 && (
        <span
          className="tea-rating"
          aria-label={t('Rated {rating} out of 5 from {count} reviews', {
            rating: (product.avgRating as number).toFixed(1),
            count: product.ratingCount as number,
          })}
        >
          <span aria-hidden="true">★ {(product.avgRating as number).toFixed(1)}</span>
          <span className="tea-rating-count" aria-hidden="true">
            ({product.ratingCount})
          </span>
        </span>
      )}

      {!available ? (
        <button className="btn-add pp-tc-soldout" disabled>
          {t('Sold Out')}
        </button>
      ) : cartQty === 0 ? (
        <button className="btn-add tc-add-btn" onClick={handleAdd}>
          {t('Add to Cart')}
        </button>
      ) : (
        <div className="tc-stepper">
          <button className="tc-stepper-btn" onClick={handleDec} aria-label={t('Decrease')}>
            <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
              <path d="M1 1h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <span className="tc-stepper-qty">{cartQty}</span>
          <button className="tc-stepper-btn" onClick={handleInc} aria-label={t('Increase')}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M5 1v8M1 5h8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
});
