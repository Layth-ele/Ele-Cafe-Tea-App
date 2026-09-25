import type { NotificationType } from '@/schemas/notification.schema';

type Meta = {
  emoji: string;
  category: 'order' | 'credit' | 'account' | 'stock';
  audience: 'admin' | 'user';
};

export const NOTIFICATION_META: Record<NotificationType, Meta> = {
  admin_new_signup:               { emoji: '🆕', category: 'account', audience: 'admin' },
  admin_order_placed:             { emoji: '🧾', category: 'order', audience: 'admin' },
  admin_payment_issue:            { emoji: '⚠️', category: 'order', audience: 'admin' },
  customer_payment_confirmed:     { emoji: '💳', category: 'order', audience: 'user' },
  // R3 Bug #9 follow-through: pickup orders use a dedicated notification
  // type so the bell can show a pickup-specific emoji and the
  // notification message reads "ready for pickup" rather than the
  // generic "shipped" copy. Wired into the schema's discriminated
  // union with the same `{ orderId }` data shape as payment_confirmed.
  customer_order_ready_for_pickup:{ emoji: '📦', category: 'order', audience: 'user' },
  customer_order_shipped:         { emoji: '📦', category: 'order', audience: 'user' },
  customer_order_delivered:       { emoji: '🎉', category: 'order', audience: 'user' },
  customer_order_cancelled:       { emoji: '❌', category: 'order', audience: 'user' },
  customer_order_rejected:        { emoji: '⛔', category: 'order', audience: 'user' },
  customer_order_expired:         { emoji: '⏰', category: 'order', audience: 'user' },
  customer_credit_earned:         { emoji: '🪙', category: 'credit', audience: 'user' },
  customer_credit_admin_added:    { emoji: '🎁', category: 'credit', audience: 'user' },
  customer_credit_expiry_warning: { emoji: '⚠️', category: 'credit', audience: 'user' },
  customer_credit_reset:          { emoji: '♻️', category: 'credit', audience: 'user' },
  customer_welcome_bonus:         { emoji: '👋', category: 'account', audience: 'user' },
  customer_back_in_stock:         { emoji: '🍵', category: 'stock', audience: 'user' },
  customer_promotion:             { emoji: '🏷️', category: 'account', audience: 'user' },
  customer_new_arrival:           { emoji: '✨', category: 'stock', audience: 'user' },
  customer_cart_reminder:         { emoji: '🛒', category: 'order', audience: 'user' },
};

const s = (v: unknown) => (typeof v === 'string' ? v : '');

type TFn = (key: string, vars?: Record<string, string | number>) => string;
/** Default translator: English source with {placeholders} filled. */
const en: TFn = (k, v) => (v ? k.replace(/\{(\w+)\}/g, (m, n: string) => String(v[n] ?? m)) : k);

/**
 * Title/body for a notification from its type + data. The bell uses this
 * with the French translator when the site is in French (the stored
 * title/body are English, written by Cloud Functions). Pass useT()'s t.
 */
