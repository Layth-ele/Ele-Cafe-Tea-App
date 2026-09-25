# Phase 6 — Round Update

Date: 2026-05-09 (recovery + push round)
Sister docs: `FORMS_GUIDE.md`, `PHASE_5_6_IMPLEMENTATION.md`, prior round updates
Roadmap reference: `0-12.md` § Phase 6

User goal for the round: **finish Phase 6**.

---

## Phase 6 status: ~75%

Substantial movement up from the previous round (~45-55%), but not 100%. The CheckoutPage multi-step refactor is the largest single remaining piece by far; without it Phase 6 cannot be called fully landed.

### Success-gate audit

| Item | Status |
|---|---|
| Every form uses RHF + Zod with shared schemas | 🟡 6 of 12 (50%) — Login, Signup, AccountPage profile, AdminCustomers AdjustModal, AdminPromotions, plus password reset sub-form. CheckoutPage shipping uses RHF+Zod but no `<Field>`. AdminProducts uses RHF+Zod with its own field components. |
| `<Field>` primitive used; missing `htmlFor` count = 0 | 🟡 used in all 6 fully-migrated forms; remaining forms still have ad-hoc labels |
| `autocomplete` audited and applied | ✅ customer-facing forms have proper attrs; admin biz-config inputs set to `off` |
| CheckoutPage refactored to multi-step with progress indicator | ❌ not started |
| Forms section in Storybook with live examples | ✅ Field, SubmitButton, Skeleton stories all landed |

---

## What landed this round

### Recovery

The previous turn ended mid-AccountPage migration with TS errors. This round started by:
- Running `npx tsc --noEmit` to assess the broken state
- **Field.stories.tsx fix** — added default `args: { children: null, name: 'demo' }` to satisfy the typed Story shape (every story below uses `render`, but the type still requires args).
- **AccountPage profile sub-form** — completed the migration by replacing the half-removed JSX with RHF-driven form using `<FormField>` (the imported `<Field>` aliased to avoid colliding with the local `AddressField`). Wired `register`, `formState.errors`, `handleSubmit`, profile-fetch effect now resets the form, save handler takes RHF data.
- **`<SubmitButton>` API extension** — accepts `ReactNode` children now (not just string), so callers can pass icon+text. The auto loading-label swap (`Save → Saving…`) only fires when children is a string; ReactNode callers must supply `loadingLabel` explicitly. Falls back to `'Loading…'` if neither.

### New form migrations

**AdminCustomers AdjustModal** (carried over from prior round, now confirmed clean):
- `adminCreditFormSchema` in credit.schema.ts (mode + points + note, separate from the storage-shape schema).
- RHF + zodResolver + `<Field>` + `<Field.Textarea>`.
- Submit goes through `form.handleSubmit(handleSave)` wired into the modal footer ModalBtn.
- Mode toggle (add/deduct) uses `form.setValue` to drive the schema-validated state.

**AdminPromotions create/edit form**:
- `promotionFormSchema` in promotion.schema.ts with cross-field refinements (percentage cap, end-after-start).
- Parent's `useForm` wrapped in `<FormProvider>`; PromotionForm reads via `useFormContext`.
- Module-level form component (kept the pre-existing fix where moving it inside the parent caused remount-per-keystroke lag).
- Auto-uppercase on code field via RHF's `register({ onChange: ... })` + `setValue`.
- Empty-string-to-null transforms on optional numeric fields via `setValueAs`.
- `valueAsNumber: true` on number inputs.
- 5 toast-style validation errors converted to inline `<Field.Error>` messages.

**AccountPage profile sub-form**:
- Inline Zod schema (displayName + phone with conditional optional check).
- Defaults reset from the user doc on profile load via `profileForm.reset()`.
- Watched `displayName` mirrored to a local state so the page hero updates as user types AND after save.
- Local `Field` renamed to `AddressField` so it doesn't shadow `<FormField>` (the imported new compound primitive).

### Storybook forms section (Phase 6.7)

