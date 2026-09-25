# Phase 5 + 6 — Implementation Report

Date: 2026-05-09
Continuing from `PHASE_3_4_FINAL_IMPLEMENTATION.md`.

This round: start Phase 5 (States Library) and Phase 6 (Forms & Validation Excellence) — building the primitives both phases need before mechanical migration work can begin.

---

## Phase 5 — States Library

### What landed

**`src/app/components/ui/skeleton.tsx`** — namespaced Skeleton primitive (replaces the prior thin shadcn-derived shape).

Public API:
- `<Skeleton w={…} h={…} />` — plain rectangular pulse (also default export, backward-compatible with all prior `import { Skeleton } from './skeleton'` callers; AdminProducts and skeleton.stories.tsx keep working without changes).
- `<Skeleton.Line w="60%" />` — single line of text.
- `<Skeleton.Avatar size={40} />` — round avatar placeholder.
- `<Skeleton.Card />` — tea-card-shaped (image + title + price), matches `.tea-card` geometry to prevent layout shift.
- `<Skeleton.Table rows={5} cols={4} />` — table-row repeat pattern.
- `<Skeleton.Page />` — full-viewport route-transition fallback.

Wired `<Skeleton.Page />` into App.tsx as the lazy-route Suspense fallback (replaces the old `<PageLoader />` single dot).

Companion CSS in `design.css`: `.sk-line`, `.sk-avatar`, `.sk-card-*`, `.sk-table-*`, `.sk-page`, `.sk-page-pulse` keyframe, plus `.sr-only` utility for the page skeleton's `role="status"` label.

**`src/lib/useOptimistic.ts`** — `useOptimisticMutation` wraps Tanstack Query's `useMutation` with the four-callback optimistic pattern. Cancels pending refetches before the optimistic write, snapshots the cache for rollback, rolls back on error, invalidates on settled. Single hook = uniform optimistic UI across every mutation in the app.

**`STATES_GUIDE.md`** — full taxonomy of the 12 async states + which pattern this codebase uses for each. Inventory of remaining work (per-page skeletons, cart toast wiring, inline retry buttons, offline banner, stale indicator).

### Phase 5 status: ~35%

The PRIMITIVES are in. The MIGRATION work — replacing every `.skeleton` div across the codebase with `<Skeleton.*>` shapes, adding cart toasts, adding retry buttons everywhere — is mechanical Phase-3-style work that can run in parallel.

