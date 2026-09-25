import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  doc, onSnapshot, collection, runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './AuthContext';
import {
  CreditAccount, AdminCreditInput,
} from '@/schemas/credit.schema';
import { useCreditConfig } from '@/hooks/useCreditConfig';

// ─── Context shape ─────────────────────────────────────────────────────────────
//
// R3 file2 Bug #14 + #15 cleanup notes:
//   • `transactions` was previously fetched via a per-user onSnapshot on
//     /creditTransactions (last 20 ordered by createdAt). No component in
//     the entire src tree destructured it from useCredit() — pure dead
//     listener that burned a Firestore subscription per signed-in user.
//     Removed the listener, the state, and the context export.
//   • `creditValue` was computed and exposed but never read. Removed.
//
// AdminCustomers loads its own per-customer transaction history via a
// separate query (see AdminCustomers.tsx). The customer-facing
// /account page renders balance only — no transaction history view
// exists in the customer UI today, so the listener was building data
// nothing rendered.
interface CreditContextType {
  account:          CreditAccount | null;
  loading:          boolean;

  // derived helpers
  balance:          number;
  redeemable:       number;        // max points user can redeem now
  toNextThreshold:  number;        // pts to next minRedeem tier
  canRedeem:        boolean;

  // actions
  redeemCredit:     (points: number) => Promise<number>; // returns $ credit amount
}

const CreditContext = createContext<CreditContextType | undefined>(undefined);

export function useCredit() {
  const ctx = useContext(CreditContext);
  if (!ctx) throw new Error('useCredit must be used within CreditProvider');
  return ctx;
}

