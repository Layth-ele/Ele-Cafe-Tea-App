import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  Package,
  RefreshCw,
  RotateCcw,
  Star,
  Truck,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchTeas } from '@/lib/firebaseQueries';
import type { LucideIcon } from 'lucide-react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

import { useReorder } from '@/hooks/useReorder';
import { OrderStatusTimeline } from '@/app/components/OrderStatusTimeline';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { ROUTES } from '@/lib/routes';
// R2 Bug #8: import the canonical OrderStatus + Order types from the
// schema instead of re-declaring them locally. Keeping them in sync
// with the cloud function's enum was previously a manual chore.
import type { OrderStatus, Order } from '@/schemas/order.schema';

import { useT, useTx, localeFor, currentLang } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
// Subset of `Order` actually rendered on this page. Pulled from the
// canonical Order type via Pick so any schema change either keeps us
// honest (TS error here) or flows through automatically.
type OrderDoc = Pick<
  Order,
  | 'id'
  | 'orderId'
  | 'status'
  | 'items'
  | 'subtotal'
  | 'creditApplied'
  | 'shippingFee'
  | 'gst'
  | 'totalAmount'
  | 'fulfillmentMethod'
  | 'shippingAddress'
  | 'trackingNumber'
  | 'carrier'
  | 'adminNote'
  | 'cancellationReason'
  | 'rejectionReason'
  | 'payment'
> & {
  // createdAt is a Date in the schema (post-validation), but the raw
  // Firestore doc carries a Timestamp. We don't run the doc through
  // the validator on this page (subscription would block on every
  // update) so the page-local shape uses Timestamp.
  createdAt: Timestamp;
};

/** What happened on the customer's card, in plain words. */
function PaymentLine({ order }: { order: OrderDoc }) {
  const t = useT();
  const tx = useTx();
  const p = order.payment;
  if (!p || p.status === 'not_required') return null;
  const card = p.last4
    ? t('{brand} ending {last4}', { brand: p.cardBrand ?? t('Card'), last4: p.last4 })
    : t('your card');
  const dollars = (cents?: number | null) => <strong>{formatMoney((cents ?? 0) / 100)}</strong>;
  const text =
    p.status === 'authorized'
      ? tx(
          "A hold of {amount} is on {card}. You'll only be charged once we confirm your teas are in stock.",
          { amount: dollars(p.authorizedAmount), card },
        )
      : p.status === 'captured'
        ? tx('Paid {amount} with {card}.', { amount: dollars(p.capturedAmount), card })
        : p.status === 'released'
          ? t('The hold on {card} was released — you were not charged.', { card })
          : p.status === 'refunded'
            ? tx('Refunded {amount} to {card}. It can take 5–10 business days to appear.', {
                amount: dollars(p.refundedAmount ?? p.capturedAmount),
                card,
              })
            : null;
  if (!text) return null;
  return (
    <div className="orders-payment-line" data-status={p.status}>
      <CreditCard size={13} aria-hidden="true" /> <span>{text}</span>
    </div>
  );
}

const STATUS: Record<OrderStatus, { label: string; icon: LucideIcon; color: string; bg: string }> =
  {
    pending: {
      label: 'Confirming Stock',
      icon: Clock,
      color: 'var(--warning)',
      bg: 'var(--warning-bg)',
    },
    in_progress: {
      label: 'Confirmed — Preparing',
      icon: CheckCircle2,
      color: 'var(--success)',
      bg: 'var(--success-bg)',
    },
    // R1 Bug #22: dedicated pickup-ready status with its own icon + copy.
    ready_for_pickup: {
      label: 'Ready for Pickup',
      icon: Package,
      color: 'var(--success)',
      bg: 'var(--success-bg)',
    },
    shipped: { label: 'Shipped', icon: Truck, color: 'var(--info)', bg: 'var(--info-bg)' },
    delivered: {
      label: 'Delivered',
      icon: MapPin,
      color: 'var(--success)',
      bg: 'var(--success-bg)',
    },
    cancelled: {
      label: 'Cancelled',
      icon: XCircle,
      color: 'var(--danger)',
      bg: 'var(--danger-bg)',
    },
    rejected: { label: 'Rejected', icon: XCircle, color: 'var(--danger)', bg: 'var(--danger-bg)' },
    expired: {
      label: 'Expired',
      icon: AlertTriangle,
      color: 'var(--muted)',
      bg: 'var(--surface-3)',
    },
  };