| Sub-item | Status |
|---|---|
| Skeleton primitive with shape variants | ✅ landed |
| Suspense fallback audit (route-level) | ✅ wired into App.tsx |
| Per-page skeletons (every page's ad-hoc loading state) | ⬜ next round |
| Optimistic UI utility | ✅ landed (`useOptimisticMutation`) |
| Cart optimistic toasts (success+undo / failure+retry+rollback) | ⬜ next round |
| Inline retry on every async-load error | ⬜ next round |
| `STATES_GUIDE.md` documentation | ✅ landed |

---

## Phase 6 — Forms & Validation Excellence

### What landed

**`src/app/components/ui/Field.tsx`** — compound component with named slots:

- `<Field name="email" required>` — root with React Context for shared id.
- `<Field.Label>` — auto `htmlFor` to the generated input id.
- `<Field.Hint>` — joined into `aria-describedby`.
- `<Field.Input>` — auto id, auto `aria-describedby`, auto `aria-invalid`, auto `aria-required`.
- `<Field.Textarea>` — same as Input but for `<textarea>`.
- `<Field.Error>` — flips the context's `hasError` flag for the sibling Input, sets `role="alert"`, joined into `aria-describedby` only when present.

Single primitive fixes the ~50 missing-`htmlFor` violations Phase 0.5 would flag plus the missing-`aria-describedby` plus the missing-`aria-invalid` issues by construction. Forms using `<Field>` are correctly wired by definition.

**`src/app/components/ui/SubmitButton.tsx`** — submit button with all five Phase 6.6 properties:

1. `type="submit"` by default.
2. `disabled` + `aria-busy="true"` when submitting.
3. Inline spinner inside the button.
4. Label swap (`Save` → `Saving…`) without width jump.
5. Reads `formState.isSubmitting` from RHF context automatically; falls back to a `loading` prop when used outside `FormProvider` (e.g. with Tanstack Query mutations directly).

The "don't disable on form-invalid pre-click" rule is preserved — clicking an invalid form triggers RHF's submit pipeline, surfacing errors. The button only disables once submission is in flight.

**`FORMS_GUIDE.md`** — full inventory of every form in the app and its Phase-6 status. Validation timing rules (Phase 6.2), autocomplete reference table, multi-step pattern documentation. Recommended migration order.

### Companion CSS additions

```
.field-label-req          — the red asterisk on required labels
.field[aria-invalid='true'] — auto-styled error border
.btn-spinner              — inline button spinner with @keyframes
.btn-loading              — loading-state opacity dim
```

Both spinner and skeleton-page pulse respect `prefers-reduced-motion: reduce`.

### Phase 6 status: ~25%

Both PRIMITIVES are in. The MIGRATION work — every form converting to RHF + Zod + `<Field>` + `<SubmitButton>` — is the bulk of Phase 6. Per the inventory in `FORMS_GUIDE.md`, 4 of 12 forms are partly migrated; 8 are still ad-hoc.

| Sub-item | Status |
|---|---|
| `<Field>` primitive with auto-wired aria | ✅ landed |
| `<SubmitButton>` primitive | ✅ landed |
| Zod schemas everywhere | 🟡 partial (3 of 12 forms) |
| Autocomplete audit | ⬜ next round |
| CheckoutPage multi-step refactor | ⬜ next round (largest single piece) |
| Forms section in Storybook | ⬜ next round |
| `htmlFor` count = 0 | 🟡 50→? next round |
| `FORMS_GUIDE.md` documentation | ✅ landed |

---

## Verification matrix — all green

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx eslint src tests functions/src --quiet` | ✅ 0 errors |
| ESLint warnings | 1,194 (unchanged from previous round — Phase 5/6 added components, didn't add inline-style debt) |
| `npx stylelint "src/**/*.css"` | ✅ 0 errors |
| `npx vitest run` | ✅ 142/142 passing |
| `npx vite build` | ✅ ~20s |
| `npm run size` | ✅ 7/7 chunks under budget |
| `npm run tokens:contrast` | ✅ 21/21 pairs pass WCAG AA |

---

## Files added / modified this round

```
NEW
  src/app/components/ui/Field.tsx                # Phase 6.3 form primitive
  src/app/components/ui/SubmitButton.tsx         # Phase 6.6 submit button
  src/lib/useOptimistic.ts                       # Phase 5.3 optimistic mutations
  STATES_GUIDE.md                                # Phase 5 documentation
  FORMS_GUIDE.md                                 # Phase 6 documentation
  PHASE_5_6_IMPLEMENTATION.md                    # this report

MODIFIED (replaced)
  src/app/components/ui/skeleton.tsx             # tiny shadcn shape → namespaced API
  src/app/App.tsx                                # PageLoader uses Skeleton.Page
  src/styles/design.css                          # +sk-* block, +Field/Submit styles
  PHASES_INDEX.md                                # status updates
```

---

## What's next

**Phase 5 — finish (mechanical migration)**:
- Replace each page's ad-hoc `.skeleton` divs with `<Skeleton.*>` shapes.
- Wire cart success+undo / failure+retry+rollback toasts inside `useCartSync`.
- Add inline retry buttons to every error state.
- Build the offline-banner component + detection.

**Phase 6 — finish (form migration)**:
- Migrate ad-hoc forms to RHF + Zod + `<Field>` + `<SubmitButton>` (LoginPage first; AccountPage next).
- Run autocomplete audit on every form.
- Refactor CheckoutPage to multi-step.
- Add Forms section to Storybook.

Both can run in parallel with Phase 3 (still ~30%, ~70% remaining inline-style debt). Phases 7–12 unchanged.
