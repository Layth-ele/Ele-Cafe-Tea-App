/**
 * functions/src/inventoryItems.ts — Cloud Functions for the v2 inventory
 * subsystem (non-tea categories with the quantity model).
 *
 * Exports (registered in index.ts):
 *   setInventoryCategory  — admin callable, create/update categories
 *   archiveInventoryCategory — admin callable, soft-delete
 *   setInventoryItem      — admin callable, create/update items
 *   archiveInventoryItem  — admin callable, soft-delete
 *   onInventoryItemWrite  — Firestore trigger on /inventory_items/{id}.
 *                           Derives status from quantity vs threshold,
 *                           writes audit log entries on real changes.
 *
 * Tea inventory is unchanged — it stays at /inventory/{teaId} handled
 * by functions/src/inventory.ts. The 'tea' category is system-owned
 * and seeded by onInventoryWrite (in inventory.ts).
 */

import * as functions from 'firebase-functions/v2';
import * as admin     from 'firebase-admin';

import { RESERVED_INVENTORY_CATEGORY_IDS } from './lib/inventoryAccount';
import { DEFAULT_LOW_THRESHOLD, deriveItemStatus, effectiveLowThreshold, type ItemStatus as InventoryStatus } from './lib/inventoryStatus';

const db = () => admin.firestore();

const REGION = 'us-central1';

/* -------------------------------------------------------------------------- */
/*                              SHARED HELPERS                                */
/* -------------------------------------------------------------------------- */



function deriveSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 40);
}

const COLOR_SLOTS = ['color-1','color-2','color-3','color-4','color-5','color-6','color-7','color-8'] as const;
type CategoryColor = typeof COLOR_SLOTS[number] | 'color-tea';

/** Pick the next color slot by cycling through the eight available
 *  ones. We count current usage and pick the least-used slot. */
async function pickNextColor(): Promise<CategoryColor> {
  const snap = await db().collection('inventory_categories').get();
  const counts: Record<string, number> = Object.fromEntries(COLOR_SLOTS.map((c) => [c, 0]));
  snap.docs.forEach((d) => {
    const c = (d.data() as { color?: string }).color;
    if (c && c in counts) counts[c]++;
  });
  // Sort by lowest usage, then by stable order.
  return COLOR_SLOTS.slice().sort((a, b) => counts[a] - counts[b] || COLOR_SLOTS.indexOf(a) - COLOR_SLOTS.indexOf(b))[0];
}

/* -------------------------------------------------------------------------- */
/*                  1.  setInventoryCategory — admin callable                 */
/* -------------------------------------------------------------------------- */

/**
 * Create or update a non-tea inventory category. The system 'tea'
 * category is read-only via this callable (`id === 'tea'` is rejected).
 *
 * Request:  { id?, name, model?, unit?, lowThreshold?, sortOrder?, color? }
 * Response: { id }
 */
export const setInventoryCategory = functions.https.onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only.');
    }

    const data = (request.data ?? {}) as {
      id?: string; name?: string; model?: string;
      unit?: string | null; lowThreshold?: number | null;
      sortOrder?: number; color?: string;
    };

    if (typeof data.name !== 'string' || data.name.trim().length < 2 || data.name.trim().length > 40) {
      throw new functions.https.HttpsError('invalid-argument', 'Name must be 2-40 chars.');
    }
    const trimmedName = data.name.trim();

    let id = data.id?.trim() || deriveSlug(trimmedName);
    if (!/^[a-z0-9-]+$/.test(id) || id.length < 1 || id.length > 40) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid slug.');
    }
    if ((RESERVED_INVENTORY_CATEGORY_IDS as readonly string[]).includes(id)) {
      throw new functions.https.HttpsError('invalid-argument', `'${id}' is reserved — choose another name.`);
    }

    const ref = db().doc(`inventory_categories/${id}`);
    const now = admin.firestore.FieldValue.serverTimestamp();

    return db().runTransaction(async (tx) => {
      const existing = await tx.get(ref);

      if (existing.exists) {
        const prev = existing.data() as { isSystem?: boolean; model?: string };
        if (prev.isSystem) {
          throw new functions.https.HttpsError('failed-precondition', 'System category cannot be modified.');
        }
        // Model is immutable once set — changing it would orphan items
        // in the now-wrong shape.
        const patch: Record<string, unknown> = {
          name:      trimmedName,
          updatedAt: now,
        };
        if (data.unit !== undefined)         patch.unit         = data.unit;
        if (data.lowThreshold !== undefined) patch.lowThreshold = data.lowThreshold;
        if (data.sortOrder !== undefined)    patch.sortOrder    = data.sortOrder;
        if (data.color !== undefined)        patch.color        = data.color;
        tx.update(ref, patch);
        return { id };
      }

      // CREATE path
      const model = data.model === 'quantity' || data.model === 'level' ? data.model : 'quantity';
      const unit  = typeof data.unit === 'string' && data.unit.length > 0 ? data.unit : null;
      const lowT  = typeof data.lowThreshold === 'number' && data.lowThreshold >= 0
                      ? data.lowThreshold
                      : DEFAULT_LOW_THRESHOLD;
      const sort  = typeof data.sortOrder === 'number' ? data.sortOrder : 100;
      const color = (data.color && data.color !== 'color-tea' ? data.color : null) ?? await pickNextColor();

      // Quantity model needs a unit; we default to 'unit' so the row
      // is well-formed even when the admin forgets to set one.
      tx.set(ref, {
        id,
        name:         trimmedName,
        model,
        unit:         model === 'quantity' ? (unit ?? 'unit') : null,
        lowThreshold: model === 'quantity' ? lowT : null,
        sortOrder:    sort,
        color,
        isSystem:     false,
        isActive:     true,
        createdAt:    now,
        updatedAt:    now,
      });
      return { id };
    });
  },
);

