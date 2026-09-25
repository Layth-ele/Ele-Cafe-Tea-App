# Phase 15 — Hard-Delete Capability for Admin Dashboard

Date: 2026-05-20
Scope: Products (teas) + Inventory Categories + Inventory Items.

Adds permanent-delete affordances across the admin dashboard, fully
wired from UI → service → callable → Firestore, with audit-log
preservation, Storage cleanup, and a cascade-aware confirmation flow.

---

## What landed

### 15.1 Products (teas)

Two new row affordances on **inactive** teas (visible only after the
admin first deactivates a product):

- **Reactivate** (Power icon, green) — flips `isActive: true`, the
  tea reappears in the store. Closes the trap door from earlier
  versions where deactivated teas had no UI to come back.
- **Delete permanently** (Trash icon, deeper red) — opens a
  ConfirmModal with explicit warning copy. On confirm:
  1. Reads the doc to capture the `image` URL (if any)
  2. Deletes the Firestore doc
  3. If the image lives in our Firebase Storage bucket
     (`firebasestorage.googleapis.com` host), decodes the path from
     the download URL and deletes the Storage object too — frees
     quota that would otherwise leak
  4. Storage failures are non-fatal; the Firestore delete still
     succeeds and a console warning is emitted

Two-step ladder by design: admin must deactivate first, then
explicitly hard-delete. Prevents accidental wipes on the active
storefront.

**File:** `src/app/pages/admin/AdminProducts.tsx`

### 15.2 Inventory Items

New **Delete** button next to the existing Archive button on every
item row (admin sessions only). Wired through:

- **Row** (`InventoryItemRow.tsx`) — accepts new `onDelete` prop;
  renders a distinct `.iir-action--delete` button between Archive
  and the row end
- **Table** (`InventoryItemTable.tsx`) — pass-through of `onDelete`
  prop; widens the actions column gate to include it
- **Page** (`AdminInventory.tsx`) — `onDelete` opens the unified
  ConfirmModal with the `item-delete` state

Hard-delete fires the new `deleteInventoryItem` callable. Server
writes an audit-log entry **before** the delete so the trail
preserves what was removed and by whom even if the Firestore delete
were to fail mid-flight (it can't here, but the order matters as a
defensive habit).

**Files:**
- `src/features/inventory/components/InventoryItemRow.tsx`
- `src/features/inventory/components/InventoryItemTable.tsx`
- `src/app/pages/admin/AdminInventory.tsx`

### 15.3 Inventory Categories

New **"Delete category"** button next to the existing **"Archive
category"** button on the category action bar (visible only on
non-system, non-tea categories).

The cascade flow is the interesting part:

1. Admin clicks **Delete category** → ConfirmModal opens with the
   `cat-delete` state. Copy: "If it has items, you'll be prompted
   to confirm cascade delete."
2. On confirm, the client calls `deleteInventoryCategory(id, { cascade: false })`.
3. Server checks `inventory_items.where(categoryId == id).get()`:
   - **Zero items** → deletes the category, returns
     `{ id, deletedItems: 0 }`. Modal closes, success toast.
   - **N items** → throws `failed-precondition` with the count
     embedded in the message ("Category has 7 items. Pass
     cascade=true…")
4. The client's `handleConfirm` catches the precondition error,
   parses N from the message, and pivots the modal state to
   `cat-delete-cascade` with `itemCount: N`. **No error toast** —
   the modal stays open with new copy: "Category has 7 items.
   Deleting now will permanently remove the category AND every
   item inside it. The audit log entries are preserved. This
   cannot be undone." Confirm button changes to "Delete everything".
5. On the second confirm, the server cascades: deletes all matching
   items in 400-op batches (Firestore batch cap is 500 with safety
   margin), then deletes the category itself. Audit log entry
   captures the operation with `action: 'category_delete_cascade'`
   and the item count.

**System category protection:** the 'tea' category is rejected at
both the client (UI button is gated by `!activeCategory.isSystem`)
and the server (`failed-precondition` on the callable).

**Files:**
- `functions/src/inventoryItems.ts` (new callables)
- `functions/src/index.ts` (re-exports)
- `src/features/inventory/services/inventoryCategories.service.ts`
- `src/app/pages/admin/AdminInventory.tsx`

### 15.4 ConfirmModal state machine

The old code used `window.confirm()` for both archive paths — modal-
dialog inconsistent UX, and no way to express the "has items → pivot
to cascade confirm" upgrade flow. Replaced with a single discriminated-
union state:

```ts
type ConfirmState =
  | { kind: 'closed' }
  | { kind: 'item-archive';        item: InventoryItemRowData }
  | { kind: 'item-delete';         item: InventoryItemRowData }
  | { kind: 'cat-archive';         category: InventoryCategory }
  | { kind: 'cat-delete';          category: InventoryCategory; itemCount?: number }
  | { kind: 'cat-delete-cascade';  category: InventoryCategory; itemCount: number };
```

Plus a single `pending: boolean` (prevents double-submit) and a
single `<ConfirmModal>` mount in the page JSX. All five destructive
flows route through `handleConfirm`. Adding a sixth flow later is
adding one case to the union and one branch to the switch.

### 15.5 Audit log

Both new callables write to `/inventory_logs` **before** deleting
the row, so the trail survives even if a delete fails mid-flight:

```
{
  action:        'item_delete' | 'category_delete' | 'category_delete_cascade',
  category:      <category id>,
  targetId:      <doc id>,
  teaId:         <doc id>,            // legacy mirror — see archive log shape
  itemName?:     <name>,              // items only
  categoryName?: <name>,              // categories only
  itemsDeleted?: <count>,             // categories only
  employeeName:  <admin email or uid>,
  employeeUid:   <admin uid>,
  updatedAt:     serverTimestamp(),
}
```

The existing `AdminInventoryLogs.tsx` viewer reads this collection
and now surfaces these new action kinds without further changes.

### 15.6 CSS additions

Two new variants in `src/styles/design.css`:

- `.iir-action--delete` — applied to row-level Delete buttons.
  Deeper red than `--danger` (the archive colour) so admins can
  tell the two destructive actions apart at a glance. Inverts to
  white-on-red on hover.
- `.iit-add-btn--danger` — same treatment for the page-level
  "Delete category" button.

Both wrapped with the documented `stylelint-disable-next-line`
exceptions for the literal hex values (matches the existing
`stylelint-disable` pattern used throughout the file).

---

## Architecture decisions

### Why callables for delete (not client-side `deleteDoc`)?

Two reasons:

1. **Audit log entry must precede the delete.** From the client,
   that's a two-write transaction that could fail between writes;
   from the server, it's a single callable that either succeeds or
   doesn't.
2. **Category cascade needs to count items first** to surface the
   confirmation UX. Doing the count on the client requires reading
   every item doc (cost), then doing the delete in a separate batch
   (race condition window). The server does both in one
   admin-privileged round-trip.

### Why preserve audit-log entries when the doc is hard-deleted?

The audit log is the merchant's evidence trail. If an admin deletes
an item, the log entry recording who-deleted-what is the only
remaining record. Wiping the log alongside the data would defeat
its purpose. The log entries reference doc IDs that no longer
resolve — that's fine for an audit log (it records WHAT happened,
not the current state).

