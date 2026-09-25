/**
 * Notification Schema — discriminated unions per notification type.
 *
 * Why discriminated unions: each notification type has different
 * required + optional fields. A `customer_order_shipped` MUST have
 * `trackingNumber`. A `customer_credit_admin_added` MUST have
 * `pointsAdded` + `newBalance`. Modeling these with a single giant
 * optional-everything object (the previous design) meant TypeScript
 * couldn't help catch missing fields, and consumers had to write
 * runtime checks the schema should have done.
 *
 * After this refactor:
 *   if (n.type === 'customer_order_shipped') {
 *     n.data.trackingNumber  // TS: string (required)
 *     n.data.carrier         // TS: string | undefined (optional)
 *   }
 *
 * For safety while migrating: the strict schema validates new writes
 * (cloud functions + tests use it). The loose schema accepts whatever
 * Firestore returns and is used at the read boundary for backward
 * compat with historical docs that may not satisfy the strict shape.
 */
import { z } from 'zod';
import { firestoreTimestampSchema } from './firestoreTimestamp.schema';

// ── Constants ────────────────────────────────────────────────────────
export const ADMIN_RECIPIENT         = 'admin';
export const MAX_USER_NOTIFICATIONS  = 90;
export const MAX_ADMIN_NOTIFICATIONS = 200;

// ── Notification type enum ───────────────────────────────────────────
export const notificationTypeSchema = z.enum([
  'admin_new_signup',
  'admin_order_placed',
  // A card hold release / refund failed and must be finished in Clover.
  'admin_payment_issue',
  'customer_payment_confirmed',
  // R3 Bug #9: pickup orders get a dedicated notification type. The
  // cloud function (onOrderWrite case 'ready_for_pickup') writes this
  // when admin confirms a pickup order's payment. Without it in the
  // enum, strict notification validation rejected the row.
  'customer_order_ready_for_pickup',
  'customer_order_shipped',
  'customer_order_delivered',
  'customer_order_cancelled',
  'customer_order_rejected',
  'customer_order_expired',
  'customer_credit_earned',
  'customer_credit_admin_added',
  'customer_credit_expiry_warning',
  'customer_credit_reset',
  'customer_welcome_bonus',
  // Sold-out tea the user asked about is available again
  // (onInventoryWrite → notifyBackInStock).
  'customer_back_in_stock',
  // marketing.ts — Account → Notifications: Promotions / New arrivals / Cart reminders.
  'customer_promotion',
  'customer_new_arrival',
  'customer_cart_reminder',
]);

export type NotificationType = z.infer<typeof notificationTypeSchema>;

// ── Per-type data schemas ────────────────────────────────────────────
// Each shape lists what the cloud function actually writes for that
// type. Required fields use plain z.string()/z.number(); optional
// fields use .optional(). Tests pin these contracts.

const orderItemSchema = z.object({
  productName: z.string(),
  quantity:    z.number().int().positive(),
  price:       z.number().nonnegative(),
});

const adminNewSignupData = z.object({
  customerEmail: z.string(),
  customerName:  z.string(),
  joinDate:      z.string(),
});

const adminOrderPlacedData = z.object({
  orderId:       z.string(),
  customerName:  z.string(),
  customerEmail: z.string(),
  customerId:    z.string(),
  totalAmount:   z.number(),
  subtotal:      z.number(),
  shippingFee:   z.number(),
  items:         z.array(orderItemSchema),
  userId:        z.string(),
});

const adminPaymentIssueData = z.object({
  orderId:  z.string(),
  userId:   z.string(),
  chargeId: z.string(),
});

const customerPaymentConfirmedData = z.object({
  orderId: z.string(),
});

const customerOrderShippedData = z.object({
  orderId:        z.string(),
  trackingNumber: z.string(),
  carrier:        z.string().optional(),
});

const customerOrderDeliveredData = z.object({
  orderId:      z.string(),
  pointsEarned: z.number(),
});

// Used by cancelled / rejected / expired (all share this shape).
const customerOrderEndedData = z.object({
  orderId: z.string(),
  reason:  z.string().optional(),
});

const customerCreditEarnedData = z.object({
  orderId:      z.string(),
  pointsEarned: z.number().int().positive(),
});

const customerCreditAdminAddedData = z.object({
  pointsAdded: z.number(),  // signed: positive = add, negative = deduct
  newBalance:  z.number().int().nonnegative(),
  adminNote:   z.string().optional(),
  // Optional context written by onCreditTransactionCreate when the
  // adjustment was tied to an order (refund, earn_reversed) — lets
  // the bell-side renderer link back to the originating order. Pre-fix
  // the strict schema omitted these so any parse against the
  // discriminated union stripped them silently.
  orderId:    z.string().optional(),
  // The underlying creditTransactions.type that triggered this
  // notification: 'admin_add' | 'admin_deduct' | 'refund' | 'earn_reversed'.
  // Useful for the bell to render different copy for an admin manual
  // adjust vs. a system refund.
  sourceType: z.string().optional(),
});

const customerCreditExpiryWarningData = z.object({
  pointsExpiring: z.number().int().nonnegative(),
  expiresOn:      z.string(),
});

const customerCreditResetData = z.object({
  pointsExpired: z.number().int().nonnegative(),
});

const customerWelcomeBonusData = z.object({
  pointsEarned: z.number().int().nonnegative(),
});