/* -------------------------------------------------------------------------- */
/*               2.  archiveInventoryCategory — admin callable                */
/* -------------------------------------------------------------------------- */

/**
 * Soft-delete a category. Sets isActive=false. The system 'tea'
 * category cannot be archived. Items inside an archived category
 * remain readable so audit-log entries still resolve, but the tab
 * disappears from the dashboard.
 *
 * Request:  { id }
 * Response: { id }
 */
export const archiveInventoryCategory = functions.https.onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only.');
    }
    const { id } = (request.data ?? {}) as { id?: string };
    if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) {
      throw new functions.https.HttpsError('invalid-argument', 'Valid category id required.');
    }
    if (id === 'tea') {
      throw new functions.https.HttpsError('failed-precondition', 'System category cannot be archived.');
    }
    const ref = db().doc(`inventory_categories/${id}`);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', `Category not found: ${id}`);
    }
    await ref.update({
      isActive:  false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { id };
  },
);

/* -------------------------------------------------------------------------- */
/*                  3.  setInventoryItem — admin callable                     */
/* -------------------------------------------------------------------------- */

/**
 * Create or update an inventory item. The parent category must exist
 * and must NOT be 'tea' (tea uses /inventory/{teaId} instead).
 *
 * Request:  { id?, categoryId, name, image?, unit?, quantity, lowThreshold? }
 * Response: { id }
 */
export const setInventoryItem = functions.https.onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only.');
    }

    const data = (request.data ?? {}) as {
      id?: string; categoryId?: string; name?: string;
      image?: string | null; unit?: string | null;
      quantity?: number; lowThreshold?: number | null;
    };

    if (typeof data.categoryId !== 'string' || data.categoryId.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'categoryId is required.');
    }
    if (data.categoryId === 'tea') {
      throw new functions.https.HttpsError('invalid-argument', 'Tea items are managed via /admin/products.');
    }
    if (typeof data.name !== 'string' || data.name.trim().length < 2 || data.name.trim().length > 60) {
      throw new functions.https.HttpsError('invalid-argument', 'Name must be 2-60 chars.');
    }
    const trimmedName = data.name.trim();
    if (typeof data.quantity !== 'number' || data.quantity < 0 || !Number.isFinite(data.quantity)) {
      throw new functions.https.HttpsError('invalid-argument', 'Quantity must be a non-negative number.');
    }

    // Confirm the category exists and is active.
    const catSnap = await db().doc(`inventory_categories/${data.categoryId}`).get();
    if (!catSnap.exists) {
      throw new functions.https.HttpsError('not-found', `Category not found: ${data.categoryId}`);
    }
    const cat = catSnap.data() as { isActive?: boolean; lowThreshold?: number | null; unit?: string | null };
    if (cat.isActive === false) {
      throw new functions.https.HttpsError('failed-precondition', 'Cannot add items to an archived category.');
    }

    const effThreshold = effectiveLowThreshold(data.lowThreshold, cat.lowThreshold);
    const status = deriveItemStatus(data.quantity, effThreshold);
    const now    = admin.firestore.FieldValue.serverTimestamp();

    // CREATE or UPDATE.
    if (data.id) {
      const ref = db().doc(`inventory_items/${data.id}`);
      const snap = await ref.get();
      if (!snap.exists) {
        throw new functions.https.HttpsError('not-found', `Item not found: ${data.id}`);
      }
      await ref.update({
        categoryId:   data.categoryId,
        name:         trimmedName,
        image:        data.image ?? null,
        unit:         data.unit ?? null,
        quantity:     data.quantity,
        lowThreshold: data.lowThreshold ?? null,
        status,
        updatedBy:    request.auth?.token?.email ?? 'admin',
        updatedAt:    now,
      });
      return { id: data.id };
    }

    const ref = db().collection('inventory_items').doc();
    await ref.set({
      id:           ref.id,
      categoryId:   data.categoryId,
      name:         trimmedName,
      image:        data.image ?? null,
      unit:         data.unit ?? null,
      quantity:     data.quantity,
      lowThreshold: data.lowThreshold ?? null,
      status,
      updatedBy:    request.auth?.token?.email ?? 'admin',
      updatedAt:    now,
      isActive:     true,
    });
    return { id: ref.id };
  },
);

