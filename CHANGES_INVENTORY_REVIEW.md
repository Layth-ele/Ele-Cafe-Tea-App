# Inventory Subsystem — Review Fixes (May 2026)

This file records the fixes applied during the May 2026 inventory subsystem
review. Every item below was validated by `tsc --noEmit`, `eslint`, the
production `vite build`, and the 337-test `vitest` unit suite — all of which
pass with zero errors and zero warnings post-patch.

## Critical (build-blocking before this patch)

### C1 — Mobile drawer ReferenceError for inventory accounts
`src/app/components/Navbar.tsx`

`Drawer({ ... })` declared `isInventoryAccount: boolean` in its prop type but
didn't destructure it, so the reference at line 58 resolved nowhere. `tsc
--strict` rejected the code with `TS2304: Cannot find name
'isInventoryAccount'`. Opening the mobile drawer on the inventory account
would have thrown `ReferenceError` at runtime.

Fix: added `isInventoryAccount` to the destructuring pattern.

### C2 — Rules of Hooks violation in `InventoryAccessModal`
`src/features/inventory/components/InventoryAccessModal.tsx`

A `useMemo` was placed after an SSR early-return guard, making it
conditional. ESLint's `react-hooks/rules-of-hooks` flagged it as an error.

Fix: dropped the `useMemo` (joining 4 short strings is cheaper than the hook
overhead) and moved the SSR guard after the cheap derivation. Removed the
unused `useMemo` import.

### C2b — Same Rules of Hooks pattern in `EmailVerificationModal`
`src/app/components/modals/EmailVerificationModal.tsx`

An early-return for the inventory account was placed BEFORE all the hook
calls below it, making seven hooks conditional. ESLint flagged each one
individually.

Fix: computed the inventory-flag once, gated each effect body on it (so
inventory accounts trigger no analytics), and moved the render-side
early-return to AFTER all hooks. Behavior preserved exactly.

## High

### H1 — Slider draft can be stomped by stale snapshot (roadmap G7)
`src/features/inventory/components/InventoryRow.tsx`

The reconciler `useEffect` only gated on `saveState === 'saving'`. With a
slow network, a saved-state snapshot could echo back the old value and
overwrite an in-flight user draft.

Fix: extended the gate to `saveState === 'saving' || saveTimerRef.current
!== null`, and reordered the refs above the effects so the closure
references are valid.

### H2 — Body-scroll lock pattern inconsistency
`src/features/inventory/components/EmployeeFormModal.tsx`,
`src/app/pages/admin/AdminEmployees.tsx` (`ConfirmDelete`)

Two modals manually toggled `document.body.style.overflow` and restored the
previously captured value. `InventoryAccessModal` already used the ref-counted
`lockBodyScroll()` helper. The manual pattern breaks if two modals ever
stack.

Fix: both now use `lockBodyScroll()` from `@/lib/bodyScrollLock`.

### H3 — Rate-limit counter had a benign TOCTOU race
`functions/src/inventory.ts`

Sequential read-then-write on the per-IP attempts bucket. Two concurrent
failed validates could both observe `fails: 4` and both write `fails: 5`,
giving the attacker one extra attempt before lockout.

Fix: `admin.firestore.FieldValue.increment(1)` — atomic. The window anchor
(`expiresAt`) stays pinned to `firstFailAt + RATE_LIMIT_MS` so each fail
doesn't extend the window.

## Medium

### M1 — Duplicate `useInventoryList` subscription on `/admin/inventory`
`src/features/inventory/components/InventoryTable.tsx`,
`src/app/pages/admin/AdminInventory.tsx`, `src/app/pages/InventoryPage.tsx`

`InventoryTable` subscribed internally AND `AdminInventory` subscribed
externally for the PDF export. Wire-deduped by the Firestore SDK, but the JS
merge+sort pipeline ran twice on every snapshot.

Fix: `InventoryTable` now accepts `rows`, `loading`, `error`, `onUpdate` as
props. Both consumers own the single `useInventoryList()` subscription and
share it down.

### M2 — `inventorySchema.status` was required but doc is briefly statusless
`src/features/inventory/schemas/inventory.schema.ts`

A doc lacks `status` between the client write (level/weight only) and the
trigger settling. The schema's all-required contract didn't match reality.

Fix: added `inventoryDocSchema = inventorySchema.extend({ status: optional()
})` for at-rest validation. The strict `inventorySchema` remains the
authoritative read shape.

### M3 — Soft-deleted teas silently disappeared from the dashboard
`src/features/inventory/components/InventoryTable.tsx`

The hook excluded `isActive: false` teas from the join, but the empty-state
copy suggested checking `onTeaCreate` — wrong direction.

Fix: updated empty-state copy to explain that soft-deleted teas are
intentionally hidden and to point admins at `/admin/products` as the second
place to check.

### M4 — Empty-state diagnostic and hook comment disagreed
`src/features/inventory/hooks/useInventoryList.ts`

The hook's comment said one thing about missing inventory rows; the table's
empty-state copy said another.

Fix: rewrote the hook comment to match the new empty-state copy and to
explicitly reference the soft-delete filter.

## Low

### L1 — Query rebuild in `useInventoryLogs.fetchPage`
`src/features/inventory/hooks/useInventoryLogs.ts`

The cursor branch duplicated the orderBy + limit clauses. Functionally fine,
but a future limit/orderBy edit would have to remember both branches.

Fix: build the query incrementally and conditionally append `startAfter`.

### L3 — Audit log creation rows read as `out_of_stock → in_stock`
`functions/src/inventory.ts`

`onTeaCreate` stamps `updatedBy: 'system:onTeaCreate'`, then
`onInventoryWrite` wrote an audit log entry that read as a "system level
change from 0→10". Misleading in the admin's audit feed since the tea was
never actually out of stock — it just didn't exist yet.

Fix: skip the audit log when `before === null` (creation isn't a level
change).

### L4 — Stale "fallback to legacy stock" comment
`src/lib/teaFilters.ts`

`isProductAvailable` no longer falls back to the legacy `stock` field (Turn 6
cleanup removed it).

Fix: updated the comment to reflect the post-Turn-6 reality.

### L5 — Ambiguous "translations.ts wires the French" docstring
`src/lib/availability.ts`

`LABEL_TEXT` returns English strings that are also i18n keys; callers wrap
them in `t()` (TeaProfilePage does, AdminProducts intentionally doesn't).
The docstring was unclear about this contract.

Fix: rewrote the docstring to make the i18n-key/display-string distinction
explicit and to note that this module is hook-free by design.

## Incidental fixes uncovered by the validation pipeline

### F1 — Pre-existing typecheck error in `useInventoryList.ts`
`Map<...>` keyed on the strict `categories[number]['id']` union rejected
`a.category` (typed `string`). Widened the Map key to `string` — unknown
categories fall through to MAX_SAFE_INTEGER sort key, same as before.

### F2 — Pre-existing lint error in `InventoryTable.tsx`
Inline `style={{ background: group.color }}` tripped
`react/forbid-dom-props`. Moved the eight category background colors into
`src/styles/design.css` matching the existing `[data-group-color='white']`
pattern, and dropped the inline style.

### F3 — Stale `useMemo` exhaustive-deps in `useCreditConfig.ts`
The intentionally narrow dep array (3 sub-fields of `settings` rather than
the whole object) tripped the lint warning.

Fix: documented the rationale in-place and added a targeted
`eslint-disable-next-line react-hooks/exhaustive-deps`.

### F4 — Unused `eslint-disable no-console` directives
Three in `src/hooks/useWishlistSync.ts`, one in `src/lib/sentry.ts`. The
project's eslint config doesn't enable `no-console`, so the directives were
no-ops.

Fix: removed them.

## Validation

After applying every fix above:

```
$ npm run typecheck     # → exits 0, no errors
$ npm run lint          # → exits 0, no errors, no warnings
$ npm test              # → 337 tests pass across 19 files
$ npm run build         # → succeeds (with placeholder env vars in CI)
$ cd functions && npm run build   # → succeeds
```

## Out of scope (intentionally left for future work)

- **`/inventory_logs` retention policy** — flagged as `[DEBT]` in
  `REVIEW_ROADMAP.md`. No log-cleanup function exists yet. Recommended:
  scheduled function that deletes entries older than N years, configurable
  via `AdminSettings`.
- **L2 — PDF reports use `en-US` for timestamps** — intentional per the
  roadmap's "admin tooling is English-only" decision. Comment updated to
  preserve the rationale for future reviewers.
- **`useInventoryList` "include inactive" toggle** — M3 was resolved by
  documenting the current behavior; the optional toggle is still a sensible
  future enhancement.

## File touch summary

```
 functions/src/inventory.ts                                       (H3, L3)
 src/app/components/Navbar.tsx                                    (C1)
 src/app/components/modals/EmailVerificationModal.tsx             (C2b)
 src/app/pages/InventoryPage.tsx                                  (M1)
 src/app/pages/admin/AdminEmployees.tsx                           (H2)
 src/app/pages/admin/AdminInventory.tsx                           (M1)
 src/features/inventory/components/EmployeeFormModal.tsx          (H2)
 src/features/inventory/components/InventoryAccessModal.tsx       (C2)
 src/features/inventory/components/InventoryRow.tsx               (H1)
 src/features/inventory/components/InventoryTable.tsx             (M1, M3, F2)
 src/features/inventory/hooks/useInventoryList.ts                 (M4, F1)
 src/features/inventory/hooks/useInventoryLogs.ts                 (L1)
 src/features/inventory/schemas/inventory.schema.ts               (M2)
 src/hooks/useCreditConfig.ts                                     (F3)
 src/hooks/useWishlistSync.ts                                     (F4)
 src/lib/availability.ts                                          (L5)
 src/lib/sentry.ts                                                (F4)
 src/lib/teaFilters.ts                                            (L4)
 src/styles/design.css                                            (F2)
