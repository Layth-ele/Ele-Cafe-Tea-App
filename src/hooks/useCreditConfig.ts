/**
 * useCreditConfig — live credit configuration helpers.
 *
 * Single source of truth for the three credit-related settings that
 * /admin/settings exposes: pointsPerDollar, creditValuePer1000, and
 * minRedemptionPts. Components that compute or format credit amounts
 * should import from here instead of using the static constants in
 * src/schemas/credit.schema.ts — those constants are now FALLBACKS,
 * not the source of truth.
 *
 * Why this hook exists:
 *
 * Several components were importing MIN_REDEEM_THRESHOLD,
 * POINTS_PER_DOLLAR_VALUE, and POINTS_PER_DOLLAR directly from
 * credit.schema.ts. This silently broke when admin changed these
 * values via /admin/settings:
 *   - CreditWidget's progress bar used % MIN_REDEEM_THRESHOLD math, so
 *     lowering the threshold made the bar stuck at 50% capacity.
 *   - WelcomeCreditModal showed the wrong dollar value of the bonus.
 *   - AdminCustomers showed customers' credit balance with the wrong $
 *     conversion.
 *
 * Now the hook reads /settings/global once via useSettings and exposes
 * fixed-at-render-time values + helper functions that close over them.
 * Memoized so consumers don't re-render unnecessarily.
 */

import { useMemo } from 'react';
import { useSettings } from './useSettings';
import {
  POINTS_PER_DOLLAR        as DEFAULT_POINTS_PER_DOLLAR,
  POINTS_PER_DOLLAR_VALUE  as DEFAULT_PER_1000,
  MIN_REDEEM_THRESHOLD     as DEFAULT_MIN_REDEEM,
} from '@/schemas/credit.schema';

export interface CreditConfig {
  /** Points earned per $1 spent. Default 100. */
  pointsPerDollar: number;
  /** Points required for $1 of credit value. Default 1000 (so 10k pts = $10). */
  pointsPer1000:   number;
  /** Minimum points required to redeem. Default 10000. */
  minRedeem:       number;

  // Helpers — same signatures as the schema-level functions but
  // closed over the LIVE values, not the constants.

  /** Points → dollar value at the current credit rate. */
  calcCreditValue: (points: number) => number;
  /** Largest redeemable block ≤ balance, rounded down to a multiple of minRedeem. */
  maxRedeemable:   (balance: number) => number;
  /** Whether balance is high enough to redeem at all. */
  isRedeemable:    (balance: number) => boolean;
  /** How many points until the next minRedeem threshold. 0 if already on a threshold. */
  pointsToNextThreshold: (balance: number) => number;
  /** Points earned from a pre-GST amount. */
  calcPointsEarned: (amountPaidPreGst: number) => number;
}

/** Validate that a settings value is a usable positive number. Defends
 *  against NaN, undefined, negative, and non-finite values from dirty
 *  settings docs. */
function pickPositive(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Pure-function credit-config builder — extracted from the hook so the
 * helpers can be tested without React/Firebase plumbing. Same inputs
 * as the hook (the live /settings/global doc, partial or full); same
 * outputs (config struct with closure-captured helpers). The hook is
 * now a thin useMemo wrapper that calls this.
 *
 * Behaviour pinned by tests/unit/hooks/credit-config.test.ts:
 *   - Defaults: 100 pts/$, 1000 pts = $1, min 10000 pts to redeem.
 *   - calcCreditValue uses the DIRECT formula `points * dollarsPer1000 / 1000`
 *     — must match the server-side rate check in functions/src/index.ts
 *     to within $0.01 to avoid "rate mismatch" order rejections.
 *   - maxRedeemable: floor-multiple of minRedeem.
 *   - pointsToNextThreshold: 0 when balance is exactly on a threshold;
 *     returns the FULL minRedeem when balance is 0 (fresh accounts).
 *   - All inputs sanitised via pickPositive: NaN/negative/Infinity →
 *     fallback to the default. Stops a dirty admin doc from yielding
 *     NaN dollar values in the UI.
 */
export function makeCreditConfig(settings: {
  pointsPerDollar?:    number | null | undefined;
  creditValuePer1000?: number | null | undefined;
  minRedemptionPts?:   number | null | undefined;
} | null | undefined): CreditConfig {
  const pointsPerDollar = pickPositive(settings?.pointsPerDollar,    DEFAULT_POINTS_PER_DOLLAR);
  // creditValuePer1000 is admin-set in DOLLARS (e.g. 1 = "1000 pts =
  // $1"). Server (cloud function rate validation in placeOrder /
  // onOrderWrite) computes dollars as `points * dollarsPer1000 / 1000`
  // — so the client MUST mirror that formula exactly to avoid the
  // bait-and-switch where UI says $X and server expects $Y.
  //
  // R3 Bug #7: previously the client computed `pointsPer1000 =
  // Math.round(1000 / dollarsPer1000)` and then `points / pointsPer1000`.
  // That introduced a lossy inversion — at dollarsPer1000=3, the
  // round(333.33)=333 produced calcCreditValue(30000) = $90.09,
  // while the server's direct formula expected exactly $90.00. The
  // server's `claimedCreditApplied > expectedCreditApplied + 0.01`
  // check then rejected the order with "rate mismatch" — for a
  // configuration the admin set themselves.
  //
  // Now: store dollarsPer1000 directly and use the same formula on
  // both sides. `pointsPer1000` is still exposed for any UI that
  // wants the inverse rate (e.g., "you'd need 333 pts for $1") —
  // but it's a DERIVED display value and never participates in the
  // dollar conversion.
  const dollarsPer1000  = pickPositive(settings?.creditValuePer1000, 1);
  const pointsPer1000   = Math.round(1000 / dollarsPer1000);
  const minRedeem       = pickPositive(settings?.minRedemptionPts,   DEFAULT_MIN_REDEEM);

  return {
    pointsPerDollar,
    pointsPer1000,
    minRedeem,
    // Direct formula matching cloud function — no rounding round-trip.
    calcCreditValue: (points) => points * dollarsPer1000 / 1000,
    maxRedeemable:   (balance) => Math.floor(balance / minRedeem) * minRedeem,
    isRedeemable:    (balance) => balance >= minRedeem,
    pointsToNextThreshold: (balance) => {
      // balance==0 is the special case: the user has nothing yet, so
      // "to next threshold" is the FULL minRedeem, not 0. Without this
      // guard, the widget shows "0 pts to next $1" to a user who
      // actually needs the full minRedeem to redeem anything.
      if (balance <= 0) return minRedeem;
      const remainder = balance % minRedeem;
      return remainder === 0 ? 0 : minRedeem - remainder;
    },
    calcPointsEarned: (amount) => Math.floor(Math.max(0, amount) * pointsPerDollar),
  };
}

export function useCreditConfig(): CreditConfig {
  const settings = useSettings();

  // Intentionally narrow the dep array to the THREE fields makeCreditConfig
  // actually reads. Watching the whole `settings` object would re-memoize on
  // every unrelated field change (theme color, hero image, etc.), defeating
  // the point of the memo. The fields below are the complete read-set; if
  // makeCreditConfig grows to read more, add them here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => makeCreditConfig(settings), [
    settings?.pointsPerDollar,
    settings?.creditValuePer1000,
    settings?.minRedemptionPts,
  ]);
}

/** Re-export the legacy default values so callers that need a static
 *  number (e.g. for type narrowing) still have one. Use the hook for
 *  display in components — it respects admin's settings. */
export {
  DEFAULT_POINTS_PER_DOLLAR,
  DEFAULT_PER_1000,
  DEFAULT_MIN_REDEEM,
};
