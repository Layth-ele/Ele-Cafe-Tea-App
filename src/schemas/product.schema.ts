import { z } from 'zod';
import { firestoreDateOptional } from './firestoreTimestamp.schema';

// Each serving suggestion has a label and an enabled toggle
export const servingSuggestionSchema = z.object({
  label:   z.string().min(1).max(100),
  enabled: z.boolean().default(true),
});
export type ServingSuggestion = z.infer<typeof servingSuggestionSchema>;

// Untranslated French fields are stored as null, and teas without a photo
// have image: '' — treat both as "not set" rather than failing validation.
const nullAsMissing = <T extends z.ZodType>(schema: T) =>
  z.preprocess(v => (v === null ? undefined : v), schema);
const emptyAsMissing = <T extends z.ZodType>(schema: T) =>
  z.preprocess(v => (v === null || v === '' ? undefined : v), schema);

/**
 * Tea category. Stored as a free-form string so admin-managed categories
 * (added via /categories Firestore collection — see useCategoriesRealtime)
 * pass validation alongside the original 8. The valid category list at
 * runtime is enforced by:
 *   - The admin product form's <select> dropdown (sourced from
 *     /categories live), which only lets admin pick existing categories.
 *   - The /categories collection itself, which is admin-only writeable
 *     per Firestore rules.
 *
 * Was previously a z.enum of the original 8 categories, which would
 * reject newly-added categories (e.g. "puerh") with "Invalid enum value"
 * the first time admin tried to save a tea using one. Schema-level enum
 * was a type-system lie — runtime data already accepted any string.
 */
export const productCategorySchema = z.string().min(1, 'Category is required');
export type ProductCategory = z.infer<typeof productCategorySchema>;

export const caffeineLevelSchema   = z.enum(['None', 'Low', 'Medium', 'High']);
export type CaffeineLevel = z.infer<typeof caffeineLevelSchema>;

// Tea profile detail enums — kept aligned with admin product form's
// dropdown options. "Ultra High" was added later as the new preferred
// label (white teas have the highest antioxidant content); "Very High"
// kept for backward compatibility with existing data.
export const antioxidantLevelSchema = z.enum(['None', 'Low', 'Medium', 'High', 'Very High', 'Ultra High']);
export type AntioxidantLevel = z.infer<typeof antioxidantLevelSchema>;

export const productSchema = z.object({
  id:           z.string().min(1).optional(),
  slug:         z.string().min(1).optional(),
  name:         z.string().min(1).max(200).optional(),
  nameFr:       nullAsMissing(z.string().max(200).optional()),
  description:  z.string().max(2000).optional().default(''),
  descriptionFr:nullAsMissing(z.string().max(2000).optional()),
  price:        z.number().positive().optional(),
  image:        emptyAsMissing(z.string().url().optional()),
  /**
   * Blurhash placeholder — ~30-character encoded preview of the
   * image. Decoded client-side to a tiny canvas and shown while the
   * real image loads, giving a recognizable preview instead of the
   * generic skeleton pulse. Generated on upload (admin-side) using
   * the `blurhash` library. Optional — when absent, LazyImage falls
   * back to the skeleton.
   *
   * Cap at 64 chars defensively. A typical 4×3 hash is 27 chars; a
   * 9×9 hash maxes around 51 chars. 64 leaves headroom for hashes
   * with non-default dimensions while preventing arbitrary blob
   * storage abuse (Firestore field write limit is unrelated, but
   * an unbounded string field is a DoS vector via repeated saves).
   */
  blurhash:     z.string().max(64).optional(),
  /**
   * Whether resized image variants (320/640/1280 webp + 640 avif)
   * are known to exist alongside the original in Firebase Storage.
   * Set to true by admin tooling AFTER the Resize Images extension
   * has finished generating variants for an upload — otherwise the
   * client can avoid building <source> tags for variants that 404.
   *
   * Optional + defaults to false to preserve backward compatibility
   * with images uploaded before the extension was provisioned. The
   * image still renders fine in that case (single <img>, original
   * URL only); the only difference is no responsive selection.
   */
  variantsAvailable: z.boolean().optional(),
  category:     productCategorySchema.optional(),
  /**
   * Inventory-projected availability (Turn 5 cutover; Turn 6 drop of
   * legacy `stock`). Written by the onInventoryWrite Cloud Function
   * trigger whenever the matching /inventory/{teaId} doc changes
   * status. The storefront reads these — the previous `stock` field
   * (a manually-maintained item count) has been removed in Turn 6
   * since inventory level (0-10 container fullness) is now the only
   * source of truth.
   *
   * Both are optional — `undefined` signals "no projection yet, treat
   * as unavailable to be conservative" since the alternative is
   * showing customers a tea they may not actually be able to buy.
   * See `isProductAvailable()` in lib/availability.ts.
   */
  available:         z.boolean().optional(),
  availabilityLabel: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
  featured:     z.boolean().optional().default(false),
  isActive:     z.boolean().optional().default(true),
  isOrganic:    z.boolean().optional().default(false),
  allergens:    z.array(z.string()).optional().default([]),
  /**
   * gstApplicable — whether this product attracts GST (default false).
   * Tea and most foodstuffs are zero-rated in Canada; set true only for
   * non-food accessories, equipment, or any other taxable items.
   */
  gstApplicable: z.boolean().optional().default(false),
  avgRating:    z.number().min(0).max(5).optional().default(0),
  ratingCount:  z.number().int().min(0).optional().default(0),
  createdAt:    firestoreDateOptional,
  updatedAt:    firestoreDateOptional,
  // Tea profile detail fields — populated later in production
  benefits:          z.string().max(1000).optional(),
  benefitsFr:        nullAsMissing(z.string().max(1000).optional()),
  ingredients:       z.string().max(500).optional(),
  ingredientsFr:     nullAsMissing(z.string().max(500).optional()),
  caffeine:          caffeineLevelSchema.optional(),
  antioxidants:      antioxidantLevelSchema.optional(),
  origin:            z.string().max(500).optional(),
  originFr:          nullAsMissing(z.string().max(500).optional()),
  regions:           z.string().max(500).optional(),
  regionsFr:         nullAsMissing(z.string().max(500).optional()),
  brewingTemp:       z.string().max(50).optional(),
  /**
   * Free-form display label for weight. Legacy field; kept for
   * backward compatibility with existing data and for cases where
   * the admin wants a custom label like "100g sachet" or "tin of
   * 50g". For the canonical numeric weight (used to derive
   * price-per-weight on the storefront) see `weightGrams`.
   */
  weight:            z.string().max(30).optional(),  // e.g. '100g', '50'
  /**
   * Canonical numeric weight in grams. Used to compute the
   * price-per-weight label on tea cards and the product detail page
   * (e.g. price=$15 + weightGrams=100 → "$15 / 100g").
   *
   * Required at the UI layer (every tea card needs a unit price),
   * but kept optional in the schema so legacy docs without it still
   * parse. The storefront read path falls back to 100 when missing
   * — see formatPricePerWeight() in lib/priceFormat.ts.
   *
   * Server defaults: onTeaCreate stamps 100 on new docs; the
   * backfillTeaWeights admin callable fills in older docs in bulk.
   */
  weightGrams:       z.number().positive().max(100000).optional(),
  brewingTime:       z.string().max(100).optional(),
  servingSuggestions:z.array(z.union([servingSuggestionSchema, z.string().max(100)])).max(12).optional(),
});
export type Product = z.infer<typeof productSchema>;

