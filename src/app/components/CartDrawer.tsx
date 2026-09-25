/**
 * CartDrawer.tsx
 * Slide-in cart panel from the right side.
 * Opens automatically when addToCart is called (via cartDrawerStore).
 * Matches the app's existing design tokens — no style conflicts.
 *
 * Day 16: bundles render via BundleCartItem — single card layout, no
 * qty stepper, expandable "What's inside" with the teas list.
 *
 * Phase 3 status (2026-05-09): all 62 inline styles migrated to
 * `cd-*` classes in design.css. Two open/closed states (backdrop,
 * panel) toggle via `data-open` attribute; the progress-bar fill
 * width passes through a `--cd-progress` CSS custom property; the
 * disclosure chevron flips via `data-open`. Sibling-row borders use
 * `:not(:last-child)` instead of computing index in JSX. The 1
 * remaining `style={{}}` is a `--cd-progress` custom-property pass-
 * through, suppressed with a documented reason per playbook §step-5.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Gift, ChevronDown } from 'lucide-react';
import { useDrag } from '@use-gesture/react';
import { useCartStore, GST_RATE, cartItemName, type CartItem } from '@/store/cartStore';
import { useCartDrawer } from '@/store/cartDrawerStore';
import { useSettingsQuery } from '@/hooks/useSettings';
import { ROUTES } from '@/lib/routes';
import { lockBodyScroll } from '@/lib/bodyScrollLock';
import { LazyImage } from './LazyImage';
import { CartUpsell } from './CartUpsell';
import { RecentlyViewedSection } from './RecentlyViewedSection';

import { useT, useTx, useLang } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
export function CartDrawer() {
  const t = useT();
  const lang = useLang();
  const tx = useTx();
  const { isOpen, close } = useCartDrawer();
  const { items, updateQuantity, removeFromCart, totalPrice, totalItems } = useCartStore();
  const { data: settings } = useSettingsQuery();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Phase 10 — In-drawer increment feedback. When the user clicks +
  // inside the cart drawer the navbar cart icon is hidden behind the
  // drawer, so the +1 fly animation has no visible target. Instead we
  // briefly bump the quantity display of the just-incremented line
  // item — same `cartBump` keyframe, scoped via `data-just-bumped`.
  // The bumpedId state stores the item id that was last incremented;
  // a setTimeout clears it after the bump animation finishes (~250ms,
  // matching the cartBump duration + small buffer).
  const [bumpedId, setBumpedId] = useState<string | null>(null);
  const bumpedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incrementWithBump = (id: string, nextQty: number) => {
    updateQuantity(id, nextQty);
    if (bumpedTimerRef.current) clearTimeout(bumpedTimerRef.current);
    setBumpedId(id);
    bumpedTimerRef.current = setTimeout(() => setBumpedId(null), 280);
  };
  useEffect(() => {
    return () => {
      if (bumpedTimerRef.current) clearTimeout(bumpedTimerRef.current);
    };
  }, []);

  // Phase 9.3 — Swipe-right-to-dismiss gesture state. The drawer
  // slides in from the right edge, so a right-ward swipe is the
  // natural dismissal gesture (matches iOS native sheets, the iOS
  // safari "back" gesture, and the Android system back gesture
  // direction).
  //
  // dragX is the live translateX offset in px during the gesture.
  // We bind it through a CSS custom property (`--cd-drag-x`) rather
  // than inline style so the panel's existing CSS transition system
  // owns the visual state. On release: if the user dragged more than
  // 35% of the panel width OR flicked faster than 0.5 px/ms to the
  // right, we close; otherwise the panel springs back to 0.
  const [dragX, setDragX] = useState(0);

  const bindSwipe = useDrag(
    ({ down, movement: [mx], velocity: [vx], direction: [dx], cancel }) => {
      // Only respond to rightward drags. A small leftward overdrag
      // is allowed (rubber-band feel) but we don't translate the
      // panel further into the viewport.
      const clamped = Math.max(0, mx);

      if (down) {
        setDragX(clamped);
      } else {
        // Release — decide commit vs revert.
        const panelWidth = drawerRef.current?.offsetWidth ?? 400;
        const draggedFraction = clamped / panelWidth;
        const fastFlickRight = vx > 0.5 && dx > 0;
        if (draggedFraction > 0.35 || fastFlickRight) {
          // Commit dismissal — animate close + reset offset.
          setDragX(0);
          close();
          cancel();
        } else {
          // Revert — spring back to 0.
          setDragX(0);
        }
      }
    },
    {
      // Axis-locked to horizontal so vertical scroll inside the
      // cart-items list isn't hijacked by the gesture system.
      axis: 'x',
      // Filter: only fire on touch / pen pointers. Mouse users have
      // a backdrop click + Escape key + close button; they don't need
      // (and don't expect) swipe gestures.
      pointer: { touch: true, mouse: false },
      // Don't activate from cart-list scrolling start.
      filterTaps: true,
    },
  );

  // Reset drag offset when the drawer closes via any other path
  // (Escape, backdrop click, close button, route change).
  useEffect(() => {
    if (!isOpen) setDragX(0);
  }, [isOpen]);

  // Lock body scroll when open — ref-counted so nesting with Modal is safe.
  // See src/lib/bodyScrollLock.ts for the full contract.
  useEffect(() => {
    if (!isOpen) return;
    return lockBodyScroll();
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [close]);

  // freeShippingThreshold from settings: 0 = always free for everyone,
  // >0 = the dollar threshold customer needs to hit, undefined = settings
  // not loaded yet. Falls back to 100 (matching SETTING_DEFAULTS in
  // useSettings.ts) so customers see the same threshold on every page
  // while settings is in flight. We distinguish 0 from missing so an
  // admin-set "always free" doesn't silently fall back to the default.
  const FREE_THRESHOLD = settings?.freeShippingThreshold ?? 100;
  const alwaysFree = FREE_THRESHOLD <= 0;
  const remaining  = alwaysFree ? 0 : Math.max(0, FREE_THRESHOLD - totalPrice);
  const progress   = alwaysFree ? 100 : Math.min(100, (totalPrice / FREE_THRESHOLD) * 100);

  // GST + grand total — memoised so we don't run the reduce on every
  // unrelated state update (drawer open/close, scroll, body-lock
  // remeasure, etc.). Recomputes only when the items array reference
  // changes — Zustand returns a fresh array on real cart mutations,
  // so this stays correct without sacrificing perf.
  const { gst, grandTotal } = useMemo(() => {
    const g = items.reduce(
      (s, i) => s + (i.gstApplicable ? i.price * i.quantity * GST_RATE : 0),
      0,
    );
    return { gst: g, grandTotal: totalPrice + g };
  }, [items, totalPrice]);

  return (
    <>
      {/* Backdrop — opacity & pointer-events flip via data-open. */}
      <div
        aria-hidden="true"
        onClick={close}
        className="cd-backdrop"
        data-open={isOpen ? 'true' : 'false'}
      />

      {/* Drawer panel — translateX flips via data-open. Phase 9.3
          adds touch-drag tracking for swipe-right-to-dismiss. The
          --cd-drag-x custom property carries the live offset in px;
          the panel CSS reads it and additively translates. During an
          active drag we disable the transition for direct-manipulation
          feel (no lag), and re-enable on release for the spring-back
          or commit animation. */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('Shopping cart')}
        className="cd-panel"
        data-open={isOpen ? 'true' : 'false'}
        data-dragging={dragX > 0 ? 'true' : 'false'}
        /* Phase 9.3: --cd-drag-x is a per-instance CSS custom property
           whose value is genuinely dynamic (live pointer position during
           the gesture). The forbid-dom-props rule exempts custom-property
           pass-through per docs/history/PHASE_3_PLAYBOOK §step-5. */
        // eslint-disable-next-line react/forbid-dom-props
        style={{ '--cd-drag-x': `${dragX}px` } as React.CSSProperties}
        {...bindSwipe()}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="cd-header">
          <div className="cd-header-title-row">
            <span className="cd-header-title">{t('My Cart')}</span>
            {totalItems > 0 && (
              <span className="cd-header-count">({totalItems})</span>
            )}
          </div>

          <button
            onClick={close}
            aria-label={t('Close cart')}
            className="cd-close-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* ── Free shipping bar ────────────────────────────────────── */}
        {totalItems > 0 && (
          <div className="cd-ship-wrap">
            <p className="cd-ship-msg">
              {remaining === 0
                ? <span className="cd-ship-msg-success">{t('✓ Free shipping unlocked!')}</span>
                : tx('{amount} away from free shipping', { amount: <strong className="cd-ship-msg-amount">{formatMoney(remaining)}</strong> })
              }
            </p>
            <div className="cd-ship-track">
              <div
                className="cd-ship-fill"
                data-complete={remaining === 0 ? 'true' : 'false'}
                /* The width is the only legitimate dynamic value here —
                   passes `progress` (a number 0-100) through a CSS custom
                   property so the class can layer transition + color. */
                // eslint-disable-next-line react/forbid-dom-props
                style={{ ['--cd-progress' as string]: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Items list ───────────────────────────────────────────── */}
        <div className="cd-items">
          {items.length === 0 ? (
            /* Empty state */
            <div className="cd-empty">
              <div className="empty-state-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
              </div>
              <div>
                <p className="cd-empty-h">{t('Your cart is empty')}</p>
                <p className="cd-empty-p">{t('Discover our collection of premium teas')}</p>
              </div>
              <Link
                to={ROUTES.PRODUCTS}
                onClick={close}
                className="cd-browse-btn cd-empty-browse-mt"
              >
                {t('Browse Teas')}
              </Link>
              {/* Phase 11.1 — surface recently-viewed teas in the
                  drawer empty state. The store returns null if there
                  are no entries (first-time visitor), so this is
                  conditionally present without an explicit check. */}
              <RecentlyViewedSection
                heading={t('Pick up where you left off')}
                limit={6}
                className="cd-rv-section"
              />
            </div>
          ) : (
            <div className="cd-list">
              {items.map((item) => {
                // Day 16: bundle line items render with a different layout
                // — single card with collapsible "What's inside" details
                // and no qty stepper (bundles are fixed quantity 1).
                if (item.bundle) {
                  return (
                    <BundleCartItem
                      key={item.id}
                      item={item}
                      onRemove={() => removeFromCart(item.id)}
                    />
                  );
                }

                return (
                  <div key={item.id} className="cd-item-row">
                    {/* Image */}
                    <LazyImage
                      src={item.image}
                      alt={cartItemName(item, lang)}
                      aspectRatio="1/1"
                      borderRadius="var(--radius-md)"
                      className="cd-item-image"
                    />

                    {/* Info */}
                    <div className="cd-item-info">
                      <p className="cd-item-name">{cartItemName(item, lang)}</p>
                      <p className="cd-item-each">{t('{price} each', { price: formatMoney(item.price) })}</p>

                      {/* Qty stepper */}
                      <div className="cd-stepper">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          aria-label={t('Decrease quantity')}
                          className="cd-stepper-cell cd-stepper-cell-l cd-stepper-btn"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                        <span
                          className="cd-stepper-display"
                          data-just-bumped={bumpedId === item.id ? 'true' : 'false'}
                        >{item.quantity}</span>
                        <button
                          onClick={() => incrementWithBump(item.id, item.quantity + 1)}
                          aria-label={t('Increase quantity')}
                          className="cd-stepper-cell cd-stepper-cell-r cd-stepper-btn"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M5 2v6M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Price + remove */}
                    <div className="cd-item-right">
                      <span className="cd-item-price">{formatMoney((item.price * item.quantity))}</span>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        aria-label={t('Remove {name}', { name: cartItemName(item, lang) })}
                        className="cd-remove-link cd-remove-btn"
                      >
                        {t('Remove')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer: subtotal + checkout ──────────────────────────── */}
        {items.length > 0 && (
          <div className="cd-footer">
            {/* Phase 11.3 — free-shipping threshold upsell. Renders
                only when the user is within $20 of the threshold,
                with up to 3 suggested add-ons in the price gap.
                Dark-pattern-free: informational, no manufactured
                urgency, suggestions never auto-add. */}
            <CartUpsell className="cd-upsell" />
            {/* Subtotal rows. gst + grandTotal computed once via useMemo
                at the top of the component so this re-render path stays
                cheap on rapid drawer state changes. */}
            <div className="cd-subtotals" aria-live="polite" aria-atomic="true">
              <div className="cd-subtotal-row">
                <span className="cd-subtotal-label">{t('Subtotal')}</span>
                <span className="cd-subtotal-value">{formatMoney(totalPrice)}</span>
              </div>
              {gst > 0 && (
                <div className="cd-subtotal-row">
                  <span className="cd-subtotal-label">{t('GST (5%)')}</span>
                  <span className="cd-subtotal-value">{formatMoney(gst)}</span>
                </div>
              )}
            </div>
            <div className="cd-total-row">
              <span className="cd-total-label">{t('Total:')}</span>
              <span className="cd-total-value">{formatMoney(grandTotal)}</span>
            </div>
            <p className="cd-shipping-note">{t('Shipping calculated at checkout.')}</p>

            {/* CTA */}
            <Link
              to={ROUTES.CHECKOUT}
              onClick={close}
              className="cd-cta-primary cd-checkout-btn"
            >
              {t('Proceed to Checkout')}
            </Link>

            <Link
              to={ROUTES.CART}
              onClick={close}
              className="cd-cta-secondary cd-view-cart-btn"
            >
              {t('View Full Cart')}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

// ── BundleCartItem ────────────────────────────────────────────────────────
// Day 16. Renders a gift-bundle line item: single card with a "What's
// inside" disclosure, recipient name preview, and a Remove button. No
// qty stepper — bundles are fixed quantity 1; cartStore.updateQuantity()
// silently ignores qty changes on bundle ids.
function BundleCartItem({
  item, onRemove,
}: { item: CartItem; onRemove: () => void }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const bundle = item.bundle!; // caller guards `if (item.bundle)`

  const recipient = bundle.personalization.recipientName;
  const totalCount = bundle.teas.length + bundle.samples.length +
    (bundle.hasFrenchPress ? 1 : 0);

  return (
    <div className="cd-bundle-row">
      <div className="cd-bundle-grid">
        {/* Gift icon — distinguishes from regular tea items */}
        <div className="cd-bundle-icon">
          <Gift size={18} />
        </div>

        <div className="cd-bundle-info">
          <p className="cd-bundle-name">{tr(item.name)}</p>
          {recipient && (
            <p className="cd-bundle-recipient">{tr('For {name}', { name: recipient })}</p>
          )}
          <p className="cd-bundle-count">
            {tr(totalCount === 1 ? '{count} item' : '{count} items', { count: totalCount })}
          </p>
        </div>

        <span className="cd-bundle-price">{formatMoney(item.price)}</span>
      </div>

      {/* Disclosure — What's inside */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="cd-disclosure"
      >
        {tr('What’s inside')}
        <ChevronDown
          size={12}
          className="cd-disclosure-chev"
          data-open={open ? 'true' : 'false'}
        />
      </button>

      {open && (
        <div className="cd-disclosure-body">
          {bundle.teas.length > 0 && (
            <BundleSubList title={tr('Teas')} items={bundle.teas.map(t => t.name)} />
          )}
          {bundle.samples.length > 0 && (
            <BundleSubList title={tr('Samples')} items={bundle.samples.map(t => t.name)} />
          )}
          {bundle.hasFrenchPress && (
            <BundleSubList title={tr('Extras')} items={['French press']} />
          )}
          {bundle.personalization.message && (
            <div className="cd-msg-block">
              <span className="cd-msg-label">{tr('Card message')}</span>
              <span className="cd-msg-value">
                &ldquo;{bundle.personalization.message}&rdquo;
              </span>
            </div>
          )}
        </div>
      )}

      <div className="cd-bundle-remove-row">
        <button
          onClick={onRemove}
          aria-label={tr('Remove {name}', { name: tr(item.name) })}
          className="cd-remove-link cd-remove-btn"
        >
          {tr('Remove')}
        </button>
      </div>
    </div>
  );
}

function BundleSubList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="cd-sublist">
      <span className="cd-sublist-title">{title}:</span>
      <span>{items.join(' · ')}</span>
    </div>
  );
}
