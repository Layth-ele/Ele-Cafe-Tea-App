import { z } from 'zod';

/**
 * Time Period Schema - For analytics queries
 */
export const timePeriodSchema = z.enum([
  'today',
  'week',
  'month',
  'quarter',
  'year',
  'custom',
]);

export type TimePeriod = z.infer<typeof timePeriodSchema>;

/**
 * Sales Analytics Schema
 */
export const salesAnalyticsSchema = z.object({
  period: timePeriodSchema,
  totalRevenue: z.number().min(0),
  totalOrders: z.number().int().min(0),
  averageOrderValue: z.number().min(0),
  topProducts: z.array(
    z.object({
      productId: z.string(),
      productName: z.string(),
      quantitySold: z.number().int(),
      revenue: z.number(),
    })
  ),
  topCategories: z.array(
    z.object({
      category: z.string(),
      revenue: z.number(),
      orderCount: z.number().int(),
    })
  ),
  revenueByDay: z.array(
    z.object({
      date: z.date(),
      revenue: z.number(),
      orders: z.number().int(),
    })
  ),
});

export type SalesAnalytics = z.infer<typeof salesAnalyticsSchema>;

/**
 * Customer Analytics Schema
 */
export const customerAnalyticsSchema = z.object({
  period: timePeriodSchema,
  totalCustomers: z.number().int().min(0),
  newCustomers: z.number().int().min(0),
  returningCustomers: z.number().int().min(0),
  customerRetentionRate: z.number().min(0).max(100),
  averageLifetimeValue: z.number().min(0),
  topCustomers: z.array(
    z.object({
      userId: z.string(),
      userName: z.string(),
      totalSpent: z.number(),
      orderCount: z.number().int(),
    })
  ),
});

export type CustomerAnalytics = z.infer<typeof customerAnalyticsSchema>;

/**
 * Product Performance Schema
 */
export const productPerformanceSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  views: z.number().int().min(0),
  addToCartCount: z.number().int().min(0),
  purchaseCount: z.number().int().min(0),
  conversionRate: z.number().min(0).max(100),
  averageRating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0),
  revenue: z.number().min(0),
});

export type ProductPerformance = z.infer<typeof productPerformanceSchema>;

/**
 * Analytics Query Schema
 */
export const analyticsQuerySchema = z.object({
  period: timePeriodSchema,
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  categoryId: z.string().optional(),
  productId: z.string().optional(),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

/**
 * Helper functions
 */
export const validateAnalyticsQuery = (data: unknown) => {
  return analyticsQuerySchema.safeParse(data);
};