// R2 Bug #10: previously `fmtDate` stripped the time entirely, so two
// orders placed on the same day were indistinguishable. Now we render
// short date + 24-hour time so customers can tell them apart and match
// confirmation emails.
function fmtDate(ts: Timestamp | undefined) {
  if (!ts) return '';
  const d = ts.toDate();
  return d.toLocaleString(localeFor(currentLang()), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// R1 Bug #2: shipping-address fallbacks were inconsistent (`'—'` for some
// fields, `''` for others) and produced "John, —, , , " strings. This
// helper composes the address compactly, dropping empty fields entirely
// rather than emitting orphan commas.
function formatShippingAddress(a: NonNullable<OrderDoc['shippingAddress']>): string {
  const parts: string[] = [];
  if (a.name) parts.push(a.name);
  if (a.address) parts.push(a.address);
  // City + province + postal share a line in the source format, but for
  // the customer-facing list we just join with commas. The admin order
  // detail still uses a structured layout.
  const cityLine = [a.city, a.province, a.postalCode].filter(Boolean).join(' ');
  if (cityLine.trim()) parts.push(cityLine.trim());
  if (a.country) parts.push(a.country);
  let out = parts.join(', ');
  if (a.phone) out += ` · ${a.phone}`;
  return out || '—';
}

export function OrdersPage() {
  const t = useT();
  const tx = useTx();
  const { currentUser } = useAuth();
  const reorder = useReorder();
  // Tea id → category/slug, for the "Rate" links on delivered orders.
  const { data: catalog = [] } = useQuery({
    queryKey: ['teas'],
    queryFn: () => fetchTeas(),
    staleTime: 5 * 60 * 1000,
  });
  const teaIndex = new Map(
    catalog
      .filter((p) => p.slug && p.category)
      .flatMap(
        (p) =>
          [
            [p.id ?? '', { category: p.category as string, slug: p.slug as string }],
            [p.slug as string, { category: p.category as string, slug: p.slug as string }],
          ] as const,
      ),
  );
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  // R1 Bug #1: subscription-error case previously rendered the empty
  // state, indistinguishable from "you have no orders". Track the
  // error explicitly so we can show a real message + retry button.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!currentUser) {
      setOrders([]);
      setLoading(false);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    return onSnapshot(
      q,
      (snap) => {
        setOrders(snap.docs.map((d) => ({ ...(d.data() as Omit<OrderDoc, 'id'>), id: d.id })));
        setLoading(false);
        setLoadError(null);
      },
      (err) => {
        // Surface the failure rather than collapsing into "no orders".
        // permission-denied is the most common cause when rules misfire;
        // network errors come up offline.
        console.error('[OrdersPage] subscription error:', err);
        const code = (err as { code?: string }).code ?? '';
        const msg =
          code === 'permission-denied'
            ? "We couldn't load your orders. Please refresh, or sign out and back in."
            : "We couldn't reach the server. Check your connection and try again.";
        setLoadError(msg);
        setLoading(false);
      },
    );
  }, [currentUser, retryKey]);

  if (!currentUser) {
    return (
      <div className="empty-state orders-signin-empty">
        <div className="empty-state-icon">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <h3>{t('Sign in to view orders')}</h3>
        <p>{t('Please sign in to your account to view your order history.')}</p>
      </div>
    );
  }

  return (
    <div className="orders-shell">
      <SeoHead
        title="My Orders | Ele Café"
        description="Track your Ele Café tea orders and send payment for approved orders."
        noIndex={true}
      />
      <div className="orders-container">
        <Breadcrumbs
          items={[
            { name: 'Home', url: ROUTES.HOME },
            { name: 'My Account', url: ROUTES.ACCOUNT },
            { name: 'Orders', url: ROUTES.ORDERS },
          ]}
        />
        <div className="page-hero">
          <span className="overline">{t('Account')}</span>
          <h1>{t('My Orders')}</h1>
          <div className="page-hero-rule" />
        </div>
        {loading ? (
          <div className="orders-skeleton-list">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton orders-skeleton-row" />
            ))}
          </div>
        ) : loadError ? (
          // R1 Bug #1: real error state distinct from "no orders".
          <div className="empty-state">
            <div className="empty-state-icon">
              <AlertTriangle size={24} />
            </div>
            <h3>{t("Couldn't load your orders")}</h3>
            <p>{loadError}</p>
            <button
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                setRetryKey((k) => k + 1);
              }}
              className="btn btn-outline btn-sm orders-retry-btn"
            >
              <RefreshCw size={13} /> {t('Retry')}
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
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
            <h3>{t('No orders yet')}</h3>
            <p>{t('Your orders will appear here once you make a purchase.')}</p>
          </div>
        ) : (
          <div className="orders-list">
            {orders.map((order) => {
              // R1 Bug #9 + R2 Bug #9: an unknown status no longer
              // silently masquerades as "Expired". Render an explicit
              // "Status update pending" pill so customers don't think
              // their order died when it didn't, and admin gets a
              // visual cue that data is in an unexpected state.
              const meta = STATUS[order.status as OrderStatus] ?? {
                label: 'Status update pending',
                icon: Clock,
                color: 'var(--muted)',
                bg: 'var(--surface-3)',
              };
              const Icon = meta.icon;
              // R2 Bug #25: align the orderId fallback with AdminOrders
              // (`||` rather than `??`, full id rather than slice). Both
              // surfaces now show the SAME identifier for the same order.
              const displayId = order.orderId || order.id;
              return (
                <div key={order.id} className="order-card">
                  <div className="orders-card-header">
                    <span className="orders-card-id">{displayId}</span>
                    {/* mixed-static: layout/shape are class-driven; only the
                        bg + color come from `meta` (varies per order status).
                        Pass them via inline style so the class stays
                        meta-agnostic. The eslint rule ignores this because
                        we genuinely need the per-status palette. */}
                    {/* eslint-disable-next-line react/forbid-dom-props */}
                    <span
                      className="orders-card-status-pill"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      <Icon size={13} /> {t(meta.label)}
                    </span>
                    <span className="orders-card-date">{fmtDate(order.createdAt)}</span>
                    {/* Reorder — pushes a fresh copy of this order's items
                        into the cart store and opens the drawer. Bundles
                        are skipped (they need rebuilding in the gift
                        builder). See useReorder for the full rules. */}
                    <button
                      type="button"
                      onClick={() => reorder(order.items)}
                      className="btn btn-outline btn-sm orders-reorder-btn"
                      aria-label={t('Reorder {id}', { id: displayId })}
                    >
                      <RotateCcw size={13} /> {t('Reorder')}
                    </button>
                  </div>
                  {/* Phase 11.7 — fulfillment timeline. Renders a
                      4-step horizontal progress indicator with carrier
                      tracking link when status >= shipped. Terminal
                      non-happy paths (cancelled/rejected/expired)
                      render a status pill instead. */}
                  <OrderStatusTimeline order={order} />
                  <div className="orders-card-body">
                    <div className="orders-col-items">
                      <div className="orders-col-label">{t('Items:')}</div>
                      {order.items.map((item, i) => (
                        // Composite key — combine productId + index so
                        // duplicate productIds (rare but possible) don't
                        // collide on the array index alone.
                        <div key={`${item.productId ?? i}-${i}`} className="orders-item-line">
                          <span className="text-muted">
                            {item.productName} × {item.quantity}
                          </span>
                          <span className="orders-item-right">
                            {order.status === 'delivered' &&
                              item.productId &&
                              teaIndex.get(item.productId) && (
                                <Link
                                  to={`${ROUTES.TEA_PROFILE(teaIndex.get(item.productId)!.category, teaIndex.get(item.productId)!.slug)}#reviews`}
                                  className="orders-rate-link"
                                >
                                  <Star size={12} aria-hidden="true" /> {t('Rate')}
                                </Link>
                              )}
                            {formatMoney(item.price * item.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="orders-col-shipping">
                      <div className="orders-col-label">
                        {order.fulfillmentMethod === 'pickup' ? t('Fulfillment:') : t('Shipping:')}
                      </div>
                      <div className="orders-shipping-text">
                        {order.fulfillmentMethod === 'pickup' ? (
                          <>{t('Pickup at store')}</>
                        ) : order.shippingAddress ? (
                          // R1 Bug #2: helper drops empty parts cleanly.
                          formatShippingAddress(order.shippingAddress)
                        ) : (
                          <span className="orders-shipping-empty">—</span>
                        )}
                      </div>
                    </div>
                    <div className="orders-col-total">
                      <div className="orders-col-label">{t('Total:')}</div>
                      <div className="orders-total-amount">
                        {formatMoney(order.totalAmount ?? 0)}
                      </div>
                    </div>
                  </div>
                  {order.adminNote && <div className="orders-admin-note">{order.adminNote}</div>}
                  {(order.rejectionReason || order.cancellationReason) && (
                    <div className="orders-rejection-note">
                      <strong>{t('Reason:')} </strong>
                      {order.cancellationReason || order.rejectionReason}
                    </div>
                  )}
                  {order.trackingNumber && (
                    <div className="orders-tracking-line">
                      {t('Tracking: {number}', { number: order.trackingNumber ?? '' })}{' '}
                      {order.carrier && <span>({order.carrier})</span>}
                    </div>
                  )}

                  {/* R1 Bug #22 follow-up: pickup-specific copy when the
                      order is ready at the counter. */}
                  {order.status === 'ready_for_pickup' && (
                    <div className="orders-pickup-banner">
                      <div className="orders-pickup-title">
                        <Package size={13} /> {t('Your order is ready')}
                      </div>
                      <div className="orders-pickup-body">
                        {tx(
                          "Stop by the café and bring your order number {id} — we'll have it at the counter for you.",
                          { id: <strong className="orders-mono">{displayId}</strong> },
                        )}
                      </div>
                    </div>
                  )}

                  <PaymentLine order={order} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default OrdersPage;
