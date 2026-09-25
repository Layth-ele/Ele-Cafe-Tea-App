/**
 * notification.schema.test.ts — pin the discriminated-union contract.
 *
 * Each notification type has its own required-field contract. If a
 * cloud function writes a doc that's missing a required field, the
 * strict schema rejects it; this test pins ONE valid + ONE invalid
 * shape per branch so a missing-field bug is caught at CI time, not
 * in production.
 *
 * The loose schema is also tested — used at the read boundary for
 * historical docs that may not satisfy the strict shape.
 */
import { describe, test, expect } from 'vitest';
import {
  notificationSchema,
  notificationLooseSchema,
  notificationTypeSchema,
} from '@/schemas/notification.schema';

const baseFields = {
  id:          'notif_123',
  recipientId: 'user_abc',
  title:       'Test',
  body:        'Test body',
  isRead:      false,
  createdAt:   new Date(),
};

describe('notificationTypeSchema', () => {
  test('every known type passes', () => {
    const types = [
      'admin_new_signup', 'admin_order_placed', 'admin_payment_issue',
      'customer_payment_confirmed',
      'customer_order_shipped', 'customer_order_delivered',
      'customer_order_cancelled', 'customer_order_rejected',
      'customer_order_expired',
      'customer_credit_earned', 'customer_credit_admin_added',
      'customer_credit_expiry_warning', 'customer_credit_reset',
      'customer_welcome_bonus',
    ];
    for (const t of types) {
      expect(notificationTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  test('removed type customer_order_in_progress is rejected', () => {
    expect(notificationTypeSchema.safeParse('customer_order_in_progress').success).toBe(false);
  });
});

describe('notificationSchema (strict, discriminated union)', () => {
  test('admin_order_placed accepts a complete doc', () => {
    const doc = {
      ...baseFields,
      type: 'admin_order_placed',
      data: {
        orderId: 'ELE-2604-A1B2C3',
        customerName: 'Alice',
        customerEmail: 'alice@example.com',
        customerId: 'CUS-00042',
        totalAmount: 49.99,
        subtotal: 39.99,
        shippingFee: 10,
        items: [{ productName: 'Earl Grey', quantity: 2, price: 19.99 }],
        userId: 'uid-alice',
      },
    };
    expect(notificationSchema.safeParse(doc).success).toBe(true);
  });

  test('admin_order_placed REJECTS missing customerEmail', () => {
    const doc = {
      ...baseFields,
      type: 'admin_order_placed',
      data: {
        orderId: 'ELE-2604-A1B2C3',
        customerName: 'Alice',
        // customerEmail missing
        customerId: 'CUS-00042',
        totalAmount: 49.99,
        subtotal: 39.99,
        shippingFee: 10,
        items: [],
        userId: 'uid-alice',
      },
    };
    const result = notificationSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });

  test('customer_order_shipped REQUIRES trackingNumber', () => {
    const docWithTracking = {
      ...baseFields,
      type: 'customer_order_shipped',
      data: { orderId: 'ELE-2604-A1B2C3', trackingNumber: '1Z999AA10123456784' },
    };
    expect(notificationSchema.safeParse(docWithTracking).success).toBe(true);

    const docWithoutTracking = {
      ...baseFields,
      type: 'customer_order_shipped',
      data: { orderId: 'ELE-2604-A1B2C3' },
    };
    expect(notificationSchema.safeParse(docWithoutTracking).success).toBe(false);
  });

  test('customer_credit_admin_added REQUIRES pointsAdded + newBalance', () => {
    const valid = {
      ...baseFields,
      type: 'customer_credit_admin_added',
      data: { pointsAdded: 100, newBalance: 500 },
    };
    expect(notificationSchema.safeParse(valid).success).toBe(true);

    const validNegative = {
      ...baseFields,
      type: 'customer_credit_admin_added',
      data: { pointsAdded: -50, newBalance: 450, adminNote: 'fee' },
    };
    expect(notificationSchema.safeParse(validNegative).success).toBe(true);

    const missingBalance = {
      ...baseFields,
      type: 'customer_credit_admin_added',
      data: { pointsAdded: 100 },
    };
    expect(notificationSchema.safeParse(missingBalance).success).toBe(false);
  });

  test('customer_order_delivered with zero pointsEarned is valid', () => {
    // Edge case: customer redeemed enough credit that the order
    // earned 0 points. Schema must allow this.
    const doc = {
      ...baseFields,
      type: 'customer_order_delivered',
      data: { orderId: 'ELE-2604-A1B2C3', pointsEarned: 0 },
    };
    expect(notificationSchema.safeParse(doc).success).toBe(true);
  });

  test('customer_credit_earned REJECTS pointsEarned of 0 or negative', () => {
    // Earning 0 or negative points doesn't make sense — schema enforces
    // .positive() to catch buggy callers writing 0 by mistake.
    const zero = {
      ...baseFields,
      type: 'customer_credit_earned',
      data: { orderId: 'ELE-2604-A1B2C3', pointsEarned: 0 },
    };
    expect(notificationSchema.safeParse(zero).success).toBe(false);

    const negative = {
      ...baseFields,
      type: 'customer_credit_earned',
      data: { orderId: 'ELE-2604-A1B2C3', pointsEarned: -10 },
    };
    expect(notificationSchema.safeParse(negative).success).toBe(false);
  });

  test('cancelled / rejected / expired share the same shape', () => {
    for (const type of ['customer_order_cancelled', 'customer_order_rejected', 'customer_order_expired']) {
      const doc = {
        ...baseFields,
        type,
        data: { orderId: 'ELE-2604-A1B2C3', reason: 'out of stock' },
      };
      expect(notificationSchema.safeParse(doc).success).toBe(true);
    }
  });
});

describe('notificationLooseSchema (read-side back-compat)', () => {
  test('accepts a doc that fails the strict schema', () => {
    // An old admin_order_placed without customerEmail (legacy format)
    // should still parse via the loose schema so the bell can render it.
    const legacy = {
      ...baseFields,
      type: 'admin_order_placed',
      data: { orderId: 'OLD-001', customerName: 'Bob' }, // missing many fields
    };
    expect(notificationLooseSchema.safeParse(legacy).success).toBe(true);
  });

  test('still rejects garbage data', () => {
    const garbage = { ...baseFields, type: 'not_a_real_type', data: {} };
    expect(notificationLooseSchema.safeParse(garbage).success).toBe(false);
  });

  test('createdAt is normalized to a Date for downstream consumers', () => {
    const doc = {
      ...baseFields,
      type: 'customer_welcome_bonus',
      data: { pointsEarned: 500 },
      createdAt: '2026-04-30T17:00:00Z',
    };
    const result = notificationLooseSchema.parse(doc);
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});
