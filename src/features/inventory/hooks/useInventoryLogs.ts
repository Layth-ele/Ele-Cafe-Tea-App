/**
 * useInventoryLogs.ts — Paginated reader for /inventory_logs.
 *
 * Why not onSnapshot:
 *   The audit log is append-only and read for review, not live
 *   monitoring. Snapshot would also be expensive to paginate
 *   (would re-fire on every new write). One-shot reads with a
 *   cursor are cheaper and match the use case.
 *
 * Why a separate /teas read:
 *   Logs reference teaId. To show "Matcha went from 5 to 3" we
 *   need the tea name. A one-shot read of /teas builds a teaId →
 *   name lookup once per session. Tea names rarely change in
 *   practice; an in-memory cache for the page lifetime is fine.
 *
 * Pagination contract:
 *   - Initial call: returns the most recent PAGE_SIZE entries.
 *   - loadMore(): fetches the next PAGE_SIZE older entries.
 *   - hasMore is true if the last batch came back full
 *     (PAGE_SIZE entries) — if we got fewer, we've reached the
 *     end. A perfectly-PAGE_SIZE-sized last page would give a
 *     false "hasMore" until the user clicks and gets back []; the
 *     UI handles this gracefully by showing the empty load-more
 *     no-op.
 *
 * Ordering:
 *   The composite index `inventory_logs[teaId+updatedAt]` (Turn 1)
 *   covers tea-filtered queries. For the all-logs view we use a
 *   single-field updatedAt orderBy, which uses Firestore's
 *   automatic single-field index.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { inventoryDb } from '@/features/inventory/lib/inventorySession';
import type { InventoryStatus } from '@/features/inventory/schemas/inventory.schema';

const PAGE_SIZE = 50;

/** Shape of a single audit-log row in the UI. v2 adds `kind` (tea vs
 *  item), `categoryId` for items, and generalized previousValue /
 *  newValue. Legacy previousLevel / newLevel stay for backward compat
 *  but are derived from previousValue / newValue at read time. */
export interface InventoryLogRow {
  id:             string;
  /** 'tea' (level change) or 'item' (quantity change). Defaults to
   *  'tea' for legacy rows that lack the field. */
  kind:           'tea' | 'item';
  /** Generic id of the changed thing. For tea = teaId, for item =
   *  inventory_items doc id. */
  targetId:       string;
  /** For 'item' rows: the parent category id; resolved name lives in
   *  `categoryName`. Null on tea rows. */
  categoryId:     string | null;
  categoryName:   string | null;
  /** Resolved display name. Tea name for 'tea' kind, item name for
   *  'item' kind. Falls back to targetId. */
  targetName:     string;
  /** Legacy alias for compatibility with existing viewer code paths. */
  teaId:          string;
  teaName:        string;
  /** Unit label for item rows (e.g. "bottles", "kg"). Empty for tea. */
  unit:           string;
  employeeName:   string;
  previousValue:  number;
  newValue:       number;
  /** Convenience derived field — same as previousValue / newValue. */
  previousLevel:  number;
  newLevel:       number;
  previousStatus: InventoryStatus;
  newStatus:      InventoryStatus;
  updatedAt:      Date;
}

interface UseInventoryLogsResult {
  rows:      InventoryLogRow[];
  loading:   boolean;
  /** True while loadMore is in flight (loading the FIRST page is
   *  represented by `loading`; this is the "loading another page"
   *  indicator). */
  loadingMore: boolean;
  error:     string | null;
  /** Whether a subsequent loadMore() would likely fetch more. False
   *  when the last batch came back short. */
  hasMore:   boolean;
  loadMore:  () => Promise<void>;
}

