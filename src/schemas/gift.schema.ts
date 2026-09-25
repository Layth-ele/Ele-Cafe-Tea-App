import { z } from 'zod';

/**
 * Wrapping Style Schema
 */
export const wrappingStyleSchema = z.enum(['classic', 'modern', 'luxury']);

export type WrappingStyle = z.infer<typeof wrappingStyleSchema>;

/**
 * Gift Item Schema
 */
export const giftItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive('Quantity must be positive'),
});

export type GiftItem = z.infer<typeof giftItemSchema>;

/**
 * Gift Schema - Core gift entity
 */
export const giftSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  items: z.array(giftItemSchema).min(1, 'Gift must have at least one item'),
  wrappingStyle: wrappingStyleSchema,
  message: z.string().max(500, 'Message must be 500 characters or less'),
  recipientName: z.string().min(1, 'Recipient name is required').max(100),
  recipientEmail: z.string().email('Invalid email address').optional(),
  recipientPhone: z.string().min(10).max(20).optional(),
  totalPrice: z.number().positive('Total price must be positive'),
  createdAt: z.date(),
  deliveryDate: z.date().optional(),
  status: z.enum(['pending', 'processing', 'delivered', 'cancelled']).optional().default('pending'),
});

export type Gift = z.infer<typeof giftSchema>;

/**
 * Create Gift Input Schema
 */
export const createGiftSchema = giftSchema.omit({
  id: true,
  createdAt: true,
  status: true,
});

export type CreateGiftInput = z.infer<typeof createGiftSchema>;

/**
 * Update Gift Schema
 */
export const updateGiftSchema = giftSchema.partial().required({ id: true });

export type UpdateGiftInput = z.infer<typeof updateGiftSchema>;

/**
 * Helper functions
 */
export const validateGift = (data: unknown) => {
  return giftSchema.safeParse(data);
};

export const validateCreateGift = (data: unknown) => {
  return createGiftSchema.safeParse(data);
};