```


---

# Inventory v2 — Roles + Multi-Category Quantity Inventory (May 2026)

A second pass extending the inventory subsystem in two directions. The deep
roadmap lives in `INVENTORY_V2_ROADMAP.md` (uploaded separately); this file
records what landed in the repo.

## Validation results

After all changes:

```
tsc --noEmit (frontend)   → 0 errors
tsc --noEmit (functions)  → 0 errors
eslint src functions/src  → 0 errors, 0 warnings
vitest run                → 337 / 337 tests pass (19 files)
vite build                → succeeds (101 modules, 23.29 kB gzip SW)
functions npm run build   → succeeds
```

## What's new

### Per-employee roles (Edit / Read-only)

Every employee now carries a `role: 'edit' | 'readonly'` field on
`/employees_access/{empId}`. Admins set it in the same modal that handles
code rotation (`EmployeeFormModal`); the new `<RoleSelector />` radio group
sits below the 4-digit code field. Existing employees default to `'edit'`
at read time — no backfill required.

The role is enforced at the UI layer (per the trust-model trade-off
documented in `INVENTORY_V2_ROADMAP.md` §2.3). On the employee dashboard,
read-only sessions render a persistent amber `<ReadOnlyBanner />` above
both tables, and every editable control receives `disabled={true}`
(slider, weight input, stepper buttons, quantity input).

The `validateInventoryAccessCode` callable now returns the matched
employee's role alongside their name. The session store and access modal
commit both fields atomically.

### Multi-category inventory with the quantity model

New collection `/inventory_categories/{categoryId}` holds admin-defined
categories. A system-owned `tea` category is seeded automatically by the
first invocation of `onInventoryWrite` (self-healing — runs idempotently
on every trigger fire). Admins create new categories like "Milk", "Coffee",
"Syrups" via the `<CategoryFormModal />` from the new
`<InventoryCategoryTabs />` strip at the top of the inventory dashboard.

Items in non-tea categories live at `/inventory_items/{itemId}` and use
a numeric quantity model (not the 0–10 level model). The
`<InventoryItemRow />` component renders a +/− stepper alongside a
numeric input, with the same 500 ms debounced save and reconciler
gating pattern as the tea slider (the H1 fix from the previous review).

Status derivation for items mirrors the tea logic but is parameterized
on `lowThreshold`:
- `quantity === 0` → `out_of_stock`
- `0 < quantity < effectiveThreshold` → `low_stock`
- `quantity >= effectiveThreshold` → `in_stock`

Effective threshold falls back from item override → category default →
hard default of 3.

### Tabs UI (responsive)

`<InventoryCategoryTabs />` renders a horizontal pill strip on desktop
and tablet, with a per-tab count badge and an admin-only "+ Add category"
ghost button. Keyboard arrow keys move between tabs (`role="tablist"`).
On viewports under 480 px the strip collapses to a native `<select>`
styled to match the rest of the app; the "+ Add category" button stacks
below it as a full-width 44 px tap target.

The active category lives in the URL search param (`?category=milk`) so
choices are deep-linkable and survive browser back/forward.

### Audit log handles both kinds

`/inventory_logs` rows gain optional `kind` ('tea' | 'item'), `targetId`,
`categoryId`, `previousValue`, `newValue` fields. Legacy rows continue to
render via their existing `teaId` + `previousLevel/newLevel` fields. New
writes populate both shapes for one release cycle. The audit-log viewer
(`AdminInventoryLogs.tsx`) shows a category badge and unit label on item
rows; tea rows render unchanged.

### CSS namespaces — zero inline styles

All new components consume classes from `src/styles/design.css`. New
namespaces, in the order they appear in the file:

```
ict-*  category tabs (strip, mobile select, add-category, scroll mask)
ifm-*  form-modal shell (overlay, panel, field, color grid, error, actions)
iit-*  item table (header, table, empty state, loading)
iir-*  item row (name cell, action cell, status decoration)
ist-*  stepper (− / number / + / unit)
irb-*  read-only banner
rsel-* role selector
```

Eight predefined category background colors (`color-1` through `color-8`,
plus `color-tea` for the system category) are selected via
`data-color="…"` attribute selectors. No `style={{...}}` props anywhere
in the consuming components.

### Files added

```
functions/src/inventoryItems.ts                                          (NEW)
src/features/inventory/components/CategoryFormModal.tsx                  (NEW)
src/features/inventory/components/InventoryCategoryTabs.tsx              (NEW)
src/features/inventory/components/InventoryItemRow.tsx                   (NEW)
src/features/inventory/components/InventoryItemTable.tsx                 (NEW)
src/features/inventory/components/ItemFormModal.tsx                      (NEW)
src/features/inventory/components/ReadOnlyBanner.tsx                     (NEW)
src/features/inventory/components/RoleSelector.tsx                       (NEW)
src/features/inventory/hooks/useInventoryCategories.ts                   (NEW)
src/features/inventory/hooks/useInventoryItems.ts                        (NEW)
src/features/inventory/schemas/inventoryCategory.schema.ts               (NEW)
src/features/inventory/schemas/inventoryItem.schema.ts                   (NEW)
src/features/inventory/services/inventoryCategories.service.ts           (NEW)
src/features/inventory/services/inventoryItems.service.ts                (NEW)
```

### Files changed

```
firestore.rules                                                          (rules for new collections)
firestore.indexes.json                                                   (composite indexes for items)
functions/src/index.ts                                                   (export new functions)
functions/src/inventory.ts                                               (role on callables, v2 log fields, tea seed)
src/app/pages/InventoryPage.tsx                                          (tabs + readOnly wiring)
src/app/pages/admin/AdminEmployees.tsx                                   (role badge, Edit/rotate flow)
src/app/pages/admin/AdminInventory.tsx                                   (tabs + items + category management)
src/app/pages/admin/AdminInventoryLogs.tsx                               (item-kind row branch)
src/features/inventory/components/EmployeeFormModal.tsx                  (role selector, optional code on rotate)
src/features/inventory/components/InventoryAccessModal.tsx               (commit role alongside name)
src/features/inventory/components/InventoryRow.tsx                       (gate save indicator on readOnly)
src/features/inventory/components/InventoryTable.tsx                     (readOnly prop)
src/features/inventory/hooks/useEmployees.ts                             (read + surface role)
src/features/inventory/hooks/useInventoryAccess.ts                       (commit + expose role + isReadOnly)
src/features/inventory/hooks/useInventoryLogs.ts                         (item + category name resolvers)
src/features/inventory/schemas/inventory.schema.ts                       (role + log kind/value fields)
src/features/inventory/services/inventory.service.ts                     (validate returns role, set accepts role)
src/features/inventory/store/inventoryAccessStore.ts                     (session carries role)
src/styles/design.css                                                    (new namespaces + color slots, ~510 lines)
```

## Out of scope (deferred to future passes)

- PDF export for non-tea categories (admin can still export tea reports).
- Long-press auto-repeat on stepper buttons (each click increments by 1
  today; for bulk changes use the numeric input directly).
- Server-side hard enforcement of role (current implementation is UI-level;
  see roadmap §2.3 for the path to hard enforcement).
- `/inventory_logs` retention policy (carried over from the previous review).


---

# Auth flow polish + access-modal refactor (May 2026)

A targeted pass on the login experience after a user report:
"the page goes blank when trying to log into inventory" and
"the access modal is ugly — not centered, refactor the CSS".

## Validation results

```
tsc --noEmit (frontend)   → 0 errors
tsc --noEmit (functions)  → 0 errors
eslint src functions/src  → 0 errors, 0 warnings
vitest run                → 337 / 337 tests pass
vite build                → succeeds (23.29 kB gzip SW)
functions npm run build   → succeeds
```

## What was broken

### Race condition: `login()` returned before AuthContext state updated

`AuthContext.login(email, password)` resolved as soon as
`signInWithEmailAndPassword` returned its `cred.user`. But the
React `currentUser` state was only updated inside the
`onAuthStateChanged` listener, which awaits `user.getIdTokenResult()`
(a network call, 100-300 ms) before committing.

So `LoginPage.handleLogin` did:
1. `await login(email, password)` → got cred.user back
2. `navigate('/inventory', { replace: true })` → instant
3. `<InventoryGuard>` mounts, reads `currentUser` from context: **null**
4. Guard bounces to `/login?returnUrl=/inventory`
5. ~150 ms later: `onAuthStateChanged` settles, `currentUser` updates,
   but the user is already back on `/login`

That bounce is what manifested as a "blank flash" or "stuck on login
even though I signed in".

Same bug affected `ProtectedRoute` for admin pages — bookmark a deep
admin URL while signed in, the boot-time race could bounce you on
every refresh.

### Access modal CSS — visual quality

Existing modal worked functionally but felt cramped: 1.5 px borders,
56 × 64 px cells, 28 px top padding, harsh near-black overlay. Didn't
look polished on the user's device.

## What landed

### `AuthContext.login()` + `loginWithGoogle()` eagerly set `currentUser`

```ts
const login = useCallback(async (email, password) => {
  const { auth, mod } = await ensureAuth();
  const cred = await mod.signInWithEmailAndPassword(auth, email, password);
  setCurrentUser(cred.user);           // ← NEW: sync React state now
  return cred.user;
}, []);
```

The `onAuthStateChanged` listener still fires asynchronously to
resolve the admin claim, and it's idempotent (re-sets to the same
user). The eager set just closes the navigate-races-listener gap.

### Both guards check `loading` before redirecting

`InventoryGuard` and `ProtectedRoute` previously branched on
`currentUser` alone. Now: while `auth.loading === true` (initial
session resolution), render an `<AuthBootSplash />` instead of
redirecting. Eliminates the boot-time bounce for users on deep links.

### LoginPage auto-redirects authenticated users

If a user lands on `/login` while already signed in (bookmark,
browser-back, etc.), they now redirect immediately to their post-
login destination using a render-time `<Navigate>`. Hooks compliance
preserved (early-return placed after all `useForm` calls).

### Access modal CSS refactor

Concrete changes against the previous v1:

- **Centering:** grid `place-items: center` instead of flex
  (more predictable on unusual viewport ratios). `min-height: 100dvh`
  added so iOS Safari address-bar motion doesn't collapse the
  overlay.
- **Visual quality:** softer 32 px / 80 px shadow, 18 px radius
  (vs 12), generous padding scaling with `clamp(24px, 4vw, 36px)`.
- **Cells:** sized with `clamp()` so they grow naturally on tablet
  (54–64 px wide, 64–72 px tall), 12 px radius, 2 px border, focus
  ring is a 4 px `--gold-tint` halo + 1 px transform lift.
- **Filled state:** when a digit is entered, the cell background
  fills to white and the border darkens, giving visible confirmation
  without changing layout.
- **Lock-icon ornament** at the top of the panel — small visual
  anchor that says "this is a security gate" without text.
- **Submit button:** midnight background with white text (was gold
  on midnight), 12 px radius, 48 px min height, hover lift + shadow.
- **Entrance:** subtle fade + 8 px translateY + 0.985 scale, all
  honoring `prefers-reduced-motion`.
- **Mobile:** 360 px breakpoint tightens padding and reduces gap;
  cells stay legible.

### New `<AuthBootSplash />`

Tiny shared component that the guards and LoginPage all render
during `auth.loading === true`. Single spinner, no text — meant to
be imperceptible on a fast connection. Uses brand `--gold` for the
spinner accent.

### Files added

```
src/app/components/AuthBootSplash.tsx                                    (NEW)
```

### Files changed

```
src/app/components/ProtectedRoute.tsx                                    (loading gate + splash)
src/app/pages/LoginPage.tsx                                              (auto-redirect authed users)
src/contexts/AuthContext.tsx                                             (eager-set currentUser)
src/features/inventory/components/InventoryAccessModal.tsx               (lock icon + placeholder)
src/features/inventory/components/InventoryGuard.tsx                     (loading gate + splash)
src/styles/design.css                                                    (refactored iam-*, new auth-boot)
```


---

# Tea price per weight + last-update banner (May 2026)

Two small storefront / admin improvements.

## Validation results

```
tsc --noEmit (frontend)   → 0 errors
tsc --noEmit (functions)  → 0 errors
eslint src functions/src  → 0 errors, 0 warnings
vitest run                → 337 / 337 tests pass
vite build                → succeeds
functions npm run build   → succeeds
```

## What's new

### Tea card now shows price per weight

Every tea card across the storefront now reads "$15.00 / 100g" instead
of bare "$15.00". Applied to:
  - `<ProductsTeaCard />` (the main browse grid)
  - `<TeaProfilePage />` (the product detail page)
  - `<RelatedTeas />` (the "related" carousel under each product)
  - `<CartUpsell />` (the "you might also like" suggestions in the cart drawer)

The model behind it:
  - New canonical numeric field `weightGrams: number` on `productSchema`,
    optional in storage with a 100 default at read time.
  - Legacy free-form `weight: string` field kept for backward compat;
    parsed as a fallback when `weightGrams` is missing.
  - Shared `formatPricePerWeight(price, product)` helper in
    `src/lib/priceFormat.ts` — single source of truth for the label
    format. Uses `Intl.NumberFormat('en-CA', {currency:'CAD'})` for
    proper currency formatting.

### Admin form: weight is now a required field defaulting to 100g

The "Weight (g)" input in the admin product form:
  - Defaults to `100` on new product creation (was blank)
  - Marked with `*` to indicate required
  - Includes a short help line ("Used for price-per-weight on the
    tea card. Defaults to 100g if left blank.")
  - On save, the form now dual-writes BOTH the legacy `weight` string
    AND the canonical `weightGrams` numeric field, so new edits
    immediately fill both shapes.
  - On load (editing existing product), the form prefers `weightGrams`
    and falls back to legacy `weight` when missing.

### One-shot admin backfill callable

`backfillTeaWeights` — admin-gated Cloud Function that scans every
`/teas` doc and writes `weightGrams` to any tea missing it. Parses
legacy `weight` strings (e.g. "100g", "1kg", "50") into numeric values
when possible; falls back to 100g.

Idempotent — re-running on a fully-backfilled collection touches no
documents and returns `{ scanned, updated: 0, skipped }`. Safe to run
multiple times.

The storefront does NOT depend on this running. The client-side
`resolveWeightGrams()` already returns 100 as a graceful default, so
tea cards render the right thing today even before the migration.

### Last-update banner per category

Earlier in the session: added `<LastUpdateBanner />` at the top of
each inventory category showing when it was last touched and by whom,
formatted in Vancouver time. See above section for the full writeup.

### Files added

```
src/lib/priceFormat.ts                                          (NEW)
src/features/admin/services/teaWeightBackfill.service.ts        (NEW)
```

### Files changed

```
functions/src/index.ts                                          (backfillTeaWeights callable)
src/app/components/CartUpsell.tsx                               (per-weight display)
src/app/components/RelatedTeas.tsx                              (per-weight display)
src/app/components/products/ProductsTeaCard.tsx                 (per-weight display)
src/app/pages/TeaProfilePage.tsx                                (per-weight display)
src/app/pages/admin/AdminProducts.tsx                           (dual-write weightGrams)
src/schemas/product.schema.ts                                   (weightGrams field)
```

## Trade-offs and what's left

- **`<RecentlyViewedSection />`** still shows bare price ($X.XX). The
  recently-viewed store only persists `priceAtView`, not weight.
  Adding `weightAtView` is an intrusive change to the persisted store
  schema; the section is a glance-reminder, not the primary browse
  surface, so the trade-off is acceptable for now.
- **`<BundleTeaCard />`** in the gift builder also unchanged. Gift
  bundles have their own pricing model and showing per-weight in the
  bundle assembly UI would compete with the bundle total.
