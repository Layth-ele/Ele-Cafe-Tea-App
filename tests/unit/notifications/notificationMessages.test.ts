/**
 * notificationMessages.test.ts — pin per-type fallback titles + bodies.
 *
 * If the cloud function fails to write a title/body for some reason
 * (or future code paths write empty strings), the bell falls back to
 * these. Pinning the strings catches accidental copy changes that
 * would surface in production as different wording.
 */
import { describe, test, expect } from 'vitest';
import { buildNotificationMessage, NOTIFICATION_META } from '@/lib/notificationMessages';

describe('buildNotificationMessage', () => {
  test('admin_new_signup includes name + email', () => {
    const msg = buildNotificationMessage({
      type: 'admin_new_signup',
      data: { customerName: 'Alice', customerEmail: 'alice@example.com', joinDate: '2026-04-30' },
    });
    expect(msg.title).toContain('Alice');
    expect(msg.body).toContain('alice@example.com');
  });

  test('admin_order_placed includes orderId + total + customer name', () => {
    const msg = buildNotificationMessage({
      type: 'admin_order_placed',
      data: {
        orderId: 'ELE-2604-A1B2C3',
        customerName: 'Bob',
        customerEmail: 'bob@example.com',
        customerId: 'CUS-00001',
        totalAmount: 49.99,
        subtotal: 39.99,
        shippingFee: 10,
        items: [],
        userId: 'uid-bob',
      },
    });
    expect(msg.title).toContain('ELE-2604-A1B2C3');
    expect(msg.body).toContain('Bob');
    expect(msg.body).toContain('$49.99');
  });

  test('customer_order_shipped includes tracking number', () => {
    const msg = buildNotificationMessage({
      type: 'customer_order_shipped',
      data: {
        orderId: 'ELE-2604-A1B2C3',
        trackingNumber: '1Z999AA10123456784',
        carrier: 'UPS',
      },
    });
    expect(msg.title).toContain('shipped');
    expect(msg.body).toContain('1Z999AA10123456784');
    expect(msg.body).toContain('UPS');
  });

  test('customer_order_shipped without carrier omits the parenthetical', () => {
    const msg = buildNotificationMessage({
      type: 'customer_order_shipped',
      data: { orderId: 'ELE-2604-A1B2C3', trackingNumber: '1Z999AA10123456784' },
    });
    expect(msg.body).not.toContain('(');
  });

  test('customer_order_delivered with zero points uses simple message', () => {
    const msg = buildNotificationMessage({
      type: 'customer_order_delivered',
      data: { orderId: 'ELE-2604-A1B2C3', pointsEarned: 0 },
    });
    expect(msg.body).toBe('Enjoy your tea!');
  });

  test('customer_order_delivered with non-zero points includes count', () => {
    const msg = buildNotificationMessage({
      type: 'customer_order_delivered',
      data: { orderId: 'ELE-2604-A1B2C3', pointsEarned: 1500 },
    });
    expect(msg.body).toContain('1,500');
    expect(msg.body).toContain('pts');
  });

  test('customer_credit_admin_added positive shows "+N bonus points"', () => {
    const msg = buildNotificationMessage({
      type: 'customer_credit_admin_added',
      data: { pointsAdded: 200, newBalance: 700 },
    });
    expect(msg.title).toBe('+200 bonus points');
    expect(msg.body).toContain('700');
  });

  test('customer_credit_admin_added negative shows "-N points adjusted"', () => {
    const msg = buildNotificationMessage({
      type: 'customer_credit_admin_added',
      data: { pointsAdded: -50, newBalance: 450 },
    });
    expect(msg.title).toBe('-50 points adjusted');
  });

  test('customer_credit_admin_added with adminNote includes it in body', () => {
    const msg = buildNotificationMessage({
      type: 'customer_credit_admin_added',
      data: { pointsAdded: 100, newBalance: 600, adminNote: 'Loyalty bonus' },
    });
    expect(msg.body).toContain('Loyalty bonus');
  });

  test('customer_order_cancelled with reason includes it', () => {
    const msg = buildNotificationMessage({
      type: 'customer_order_cancelled',
      data: { orderId: 'ELE-2604-A1B2C3', reason: 'out of stock' },
    });
    expect(msg.body).toContain('out of stock');
  });

  test('customer_order_cancelled without reason has fallback', () => {
    const msg = buildNotificationMessage({
      type: 'customer_order_cancelled',
      data: { orderId: 'ELE-2604-A1B2C3' },
    });
    expect(msg.body).toContain('cancelled');
  });
});

describe('NOTIFICATION_META', () => {
  test('every notification type has metadata', () => {
    const types = [
      'admin_new_signup', 'admin_order_placed', 'admin_payment_issue',
      'customer_payment_confirmed',
      'customer_order_shipped', 'customer_order_delivered',
      'customer_order_cancelled', 'customer_order_rejected',
      'customer_order_expired',
      'customer_credit_earned', 'customer_credit_admin_added',
      'customer_credit_expiry_warning', 'customer_credit_reset',
      'customer_welcome_bonus',
    ] as const;
    for (const t of types) {
      const meta = NOTIFICATION_META[t];
      expect(meta).toBeDefined();
      expect(meta.emoji).toBeTruthy();
      expect(['order', 'credit', 'account']).toContain(meta.category);
      expect(['admin', 'user']).toContain(meta.audience);
    }
  });

  test('admin_* types have audience=admin', () => {
    expect(NOTIFICATION_META.admin_new_signup.audience).toBe('admin');
    expect(NOTIFICATION_META.admin_order_placed.audience).toBe('admin');
    expect(NOTIFICATION_META.admin_payment_issue.audience).toBe('admin');
  });

  test('customer_* types have audience=user', () => {
    expect(NOTIFICATION_META.customer_payment_confirmed.audience).toBe('user');
    expect(NOTIFICATION_META.customer_credit_earned.audience).toBe('user');
    expect(NOTIFICATION_META.customer_welcome_bonus.audience).toBe('user');
  });
});
