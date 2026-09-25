# Inventory v2 — Roles + Multi-Category Quantity Inventory

A planning document for two related improvements to the inventory subsystem.
Read this before any code lands. Every choice is explained, and each section
is small enough to review independently.

This roadmap intentionally does NOT include implementation code yet — it is
the contract you sign off on before we start building. Once you're happy with
the decisions below, implementation lands in the phases described in §8.

---

## 1. What's being added

Two improvements, each with its own threat model and its own UX shape.

The first is **per-employee roles**. Today every employee who passes the
4-digit gate has the same powers: read everything, write level + weight.
After this change, the admin can downgrade specific employees to
**read-only** — they can still sign in, see the dashboard, and audit the
state of things, but the slider, stepper, and weight inputs are inert.
"Edit" stays the default.

The second is **multi-category inventory with a quantity model**. Today
inventory means tea, and tea means a 0–10 visual fill level. After this
change, the admin defines additional **inventory categories** — milk,
coffee, syrups, cups, anything else the café tracks behind the counter —
and within each category creates **items** with a true numeric quantity
(e.g., 12 bottles of whole milk, 5 kg of espresso beans). The new
categories use a stepper UI; the existing tea category keeps its slider UI
unchanged.

The two improvements are independent in scope but ship together because
they share a deployment window, share a Firestore-rules surface, and
share the admin-dashboard real estate.

---

## 2. Architectural decisions

These are the load-bearing choices. The rest of the roadmap follows from
them.

### 2.1 Two storage collections, not one generalized one

Tea inventory stays at `/inventory/{teaId}` exactly as it is today. New
non-tea items go to a brand-new collection at
`/inventory_items/{itemId}`. We do NOT generalize the existing collection
to hold both kinds.

The reason is asymmetry. Tea inventory is tightly coupled to
`/teas/{teaId}`: `onTeaCreate` auto-provisions a tea inventory doc,
`onTeaDelete` cascade-deletes it, and `onInventoryWrite` projects
`available` and `availabilityLabel` back onto the tea doc for the
storefront. Non-tea items have none of that — they are back-of-house
supplies, never customer-facing, never SEO-relevant. Forcing both into
one schema would either keep tea-specific fields on every item doc
(noise) or add a discriminator + branching that touches every trigger.
A second collection is the smaller, less risky change.

The price is one extra listener for admins viewing both. We pay it
gladly — admin sessions are infrequent and the SDK shares the underlying
HTTP/2 channel.

### 2.2 Inventory categories are first-class docs

A new collection at `/inventory_categories/{categoryId}` holds the
admin-defined categories. The existing tea inventory is represented by a
single system-owned category called `tea` (slug `'tea'`, `isSystem:
true`, `model: 'level'`) that we seed at deploy time. The admin can't
rename or delete it; this preserves the existing data model with zero
migration of existing inventory rows.

New categories created by the admin have `model: 'quantity'` and store
their unit (`'bottle'`, `'kg'`, etc.) and low-stock threshold at the
category level. Items inside a category inherit those defaults but can
override per-item if needed.

### 2.3 Role enforcement is soft (UI-level), not Firestore-rule-level

This is the most important non-obvious decision in the document, so it
gets its own subsection.

The current trust model already accepts that the shared
`inventory@elecafe.ca` account makes per-employee Firestore-rule
enforcement structurally impossible. The 4-digit access code maps to an
employee in the session store on the client, but Firestore Auth sees the
same identity regardless of which code was typed. The audit log's
`updatedBy` field is already documented as "soft attribution" (G8 in the
original roadmap) for exactly this reason.

Employee roles inherit the same constraint. A read-only employee
"becomes" read-only because the access-code validate callable returns
their role, the session store remembers it, the InventoryGuard reads it,
and the UI gates the editable controls. A determined attacker who knows
the shared account password AND any active 4-digit code could still
write level/quantity directly via the Firestore SDK — but they could
have done that before this change, too. The role gate adds a clear,
visible UI affordance for the legitimate use case (Sarah is on holiday
and we let her stand-in see the dashboard but not change anything)
without pretending to add cryptographic enforcement we can't actually
deliver.

If you ever want to harden this, the path is: route every inventory
write through a callable that the client invokes with its access code,
and have the callable verify role server-side per write. That's a
separate, larger refactor and is explicitly out of scope here. We
document it as a future hardening in §9.

### 2.4 Migration is zero-touch for existing data

The new collections (`inventory_categories`, `inventory_items`) are
additive — nothing exists in them yet, so there's nothing to migrate.

The extended `/employees_access` doc gains a `role` field, but every
read defaults missing values to `'edit'`, so existing employees keep
working without a backfill. Admins who later open the rotate-code modal
will see the role selector pre-set to "Edit" for these legacy docs and
can change it then.

The extended `/inventory_logs` schema gains optional fields (`kind`,
`previousValue`, `newValue`, `categoryId`) — none required. Existing
log rows continue to render correctly via the existing `previousLevel`
/ `newLevel` fields; new rows include both the legacy and the
generalized fields for one release cycle, after which we can drop the
legacy ones.

The only thing that needs running at deploy time is a one-shot seed of
the `tea` system category. That's a startup function or a deploy
script — either works.

### 2.5 Storefront stays out of this

Non-tea items never project to `/teas/{teaId}`, never appear in
`isProductAvailable`, never show up in search, never land on the
storefront in any form. They are back-of-house only. If you ever decide
to sell coffee or merchandise alongside tea, that's a `/products`
generalization decision separate from this one.

