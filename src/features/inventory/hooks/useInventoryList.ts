/**
 * useInventoryList.ts — Live merged tea + inventory list.
 *
 * Responsibilities:
 *   1. Subscribe to /teas (just enough to know names + categories + images)
 *      and /inventory in parallel.
 *   2. Inner-join them on teaId so each row carries everything the
 *      InventoryTable needs to render — no per-row Firestore reads.
 *   3. Expose an `update(teaId, patch)` that delegates to the
 *      inventory service. Optimistic UI happens at the row level
 *      (component owns its own draft state); this hook is just the
 *      truth-of-record + writer.
 *
 * Why onSnapshot, not getDocs:
 *   Multiple staff might edit inventory at once (employee on floor +
 *   admin reconciling). With snapshots, the second person's table
 *   reflects the first person's writes immediately. With a one-shot
 *   getDocs we'd serve stale rows until a manual refresh.
 *
 * Why subscribe to /teas too:
 *   The inventory doc only knows the teaId. Name, image, category live
 *   on /teas/{teaId}. We need both to render. Listening keeps the join
 *   in-memory; if a tea is renamed or deleted, the list reacts.
 *
 * Cost: two listeners, ~80 docs in each collection for this project.
 * Negligible. Cleanup on unmount.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, Timestamp } from 'firebase/firestore';
import { inventoryDb } from '@/features/inventory/lib/inventorySession';
import { categories } from '@/data/categories';
import {
  type Inventory,
  type InventoryStatus,
  getInventoryStatus,
  type UpdateInventoryInput,
} from '@/features/inventory/schemas/inventory.schema';
import { updateInventory as updateInventoryService } from '@/features/inventory/services/inventory.service';

/**
 * Row shape consumed by the table. Tea fields are optional — a row
 * may exist in /inventory without a corresponding /teas doc (between
 * a manual write and the onTeaDelete cascade, for example). The table
 * still renders such rows so an admin can clean them up.
 */
export interface InventoryRow {
  teaId:       string;
  /** Display name, falls back to teaId when the tea doc is missing. */
  name:        string;
  category?:   string;
  image?:      string;
  /** Level 0-10. Defaults to 0 when no inventory doc exists yet
   *  (shouldn't happen in practice — onTeaCreate provisions one). */
  level:       number;
  status:      InventoryStatus;
  weight:      number | null;
  updatedBy:   string;
  updatedAt:   Date;
}

interface TeaSnapshot {
  name?:     string;
  category?: string;
  image?:    string;
  isActive?: boolean;
}

interface UseInventoryListResult {
  rows:    InventoryRow[];
  loading: boolean;
  error:   string | null;
  /** Apply an inventory update. Wraps the service call so callers
   *  don't need to import both modules. */
  update:  (teaId: string, patch: UpdateInventoryInput) => Promise<void>;
}

