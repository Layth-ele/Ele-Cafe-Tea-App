/**
 * useInventoryCategories.ts — Live subscription to /inventory_categories.
 *
 * Both admin and employee pages consume this. Returns active
 * categories sorted by sortOrder ascending. The seeded 'tea' system
 * category is always first (sortOrder 0); admin-created categories
 * start at 100 and increment.
 *
 * Cleanup pattern matches useEmployees: try/catch around unsub so a
 * faulty unsubscribe call doesn't leak listeners on hot reload.
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, Timestamp } from 'firebase/firestore';
import { inventoryDb } from '@/features/inventory/lib/inventorySession';
import type {
  InventoryCategory,
  InventoryCategoryColor,
  InventoryModel,
} from '@/features/inventory/schemas/inventoryCategory.schema';

interface UseInventoryCategoriesResult {
  categories: InventoryCategory[];
  loading:    boolean;
  error:      string | null;
}

export function useInventoryCategories(opts?: {
  /** Include archived categories in the list. Default false. */
  includeInactive?: boolean;
}): UseInventoryCategoriesResult {
  const includeInactive = opts?.includeInactive ?? false;
  const [categories, setCategories] = useState<InventoryCategory[] | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(inventoryDb(), 'inventory_categories')),
      (snap) => {
        const list: InventoryCategory[] = [];
        snap.forEach((d) => {
          const raw = d.data() as Record<string, unknown>;
          const isActive = raw.isActive !== false;
          if (!includeInactive && !isActive) return;
          list.push({
            id:           String(raw.id ?? d.id),
            name:         String(raw.name ?? ''),
            model:        (raw.model as InventoryModel) ?? 'quantity',
            unit:         raw.unit === null || raw.unit === undefined ? null : String(raw.unit),
            lowThreshold: raw.lowThreshold === null || raw.lowThreshold === undefined ? null : Number(raw.lowThreshold),
            sortOrder:    typeof raw.sortOrder === 'number' ? raw.sortOrder : 100,
            color:        (raw.color as InventoryCategoryColor) ?? 'color-1',
            isSystem:     raw.isSystem === true,
            isActive,
            createdAt:    raw.createdAt instanceof Timestamp ? raw.createdAt.toDate() : new Date(0),
            updatedAt:    raw.updatedAt instanceof Timestamp ? raw.updatedAt.toDate() : undefined,
          });
        });
        // Stable sort: by sortOrder, then by name. Tea (sortOrder 0)
        // wins by default; admin-created ties break alphabetically.
        list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
        setCategories(list);
        setError(null);
      },
      (err) => {
        console.error('useInventoryCategories: subscription error', err);
        setError('Could not load inventory categories. Try refreshing.');
      },
    );
    return () => {
      try { unsub(); } catch (e) { console.error('useInventoryCategories: unsub error', e); }
    };
  }, [includeInactive]);

  return {
    categories: categories ?? [],
    loading:    categories === null,
    error,
  };
}