export function useInventoryLogs(): UseInventoryLogsResult {
  const [rows,        setRows]        = useState<InventoryLogRow[]>([]);
  const [loading,     setLoading]     = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error,       setError]       = useState<string | null>(null);
  const [hasMore,     setHasMore]     = useState<boolean>(true);

  /** Cursor for the next page. Firestore's startAfter wants the LAST
   *  DocumentSnapshot from the previous batch — refs hold the live
   *  cursor between renders without triggering re-renders. */
  const cursorRef = useRef<DocumentSnapshot | null>(null);
  /** Tea name lookup. Cache stores PROMISES, not resolved strings —
   *  this matters because Promise.all in fetchPage fires N concurrent
   *  resolveTeaName calls for the same batch. If we cached strings,
   *  every concurrent call would see an empty cache (because each
   *  one's awaited getDoc hasn't resolved yet) and fire its own
   *  getDoc. With Promise caching, the first call writes a pending
   *  promise; subsequent concurrent calls find that promise and
   *  await it instead of firing duplicate reads. For a 50-log batch
   *  referencing 5 unique teas this drops getDoc count from 50 to 5. */
  const teaNameCache      = useRef<Map<string, Promise<string>>>(new Map());
  const itemInfoCache     = useRef<Map<string, Promise<{ name: string; unit: string }>>>(new Map());
  const categoryNameCache = useRef<Map<string, Promise<string>>>(new Map());

  /** Resolve a teaId to a display name, caching the in-flight promise
   *  so concurrent callers dedupe. */
  const resolveTeaName = useCallback((teaId: string): Promise<string> => {
    const cached = teaNameCache.current.get(teaId);
    if (cached !== undefined) return cached;
    const promise = (async () => {
      try {
        const snap = await getDoc(doc(inventoryDb(), 'teas', teaId));
        const data = snap.data() as { name?: string } | undefined;
        return data?.name ?? teaId;
      } catch (err) {
        console.warn('[useInventoryLogs] tea lookup failed:', err);
        return teaId;
      }
    })();
    teaNameCache.current.set(teaId, promise);
    return promise;
  }, []);

  /** Resolve an inventory_items id to { name, unit }. Item rows
   *  reference a different collection than tea rows. */
  const resolveItemInfo = useCallback((itemId: string): Promise<{ name: string; unit: string }> => {
    const cached = itemInfoCache.current.get(itemId);
    if (cached !== undefined) return cached;
    const promise = (async () => {
      try {
        const snap = await getDoc(doc(inventoryDb(), 'inventory_items', itemId));
        const data = snap.data() as { name?: string; unit?: string | null } | undefined;
        return { name: data?.name ?? itemId, unit: data?.unit ?? '' };
      } catch (err) {
        console.warn('[useInventoryLogs] item lookup failed:', err);
        return { name: itemId, unit: '' };
      }
    })();
    itemInfoCache.current.set(itemId, promise);
    return promise;
  }, []);

  /** Resolve an inventory_categories id to a display name. */
  const resolveCategoryName = useCallback((categoryId: string): Promise<string> => {
    if (!categoryId) return Promise.resolve('');
    const cached = categoryNameCache.current.get(categoryId);
    if (cached !== undefined) return cached;
    const promise = (async () => {
      try {
        const snap = await getDoc(doc(inventoryDb(), 'inventory_categories', categoryId));
        const data = snap.data() as { name?: string } | undefined;
        return data?.name ?? categoryId;
      } catch (err) {
        console.warn('[useInventoryLogs] category lookup failed:', err);
        return categoryId;
      }
    })();
    categoryNameCache.current.set(categoryId, promise);
    return promise;
  }, []);

  /** Fetch one page of logs starting at the current cursor. */
  const fetchPage = useCallback(async (): Promise<void> => {
    const baseParts = [
      orderBy('updatedAt', 'desc'),
      ...(cursorRef.current ? [startAfter(cursorRef.current)] : []),
      limit(PAGE_SIZE),
    ];
    const q = query(collection(inventoryDb(), 'inventory_logs'), ...baseParts);
    const snap = await getDocs(q);

    const docs = snap.docs;
    const resolved = await Promise.all(
      docs.map(async (d) => {
        const raw  = d.data() as Record<string, unknown>;
        // Defaults: legacy rows lacking `kind` are tea-kind.
        const kind = raw.kind === 'item' ? 'item' as const : 'tea' as const;
        // v2 fields with legacy fallbacks. previousValue/newValue
        // mirror previousLevel/newLevel on tea rows.
        const previousValue = typeof raw.previousValue === 'number'
          ? raw.previousValue
          : Number(raw.previousLevel ?? 0);
        const newValue = typeof raw.newValue === 'number'
          ? raw.newValue
          : Number(raw.newLevel ?? 0);

        const targetId = String(raw.targetId ?? raw.teaId ?? '');
        const categoryId = typeof raw.categoryId === 'string' && raw.categoryId.length > 0
          ? raw.categoryId
          : null;

        // Pull the right display name for the row's kind. Tea rows
        // already resolved via /teas; item rows resolve through the
        // new /inventory_items + /inventory_categories lookups.
        let targetName = targetId;
        let unit = '';
        let categoryName: string | null = null;
        if (kind === 'item') {
          const info = await resolveItemInfo(targetId);
          targetName = info.name;
          unit = info.unit;
          if (categoryId) categoryName = await resolveCategoryName(categoryId);
        } else {
          targetName = await resolveTeaName(targetId);
        }

        return {
          id:             d.id,
          kind,
          targetId,
          categoryId,
          categoryName,
          targetName,
          unit,
          // Legacy aliases — used by the existing rendering path.
          teaId:          targetId,
          teaName:        targetName,
          employeeName:   String(raw.employeeName ?? 'unknown'),
          previousValue,
          newValue,
          previousLevel:  previousValue,
          newLevel:       newValue,
          previousStatus: (raw.previousStatus as InventoryStatus) ?? 'in_stock',
          newStatus:      (raw.newStatus as InventoryStatus) ?? 'in_stock',
          updatedAt:      raw.updatedAt instanceof Timestamp
                            ? raw.updatedAt.toDate()
                            : new Date(0),
        } satisfies InventoryLogRow;
      }),
    );

    setRows((prev) => [...prev, ...resolved]);
    if (docs.length > 0) {
      cursorRef.current = docs[docs.length - 1];
    }
    setHasMore(docs.length === PAGE_SIZE);
  }, [resolveTeaName, resolveItemInfo, resolveCategoryName]);

  // Initial load on mount. The empty-deps effect is fine here — we
  // explicitly want a one-shot at mount, and the page lifecycle owns
  // the refresh decision (loadMore button).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetchPage();
      } catch (err) {
        if (cancelled) return;
        console.error('useInventoryLogs: initial load failed', err);
        setError('Could not load audit log. Try refreshing.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchPage]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      await fetchPage();
    } catch (err) {
      console.error('useInventoryLogs: loadMore failed', err);
      setError('Could not load more entries. Try again.');
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loadingMore]);

  return { rows, loading, loadingMore, error, hasMore, loadMore };
}
