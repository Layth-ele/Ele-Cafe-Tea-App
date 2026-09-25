/**
 * inventoryCategories.service.ts — Client-side data layer for
 * /inventory_categories.
 *
 * Reads + admin write helpers. The read path uses one-shot getDocs
 * for the rare admin-list use case; the live subscription belongs to
 * useInventoryCategories which is shared by AdminInventory and
 * InventoryPage. Both paths convert Timestamp → Date and apply the
 * standard defensive defaults at the boundary.
 *
 * Writes go through callables (admin-only at the server) for slug
 * derivation, color slot assignment, and uniqueness checks that rules
 * can't express directly. The lone Firestore-only path is the
 * archive helper which sets isActive=false on a known doc id; admin
 * rules permit this without a callable round-trip.
 */

import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore';
import { getFunctionsLazy } from '@/lib/firebase';
import { inventoryDb } from '@/features/inventory/lib/inventorySession';
import type {
  InventoryCategory,
  SetInventoryCategoryInput,
} from '@/features/inventory/schemas/inventoryCategory.schema';

const COL = 'inventory_categories';

function fromDoc(raw: Record<string, unknown>): InventoryCategory {
  return {
    id:           String(raw.id ?? ''),
    name:         String(raw.name ?? ''),
    model:        (raw.model as 'level' | 'quantity') ?? 'quantity',
    unit:         raw.unit === null || raw.unit === undefined ? null : String(raw.unit),
    lowThreshold: raw.lowThreshold === null || raw.lowThreshold === undefined ? null : Number(raw.lowThreshold),
    sortOrder:    typeof raw.sortOrder === 'number' ? raw.sortOrder : 100,
    color:        (raw.color as InventoryCategory['color']) ?? 'color-1',
    isSystem:     raw.isSystem === true,
    isActive:     raw.isActive !== false,
    createdAt:    raw.createdAt instanceof Timestamp ? raw.createdAt.toDate() : new Date(0),
    updatedAt:    raw.updatedAt instanceof Timestamp ? raw.updatedAt.toDate() : undefined,
  };
}

export async function getInventoryCategories(): Promise<InventoryCategory[]> {
  const snap = await getDocs(query(collection(inventoryDb(), COL), orderBy('sortOrder', 'asc')));
  return snap.docs.map((d) => fromDoc(d.data() as Record<string, unknown>));
}

/**
 * Create or update a category. Calls the admin-gated `setInventoryCategory`
 * Cloud Function. The function derives slugs, assigns colour slots, and
 * enforces uniqueness; the client just hands it the input.
 */
export async function setInventoryCategory(input: SetInventoryCategoryInput): Promise<{ id: string }> {
  const { functions, httpsCallable } = await getFunctionsLazy();
  const call = httpsCallable<SetInventoryCategoryInput, { id: string }>(functions, 'setInventoryCategory');
  const result = await call(input);
  return result.data;
}

/**
 * Soft-delete a category (sets isActive=false). The 'tea' system
 * category is rejected server-side.
 */
export async function archiveInventoryCategory(id: string): Promise<{ id: string }> {
  const { functions, httpsCallable } = await getFunctionsLazy();
  const call = httpsCallable<{ id: string }, { id: string }>(functions, 'archiveInventoryCategory');
  const result = await call({ id });
  return result.data;
}

/**
 * Hard-delete a category. Removes the doc entirely. By default,
 * refuses if the category has any child items (active or archived).
 * Pass `cascade: true` to also delete every child item in a batched
 * write.
 *
 * Server writes an audit-log entry before the delete so the trail
 * captures admin identity, category name, and item count.
 *
 * Phase 15.
 */
export async function deleteInventoryCategory(
  id: string,
  opts: { cascade?: boolean } = {},
): Promise<{ id: string; deletedItems: number }> {
  const { functions, httpsCallable } = await getFunctionsLazy();
  const call = httpsCallable<
    { id: string; cascade?: boolean },
    { id: string; deletedItems: number }
  >(functions, 'deleteInventoryCategory');
  const result = await call({ id, cascade: opts.cascade === true });
  return result.data;
}
