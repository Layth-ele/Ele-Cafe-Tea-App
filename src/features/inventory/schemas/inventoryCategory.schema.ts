/**
 * inventoryCategory.schema.ts — Zod contracts for /inventory_categories.
 *
 * The category model is the user-defined taxonomy that groups
 * inventory ITEMS (not teas). The single system-owned category 'tea'
 * stands in for the existing tea inventory and is locked from rename
 * and delete. Admin-created categories use the 'quantity' model and
 * carry their own unit + default low-stock threshold.
 *
 * Storage path: /inventory_categories/{categoryId}
 *   where categoryId === slug (lowercase, alphanumeric + hyphen).
 *
 * Color cycle: each non-system category gets one of 8 predefined CSS
 * color slots ('color-1' .. 'color-8') so the tab strip can style the
 * tab background without inline styles. The slot is assigned by the
 * setInventoryCategory callable and stored here. See design.css
 * `.ict-tab[data-color='color-N']` for the colour values.
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/*                                  MODEL                                     */
/* -------------------------------------------------------------------------- */

/** 'temperature' = the system cooler-log category (Equipment). */
export const inventoryModelSchema = z.enum(['level', 'quantity', 'temperature']);
export type InventoryModel = z.infer<typeof inventoryModelSchema>;

/* -------------------------------------------------------------------------- */
/*                              COLOR SLOT                                    */
/* -------------------------------------------------------------------------- */

/** Eight predefined slots that match `design.css` selectors. The
 *  'color-tea' slot is reserved for the system tea category. */
export const inventoryCategoryColorSchema = z.enum([
  'color-tea',
  'color-1', 'color-2', 'color-3', 'color-4',
  'color-5', 'color-6', 'color-7', 'color-8',
]);
export type InventoryCategoryColor = z.infer<typeof inventoryCategoryColorSchema>;

/* -------------------------------------------------------------------------- */
/*                            CATEGORY SCHEMA                                 */
/* -------------------------------------------------------------------------- */

export const inventoryCategorySchema = z.object({
  /** Path segment. For the system 'tea' category this is literally
   *  'tea'. For admin-created categories the slug is derived from
   *  the name (kebab-case, lowercase). Validated for uniqueness by
   *  the setInventoryCategory callable. */
  id:           z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, digits, and hyphens'),
  name:         z.string().min(2, 'Category name must be at least 2 characters').max(40),
  model:        inventoryModelSchema,
  /** Default unit for items in this category. Required for 'quantity'
   *  model; null for 'level' (tea uses no explicit unit). */
  unit:         z.string().min(1).max(20).nullable(),
  /** Default low-stock threshold for items in this category.
   *  Required for 'quantity' model; null for 'level' (tea derives
   *  status from level via hardcoded 4/1/0 cutoffs). */
  lowThreshold: z.number().nonnegative().nullable(),
  /** Manual display order. System 'tea' is 0 (always first); admin-
   *  created categories start at 100 and increment in 10s. */
  sortOrder:    z.number().int().default(100),
  /** CSS color slot. 'color-tea' reserved for the system category;
   *  admins pick one of 'color-1' .. 'color-8' (or omit, in which
   *  case the callable cycles based on existing assignments). */
  color:        inventoryCategoryColorSchema,
  /** True only for the seeded 'tea' category. Prevents rename/delete
   *  from the admin UI. */
  isSystem:     z.boolean(),
  /** Soft-delete. Hidden from the admin tabs and item-creation
   *  pickers, but existing items in the category remain readable
   *  so audit-log entries stay linkable. */
  isActive:     z.boolean(),
  createdAt:    z.date(),
  updatedAt:    z.date().optional(),
});

export type InventoryCategory = z.infer<typeof inventoryCategorySchema>;

/* -------------------------------------------------------------------------- */
/*                       CREATE / UPDATE INPUT SCHEMAS                        */
/* -------------------------------------------------------------------------- */

/** Wire shape for setInventoryCategory (create or update).
 *  When `id` is omitted the callable derives a slug from `name`. */
export const setInventoryCategoryInputSchema = z.object({
  id:           z.string().regex(/^[a-z0-9-]+$/).optional(),
  name:         z.string().min(2).max(40),
  /** Only honored on CREATE — once items exist in a category the
   *  model is frozen (changing it would orphan rows). */
  model:        inventoryModelSchema.optional(),
  unit:         z.string().min(1).max(20).nullable().optional(),
  lowThreshold: z.number().nonnegative().nullable().optional(),
  sortOrder:    z.number().int().optional(),
  color:        inventoryCategoryColorSchema.optional(),
});

export type SetInventoryCategoryInput = z.infer<typeof setInventoryCategoryInputSchema>;

/** Slug derivation helper. Used by both the client preview and the
 *  server validation; keeping the function shared prevents drift. */
export function deriveCategorySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 40);
}