export function buildNotificationMessage(
  input: { type: NotificationType; data: Record<string, unknown> },
  t: TFn = en,
  locale = 'en-CA',
): { title: string; body: string } {
  const { type, data } = input;
  const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;
  const int = (n: unknown) => Number(n ?? 0).toLocaleString(locale);
  const id = s(data.orderId);
  const reasonOr = (fallback: string) => (s(data.reason) ? t('Reason: {reason}', { reason: s(data.reason) }) : t(fallback));
  switch (type) {
    case 'admin_new_signup':
      return { title: t('New signup: {name}', { name: s(data.customerName) || t('Customer') }), body: t('{name} joined with {email}.', { name: s(data.customerName) || t('A customer'), email: s(data.customerEmail) }) };
    case 'admin_order_placed':
      return { title: t('Order placed: {id}', { id }), body: t('{name} placed an order for {amount}.', { name: s(data.customerName) || t('Customer'), amount: money(data.totalAmount) }) };
    case 'admin_payment_issue':
      return { title: t('Action needed: {id}', { id }), body: t('A card hold release or refund failed — finish it in the Clover dashboard.') };
    case 'customer_payment_confirmed':
      return { title: t('Order {id} confirmed', { id }), body: t('Your teas are in stock and your card was charged. We are preparing your order.') };
    case 'customer_order_ready_for_pickup':
      return { title: t('Ready for pickup: {id}', { id }), body: t('Your order is at the counter — bring your order number when you stop by.') };
    case 'customer_order_shipped':
      return { title: t('Order shipped: {id}', { id }), body: s(data.carrier)
        ? t('Tracking: {number} ({carrier})', { number: s(data.trackingNumber), carrier: s(data.carrier) })
        : t('Tracking: {number}', { number: s(data.trackingNumber) }) };
    case 'customer_order_delivered': {
      const pts = Number(data.pointsEarned ?? 0);
      return { title: t('Delivered: {id}', { id }), body: pts > 0 ? t('Enjoy your tea! You earned {count} pts.', { count: int(pts) }) : t('Enjoy your tea!') };
    }
    case 'customer_order_cancelled':
      return { title: t('Order cancelled: {id}', { id }), body: reasonOr('Your order was cancelled.') };
    case 'customer_order_rejected':
      return { title: t('Order rejected: {id}', { id }), body: reasonOr('Your order was rejected.') };
    case 'customer_order_expired':
      return { title: t('Order expired: {id}', { id }), body: reasonOr('Payment window expired.') };
    case 'customer_credit_earned':
      return { title: t('+{count} points earned', { count: int(data.pointsEarned) }), body: t('From order {id}.', { id }) };
    case 'customer_credit_admin_added': {
      // Same comma-grouped format as the Cloud Function's stored title.
      const points = Number(data.pointsAdded ?? 0);
      const abs = Math.abs(points).toLocaleString(locale);
      return {
        title: points >= 0 ? t('+{count} bonus points', { count: abs }) : t('-{count} points adjusted', { count: abs }),
        body: t('New balance: {count} pts', { count: int(data.newBalance) }) + (s(data.adminNote) ? ` · ${s(data.adminNote)}` : ''),
      };
    }
    case 'customer_credit_expiry_warning':
      return { title: t('{count} points expiring soon', { count: int(data.pointsExpiring) }), body: t('Use them before {date}.', { date: s(data.expiresOn) }) };
    case 'customer_credit_reset':
      return { title: t('Points expired'), body: t('{count} points expired.', { count: int(data.pointsExpired) }) };
    case 'customer_welcome_bonus':
      return { title: t('Welcome bonus unlocked'), body: t('You received {count} points.', { count: int(data.pointsEarned) }) };
    case 'customer_back_in_stock':
      return { title: t('{name} is back in stock', { name: s(data.teaName) || t('Your tea') }), body: t('Grab it before it sells out again.') };
    case 'customer_promotion': {
      const value = Number(data.discountValue ?? 0);
      const offer = data.discountType === 'fixed' ? t('${value} off', { value }) : t('{value}% off', { value });
      return { title: t('{offer} with code {code}', { offer, code: s(data.code) }), body: t('Use the code at checkout.') };
    }
    case 'customer_new_arrival': {
      const count = Number(data.count ?? 1);
      const name = (locale.startsWith('fr') && s(data.teaNameFr)) || s(data.teaName);
      return count > 1
        ? { title: t('{count} new teas just arrived', { count }), body: t('Be among the first to try them.') }
        : { title: t('New tea: {name}', { name }), body: t('Be among the first to try it.') };
    }
    case 'customer_cart_reminder':
      return { title: t('Your cart is waiting'), body: t('Your teas are still in your cart.') };
    default:
      return { title: t('Notification'), body: t('You have a new update.') };
  }
}