export function useInventoryList(): UseInventoryListResult {
  const [teas, setTeas]           = useState<Map<string, TeaSnapshot> | null>(null);
  const [inventory, setInventory] = useState<Map<string, Inventory>   | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // Subscribe to both collections. Cleaned up together on unmount.
  useEffect(() => {
    const teasUnsub = onSnapshot(
      collection(inventoryDb(), 'teas'),
      (snap) => {
        const next = new Map<string, TeaSnapshot>();
        snap.forEach((d) => {
          const data = d.data() as TeaSnapshot & { isActive?: boolean };
          // Filter out soft-deleted teas (`isActive: false`) so inventory
          // listings only show what's currently being sold. Admin can
          // change this if Turn 4 adds an "include inactive" toggle.
          if (data.isActive === false) return;
          next.set(d.id, data);
        });
        setTeas(next);
        setError(null);
      },
      (err) => {
        console.error('useInventoryList: teas subscription error', err);
        setError('Could not load teas. Try refreshing.');
      },
    );

    const invUnsub = onSnapshot(
      collection(inventoryDb(), 'inventory'),
      (snap) => {
        const next = new Map<string, Inventory>();
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>;
          const level = Number(raw.level ?? 0);
          next.set(d.id, {
            teaId:     d.id,
            level,
            status:    (raw.status as InventoryStatus | undefined) ?? getInventoryStatus(level),
            weight:    raw.weight === null || raw.weight === undefined
                         ? null
                         : Number(raw.weight),
            updatedBy: String(raw.updatedBy ?? ''),
            updatedAt: raw.updatedAt instanceof Timestamp
                         ? raw.updatedAt.toDate()
                         : new Date(0),
          });
        });
        setInventory(next);
        setError(null);
      },
      (err) => {
        console.error('useInventoryList: inventory subscription error', err);
        setError('Could not load inventory. Try refreshing.');
      },
    );

    return () => {
      // Defensive: call each unsub independently. If teasUnsub were
      // to throw (unlikely — Firebase SDK unsubscribes are simple
      // callback removals), a bare `teasUnsub(); invUnsub();` would
      // skip invUnsub and leak the inventory listener until page
      // reload. Three extra lines to prevent a listener-leak class
      // of bug is worth it for cleanup code.
      try { teasUnsub(); } catch (e) { console.error('useInventoryList: teas unsub error', e); }
      try { invUnsub();  } catch (e) { console.error('useInventoryList: inventory unsub error', e); }
    };
  }, []);

  // Merge the two maps into a flat row list. Deterministic order: by
  // tea category order, then tea name (so grouped sections render in a
  // stable, café-friendly order rather than network arrival order).
  // Falls back to teaId if name is missing.
  //
  // Status is DERIVED from level here, not read from the Firestore
  // `status` field. Reason: the `status` field is written by the
  // onInventoryWrite trigger after the level changes — there's a small
  // window where the field can be stale. If a row has level=8 (which
  // should be in_stock) but a stale status='low_stock' on Firestore,
  // the InventoryRow's badge would show "In stock" (derived from
  // level) while the filter buckets and "Low stock" pill would still
  // count the row — UI inconsistency. Deriving here keeps every
  // surface in sync with the single source of truth: the level.
  const rows: InventoryRow[] = useMemo(() => {
    if (!teas || !inventory) return [];
    const merged: InventoryRow[] = [];
    // Map keyed by string so we can pass row.category (typed `string`
    // from the loose TeaSnapshot) without TS narrowing it to the
    // union of literal category IDs. Unknown categories simply miss
    // the lookup and fall through to MAX_SAFE_INTEGER (sort to end).
    const categoryOrder = new Map<string, number>(categories.map((c, index) => [c.id, index]));
    // Iterate inventory because that's the source of truth for what
    // employees update. A tea that exists in /teas but is marked
    // `isActive: false` (soft-deleted) was already filtered out of
    // the `teas` map above — its inventory row is dropped here. The
    // empty-state copy in InventoryTable explains this to the admin
    // so the divergence between "/inventory has rows" and "dashboard
    // is empty" is discoverable.
    inventory.forEach((inv, teaId) => {
      const tea = teas.get(teaId);
      if (!tea) return; // tea was deleted or inactive — drop the row
      merged.push({
        teaId,
        name:      tea.name ?? teaId,
        category:  tea.category,
        image:     tea.image,
        level:     inv.level,
        status:    getInventoryStatus(inv.level),
        weight:    inv.weight ?? null,
        updatedBy: inv.updatedBy,
        updatedAt: inv.updatedAt,
      });
    });
    merged.sort((a, b) => {
      const aCat = a.category ? (categoryOrder.get(a.category) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      const bCat = b.category ? (categoryOrder.get(b.category) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      if (aCat !== bCat) return aCat - bCat;
      const nameCmp = a.name.localeCompare(b.name);
      if (nameCmp !== 0) return nameCmp;
      return a.teaId.localeCompare(b.teaId);
    });
    return merged;
  }, [teas, inventory]);

  const loading = teas === null || inventory === null;

  async function update(teaId: string, patch: UpdateInventoryInput): Promise<void> {
    // The underlying service parses the patch via updateInventorySchema
    // before writing — no need to double-parse here.
    await updateInventoryService(teaId, patch);
  }

  return { rows, loading, error, update };
}
