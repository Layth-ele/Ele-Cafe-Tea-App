import { z } from 'zod';

/**
 * Address Schema - Used for shipping addresses and user saved addresses
 *
 * Phone is validated via the same isValidPhone heuristic used by
 * checkoutFormSchema (≥ 7 digits after stripping non-digits). Pre-fix
 * this declared `.min(10)`, which would have rejected international
 * numbers and short local formats that the checkout itself accepts —
 * meaning a phone the checkout writes successfully into
 * shippingAddress would FAIL `validateAddress()` on round-trip read.
 * Use the same rule everywhere a phone is validated.
 */
export const addressSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Name is required').max(100),
  phone: z.string()
    .max(20)
    .refine(
      (v) => {
        const trimmed = v.trim();
        const digits = trimmed.replace(/\D/g, '').length;
        return digits >= 7;
      },
      { message: 'Please enter a valid phone number' },
    ),
  address: z.string().min(5, 'Address must be at least 5 characters').max(300),
  city: z.string().min(2, 'City is required').max(100),
  province: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().min(2, 'Country is required').max(100),
  isDefault: z.boolean().optional().default(false),
});

export type Address = z.infer<typeof addressSchema>;

/**
 * Create Address Input Schema
 */
export const createAddressSchema = addressSchema.omit({ id: true });

export type CreateAddressInput = z.infer<typeof createAddressSchema>;

/**
 * Update Address Input Schema
 */
export const updateAddressSchema = addressSchema.partial().required({ id: true });

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

/**
 * Shipping Address Schema - For orders (without id and isDefault)
 */
export const shippingAddressSchema = addressSchema.omit({ id: true, isDefault: true });

export type ShippingAddress = z.infer<typeof shippingAddressSchema>;

/**
 * Helper functions
 */
export const validateAddress = (data: unknown) => {
  return addressSchema.safeParse(data);
};

export const validateShippingAddress = (data: unknown) => {
  return shippingAddressSchema.safeParse(data);
};

/**
 * Addresses LIST form schema — Phase 6
 *
 * UI-shape schema for AccountPage's saved-addresses sub-form. RHF's
 * useFieldArray works with any object-array; this schema validates
 * the whole list at submit time. Per-address fields use the same
 * messages as `addressSchema` for consistency between contexts (a
 * "Name is required" error here matches the same message in the
 * checkout shipping form).
 *
 * Differs from `addressSchema` only in that `isDefault` is REQUIRED
 * here — the form always supplies it (defaults to false). The base
 * schema marks it optional because Firestore documents from older
 * accounts may not have the field. Aligning the two would require
 * a backfill migration and isn't worth it.
 */
const addressFormItemSchema = addressSchema.extend({
  isDefault: z.boolean(),
});

export const addressesFormSchema = z.object({
  addresses: z.array(addressFormItemSchema),
});

export type AddressesFormInput = z.infer<typeof addressesFormSchema>;
