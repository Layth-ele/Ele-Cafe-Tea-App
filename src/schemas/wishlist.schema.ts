import { z } from 'zod';

/**
 * Wishlist schema layer
 *
 * Keep wishlist shape validated at boundaries:
 * - localStorage hydration
 * - Firestore mirror writes/reads
 * - share-token decode payload
 */

export const wishlistSlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9-_.~%]+$/);

export const wishlistItemSchema = z.object({
  slug: wishlistSlugSchema,
  name: z.string().min(1).max(160),
  category: z.string().min(1).max(80),
  // '' for teas without a photo yet — the thumbnail falls back to TeaPlaceholder.
  image: z.string().max(2048),
  priceAtSave: z.number().min(0).max(99999),
  addedAt: z.number().int().nonnegative(),
  /** Explicit "Notify me" request — email once when the tea is back in
   *  stock. The server clears it after sending. Plain hearts leave it
   *  unset and follow the user's lowStock email preference instead. */
  notify: z.boolean().optional(),
});

export type WishlistItemSchema = z.infer<typeof wishlistItemSchema>;

export const createWishlistItemInputSchema = wishlistItemSchema.omit({
  addedAt: true,
});

export type CreateWishlistItemInput = z.infer<typeof createWishlistItemInputSchema>;

/** Read-only share token payload — silently capped at 100 slugs.
 *  Using .transform instead of .max so oversized tokens are truncated
 *  rather than rejected outright; the caller gets a valid (shorter) list
 *  rather than null, which is friendlier for share-link recipients. */
export const wishlistShareSlugsSchema = z
  .array(wishlistSlugSchema)
  .transform(arr => arr.slice(0, 100));

export type WishlistShareSlugs = z.infer<typeof wishlistShareSlugsSchema>;

export function parseWishlistShareSlugs(value: unknown): WishlistShareSlugs | null {
  const parsed = wishlistShareSlugsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseWishlistItem(value: unknown): WishlistItemSchema | null {
  const parsed = wishlistItemSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