---

## 3. Data model

Every collection and field, with the Zod contract that codifies it.

### 3.1 `/inventory_categories/{categoryId}` (new)

```ts
export const inventoryModelSchema = z.enum(['level', 'quantity']);
export type InventoryModel = z.infer<typeof inventoryModelSchema>;

export const inventoryCategorySchema = z.object({
  /** Path segment. For the system 'tea' category this is literally
   *  the string 'tea'. For admin-created categories the slug is
   *  derived from the name and validated for uniqueness. */
  id:           z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase'),
  name:         z.string().min(2).max(40),
  model:        inventoryModelSchema,
  /** Default unit for items in this category. Required for 'quantity'
   *  model, null for 'level' (tea uses no explicit unit — the level
   *  IS the unit). Free text: 'bottle', 'kg', 'L', 'bag', 'unit'. */
  unit:         z.string().min(1).max(20).nullable(),
  /** Default low-stock threshold for items in this category.
   *  Required for 'quantity' model. For 'level' model this is unused
   *  (tea derives status from level via the hardcoded 4/1/0 cutoffs). */
  lowThreshold: z.number().int().nonnegative().nullable(),
  /** Manual display order. Tea is 0 (always first), admin-created
   *  categories start at 100 and increment in 10s by default. */
  sortOrder:    z.number().int().default(100),
  /** True only for the seeded 'tea' category. Prevents rename + delete
   *  from the admin UI and the rules. */
  isSystem:     z.boolean(),
  /** Soft-delete. Hidden from the admin tabs and from item creation
   *  pickers, but existing items in the category remain readable so
   *  audit-log entries stay linkable. */
  isActive:     z.boolean(),
  createdAt:    z.date(),
  updatedAt:    z.date().optional(),
});

export type InventoryCategory = z.infer<typeof inventoryCategorySchema>;
```

The seeded `tea` doc lives at `/inventory_categories/tea` with:

```
{ id: 'tea', name: 'Tea', model: 'level', unit: null,
  lowThreshold: null, sortOrder: 0, isSystem: true, isActive: true,
  createdAt: <deploy-time> }
```

### 3.2 `/inventory_items/{itemId}` (new)

```ts
export const inventoryItemSchema = z.object({
  id:           z.string(),
  /** FK to /inventory_categories/{categoryId}. Never 'tea' — tea
   *  inventory uses the separate /inventory collection. */
  categoryId:   z.string().min(1),
  name:         z.string().min(2).max(60),
  image:        z.string().nullable().optional(),
  /** Per-item override of category.unit. null = use category default. */
  unit:         z.string().min(1).max(20).nullable().optional(),
  /** Current stock, non-negative. Floats allowed (5.25 kg of beans). */
  quantity:     z.number().nonnegative(),
  /** Per-item override of category.lowThreshold. null = use category default. */
  lowThreshold: z.number().nonnegative().nullable().optional(),
  /** Server-derived from quantity + effective threshold. Like tea's
   *  status field, written by the trigger, never by the client. */
  status:       z.enum(['in_stock', 'low_stock', 'out_of_stock']),
  updatedBy:    z.string(),
  updatedAt:    z.date(),
  /** Soft-delete. */
  isActive:     z.boolean(),
});

export type InventoryItem = z.infer<typeof inventoryItemSchema>;
```

Status derivation for items (server-side, mirrors `getInventoryStatus`
for level but parameterized on threshold):

```
quantity === 0                   → out_of_stock
0 < quantity < effectiveThreshold → low_stock
quantity >= effectiveThreshold   → in_stock
```

Effective threshold = `item.lowThreshold ?? category.lowThreshold ?? 3`.

### 3.3 `/employees_access/{empId}` (extended)

```ts
export const employeeSchema = z.object({
  id:        z.string(),
  name:      z.string().min(2),
  codeHash:  z.string(),
  active:    z.boolean(),
  /** NEW. 'edit' = can change levels/quantities. 'readonly' =
   *  can view only. Default 'edit' for legacy docs that lack the
   *  field. */
  role:      z.enum(['edit', 'readonly']).default('edit'),
  createdAt: z.date(),
  updatedAt: z.date().optional(),
});
```

Read default: any doc without `role` reads as `'edit'`. No backfill
required.

### 3.4 `/inventory_logs/{logId}` (extended)

```ts
export const inventoryLogKindSchema = z.enum(['tea', 'item']);

export const inventoryLogSchema = z.object({
  /** Discriminator. Defaults to 'tea' at read time for legacy rows. */
  kind:          inventoryLogKindSchema.default('tea'),

  /** For 'tea' rows: tea ID matching /teas/{id}. For 'item' rows:
   *  the inventory item ID matching /inventory_items/{id}. The single
   *  field name reflects "what was affected" not "is this a tea". */
  targetId:      z.string(),
  /** Resolved at write time for items only; helps the audit viewer
   *  show category context without a separate fetch. Null for tea rows. */
  categoryId:    z.string().nullable().optional(),

  employeeName:   z.string(),

  /** Generalized "before / after". For tea: 0-10. For item: arbitrary
   *  non-negative number. New writes also populate the legacy
   *  previousLevel/newLevel for one release cycle so older clients
   *  still render. */
  previousValue:  z.number(),
  newValue:       z.number(),

  /** Legacy fields — written for backward compat, may be removed
   *  after the next release. Always equal to previousValue/newValue
   *  on new tea-kind writes. */
  previousLevel:  z.number().optional(),
  newLevel:       z.number().optional(),

  previousStatus: inventoryStatusSchema,
  newStatus:      inventoryStatusSchema,

  updatedAt:      z.date(),
});
```