const customerPromotionData = z.object({
  code:          z.string(),
  discountType:  z.enum(['percentage', 'fixed']),
  discountValue: z.number(),
  minPurchase:   z.number().optional(),
  url:           z.string(),
});

const customerNewArrivalData = z.object({
  count:     z.number().int().positive(),
  teaName:   z.string(),
  teaNameFr: z.string().optional(),
  url:       z.string(),
});

const customerCartReminderData = z.object({
  url: z.string(),
});

const customerBackInStockData = z.object({
  teaSlug: z.string(),
  teaName: z.string(),
  /** In-app path to the tea page, e.g. /tea-profile/green/sencha-fuji */
  url:     z.string(),
});

// ── Discriminated union ──────────────────────────────────────────────
const baseFields = {
  id:          z.string(),
  recipientId: z.string(),
  title:       z.string(),
  body:        z.string(),
  isRead:      z.boolean(),
  createdAt:   firestoreTimestampSchema,
};

export const notificationSchema = z.discriminatedUnion('type', [
  z.object({ ...baseFields, type: z.literal('admin_new_signup'),               data: adminNewSignupData              }),
  z.object({ ...baseFields, type: z.literal('admin_order_placed'),             data: adminOrderPlacedData            }),
  z.object({ ...baseFields, type: z.literal('admin_payment_issue'),            data: adminPaymentIssueData           }),
  z.object({ ...baseFields, type: z.literal('customer_payment_confirmed'),     data: customerPaymentConfirmedData    }),
  // R3 Bug #9 — pickup notification reuses the minimal `{ orderId }`
  // shape because the bell view doesn't render any pickup-specific
  // data (the body text already carries the "stop by the café" copy).
  z.object({ ...baseFields, type: z.literal('customer_order_ready_for_pickup'), data: customerPaymentConfirmedData    }),
  z.object({ ...baseFields, type: z.literal('customer_order_shipped'),         data: customerOrderShippedData        }),
  z.object({ ...baseFields, type: z.literal('customer_order_delivered'),       data: customerOrderDeliveredData      }),
  z.object({ ...baseFields, type: z.literal('customer_order_cancelled'),       data: customerOrderEndedData          }),
  z.object({ ...baseFields, type: z.literal('customer_order_rejected'),        data: customerOrderEndedData          }),
  z.object({ ...baseFields, type: z.literal('customer_order_expired'),         data: customerOrderEndedData          }),
  z.object({ ...baseFields, type: z.literal('customer_credit_earned'),         data: customerCreditEarnedData        }),
  z.object({ ...baseFields, type: z.literal('customer_credit_admin_added'),    data: customerCreditAdminAddedData    }),
  z.object({ ...baseFields, type: z.literal('customer_credit_expiry_warning'), data: customerCreditExpiryWarningData }),
  z.object({ ...baseFields, type: z.literal('customer_credit_reset'),          data: customerCreditResetData         }),
  z.object({ ...baseFields, type: z.literal('customer_welcome_bonus'),         data: customerWelcomeBonusData        }),
  z.object({ ...baseFields, type: z.literal('customer_back_in_stock'),         data: customerBackInStockData         }),
  z.object({ ...baseFields, type: z.literal('customer_promotion'),             data: customerPromotionData           }),
  z.object({ ...baseFields, type: z.literal('customer_new_arrival'),           data: customerNewArrivalData          }),
  z.object({ ...baseFields, type: z.literal('customer_cart_reminder'),         data: customerCartReminderData        }),
]);

export type Notification = z.infer<typeof notificationSchema>;

// ── Loose schema for read-side backward compat ───────────────────────
// Historical docs written under the old permissive schema may not
// satisfy the strict union (e.g. missing customerEmail in older
// admin notifications). This schema accepts anything with the minimum
// fields the bell needs — type, title, body, isRead. The data object
// is a passthrough; consumers do per-type extraction.
export const notificationLooseSchema = z.object({
  id:          z.string(),
  recipientId: z.string(),
  type:        notificationTypeSchema,
  title:       z.string(),
  body:        z.string(),
  data:        z.record(z.string(), z.unknown()).default({}),
  isRead:      z.boolean(),
  createdAt:   firestoreTimestampSchema,
});

export type NotificationLoose = z.infer<typeof notificationLooseSchema>;

// Old type alias kept for back-compat with admin tooling.
export type NotificationData = NotificationLoose['data'];

// ── Order ID generator (unchanged behaviour, used by orders flow) ───
/**
 * Public-safe, Firestore-doc-ID-safe order ID. Format: `ELE-YYMM-XXXXXX`.
 * 36^6 ≈ 2.18 billion combos per millisecond — collision probability
 * is effectively zero at our scale. Used as the Firestore doc ID for
 * idempotent order creation.
 */
export function generateOrderId(): string {
  const now = new Date();
  const yy  = String(now.getFullYear()).slice(2);
  const mm  = String(now.getMonth() + 1).padStart(2, '0');

  let rand: string;
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buf = new Uint8Array(6);
    crypto.getRandomValues(buf);
    const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    rand = Array.from(buf, b => ALPHA[b % 36]).join('');
  } else {
    rand = Math.random().toString(36).toUpperCase()
      .replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, 'X');
  }

  return `ELE-${yy}${mm}-${rand}`;
}

export function formatCustomerId(count: number): string {
  return `CUS-${String(count).padStart(5, '0')}`;
}
