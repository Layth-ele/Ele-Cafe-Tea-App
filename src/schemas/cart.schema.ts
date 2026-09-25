import { z } from 'zod';

/**
 * Cart Schema — round-trip-safe validation for the cart line item.
 *
 * Cleanup background:
 *
 * Pre-cleanup this schema rejected real CartItem instances because:
 *   • `price: z.number().positive()` rejected zero-priced free items
 *     (promo prizes, samples).
 *   • `image: z.string().url()` rejected admin "Custom Item" lines
 *     and anything with an empty / relative image path.
 *   • Missing `stock` field — the runtime CartItem in cartStore.ts
 *     carries a per-item stock cap that the store uses to refuse
 *     overflows. The schema would have stripped it on parse.
 *   • Missing `bundle` field — gift-builder bundles add a per-line-
 *     item bundle blob (recipient, sender, message, constituent teas).
 *     The schema would have stripped that, breaking gift-order data
 *     round-trip.
 *
 * The validators below were never called at runtime, so the schema rot
 * never surfaced as a real bug — but anyone who tried to call them
 * (e.g., to validate the persisted /carts/{userId} doc in tests, in a
 * future migration script, or as a defense-in-depth check at the
 * setItems boundary) would have seen real CartItem instances rejected
 * for entirely fictional violations.
 *
 * After cleanup the schema reflects what cartStore.ts actually puts on
 * a line item, so calls to validateCart / validateCartItem succeed on
 * real data. Bundles are loose-shaped on purpose — cartStore is the
 * source of truth for bundle internals and the schema's job here is
 * round-trip correctness, not bundle-detail enforcement.
 *
 * Why .passthrough() at the end of the line-item shape: forward-compat.
 * If a future feature adds a field to CartItem (e.g. a per-line note
 * for gift orders), the existing validators don't suddenly start
 * stripping unknown fields off persisted carts.
 */

// Bundle metadata — mirrors src/store/cartStore.ts BundleLineItemMeta.
// Loose-shaped intentionally (see file header).
const cartBundleSchema = z.object({
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

export const cartItemSchema = z.object({
  // product document ID / slug, OR a `bundle-{uuid}` id for gift-builder
  // bundle line items. min(1) keeps it non-empty.
  id:            z.string().min(1),
  name:          z.string().min(1),
  // Free items (promo prizes, samples) are legitimate — allow 0.
  // Cleanup: was `.positive()` which rejected free items.
  price:         z.number().nonnegative(),
  quantity:      z.number().int().positive('Quantity must be positive'),
  // Image is optional — admin custom-item lines may not have one,
  // and tests / migrations may legitimately produce items with empty
  // image fields. Cleanup: was `.url()` which rejected empty strings
  // AND relative paths.
  image:         z.string().optional(),
  category:      z.string().optional(),
  /**
   * gstApplicable — carried from the product so the cart can compute GST
   * per-line without re-fetching product data. Default false (most teas).
   */
  gstApplicable: z.boolean().optional().default(false),
  /**
   * Per-item stock cap copied from the product at add-time. Optional —
   * items without a cap (e.g. bundles) are uncapped. Cleanup: was
   * missing entirely; runtime CartItem has had this for many releases.
   */
  stock:         z.number().int().nonnegative().optional(),
  /**
   * Bundle metadata — present iff this line item is a gift-builder
   * bundle. Cleanup: was missing entirely; runtime carts with bundles
   * round-tripped through this schema would have been stripped.
   */
  bundle:        cartBundleSchema.optional(),
}).passthrough();

export type CartItem = z.infer<typeof cartItemSchema>;

/**
 * Cart Schema — the Firestore document at /carts/{userId}
 */
export const cartSchema = z.object({
  items:     z.array(cartItemSchema),
  // updatedAt is written as Date.now() (a number) by useCartSync — see
  // /carts persist effect. It's also accepted as Date here so test
  // fixtures using `new Date()` still validate.
  updatedAt: z.union([z.date(), z.number().nonnegative()]).optional(),
}).passthrough();

export type Cart = z.infer<typeof cartSchema>;

/**
 * Add to Cart Input — the lightweight shape consumers might validate
 * before calling cartStore.addToCart. Note: addToCart() takes a richer
 * shape (the full Omit<CartItem, 'quantity'>), but this schema is for
 * the public/API-surface input where only id+quantity are required.
 */
export const addToCartSchema = z.object({
  id:       z.string().min(1),
  quantity: z.number().int().positive().default(1),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;

/**
 * Update Cart Item Quantity — quantity === 0 is a remove signal.
 */
export const updateCartItemSchema = z.object({
  id:       z.string().min(1),
  quantity: z.number().int().min(0, 'Quantity cannot be negative'),
});

export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

// ── Validation helpers ────────────────────────────────────────────────────────
export const validateCart           = (d: unknown) => cartSchema.safeParse(d);
export const validateAddToCart      = (d: unknown) => addToCartSchema.safeParse(d);
export const validateUpdateCartItem = (d: unknown) => updateCartItemSchema.safeParse(d);
export const validateCartItem       = (d: unknown) => cartItemSchema.safeParse(d);
