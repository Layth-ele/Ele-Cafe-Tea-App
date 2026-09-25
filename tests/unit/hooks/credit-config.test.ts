/**
 * credit-config.test.ts — regression coverage for the LIVE credit
 * rate configuration that the customer-facing UI uses.
 *
 * tests/unit/schemas/credit.schema.test.ts covers the static
 * constants (POINTS_PER_DOLLAR etc.). This file covers the
 * `makeCreditConfig(settings)` builder — the pure function the
 * useCreditConfig hook wraps — which closes over admin-edited
 * /settings/global values. That's the math customers actually see.
 *
 * Why this matters: a bug here would mean the customer's "you have
 * $5.00 in credit" badge shows a different dollar value than the
 * server applies at checkout. The server has its own (matching)
 * formula and a $0.01 tolerance — divergence beyond that produces
 * "rate mismatch" order rejections. These tests pin the two sides
 * to the same formula.
 */
import { describe, test, expect } from 'vitest';
import { makeCreditConfig } from '@/hooks/useCreditConfig';

describe('makeCreditConfig — default settings (empty / null doc)', () => {
  test('with no settings: defaults to 100 pts/$, 1000 pts = $1, min 10000 to redeem', () => {
    const cfg = makeCreditConfig(null);
    expect(cfg.pointsPerDollar).toBe(100);
    expect(cfg.pointsPer1000).toBe(1000); // 1000 / dollarsPer1000(1) = 1000
    expect(cfg.minRedeem).toBe(10000);
  });

  test('with empty object: same defaults', () => {
    const cfg = makeCreditConfig({});
    expect(cfg.pointsPerDollar).toBe(100);
    expect(cfg.pointsPer1000).toBe(1000);
    expect(cfg.minRedeem).toBe(10000);
  });
});

describe('makeCreditConfig — calcCreditValue (the rate-critical formula)', () => {
  // The server's rate check (functions/src/index.ts) computes:
  //   expectedCreditApplied = pointsRedeemed * dollarsPer1000 / 1000
  // The client MUST use the same formula. If they diverge by more
  // than $0.01 the order is rejected with "rate mismatch."

  test('default rate: 10000 pts = $10', () => {
    const cfg = makeCreditConfig({});
    expect(cfg.calcCreditValue(10000)).toBe(10);
  });

  test('default rate: 1 pt = $0.001', () => {
    const cfg = makeCreditConfig({});
    expect(cfg.calcCreditValue(1)).toBeCloseTo(0.001, 4);
  });

  test('admin sets creditValuePer1000 = 2: 10000 pts = $20', () => {
    const cfg = makeCreditConfig({ creditValuePer1000: 2 });
    expect(cfg.calcCreditValue(10000)).toBe(20);
  });

  test('R3 Bug #7 regression: dollarsPer1000=3 gives EXACT dollars (no lossy round-trip)', () => {
    // Pre-fix the client used pointsPer1000 = round(1000/3) = 333,
    // then points/333. calcCreditValue(30000) returned $90.09,
    // server expected $90.00 — rate mismatch, order rejected.
    // The fix is the DIRECT formula `points * dollarsPer1000 / 1000`.
    // Pin it here.
    const cfg = makeCreditConfig({ creditValuePer1000: 3 });
    expect(cfg.calcCreditValue(30000)).toBe(90);
    expect(cfg.calcCreditValue(10000)).toBe(30);
    // Server formula reference — must match within $0.01.
    const dollarsPer1000 = 3;
    const expectedServerValue = 30000 * dollarsPer1000 / 1000;
    expect(Math.abs(cfg.calcCreditValue(30000) - expectedServerValue)).toBeLessThan(0.01);
  });

  test('fractional rate (creditValuePer1000=0.5): 10000 pts = $5', () => {
    const cfg = makeCreditConfig({ creditValuePer1000: 0.5 });
    expect(cfg.calcCreditValue(10000)).toBe(5);
  });
});

describe('makeCreditConfig — maxRedeemable', () => {
  test('balance below threshold → 0 redeemable', () => {
    const cfg = makeCreditConfig({});
    expect(cfg.maxRedeemable(5000)).toBe(0);
    expect(cfg.maxRedeemable(9999)).toBe(0);
  });

  test('balance exactly at threshold → minRedeem redeemable', () => {
    const cfg = makeCreditConfig({});
    expect(cfg.maxRedeemable(10000)).toBe(10000);
  });

  test('balance above threshold rounds DOWN to multiple of minRedeem', () => {
    const cfg = makeCreditConfig({});
    expect(cfg.maxRedeemable(15000)).toBe(10000);
    expect(cfg.maxRedeemable(25000)).toBe(20000);
    expect(cfg.maxRedeemable(35999)).toBe(30000);
  });

  test('custom minRedeem from admin settings', () => {
    const cfg = makeCreditConfig({ minRedemptionPts: 5000 });
    expect(cfg.maxRedeemable(7500)).toBe(5000);
    expect(cfg.maxRedeemable(15000)).toBe(15000);
  });
});

