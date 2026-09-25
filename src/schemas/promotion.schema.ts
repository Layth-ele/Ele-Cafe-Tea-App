import { z } from 'zod';

/**
 * Discount Type Schema
 */
export const discountTypeSchema = z.enum(['percentage', 'fixed']);

export type DiscountType = z.infer<typeof discountTypeSchema>;

/**
 * Promotion Schema — base object shape WITHOUT refinements.
 *
 * Refinements (cross-field validations like "endDate > startDate")
 * must live on derived schemas, not the base. Zod refuses to apply
 * .omit() / .pick() / .partial() to a schema that already has a
 * .refine() attached — the refinement might reference fields the
 * derived schema removed, and Zod can't reason about that.
 *
 * So we keep the base raw, and re-apply refinements on each export.
 */
const promotionBaseSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(3).max(20).toUpperCase(),
  description: z.string().max(500),
  descriptionFr: z.string().max(500).optional(),
  discountType: discountTypeSchema,
  discountValue: z.number().positive('Discount value must be positive'),
  minPurchase: z.number().min(0).optional(),
  maxDiscount: z.number().positive().optional(),
  startDate: z.date(),
  endDate: z.date(),
  usageLimit: z.number().int().positive().optional(), // Total times code can be used
  usageCount: z.number().int().min(0).default(0), // Times code has been used
  perUserLimit: z.number().int().positive().optional(), // Max uses per user
  isActive: z.boolean().default(true),
  applicableProducts: z.array(z.string()).optional(), // Specific product IDs
  applicableCategories: z.array(z.string()).optional(), // Specific category IDs
  createdAt: z.date(),
  updatedAt: z.date().optional(),
});

// Refinement: percentage discounts capped at 100%. Reusable across
// every derived schema that has both discountType and discountValue.
const percentageCapRefinement = <T extends { discountType: DiscountType; discountValue: number }>(p: T) =>
  p.discountType !== 'percentage' || p.discountValue <= 100;

// Refinement: end must come after start. Reusable across schemas
// that have both date fields.
const dateRangeRefinement = <T extends { startDate: Date; endDate: Date }>(p: T) =>
  p.endDate > p.startDate;

/**
 * Promotion Schema (with refinements) — for storage validation.
 */
export const promotionSchema = promotionBaseSchema
  .refine(percentageCapRefinement, {
    message: 'Percentage discount cannot exceed 100%',
    path: ['discountValue'],
  })
  .refine(dateRangeRefinement, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });

export type Promotion = z.infer<typeof promotionSchema>;

/**
 * Create Promotion Schema — omit server-generated fields, re-apply
 * the same refinements (they only depend on fields we kept).
 */
export const createPromotionSchema = promotionBaseSchema
  .omit({
    id: true,
    usageCount: true,
    createdAt: true,
    updatedAt: true,
  })
  .refine(percentageCapRefinement, {
    message: 'Percentage discount cannot exceed 100%',
    path: ['discountValue'],
  })
  .refine(dateRangeRefinement, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

/**
 * Update Promotion Schema — partial update; id required, rest
 * optional. Date refinement is conditional because either date
 * may be omitted (a partial update that only changes the discount
 * value shouldn't require both dates to be present).
 */
export const updatePromotionSchema = promotionBaseSchema
  .partial()
  .required({ id: true })
  .refine(
    (p) => !p.discountType || !p.discountValue ||
           p.discountType !== 'percentage' || p.discountValue <= 100,
    { message: 'Percentage discount cannot exceed 100%', path: ['discountValue'] },
  )
  .refine(
    (p) => !p.startDate || !p.endDate || p.endDate > p.startDate,
    { message: 'End date must be after start date', path: ['endDate'] },
  );

export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;

/**
 * Apply Promotion Schema - For checkout validation
 */
export const applyPromotionSchema = z.object({
  code: z.string().min(1),
  userId: z.string().min(1),
  orderTotal: z.number().positive(),
  productIds: z.array(z.string()).optional(),
});

export type ApplyPromotionInput = z.infer<typeof applyPromotionSchema>;

/**
 * Promotion Usage Schema - Track user usage
 */
export const promotionUsageSchema = z.object({
  id: z.string().min(1),
  promotionId: z.string().min(1),
  userId: z.string().min(1),
  orderId: z.string().min(1),
  discountAmount: z.number().positive(),
  usedAt: z.date(),
});

export type PromotionUsage = z.infer<typeof promotionUsageSchema>;

/**
 * Helper functions
 */
export const validatePromotion = (data: unknown) => {
  return promotionSchema.safeParse(data);
};

export const validateApplyPromotion = (data: unknown) => {
  return applyPromotionSchema.safeParse(data);
};

/**
 * Promotion FORM Schema — Phase 6
 *
 * UI-shape schema for AdminPromotions's PromotionForm. Enforces the
 * manual checks the page used to do in handleSave (required code,
 * positive value, percentage cap of 100, end-after-start) — but
 * inline on the field instead of as toasts.
 *
 * Differs from promotionSchema (the storage shape) in that the
 * dates are strings (HTML date inputs), description is optional
 * and may be empty string, and there is no id / usageCount /
 * createdAt yet (those are server-side concerns).
 */
export const promotionFormSchema = z.object({
  code:          z.string().trim().min(1, 'Code is required').max(40, 'Keep codes under 40 characters'),
  description:   z.string().max(200, 'Keep descriptions under 200 characters'),
  discountType:  z.enum(['percentage', 'fixed']),
  discountValue: z.number().positive('Discount value must be positive'),
  minPurchase:   z.number().min(0, 'Minimum purchase cannot be negative'),
  maxDiscount:   z.number().positive('Max discount must be positive').nullable(),
  usageLimit:    z.number().int().positive('Usage limit must be positive').nullable(),
  perUserLimit:  z.number().int().positive('Per-user limit must be positive').nullable(),
  isActive:      z.boolean(),
  /** Email + notify customers (Promotions toggle on) when it goes live. */
  announce:      z.boolean(),
  startDate:     z.string().min(1, 'Start date is required'),
  endDate:       z.string().min(1, 'End date is required'),
})
  .refine(
    (d) => d.discountType !== 'percentage' || d.discountValue <= 100,
    { message: 'Percentage cannot exceed 100%', path: ['discountValue'] },
  )
  .refine(
    (d) => !d.startDate || !d.endDate || new Date(d.endDate) > new Date(d.startDate),
    { message: 'End date must be after start date', path: ['endDate'] },
  );

export type PromotionFormInput = z.infer<typeof promotionFormSchema>;
