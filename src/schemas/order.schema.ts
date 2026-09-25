import { z } from 'zod';
import { shippingAddressSchema } from './address.schema';

/* ── Status enum — card payment flow ─────────────────────────
   pending          → order placed, card hold placed, awaiting admin approval
   in_progress      → admin approved: stock confirmed + card charged
   ready_for_pickup → pickup order ready at the café
   shipped          → physically dispatched (delivery only)
   delivered        → customer received (delivery) / picked up (pickup)
   cancelled        → cancelled (hold released, or charge refunded)
   rejected         → admin rejected during review (hold released)
   expired          → not approved within settings.orderExpiryHours (hold released)

   `ready_for_pickup` was added so pickup orders aren't forced through
   the `shipped → delivered` taxonomy. Customer- and admin-facing UIs
   read this status and present pickup-specific copy (Bug #22 round 1).
   ──────────────────────────────────────────────────────────── */
/**
 * Order lifecycle (card payments):
 *   pending          card hold placed, waiting for admin approval
 *   in_progress      approved: stock confirmed + card charged (approveOrder)
 *   ready_for_pickup / shipped → delivered
 *   rejected / cancelled / expired  hold released (or charge refunded)
 */
export const orderStatusSchema = z.enum([
  'pending',
  'in_progress',
  'ready_for_pickup',
  'shipped',
  'delivered',
  'cancelled',
  'rejected',
  'expired',
]);

export type OrderStatus = z.infer<typeof orderStatusSchema>;

/** Card payment record — written only by Cloud Functions (placeOrder,
 *  approveOrder, onOrderWrite). Amounts are in cents. */
export const orderPaymentSchema = z.object({
  provider:         z.enum(['clover', 'none']),
  status:           z.enum(['authorized', 'captured', 'released', 'refunded', 'not_required']),
  chargeId:         z.string().optional(),
  authorizedAmount: z.number().int().nonnegative().optional(),
  capturedAmount:   z.number().int().nonnegative().optional(),
  refundedAmount:   z.number().int().nonnegative().nullable().optional(),
  cardBrand:        z.string().nullable().optional(),
  last4:            z.string().nullable().optional(),
  settleError:      z.string().optional(),
}).passthrough();
export type OrderPayment = z.infer<typeof orderPaymentSchema>;

// Bundle metadata mirrored from src/store/cartStore.ts BundleLineItemMeta.
// Loose-shaped intentionally: the cart store is the source of truth, and
// this validator only needs to keep the doc round-trippable through
// validateOrder() rather than enforce bundle-detail correctness.
const bundleLineItemSchema = z.object({
  slug:           z.string().min(1).optional(),
  name:           z.string().min(1).optional(),
  teas:           z.array(z.unknown()).optional(),
  samples:        z.array(z.unknown()).optional(),
  hasFrenchPress: z.boolean().optional(),
  personalization: z.object({
    recipientName:  z.string().optional(),
    senderName:     z.string().optional(),
    occasion:       z.string().optional(),
    customOccasion: z.string().optional(),
    message:        z.string().optional(),
    deliveryDate:   z.string().nullable().optional(),
  }).optional(),
}).passthrough();