Note `targetId` replaces `teaId` semantically. We keep writing `teaId`
on tea-kind log rows for one release cycle to avoid breaking the
viewer's tea-name resolver. After that release, the viewer can switch
to reading `targetId` exclusively.

---

## 4. Firestore rules

The full diff against the current `firestore.rules` is small. Here are
the new and changed blocks.

### 4.1 New helpers (add near the existing inventory helpers)

```js
// `/inventory_categories` writes are admin-only. Reads allowed to any
// inventory user (employees see what categories exist).
// `/inventory_items` follows the same shape as `/inventory`: admins
// create/delete, employees can update the safe field set.

function inventoryItemClientWriteAllowed() {
  return request.resource.data.diff(resource.data).affectedKeys()
    .hasOnly(['quantity', 'updatedBy', 'updatedAt']);
}
```

### 4.2 New collection rules

```js
match /inventory_categories/{categoryId} {
  allow read:  if isInventoryUser();
  allow write: if isAdmin();
}

match /inventory_items/{itemId} {
  allow read:   if isInventoryUser();
  allow update: if (isInventoryEmployee() && inventoryItemClientWriteAllowed())
                || isAdmin();
  allow create, delete: if isAdmin();
}
```

### 4.3 Why no role check in rules

See §2.3. Role enforcement is intentionally soft because the
shared-account model makes per-employee rule-time identification
impossible. The rules above match the existing tea inventory rules: any
inventory employee can write the safe field set, role gating happens at
the UI. If you ever want hard enforcement, the path is "all writes via
callable" and the rules above become `allow update: if isAdmin();`.

### 4.4 Composite indexes

Add to `firestore.indexes.json`:

```json
{
  "collectionGroup": "inventory_items",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "categoryId", "order": "ASCENDING" },
    { "fieldPath": "name",       "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "inventory_items",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "categoryId", "order": "ASCENDING" },
    { "fieldPath": "status",     "order": "ASCENDING" }
  ]
}
```

The existing `inventory_logs` indexes already cover the audit viewer's
queries; no new log indexes needed.

---

## 5. Cloud Functions

Three new functions and two extensions of existing ones.

### 5.1 `setInventoryCategory` — admin callable

`POST { id?, name, model, unit, lowThreshold, sortOrder }` →
`{ id }`. Validation: `id` (if provided) must match `/^[a-z0-9-]+$/`
and not equal `'tea'`. If `id` is omitted, derive a slug from the
name and ensure uniqueness via a transactional check. Cannot mutate
`isSystem`. Cannot deactivate the `'tea'` category. Returns the
canonical id.

### 5.2 `setInventoryItem` — admin callable

`POST { id?, categoryId, name, image, unit, quantity, lowThreshold }`
→ `{ id }`. Validation: `categoryId` must exist and not be `'tea'`
(items in the tea category are managed via `/admin/products` +
`onTeaCreate` instead). `quantity >= 0`. `lowThreshold >= 0` if
provided. Creates or upserts the item doc. Status is recomputed by
the trigger; the callable doesn't need to set it.

### 5.3 `onInventoryItemWrite` — Firestore trigger

Fires on any write to `/inventory_items/{itemId}`. Three jobs, in
order, mirroring `onInventoryWrite` for tea:

1. If the doc was deleted, nothing to project (items aren't on the
   storefront), but still write a `kind: 'item'` audit log entry
   marking the deletion.
2. Compute `effectiveThreshold = item.lowThreshold ?? category.lowThreshold ?? 3`.
   This requires a `get()` on the category doc. Cache the category
   read using a Promise-keyed map within the function invocation; the
   trigger may fire for many items in quick succession.
3. Derive `status` from quantity + threshold and write it back if it
   differs. Like the tea trigger, this re-fires and short-circuits at
   the same-status guard.
4. If the quantity actually changed (before.quantity !== after.quantity)
   AND it wasn't the trigger's own status writeback, write a
   `kind: 'item'` audit log entry.

This trigger does NOT send back-in-stock emails — that's a tea-only
behavior because tea is the customer-facing surface. Adding email for
items would require a per-item notification preference which is out of
scope.

### 5.4 `setEmployeeAccessCode` — extended

The existing callable signature gains an optional `role` field:

`POST { name, accessCode, role? }` → `{ id }`

Validation: `role` must be `'edit'` or `'readonly'` if provided. If
omitted on UPDATE, preserve the existing role. If omitted on CREATE,
default to `'edit'`. Same scrypt + transaction pattern as today.

### 5.5 `validateInventoryAccessCode` — extended

The existing callable's response gains `role`:

`POST { accessCode }` → `{ matched, employeeName?, role? }`

When `matched: true`, `role` reflects the matched employee's stored
role (default `'edit'` if missing). The client commits both
`employeeName` and `role` to the session store. The rate-limit and
constant-time-walk logic stays unchanged.

### 5.6 Seed: ensure tea system category exists

A one-shot during the first invocation of `onInventoryWrite` (or a
deploy script): check if `/inventory_categories/tea` exists; if not,
create it with the canonical system shape from §3.1. This makes the
deploy self-healing — no manual step required.

