# Phases 0–3 — Review Round Implementation Report

Date: 2026-05-09
Scope: clean-up sweep of phases 0–3 before moving to Phase 4. Honest audit of what was missed, focused fixes, no new scope.

---

## Verification matrix — all green

| Gate                                | Command                                          | Result |
|-------------------------------------|--------------------------------------------------|--------|
| TypeScript (src)                    | `npx tsc --noEmit`                               | ✅ 0 errors |
| TypeScript (Cloud Functions)        | `cd functions && npx tsc --noEmit`               | ✅ 0 errors |
| ESLint errors                       | `npx eslint src tests functions/src --quiet`     | ✅ 0 errors |
| Stylelint                           | `npx stylelint "src/**/*.css"`                   | ✅ 0 errors |
| Unit tests                          | `npx vitest run`                                 | ✅ 142 / 142 |
| Production build                    | `npx vite build`                                 | ✅ ~15 s |
| Bundle budgets (size-limit)         | `npx size-limit`                                 | ✅ 7 / 7 under budget |
| Storybook build                     | `npx storybook build`                            | ✅ ~18 s |
| YAML workflows parse (5 files)      | `python3 -c yaml.safe_load`                      | ✅ all 5 valid |

---

## What I caught and fixed

### 1. Real bug — GitHub Actions `if: env.X != ''` never triggered

In `a11y.yml` and `visual-regression.yml`, the auth-bearing test step had:

```yaml
- name: Run a11y tests (auth-bearing)
  if: ${{ env.PLAYWRIGHT_TEST_LOGIN != '' }}      # ← bug: env: at step level
  run: ...
  env:
    PLAYWRIGHT_TEST_LOGIN: ${{ secrets.PLAYWRIGHT_TEST_LOGIN }}
```

Step-level `env:` is applied AFTER the `if:` condition is evaluated, so `env.PLAYWRIGHT_TEST_LOGIN` was always empty when the gate read it. The auth-bearing tests would never have run, regardless of whether the secret was set.

**Fix:** hoisted the env to job level. The gate now actually works:

```yaml
jobs:
  a11y:
    env:
      PLAYWRIGHT_TEST_LOGIN: ${{ secrets.PLAYWRIGHT_TEST_LOGIN }}
      PLAYWRIGHT_BASE_URL:   ${{ secrets.PLAYWRIGHT_BASE_URL }}
    steps:
      - if: ${{ env.PLAYWRIGHT_TEST_LOGIN != '' }}    # ← now resolvable
```

Without this fix, the entire Phase 0.4 auth fixture would have been silently inert in CI.

### 2. Real bug — size-limit PR-comment script used wrong JSON keys

The `actions/github-script` step in `size-limit.yml` referenced `r.running` for the JS-execution time. The actual size-limit JSON uses `loading`, not `running`. The comment would have rendered `${undefined} 60 KB` or similar in the column.

**Fix:** updated to `r.loading` and added a graceful display (`~Xms on 3G`). Also added a budget column by reading `.size-limit.json` directly (size-limit's JSON output doesn't echo configured limits).

### 3. Mid-priority gap — 3 info pages migrated using the `.ip-*` classes

In Phase 3 I built `.ip-*` shared classes specifically for AboutPage, RefundPolicyPage, and ShippingPolicyPage but only migrated PrivacyPolicyPage. Left the multiplier wins on the table.

**Fix:** migrated all three:
- **AboutPage**: 7 → 0 (no new CSS — pure reuse of `.ip-h2`, `.ip-p`, `.ip-meta-tail`, plus a tiny `.ip-h2-section` variant for its slightly different h2)
- **RefundPolicyPage**: 23 → 0 (extended `.ip-*` with `.ip-notice-card` and `.ip-pill`/`.ip-pill-group` for the food-safety notice and sample pills)
- **ShippingPolicyPage**: 17 → 0 (added `.ip-list`, `.ip-luxury-title-lg` variant, `.ip-pickup-address` with a CSS `:hover` replacing the JS `onMouseEnter`/`onMouseLeave` — playbook §step-4 anti-pattern)

Net Phase 3 progress including this round: **1,704 → 1,489 raw inline styles** (−215, −12.6%); **ESLint warnings 1,536 → 1,439** (−97).

### 4. Mid-priority gap — 3 missing tier-1 component stories from Phase 2 §2.2

Phase 2 §2.2 specified 8 tier-1 component stories. I shipped 4 (Button, Input, Card, Skeleton) and missed 4 (Pagination, Toaster, LazyImage, Select). This round adds 3 of the 4:

- **Pagination.stories.tsx** — 7 stories: Basic, WithSizeSelector, FirstPage, LastPage, SinglePage, Empty, LargeDataset. Uses a stateful wrapper since Pagination requires page/setPage state.
- **sonner.stories.tsx** — 5 stories: AllVariants, WithDescription, WithUndo, PromiseFlow, Stacked. Each story mounts `<Toaster />` plus buttons that fire toasts.
- **LazyImage.stories.tsx** — 6 stories: Playground, AspectRatios, Priority, ErrorFallback, ObjectFit, ProductsGrid. Demonstrates layout reservation and the priority/lazy split.

