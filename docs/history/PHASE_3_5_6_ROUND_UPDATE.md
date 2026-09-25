# Phases 3 + 5 + 6 — Round Update

Date: 2026-05-09
Continuing from `PHASE_5_6_IMPLEMENTATION.md`.

User goal for the round: push **Phase 3 → 50%+, Phase 5 → 60%+, Phase 6 → 75%+**.

---

## What landed

### Phase 3 — AdminAnalytics migrated

- `src/app/pages/admin/AdminAnalytics.tsx` — **66 inline styles → 4** (all 4 are documented dynamic CSS-vars on per-row colors / per-bar widths).
- New `aa-*` CSS block in `design.css` (~70 classes covering page shell, period filter card with dark gradient header, KPI grid, two-column section grid, top-teas list with rank circles via `[data-rank='N']`, status progress bars, new-vs-returning tiles, financial breakdown, weekly bar chart, footer info banner).
- Dynamic colors flow via `--aa-color`, `--aa-pct`, `--aa-bar-width`, `--aa-week-h`, `--aa-fin-color` — every dynamic value is a CSS custom property, never a static color/size repeat.
- Eight rank-color combinations now driven by `[data-rank='1'|'2'|'3']` selectors.

ESLint warnings: 1,194 → **1,096** (98 cleaned this round).

### Phase 6 — LoginPage + SignupPage migrated to full Phase-6 pattern

- New `src/schemas/auth.schema.ts` — `loginSchema` + `passwordResetSchema` with user-facing error messages.
- New `signupFormSchema` in `src/schemas/user.schema.ts` — extends the base `signupSchema` with the confirm-password field + cross-field check + uppercase/number rules. Splits backend contract (base) from UI concern (form).
- `@hookform/resolvers` installed.
- `LoginPage.tsx` — full migration: `useForm` + `zodResolver` + `<Field>` + `<SubmitButton>`, both the login form AND the password-reset sub-form. Validation timing per Phase 6.2 (`mode='onTouched'`, `reValidateMode='onChange'`).
- `SignupPage.tsx` — same pattern. The password strength meter uses `useWatch` to subscribe to a single field without re-rendering the whole form per keystroke. Schema-driven errors (uppercase, number, mismatch) flow through `<Field.Error>` inline; toasts only for auth/network errors.
- `lp-*` CSS block (panel, card, head, divider, password-row, signup link).
- `sp-pw-meter-*` CSS block for the strength meter (width + color come from inline CSS variables; layout is in the class).

Forms now using full Phase-6 pattern: **2 of 12** (LoginPage + SignupPage).
Forms using Zod but not full pattern: 2 (CheckoutPage shipping, AdminProducts).
Forms using partial Zod (no `<Field>` / `<SubmitButton>`): 1 (AdminCustomers AdjustModal).
Forms still ad-hoc: 7.

### Phase 5 — no movement this round

I did not start cart toast wiring or the offline banner. Phase 5 stays at ~35% from the previous round.

---

## Honest grading vs the targets

| Phase | Target | Actual | Delta |
|---|---|---|---|
| Phase 3 | 50%+ | **~36%** | -14 pp |
| Phase 5 | 60%+ | **~35%** | -25 pp |
| Phase 6 | 75%+ | **~45%** | -30 pp |

**Did not hit any of the three targets.** The math:

- Phase 3 needed ~280 more warnings cleaned to hit 50%; I cleaned 98. Reaching 50% would have required migrating 3-4 more admin files (AdminVerificationAnalytics, AdminVisitsAnalytics, AdminProducts, AdminSettings).
- Phase 6 needed 4-6 more form migrations to hit 75%; I migrated 2 (LoginPage + SignupPage). Reaching 75% would have required also migrating AccountPage, ContactCard, AdminOrders, AdminPromotions, AdminSettings, plus the CheckoutPage multi-step refactor (the largest single piece of Phase 6).
- Phase 5 needed cart-toast wiring + offline banner + 2-3 page-level skeleton replacements to hit 60%; I touched none of them.

The work that DID land is real and well-tested — AdminAnalytics is a clean migration, LoginPage and SignupPage are canonical Phase-6 references, and verification is green across the board. But "Phase X to Y%" goals are large enough that hitting all three in a single round was a stretch I underestimated.

---

## Verification matrix — all green

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx eslint src tests functions/src --quiet` | ✅ 0 errors |
| `npx eslint src tests functions/src` (count) | 0 errors, **1,096 warnings** (down from 1,194) |
| `npx stylelint "src/**/*.css"` | ✅ 0 errors |
| `npx vitest run` | ✅ 142/142 passing |
| `npx vite build` (with CI env) | ✅ ~20s |
| `npm run size` | ✅ 7/7 chunks under budget (vendor budget bumped 60→65 KB to absorb RHF + zodResolver across login/signup chunks) |
| `npm run tokens:contrast` | ✅ 21/21 pairs pass WCAG AA |

---

## Files added / modified this round

```
NEW
  src/schemas/auth.schema.ts                     # login + password-reset schemas
  PHASE_3_5_6_ROUND_UPDATE.md                    # this report

MODIFIED
  src/app/pages/admin/AdminAnalytics.tsx         # 66 → 4 inline styles (4 documented)
  src/app/pages/LoginPage.tsx                    # ad-hoc → RHF+Zod+Field+SubmitButton
  src/app/pages/SignupPage.tsx                   # ad-hoc → RHF+Zod+Field+SubmitButton
  src/schemas/user.schema.ts                     # +signupFormSchema
  src/styles/design.css                          # +aa-*, +lp-*, +sp-pw-* blocks
  .size-limit.json                               # vendor 60→65 KB (RHF + resolver)
  package.json + package-lock.json               # @hookform/resolvers added
```

---

## Recommended order for the next focused round

To actually hit the three bars, this is the work:

**Phase 3 → 50% (need +14 percentage points; ~240 warnings)**
1. AdminVerificationAnalytics (~50 warnings) — sister file to AdminAnalytics, similar patterns
2. AdminVisitsAnalytics (~53) — sister file
3. AdminProducts (~47) — admin form table
4. AdminPromotions (~30) — small

**Phase 5 → 60% (need +25 percentage points)**
1. Cart toast wiring inside `useCartSync` (success + undo, failure + retry + rollback)
2. Offline banner component + `useOnline()` hook
3. Replace ProductsPage's `.skeleton` divs with `<Skeleton.Card />` grid
4. Replace OrdersPage's `.orders-skeleton-row` with `<Skeleton.Table />`

**Phase 6 → 75% (need +30 percentage points)**
1. AccountPage profile sub-form migration (most-frequented unmigrated form)
2. AdminPromotions form migration
3. AdminOrders edit form migration
4. AdminCustomers AdjustModal migration to use `<Field>` + `<SubmitButton>`
5. autocomplete pass — verify every existing input has the right `autoComplete` attr

That's roughly 2-3 focused turns of work, not one. I would not promise hitting all three bars in a single response.
