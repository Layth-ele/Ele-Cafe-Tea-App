/**
 * useInventoryLowCounts.ts — per-category "needs restock" counts for the
 * category navigation badges. One small subscription over active items
 * (back-of-house items are a few dozen docs), instead of one per tab.
 */
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { inventoryDb } from '@/features/inventory/lib/inventorySession';
import { lowCountsByCategory } from '@/features/inventory/lib/inventoryNav';
import type { InventoryStatus } from '@/features/inventory/schemas/inventory.schema';

export function useInventoryLowCounts(): { lowCounts: Record<string, number>; totals: Record<string, number> } {
  const [state, setState] = useState<{ lowCounts: Record<string, number>; totals: Record<string, number> }>({ lowCounts: {}, totals: {} });
  useEffect(() => onSnapshot(
    collection(inventoryDb(), 'inventory_items'),
    (snap) => {
      const items: Array<{ categoryId: string; status: InventoryStatus }> = [];
      const totals: Record<string, number> = {};
      snap.forEach((d) => {
        const r = d.data();
        if (r.isActive === false) return;
        const categoryId = String(r.categoryId ?? '');
        totals[categoryId] = (totals[categoryId] ?? 0) + 1;
        items.push({ categoryId, status: (r.status as InventoryStatus) ?? 'in_stock' });
      });
      setState({ lowCounts: lowCountsByCategory(items), totals });
    },
    (err) => console.error('useInventoryLowCounts:', err),
  ), []);
  return state;
}