export const orderItemSchema = z.object({
  // productId required for non-bundle items (server-side stock decrement
  // keys off it). Bundle items use `bundle-{uuid}` and the stock loop
  // skips them because no /teas/{productId} doc exists.
  productId:   z.string().min(1),
  productName: z.string().min(1),
  // quantity ≥ 1 — cart store never produces zero or negative.
  quantity:    z.number().int().positive(),
  // Free items are legitimate (promo prizes, samples) — allow 0.
  // Round 2 Bug #23: `.positive()` was rejecting these.
  price:       z.number().nonnegative(),
  // image is optional — admin "Custom Item" lines may not have one.
  // Round 2 Bug #23: previously `.url()` rejected admin custom items.
  image:       z.string().optional(),
  // Bundle blob, present iff this line was a gift bundle.
  bundle:      bundleLineItemSchema.optional(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

// Fulfillment method — pickup is free at-store, delivery has shipping fee.
export const fulfillmentMethodSchema = z.enum(['pickup', 'delivery']);
export type FulfillmentMethod = z.infer<typeof fulfillmentMethodSchema>;

export const orderSchema = z.object({
  id:              z.string().min(1),
  orderId:         z.string().min(1),
  userId:          z.string().min(1),
  customerId:      z.string().optional().default(''),
  items:           z.array(orderItemSchema).min(1),
  subtotal:        z.number().nonnegative(),
  creditApplied:   z.number().nonnegative().default(0),
  // Points the customer claimed to redeem at write time. May exceed
  // what was actually deducted (see creditPointsActuallyDeducted).
  // Round 2 Bug #24: schema was missing this field.
  creditPointsRedeemed:         z.number().nonnegative().optional().default(0),
  // Marker written by onOrderWrite after the deduction transaction.
  // If validation failed or points were force-zeroed, this carries the
  // actual deducted value so refund emails surface the right number.
  // Round 2 Bug #24.
  creditPointsActuallyDeducted: z.number().nonnegative().optional(),
  // Promo (canonical) + legacy aliases. `discount` / `discountCode` are
  // older names kept readable for backward compat; new writes always use
  // `promoDiscount` / `promoCode`.
  promoDiscount:   z.number().nonnegative().optional().default(0),
  promoCode:       z.string().nullable().optional(),
  promotionId:     z.string().nullable().optional(),
  discount:        z.number().nonnegative().optional(),
  discountCode:    z.string().optional(),
  shippingFee:     z.number().nonnegative().default(0),
  gst:             z.number().nonnegative().default(0),
  // totalAmount can be 0 (order fully covered by credit). Use
  // nonnegative — the writer's Math.max(0, …) floor matches.
  // Round 2 Bug #23: previously `.positive()` rejected $0 totals.
  totalAmount:     z.number().nonnegative(),
  status:          orderStatusSchema,
  payment:         orderPaymentSchema.optional(),
  fulfillmentMethod: fulfillmentMethodSchema.optional().default('delivery'),
  shippingAddress: shippingAddressSchema.optional(),
  trackingNumber:  z.string().optional(),
  carrier:         z.string().optional(),
  adminNote:       z.string().optional(),
  cancellationReason: z.string().optional(),
  rejectionReason:    z.string().optional(),
  // Stock-restoration marker — set true by onOrderWrite pending branch
  // when the decrement transaction succeeded. False if the order was
  // rejected before any decrement.
  decremented:     z.boolean().optional(),
  // Restoration marker — set true by `restoreStockAndCredit` (CF helper
  // fired on cancelled/rejected/expired transitions) once stock has been
  // restored and any redeemed credit refunded. The helper is idempotent
  // via this flag — re-fires of the same trigger are no-ops. Schema-
  // fidelity round 2: the CF was writing this field but the schema
  // didn't declare it, so a strict `validateOrder()` round-trip would
  // have stripped it. Now matches the on-disk shape.
  restored:        z.boolean().optional(),
  restoredAt:      z.date().optional(),
  // Gift fields — mirrored from cart bundle so admin filters work
  // without a data migration.
  isGift:          z.boolean().optional(),
  recipientName:   z.string().optional(),
  senderName:      z.string().optional(),
  giftMessage:     z.string().optional(),
  occasion:        z.string().optional(),
  customOccasion:  z.string().optional(),
  // Status timestamps written incrementally as the order moves.
  approvedAt:      z.date().optional(),
  paidAt:          z.date().optional(),
  shippedAt:       z.date().optional(),
  deliveredAt:     z.date().optional(),
  pickedUpAt:      z.date().optional(),
  createdAt:       z.date(),
  updatedAt:       z.date(),
}).passthrough(); // tolerate forward-compat fields the cloud function may add

export type Order = z.infer<typeof orderSchema>;

export const createOrderSchema = orderSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const validateOrder = (data: unknown) => orderSchema.safeParse(data);

/**
 * Admin Order EDIT FORM Schema — Phase 6
 *
 * UI-shape schema for AdminOrders' EditOrderModal. The page used to
 * do ad-hoc validation in handleSave (item.length > 0, finite price,
 * positive integer quantity) plus silent `Math.max(0, parseFloat())`
 * clamping on shipping fee and discount. This schema makes every
 * rule explicit and surfaces violations as inline RHF errors.
 *
 * Differs from `orderSchema` (the storage shape) in:
 *   - No id, no timestamps (those are server-side concerns).
 *   - Items strictly required to be non-empty (matches the existing
 *     "Order must have at least one item" runtime check).
 *   - Per-item: productName non-empty, price ≥ 0, quantity ≥ 1.
 *   - Shipping fee and discount: ≥ 0 (the Math.max() floor becomes
 *     a validation rule that surfaces the issue rather than hiding it).
 *   - discountCode and adminNote: optional strings (free-form).
 */
export const adminOrderEditItemSchema = z.object({
  productId:   z.string().optional(),
  productName: z.string().trim().min(1, 'Item name is required'),
  quantity:    z.number().int('Quantity must be a whole number').min(1, 'Quantity must be at least 1'),
  price:       z.number().min(0, 'Price cannot be negative'),
  image:       z.string().optional(),
});

export const adminOrderEditFormSchema = z.object({
  items:        z.array(adminOrderEditItemSchema).min(1, 'Order must have at least one item'),
  shippingFee:  z.number().min(0, 'Shipping fee cannot be negative'),
  discount:     z.number().min(0, 'Discount cannot be negative'),
  discountCode: z.string(),
  adminNote:    z.string(),
});

export type AdminOrderEditFormInput = z.infer<typeof adminOrderEditFormSchema>;
export type AdminOrderEditItem      = z.infer<typeof adminOrderEditItemSchema>;