- `Field.stories.tsx` — 7 stories: Basic, WithHint, Required, WithError, WithHintAndError, Textarea, FormStack.
- `SubmitButton.stories.tsx` — 6 stories: Idle, Loading, CustomLoadingLabel, Variants, Sizes, Disabled.
- Skeleton stories already migrated in Phase 5.

### Autocomplete audit pass

- `AdminSettings.tsx` — 6 inputs (storeEmail, storePhone, etransferEmail, adminEmail, roleEmail, emailTestTo) set to `autoComplete="off"`. Correct because these are biz-config / admin-action fields, NOT the user's own data.
- `AccountPage.tsx` — profile inputs got proper attributes (`name`, `email`, `tel`).
- `LoginPage.tsx`, `SignupPage.tsx`, `CheckoutPage.tsx` — already had correct autocomplete from prior rounds.

---

## Verification matrix — all green

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx eslint src tests functions/src --quiet` | ✅ 0 errors |
| ESLint warnings | **1,023** (down from 1,028 — minor Phase 3 incidentals) |
| `npx stylelint "src/**/*.css"` | ✅ 0 errors |
| `npx vitest run` | ✅ 142/142 passing |
| `npx vite build` | ✅ ~20s |
| `npm run size` | ✅ 7/7 chunks under budget (vendor 60.24/65, css 34.01/35) |
| `npm run tokens:contrast` | ✅ 21/21 pairs pass WCAG AA |

---

## Files added / modified this round

```
NEW
  src/app/components/ui/Field.stories.tsx        # Phase 6 Storybook
  src/app/components/ui/SubmitButton.stories.tsx
  src/schemas/auth.schema.ts                     # (carried over)
  PHASE_6_ROUND_UPDATE.md                        # this report

MODIFIED
  src/app/components/ui/SubmitButton.tsx         # accept ReactNode children
  src/app/components/ui/Field.stories.tsx        # default args fix
  src/app/pages/AccountPage.tsx                  # profile sub-form → RHF
  src/app/pages/admin/AdminCustomers.tsx         # AdjustModal → RHF
  src/app/pages/admin/AdminPromotions.tsx        # form → FormProvider + RHF
  src/app/pages/admin/AdminSettings.tsx          # +autoComplete="off"
  src/schemas/credit.schema.ts                   # +adminCreditFormSchema
  src/schemas/promotion.schema.ts                # +promotionFormSchema
  src/schemas/user.schema.ts                     # +signupFormSchema (prior round)
  src/styles/design.css                          # +account-* form classes
  FORMS_GUIDE.md                                 # status + inventory updated
  PHASES_INDEX.md                                # Phase 6 status updated
```

---

## What it'd take to actually hit 100%

**The remaining items, ordered by realistic effort:**

1. **AdminOrders edit migration** — 1-2 turns. The EditPanel's state accumulator and dynamic line-item array are non-trivial but tractable; would need a schema with `useFieldArray` for line items + clamp validation as inline errors instead of `Math.max(0, ...)`.
2. **AdminSettings sub-section migrations** — 1-2 turns. Multiple sub-forms (store info, etransfer, admin email, role grants) using a local `Field` component that would need renaming to avoid shadowing.
3. **AccountPage addresses sub-form** — 1 turn. `useFieldArray` for the address list, schema for each address.
4. **CheckoutPage multi-step refactor** — 3-4 turns minimum. Refactoring 1194 lines into a step-machine with progress indicator + per-step schemas + URL-hash state + sessionStorage continuity is a project. Largest single piece of Phase 6 by far.
5. **Gift builder Step 3** — 1 turn but needs a wizard architecture decision. Currently Zustand-backed; converting to RHF means re-architecting how the wizard composes steps. Validation already works correctly at step transitions, so this is more about the form-stack discipline than user-facing UX.

**Realistic total to hit 100%: 6-9 focused turns** beyond this one. Phase 6 → 75% in a single turn (this one) is real progress; 75% → 100% takes the rest.