/* -------------------------------------------------------------------------- */
/*                4.  archiveInventoryItem — admin callable                   */
/* -------------------------------------------------------------------------- */

export const archiveInventoryItem = functions.https.onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only.');
    }
    const { id } = (request.data ?? {}) as { id?: string };
    if (typeof id !== 'string' || id.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Item id required.');
    }
    const ref = db().doc(`inventory_items/${id}`);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', `Item not found: ${id}`);
    }
    await ref.update({
      isActive:  false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { id };
  },
);

/* -------------------------------------------------------------------------- */
/*           5.  onInventoryItemWrite — trigger on /inventory_items           */
/* -------------------------------------------------------------------------- */

type ItemDoc = {
  categoryId?: string;
  quantity?: number;
  lowThreshold?: number | null;
  unit?: string | null;
  updatedBy?: string;
  isActive?: boolean;
  status?: InventoryStatus;
};

// Tiny in-invocation cache for category reads. The trigger may fire
// for many items in quick succession; reading the same category once
// per invocation is enough.
const categoryCache = new Map<string, Promise<{ lowThreshold: number | null } | null>>();

async function readCategoryThreshold(categoryId: string): Promise<number | null> {
  if (!categoryCache.has(categoryId)) {
    categoryCache.set(categoryId, (async () => {
      try {
        const snap = await db().doc(`inventory_categories/${categoryId}`).get();
        if (!snap.exists) return null;
        const d = snap.data() as { lowThreshold?: number | null };
        return { lowThreshold: typeof d.lowThreshold === 'number' ? d.lowThreshold : null };
      } catch (err) {
        console.warn('[onInventoryItemWrite] category read failed:', categoryId, err);
        return null;
      }
    })());
  }
  const cached = await categoryCache.get(categoryId)!;
  return cached?.lowThreshold ?? null;
}

export const onInventoryItemWrite = functions.firestore.onDocumentWritten(
  { region: REGION, document: 'inventory_items/{itemId}' },
  async (event) => {
    const itemId = event.params.itemId;
    const before = (event.data?.before?.data() as ItemDoc | undefined) ?? null;
    const after  = (event.data?.after?.data()  as ItemDoc | undefined) ?? null;

    // Deletion. No projection to clean up (items aren't customer-facing).
    // We don't write a "deleted" audit row — soft-delete via isActive
    // is the supported pattern; hard-deletes are rare and would also
    // remove the row from the audit's perspective.
    if (!after) return;

    const quantity = typeof after.quantity === 'number' ? after.quantity : 0;
    const categoryId = after.categoryId ?? '';
    if (!categoryId) {
      console.warn('[onInventoryItemWrite] item missing categoryId:', itemId);
      return;
    }

    // Category threshold is the floor; an item's own threshold can only raise it.
    const categoryThreshold = await readCategoryThreshold(categoryId);
    const effectiveThreshold = effectiveLowThreshold(after.lowThreshold, categoryThreshold);
    const newStatus = deriveItemStatus(quantity, effectiveThreshold);

    // 1. Re-write status if it diverged. This re-fires the trigger,
    //    which short-circuits at the same-status guard below.
    if (after.status !== newStatus) {
      await db().doc(`inventory_items/${itemId}`).update({ status: newStatus });
    }

    // 2. Audit log — only when quantity actually changed AND there
    //    was a prior state. Skip the trigger's own status writeback,
    //    skip initial creation (matches the tea trigger's behavior).
    if (before === null) return;
    const beforeQty = typeof before.quantity === 'number' ? before.quantity : null;
    if (beforeQty === null) return;
    if (beforeQty === quantity) return;

    const beforeStatus = deriveItemStatus(beforeQty, effectiveThreshold);

    await db().collection('inventory_logs').add({
      kind:           'item',
      targetId:       itemId,
      categoryId,
      // Legacy `teaId` field — mirrors targetId on item rows so the
      // existing audit viewer's by-target query still works during
      // the transition window.
      teaId:          itemId,
      previousValue:  beforeQty,
      newValue:       quantity,
      employeeName:   after.updatedBy ?? 'unknown',
      previousStatus: beforeStatus,
      newStatus,
      updatedAt:      admin.firestore.FieldValue.serverTimestamp(),
    });
  },
);

