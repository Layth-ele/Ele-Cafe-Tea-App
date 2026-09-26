import { Link, useNavigate } from 'react-router';
import { useEffect } from 'react';
import { ROUTES, loginWithReturn } from '@/lib/routes';
import { prefetchRoutesForPage } from '@/lib/prefetchRoute';
import { Minus, Plus, ArrowRight, Gift } from 'lucide-react';
import { useOptimisticCart } from '@/hooks/useOptimisticCart';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/contexts/AuthContext';
import { SeoHead } from '@/app/components/SeoHead';
import { CartSummary } from '@/app/components/CartSummary';
import { CartUpsell } from '@/app/components/CartUpsell';
import { LazyImage } from '@/app/components/LazyImage';

import { cartItemName } from '@/store/cartStore';
import { useT, useTx, useLang } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
export function CartPage() {
  const t = useT();
  const lang = useLang();
  const tx = useTx();
  const { items, updateQuantity, removeFromCart, totalPrice } = useOptimisticCart();
  const settings = useSettings();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Phase 8 improvement — idle-time prefetch of checkout + login chunks.
  // From /cart the conversion path is either checkout (signed-in) or
  // login-then-checkout (anonymous). Prefetching both means the
  // "Checkout" button click feels instant.
  useEffect(() => {
    prefetchRoutesForPage('cart');
  }, []);

  // Falls back to 100 (matching SETTING_DEFAULTS in useSettings.ts) so the
  // threshold is consistent across CartDrawer / CartSummary / Checkout
  // while settings is loading.
  const FREE_THRESHOLD = settings.freeShippingThreshold ?? 100;
  const alwaysFree = FREE_THRESHOLD <= 0;
  const remaining = alwaysFree ? 0 : Math.max(0, FREE_THRESHOLD - totalPrice);
  const progress = alwaysFree ? 100 : Math.min(100, (totalPrice / FREE_THRESHOLD) * 100);

  const handleCheckout = () => {
    if (!currentUser) {
      navigate(loginWithReturn(ROUTES.CHECKOUT));
      return;
    }
    navigate(ROUTES.CHECKOUT);
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (items.length === 0)
    return (
      <>
        <SeoHead
          title="My Basket | Ele Café"
          description="Review your cart and proceed to checkout."
          noIndex={true}
        />
        <div className="cp-empty">
          <div className="cp-empty-inner">
            <div className="empty-state-icon cp-empty-icon">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <h2 className="cp-empty-title">{t('Your basket is empty')}</h2>
            <p className="cp-empty-msg">
              {t(
                "Discover our collection of premium teas sourced from the world's finest gardens.",
              )}
            </p>
            <Link to={ROUTES.PRODUCTS} className="btn btn-dark btn-lg">
              {t('Browse Teas')}
            </Link>
          </div>
        </div>
      </>
    );

  // ── Cart with items ────────────────────────────────────────────────────────
  return (
    <div className="cp-page">
      <SeoHead
        title="My Basket | Ele Café"
        description="Review your cart and proceed to checkout."
        noIndex={true}
      />

      <div className="container container-sm cp-container">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="page-hero cp-page-hero">
          <span className="overline">{t('Shopping')}</span>
          <h1>{t('My Basket')}</h1>
          <div className="page-hero-rule" />
        </div>
        <div className="cp-progress-wrap">
          {/* Free shipping progress */}
          <div className="cp-progress-inner">
            <p className="text-sm text-muted cp-progress-msg">
              {remaining === 0 ? (
                <span className="cp-progress-qualified">
                  {t('✓ You qualify for free shipping!')}
                </span>
              ) : (
                tx('You’re {amount} away from free shipping', {
                  amount: <strong className="cp-progress-amount">{formatMoney(remaining)}</strong>,
                })
              )}
            </p>
            <div className="cp-progress-track">
              <div
                className="cp-progress-bar"
                data-qualified={remaining === 0 ? 'true' : 'false'}
                // eslint-disable-next-line react/forbid-dom-props -- progress bar fill % is dynamic
                style={{ width: `${progress}%` }}
              />
            </div>
            {settings.freeSampleWithOrders !== false && (
              <p className="cart-sample-note">
                <Gift size={14} aria-hidden="true" />{' '}
                {t('A free tea sample is included with your order')}
              </p>
            )}
            <CartUpsell className="cp-upsell" />
          </div>
        </div>

        {/* ── Items ───────────────────────────────────────────────────────── */}
        <div className="cp-items">
          {items.map((item) => (
            <div key={item.id} className="cp-item">
              {/* Thumbnail */}
              <LazyImage
                src={item.image}
                alt={cartItemName(item, lang)}
                aspectRatio="1/1"
                borderRadius="8px"
                className="cp-item-thumb"
              />

              {/* Info */}
              <div className="cp-item-info">
                <span className="tea-cat cp-item-cat">{item.category}</span>
                <p className="cp-item-name">{cartItemName(item, lang)}</p>
                <p className="text-sm cp-item-price">{formatMoney(item.price)}</p>

                {/* Qty stepper + Remove */}
                <div className="cp-item-controls">
                  <div className="cp-item-stepper">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      aria-label={t('Decrease quantity')}
                      className="cart-stepper-btn"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="cp-item-qty">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      aria-label={t('Increase quantity')}
                      className="cart-stepper-btn"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <button
                    onClick={() => removeFromCart(item.id)}
                    aria-label={t('Remove {name}', { name: cartItemName(item, lang) })}
                    className="cart-remove-btn"
                  >
                    {t('Remove')}
                  </button>
                </div>
              </div>

              {/* Line total */}
              <div className="cp-item-total-wrap">
                <p className="cp-item-total">{formatMoney(item.price * item.quantity)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Summary + CTA ────────────────────────────────────────────────── */}
        <div className="cp-summary-wrap">
          <CartSummary items={items} subtotal={totalPrice} totalLabel="Total" />

          <div className="cp-summary-actions">
            <button
              onClick={handleCheckout}
              className="btn btn-dark btn-full btn-lg cp-checkout-btn"
            >
              {t('Checkout')} <ArrowRight size={15} />
            </button>
            <Link to={ROUTES.PRODUCTS} className="btn btn-ghost btn-full btn-sm cp-continue-link">
              {t('Continue shopping')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
export default CartPage;