Skipped: **Select** — the existing Select component is shadcn/Radix-wrapped, complex enough to deserve its own dedicated round of design before stories. Not blocking Phase 4.

Storybook now ships **8 story files, ~50 stories total** including the design-tokens reference stories.

### 5. Low-priority gap — no master index doc

Four implementation reports (`PHASE_0`, `PHASE_1_2`, `PHASE_3`, this one) but no entry point pointing at them all. A maintainer six months from now reading the repo wouldn't know where to start.

**Fix:** `PHASES_INDEX.md` — status table for all 12 phases, what landed across 0–3, what needs human action before deploy, and what's next.

### 6. Low-priority gap — TypeScript errors in the new Pagination/LazyImage stories

Storybook's `Meta<typeof Component>` requires `args` at the meta level when the component has required props that aren't optional — even if every story uses a `render` function that ignores them. Caught by `npx tsc --noEmit` after writing the stories.

**Fix:** added meta-level `args` defaults (placeholder values that the render functions ignore, but satisfy the type system). Also fixed an import-path bug in LazyImage.stories that caused four downstream "implicit any" errors.

---

## Files changed (10 in this round)

```
NEW
  PHASE_0_3_REVIEW_IMPLEMENTATION.md            # this file
  PHASES_INDEX.md                                # master index of implementation reports
  src/app/components/ui/Pagination.stories.tsx   # 7 stories (incl. edge cases)
  src/app/components/ui/sonner.stories.tsx       # 5 stories (variants + promise flow)
  src/app/components/LazyImage.stories.tsx       # 6 stories (layout reservation + priority)

MODIFIED
  .github/workflows/a11y.yml                    # env scoping bug fix
  .github/workflows/visual-regression.yml       # env scoping bug fix
  .github/workflows/size-limit.yml              # PR-comment script — correct JSON keys
  src/styles/design.css                         # +98 lines for .ip-* extensions
  src/app/pages/info/AboutPage.tsx              # 7 → 0 inline styles
  src/app/pages/info/RefundPolicyPage.tsx       # 23 → 0 inline styles
  src/app/pages/info/ShippingPolicyPage.tsx     # 17 → 0 inline styles (+ JS hover → CSS :hover)
  PHASE_3_PLAYBOOK.md                           # tracker updated
```

---

## What's still NOT addressed (and why)

These remain genuinely deferred. None blocks Phase 4.

| Item | Why deferred | When it should happen |
|---|---|---|
| Sentry source-map upload via `@sentry/vite-plugin` | Requires Sentry org/project/auth token — out-of-band setup | After Sentry account is provisioned |
| Storybook `Select` story | The component is Radix-wrapped, complex; deserves a dedicated design pass | Phase 2 follow-up sprint |
| The 88 a11y `missing-label` findings from the static scan | They're real WCAG violations but each needs label-association judgment per form | Phase 7 — that's where the `<Field>` primitive consolidates labelling at scale |
| Visual regression baselines re-baseline after Phase 1+3 token additions | Has to run on a real CI environment with the auth fixture provisioned | First CI run after this round merges; documented in `PHASES_INDEX.md` |
| OKLCH palette migration | Forces concurrent visual-regression baseline reset; pairs naturally with finishing Phase 3 | After CartDrawer / TeaProfilePage migrations land |
| CartDrawer / ContactCard / TeaProfilePage migrations | Each is 600–1000+ lines; risky to one-shot | Routine feature work; per-file with the analyzer |

---

## Net state going into Phase 4

| Metric | Round 1 (Phase 0) | Round 2 (Phase 3) | Round 3 (this round) |
|---|---|---|---|
| Raw inline `style={{}}` matches | 1,704 | 1,536 | **1,489** |
| ESLint `react/forbid-dom-props` warnings | 1,536 | 1,482 | **1,439** |
| Files with 0 inline styles | 0 | 1 (PrivacyPolicyPage) | **4** (+ AboutPage, RefundPolicy, ShippingPolicy) |
| Storybook story files | 5 | 5 | **8** |
| Storybook stories total | 31 | 31 | **~50** |
| Implementation reports | 1 | 3 | **5** (added review + index) |
| Real CI bugs | unknown | unknown | **2 found, 2 fixed** |

The two CI bugs (env scoping + size-limit JSON keys) are the kind of things that wouldn't surface until the first time someone actually relied on the auth-bearing tests or read a size-limit PR comment. Catching them now means Phase 4 ships against a CI that actually does what its config claims to do.

---

## Cross-references

- Master index: `PHASES_INDEX.md`
- Roadmap: `UI_UX_ENTERPRISE_ROADMAP.md`
- Phase 0 report: `PHASE_0_IMPLEMENTATION.md`
- Phase 1+2 report: `PHASE_1_2_IMPLEMENTATION.md`
- Phase 3 report: `PHASE_3_IMPLEMENTATION.md`
- Phase 3 playbook (methodology): `PHASE_3_PLAYBOOK.md`
- Inline-style analyzer: `scripts/inline-style-analyzer.mjs`
- Static a11y scan: `scripts/a11y-static-scan.mjs`
