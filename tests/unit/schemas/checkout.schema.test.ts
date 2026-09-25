/**
 * checkout.schema.test.ts — locks the Phase 6 conditional-validation
 * contract for `checkoutFormSchema`.
 *
 * Why a focused test: the schema's `superRefine` block flips
 * delivery-only field requirements on/off based on
 * `fulfillmentMethod`. That branching is exactly the kind of code
 * a future refactor can subtly break — e.g. by switching the schema
 * to a discriminated union, by inverting the condition, or by
 * silently dropping a refinement. Each of those would let an
 * invalid order pass client validation (the server still rejects
 * it via Firestore rules, but the customer experience is worse).
 *
 * Scope: the schema only. The CheckoutPage RHF wiring, the
 * cross-step `trigger()` flow, and the Cloud Function pipeline are
 * out of scope here — they're exercised by Playwright + integration
 * tests when those run.
 */
import { describe, test, expect } from 'vitest';
import {
  checkoutFormSchema,
  isValidPhone,
  isValidPostalNonEmpty,
} from '@/schemas/checkout.schema';

/* ─── Pure validator helpers ──────────────────────────────────────── */

describe('isValidPhone', () => {
  test('accepts international formats', () => {
    expect(isValidPhone('+1 604 555 0100')).toBe(true);
    expect(isValidPhone('(604) 555-0100')).toBe(true);
    expect(isValidPhone('6045550100')).toBe(true);
    expect(isValidPhone('+44 20 7946 0958')).toBe(true);
  });

  test('rejects too-short and obviously malformed inputs', () => {
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('abc')).toBe(false);
    expect(isValidPhone('1234')).toBe(false);  // < 7 digits after stripping
  });

  test('whitespace-only strings are rejected', () => {
    expect(isValidPhone('   ')).toBe(false);
    expect(isValidPhone('\t')).toBe(false);
  });
});

describe('isValidPostalNonEmpty', () => {
  test('accepts Canadian format (with and without space)', () => {
    expect(isValidPostalNonEmpty('V5K 0A1')).toBe(true);
    expect(isValidPostalNonEmpty('V5K0A1')).toBe(true);
    expect(isValidPostalNonEmpty('M5G 1Z4')).toBe(true);
  });

  test('accepts US ZIP and ZIP+4', () => {
    expect(isValidPostalNonEmpty('98101')).toBe(true);
    expect(isValidPostalNonEmpty('98101-1234')).toBe(true);
  });

  test('accepts generic 3-10 alphanumeric postal codes', () => {
    expect(isValidPostalNonEmpty('SW1A 1AA')).toBe(true);  // UK
    expect(isValidPostalNonEmpty('100-0001')).toBe(true);  // JP
  });

  test('rejects empty and whitespace-only strings', () => {
    expect(isValidPostalNonEmpty('')).toBe(false);
    expect(isValidPostalNonEmpty('   ')).toBe(false);
  });

  test('rejects too-short and too-long inputs', () => {
    expect(isValidPostalNonEmpty('A1')).toBe(false);          // 2 chars
    expect(isValidPostalNonEmpty('ABCDEFGHIJKL')).toBe(false); // 12 chars
  });
});

/* ─── Pickup orders skip address requirements ─────────────────────── */

