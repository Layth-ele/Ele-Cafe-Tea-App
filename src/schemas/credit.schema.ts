import { z } from 'zod';

// ─── Constants ────────────────────────────────────────────────────────────────
export const POINTS_PER_DOLLAR     = 100;   // earn 100 pts per $1 spent
export const POINTS_PER_DOLLAR_VALUE = 1000; // 1000 pts = $1 value  (10k = $10)
export const MIN_REDEEM_THRESHOLD  = 10_000; // minimum to redeem
/** Default welcome bonus — used ONLY as a documentation reference and
 *  as the AdminSettings form's initial value when /settings/global
 *  doesn't have a saved value yet. NO RUNTIME LOGIC reads this constant.
 *  At runtime the actual value comes from /settings/global.welcomeBonusPoints,
 *  which the admin sets via /admin/settings → Credit System → "Welcome
 *  bonus (pts)". The cloud function (functions/src/index.ts → onNewUser)
 *  reads that same Firestore field when granting the bonus on signup.
 *  Changing this number does NOT change behaviour — change it via admin UI. */
export const WELCOME_BONUS_POINTS  = 500;
export const ANNUAL_RESET_MONTH    = 0;      // January (0-indexed)
export const ANNUAL_RESET_DAY      = 1;

// ─── Transaction types ────────────────────────────────────────────────────────
export const creditTxTypeSchema = z.enum([
  'earn',          // points earned from an order
  'earn_reversed', // earn rolled back because a delivered order was later cancelled
  'redeem',        // points redeemed at checkout
  'refund',        // redeemed points returned because the order was cancelled / rejected
  'admin_add',     // admin manually added points
  'admin_deduct',  // admin manually deducted points
  'welcome',       // signup bonus
  'expired',       // annual January 1st reset
]);

export type CreditTxType = z.infer<typeof creditTxTypeSchema>;

// ─── Credit account doc — /credits/{userId} ──────────────────────────────────
export const creditAccountSchema = z.object({
  userId:             z.string().min(1),
  balance:            z.number().int().min(0),   // current redeemable pts
  lifetimeEarned:     z.number().int().min(0),   // all-time earned (never decreases)
  lifetimeRedeemed:   z.number().int().min(0),   // all-time redeemed
  lifetimeSpend:      z.number().min(0),         // total $ spent pre-GST
  orderCount:         z.number().int().min(0),   // total completed orders
  // R3 file2 Bug #16: `lastEarnedAt` was previously declared here with
  // a comment claiming "drives expiry" — but onAnnualCreditReset uses
  // a calendar-year reset (Jan 1 PT for everyone), not a per-user
  // last-earn-relative window. AdminCustomers read the field into a
  // row property but never displayed it. Cloud function wrote it on
  // every earn / welcome / annual-reset. All write, no read.
  //
  // Removed from the schema + writes. If a per-user expiry policy is
  // ever introduced, re-add the field with a real consumer at the same
  // time.
  welcomeBonusGiven:  z.boolean().default(false),
  /** When the welcome bonus was actually granted. Used by
   *  onAnnualCreditReset to skip recently-issued bonuses (90-day
   *  grace) so a December signup doesn't lose their gift on Jan 1. */
  welcomeBonusGrantedAt: z.date().optional(),
  createdAt:          z.date(),
  updatedAt:          z.date(),
});

export type CreditAccount = z.infer<typeof creditAccountSchema>;

