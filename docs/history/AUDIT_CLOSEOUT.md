# Phase 0-6 Audit Closeout — 2026-05-10

This doc closes out the 8 gap items surfaced by the Phase 0-6 audit. Five items were codebase work and are now fixed; three are infrastructure / one-time CI tasks that need to run during deploy.

---

## Codebase gaps — closed ✅

### Item 1 — `react/forbid-dom-props` flipped to `'error'`

**Phase 3 success gate.** Changed `eslint.config.js`:

```diff
- 'react/forbid-dom-props': ['warn', { … }],
+ 'react/forbid-dom-props': ['error', { … }],
```

Verified by running `npx eslint src tests functions/src` — 0 errors. Any future `style={{}}` on a bare DOM element now fails CI, not just warns.

### Item 2 — SearchBar story

**Phase 2.2 success gate** ("All UI primitives in `src/app/components/ui/` have stories"). Added `SearchBar.stories.tsx` with 6 stories: Default, Small (admin), Loading, WithMaxWidth, WithKeyboardShortcut, SizeMatrix.

### Item 3 — Breadcrumbs on info pages

**Phase 4.2 success gate** ("Breadcrumbs on every non-top-level page"). The info pages (About, Contact, Privacy, Refund, Shipping) all render through `StaticPage.tsx`, so the fix lands in one file. Added `<Breadcrumbs withoutSchema items={[Home, title]} />` above the H1; the JSON-LD copy travels via the existing `<SeoHead breadcrumbs={…}>` prop so structured data and visible UI stay in sync without duplication.

### Item 4 — View Transitions on Navbar + Footer links

**Phase 4.5 success gate** ("View Transitions on route changes; reduced-motion respects").

Created `TransitionLink.tsx` as a drop-in replacement for `react-router`'s `<Link>`. It wraps `navigate(to)` in `navigateWithTransition(...)` so route changes crossfade smoothly. Modifier keys (cmd/ctrl/shift/alt) and middle-click bypass the wrapper, so opening in a new tab still works. Browsers without View Transitions support fall through to a normal navigation — no error, no flash.

Retrofitted both navigation surfaces:
- `Navbar.tsx`: 9 `<Link>` → `<TransitionLink>` (primary nav, brand wordmark, account icon)
- `Footer.tsx`: 7 `<Link>` → `<TransitionLink>` (collections, account links, info links)

Reduced-motion support comes for free — `viewTransition.ts` already short-circuits when `prefers-reduced-motion: reduce` is set.

### Item 5 — Six pattern stories

**Phase 2.3 success gate** ("All 6 pattern stories live"). Added a new Storybook section under `src/app/components/ui/patterns/`:

| Story | File | Variants |
|---|---|---|
| Empty State | `EmptyState.stories.tsx` | 3 (with CTA / with help / with illustration) |
| Loading State | `LoadingState.stories.tsx` | 5 (4 skeleton + spinner button + inline spinner) |
| Error State | `ErrorState.stories.tsx` | 5 (network / validation / permission / 404 / fatal) |
| Forms | `Forms.stories.tsx` | 4 (single-step / multi-step / async validation / autosave) |
| Lists & Tables | `Lists.stories.tsx` | 3 (paginated / infinite scroll / virtualized) |
| Modals | `Modals.stories.tsx` | 5 (confirm / form / info / danger / drawer note) |

The Forms story doubles as the Phase 6.5 "Forms section in Storybook" gate.

---

## Infrastructure items — call-outs for deploy ⚠️

### Item 6 — Dashboard URL + Slack channel (Phase 0)

The codebase wires `src/lib/rum.ts` and `src/lib/sentry.ts`, but the dashboard URL and Slack-alert channel live in your hosting / observability platform. To close this gate fully:
- Confirm Sentry project URL is captured in your deploy docs
- Confirm the Slack channel for INP > 250 ms / P75 / 1-hour alerts exists
- Confirm the route-collapsing regex catches `/tea-profile/:cat/:slug`, `/products/:cat`, `/admin/products/:id`

### Item 7 — Visual baseline PNGs (Phase 3)

Test specs exist at `tests/visual/` but the baseline screenshots themselves aren't committed (gitignored intentionally — they're per-environment). Generate once on first CI run via `npm run test:visual:update`, then commit `__screenshots__/`. After that, drift fails CI.

### Item 8 — Bundle-size baseline (Phase 3)

The Phase 3 gate "Bundle size dropped ≥ 25 KB" needs a snapshot of the pre-Phase 3 chunk sizes to diff against. The size-limit budgets in `.size-limit.json` already gate ongoing PRs, so this is a one-time historical comparison rather than ongoing infrastructure.

---

## Final verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx eslint src tests functions/src` | ✅ 0 errors / 0 warnings |
| `npx stylelint "src/**/*.css"` | ✅ 0 errors |
| `npx vitest run` | ✅ 142/142 passing |
| `npx vite build` | ✅ ~20s |
| `npx size-limit` | ✅ 7/7 budgets met (CSS at 48.98/50 KB) |
| `node scripts/contrast-check.mjs` | ✅ 21/21 pass WCAG AA |

Phases 0-6 are codebase-complete. The three infrastructure items are operational tasks tied to the production deploy, not work the codebase itself can ship.
