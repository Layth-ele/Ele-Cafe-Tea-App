/**
 * checkout.schema.ts — Phase 6 of the UI/UX roadmap
 *
 * Form schema for `CheckoutPage` (the multi-step delivery → payment →
 * review flow). One schema covers BOTH pickup and delivery, with
 * `superRefine` adding the delivery-only field requirements when
 * `fulfillmentMethod === 'delivery'`. Pickup orders skip the address
 * fields entirely because the customer is collecting in-person.
 *
 * Why a discriminated approach via `superRefine`, not a discriminated
 * union:
 *   With a union (z.discriminatedUnion('fulfillmentMethod', […])) the
 *   form's value type would also switch shape, forcing every consumer
 *   to narrow before reading fields. RHF in particular gets unhappy
 *   when defaultValues don't match the discriminant. A flat schema
 *   with conditional refinements keeps the type stable and lets the
 *   form hold defaults for ALL fields, even when delivery is off.
 *
 * Validation messages mirror the previous toast strings so users see
 * the same wording they saw before the migration — just inline now,
 * next to the field, instead of as a toast.
 *
 * The phone + postal regexes are deliberately permissive to match the
 * pre-migration heuristics in CheckoutPage. They reject obviously
 * malformed values without imposing a single country's format.
 */
import { z } from 'zod';

/* ─── Field validators — extracted so CheckoutPage can share them ─── */

/** Permissive phone validator: international format-agnostic, requires
 *  ≥ 7 digits after stripping non-digits. Matches the pre-migration
 *  heuristic exactly. */
export const isValidPhone = (v: string): boolean => {
  const re = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{3,6}([-\s.]?[0-9]{2,6})*$/;
  return re.test(v.trim()) && v.replace(/\D/g, '').length >= 7;
};

/** Postal/ZIP validator: accepts Canadian (A1A 1A1), US (12345 or
 *  12345-6789), or generic ≥ 3 alphanumeric. Empty strings are accepted
 *  by the validator itself; the schema's `.min(1)` enforces presence
 *  when the field is required (delivery only). */
export const isValidPostalNonEmpty = (v: string): boolean => {
  const trimmed = v.trim();
  if (!trimmed) return false;
  const ca  = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
  const us  = /^\d{5}(-\d{4})?$/;
  const gen = /^[A-Za-z0-9 -]{3,10}$/;
  return ca.test(trimmed) || us.test(trimmed) || gen.test(trimmed);
};

/* ─── Schema ────────────────────────────────────────────────────── */

export const checkoutFormSchema = z
  .object({
    fulfillmentMethod: z.enum(['pickup', 'delivery']),
    name:       z.string().trim().min(1, 'Name is required').max(100),
    phone:      z.string().trim().refine(isValidPhone, 'Please enter a valid phone number'),
    // Address fields hold empty strings for pickup orders. They're
    // validated conditionally in superRefine when fulfillmentMethod is
    // 'delivery'. Keeping them on the schema (not optional/undefined)
    // means RHF's defaultValues + register() stay simple.
    address:    z.string().trim().max(300),
    city:       z.string().trim().max(100),
    province:   z.string().trim().max(100),
    postalCode: z.string().trim().max(20),
    country:    z.string().trim().max(100),
  })
  .superRefine((data, ctx) => {
    if (data.fulfillmentMethod !== 'delivery') return;

    // Address fields are required for delivery orders. Messages match
    // the pre-migration toast wording so users see consistent copy
    // across the change.
    if (data.address.length < 5) {
      ctx.addIssue({
        code: 'custom',
        path: ['address'],
        message: 'Address must be at least 5 characters',
      });
    }
    if (data.city.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['city'],
        message: 'City is required',
      });
    }
    if (!data.province) {
      ctx.addIssue({
        code: 'custom',
        path: ['province'],
        message: 'Province is required',
      });
    }
    if (!isValidPostalNonEmpty(data.postalCode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['postalCode'],
        message: 'Please enter a valid postal / ZIP code',
      });
    }
    if (data.country.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['country'],
        message: 'Country is required',
      });
    }
  });

export type CheckoutFormInput = z.infer<typeof checkoutFormSchema>;

/** Field names that belong to the "delivery" step — used by RHF's
 *  `trigger()` to validate only the current step's inputs when
 *  advancing from step 1 to step 2. */
export const DELIVERY_STEP_FIELDS_PICKUP   = ['name', 'phone'] as const;
export const DELIVERY_STEP_FIELDS_DELIVERY = [
  'name', 'phone', 'address', 'city', 'province', 'postalCode', 'country',
] as const;
