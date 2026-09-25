# Phase 6 — Round 3 Update

Date: 2026-05-09 (recovery + multi-step + useFieldArray push)
Sister docs: `FORMS_GUIDE.md`, `PHASE_5_6_IMPLEMENTATION.md`, `PHASE_6_ROUND_UPDATE.md`
Roadmap reference: `0-12.md` § Phase 6

User goal for the round: **Forms & Validation → 100%**.

---

## Phase 6 status: ~85%

Substantial movement up from the previous round (~75%). The two big-ticket items this round were the **CheckoutPage multi-step refactor** (was the largest single gap in the success gates) and the **AccountPage addresses migration** to `useFieldArray`. Both landed cleanly.

Honest accounting: **not 100%**. AdminOrders edit, AdminSettings sub-forms, and Gift builder Step 3 remain ad-hoc. AdminSettings in particular is non-trivial because it's structurally a settings panel rather than a single form — each section has its own save handler, and migrating all of them is multiple turns. AdminOrders edit needs a `useFieldArray` for line items plus a clamp-to-error pattern instead of `Math.max(0, ...)`. These are tractable but didn't fit alongside the multi-step refactor in one turn.

### Success-gate audit

| Item | Status |
|---|---|
| Every form uses RHF + Zod with shared schemas | 🟡 8 of 12 (67%) — Login, Signup, Password reset, AccountPage profile, AccountPage addresses, AdminCustomers AdjustModal, AdminPromotions, CheckoutPage. Remaining 4: AdminProducts (RHF+Zod with custom field components), AdminOrders edit, AdminSettings sub-forms, Gift builder Step 3. |
| `<Field>` primitive used; missing `htmlFor` count = 0 | 🟡 used in all 8 fully/mostly-migrated forms; AdminOrders edit + AdminSettings + Gift Step 3 still have ad-hoc labels (some with htmlFor, some without) |
| `autocomplete` audited and applied | ✅ |
| **CheckoutPage refactored to multi-step with progress indicator** | ✅ landed this round |
| Forms section in Storybook with live examples | ✅ |

---

## Major work this round

### CheckoutPage multi-step refactor (Phase 6.5 — gating item)

The 1,194-line single-page checkout is now a 3-step wizard. **The success-gate item that's been blocking Phase 6 from above 75% is now ✅.**

Implementation:
- **Step type:** `'delivery' | 'payment' | 'review' | 'placed'`. The first three are user-driven; `'placed'` is the post-success state set by `handlePlaceOrder` on a successful order.
- **Step 1 (Delivery):** pickup/delivery toggle + name + phone + address fields. The address fields are conditional on `fulfillmentMethod === 'delivery'` (pickup orders skip address entry).
- **Step 2 (Payment):** promo code + credit selector. Both optional, so step is always advance-able.
- **Step 3 (Review):** how-it-works info card + the Place Order button (which only renders on this step — the actual submit is gated to here).
- **URL hash persistence:** `#delivery`, `#payment`, `#review` synced in a useEffect with `replaceState`. Browser back/forward listens via `hashchange` and re-syncs local state. Page refresh keeps the user on the right step.
- **Per-step validation:** `isDeliveryStepValid()` runs before the Step 1 → 2 transition. Reuses the existing `submitted` flag so the same fields highlight as on submit. Scrolls the first invalid field into view via `requestAnimationFrame` + `scrollIntoView`.
- **Steps component** rebuilt with 4 dots (`'cp-steps'` class) and the corresponding labels. The done/active/upcoming visual treatment is preserved from the prior 2-step version.
- **Back / Next buttons:** `goNextStep()` and `goPrevStep()` helpers. Smooth-scroll to top on every step change. Step 3's "next" is the Place Order submit, so there's a hint inline showing where to click.
- **Place Order button** only renders on `step === 'review'` — no chance of accidentally submitting from steps 1 or 2.
- **CartSummary** stays sticky on the right column across all steps. The customer always sees their running total.
- **Heading** dynamic: "Delivery details" / "Payment options" / "Review & place order" based on step. Tells the user where they are without needing to read the stepper.

New CSS block (`cp-*`) added to `design.css`: `cp-container`, `cp-header`, `cp-overline`, `cp-steps`, `cp-left`, `cp-howitworks`, `cp-step-nav`, `cp-nav-back`, `cp-nav-next`, `cp-review-hint`, `cp-place-order`. Replaces the previous one-off inline styles for the form chrome.

### AccountPage addresses migration → `useFieldArray`

The addresses sub-form was the last ad-hoc state in AccountPage. Now uses RHF's `useFieldArray` for clean append/remove/update semantics on the address list.

