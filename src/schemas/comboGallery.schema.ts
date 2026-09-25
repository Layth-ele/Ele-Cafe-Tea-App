/**
 * Combo Gallery — Zod schema.
 *
 * Each combo item is a "pairs with our tea" card shown in the carousel
 * on every tea profile page (when the global toggle is on). Examples:
 * pastries, cookies, cakes, sandwiches — anything that pairs with a
 * cup of tea.
 *
 * Storage:
 *   Firestore: /comboGalleryItems/{itemId}     (flat collection)
 *   Storage:   /comboGallery/{filename}
 *   Toggle:    /settings/global.comboGalleryEnabled (boolean)
 *
 * Author rules: admin-only writes (see firestore.rules + storage.rules).
 * Public reads — anyone visiting a tea profile page sees this.
 *
 * All four content fields are required (image, title, description,
 * price). Items can be temporarily hidden via the per-item `enabled`
 * flag without deleting them.
 *
 * Slug:
 *   Each combo has a URL-safe `slug` used for sharable landing pages
 *   at /pairings/{slug} (e.g. /pairings/lemon-tart). The admin
 *   auto-suggests a slug from the title on create; admins can override
 *   before saving. Slug is `optional` here so docs migrated from the
 *   pre-slug version still load — the customer-facing share-link
 *   button hides itself when a combo has no slug.
 */
import { z } from 'zod';

export const COMBO_PRICE_MAX = 9999.99;

/** URL-safe slug pattern: lowercase letters, digits, hyphens. 1–80 chars.
 *  Empty string is allowed for legacy docs that haven't been re-edited
 *  since slugs were introduced — the share-link UI gates on truthiness
 *  so a blank slug just means "no shareable URL yet". */
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const comboItemSchema = z.object({
  id:          z.string().min(1).optional(),         // Firestore doc id
  imageUrl:    z.string().url('Image URL is invalid'),
  storagePath: z.string().min(1, 'Storage path required for delete'),
  title:       z.string().min(1, 'Title is required').max(100),
  description: z.string().min(1, 'Description is required').max(500),
  /** French title/description — shown when the site is in French
   *  (English is used when blank). */
  titleFr:       z.string().max(100).optional().or(z.literal('')),
  descriptionFr: z.string().max(500).optional().or(z.literal('')),
  price:       z.number().nonnegative('Price must be 0 or greater').max(COMBO_PRICE_MAX),
  // Currency was previously `z.string().length(3).default('CAD')` — open
  // to any 3-char string. The admin UI only exposes CAD, so anything
  // else would arrive only from a manual Firestore edit and create a
  // silent mismatch between the customer's formatted price and the
  // JSON-LD `priceCurrency` emitted by renderSeo. Enum makes the
  // contract explicit and easy to extend when a second currency lands.
  currency:    z.enum(['CAD']).default('CAD'),
  order:       z.number().int().nonnegative().default(0),
  enabled:     z.boolean().default(true),
  // Slug for /pairings/{slug} share URLs. Optional + may be empty
  // string on legacy docs; the customer share UI hides itself when
  // missing/empty.
  slug:        z.string().max(80).regex(slugPattern, 'Slug must be lowercase letters, numbers, and hyphens only').optional().or(z.literal('')),
  // Phase 13 — per-combo tea associations. When set and non-empty,
  // the ComboPairingPage replaces its generic "4 featured teas"
  // fallback with these specific tea docs (resolved via Firestore
  // documentId IN query). Capped at 8 to (a) match Firestore's
  // 10-item IN-query ceiling with two slots of headroom and (b) keep
  // the curation UI manageable. Stores Firestore document IDs of
  // /teas docs — which in this codebase are the tea slugs (see
  // `setDoc(doc(db, 'teas', slug), ...)` in AdminProducts). If an
  // admin renames a tea (changes its slug), the old association
  // points to a non-existent doc and is silently filtered out by
  // ComboPairingPage's render-time filter.
  pairedTeaIds: z.array(z.string().min(1).max(128)).max(8).optional(),
  createdAt:   z.date().optional(),
  updatedAt:   z.date().optional(),
});

export type ComboItem = z.infer<typeof comboItemSchema>;

/** Create input — server fills id + timestamps. */
export const createComboItemSchema = comboItemSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateComboItemInput = z.infer<typeof createComboItemSchema>;

/** Update input — every content field optional, id required. */
export const updateComboItemSchema = comboItemSchema
  .partial()
  .required({ id: true });
export type UpdateComboItemInput = z.infer<typeof updateComboItemSchema>;

// ── Validators ───────────────────────────────────────────────────────────────
export const validateComboItem       = (d: unknown) => comboItemSchema.safeParse(d);
export const validateCreateComboItem = (d: unknown) => createComboItemSchema.safeParse(d);
export const validateUpdateComboItem = (d: unknown) => updateComboItemSchema.safeParse(d);

// ── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Convert a free-form title to a URL-safe slug. Lower-cases, replaces
 * non-alphanumerics with single hyphens, trims hyphens at the edges,
 * caps at 60 chars (leaves headroom under the 80-char schema cap).
 *
 * Examples:
 *   "Lemon Tart"            → "lemon-tart"
 *   "Café Au Lait & Scone"  → "cafe-au-lait-scone"
 *   "Madeleines (Half-Doz)" → "madeleines-half-doz"
 *
 * Note: doesn't guarantee uniqueness. Two combos titled identically
 * would slug to the same string; the admin-side caller is responsible
 * for de-duping (e.g. by appending a number or rejecting the save).
 */
export function comboSlugFromTitle(title: string): string {
  return title
    .normalize('NFKD')                 // split accented chars
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')       // non-alphanumerics → hyphens
    .replace(/^-+|-+$/g, '')           // trim leading/trailing hyphens
    .slice(0, 60);
}
