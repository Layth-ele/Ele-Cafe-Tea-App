/**
 * inventoryItems.service.ts — Client-side data layer for
 * /inventory_items.
 *
 * Three responsibilities:
 *   1. Read item docs (one-shot for the rare cases; the live hook
 *      uses onSnapshot directly).
 *   2. Direct Firestore update for quantity changes (the safe field
 *      set, gated by firestore.rules).
 *   3. Thin callable wrappers for admin operations (create/edit,
 *      archive) — both server-side enforced.
 */

import {
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { getFunctionsLazy } from '@/lib/firebase';
import { inventoryDb } from '@/features/inventory/lib/inventorySession';
import type {
  SetInventoryItemInput,
  UpdateInventoryItemInput,
} from '@/features/inventory/schemas/inventoryItem.schema';

const COL = 'inventory_items';

/**
 * Update an item's quantity from the dashboard (employee or admin).
 * Sends only the safe field set defined in firestore.rules; the
 * trigger derives `status` server-side.
 */
export async function updateInventoryItemQuantity(
  id: string,
  patch: UpdateInventoryItemInput,
): Promise<void> {
  await updateDoc(doc(inventoryDb(), COL, id), {
    quantity:  patch.quantity,
    updatedBy: patch.updatedBy,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Create or edit an item via the admin callable. Goes through the
 * function so server-side validation + status derivation can run
 * in one round-trip.
 */
export async function setInventoryItem(input: SetInventoryItemInput): Promise<{ id: string }> {
  const { functions, httpsCallable } = await getFunctionsLazy();
  const call = httpsCallable<SetInventoryItemInput, { id: string }>(functions, 'setInventoryItem');
  const result = await call(input);
  return result.data;
}

/** Soft-delete an item. Admin-gated server-side. */
export async function archiveInventoryItem(id: string): Promise<{ id: string }> {
  const { functions, httpsCallable } = await getFunctionsLazy();
  const call = httpsCallable<{ id: string }, { id: string }>(functions, 'archiveInventoryItem');
  const result = await call({ id });
  return result.data;
}

/**
 * Hard-delete an item — removes the doc entirely. Server writes an
 * audit-log entry first so the trail records what was removed.
 *
 * Phase 15.
 */
export async function deleteInventoryItem(id: string): Promise<{ id: string }> {
  const { functions, httpsCallable } = await getFunctionsLazy();
  const call = httpsCallable<{ id: string }, { id: string }>(functions, 'deleteInventoryItem');
  const result = await call({ id });
  return result.data;
}