---

## 6. Client-side surface

What lives where in the existing codebase.

### 6.1 Schema files

Add new file `src/features/inventory/schemas/inventoryCategory.schema.ts`
with the category schemas from §3.1.

Add new file `src/features/inventory/schemas/inventoryItem.schema.ts`
with the item schemas from §3.2.

Extend existing `src/features/inventory/schemas/inventory.schema.ts`:
- Add `role` to `employeeSchema` (§3.3).
- Extend `inventoryLogSchema` with the new fields (§3.4).

The existing tea schemas (`inventorySchema`, `inventoryDocSchema`,
`getInventoryStatus`) are untouched.

### 6.2 Service files

Add new file `src/features/inventory/services/inventoryCategories.service.ts`:
- `getCategories(): Promise<InventoryCategory[]>` — one-shot read,
  sorted by `sortOrder`.
- `setCategory(args)` — callable wrapper for `setInventoryCategory`.
- `archiveCategory(id)` — Firestore update setting `isActive: false`
  (admin rule allows direct write).

Add new file `src/features/inventory/services/inventoryItems.service.ts`:
- `getItemsByCategory(categoryId): Promise<InventoryItem[]>`
- `updateItemQuantity(id, quantity, updatedBy)` — direct Firestore
  update on the safe field set.
- `setItem(args)` — callable wrapper for `setInventoryItem`.
- `archiveItem(id)` — Firestore update setting `isActive: false`.

The existing `inventory.service.ts` and `employees.service.ts` are
untouched.

### 6.3 Hook files

Add new file `src/features/inventory/hooks/useInventoryCategories.ts`:
- Subscribes to `/inventory_categories` via `onSnapshot`.
- Filters to `isActive: true`, sorts by `sortOrder`.
- Returns `{ categories, loading, error }`.
- Cleanup pattern matches `useEmployees`: try/catch wrapping the unsub.

Add new file `src/features/inventory/hooks/useInventoryItems.ts`:
- Takes `categoryId` as argument.
- Subscribes to `/inventory_items` where `categoryId == categoryId`
  via `onSnapshot`.
- Returns `{ rows, loading, error, update }` matching the shape of
  `useInventoryList` so admin/employee pages can swap between tea and
  item views with minimal branching.

Extend `src/features/inventory/hooks/useInventoryAccess.ts`:
- The session store gains a `role` field.
- `validate()` now returns `role` on success.
- `commit(name)` becomes `commit(name, role)`.

### 6.4 Store

Extend `src/features/inventory/store/inventoryAccessStore.ts`:

```ts
interface InventoryAccessState {
  employeeName: string | null;
  role:         'edit' | 'readonly' | null;   // null when no session
  setSession:   (name: string, role: 'edit' | 'readonly') => void;
  clear:        () => void;
}
```

The `setEmployeeName` action is replaced by `setSession`. The store
remains in-memory only, same threat model as today.

### 6.5 Components

New components, all in `src/features/inventory/components/`:

- `InventoryCategoryTabs.tsx` — horizontal tabs with count badges,
  active-state styling, mobile fallback to a `<select>` at narrow
  viewports. Renders inside both `AdminInventory` and `InventoryPage`.

- `InventoryItemTable.tsx` — the quantity-based parallel to
  `InventoryTable`. Filters and per-item search work the same way.
  Stays presentational; rows + `onUpdate` come from the parent.

- `InventoryItemRow.tsx` — one row, with the stepper UI (see §7.5).
  Same draft/debounced-save state machine as `InventoryRow`, gated by
  the H1 fix from the previous review (timer-ref reconciler guard).

- `CategoryFormModal.tsx` — admin modal for creating or editing a
  category. Fields: name, slug (auto-derived, editable, locked for
  system category), model picker (only on create — model can't change
  after items exist), unit, lowThreshold, sortOrder.

- `ItemFormModal.tsx` — admin modal for creating or editing an item.
  Fields: name, image URL, unit (optional override), quantity (initial
  stock), lowThreshold (optional override). Cannot change categoryId
  after creation (move via archive + recreate if needed).

- `RoleSelector.tsx` — small inline component (radio group) for
  picking 'edit' vs 'readonly' inside the `EmployeeFormModal`. Pulled
  out as a separate component so future role types (e.g., 'approver')
  drop in trivially.

### 6.6 Existing components — what changes

- `EmployeeFormModal.tsx`: adds a `<RoleSelector />` and threads the
  selected role into the `setAccessCode` call. Default value reads
  from the existing employee on rotate, or 'edit' on create.

- `InventoryTable.tsx`: gains a `readOnly?: boolean` prop. When true,
  the slider, weight input, and search are still visible but disabled,
  and a banner at the top reads "View-only access — ask your manager
  to upgrade your role to make changes." Filter pills still work (they
  affect what's visible, not what's writable).

- `InventoryRow.tsx`: the existing `readOnly` prop is already
  declared but currently unused. Wire it through so the slider and
  weight input both `disabled={readOnly}`. The save-state indicator
  hides for read-only rows.

- `AdminEmployees.tsx`: each row gains a small "Edit / Read-only"
  badge next to the active/inactive badge. The rotate-code action
  doubles as the role-change action — opening the modal lets the
  admin change role and code together (or just role, leaving the
  code field empty).

### 6.7 Pages