Implementation:
- **`addressesFormSchema`** in `address.schema.ts`. Built on top of `addressFormItemSchema` (which extends `addressSchema` to make `isDefault` required — the base schema marks it optional because legacy Firestore docs may not have the field, but the form always supplies it). The form-item schema is a private detail of `address.schema.ts`; only `addressesFormSchema` and `AddressesFormInput` are exported.
- **`useFieldArray`** with `control: addressesForm.control` + `name: 'addresses'`. Provides `fields`, `append`, `remove`, `update` helpers.
- **`updateAddr`** keeps its old call shape (`updateAddr(id, field, value)`) so the JSX doesn't have to change everywhere — internally it now resolves the index from id and calls `update(idx, ...)`.
- **"Set default"** button now iterates `addressFields.forEach((a, i) => updateAddress(i, ...))` to clear the default flag on every other address. Small N, no perf concern.
- **Profile-fetch effect** now calls `addressesForm.reset({ addresses: ... })` instead of `setAddresses(...)`.
- **Save button** is the new `<SubmitButton>` (with the `<Save>` icon) inside an `<form onSubmit={addressesForm.handleSubmit(handleSaveAddresses)}>`.

The previous round's local `AddressField` wrapper is now used only for the email-readonly field (which is disabled and not part of any form). Profile + addresses both use the imported `<FormField>`.

New CSS block (`ap-addr-*`) added to `design.css` with the empty-state, list, card-head, action-row layout classes. Replaces the previous one-off inline styles per-row.

### Other cleanups

- **`<SubmitButton>`** now accepts `ReactNode` children (icon + text) — see prior round notes. Used by both AccountPage profile and AccountPage addresses save buttons.
- **`Field.stories.tsx`** got default `args: { children: null, name: 'demo' }` so individual stories satisfy the typed Story shape without each repeating the placeholder args.
- **AccountPage** local `Field` renamed to `AddressField` so the imported `<FormField>` doesn't shadow it.
- **AccountPage profile-fetch effect** now resets the new RHF profile form via `profileForm.reset(...)` and the addresses form via `addressesForm.reset(...)`.
- **AccountPage `displayName`** is mirrored from `profileForm.watch('displayName')` into local state so the page hero updates in real time as the user edits the profile sub-form.

---

## Verification matrix — all green

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx eslint src tests functions/src --quiet` | ✅ 0 errors |
| ESLint warnings | **1,001** (down from 1,023 — incidental improvement from the inline-style migrations in CheckoutPage and AccountPage) |
| `npx stylelint "src/**/*.css"` | ✅ 0 errors |
| `npx vitest run` | ✅ 142/142 passing |
| `npx vite build` | ✅ ~20s |
| `npm run size` | ✅ 7/7 chunks under budget (vendor 61.55/65, css 34.32/35) |
| `npm run tokens:contrast` | ✅ 21/21 pairs pass WCAG AA |

---

## Files added / modified this round

```
NEW
  PHASE_6_R3_UPDATE.md                           # this report

MODIFIED — Phase 6.5 (CheckoutPage multi-step)
  src/app/pages/CheckoutPage.tsx                 # multi-step refactor
  src/styles/design.css                          # +cp-* CSS block

MODIFIED — Phase 6 (AccountPage addresses → useFieldArray)
  src/app/pages/AccountPage.tsx                  # addresses sub-form → RHF + useFieldArray
  src/schemas/address.schema.ts                  # +addressesFormSchema, +addressFormItemSchema
  src/styles/design.css                          # +ap-addr-* CSS block

MODIFIED — Docs
  FORMS_GUIDE.md                                 # status + inventory updated
  PHASES_INDEX.md                                # Phase 6 status bumped to ~85%
```

---

## What it'd take to actually hit 100%

**The remaining items, ordered by realistic effort:**

1. **AdminOrders edit migration** — 1-2 turns. The EditPanel's state accumulator and dynamic line-item array are non-trivial but tractable; would need a schema with `useFieldArray` for line items + clamp validation as inline errors instead of `Math.max(0, ...)`.
2. **AdminSettings sub-section migrations** — 1-2 turns. Multiple sub-forms (store info, etransfer, admin email, role grants, social URLs, points config) using a local `Field` component that would need renaming to avoid shadowing. Each section has its own save handler. RHF buys less here than for user-facing forms (it's a settings panel, not a form), but consistency with the rest of Phase 6 still matters.
3. **Gift builder Step 3** — 1 turn but needs a wizard architecture decision. Currently Zustand-backed; converting to RHF means re-architecting how the wizard composes steps. Validation already works correctly at step transitions, so this is more about the form-stack discipline than user-facing UX.

**Realistic total to hit Phase 6 = 100%: 3-5 more focused turns** beyond this one. Going from 45% → 85% in three turns is real progress; the last 15% is bunched in three medium-effort migrations that don't compose well with the multi-step refactor in a single turn.
