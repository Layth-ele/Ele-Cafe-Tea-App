import { z } from 'zod';

/**
 * Payment Status Schema
 */
export const paymentStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'refunded',
  'cancelled',
]);

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * Payment Provider Schema
 */
export const paymentProviderSchema = z.enum([
  'stripe',
  'paypal',
  'cash',
  'bank_transfer',
]);

export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

/**
 * Payment Schema
 */
export const paymentSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  userId: z.string().min(1),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3).default('CAD'),
  status: paymentStatusSchema,
  provider: paymentProviderSchema,
  transactionId: z.string().optional(),
  paymentIntentId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().optional(),
});

export type Payment = z.infer<typeof paymentSchema>;

/**
 * Create Payment Intent Schema
 */
export const createPaymentIntentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3).default('CAD'),
  provider: paymentProviderSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

/**
 * Update Payment Status Schema
 */
export const updatePaymentStatusSchema = z.object({
  id: z.string().min(1),
  status: paymentStatusSchema,
  transactionId: z.string().optional(),
  completedAt: z.date().optional(),
});

export type UpdatePaymentStatusInput = z.infer<typeof updatePaymentStatusSchema>;

/**
 * Stripe Payment Intent Schema
 */
export const stripePaymentIntentSchema = z.object({
  clientSecret: z.string().min(1),
  paymentIntentId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
});

export type StripePaymentIntent = z.infer<typeof stripePaymentIntentSchema>;

/**
 * Helper functions
 */
export const validatePayment = (data: unknown) => {
  return paymentSchema.safeParse(data);
};

export const validateCreatePaymentIntent = (data: unknown) => {
  return createPaymentIntentSchema.safeParse(data);
};