export const createProductSchema = productSchema.omit({
  id: true, createdAt: true, updatedAt: true, avgRating: true, ratingCount: true,
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = productSchema.partial().required({ id: true });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productFilterSchema = z.object({
  category:   productCategorySchema.optional(),
  minPrice:   z.number().positive().optional(),
  maxPrice:   z.number().positive().optional(),
  inStock:    z.boolean().optional(),
  featured:   z.boolean().optional(),
  isActive:   z.boolean().optional(),
  isOrganic:  z.boolean().optional(),
  searchTerm: z.string().optional(),
});
export type ProductFilter = z.infer<typeof productFilterSchema>;

export const validateProduct       = (d: unknown) => productSchema.safeParse(d);
export const validateCreateProduct = (d: unknown) => createProductSchema.safeParse(d);
export const validateUpdateProduct = (d: unknown) => updateProductSchema.safeParse(d);

/**
 * Admin Products FORM Schema — Phase 6
 *
 * UI-shape schema for AdminProducts's ProductForm. The form has 30+
 * fields including French translations, brewing details, benefits,
 * etc. Many fields arrive as strings from <input type="number"> and
 * get coerced to numbers in the submit handler before being run
 * through `createProductSchema` (the storage-shape contract).
 *
 * This form schema validates the shape the user sees:
 *   - name + price required (the submit-time check used to surface
 *     these as toasts; now they're RHF errors).
 *   - Numeric strings allowed where the storage shape requires
 *     numbers (the transform happens in handleSave).
 *   - Optional fields default to empty string.
 *
 * The storage-shape `createProductSchema` still runs at submit time
 * as a defence-in-depth check, since the transform from string→number
 * could produce unexpected values (e.g. "abc" → NaN) that the form
 * schema can't catch directly.
 */
export const productFormSchema = z.object({
  name:                z.string().trim().min(1, 'Name is required').max(200),
  nameFr:              z.string().max(200),
  description:         z.string().max(2000),
  descriptionFr:       z.string().max(2000),
  price:               z.string().refine(
                         (v) => v.trim() !== '' && !Number.isNaN(parseFloat(v)) && parseFloat(v) > 0,
                         'Price must be a positive number',
                       ),
  category:            z.string().min(1, 'Category is required'),
  /* Turn 6: removed `stock` form field. Inventory is now managed
     exclusively via the /inventory collection (Turn 1 onward); a
     manually-typed stock count on the product form was duplicative
     and only created drift between the two sources of truth. */
  image:               z.string(),
  featured:            z.boolean(),
  isOrganic:           z.boolean(),
  allergens:           z.string(),
  caffeine:            z.string(),
  brewingTemp:         z.string().max(50),
  brewingTime:         z.string().max(50),
  weight:              z.string(),
  gstApplicable:       z.boolean(),
  // Inline shape (rather than reusing servingSuggestionSchema) so the
  // input and output types match exactly — `enabled` is required
  // here because the form always supplies it. servingSuggestionSchema
  // marks it optional with default(true) for storage flexibility.
  servingSuggestions:  z.array(z.object({
    label:   z.string().min(1).max(100),
    enabled: z.boolean(),
  })),
  benefits:            z.string().max(2000),
  benefitsFr:          z.string().max(2000),
  ingredients:         z.string().max(1000),
  ingredientsFr:       z.string().max(1000),
  antioxidants:        z.string(),
  origin:              z.string().max(100),
  originFr:            z.string().max(100),
  regions:             z.string().max(200),
  regionsFr:           z.string().max(200),
  blurhash:            z.string(),
  variantsAvailable:   z.boolean(),
});

export type ProductFormInput = z.infer<typeof productFormSchema>;
