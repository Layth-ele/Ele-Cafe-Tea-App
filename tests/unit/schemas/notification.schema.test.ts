/**
 * notification.schema.test.ts — order ID format guarantees.
 *
 * generateOrderId is now used as the Firestore document ID for
 * orders (idempotency fix in CheckoutPage). The format must be:
 *
 *   - Stable across releases (customers reference order IDs in support)
 *   - Safe as a Firestore doc ID (no /, no whitespace, no quotes)
 *   - Unique enough that two checkouts started in the same millisecond
 *     are vanishingly unlikely to collide
 *
 * These tests pin those guarantees.
 */
import { describe, test, expect } from 'vitest';
import { generateOrderId, formatCustomerId } from '@/schemas/notification.schema';

describe('generateOrderId', () => {
  test('matches the documented format ELE-YYMM-XXXXXX', () => {
    const id = generateOrderId();
    // Two-digit year + two-digit month + dash + 6 alphanumeric.
    expect(id).toMatch(/^ELE-\d{4}-[A-Z0-9]{6}$/);
  });

  test('contains the current year/month', () => {
    const id = generateOrderId();
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    expect(id).toContain(`ELE-${yy}${mm}-`);
  });

  test('safe as a Firestore doc ID — no forbidden characters', () => {
    // Firestore doc IDs can't contain: / \ . . __.*__ or be empty.
    // We're stricter — only A-Z, 0-9, and hyphen.
    for (let i = 0; i < 50; i++) {
      const id = generateOrderId();
      expect(id).not.toContain('/');
      expect(id).not.toContain('\\');
      expect(id).not.toContain('.');
      expect(id).not.toContain(' ');
      expect(id).not.toContain('"');
      expect(id).not.toContain("'");
      expect(id.length).toBeGreaterThan(0);
    }
  });

  test('500 successive calls produce 500 distinct IDs', () => {
    // Same-millisecond collisions are possible in principle (3 random
    // chars after the millisecond suffix). Verify the practical
    // collision rate is effectively zero — important since collisions
    // would now mean a customer's second order overwrites the first.
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) ids.add(generateOrderId());
    expect(ids.size).toBe(500);
  });
});

describe('formatCustomerId', () => {
  test('zero-pads to 5 digits', () => {
    expect(formatCustomerId(1)).toBe('CUS-00001');
    expect(formatCustomerId(42)).toBe('CUS-00042');
    expect(formatCustomerId(99_999)).toBe('CUS-99999');
  });

  test('does not truncate when count exceeds 5 digits', () => {
    // Future-proofing: we'll grow past 100k customers eventually.
    // The function shouldn't lose digits when that happens.
    expect(formatCustomerId(100_000)).toBe('CUS-100000');
    expect(formatCustomerId(999_999)).toBe('CUS-999999');
  });
});
