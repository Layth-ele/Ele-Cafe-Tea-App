/**
 * useTeasRealtime — Firestore live subscription for the public tea catalog.
 *
 * Drop-in replacement for `useQuery({ queryFn: fetchTeas })` that pushes
 * updates to consumers as soon as admin edits a tea, without the 5-minute
 * staleTime delay React Query was using.
 *
 * Why a dedicated hook (instead of swapping fetchTeas for an onSnapshot
 * callback inside fetchTeas):
 *   • fetchTeas returns Promise<Product[]> — used by other React Query
 *     callers (RelatedTeas, etc.) where one-shot fetches are correct.
 *     Changing its signature would break those.
 *   • A subscription needs lifecycle (mount/unmount) which is React-side
 *     concern. fetchTeas is pure data layer.
 *
 * Why mockProducts fallback: matches fetchTeas semantics exactly so
 * brand-new deploys (Firestore empty) and outages (Firestore unreachable)
 * still render the catalog. The fallback fires on:
 *   - empty snapshot (0 active teas in Firestore) → seed/init scenario
 *   - subscription error → outage / quota exhaustion / rules misconfig
 *
 * Usage:
 *   const { data: products = [], isLoading } = useTeasRealtime();
 */

import { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { markUnavailable, parseProductDocs } from '@/lib/firebaseQueries';
import type { Product } from '@/types';

// Lazy-load the mock fallback the same way firebaseQueries.ts does —
// keeps the 44 KB seed data out of the main bundle for 99.9% of users
// who never hit the fallback path.
async function loadMockProducts(): Promise<Product[]> {
  const mod = await import('../data/mockProducts');
  return mod.mockProducts.filter(p => p.isActive !== false);
}

export interface UseTeasRealtimeResult {
  data:       Product[];
  isLoading:  boolean;
  /** Set when the subscription failed — UI can show a banner if useful.
   *  In normal operation this stays null because the mock fallback kicks
   *  in transparently. */
  error:      Error | null;
}

export function useTeasRealtime(): UseTeasRealtimeResult {
  const [data,      setData]      = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<Error | null>(null);

  useEffect(() => {
    // Build the query — same constraints as fetchTeas so visible
    // results match between the polling and live versions exactly.
    // limit(200) caps subscription bandwidth; if the catalog grows
    // past 200 active teas, raise this OR add pagination.
    const q = query(
      collection(db, 'teas'),
      where('isActive', '==', true),
      orderBy('name',   'asc'),
      limit(200),
    );

    let cancelled = false;

    const unsubscribe = onSnapshot(
      q,
      async (snap) => {
        if (cancelled) return;
        // Same validation as fetchTeas — normalizes Timestamps / nulls and
        // skips any doc that still fails, rather than passing raw data on.
        const teas = parseProductDocs(snap.docs, 'useTeasRealtime');
        if (teas.length === 0) {
          // Empty Firestore — fall back to mock so customers see something.
          // Same path as fetchTeas. Async fallback fires once; any later
          // snapshot with real data will overwrite it. If docs exist but
          // none were valid, the mocks must not be purchasable.
          try {
            const fallback = await loadMockProducts();
            if (!cancelled) {
              setData(snap.empty ? fallback : fallback.map(markUnavailable));
              setIsLoading(false);
            }
          } catch (e) {
            if (!cancelled) {
              setError(e as Error);
              setIsLoading(false);
            }
          }
        } else {
          setData(teas);
          setIsLoading(false);
          setError(null);
        }
      },
      async (err) => {
        // Subscription error (rules, network, quota). Log + fall back.
        console.warn('[useTeasRealtime] subscription error, falling back to mockProducts:', err);
        if (cancelled) return;
        try {
          const fallback = await loadMockProducts();
          if (!cancelled) {
            // Same as fetchTeas' catch path: mocks shown during an outage
            // can't be added to cart.
            setData(fallback.map(markUnavailable));
            setError(err);
            setIsLoading(false);
          }
        } catch (fbErr) {
          if (!cancelled) {
            setError(fbErr as Error);
            setIsLoading(false);
          }
        }
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { data, isLoading, error };
}
