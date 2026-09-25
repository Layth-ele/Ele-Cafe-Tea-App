/**
 * credit.schema.test.ts — pure-function tests for credit/loyalty math.
 *
 * Why: these calculations directly affect dollar values applied at
 * checkout. A 10x bug in `calcCreditValue` would let a customer
 * redeem $100 for a 1000-point ($1) balance. Firestore rules can't
 * cross-check this — the rules trust the client subtotal arithmetic,
 * with admin review as the secondary gate. Unit-tested math is
 * therefore a critical defense layer.
 *
 * Scope: pure functions only. Firebase-touching code (granting,
 * redeeming, transaction logging) is integration-tested separately.
 */
import { describe, test, expect } from 'vitest';
import {
  calcPointsEarned,
  calcCreditValue,
  maxRedeemable,
  pointsToNextThreshold,
  isRedeemable,
  POINTS_PER_DOLLAR,
  POINTS_PER_DOLLAR_VALUE,
  MIN_REDEEM_THRESHOLD,
} from '@/schemas/credit.schema';

describe('calcPointsEarned', () => {
  test('round numbers earn 100 pts per dollar', () => {
    expect(calcPointsEarned(1)).toBe(100);
    expect(calcPointsEarned(10)).toBe(1000);
    expect(calcPointsEarned(50)).toBe(5000);
    expect(calcPointsEarned(100)).toBe(10_000);
  });

  test('fractional dollars are floored', () => {
    // $1.99 → 199 points (not 200) — prevents over-earning
    expect(calcPointsEarned(1.99)).toBe(199);
    expect(calcPointsEarned(0.01)).toBe(1);
    // $1.005 → 100 (Math.floor strips the half-cent)
    expect(calcPointsEarned(1.005)).toBe(100);
  });

  test('zero subtotal earns zero', () => {
    expect(calcPointsEarned(0)).toBe(0);
  });

  test('matches the published rate constant', () => {
    // Sanity: the function output should always equal floor(amount * rate)
    for (let amount = 0.1; amount < 100; amount += 7.3) {
      expect(calcPointsEarned(amount))
        .toBe(Math.floor(amount * POINTS_PER_DOLLAR));
    }
  });
});

describe('calcCreditValue', () => {
  test('1000 points = $1', () => {
    expect(calcCreditValue(1000)).toBe(1);
  });

  test('10,000 points = $10 (the minimum redeem block)', () => {
    expect(calcCreditValue(10_000)).toBe(10);
    expect(calcCreditValue(MIN_REDEEM_THRESHOLD)).toBe(10);
  });

  test('handles non-multiple values without rounding', () => {
    // Real Firestore values may be non-multiples after admin manual
    // adjustments. The function returns exact ratios — the redeem
    // flow uses maxRedeemable() to clamp to a valid block.
    expect(calcCreditValue(1500)).toBe(1.5);
    expect(calcCreditValue(2750)).toBe(2.75);
  });

  test('zero balance has zero value', () => {
    expect(calcCreditValue(0)).toBe(0);
  });

  test('matches inverse of calcPointsEarned for round dollars', () => {
    // Earning 100 pts/$ and redeeming at 1000 pts/$ means a 10:1
    // earn:redeem ratio — i.e. 10% effective cashback once redeemed.
    // This test pins that economic relationship in code.
    const earned   = calcPointsEarned(100);            // 10,000 pts
    const dollars  = calcCreditValue(earned);           // $10
    expect(dollars).toBe(10);
    expect(POINTS_PER_DOLLAR / POINTS_PER_DOLLAR_VALUE).toBeCloseTo(0.1);
  });
});

describe('maxRedeemable', () => {
  test('clamps to nearest 10k block below balance', () => {
    expect(maxRedeemable(0)).toBe(0);
    expect(maxRedeemable(9_999)).toBe(0);
    expect(maxRedeemable(10_000)).toBe(10_000);
    expect(maxRedeemable(15_000)).toBe(10_000);
    expect(maxRedeemable(19_999)).toBe(10_000);
    expect(maxRedeemable(20_000)).toBe(20_000);
    expect(maxRedeemable(99_999)).toBe(90_000);
  });
});

describe('pointsToNextThreshold', () => {
  // Fresh-account special case: by design, balance=0 returns the FULL
  // threshold (not 0) so the UI shows "10,000 to go" instead of "—".
  // See the function's docstring + CreditWidget consumer.
  test('returns full threshold for fresh account (balance=0)', () => {
    expect(pointsToNextThreshold(0)).toBe(MIN_REDEEM_THRESHOLD);
  });

  test('zero when balance is exactly on a non-zero threshold', () => {
    expect(pointsToNextThreshold(10_000)).toBe(0);
    expect(pointsToNextThreshold(20_000)).toBe(0);
  });

  test('counts up to the next 10k', () => {
    expect(pointsToNextThreshold(1)).toBe(9_999);
    expect(pointsToNextThreshold(500)).toBe(9_500);
    expect(pointsToNextThreshold(9_999)).toBe(1);
    expect(pointsToNextThreshold(10_001)).toBe(9_999);
  });
});

describe('isRedeemable', () => {
  test('false below threshold', () => {
    expect(isRedeemable(0)).toBe(false);
    expect(isRedeemable(9_999)).toBe(false);
  });

  test('true at and above threshold', () => {
    expect(isRedeemable(10_000)).toBe(true);
    expect(isRedeemable(50_000)).toBe(true);
  });
});