### Why two-step (deactivate → hard-delete) for products?

Tea slugs are part of customer-facing URLs (`/tea-profile/black/earl-grey-cream`).
A direct delete could 404 inbound links from search results, social
shares, and customer wishlists. The two-step path forces the admin
to confirm intent and gives Google + customers a window to notice
the tea is inactive before the URL evaporates.

For inventory items + categories, no such concern — those are admin-
only surfaces and a hard-delete is the appropriate UX choice.

### Why does Storage cleanup live on the client (not the server)?

The Cloud Functions Admin SDK can access Storage, so a server-side
cleanup would work. But the tea-image URL might be external (admin
pasted in a third-party image URL during create) — only the client
can know whether the URL belongs to our bucket because the host-
match is a client-known fact. Pushing this server-side would either
duplicate the host-match logic or risk attempting to delete external
URLs (which would throw misleading errors).

The client-side `firebasestorage.googleapis.com` host gate
correctly skips external URLs.

---

## Verification

### Files changed (10)

```
functions/src/inventoryItems.ts                                     +110 (2 callables + cascade logic)
functions/src/index.ts                                              +5   (re-exports + comment update)

src/features/inventory/services/inventoryCategories.service.ts      +21  (deleteInventoryCategory client)
src/features/inventory/services/inventoryItems.service.ts           +12  (deleteInventoryItem client)
src/features/inventory/components/InventoryItemRow.tsx              +14  (onDelete prop + Delete button)
src/features/inventory/components/InventoryItemTable.tsx            +4   (onDelete prop pass-through)

src/app/pages/admin/AdminInventory.tsx                              +130 (ConfirmState machine + 3 buttons)
src/app/pages/admin/AdminProducts.tsx                               +60  (Reactivate + hard-delete + Storage cleanup)

src/styles/design.css                                               +35  (.iir-action--delete + .iit-add-btn--danger)
CHANGES_PHASE_15.md                                                 (this doc)
```

### Manual checks performed

- ✅ All 8 modified TS/TSX files have balanced braces
- ✅ No stale references to removed `handleArchiveCategory` /
  `handleArchiveItem` anywhere in `src/`
- ✅ `getDoc`, `getStorageLazy`, `ConfirmModal`, `Power` icon all
  imported in AdminProducts (no missing-import bugs)
- ✅ Service exports match callable function names verbatim
  (`deleteInventoryCategory` ↔ `deleteInventoryCategory`)
- ✅ `hardDeleteSlug` state is now fully wired: button → state →
  modal → handler → Firestore. Previously the state was declared
  but the modal listening for it was missing.

### What `pnpm typecheck` will verify (must be run locally)

- Whether the `ConfirmState` discriminated union narrows correctly
  in every case branch of `handleConfirm`
- Whether the `getStorageLazy` returned `sm.deleteObject(sm.ref(sm.storage, path))`
  call satisfies the SDK's TypeScript signatures (Storage and Ref
  types should infer correctly from `getStorageLazy`'s module shape)
- Whether `InventoryItemTable` and `InventoryItemRow`'s new
  `onDelete` prop type matches all call sites

---

## Deploy

1. Build Cloud Functions: `cd functions && npm run build`
2. Deploy: `firebase deploy --only functions,hosting`
3. Smoke test:
   - Open `/admin/inventory`, create a test category, then delete it (empty → instant delete)
   - Create another test category, add an item, then click Delete category. Modal should pivot to "Delete category and 1 item?" with the cascade copy
   - Verify the new audit log entries appear in `/admin/inventory/logs`
   - Open `/admin/products`, deactivate a test tea, then delete permanently. Verify Storage object is removed if image lived in our bucket

End of Phase 15.
