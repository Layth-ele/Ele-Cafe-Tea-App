/**
 * usePromoCode — validates a promo code against /promotions collection.
 *
 * Checks: code exists, is active, dates valid, usage limits,
 * per-user limit, minimum purchase. Returns the discount amount in $.
 */
import { useState, useCallback, useRef } from 'react';
import {
  collection, query, where, getDocs, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

import { tNow } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
export interface PromoResult {
  id:            string;
  code:          string;
  discountType:  'percentage' | 'fixed';
  discountValue: number;
  discountAmount: number; // $ amount off the subtotal
  description:   string;
}

// R3 Bug #5 helper: a promo's startDate / endDate may be stored as a
// Firestore Timestamp (the canonical type), an ISO string (legacy
// admin tooling), or a plain JS Date. `new Date(timestampObject)`
// returns Invalid Date — the previous code silently no-op'd both
// branches because `Invalid Date > now` is always false. This helper
// normalises all three shapes into a real Date or null. Null means
// "no constraint" (the field was missing or unparseable).
function asDate(v: unknown): Date | null {
  if (v == null) return null;
  // Firestore Timestamp instance — duck-type via toDate() rather than
  // an instanceof check, because the cloud-SDK Timestamp class isn't
  // the same constructor that admin tooling may persist via REST.
  if (typeof v === 'object' && v !== null && typeof (v as { toDate?: unknown }).toDate === 'function') {
    try { return (v as Timestamp).toDate(); } catch (err) {
      console.warn('[usePromoCode] Timestamp conversion failed:', err);
      /* fall through */
    }
  }
  if (v instanceof Date) {
    return Number.isFinite(v.getTime()) ? v : null;
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

/**
 * Pure-function promo discount math — extracted from the hook so it's
 * testable without Firebase. Same formula the hook uses inline; this
 * helper is the single source of truth and the hook calls it below.
 *
 * Behaviour pins (covered by unit tests):
 *   - Percentage discount: subtotal * (value / 100), capped at maxDiscount
 *     when set. Never negative.
 *   - Fixed discount: min(value, subtotal). Never exceeds the order's
 *     pre-discount subtotal — a customer can't end up owing negative
 *     money on a fixed-amount promo larger than their cart.
 *   - Output rounded to cents (2 dp) — Firestore order docs hold
 *     dollars to 2dp, and the rules-layer arithmetic check compares
 *     with a $0.01 tolerance, so we round here to keep client/server
 *     in lockstep.
 *
 * Negative / NaN inputs are sanitised to 0 — a malformed promo doc
 * should never crash the checkout math; it should just discount
 * nothing and let the validation layer surface the issue.
 */
export function calcPromoDiscount(opts: {
  subtotal:      number;
  discountType:  'percentage' | 'fixed';
  discountValue: number;
  maxDiscount?:  number | null;
}): number {
  const subtotal = Number.isFinite(opts.subtotal) && opts.subtotal > 0 ? opts.subtotal : 0;
  const value    = Number.isFinite(opts.discountValue) && opts.discountValue > 0 ? opts.discountValue : 0;
  if (subtotal === 0 || value === 0) return 0;

  let discount: number;
  if (opts.discountType === 'percentage') {
    // Cap percentage at 100% defensively — admin-set promos should
    // already be ≤100 per the schema's refine, but a dirty doc edited
    // via Firestore Console could violate that, and we don't want a
    // 200% discount to send totalAmount negative.
    const clampedPct = Math.min(100, value);
    discount = subtotal * (clampedPct / 100);
    if (typeof opts.maxDiscount === 'number' && Number.isFinite(opts.maxDiscount) && opts.maxDiscount > 0) {
      discount = Math.min(discount, opts.maxDiscount);
    }
  } else {
    discount = Math.min(value, subtotal);
  }

  // Cap at subtotal — guards percentage promos with insanely large
  // maxDiscount values (e.g. maxDiscount = 999 on a $20 cart would
  // otherwise let a 100% promo return $999).
  discount = Math.min(discount, subtotal);
  // Round to cents — keeps the order's `promoDiscount` field clean
  // and matches the rules-layer arithmetic tolerance.
  return Math.round(discount * 100) / 100;
}

export function usePromoCode() {
  const [applying, setApplying] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [promo,    setPromo]    = useState<PromoResult | null>(null);

  // R3 Bug #6: the previous `if (applying) return` guard was a stale-
  // closure read — `useCallback([applying])` captured `applying` at
  // creation time, so a double-click before React re-rendered fired
  // both calls with the same `applying === false` snapshot, and the
  // guard didn't drop either. Use a ref instead — refs read live, so
  // the second invocation sees the first one's `true` value before
  // the state update has even committed.
  const applyingRef = useRef(false);

  const applyCode = useCallback(async (
    code: string,
    subtotal: number,
    userId: string,
  ) => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    setError(null);
    setPromo(null);

    try {
      // R3 Bug #4: the previous `code.trim().toUpperCase()` forced the
      // lookup to an uppercased value before the Firestore equality
      // query. A promo stored as `Summer25` was unreachable from any
      // UI — and the round-2 fix to preserve case in the input box
      // was a no-op because the lookup uppercased anyway.
      //
      // Now: try the exact-trimmed code first. If admin's convention
      // is uppercase-only, the trim already matches what they typed
      // in the input box. If admin happens to have a mixed-case code,
      // it works without any UI change. Fallback to an uppercased
      // lookup for backward compatibility with existing deploys
      // whose seed data may be all-uppercase but whose customer-typed
      // code came in lowercase.
      const trimmed = code.trim();
      if (!trimmed) { setError(tNow('Enter a promo code')); return; }

      let snap = await getDocs(query(
        collection(db, 'promotions'),
        where('code',     '==', trimmed),
        where('isActive', '==', true),
      ));
      if (snap.empty && trimmed !== trimmed.toUpperCase()) {
        // Backward-compat fallback for legacy deploys storing only
        // uppercased codes. Skipped when the trimmed value already is
        // uppercase to avoid issuing two identical queries.
        snap = await getDocs(query(
          collection(db, 'promotions'),
          where('code',     '==', trimmed.toUpperCase()),
          where('isActive', '==', true),
        ));
      }

      if (snap.empty) { setError(tNow('Invalid promo code')); return; }

      const docSnap = snap.docs[0];
      const p = docSnap.data();

      // Defense-in-depth: an admin entering a negative discountValue
      // (or a zero) would otherwise produce a SURCHARGE rendered as a
      // "discount" line in the cart, or no discount at all. Admin tools
      // should validate this on the write side, but a corrupt /promotions
      // doc (manual Firestore console edit, migration bug) shouldn't
      // be able to charge customers extra.
      if (typeof p.discountValue !== 'number' || !isFinite(p.discountValue) || p.discountValue <= 0) {
        setError(tNow('This promo code is misconfigured — please contact support.'));
        return;
      }
      if (p.discountType !== 'percentage' && p.discountType !== 'fixed') {
        setError(tNow('This promo code is misconfigured — please contact support.'));
        return;
      }

      // R3 Bug #5: date validation now handles Firestore Timestamps,
      // strings, and Dates uniformly. The previous `new Date(p.startDate)`
      // returned Invalid Date for the canonical Timestamp type, and
      // both `Invalid Date > now` and `Invalid Date < now` are false,
      // so scheduled promotions worked before their start date and
      // never expired.
      const now = new Date();
      const startDate = asDate(p.startDate);
      const endDate   = asDate(p.endDate);
      if (startDate && startDate > now) {
        setError(tNow('This code is not yet active')); return;
      }
      if (endDate && endDate < now) {
        setError(tNow('This code has expired')); return;
      }

      // Total usage limit
      if (p.usageLimit !== null && p.usageCount >= p.usageLimit) {
        setError(tNow('This code has reached its usage limit')); return;
      }

      // Minimum purchase
      if (p.minPurchase && subtotal < p.minPurchase) {
        setError(tNow('Minimum purchase of {amount} required', { amount: formatMoney(p.minPurchase) })); return;
      }

      // Per-user limit
      if (p.perUserLimit && userId) {
        const usageSnap = await getDocs(
          query(
            collection(db, 'promotionUsage'),
            where('promotionId', '==', docSnap.id),
            where('userId', '==', userId),
          )
        );
        if (usageSnap.size >= p.perUserLimit) {
          setError(tNow('You have already used this code the maximum number of times')); return;
        }
      }

      // Calculate discount amount via the pure helper above so this
      // formula has exactly one definition in the codebase. Tests in
      // tests/unit/hooks/promo-discount.test.ts pin the boundaries
      // (percentage cap, max cap, fixed > subtotal, malformed inputs).
      const discountAmount = calcPromoDiscount({
        subtotal,
        discountType:  p.discountType,
        discountValue: p.discountValue,
        maxDiscount:   p.maxDiscount,
      });

      setPromo({
        id:            docSnap.id,
        // Surface whatever case the doc actually carries — admin's
        // canonical code, not the customer's typed version.
        code:          (p.code as string) ?? trimmed,
        discountType:  p.discountType,
        discountValue: p.discountValue,
        discountAmount,
        description:   p.description || '',
      });

    } catch (err) {
      setError(tNow('Could not validate code — try again'));
      console.error('usePromoCode error:', err);
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  }, []); // ref-based guard means we don't need `applying` in deps

  const clearPromo = useCallback(() => {
    setPromo(null);
    setError(null);
  }, []);

  return { applyCode, clearPromo, promo, applying, error };
}
