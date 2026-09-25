/**
 * Central schema export barrel.
 * All schemas use Zod for runtime validation and TypeScript for static typing.
 *
 * Exclusions (intentional — schemas in the folder but not re-exported):
 *
 *   - gift.schema, payment.schema, analytics.schema
 *     Designed for features that were never built (gift sub-system,
 *     Stripe/PayPal payment provider integration, sales-aggregation
 *     dashboards). No runtime consumer imports them. Direct-import
 *     (`from './schemas/gift.schema'`) if you build out one of those
 *     features later.
 *
 * Everything used at runtime IS re-exported, including the schemas
 * that were silently missing from the previous barrel — auth (used by
 * LoginPage), checkout (used by CheckoutPage), announcement (used by
 * Navbar + AdminSettings), userPreferences (used by
 * NotificationPreferencesSection), firestoreTimestamp (used
 * transitively by notification), and credit (used by 4+ Cloud
 * Functions).
 */
import { z } from 'zod';

// Core entity schemas
export * from './product.schema';
export * from './address.schema';
export * from './order.schema';
export * from './user.schema';
export * from './cart.schema';
export * from './category.schema';
export * from './review.schema';
export * from './promotion.schema';
export * from './notification.schema';
export * from './credit.schema';
export * from './comboGallery.schema';
export * from './wishlist.schema';
export * from './giftBuilderEvent.schema';

// Form / input schemas
export * from './auth.schema';
export * from './checkout.schema';

// Settings / preferences schemas
export * from './settings.schema';
export * from './announcement.schema';
export * from './userPreferences.schema';

// Utility schemas
export * from './firestoreTimestamp.schema';

// ── Shared pagination / response utilities ────────────────────────────────
export const paginationSchema = z.object({
  page:      z.number().int().positive().default(1),
  limit:     z.number().int().positive().max(100).default(20),
  sortBy:    z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: z.array(dataSchema),
    pagination: z.object({
      page: z.number().int(), limit: z.number().int(),
      total: z.number().int(), totalPages: z.number().int(), hasMore: z.boolean(),
    }),
  });

export type PaginatedResponse<T> = {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
};

export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data:    dataSchema.optional(),
    error:   z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }).optional(),
    timestamp: z.date(),
  });

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  timestamp: Date;
};

export const firebaseTimestampSchema = z.object({ seconds: z.number(), nanoseconds: z.number() });
export type FirebaseTimestamp = z.infer<typeof firebaseTimestampSchema>;
export const convertFirebaseTimestamp = (ts: FirebaseTimestamp): Date =>
  new Date(ts.seconds * 1000 + ts.nanoseconds / 1000000);
