# Ele Café — Phase 0-6 Audit & Roadmap Extension (Phases 13-18)

> Companion document to `0-12.md`. Two things in one file: (1) an evidence-based audit of what shipped versus what each phase's success gate required, and (2) six new phases (13-18) that take the product from "phase-12 complete" to genuinely enterprise-grade.
>
> **Author:** Claude · **Date:** 2026-05-10 · **Verified against:** the actual repo at upload time, not the implementation reports.

---

## Table of contents

1. [TL;DR](#1-tldr)
2. [How this audit was run](#2-how-this-audit-was-run)
3. [Phase 0 audit — Telemetry & Baselines](#3-phase-0-audit)
4. [Phase 1 audit — Design Tokens v3](#4-phase-1-audit)
5. [Phase 2 audit — Storybook + Chromatic](#5-phase-2-audit)
6. [Phase 3 audit — Inline-Style Migration](#6-phase-3-audit)
7. [Phase 4 audit — IA & Navigation](#7-phase-4-audit)
8. [Phase 5 audit — States Library](#8-phase-5-audit)
9. [Phase 6 audit — Forms & Validation](#9-phase-6-audit)
10. [App performance — measured](#10-app-performance--measured)
11. [Cross-cutting findings](#11-cross-cutting-findings)
12. [Closing the Phase 0-6 gap — concrete to-do list](#12-closing-the-phase-0-6-gap)
13. [Why 12 phases isn't enough](#13-why-12-phases-isnt-enough)
14. [Phase 13 — Internationalization & localization at scale](#14-phase-13--i18n-l10n-at-scale)
15. [Phase 14 — Security, privacy, and compliance posture](#15-phase-14--security-privacy-compliance)
16. [Phase 15 — Resilience, offline, and degraded-mode UX](#16-phase-15--resilience-offline-degraded-mode)
17. [Phase 16 — Search, discovery, and merchandising](#17-phase-16--search-discovery-merchandising)
18. [Phase 17 — Admin / operator excellence](#18-phase-17--admin-operator-excellence)
19. [Phase 18 — Trust, social proof, and conversion UX](#19-phase-18--trust-social-proof-conversion)
20. [Revised KPIs & "definition of enterprise"](#20-revised-kpis--definition-of-enterprise)
21. [Appendix — files touched / inspected](#21-appendix--files-touched--inspected)

---

## 1. TL;DR

| Phase | Doc claims | Verified status | Honest grade |
|---|---|---|---|
| 0 — Telemetry | ✅ code-complete | ✅ code wired (RUM, Sentry, size-limit, auth fixture, a11y CI). **3 external infra items still pending** (Sentry DSN, test-project ALLOW_TEST_LOGIN, Playwright test users) and **a11y baseline never green** (82 likely violations in static scan, dominated by 75 missing-label findings). | **B+** — ships great when infra is plugged in |
| 1 — Tokens v3 | ✅ landed | ✅ all seven token tiers present (OKLCH base, motion, elevation, density, fluid type, state surfaces, viz palettes). Contrast check passes 21/21 WCAG AA. Tokens.json exporter runs. | **A** |
| 2 — Storybook | ✅ landed | ✅ Storybook 8 builds; 18 story files covering 11 UI primitives + 6 pattern stories + a design-tokens overview; Chromatic workflow committed. | **A** |
| 3 — Inline-style migration | ✅ 100% | ✅ **51 inline styles remain**, well under the <100 success-gate target, and 27 of them are truly-dynamic (legitimate). ESLint rule flipped to `'error'`. **One unverifiable claim**: the "≥25 KB gzipped" bundle drop never had a pre-Phase-3 baseline captured, so the savings exist but aren't auditable. | **A-** |
| 4 — IA & navigation | ✅ landed | ✅ IA map, breadcrumbs on 7 page surfaces, `cmdk` command palette, `TransitionLink` wrapping Navbar + Footer, `prefetchRoute.ts` shipped. | **A** |
| 5 — States library | ✅ 100% | ✅ Skeleton primitive with 5 named slots; `useOptimisticMutation`; 6 pattern stories covering empty / loading / error / forms / lists / modals; STATES_GUIDE.md documents the taxonomy. | **A** |
| 6 — Forms | ✅ 100% | ⚠ Three real holes: (1) **CheckoutPage does NOT actually use react-hook-form** despite FORMS_GUIDE.md claiming it does — it uses `useState` + imperative Zod validation. Multi-step structure IS in place. (2) Gift builder Step 3 documented as exempt — defensible. (3) `vite.config.ts` still carries a stale comment saying "react-hook-form has no runtime importers" — the chunking rule for `react-hook-form` is missing and it lands in the `vendor` chunk. | **B** |

**Lint / build / typecheck / tests are all green** (0 ESLint errors, 0 stylelint errors, 0 TS errors, 142/142 vitest, build succeeds in ~15 s, size-limit 7/7 within budget).

**What this means in plain terms:** the codebase is in a state most production apps never reach. The bones are right. The remaining work in phases 0-6 is (a) running the a11y suite live and fixing what falls out, (b) finishing the CheckoutPage RHF migration, and (c) doing the three deploy-side infra hookups that no codebase change can do. Then the gating constraints for the product becoming *enterprise-grade* shift to **areas the 12-phase plan doesn't cover at all** — security & privacy posture, i18n at scale, operator-grade admin UX, resilience under degraded networks, and discovery / search / merchandising. Those are the next six phases below.

---

## 2. How this audit was run

The audit ran the project's own verification commands and looked at the actual source code rather than trusting the per-phase implementation reports (which a few times contradict the code). Every verification step is reproducible — the commands are listed and the actual output was captured.

| Check | Command | Result |
|---|---|---|
| TypeScript (app) | `npx tsc --noEmit` | ✅ 0 errors |
| ESLint | `npx eslint src tests functions/src --quiet` | ✅ 0 errors |
| Stylelint | `npx stylelint "src/**/*.css"` | ✅ 0 errors |
| Unit tests | `npx vitest run` | ✅ 142 / 142 passing in 3.4 s |
| Production build | `npx vite build` | ✅ 15.5 s, PWA generated |
| Bundle budgets | `npx size-limit` | ✅ 7/7 within budget |
| Contrast tokens | `node scripts/contrast-check.mjs` | ✅ 21/21 pass WCAG AA |
| Token export | `node scripts/tokens-export.mjs` | ✅ writes `design/tokens.json` |
| Storybook build | `npx storybook build` | ✅ 36 s, output ready |
| Static a11y scan | `node scripts/a11y-static-scan.mjs` | ⚠ **82 likely violations** flagged (75 missing-label dominated) |
| Inline-style analyzer | `node scripts/inline-style-analyzer.mjs` | ✅ 51 instances remaining across 26 files |

The Playwright suites (visual regression, a11y, SEO) and Lighthouse CI cannot run in this audit environment (they need a real Firebase project and Chromium with system deps). Their *configurations* were inspected; their *executions* are the next step on a real CI environment.

---

## 3. Phase 0 audit

### 3.1 Success-gate checklist

| Gate | Status | Evidence |
|---|---|---|
| RUM live, dashboard URL exists | 🟡 code-complete; URL pending | `src/lib/rum.ts` wires `web-vitals` → `/api/rum`. Dashboard is a deploy task. |
| Slack alert when P75 INP > 250 ms on `/checkout` | 🟡 deploy task | Logic depends on the dashboard the Cloud Function feeds. |
| Sentry: errors reach dashboard within 30 s | 🟡 needs `VITE_SENTRY_DSN` | `src/lib/sentry.ts` initializes only when the env var is present. |
| Source maps resolve to TSX | 🟡 needs DSN + upload step | Source-map upload step in Vite is wired; needs DSN to fire. |
| Replay strips PII | ✅ `maskAllInputs: true` in `initSentry()` | Confirmed in `src/lib/sentry.ts`. |
| Bundle CI fails on deliberate regression | ✅ workflow `.github/workflows/size-limit.yml` present | Budgets in `.size-limit.json` are tight (CSS at 48.98 / 50 KB cap). |
| 28 → ~80 baselines (admin + protected covered) | ✅ test specs exist | `tests/visual/admin/`, `tests/visual/protected/`, `tests/a11y/admin/`, `tests/a11y/protected/`. **Actual baseline PNGs are not committed** — they generate on first CI run, which is the right call (PNGs are per-OS). |
| `tests/.auth/*.json` gitignored, CI generates | ✅ confirmed | `.gitignore` covers; `playwright.setup.ts` mints custom tokens. |
| `setAdminRole` triple-gated | ✅ confirmed | env gate documented in `playwright.setup.ts` comments + Cloud Function. |
| A11y baseline green on every route × theme | ❌ **not yet** | Static pre-flight reports 82 likely violations. The live axe suite has not been run end-to-end with all violations zeroed. |
| Branch protection requires a11y | 🟡 workflow exists | `.github/workflows/a11y.yml` wired; making it required is a GitHub-side setting. |
| Lighthouse CI thresholds tight (perf ≥ 0.92) | ✅ `lighthouserc.json` configured | The assert block exists; needs a perf run to verify it actually trips on regressions. |

### 3.2 What's missing in Phase 0

1. **The a11y baseline has never gone green.** This is the single most important Phase-0 gap because every later phase compounds on a stable baseline. The static scan output (75 missing-label findings, 4 non-interactive-onclick, 2 img-missing-alt, 1 placeholder-anchor) is mostly noise — Field.tsx false positives, sub-components that *do* have labels via parent context — but the live axe pass needs to be run, every real violation fixed, and the suite committed to green.
2. **No RUM data has been observed yet.** Without one real night of beacons in Firestore, Phase 8 has no baseline to measure against.
3. **No Sentry events have been observed yet.** Same risk: errors that already exist in prod are invisible.
4. **Pre-Phase-3 bundle baseline never captured** (called out in `AUDIT_CLOSEOUT.md` item 8). The "≥25 KB drop" gate in Phase 3 is therefore unverifiable historically; size-limit budgets gate the future, which is fine going forward but means we can't celebrate what shipped.

### 3.3 Recommendation

Do the three external hookups (Sentry DSN, test-project ALLOW_TEST_LOGIN, test-user provisioning) in a single 2-hour deploy session. Then run `npm run test:a11y` against the staging build, take the failure list, fix in source, commit, repeat until green. Then turn on branch protection. Total elapsed: ~half a day, but the unblock value is enormous.

---

## 4. Phase 1 audit

### 4.1 Success-gate checklist

| Gate | Status | Evidence |
|---|---|---|
| OKLCH base palette with sRGB fallback | ✅ | `src/styles/tokens.css` lines 24-95: every `--_ink-*` / `--_cream-*` / `--_gold-*` declared twice (hex then oklch). |
| Motion tokens (durations + easings) | ✅ | `--dur-instant` → `--dur-xslow`, `--ease-standard/decelerate/spring/bounce/...` |
| Elevation tokens (3-4 tiers, theme-aware) | ✅ | `--elev-1` → `--elev-4` + `--elev-inset`, dark-mode overrides present. |
| Density tokens | ✅ | `--row-h` (44 px default) + `--row-h-md` (40) + `--row-h-sm` (32). |
| Fluid type | ✅ | `--type-xs` → `--type-5xl`, all `clamp()` based. |
| Semantic state tokens (bg + fg + border) | ✅ | `--success-bg`, `--success-border`, `--warning-bg`, `--warning-border`, `--danger-bg`, `--danger-border`, `--info-bg`, `--info-border`. |
| Data-viz palette (sequential / divergent / qualitative) | ✅ | `--viz-seq-1..7`, `--viz-div-neg-3..pos-3`, `--viz-qual-1..8`. Dark-mode variants too. |
| Contrast script in CI | ✅ | `scripts/contrast-check.mjs` + `.github/workflows/contrast.yml`; 21/21 pass AA. |
| Tokens.json exported, Figma sync ready | ✅ | `scripts/tokens-export.mjs` writes `design/tokens.json`. |

### 4.2 Quality observations

- **One state token tier is missing: solid foregrounds for "on-color" pairings.** `--on-success-solid`, `--on-warning-solid`, etc. existed in the contrast script's input but aren't all declared in `tokens.css`. The contrast check passes because the ratios it checks are right; the structural completeness is uneven. **Effort:** S. Add 4 declarations.
- **Reduced-motion override of the motion tokens is not in `tokens.css`.** The Phase 1 spec said to retarget `--dur-*` to `1ms` inside `@media (prefers-reduced-motion: reduce)`. A search in `tokens.css` confirms the override is missing — meaning components that hardcode `var(--dur-normal)` in CSS transitions still animate for RM users. Some components add their own RM guards in `design.css`, which is the per-component fix, but the token-level retarget (the cleaner pattern) is absent. **Effort:** S.
- **Density tokens not wired anywhere.** `[data-density="dense"]` selector exists in `design.css`, but no rendered surface sets the attribute (admin pages should). **Effort:** S–M (one attribute on `<AdminLayout>` root, then audit which admin rules should consume the dense variables).

### 4.3 Grade: A

The tokens work is genuinely excellent. The three observations above are polish, not failures.

---

## 5. Phase 2 audit

### 5.1 Success-gate checklist

| Gate | Status | Evidence |
|---|---|---|
| Storybook deploys to preview URL | 🟡 builds locally; preview URL is a Chromatic / Vercel deploy task | `npx storybook build` succeeds in 36 s. |
| All UI primitives in `src/app/components/ui/` have stories | ✅ | 11 primitives, 11 stories (Button, Card, Input, Select, Skeleton, Sonner, Pagination, SearchBar, StaleIndicator, SubmitButton, Field). |
| All 6 pattern stories live | ✅ | Empty, Loading, Error, Forms, Lists, Modals — all under `src/app/components/ui/patterns/`. |
| Chromatic runs on every PR | ✅ workflow committed | `.github/workflows/chromatic.yml` exists. Needs `CHROMATIC_PROJECT_TOKEN` secret to actually publish. |
| A11y panel green on every story | 🟡 panel runs locally; CI-green requires a live Chromatic build with the a11y addon set strict | Addon is installed; not gated. |

### 5.2 Quality observations

- **Pattern stories use inline styles intentionally** (and are correctly exempted from `react/forbid-dom-props` in `eslint.config.js`). Stories need ad-hoc layout the design system shouldn't ship; the exemption is right.
- **Design-tokens story exists** (`design-tokens.stories.tsx`) — this is the documentation surface that lets designers see every CSS variable in one place. Underrated win.
- **No "patterns/Toaster" story** even though Sonner is in the project. There IS `sonner.stories.tsx` (the primitive story) but no pattern-level "when to use success vs error vs action vs undo." **Effort:** S.

### 5.3 Grade: A

---

## 6. Phase 3 audit

### 6.1 Success-gate checklist

| Gate | Status | Evidence |
|---|---|---|
| `grep -rn "style={{" src/` returns < 100 | ✅ | 51 instances across 26 non-storybook files (verified via `inline-style-analyzer.mjs`). |
| `react/forbid-dom-props` flipped to `'error'` | ✅ | `eslint.config.js` line 152. |
| All 80 visual baselines pass | 🟡 specs exist; PNGs generate on first CI run | `tests/visual/admin/` + `tests/visual/protected/` cover the 14 protected/admin routes. |
| Bundle size dropped ≥ 25 KB gzipped | ❌ **unverifiable** | Pre-Phase-3 baseline never captured (`AUDIT_CLOSEOUT.md` item 8 admits this). |

### 6.2 Quality observations

- **The 51 remaining inline styles are healthy.** 27 are truly-dynamic (CSS custom properties for runtime values like progress bar widths, viewTransitionName per item ID, calculated bar heights). 10 are mixed-static (where a `var()` is mixed with a dynamic value — also legitimate). 14 are "parse-failed" (the analyzer couldn't decide — those should be hand-reviewed; many are likely fine but a sweep would close the audit cleanly).
- **CSS bundle is at 48.98 KB gzipped against a 50 KB cap.** That's a 2 KB headroom on a budget that grew from migration. The risk: any new feature CSS pushes over, and the gate fires. Either (a) raise the cap to 60 KB and let the migration breathe, or (b) audit `design.css` (14,448 lines now) for dead rules — components that were deleted but whose `.cpp-*` / `.cd-*` blocks remain.
- **`design.css` at 14,448 lines is itself a smell.** It started as a single source of truth for the design system; it became the dumping ground for every per-component class block emitted by the codemod. **Recommendation:** split into `tokens.css` (already separate) + `base.css` (resets, html / body, focus) + `utilities.css` (the `u-*` utility classes) + `components.css` (per-component blocks). Keep `index.css` as the entry barrel. **Effort:** M. Caught at refactor time, the bundle gets meaningfully smaller because CSS code-splitting can finally split it.

### 6.3 Grade: A-

Real and substantial work landed. The unverifiable bundle-drop claim is the only blemish.

---

## 7. Phase 4 audit

### 7.1 Success-gate checklist

| Gate | Status | Evidence |
|---|---|---|
| IA map exists | ✅ | `IA_MAP.md` (7 KB, navigation tree audited). |
| Breadcrumbs on every non-top-level customer page | ✅ | `Breadcrumbs` rendered in `TeaProfilePage`, `OrdersPage`, `AccountPage`, `ProductsPage`, `ComboPairingPage`, `StaticPage` (info), and `AdminLayout`. |
| Schema.org BreadcrumbList JSON-LD on the same pages | ✅ | `SeoHead` accepts a `breadcrumbs` prop and emits the JSON-LD. |
| Command palette (cmd+K) live | ✅ | `src/app/components/CommandPalette.tsx`; uses `cmdk`; includes live Firestore tea search and admin group gating. |
| Route prefetch | ✅ | `src/lib/prefetchRoute.ts` wired into Navbar links. |
| View Transitions on route changes | ✅ | `TransitionLink.tsx` wraps `navigate()` in `navigateWithTransition()`; Navbar (9 links) + Footer (7 links) retrofitted; reduced-motion short-circuits. |

### 7.2 Quality observations

- **Modifier-key bypass in TransitionLink is correct** — cmd/ctrl/shift/alt and middle-click fall through to regular navigation so "open in new tab" still works.
- **Breadcrumbs use the same `Breadcrumbs` primitive across customer and admin.** Density variant for admin would be a nice 1-hour win — admin rows are tighter; breadcrumbs should be too.

### 7.3 Grade: A

---

## 8. Phase 5 audit

### 8.1 Success-gate checklist

| Gate | Status | Evidence |
|---|---|---|
| Skeleton primitive with named slots | ✅ | `<Skeleton>`, `<Skeleton.Line>`, `<Skeleton.Avatar>`, `<Skeleton.Card>`, `<Skeleton.Table>`, `<Skeleton.Page>`. |
| Used in customer + admin pages | ✅ | 10 of 12 customer pages + 4 admin pages reference `Skeleton` or `skeleton`. |
| Optimistic-UI hook | ✅ | `src/lib/useOptimistic.ts` exports `useOptimisticMutation`. |
| 6 pattern stories | ✅ | Same six as Phase 2: empty, loading, error, forms, lists, modals. |
| States guide doc | ✅ | `STATES_GUIDE.md` (10 KB), enumerates the 12 states. |

### 8.2 Quality observations

- **Reduced-motion path documented but not auto-tested.** The skeleton shimmer respects `prefers-reduced-motion: reduce` per `design.css` section 23. There's no Playwright test that flips the media query and asserts the skeleton goes static — a worthwhile addition.
- **The "Offline" state is documented in the taxonomy but not actually implemented.** No `/offline.html` page; no service-worker offline page fallback; no `aria-live` "you are offline" banner. The PWA registers a service worker but the offline experience is whatever Workbox does by default (which on a NetworkFirst route is "fail silently"). **Phase 15 below covers this.**

### 8.3 Grade: A

---

## 9. Phase 6 audit

### 9.1 Success-gate checklist

| Gate | Status | Evidence |
|---|---|---|
| Every form uses RHF + Zod with shared schemas | ⚠ **9 of 12** | LoginPage ✅, SignupPage ✅, AccountPage ✅, AdminCustomers ✅, AdminOrders ✅, AdminProducts ✅, AdminPromotions ✅, AdminSettings ✅ (partial). **CheckoutPage ❌ uses plain `useState` + imperative `validateShippingAddress(zod).safeParse()` on submit.** Gift builder Step 3 documented as exempt (Zustand-backed wizard). |
| `<Field>` primitive used for every input; htmlFor count = 0 | ⚠ **almost** | Field primitive is used widely. CheckoutPage uses a *file-local* `Field` that does htmlFor injection but isn't the shared primitive — function works, consistency does not. Static a11y scan still flags 75 missing-label findings, most are false positives but should be reviewed live. |
| `autocomplete` audited and applied | ✅ | Login (`email` / `current-password`), Signup (`new-password`), AccountPage (address fields with `address-line1`, `address-level1`, `postal-code`, `country`, `tel`), Checkout (`shipping-address-*` style). |
| CheckoutPage refactored to multi-step | ✅ | `type Step = 'delivery' \| 'payment' \| 'review' \| 'placed'`; URL hash persistence (`#delivery` / `#payment` / `#review`); back/forward integration. |
| Forms section in Storybook with live examples | ✅ | `Field.stories.tsx`, `SubmitButton.stories.tsx`, `patterns/Forms.stories.tsx` (single-step, multi-step, async validation, autosave). |

### 9.2 The CheckoutPage inconsistency, in detail

`src/app/pages/CheckoutPage.tsx` is 1,329 lines. It includes:
- A file-local `Field` component (lines 108-131) that does `cloneElement` injection of `id` / `name` / `autoComplete` to wire up `<label htmlFor>` correctly.
- A single `useState({ name, email, phone, address, city, province, postalCode, country, notes })` form state object.
- Imperative validation at submit time: `validateShippingAddress(shipping)` is a Zod-backed `safeParse` call; on failure, a toast surfaces the first issue.

This is *good code*. It works. It's a11y-correct. It validates. **But it doesn't match the Phase-6 contract**, which calls for `useForm({ mode: 'onTouched', reValidateMode: 'onChange' })` + the shared `<Field>` primitive + `<SubmitButton>`. The user-facing consequences:

- **No field-level error rendering.** Errors surface as toasts ("Phone is invalid"), not inline below the offending field — Baymard's e-commerce checkout research consistently shows inline errors outperform toast errors on error-recovery time (typically 30-40% faster correction).
- **No touched-state tracking.** A user who hasn't touched the city field still sees zero feedback that it's required; they only learn at submit.
- **No async validation hook.** Promo-code validity could be async-checked (debounced) while typing; the current path makes them click "Apply" to find out.
- **The file-local Field wrapper duplicates the shared one's behavior** — every future change has to be made twice (or one of them drifts).

**This is the single highest-value Phase-6 fix remaining.** It's not blocking deploy, but it's the kind of polish that distinguishes "good checkout" from "best-in-class checkout."

### 9.3 Two smaller Phase-6 holes

- **`vite.config.ts` has a stale comment** (lines 287-292) claiming "react-hook-form has no runtime importers." Since RHF is now used in 8 pages, this is wrong. The `manualChunks` rule for the `schemas` chunk does NOT include `react-hook-form`, so RHF is currently bundled with `vendor` instead. Net effect: small inefficiency (RHF lands eagerly even on pages that don't need it). Fix is one line: add `id.includes('node_modules/react-hook-form') return 'schemas';` to the manualChunks function, and remove the stale comment.
- **No form gets `aria-busy` on its container while submitting.** `<SubmitButton>` sets it on the button (good), but a slow submit doesn't announce to screen readers that the *form region* is busy. Pattern: wrap the form in a `<div aria-busy={isSubmitting}>` or set it on the `<form>` itself.

### 9.4 Grade: B

The fundamentals are right. CheckoutPage is the one place where the documentation overstates what shipped, and the cleanup is real work — about a day to convert CheckoutPage to RHF + the shared `<Field>` + inline errors + async promo validation.

---

## 10. App performance — measured

The full bundle inventory (from the actual `npx vite build` run during this audit):

### 10.1 Initial-load JS bundles (gzipped, what every user downloads)

| Chunk | Size | Notes |
|---|---|---|
| react-core | 73.61 KB | React 19 + ReactDOM + scheduler + react-router. Limit 85, headroom 11. |
| firebase-firestore | 55.67 KB | Largest single firebase chunk. Lazy-loadable; the core flow doesn't need it on `/`. |
| vendor | 61.55 KB | Limit 65, headroom 3. **Tight.** Adding any heavy lib (e.g. a charting lib outside admin) will trip the budget. |
| index (app entry) | 36.27 KB | Limit 60, headroom 24. Healthy. |
| firebase-core | 29.77 KB | App + auth init. |
| firebase-auth | 23.57 KB | Lazy on Login / Signup / Auth state checks. |
| schemas (zod) | 18.70 KB | Eager because schemas are imported from Firestore read paths. |
| radix-ui | 15.57 KB | Select primitive. |
| icons (lucide) | 7.83 KB | Limit 10, healthy. |
| data-layer | 5.50 KB | tanstack-query + zustand + immer. Limit 30, easily fits. |
| firebase-functions | 3.28 KB | Tiny. |
| **css (single sheet)** | **48.98 KB** | **Limit 50, only 1.02 KB headroom.** This is the most fragile budget. |

**Critical-path total** (everything needed for first paint on a cold cache, assuming lazy-loaded routes haven't fired yet): roughly react-core + index + firebase-core + firebase-auth + schemas + vendor + radix-ui + icons + data-layer + css ≈ **331 KB gzipped**.

### 10.2 Lazy chunks (per-route, only loaded when visited)

Top 10 largest lazy chunks:

| Page | Gzipped | Largest contributor |
|---|---|---|
| AdminSettings | 12.67 KB | 5 sub-forms, heavy admin UI |
| GiftsPage | 10.71 KB | Stepper + 4 steps + occasion picker + preview |
| AdminProducts | 9.35 KB | Modal-based editor (large form state) |
| AdminOrders | 7.66 KB | Inline edit table + line-items array form |
| CheckoutPage | 7.77 KB | The 1,329-line file. RHF migration may grow this slightly. |
| TeaProfilePage | 7.38 KB | Brewing schedule + reviews + related |
| mockProducts | 8.40 KB | Static seed data — should be load-on-demand from Firestore in prod, not bundled |
| ProductsPage | 5.72 KB | Grid + filter sidebar |
| AdminAnalytics | 3.91 KB | Charts unavailable in this build (no chart lib loaded — `charts` chunk is 0 KB) |

**Observation:** the `charts` manual-chunks rule in `vite.config.ts` matches `recharts` / `d3-` / `victory-vendor`, but **none of those libraries are in `package.json`**. The chunk rule fires zero times. AdminAnalytics currently draws charts manually with CSS bar widths (a sensible early choice). The moment a real chart lib lands, that chunk will exist and the rule is ready.

**Observation:** `mockProducts-CY6I9L9Y.js` is **8.4 KB gzipped (44 KB raw)** of seed data shipped to every user who visits any product page. This is dev seed data that should not be in the production bundle. Behind a `import.meta.env.DEV` gate it gets tree-shaken. Easy ~8 KB win.

### 10.3 Other measured perf signals

| Signal | Value | Notes |
|---|---|---|
| Build time | 15.5 s | Healthy. |
| Storybook build time | 36 s | Healthy. |
| Vitest run | 3.4 s, 142 tests | Fast. |
| Service worker | Generated | Workbox precache of 93 entries, 2.1 MiB total. |
| Async-CSS plugin | Wired | The main stylesheet is rewritten to `<link rel="preload" as="style" onload="...">` so it doesn't render-block. Critical CSS inlined in `index.html`. |
| Image strategy | LazyImage with priority + blurhash + fetchPriority | Present and correct. |
| Font subsetting | Latin + Latin-Ext only | Correctly avoids cyrillic/vietnamese. 8 imports (4 cormorant weights + 4 jost weights). |

### 10.4 What's NOT measured yet

- **Real-user Web Vitals.** Not a single P75 LCP / INP / CLS data point exists because RUM hasn't been deployed.
- **Lighthouse Performance score on a real route.** `lighthouserc.json` asserts ≥ 0.92 perf, but the suite hasn't been run against a deployed build during this audit.
- **Bundle drift over time.** Size-limit gates current PRs but the historical curve isn't recorded — a 1 KB/week growth is invisible until the cap blows.

### 10.5 Quick perf wins

1. **Gate `mockProducts` behind `import.meta.env.DEV`** → ~8 KB lazy chunk savings.
2. **Add `react-hook-form` to the `schemas` chunk** → small re-shuffle, keeps vendor leaner.
3. **Audit `design.css` for dead rules** post Phase 3 migration → likely 5-10 KB CSS savings, plus headroom for the bundle budget.
4. **Lazy-load `firebase-firestore`** on the home page (it's not needed for the hero / collections section, only when a tea card needs live data) → ~55 KB pulled off the critical path.

---

## 11. Cross-cutting findings

These don't belong to one phase — they're patterns visible across the whole codebase.

### 11.1 Documentation sprawl

The repo root contains **22 PHASE_*.md / AUDIT_*.md files**. They're invaluable as history but cluttering as discovery. A reader landing on the repo can't tell which doc is current. **Recommendation:** move all per-pass implementation reports into `docs/history/` and keep only the roadmap (`0-12.md`), this audit, the active guides (FORMS_GUIDE, STATES_GUIDE), and the README at root. Effort: 10 minutes.

### 11.2 Three large pages still in single-file form

| File | LOC | Phase plan said |
|---|---|---|
| `AdminSettings.tsx` | 1371 | "Phase 6 — split by tab — 5 sub-files" |
| `AdminProducts.tsx` | 1195 | "Phase 6 — extract ProductEditModal" |
| `CheckoutPage.tsx` | 1329 | "Phase 6 — split into multi-step pages" |
| `AdminOrders.tsx` | 1078 | "Phase 6 — extract OrderEditModal" |
| `TeaProfilePage.tsx` | 1018 | "Phase 5 — split: header, brewing, reviews, related" |

Multi-step was implemented in CheckoutPage; the file is still one file. The split-by-tab/extract-modal refactors haven't happened. **Risk:** these files are testable in isolation only with mocking gymnastics. **Recommendation:** schedule a "structural refactor week" — even a single page per day → after a 5-day sprint, every >1000 LOC file is broken down. The plan didn't gate Phase 6 success on this, but it should have.

### 11.3 The CSS file is the new dumping ground

`design.css` grew to 14,448 lines during Phase 3. That's not inherently bad — moving inline styles to CSS classes was the goal — but it's untidy. The file lacks a TOC, lacks the section markers that `tokens.css` has, and the `cpp-*` / `cd-*` / `cw-*` block naming convention is opaque to anyone who didn't watch the migration. **Recommendation:** split into purpose-named files (per §6.2 above) and add a TOC at the top of each. Effort: M. **Side effect:** Vite's CSS code-splitting can then actually split, which will move CSS off the critical path of pages that don't need particular blocks.

### 11.4 i18n exists but is shallow

`src/i18n/translations.ts` has 193 entries (only English ↔ French). Many user-visible strings in the codebase are not registered with `useT()` — a grep shows 8 files use the hook out of dozens that render copy. This is **not** a Phase 0-6 gate failure (i18n isn't part of any phase), but at "enterprise scale" the gap matters. **Phase 13 below.**

### 11.5 Test coverage is good for units but absent for components and pages

- **Unit tests (vitest):** 142 passing across schemas, libs, hooks, stores, notifications.
- **Visual regression (Playwright):** specs exist; baselines not committed; needs first CI run.
- **A11y (Playwright + axe):** specs exist; first end-to-end pass not green yet.
- **Component tests (Vitest + RTL):** none. Components are tested only through visual regression and unit tests on their helpers.
- **Integration tests:** none. The mutation paths (add to cart → checkout → place order) have no end-to-end coverage. Even the success path isn't asserted in CI.
- **Cloud-functions tests:** none in `functions/`.

The pattern: tests live at the boundaries (pure functions, schemas) and at the surface (visual regression on rendered pages). The middle — components in isolation, integration flows — is empty. **Phase 17 below adds this for the admin side; for customer side, it's a Phase 12-style governance item.**

### 11.6 Security headers / CSP not in scope of any phase

No content-security-policy, no permissions-policy, no `X-Frame-Options`, no `Strict-Transport-Security` in `firebase.json`'s `headers` block. Cloud Functions and Firestore Security Rules look tight (the rules file is 26 KB and explicit), but the response-headers layer is missing. **Phase 14 covers this.**

---

## 12. Closing the Phase 0-6 gap

A focused 1-week sprint that takes phases 0-6 from "code-complete with caveats" to "fully delivered and verifiable in CI."

| # | Item | Phase | Effort | Owner |
|---|---|---|---|---|
| 1 | Set `VITE_SENTRY_DSN` in prod build env; trigger a test error; verify dashboard | 0 | 30 min | DevOps |
| 2 | Provision Playwright test users (`playwright-test-user`, `playwright-test-admin`) in the test Firebase project; set `ALLOW_TEST_LOGIN=1` on the `testLogin` function | 0 | 1 h | DevOps |
| 3 | Run `npm run test:a11y` end-to-end against staging; fix each critical/serious axe violation; commit; turn on branch protection | 0 | half day | FE |
| 4 | Run `npm run test:visual:update` once on CI to generate the ~80 baseline PNGs; commit `__screenshots__/` | 0, 3 | 30 min on CI + review | FE |
| 5 | Migrate `CheckoutPage` to RHF + shared `<Field>` + inline errors; remove the file-local Field wrapper | 6 | 1 day | FE |
| 6 | Add `react-hook-form` to the `schemas` chunk in `vite.config.ts`; remove the stale comment | 0, 6 | 5 min | FE |
| 7 | Gate `mockProducts` behind `import.meta.env.DEV` | 8 (perf) | 30 min | FE |
| 8 | Add the four "on-{state}-solid" tokens to `tokens.css` | 1 | 15 min | FE |
| 9 | Wire `[data-density="dense"]` on `<AdminLayout>` and audit which admin rules should consume the dense variables | 1, 9 | 2 h | FE |
| 10 | Add the token-level `prefers-reduced-motion` retarget block in `tokens.css` | 1 | 15 min | FE |
| 11 | Move the 22 PHASE_*.md files into `docs/history/` | governance | 10 min | FE |
| 12 | Split `design.css` into purpose files (`base.css`, `utilities.css`, `components.css`); add TOCs | 3 | 1 day | FE |

**Total:** approximately 3-4 engineer-days. After this, phases 0-6 have no caveats.

---

## 13. Why 12 phases isn't enough

The 12-phase plan covers polish, performance, and process. It doesn't cover:

- **Operating across languages, currencies, regulatory regimes.** Phase 11's "personalization" talks about wishlists and recommendations, not LTR/RTL, not pluralization, not currency-localized pricing, not VAT/GST per region.
- **Security & privacy posture beyond Sentry PII redaction.** No CSP, no consent banner, no data-export/right-to-delete flow, no PCI-DSS scope reduction strategy, no security-headers audit.
- **Resilience: what happens when the network is bad, the user is offline, the third-party (payment, email) is down.** Phase 8 has an "offline page" line item; that's the minimum, not the system.
- **Search, discovery, merchandising.** The current `/products` page has a flat grid + a filter sidebar. Enterprise customers expect typeahead, faceted search, sponsored placements, semantic search, "more like this," etc.
- **The admin side as a product.** AdminProducts and AdminOrders are 1000+ LOC each — they're features, but they aren't operator-grade. Bulk actions, undo, audit log, role-based field visibility, change history — none of those exist.
- **Trust signals & conversion UX.** Reviews exist but aren't surfaced as social proof; no UGC; no shipping ETA on cart; no guest-checkout path; no abandoned-cart recovery.

Each of those is a phase. They aren't extensions of phases 0-12; they're new territory.

---

## 14. Phase 13 — i18n / L10n at scale

> Today: 193 string pairs in `translations.ts`, 8 files calling `useT()`. Many pages render English literals. **Enterprise asks for: 5+ locales, currency, pluralization, dates, RTL, lazy-loaded message catalogs.**

### 14.1 Outcome statement

Any new locale ships by translating a JSON file. No code changes are required to add a language. Currency, dates, numbers, and pluralization render correctly per locale. RTL languages (Arabic, Hebrew) render with correct layout mirroring.

### 14.2 Tasks

1. **Migrate to a real i18n runtime.** Pick one of:
   - **`react-intl` (FormatJS)** — ICU MessageFormat for pluralization, gendered, nested args; mature; medium-heavy bundle (~30 KB).
   - **`@lingui/react`** — also ICU; smaller (~10 KB); CLI extracts messages from source. Recommended for this codebase's size.
   - **`i18next` + `react-i18next`** — most popular; ICU support via a plugin; larger ecosystem; slightly heavier.
2. **Message extraction in CI.** A script scans every `tsx` for `t('...')` calls and produces a complete `messages.json` per locale. Untranslated keys fail the build (or warn, in dev).
3. **Lazy-load message catalogs by locale.** `messages.fr.json` only downloads if the user selects French. Don't ship every locale to every user.
4. **Currency & number formatting.** Use `Intl.NumberFormat` consistently. Today, `formatPrice()` produces `$12.50` for everyone — needs `12,50 CHF` for Switzerland, `€12.50` for EU, etc. Locale-aware formatter throughout.
5. **Date formatting.** Replace any hand-rolled `dd/mm/yyyy` with `Intl.DateTimeFormat`. Already mostly using `date-fns`, but locale needs to flow through.
6. **Pluralization.** "1 tea" / "5 teas" / "0 teas" → ICU plural rules. The codebase has 30+ places that hand-write singular/plural — error-prone in English, broken in Polish (which has 4 plural forms).
7. **RTL support.** Add `dir="rtl"` flip; replace `left`/`right` in CSS with logical properties (`inline-start` / `inline-end`); audit every fixed/sticky position. CSS logical properties are well-supported in 2026 evergreen browsers.
8. **Locale switcher UX.** Persist in `localStorage` + URL prefix (`/fr/products/black-tea`); SEO-friendly hreflang in `index.html`; sitemap per locale.
9. **Locale-aware shipping & tax.** Pricing rules differ; the Cloud Function path needs to read the locale and apply the right tax/shipping calc.

### 14.3 Effort

- Library swap + first migration of 1 page: 3 days.
- Full migration of all pages: 1-2 weeks.
- RTL CSS audit: 3-5 days.

### 14.4 Success gate

- [ ] One JSON file added → new locale appears in switcher; pages render in it.
- [ ] CI fails on a missing translation key.
- [ ] Per-locale lazy-load verified in Network panel.
- [ ] Arabic RTL pass renders correctly on `/`, `/products`, `/checkout`.
- [ ] Pluralization works for `en` (2 forms), `fr` (2), `ru` (3), `ar` (6).
- [ ] Currency formatting per locale.

---

## 15. Phase 14 — Security, privacy, and compliance

> Today: Firestore rules are tight, Sentry redacts PII inputs in replay, no CSP, no consent banner. **Enterprise asks for: defense-in-depth, demonstrable compliance, customer trust.**

### 15.1 Outcome statement

A new customer (or auditor, or insurer) can read a one-page security posture doc, follow the links to scan results, and conclude that the app meets baseline 2026 standards. No data leaves the EU without consent. A customer can download or delete their data in under 5 minutes.

### 15.2 Tasks

1. **Content-Security-Policy header.** Strictest practical policy: `default-src 'self'`; allow Firebase, Sentry, RUM endpoint, Google Fonts (if any) explicitly. Start with `Content-Security-Policy-Report-Only`, watch the violation reports for a week, then enforce. Add to `firebase.json` `hosting.headers`.
2. **Permissions-Policy header.** Lock down `camera=()`, `microphone=()`, `geolocation=()` — none of which the app needs. Reduces XSS blast radius.
3. **Strict-Transport-Security.** `max-age=63072000; includeSubDomains; preload`.
4. **Subresource Integrity (SRI).** Vite supports it; turn it on. Every script/style tag gets a `integrity=` hash.
5. **Cookie consent banner.** GDPR-style with categories (necessary / analytics / marketing). Defer Sentry/RUM init until the user accepts. If they reject, the privacy-safe versions still run (necessary cookies only). Library: `cookieconsent` or build it (it's small).
6. **Right-to-export.** Account page → "Download my data" → triggers a Cloud Function that aggregates orders, addresses, profile, gift cards into a JSON download. GDPR Article 20.
7. **Right-to-delete.** Account page → "Delete my account" → 30-day soft delete; Cloud Function purges PII while retaining order records (legal retention requirement) but anonymizes the customer foreign key. GDPR Article 17.
8. **Audit log of admin actions.** Every admin write (`adminUpdateProduct`, `adminCancelOrder`, `setUserRole`, etc.) writes to an `/audit/{auto-id}` collection with actor, action, target, before, after, timestamp. Admin page to view it. Compliance asks for it; admins also benefit when something breaks.
9. **Rate limiting on Cloud Functions.** Firebase has it built in; configure per-endpoint limits. Especially `placeOrder`, `signup`, `passwordReset`.
10. **Secrets rotation policy.** Document and automate Firebase API key, Sentry DSN, Stripe key (whenever payments land) rotation cadence.
11. **Dependency vulnerability gate.** Add `npm audit --audit-level=high` to CI; fail the build on a fixable high/critical CVE. Better: Dependabot or Renovate with auto-PRs.
12. **PCI-DSS scope reduction strategy.** When payment lands (currently eTransfer), card data must never touch the app's servers. Use Stripe Elements / iframe-based flows. Document the scope diagram.

### 15.3 Effort

- Headers + SRI + consent banner: 2-3 days.
- Right-to-export + right-to-delete + audit log: 1-2 weeks.
- Vulnerability gate + dep auto-update: 1 day.

### 15.4 Success gate

- [ ] Mozilla Observatory scan: grade A or A+.
- [ ] securityheaders.com: grade A or A+.
- [ ] Consent banner appears on first visit; user choice respected; Sentry / RUM gated by it.
- [ ] Customer can export + delete their own data end-to-end.
- [ ] Admin actions surface in an audit log.
- [ ] No `high` / `critical` CVE in dependencies (verified in CI).

---

## 16. Phase 15 — Resilience, offline, and degraded-mode UX

> Today: PWA service worker registers, Workbox NetworkFirst on API calls. **Enterprise asks for: graceful degradation on bad networks, intelligent retry, offline pages, queued mutations.**

### 16.1 Outcome statement

A customer browsing on a flaky train wifi can: read product pages from cache; add to cart while offline; have the cart sync when connectivity returns; understand at every moment whether they're online, slow, or offline. A customer whose Stripe/Firebase outage hits mid-checkout doesn't lose their cart.

### 16.2 Tasks

1. **Offline page.** Workbox `navigateFallback` → `/offline.html`. The page renders the brand, a "you're offline" message, last-cached navigation, and a retry button. Cache it on first visit.
2. **Online/offline indicator.** A subtle (one icon, no banner) indicator in the navbar that flips based on `navigator.onLine` + a periodic Firestore ping. Aria-live updates.
3. **Queue mutations while offline.** Add-to-cart while offline → push to an IndexedDB queue → flush on `online` event. Tanstack Query has the building blocks (`persistQueryClient` plugin + a custom mutation persister).
4. **Retry with exponential backoff on Firestore writes.** `firestoreRetry.ts` exists in this codebase already — confirm it covers all write paths and respects idempotency (the Cloud Function side must be idempotent; document which ones are).
5. **Network-quality awareness.** `navigator.connection.effectiveType` → on `slow-2g`, defer non-critical image loads; on `4g`, prefetch routes.
6. **Stale-while-revalidate UX.** When `useQuery` reports `isStale: true && data: cached`, render a tiny "Updating…" indicator (the `StaleIndicator` component already exists; ensure every long-lived query consumes it).
7. **Cart persistence across crashes.** Today the cart store is Zustand + localStorage persist. Verify it survives a tab crash mid-cart-add. Test: kill the tab, reopen, expect cart intact.
8. **Order placement idempotency.** A user who double-clicks "Place order" while the network is slow must not create two orders. Today's path probably already handles it via the `submitting` flag; verify with a slow-3G simulation. Idempotency token in the Cloud Function call gives belt-and-suspenders.
9. **Graceful Firebase Auth degradation.** If Firebase Auth is down, login fails — currently with a generic toast. Better: detect the specific error, show "Sign-in is temporarily unavailable. Browse as a guest."
10. **Third-party outage handling.** Sentry, RUM, image CDN — each should fail open (the app keeps working if they're down). Today, the RUM module sends beacons and ignores failure (good). Verify the image CDN path falls through to a placeholder on 5xx.
11. **Background sync for orders.** Service worker registers a background-sync that flushes any pending order if connectivity returns before the user reopens the tab. Workbox supports it.

### 16.3 Effort

- Offline page + indicator + connection-aware: 2-3 days.
- Mutation queue + cart resilience + idempotency: 1 week.
- Background sync: 2-3 days.

### 16.4 Success gate

- [ ] Chrome DevTools "offline" → page loads from cache, browse works, cart adds queue, online flip syncs.
- [ ] Chrome DevTools "slow 3G" → INP stays under 200 ms on P75 (per RUM); user sees stale-indicator on loaded data.
- [ ] Forced Firebase Auth outage (block the domain at the firewall) → app degrades to guest-mode with a clear message.
- [ ] Double-clicking "Place order" creates exactly one order (verified in test).

---

## 17. Phase 16 — Search, discovery, and merchandising

> Today: `/products` is a flat grid + filter sidebar. **Enterprise e-commerce asks for: instant typeahead, faceted search, semantic understanding, merchandising tools.**

### 17.1 Outcome statement

A customer can find a tea in 3 keystrokes. A merchandiser can rearrange the homepage carousel without an engineer. The "more like this" feature actually surfaces similar teas, not random ones.

### 17.2 Tasks

1. **Instant typeahead on the navbar SearchBar.** Today's SearchBar opens search results in the URL. Better: a typeahead dropdown showing top 5 matches as the user types, with arrow-key nav, debounce 200 ms, recent searches at the bottom. The Phase 4 `cmdk` palette has this for power users; ordinary users typing in the navbar deserve the same.
2. **Faceted search on `/products`.** Today's filters are checkboxes per category. Add: flavor profile (smoky / floral / earthy), brewing time, caffeine level, origin region, price band. URL-state-driven so it's shareable. The `teaFilters.ts` lib already abstracts the predicate; extending it is mechanical.
3. **Search engine: client-side, server-side, or hybrid?** With 79 teas, client-side is fine (filter `/products` list in-memory). Future: as catalog grows, evaluate Algolia, Typesense, or Firestore + Cloud Function search index.
4. **Semantic "more like this."** Currently `RelatedTeas` is heuristic. Layer on: customers who viewed X also viewed Y (denormalized aggregate, recomputed nightly via a Cloud Function). Long-term, embedding-based similarity (vector search) on tea descriptions — overkill today, future-relevant.
5. **Merchandising surface in admin.** A new admin page `/admin/merchandising` lets an operator: pin a tea to the top of `/`, schedule a sale banner ("Sakura Bloom — 20% off this week"), reorder homepage carousel slots, A/B test two homepage hero variants. Today these are code-edits.
6. **Sale + promotion UX.** Today, promo codes work but aren't surfaced. A sale banner across the navbar, a "From $X.XX (was $Y.YY)" treatment on cards, a "20% off your first order" capture flow on first visit.
7. **Collections curation.** Today's grid is flat. Add curated collections: "Best for beginners," "Caffeine-free evenings," "Gift-worthy presentations." Each is a slug + a list of tea IDs the merchandiser maintains. Surfaces on `/`, on `/products/collections`.
8. **Out-of-stock UX.** Today, sold-out teas show a sold-out badge. Add: "Notify me when back in stock" → email capture → Cloud Function emits when admin flips the stock toggle.
9. **Recently viewed.** localStorage history of last 10 teas. Surface on `/` for returning visitors, on `/cart` empty-state. (Phase 11 mentioned this; flag it as a Phase-16 actual ship.)
10. **Search-result analytics.** Track: search terms, results count, click-through, "no results" rate. Surface in `/admin/analytics`. The 0-result terms are the merchandising gold.

### 17.3 Effort

- Typeahead + faceted search: 1 week.
- Merchandising admin page: 1 week.
- Out-of-stock notify + recently-viewed: 2-3 days.

### 17.4 Success gate

- [ ] Typeahead returns results in < 100 ms for any 1-3 character input.
- [ ] Faceted search produces a URL that can be shared and reproduces the filter state.
- [ ] Admin can rearrange the homepage carousel without a code change.
- [ ] "More like this" returns demonstrably similar teas (manual quality check on 10 reference teas).
- [ ] Search analytics dashboard live; top 0-result terms surface to merchandiser.

---

## 18. Phase 17 — Admin / operator excellence

> Today: AdminProducts, AdminOrders, etc. are 1000+ LOC each. They work. They're not operator-grade. **Enterprise asks for: bulk actions, undo, audit log, change history, role-based access, keyboard-driven workflows.**

### 18.1 Outcome statement

A daily-operator can do 80% of their day-to-day work without leaving the keyboard. A new hire can be productive on day 2 because every page is self-documenting. A mistake is recoverable: every destructive action has undo or a confirmation, and every change has an audit trail.

### 18.2 Tasks

1. **Bulk actions in every admin table.** Multi-select rows → "Mark as shipped," "Cancel," "Apply discount," "Export to CSV." Currently every action is one-at-a-time. Pattern: a `<BulkActionBar>` that appears when ≥1 row is selected.
2. **Undo on destructive actions.** Within 10 seconds of "Cancel order," a toast with "Undo." Same for "Archive product," "Delete promotion." Same for any single-row destructive op. Today's flow is "confirm modal → done, no recovery."
3. **Change history per record.** `/admin/orders/{id}` shows the order's full change history: who changed what, when. Powered by the audit log from Phase 14.8. Same for products, customers, promotions.
4. **Role-based admin.** Currently `admin` is a single role with full access. Add: `editor` (can edit products, can't issue refunds), `support` (can issue refunds, can't edit products), `viewer` (read-only). Firestore rules enforce; UI hides what the user can't do.
5. **Keyboard-driven workflows.** `j` / `k` move row focus; `Enter` opens; `e` edits; `a` archives; `?` shows shortcuts. Power users adore this; new users can ignore it. The `cmd+K` palette already exists; extend it with admin-specific commands.
6. **Saved filters / views.** An admin who reviews "pending payment" orders 50 times a day should save that filter as a named view. URL-state captures it; localStorage persists the named view list.
7. **Quick-look drawer.** Click a row → opens a side drawer with key fields, not a full-page modal. Esc closes; cmd+click opens in new tab. Today the pattern is full-modal which forces a tab switch.
8. **Export to CSV/XLSX.** Every table → "Export" button → respects current filter + sort + search. Library: `papaparse` for CSV (small) or `xlsx` for Excel (heavier — only load on click).
9. **Print-friendly views.** Invoice for an order, picking list for a fulfillment day. Today an admin screenshots the page. A `?print=1` querystring renders a print-stylesheet-friendly variant.
10. **Mobile admin.** Today's admin is desktop-only. A bartender doing inventory on a tablet, a packer reading a picking list on a phone, deserves a responsive admin. Phase 9 covered customer-side mobile; admin needs its own pass.
11. **Saved searches in `cmd+K`.** "All open orders from Quebec" should be one keystroke + 3 chars away.

### 18.3 Effort

- Bulk actions + undo + drawer: 1-2 weeks (depends on how many tables).
- Role-based admin + audit history: 1-2 weeks.
- Mobile admin: 1-2 weeks.

### 18.4 Success gate

- [ ] An admin can cancel 50 stale orders in one bulk operation.
- [ ] Cancelling an order shows an "Undo" toast for 10 s; clicking it restores the order.
- [ ] Three roles configured; UI changes per role.
- [ ] A new admin reads `/admin/help` and is productive without further training.
- [ ] Every admin page passes Lighthouse mobile-friendly check.

---

## 19. Phase 18 — Trust, social proof, and conversion UX

> Today: clean product pages, no reviews surfaced as social proof, no shipping estimate on cart, no guest checkout. **Enterprise asks for: every conversion blocker addressed, every trust signal in place.**

### 19.1 Outcome statement

A first-time visitor's questions are all answered without leaving the page: "is this trustworthy," "when will it arrive," "what does it taste like according to others," "can I return it if I don't like it," "can I buy without creating an account." Each answer is one glance away.

### 19.2 Tasks

1. **Reviews surfaced as social proof.** Schema exists (`review.schema.ts`); UI may not yet aggregate to a homepage carousel. Add: star rating on every product card; review count; "Top reviewed" collection on `/`.
2. **Verified-purchase badges on reviews.** A review where the reviewer has a matching order on the same tea → green checkmark. Cloud Function adds the flag at review creation.
3. **Shipping ETA on cart and product page.** Today the cart says "Shipping calculated after order placed." Better: "Order in the next 4h 22m for Tuesday delivery." Requires a settings-driven cutoff time and the shipping policy.
4. **Guest checkout.** Force-create-account at checkout is a known 20-30% conversion killer (Baymard). Allow checkout-as-guest with email-only; offer post-purchase account creation with one click ("Save your details for next time?").
5. **Abandoned-cart recovery.** Cloud Function detects a cart > 24h old with a known email → sends a friendly "you left something behind" email. Standard e-commerce hygiene; ~10% recovery rate industry average.
6. **Wishlist with sharing.** Phase 11 mentioned; flag here as actual implementation. Persistent + shareable link.
7. **Trust badges.** Footer / cart: SSL secure, payment methods accepted, return policy summary, contact info. Each links to detail.
8. **Live order status notifications.** Email + in-app notification at each state transition (received → confirmed → shipped → delivered). The notification system exists; ensure every status flip emits.
9. **Return / refund flow.** Today there's a refund policy page but no return-request flow. Customer-initiated: account page → order detail → "Request return" → reason + items → Cloud Function notifies admin → admin approves → return label emailed.
10. **Inventory urgency UX.** "Only 3 left" badge on low-stock teas. Used judiciously — fake scarcity damages trust. Tied to real stock count.
11. **"Recently sold" social proof.** "Sakura Bloom — 12 sold in the last 24 hours." Same constraint: only when true.
12. **Testimonials / press mentions on `/about`.** If real, surface them. Today's About page is bare.

### 19.3 Effort

- Reviews surfacing + guest checkout: 1 week each.
- Abandoned-cart recovery (Cloud Function + email template + scheduling): 3-4 days.
- Returns flow (customer + admin pieces): 1-2 weeks.

### 19.4 Success gate

- [ ] Cart→purchase conversion rate (RUM-tracked) improves by ≥ 10% over Phase-12 baseline.
- [ ] Guest-checkout completion rate measured; same or better than logged-in.
- [ ] Abandoned-cart email triggers within 24h and recovers ≥ 5% of carts.
- [ ] Returns flow end-to-end without admin intervention beyond approval.
- [ ] At least 4 trust badges in the footer.

---

## 20. Revised KPIs & "definition of enterprise"

The original 19. KPIs table in `0-12.md` is sound but customer-only. Enterprise demands operator and trust metrics as well.

### 20.1 Performance (unchanged from `0-12.md`)

- P75 LCP < 2.0 s, P75 INP < 150 ms, CLS < 0.05 — all measured in RUM.
- Lighthouse Performance ≥ 92.
- Per-route bundle budgets met.

### 20.2 Accessibility (extended)

- axe critical/serious = 0 on every route × theme. **Including admin.**
- Lighthouse a11y ≥ 98.
- WCAG 2.2 AA self-assessment complete.
- **NEW:** keyboard-only completion of "browse → add to cart → checkout → place order" in under 60 s (manual test).
- **NEW:** NVDA + VoiceOver recordings of the top 5 flows published.

### 20.3 Quality

- 0 unintended visual regressions per PR (Chromatic + Playwright).
- 0 new inline `style={{}}` per PR (lint).
- 0 new hex outside `tokens.css` (stylelint).
- 100% Storybook coverage of UI primitives + patterns.
- **NEW:** ≥ 80% line coverage on `src/lib/`, `src/store/`, `src/hooks/`.
- **NEW:** every Cloud Function has a unit test.

### 20.4 Security & privacy (NEW — Phase 14)

- Mozilla Observatory grade A or higher.
- securityheaders.com grade A or higher.
- 0 high/critical CVEs in dependencies (gated in CI).
- 100% of admin writes audit-logged.
- Data-export + data-delete flows tested quarterly.

### 20.5 Resilience (NEW — Phase 15)

- App functional offline (browse + cart-queue) verified in CI.
- Slow-3G P75 INP < 200 ms.
- 0 duplicate orders from double-submit (verified in test).

### 20.6 i18n (NEW — Phase 13)

- New locale ships by translating one JSON file, no code change.
- Pluralization correct for all supported locales.
- RTL pass renders correctly on every page.

### 20.7 Customer (extended)

- NPS ≥ 50.
- PWA install rate ≥ 8% of returning visitors.
- Cart→purchase conversion ≥ 95% (moderated test).
- **NEW:** Search-to-product-page conversion ≥ 40%.
- **NEW:** Guest-checkout completion rate ≥ logged-in rate.
- **NEW:** Abandoned-cart recovery ≥ 5%.

### 20.8 Operator (NEW — Phase 17)

- New admin productive without further training after reading `/admin/help`.
- Bulk action available on every list view.
- Every destructive action has undo or strong confirmation.
- ≥ 80% of operator actions reachable from `cmd+K` palette.

### 20.9 Errors (extended)

- Sentry critical errors < 10 per 1k DAU per release.
- **NEW:** No Sentry error open for > 7 days without triage.
- **NEW:** Crash-free sessions ≥ 99.5%.

### 20.10 The "enterprise" definition

The product is **enterprise-grade** when the following six statements are true *simultaneously*:

1. Any new feature ships through the Phase-12 governance gates (Storybook story + Chromatic-approved + a11y green + perf within budget) before merge.
2. A new locale can be added by editing one JSON file — no other code change.
3. A security audit can be completed in one session by reading `SECURITY.md`, scanning the observatory page, and following 5 links.
4. The app works (degraded but functional) for a user on slow / unreliable / offline networks.
5. A new admin is productive on day 2 — pages teach themselves through self-documenting affordances.
6. The most-trafficked customer flows (browse, cart, checkout) outperform 5 named competitors on every public benchmark (LCP, INP, CLS, time-to-purchase).

---

## 21. Appendix — files touched / inspected

For this audit, the following were inspected directly (read-only, no modifications were made to the codebase):

```
# Roadmap & implementation reports (read for claims)
0-12.md
PHASES_INDEX.md
AUDIT_CLOSEOUT.md
PHASE_*.md (12 files)
ROADMAP_FOLLOWUPS.md
FORMS_GUIDE.md
STATES_GUIDE.md
IA_MAP.md

# Build & config (verified)
package.json
vite.config.ts
.size-limit.json
eslint.config.js
playwright.setup.ts
playwright.config.ts
firebase.json
.github/workflows/*.yml

# Source (verified against claims)
src/main.tsx
src/lib/rum.ts
src/lib/sentry.ts
src/lib/prefetchRoute.ts
src/lib/viewTransition.ts
src/lib/useOptimistic.ts
src/styles/tokens.css
src/styles/design.css
src/app/components/ui/* (all 11 primitives + all 18 stories)
src/app/components/ui/patterns/* (all 6 pattern stories)
src/app/components/CommandPalette.tsx
src/app/components/TransitionLink.tsx
src/app/components/LazyImage.tsx
src/app/pages/CheckoutPage.tsx
src/app/pages/admin/* (verified file sizes + form usage)
src/app/components/gift-builder/steps/Step3Personalize.tsx
src/i18n/translations.ts

# Commands executed
npm install
npx tsc --noEmit
npx eslint src tests functions/src --quiet
npx stylelint "src/**/*.css"
npx vitest run
npx vite build
npx size-limit
node scripts/contrast-check.mjs
node scripts/tokens-export.mjs
node scripts/a11y-static-scan.mjs
node scripts/inline-style-analyzer.mjs
npx storybook build
```

---

## How to use this document

1. Read sections 3-9 against your own progress notes; resolve discrepancies in your favor (this audit is a snapshot, you have ground truth).
2. Run the §12 closeout sprint (3-4 engineer-days). After it, phases 0-6 have **no remaining caveats**.
3. Decide which of phases 13-18 are real priorities versus aspirational. Most teams will pick 3 of the 6 for the next quarter; that's healthy.
4. Update the KPI dashboard from §20 once RUM is live, so every claim about progress has a number behind it.
5. After each new phase ships, append a `## Done — Phase N` section to this file with what shipped, what slipped, and what the next phase looks like with the new data in hand.

The 12-phase plan got the codebase to a state most products never reach. Phases 13-18 are about going from "exceptional product engineering" to "exceptional product." Those are different bars — and reaching the second one is what makes a customer renew rather than just sign up.

---

*Audited against the codebase, not the claims. Every assertion in §§3-10 is backed by a file path, line number, or command output. Where the implementation reports said one thing and the code said another, the code wins.*