describe('checkoutFormSchema · pickup orders', () => {
  const pickupValid = {
    fulfillmentMethod: 'pickup' as const,
    name:       'Jane Smith',
    phone:      '604-555-0100',
    address:    '',
    city:       '',
    province:   '',
    postalCode: '',
    country:    '',
  };

  test('accepts pickup orders with empty address fields', () => {
    const result = checkoutFormSchema.safeParse(pickupValid);
    expect(result.success).toBe(true);
  });

  test('still requires name on pickup', () => {
    const result = checkoutFormSchema.safeParse({ ...pickupValid, name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path[0] === 'name')).toBe(true);
    }
  });

  test('still requires valid phone on pickup', () => {
    const result = checkoutFormSchema.safeParse({ ...pickupValid, phone: '123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path[0] === 'phone')).toBe(true);
    }
  });

  test('does NOT raise errors against unfilled address fields on pickup', () => {
    // This is the critical assertion. A regression where superRefine
    // applies its address rules regardless of fulfillmentMethod would
    // surface here — pickup users would suddenly get 5 errors they
    // can't fix (the fields aren't rendered).
    const result = checkoutFormSchema.safeParse(pickupValid);
    if (!result.success) {
      const addressFields = ['address', 'city', 'province', 'postalCode', 'country'];
      for (const field of addressFields) {
        const found = result.error.issues.find(i => i.path[0] === field);
        expect(found, `pickup must not error on ${field}`).toBeUndefined();
      }
    }
  });
});

/* ─── Delivery orders require the full address block ──────────────── */

describe('checkoutFormSchema · delivery orders', () => {
  const deliveryValid = {
    fulfillmentMethod: 'delivery' as const,
    name:       'Jane Smith',
    phone:      '604-555-0100',
    address:    '123 Main Street',
    city:       'Vancouver',
    province:   'BC',
    postalCode: 'V5K 0A1',
    country:    'Canada',
  };

  test('accepts a complete delivery payload', () => {
    const result = checkoutFormSchema.safeParse(deliveryValid);
    expect(result.success).toBe(true);
  });

  test.each([
    ['address',    ''],
    ['city',       ''],
    ['province',   ''],
    ['postalCode', ''],
    ['country',    ''],
  ])('flags missing %s on delivery', (field, value) => {
    const result = checkoutFormSchema.safeParse({ ...deliveryValid, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path[0] === field)).toBe(true);
    }
  });

  test('flags an invalid postal code (delivery)', () => {
    const result = checkoutFormSchema.safeParse({
      ...deliveryValid,
      postalCode: 'X',  // too short for any format
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path[0] === 'postalCode')).toBe(true);
    }
  });

  test('flags an address shorter than 5 chars (delivery)', () => {
    const result = checkoutFormSchema.safeParse({
      ...deliveryValid,
      address: '123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path[0] === 'address')).toBe(true);
    }
  });
});

/* ─── Switching fulfillmentMethod toggles requirements ────────────── */

describe('checkoutFormSchema · fulfillmentMethod toggle', () => {
  test('the same empty-address payload is valid for pickup and invalid for delivery', () => {
    const base = {
      name:       'Jane Smith',
      phone:      '604-555-0100',
      address:    '',
      city:       '',
      province:   '',
      postalCode: '',
      country:    '',
    };
    expect(checkoutFormSchema.safeParse({ ...base, fulfillmentMethod: 'pickup'   }).success).toBe(true);
    expect(checkoutFormSchema.safeParse({ ...base, fulfillmentMethod: 'delivery' }).success).toBe(false);
  });

  test('only valid fulfillmentMethod values are accepted', () => {
    const result = checkoutFormSchema.safeParse({
      fulfillmentMethod: 'mailorder',
      name: 'X', phone: '604-555-0100',
      address: '', city: '', province: '', postalCode: '', country: '',
    });
    expect(result.success).toBe(false);
  });
});

/* ─── Trim is applied (the schema uses .trim()) ──────────────────── */

describe('checkoutFormSchema · trim behavior', () => {
  test('trims whitespace on name', () => {
    const result = checkoutFormSchema.safeParse({
      fulfillmentMethod: 'pickup',
      name:       '  Jane Smith  ',
      phone:      '604-555-0100',
      address:    '', city: '', province: '', postalCode: '', country: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Jane Smith');
    }
  });

  test('a whitespace-only name fails (post-trim it is empty)', () => {
    const result = checkoutFormSchema.safeParse({
      fulfillmentMethod: 'pickup',
      name:       '   ',
      phone:      '604-555-0100',
      address:    '', city: '', province: '', postalCode: '', country: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path[0] === 'name')).toBe(true);
    }
  });
});