- `AdminInventory.tsx`: top of page gains `<InventoryCategoryTabs />`.
  Below the tabs, render either `<InventoryTable />` (tea) or
  `<InventoryItemTable />` (any other category). Also gains an "Add
  category" button and, when on a non-tea tab, an "Add item to <name>"
  button. PDF export currently exports tea only; v2 adds a
  category-aware export that respects the active tab.

- `InventoryPage.tsx`: same tab UI as admin, minus all admin-only
  actions. Read-only employees see the disabled-state banner at the
  top of whichever table is visible. The header greeting and sign-out
  stay as-is.

- `AdminInventoryLogs.tsx`: render branch added for `kind: 'item'`
  rows — instead of "level X → Y" the row shows "quantity X →
  Y <unit>" and the category label appears in a small badge.

### 6.8 Routes

No new routes. The category tab state lives in a URL search param
(`?category=milk`) so a deep link sends an admin or employee straight
to a specific category. Default category resolves to `tea` when the
param is missing or invalid.

This also keeps browser back/forward natural: switching tabs feels
like navigation, but the page doesn't remount, so search/filter state
is preserved within a tab and cleared between tabs (which matches the
"each category is its own world" mental model).

---

## 7. UI/UX

### 7.1 Information architecture

The inventory dashboard becomes a two-axis surface. The vertical axis
is unchanged — filters/search above, table below. The new horizontal
axis is category tabs:

```
[ Tea (78) ] [ Milk (4) ] [ Coffee (6) ] [ + Add category ]  (admin only)
─────────────────────────────────────────────────────────────
search        status pill   category select
─────────────────────────────────────────────────────────────
                       table for active tab
```

The "+ Add category" tab is admin-only and rendered visually as a
ghost button rather than a tab pill, so it doesn't look like a real
category. Same shape and height as a tab but with the dashed-border
treatment used elsewhere in the admin for "+" affordances.

When a non-tea tab is active, an "Add item" button appears in the
table header alongside the existing PDF-export buttons.

### 7.2 Desktop layout (≥1024 px)

- Tabs render horizontally, left-aligned, no scroll.
- Each tab is a button: `padding: var(--sp-2) var(--sp-4)`,
  border-bottom 2px transparent (active = 2px `--gold`), background
  none (active = `--surface-2`).
- Count badge is a small pill to the right of the name, 11px text,
  muted color until hovered/active.
- Add-category button sits flush right of the tab row with a
  separator (`border-left: 1px var(--border)`).
- The active table fills the remaining width up to the container max
  (1200 px) just like today.

### 7.3 Tablet layout (≥768 px and <1024 px)

- Tabs still horizontal, but spacing tightens: `padding: var(--sp-2)
  var(--sp-3)`.
- If the total tab strip would overflow, it becomes horizontally
  scrollable with momentum scrolling and a subtle gradient mask on
  the right edge to hint at more.
- Add-category button collapses to just its icon + label, no
  separator border.

### 7.4 Mobile layout (<768 px)

- Tabs collapse into a `<select>` styled as a category picker, with
  the category count appearing as "Milk (4)" inside each option.
- The Add-category and Add-item buttons stack below the select in a
  full-width button group.
- The table itself follows the existing mobile pattern (vertical
  card layout with data-label attributes — already implemented in
  `inv-cell-*` classes).
- Stepper input is large-tap-target: 44 px minimum buttons,
  `font-size: var(--text-lg)` for the quantity number.

### 7.5 Component-level UX

**Stepper for quantity (non-tea items):**

```
[−]   [  12  ] [+]   bottles    [ ⓘ Low stock ]
```

- `[−]` and `[+]` are 36 × 36 buttons (44 × 44 on mobile) with
  large hit targets and clear hover/active states.
- The middle number is a `<input type="number" inputMode="decimal">`
  so mobile keyboards open numeric. `min={0}`, `step={1}`. For
  fractional units (`kg`, `L`) the row's category metadata sets
  `step={0.1}`.
- The unit (`bottles`, `kg`) renders inline next to the number, dim
  and non-interactive — purely a label.
- Status badge to the right of the row matches the tea badge's
  visual language: green = in stock, amber = low, red = out.
- Save state mirrors the tea row: 500 ms debounce, optimistic
  status update, error banner inline.

Long-press on `+` or `−` could auto-repeat for fast adjustments (e.g.,
incrementing from 0 to 50). Implementing this is one `useEffect`-based
timer; we'll add it in Phase F if the basic stepper feels too slow
during testing.

**Tabs accessibility:**

- Container: `role="tablist"`, `aria-orientation="horizontal"` on
  desktop, vertical not needed.
- Each tab: `role="tab"`, `aria-selected="true|false"`,
  `aria-controls="<panel-id>"`.
- Active panel: `role="tabpanel"`, `aria-labelledby="<tab-id>"`.
- Arrow keys move between tabs; Home/End jump to first/last; Enter
  or Space activates the focused tab.
- The mobile `<select>` follows the standard select pattern and
  needs no role overrides.

**Modal accessibility:**

Existing `emp-overlay` / `emp-panel` shape works for both
`CategoryFormModal` and `ItemFormModal`. Reuse:
- `role="dialog"`, `aria-modal="true"`, labeled by the heading.
- Initial focus on the first input (name).
- ESC closes (but not mid-save).
- Backdrop click closes (but not mid-save).
- Confirm-delete reuses the existing `ConfirmDelete` pattern from
  `AdminEmployees`, with the safer "Cancel" button auto-focused.

