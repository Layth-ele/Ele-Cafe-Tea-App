/**
 * teaWeightBackfill.service.ts — One-shot admin migration helper.
 *
 * Wraps the `backfillTeaWeights` Cloud Function. The function is
 * idempotent — every call returns counts of {scanned, updated,
 * skipped} so the admin can verify migration completion. A
 * fully-backfilled run reports updated=0.
 *
 * Why admins might run this manually:
 *   - After upgrading from the pre-weightGrams schema, run once to
 *     fill in the canonical numeric weight for legacy tea docs.
 *   - Periodic hygiene if any imports / migrations bypassed the
 *     dual-write in the admin form.
 *
 * The storefront does NOT depend on this running — `resolveWeightGrams`
 * already returns 100 as a graceful default. This callable just
 * makes the Firestore data explicit.
 */

import { getFunctionsLazy } from '@/lib/firebase';

export interface BackfillResult {
  scanned: number;
  updated: number;
  skipped: number;
}

export async function backfillTeaWeights(): Promise<BackfillResult> {
  const { functions, httpsCallable } = await getFunctionsLazy();
  const call = httpsCallable<void, BackfillResult>(functions, 'backfillTeaWeights');
  const result = await call();
  return result.data;
}
