/**
 * useInventoryItems.ts — Live merged list of items in one category.
 *
 * Filtered by categoryId so each tab subscribes to its own scoped
 * slice. Switching tabs unmounts the old subscription and mounts a
 * new one — clean and predictable. For the rare admin who toggles
 * tabs constantly, the Firestore SDK caches docs locally so
 * re-subscriptions are cheap.
 *
 * Inactive items are filtered out (matches the dashboard's "live
 * inventory" semantic). Sort: by name, alphabetical.
 *
 * Returns a shape parallel to useInventoryList for tea, so the page
 * code can switch between the two with minimal branching.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { inventoryDb } from '@/features/inventory/lib/inventorySession';
import {
  type InventoryItem,
  type UpdateInventoryItemInput,
  getItemStatus,
  effectiveLowThreshold,
} from '@/features/inventory/schemas/inventoryItem.schema';
import { updateInventoryItemQuantity } from '@/features/inventory/services/inventoryItems.service';
import type { InventoryStatus } from '@/features/inventory/schemas/inventory.schema';

export interface InventoryItemRowData {
  id:            string;
  categoryId:    string;
  name:          string;
  image:         string | null;
  unit:          string | null;
  quantity:      number;
  lowThreshold:  number | null;
  /** Derived from quantity + effective threshold (consumer of the
   *  hook passes in the category's default threshold separately when
   *  rendering — the status returned here is computed against the
   *  item-level override if present, else the DEFAULT_LOW_THRESHOLD
   *  fallback. The row component re-derives with the right context. */
  status:        InventoryStatus;
  updatedBy:     string;
  updatedAt:     Date;
}

interface UseInventoryItemsResult {
  rows:     InventoryItemRowData[];
  loading:  boolean;
  error:    string | null;
  /** Quantity update wrapped for callers — same signature as the
   *  tea-side update(teaId, patch). */
  update:   (itemId: string, patch: UpdateInventoryItemInput) => Promise<void>;
}

export function useInventoryItems(categoryId: string): UseInventoryItemsResult {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!categoryId) {
      setItems([]);
      return;
    }
    const q = query(
      collection(inventoryDb(), 'inventory_items'),
      where('categoryId', '==', categoryId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: InventoryItem[] = [];
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>;
          if (raw.isActive === false) return;
          const quantity = typeof raw.quantity === 'number' ? raw.quantity : 0;
          // Fallback only (the server stores `status`); category floor unknown here.
          const effThreshold = effectiveLowThreshold(
            typeof raw.lowThreshold === 'number' ? raw.lowThreshold : null, null);
          list.push({
            id:           String(raw.id ?? d.id),
            categoryId:   String(raw.categoryId ?? categoryId),
            name:         String(raw.name ?? ''),
            image:        raw.image === null || raw.image === undefined ? null : String(raw.image),
            unit:         raw.unit === null || raw.unit === undefined ? null : String(raw.unit),
            quantity,
            lowThreshold: raw.lowThreshold === null || raw.lowThreshold === undefined ? null : Number(raw.lowThreshold),
            status:       (raw.status as InventoryStatus | undefined) ?? getItemStatus(quantity, effThreshold),
            updatedBy:    String(raw.updatedBy ?? ''),
            updatedAt:    raw.updatedAt instanceof Timestamp ? raw.updatedAt.toDate() : new Date(0),
            isActive:     raw.isActive !== false,
          });
        });
        setItems(list);
        setError(null);
      },
      (err) => {
        console.error('useInventoryItems: subscription error', err);
        setError('Could not load items. Try refreshing.');
      },
    );
    return () => {
      try { unsub(); } catch (e) { console.error('useInventoryItems: unsub error', e); }
    };
  }, [categoryId]);

  const rows: InventoryItemRowData[] = useMemo(() => {
    if (!items) return [];
    return items
      .map((i) => ({
        id:           i.id,
        categoryId:   i.categoryId,
        name:         i.name,
        image:        i.image ?? null,
        unit:         i.unit ?? null,
        quantity:     i.quantity,
        lowThreshold: i.lowThreshold ?? null,
        status:       i.status,
        updatedBy:    i.updatedBy,
        updatedAt:    i.updatedAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }, [items]);

  async function update(itemId: string, patch: UpdateInventoryItemInput): Promise<void> {
    await updateInventoryItemQuantity(itemId, patch);
  }

  return {
    rows,
    loading: items === null,
    error,
    update,
  };
}