/* -------------------------------------------------------------------------- */
/*    6.  deleteInventoryCategory — admin callable, HARD delete (Phase 15)    */
/* -------------------------------------------------------------------------- */

/**
 * Permanently delete a category. Unlike `archiveInventoryCategory`
 * (which just flips isActive=false), this removes the document
 * entirely.
 *
 * Safety:
 *   - System 'tea' category is hard-rejected (matches archive
 *     behaviour)
 *   - If the category has child items (active OR archived), the
 *     call refuses UNLESS `cascade: true` is passed
 *   - Cascade mode: deletes every /inventory_items doc whose
 *     categoryId matches, then deletes the category itself, all
 *     in batched writes (Firestore caps batches at 500 ops, so we
 *     chunk)
 *   - An audit-log entry is written before the deletion so the
 *     admin trail records what was removed and by whom
 *
 * Request:  { id, cascade?: boolean }
 * Response: { id, deletedItems: number }
 */
export const deleteInventoryCategory = functions.https.onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only.');
    }
    const { id, cascade } = (request.data ?? {}) as { id?: string; cascade?: boolean };
    if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) {
      throw new functions.https.HttpsError('invalid-argument', 'Valid category id required.');
    }
    if (id === 'tea') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'System category cannot be deleted.',
      );
    }

    const ref = db().doc(`inventory_categories/${id}`);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', `Category not found: ${id}`);
    }

    // Count + collect child items. We include archived items in the
    // count so the admin sees the full impact; cascade then deletes
    // them too (the audit log entries survive — those live in
    // /inventory_logs and we don't touch that collection).
    const itemsSnap = await db()
      .collection('inventory_items')
      .where('categoryId', '==', id)
      .get();
    const itemCount = itemsSnap.size;

    if (itemCount > 0 && cascade !== true) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Category has ${itemCount} item${itemCount === 1 ? '' : 's'}. Pass cascade=true to delete everything.`,
      );
    }

    // Write the audit log entry FIRST so it survives even if the
    // batched delete fails partway. Captures admin identity, item
    // count, and category name for context.
    const categoryName = String((snap.data() as { name?: string }).name ?? id);
    await db().collection('inventory_logs').add({
      action:        itemCount > 0 ? 'category_delete_cascade' : 'category_delete',
      category:      id,
      targetId:      id,
      categoryName,
      itemsDeleted:  itemCount,
      employeeName:  request.auth.token.email ?? request.auth.uid ?? 'admin',
      employeeUid:   request.auth.uid,
      updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
    });

    // Cascade delete child items in chunks of 400 (well under the
    // 500-op batch cap). Then delete the category in a final batch.
    let deletedItems = 0;
    if (itemCount > 0) {
      const BATCH = 400;
      for (let i = 0; i < itemsSnap.docs.length; i += BATCH) {
        const slice = itemsSnap.docs.slice(i, i + BATCH);
        const batch = db().batch();
        for (const d of slice) batch.delete(d.ref);
        await batch.commit();
        deletedItems += slice.length;
      }
    }
    await ref.delete();

    return { id, deletedItems };
  },
);

/* -------------------------------------------------------------------------- */
/*      7.  deleteInventoryItem — admin callable, HARD delete (Phase 15)      */
/* -------------------------------------------------------------------------- */

/**
 * Permanently delete a single inventory item. Unlike `archiveInventoryItem`
 * (which sets isActive=false), this removes the doc.
 *
 * Audit log entry is written before deletion so the trail captures
 * what was removed.
 *
 * Request:  { id }
 * Response: { id }
 */
export const deleteInventoryItem = functions.https.onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only.');
    }
    const { id } = (request.data ?? {}) as { id?: string };
    if (typeof id !== 'string' || id.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Item id required.');
    }

    const ref = db().doc(`inventory_items/${id}`);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', `Item not found: ${id}`);
    }
    const data = snap.data() as { name?: string; categoryId?: string };

    await db().collection('inventory_logs').add({
      action:       'item_delete',
      category:     data.categoryId ?? '',
      targetId:     id,
      teaId:        id,           // legacy mirror (see archive log shape)
      itemName:     data.name ?? id,
      employeeName: request.auth.token.email ?? request.auth.uid ?? 'admin',
      employeeUid:  request.auth.uid,
      updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
    });

    await ref.delete();
    return { id };
  },
);