describe('makeCreditConfig — pointsToNextThreshold', () => {
  test('balance == 0 → FULL minRedeem (fresh account)', () => {
    // Pin: a brand-new user with 0 balance shouldn't see "0 pts to
    // next $1" — they need the entire minRedeem to qualify.
    const cfg = makeCreditConfig({});
    expect(cfg.pointsToNextThreshold(0)).toBe(10000);
  });

  test('balance exactly on a threshold → 0', () => {
    const cfg = makeCreditConfig({});
    expect(cfg.pointsToNextThreshold(10000)).toBe(0);
    expect(cfg.pointsToNextThreshold(20000)).toBe(0);
  });

  test('balance between thresholds → distance to next', () => {
    const cfg = makeCreditConfig({});
    expect(cfg.pointsToNextThreshold(7500)).toBe(2500);
    expect(cfg.pointsToNextThreshold(15000)).toBe(5000);
  });
});

describe('makeCreditConfig — isRedeemable', () => {
  test('returns false when balance is below minRedeem', () => {
    const cfg = makeCreditConfig({});
    expect(cfg.isRedeemable(0)).toBe(false);
    expect(cfg.isRedeemable(9999)).toBe(false);
  });

  test('returns true at and above minRedeem', () => {
    const cfg = makeCreditConfig({});
    expect(cfg.isRedeemable(10000)).toBe(true);
    expect(cfg.isRedeemable(100000)).toBe(true);
  });
});

describe('makeCreditConfig — calcPointsEarned', () => {
  test('default rate: $10 spent earns 1000 points', () => {
    const cfg = makeCreditConfig({});
    expect(cfg.calcPointsEarned(10)).toBe(1000);
  });

  test('rate is configurable: $10 at 200 pts/$ earns 2000', () => {
    const cfg = makeCreditConfig({ pointsPerDollar: 200 });
    expect(cfg.calcPointsEarned(10)).toBe(2000);
  });

  test('fractional dollars are FLOORED (never overcredit on rounding)', () => {
    // $9.99 at 100 pts/$ = 999 pts (not 1000 from rounding up). Pin
    // the floor direction — overcrediting points would let customers
    // accumulate points faster than the rules anticipate.
    const cfg = makeCreditConfig({});
    expect(cfg.calcPointsEarned(9.99)).toBe(999);
  });

  test('zero or negative amount earns 0 points', () => {
    const cfg = makeCreditConfig({});
    expect(cfg.calcPointsEarned(0)).toBe(0);
    expect(cfg.calcPointsEarned(-5)).toBe(0);
  });
});

describe('makeCreditConfig — defensive input handling', () => {
  test('NaN settings fall back to defaults', () => {
    const cfg = makeCreditConfig({
      pointsPerDollar:    NaN,
      creditValuePer1000: NaN,
      minRedemptionPts:   NaN,
    });
    expect(cfg.pointsPerDollar).toBe(100);
    expect(cfg.minRedeem).toBe(10000);
    expect(cfg.calcCreditValue(10000)).toBe(10);
  });

  test('negative settings fall back to defaults', () => {
    const cfg = makeCreditConfig({
      pointsPerDollar:    -1,
      creditValuePer1000: -10,
      minRedemptionPts:   -5000,
    });
    expect(cfg.pointsPerDollar).toBe(100);
    expect(cfg.minRedeem).toBe(10000);
  });

  test('zero settings fall back to defaults (defends against admin save of 0)', () => {
    // pickPositive treats 0 as invalid because 0 pts/$ would silently
    // disable earn (every order earns 0). Admins setting 0 must mean
    // a mistake.
    const cfg = makeCreditConfig({
      pointsPerDollar:    0,
      creditValuePer1000: 0,
      minRedemptionPts:   0,
    });
    expect(cfg.pointsPerDollar).toBe(100);
    expect(cfg.calcCreditValue(10000)).toBe(10);
    expect(cfg.minRedeem).toBe(10000);
  });

  test('Infinity sanitised to default', () => {
    const cfg = makeCreditConfig({
      pointsPerDollar:    Infinity,
      creditValuePer1000: Infinity,
      minRedemptionPts:   Infinity,
    });
    expect(cfg.pointsPerDollar).toBe(100);
    expect(cfg.minRedeem).toBe(10000);
  });
});

describe('makeCreditConfig — server/client rate parity (CRITICAL)', () => {
  // For every rate the admin can plausibly set, the client formula
  // MUST agree with the server formula to within $0.01. If any of
  // these fail the order will be silently rejected at checkout with
  // "rate mismatch."

  function serverCalc(points: number, dollarsPer1000: number): number {
    return points * dollarsPer1000 / 1000;
  }

  const RATES = [0.5, 1, 2, 3, 5, 10, 0.001, 99];
  const POINT_AMOUNTS = [1, 100, 1000, 5000, 10000, 30000, 100000];

  test.each(
    RATES.flatMap(r =>
      POINT_AMOUNTS.map(p => [r, p] as const)
    )
  )('client formula matches server at rate=%s, points=%s', (rate, points) => {
    const cfg = makeCreditConfig({ creditValuePer1000: rate });
    const clientValue = cfg.calcCreditValue(points);
    const serverValue = serverCalc(points, rate);
    // Server's tolerance is $0.01 — must agree within that.
    expect(Math.abs(clientValue - serverValue)).toBeLessThan(0.01);
  });
});
