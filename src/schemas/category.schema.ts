import { z } from 'zod';

/**
 * Category Schema — matches the live shape expected by
 * src/hooks/useCategoriesRealtime.ts and the /categories Firestore
 * collection. Originally this schema modeled a richer {name, slug,
 * description, image, icon} shape from an earlier design that was
 * never wired up. The runtime is simpler: {id, label, order?, isActive?}.
 *
 * Editing this in admin: there's no admin UI yet for /categories —
 * docs are added/edited via Firestore Console. A future admin
 * "Categories" tab would use validateCreateCategory below.
 */
export const categorySchema = z.object({
  /** Slug-style key (e.g. "black", "puerh") — used as the doc id and
   *  as the value of Product.category. */
  id: z.string().min(1).max(50),
  /** Display label shown in filter sidebar / product cards
   *  (e.g. "Black Tea", "Pu-erh Tea"). */
  label: z.string().min(1, 'Label is required').max(100),
  /** French translation of label. Optional — falls back to label
   *  when the user's language is FR but no translation exists. */
  labelFr: z.string().max(100).optional(),
  /** Sort order (lower first). Optional — when missing, sorted by label. */
  order: z.number().int().min(0).optional(),
  /** Set to false to hide a category without deleting it. */
  isActive: z.boolean().default(true),
});

export type Category = z.infer<typeof categorySchema>;

/**
 * Create Category Schema
 */
export const createCategorySchema = categorySchema.omit({ id: true });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/**
 * Update Category Schema
 */
export const updateCategorySchema = categorySchema.partial().required({ id: true });

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/**
 * Helper functions
 */
export const validateCategory = (data: unknown) => {
  return categorySchema.safeParse(data);
};
export const validateCreateCategory = (data: unknown) => createCategorySchema.safeParse(data);
export const validateUpdateCategory = (data: unknown) => updateCategorySchema.safeParse(data);