**Read-only employee banner:**

When the InventoryGuard validates a session with `role: 'readonly'`,
both `InventoryTable` and `InventoryItemTable` render a banner above
the controls:

```
ⓘ  View-only access.
    You can see inventory but can't change anything.
    Ask your manager to upgrade your role if you need to update levels.
```

Styling: amber-tinted info card (uses existing `--gold-tint` /
`--gold-text` tokens), full-width, dismissable only by sign-out (no
close button — the constraint is informational, not transient).

### 7.6 Accessibility checklist

Items the implementation has to satisfy before shipping. Each is
testable with the project's existing Playwright a11y suite.

- Every interactive control is reachable by keyboard alone.
- Tab order follows visual order on every screen size.
- Each stepper exposes `aria-label="Quantity for <item name>"` and
  `aria-valuenow`, `aria-valuemin="0"`.
- Status badges have descriptive text alternatives ("Low stock —
  3 of 5 threshold").
- The read-only banner has `role="status"` (not "alert" — it's a
  persistent state, not a transient announcement).
- Tabs are operable via arrow keys (as above).
- Modal focus traps, ESC behavior, and scroll-lock all use the
  existing `lockBodyScroll` helper (the H2 fix from the previous
  review).
- Form validation errors associate with their inputs via
  `aria-describedby` and the inputs flip to `aria-invalid="true"`
  while invalid.
- Mobile tap targets ≥ 44 × 44 px (matches existing
  `audit:touch-targets` script's expectations).

### 7.7 CSS namespace plan

No new inline styles. Everything goes through CSS classes in
`design.css`, using the existing CSS variables from
`src/styles/tokens.css`. Tokens to use:
- Spacing: `var(--sp-1)` … `var(--sp-24)`.
- Colors: `var(--midnight)`, `var(--gold)`, `var(--danger)`,
  `var(--surface-2)`, `var(--text)`, `var(--text-2)`, `var(--text-3)`.
- Type: `var(--text-xs)` … `var(--text-lg)`.

New namespaces:

- `ict-` — inventory **c**ategory **t**abs (the tabstrip + add-category
  button + scrollable wrapper + mobile select fallback).
- `iit-` — inventory **i**tem **t**able (rows, header, empty state,
  banner). Reuses `inv-status-badge` / `inv-save` so item rows and
  tea rows look the same at a glance.
- `iir-` — inventory **i**tem **r**ow.
- `ist-` — item **st**epper (the +/-/number triad). Pulled out
  because future surfaces — quick-add toolbar, cart-quantity edits
  on the storefront — could reuse the same primitive.
- `ifm-` — **i**tem / category **f**orm **m**odal (shared because
  the two modals have the same shape).
- `irb-` — **i**nventory **r**eadonly **b**anner.
- `rsel-` — **r**ole **sel**ector.

Each namespace gets a header block in `design.css` (matching the
existing `.iam-`, `.inv-`, `.ial-`, `.emp-` style).

Category background colors for non-tea tabs use the same
`[data-group-color]` attribute mechanism as the F2 fix in the
previous review — each admin-created category gets a default color
slot (one of 8 predefined cycle) assigned by `setInventoryCategory`,
and the CSS has 8 selectors covering the cycle. No inline styles.

---

## 8. Phased implementation

Each phase is independently deployable. After each phase the app
remains in a working state — you could stop and ship at any phase
boundary without leaving the system half-built.

### Phase A — Backend foundation (1–2 days)

**Deliverables.** Schemas, rules, indexes, three new functions, two
extended functions, the tea-category seed. Zero UI work in this phase.

Files added:
- `functions/src/inventoryItems.ts` (mirrors `functions/src/inventory.ts`
  for the item collection).
- Tests in functions, if you ever add a test setup.

Files changed:
- `firestore.rules` — add the new collection blocks (§4).
- `firestore.indexes.json` — add the two composite indexes (§4.4).
- `functions/src/inventory.ts` — extend the access-code callable to
  accept/return `role` (§5.4, §5.5), and inside `onInventoryWrite`
  add the one-shot tea-category seed (§5.6).
- `functions/src/index.ts` — export the three new functions.
- `src/features/inventory/schemas/inventory.schema.ts` — extend
  `employeeSchema` and `inventoryLogSchema` (§3.3, §3.4).
- `src/features/inventory/schemas/inventoryCategory.schema.ts` — new.
- `src/features/inventory/schemas/inventoryItem.schema.ts` — new.

**Definition of done.** `npm run typecheck && npm run lint && npm test`
clean. `firebase deploy --only functions,firestore` succeeds against
a staging project, and the tea category appears at
`/inventory_categories/tea` after the first inventory write.

### Phase B — Categories admin UI (1 day)

**Deliverables.** Admin can create, rename, archive, reorder
categories. The tab strip renders. Tea is always first and locked.

Files added:
- `src/features/inventory/services/inventoryCategories.service.ts`.
- `src/features/inventory/hooks/useInventoryCategories.ts`.
- `src/features/inventory/components/InventoryCategoryTabs.tsx`.
- `src/features/inventory/components/CategoryFormModal.tsx`.

Files changed:
- `src/app/pages/admin/AdminInventory.tsx` — render tabs above the
  table. Tab content for non-tea categories is a placeholder ("Items
  coming in Phase C") until Phase C lands.
- `src/styles/design.css` — `ict-*`, `ifm-*` namespaces.

**Definition of done.** Admin can add a "Milk" category, sees the
"Milk" tab appear, can rename it, can archive it (and it disappears
from the tabs but remains in Firestore). Tea tab still works
identically to today. Responsive at the three breakpoints from §7.

### Phase C — Items admin + employee UI (1–2 days)

**Deliverables.** Admin can add/edit/archive items in any non-tea
category. Employees can adjust quantities of items in any non-tea
category. The stepper + debounced save matches the tea row's save
semantics including the H1 reconciler-guard fix.

Files added:
- `src/features/inventory/services/inventoryItems.service.ts`.
- `src/features/inventory/hooks/useInventoryItems.ts`.
- `src/features/inventory/components/InventoryItemTable.tsx`.
- `src/features/inventory/components/InventoryItemRow.tsx`.
- `src/features/inventory/components/ItemFormModal.tsx`.

Files changed:
- `src/app/pages/admin/AdminInventory.tsx` — wire the non-tea tab
  content to render `<InventoryItemTable />`.
- `src/app/pages/InventoryPage.tsx` — same wiring on the employee
  side.
- `src/features/inventory/lib/inventoryPdf.ts` — extend to render
  per-category exports (the existing tea export becomes one of N).
- `src/styles/design.css` — `iit-*`, `iir-*`, `ist-*` namespaces.

**Definition of done.** Admin creates "Whole milk 2L" in the Milk
category, sees it appear in both their own table and an employee
session's table. Employee taps `+` three times, drag-types 24,
status flips from low to in-stock, audit log records the change.

### Phase D — Employee roles (0.5 day)

**Deliverables.** Admin sets read-only on any employee. Read-only
employees see the disabled-state banner and inert controls.

Files changed:
- `src/features/inventory/components/RoleSelector.tsx` — new tiny
  component.
- `src/features/inventory/components/EmployeeFormModal.tsx` — adds
  the role selector to the create + rotate flow.
- `src/app/pages/admin/AdminEmployees.tsx` — shows the role badge
  per row.
- `src/features/inventory/store/inventoryAccessStore.ts` — adds
  `role` field.
- `src/features/inventory/hooks/useInventoryAccess.ts` — returns and
  commits `role`.
- `src/features/inventory/components/InventoryAccessModal.tsx` —
  commits both name and role on success.
- `src/features/inventory/components/InventoryGuard.tsx` — no
  change needed; the guard doesn't care about role.
- `src/features/inventory/components/InventoryTable.tsx` — accepts
  and propagates `readOnly`.
- `src/features/inventory/components/InventoryItemTable.tsx` — same.
- `src/features/inventory/components/InventoryRow.tsx` — wires the
  existing `readOnly` prop to the slider and weight input.
- `src/features/inventory/components/InventoryItemRow.tsx` — same
  for the stepper.
- `src/app/pages/InventoryPage.tsx` — reads role from the access
  store, passes `readOnly={role === 'readonly'}` to the tables.
- `src/styles/design.css` — `irb-*`, `rsel-*` namespaces.

**Definition of done.** Admin downgrades an employee. Employee signs
in, sees the banner, can't change anything. Admin promotes them
back; banner disappears on next session.

### Phase E — Audit log extension (0.5 day)

**Deliverables.** Audit log viewer renders item-kind rows correctly
with category context. The `previousLevel` / `newLevel` legacy
fields are still written for one release cycle so any cached client
keeps rendering.

Files changed:
- `src/app/pages/admin/AdminInventoryLogs.tsx` — branch on `kind`.
- `src/features/inventory/hooks/useInventoryLogs.ts` — extend to
  resolve item names + category names alongside tea names.
- `functions/src/inventoryItems.ts` — writes log entries with the
  full new shape (§3.4) on every quantity change.
- `functions/src/inventory.ts` — also writes the new shape on every
  level change (alongside the legacy fields).

**Definition of done.** Audit log shows a mix of tea-level changes
and item-quantity changes in one chronological feed. Each row is
unambiguous about what changed and by whom.

### Phase F — Polish, a11y, QA (0.5 day)

**Deliverables.** Cross-device QA, axe scan, keyboard nav check,
empty-state polish, error-state coverage.

Activities:
- Run `npm run test:a11y` and fix any new issues introduced.
- Run `npm run audit:touch-targets` to verify mobile targets.
- Manual QA on mobile (iOS Safari + Android Chrome) for the
  stepper, tabs, modals.
- Empty states: a category with no items renders a friendly "Add
  the first item" pitch. The tab strip with only tea + an archived
  category renders cleanly.
- Error states: network failure on `setCategory`, on `setItem`, on
  quantity update. All surface a toast and don't leave the form in
  a stuck busy state.
- Long-press auto-repeat on stepper buttons (if time).

**Definition of done.** Lighthouse mobile a11y score ≥ 95 on
`/admin/inventory`. No new touch-target audit failures. Smoke test
passes on the three breakpoints.

### Total estimate

About **4–5 days** of focused work, plus 1 day of QA buffer.
Phases A and B are the unblock for everything else — they're worth
front-loading on day one even if the rest waits a sprint.

---

## 9. Risks and mitigations

### 9.1 Role gate is soft

Covered in detail in §2.3. The mitigation is documentation: the
admin-side help text under the role selector reads:

> Read-only employees can still see inventory but can't change
> levels or quantities from the dashboard. This is a UI restriction
> only — for cryptographically-enforced read-only access, contact
> your developer about server-side write gating.

This sets correct expectations. The audit log's `updatedBy` field
already has the same caveat documented.

### 9.2 Migration of `tea` system category

If the seed function fails (network blip during the first deploy's
first `onInventoryWrite` call), the system category is missing and
the tea tab can't render. Mitigation: also seed via a deploy script
(`scripts/seed-inventory-categories.mjs`) that admins run once after
deploy. The two paths are redundant — whichever finishes first wins.
The seed is idempotent (checks `if (existing.exists) return`).

### 9.3 Category color cycle exhaustion

The CSS has 8 predefined background colors. If an admin creates a
9th category, it falls back to a neutral `--surface-3`. This is
acceptable for a café — most use cases will stay well under 8 — and
documented in the `CategoryFormModal`'s color picker (Phase F polish:
let the admin override the color from a small swatch grid).

### 9.4 Bundle size

Three new components plus the stepper + modal add roughly 6–8 KB
gzipped to the admin bundle. The inventory route is already lazy-
loaded; this stays within budget. No new heavy dependencies.

### 9.5 Subscription fan-out

Admin viewing `/admin/inventory` will subscribe to:
- `/inventory_categories` (one snapshot, tiny)
- `/inventory` (tea, existing)
- `/inventory_items` filtered by active categoryId (new)

That's three listeners where there used to be one. Firestore's
free tier supports far more, and the SDK shares the HTTP/2 channel,
so wire cost is negligible. JS-side cost is per-snapshot merge work
which we've already characterized as cheap (~80 docs each).

### 9.6 Existing tea inventory unaffected

Every code path that touches `/inventory` (the tea collection),
`/teas/{teaId}`, `onTeaCreate`, `onTeaDelete`, `onInventoryWrite`,
and the storefront availability projection stays bit-for-bit
unchanged. Phase A's extension of `onInventoryWrite` is purely
additive (writes new log fields alongside the legacy ones, seeds the
tea category once). If anything goes wrong with the new code, we
can roll back Phases B–E in isolation without touching tea
inventory at all.

### 9.7 Schema drift between client and server

Both the client (`inventory.schema.ts`) and the server
(`functions/src/inventory.ts`'s inline `InventoryDoc` type) define
the inventory shape independently today. We continue the pattern for
items — both sides define their own type aliases — but document the
shared contract in this roadmap so a future schema change updates
both. Future hardening: a single shared schema package consumed by
both sides via npm workspaces.

---

## 10. Acceptance criteria

Below are the user-visible behaviors that have to be true after the
six phases ship. Each is a sentence you'd find on a QA checklist.

**Roles.**
The admin can open `/admin/employees`, click "Rotate code" on any
employee, see a "Role" radio group with Edit / Read-only, change
the selection, type a new 4-digit code, save, and see the role
badge update in the employee list.

A read-only employee who signs into `inventory@elecafe.ca` and
types the right code lands on `/inventory`, sees the same tabs and
data an edit-role employee would, but every editable control is
disabled and a banner explains why. They can sign out normally.

An edit-role employee experiences no change from today's behavior.

**Categories.**
The admin can open `/admin/inventory`, see a "Tea" tab as the first
tab (locked, with a small system-locked badge), and click "+ Add
category" to create "Milk" with unit "bottle" and low threshold 3.

A new tab "Milk" appears. The admin clicks it and sees an empty
state with a friendly "Add your first Milk item" pitch.

The admin clicks "Add item", fills in "Whole milk 2L", quantity 12,
and saves. The item appears in the table. An employee with edit
role signs in, switches to the Milk tab, sees the item, taps the
`−` button three times in quick succession; one save fires (not
three) and the quantity ends at 9. The status badge transitions
from "In stock" through "Low stock" if appropriate.

**Audit log.**
The admin opens `/admin/inventory/logs` and sees a chronological
mix of tea-level rows (matcha 5 → 3, low stock badge) and
item-quantity rows (whole milk 12 → 9 bottles, category badge
"Milk"). Each row is unambiguous about what changed, by whom, when.

**Responsive.**
On a 360 px iPhone SE viewport, the category selector becomes a
native-looking select dropdown. The "Add category" and "Add item"
buttons stack below it as full-width buttons. The stepper buttons
are ≥ 44 × 44 px and easy to tap.

On a 768 px iPad viewport, the tabs render horizontally with
slightly tighter padding. If categories overflow, the tab strip
scrolls horizontally with a subtle gradient mask on the right edge.

On a 1440 px desktop viewport, the tabs render in the same row as
the action buttons, the table uses the full container width up to
1200 px, and the stepper sits inline alongside the status badge.

**No conflicts.**
The storefront, `/admin/products`, `onTeaCreate`, `onTeaDelete`,
`/teas/{id}` projection, customer wishlist, and back-in-stock
emails all behave identically before and after this change. The
production existing-tea inventory continues to function with no
visible difference. `npm run typecheck && npm run lint &&
npm test && npm run build` all pass.

---

## Ready to start when you say go

Say the word and I'll begin with Phase A (schemas + rules + functions),
then walk you through each phase boundary so you can review before
moving to the next. If you want any of the decisions in §2 revisited
(soft-vs-hard role enforcement, separate-vs-merged collections, etc.),
flag those first — they cascade into everything else.