// ─── Credit transaction — /creditTransactions/{txId} ─────────────────────────
export const creditTransactionSchema = z.object({
  id:             z.string().min(1),
  userId:         z.string().min(1),
  type:           creditTxTypeSchema,
  points:         z.number().int(),   // positive = added, negative = deducted
  balanceAfter:   z.number().int().min(0),
  orderId:        z.string().optional(),
  orderSubtotal:  z.number().nonnegative().optional(),  // pre-GST subtotal for earn tx
  // R3 file2 Bug #21: was z.number().optional() — allowed negative
  // values to parse cleanly. The other monetary fields here
  // (balanceAfter) and on the account schema (balance, lifetimeEarned,
  // etc.) all have min(0) / nonnegative. A negative creditApplied
  // would represent a refund-as-positive-deduction that doesn't
  // match the writes anywhere in the codebase. Tighten to nonnegative.
  creditApplied:  z.number().nonnegative().optional(),  // $ credit applied (for redeem tx)
  adminNote:      z.string().max(500).optional(),
  addedByAdmin:   z.string().optional(),  // admin UID
  createdAt:      z.date(),
});

export type CreditTransaction = z.infer<typeof creditTransactionSchema>;

// ─── Admin manual credit input ────────────────────────────────────────────────
export const adminCreditInputSchema = z.object({
  userId:  z.string().min(1),
  points:  z.number().int().refine(v => v !== 0, 'Points cannot be zero'),
  note:    z.string().min(5, 'Please provide a reason (min 5 characters)').max(500),
});

export type AdminCreditInput = z.infer<typeof adminCreditInputSchema>;

// ─── Pure helper functions (no Firebase — safe to test) ──────────────────────

/** Points earned from a subtotal (on amount actually paid after credit) */
export function calcPointsEarned(amountPaidPreGst: number): number {
  return Math.floor(amountPaidPreGst * POINTS_PER_DOLLAR);
}

/** Dollar value of a points amount */
export function calcCreditValue(points: number): number {
  return points / POINTS_PER_DOLLAR_VALUE;
}

/** Largest redeemable block (must be multiple of MIN_REDEEM_THRESHOLD) */
export function maxRedeemable(balance: number): number {
  return Math.floor(balance / MIN_REDEEM_THRESHOLD) * MIN_REDEEM_THRESHOLD;
}

/** How many points to the next 10k threshold. Returns the full
 *  threshold for balance==0 — a fresh-account user needs the entire
 *  threshold to first qualify, not 0. */
export function pointsToNextThreshold(balance: number): number {
  if (balance <= 0) return MIN_REDEEM_THRESHOLD;
  const remainder = balance % MIN_REDEEM_THRESHOLD;
  return remainder === 0 ? 0 : MIN_REDEEM_THRESHOLD - remainder;
}

/** Whether user can redeem at all */
export function isRedeemable(balance: number): boolean {
  return balance >= MIN_REDEEM_THRESHOLD;
}

/** Cap credit so it can't exceed the pre-GST subtotal */
export function capCredit(requestedCredit: number, subtotal: number): number {
  return Math.min(requestedCredit, subtotal);
}

/** Get next Jan 1 reset date from now */
export function nextAnnualReset(): Date {
  const now = new Date();
  const nextYear = now.getFullYear() + 1;
  return new Date(nextYear, ANNUAL_RESET_MONTH, ANNUAL_RESET_DAY, 0, 0, 0);
}

// ─── Admin manual credit FORM input ──────────────────────────────────────────
// Phase 6 form schema. Differs from adminCreditInputSchema in that
// it tracks `mode` ('add' | 'deduct') + the raw points number from
// the form, and produces the signed `points` value in the submit
// handler. The base schema is what the BACKEND validates; this is
// the UI shape.
export const adminCreditFormSchema = z.object({
  mode:    z.enum(['add', 'deduct']),
  // RHF's `register('points', { valueAsNumber: true })` coerces the
  // raw input string to a number BEFORE this schema sees it, so we
  // can validate as a plain number. Using z.coerce.number() here
  // would give the schema the wrong INPUT type for inference and
  // confuse RHF's resolver typings.
  points:  z.number()
    .int('Points must be a whole number')
    .min(1, 'Points must be at least 1'),
  note:    z.string().min(5, 'Please provide a reason (min 5 characters)').max(500),
});

export type AdminCreditFormInput = z.infer<typeof adminCreditFormSchema>;