export function CreditProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, loading: authLoading } = useAuth();
  const cc = useCreditConfig();
  const [account, setAccount] = useState<CreditAccount | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Real-time listener on /credits/{uid} ──────────────────────────────────
  //
  // Depend on `currentUser?.uid` rather than the User OBJECT — the Firebase
  // User reference changes on every auth state callback (token refresh,
  // claim refresh, etc.), even when the underlying uid is unchanged. Using
  // the object as a dep tore down + rebuilt the listeners on every refresh,
  // which (a) flickered `loading` back to true mid-session and (b) burned
  // unnecessary Firestore reads.
  const uid = currentUser?.uid;
  useEffect(() => {
    if (authLoading) return;  // wait for Firebase Auth to initialise
    // Clear stale state IMMEDIATELY on user change — without this, a fast
    // user switch where the new user's /credits/{uid} doc hasn't been
    // bootstrapped yet would leave the OLD user's account visible (the
    // onSnapshot below only writes when `snap.exists()` is true).
    setAccount(null);
    if (!uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const creditRef = doc(db, 'credits', uid);

    const unsubAccount = onSnapshot(
      creditRef,
      snap => {
        if (snap.exists()) {
          setAccount({ ...snap.data(), userId: snap.id } as CreditAccount);
        } else {
          // Doc absent (Cloud Function bootstrap pending or user has
          // no credits yet). Drop any stale account state explicitly.
          setAccount(null);
        }
        setLoading(false);
      },
      err => {
        // Without this error callback, listener failures (permission-
        // denied during sign-out race, network blip after token expiry,
        // etc.) were silently swallowed and the spinner could hang
        // forever. Now: log, clear, exit loading.
        console.warn('[CreditContext] /credits listener error:', err);
        setAccount(null);
        setLoading(false);
      },
    );

    return unsubAccount;
  }, [uid, authLoading]);

  // ── Redeem points at checkout ──────────────────────────────────────────────
  //
  // IMPORTANT: this is intentionally a NO-OP on the client. Firestore
  // rules forbid client writes to /credits/{uid} (the rule prevents
  // users from self-granting balance), so any tx.update here would
  // throw permission-denied. The actual deduction happens server-side
  // in the onOrderWrite Cloud Function, which fires when the order
  // doc is created and uses the Admin SDK to deduct from balance +
  // log a creditTransactions audit entry.
  //
  // The function still returns the dollar value because the caller
  // (CheckoutPage) uses it for UI — but the balance update is
  // server-authoritative. Validation (multiples of minRedeem,
  // sufficient balance) stays here so the user gets immediate
  // feedback before hitting the network.
  //
  // useCallback dependency note: closes over `currentUser`, `account`,
  // and `cc`. cc is itself a memoized object from useCreditConfig,
  // so it only changes when admin updates the credit config — rare.
  // This keeps the callback identity stable across most renders.
  const redeemCredit = useCallback(async (points: number): Promise<number> => {
    if (!currentUser || !account) return 0;
    // Defensive lower-bound + finiteness guard. Without these:
    //   - Negative input bypassed `points % minRedeem !== 0` because in JS
    //     `-10000 % 10000 === 0`; bypassed `points > balance` because every
    //     negative number is ≤ a non-negative balance; and `calcCreditValue`
    //     returned a NEGATIVE dollar value that the caller plumbed into
    //     `creditApplied`, turning the discount into an UPCHARGE.
    //   - Non-finite (NaN, Infinity) input slipped past the modulo too,
    //     producing NaN dollar values downstream.
    //   - Sub-threshold positive input (e.g. 500 with minRedeem=10000)
    //     hit the modulo check ("not a multiple") which is a confusing
    //     error message — the real problem is "below the minimum."
    if (!Number.isFinite(points) || !Number.isInteger(points) || points <= 0) {
      throw new Error('Points to redeem must be a positive whole number.');
    }
    if (points < cc.minRedeem) {
      throw new Error(`Minimum redemption is ${cc.minRedeem.toLocaleString()} pts.`);
    }
    if (points % cc.minRedeem !== 0) {
      throw new Error(`Must redeem in multiples of ${cc.minRedeem.toLocaleString()} pts`);
    }
    if (points > (account.balance ?? 0)) throw new Error('Insufficient balance');
    return cc.calcCreditValue(points);
  }, [currentUser, account, cc]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const balance         = account?.balance ?? 0;
  const redeemable      = cc.maxRedeemable(balance);
  const toNextThreshold = cc.pointsToNextThreshold(balance);
  const canRedeem       = cc.isRedeemable(balance);

  // Memoize the context value. Without this every render re-creates
  // the object literal and forces every CreditContext consumer (3 in
  // the customer app, more on admin) to re-render. Most of these
  // re-renders happen on Firestore snapshots that don't change the
  // values consumers actually read.
  const value = useMemo<CreditContextType>(() => ({
    account, loading,
    balance, redeemable, toNextThreshold, canRedeem,
    redeemCredit,
  }), [account, loading, balance, redeemable, toNextThreshold, canRedeem, redeemCredit]);

  return (
    <CreditContext.Provider value={value}>
      {children}
    </CreditContext.Provider>
  );
}

// ─── Admin helper — called from admin panel (not exposed via context) ─────────
//
// Returns the actually-applied delta (which can be smaller than the
// requested `points` when deducting more than the user has — the
// balance is floored at 0). The caller uses this for an accurate
// toast: previously we surfaced the requested amount even on
// clamped deductions, which lied about what the system did.
export async function adminAdjustCredit(
  input: AdminCreditInput,
  adminUid: string,
): Promise<{ actualDelta: number; newBalance: number }> {
  const { userId, points, note } = input;
  const creditRef = doc(db, 'credits', userId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(creditRef);

    // Bootstrap a fresh credit doc if the user doesn't have one yet
    // (e.g., onNewUser hasn't fired or finished, or it failed and we're
    // recovering). Previously this threw "User credit account not found"
    // and admin had no path to grant credit to a brand-new signup.
    const current = snap.exists()
      ? snap.data()
      : {
          balance: 0,
          lifetimeEarned: 0,
          lifetimeRedeemed: 0,
          lifetimeSpend: 0,
          orderCount: 0,
          welcomeBonusGiven: false,
        };

    const oldBalance  = (current.balance || 0);
    const newBalance  = Math.max(0, oldBalance + points);
    // The CLAIMED delta (`points`) and the ACTUAL delta can differ when
    // admin tries to deduct more points than the user has — newBalance
    // is floored at 0, so a "−100" deduct on a 5-point account moves
    // balance by −5, not −100. Logging `points` would record a phantom
    // 95-point deduction the running balance never reflected, breaking
    // the audit chain. Compute the actual movement here and log THAT.
    const actualDelta = newBalance - oldBalance;
    // If the request was a no-op (e.g., deducting from a zero balance)
    // skip the audit-log row entirely so admin doesn't see a stream of
    // "−0 points" entries.
    if (actualDelta === 0) {
      return { actualDelta: 0, newBalance: oldBalance };
    }

    // First-write path: full set with all required fields. Subsequent
    // writes use the merge-friendly update path.
    if (!snap.exists()) {
      tx.set(creditRef, {
        userId,
        balance:           newBalance,
        lifetimeEarned:    actualDelta > 0 ? actualDelta : 0,
        lifetimeRedeemed:  0,
        lifetimeSpend:     0,
        orderCount:        0,
        welcomeBonusGiven: false,
        createdAt:         serverTimestamp(),
        updatedAt:         serverTimestamp(),
      });
    } else {
      tx.update(creditRef, {
        balance:        newBalance,
        lifetimeEarned: actualDelta > 0
          ? (current.lifetimeEarned || 0) + actualDelta
          : (current.lifetimeEarned || 0),
        updatedAt:      serverTimestamp(),
      });
    }

    const txRef = doc(collection(db, 'creditTransactions'));
    tx.set(txRef, {
      userId,
      type:         actualDelta > 0 ? 'admin_add' : 'admin_deduct',
      points:       actualDelta,
      balanceAfter: newBalance,
      adminNote:    note,
      addedByAdmin: adminUid,
      createdAt:    serverTimestamp(),
    });

    return { actualDelta, newBalance };
  });
}
