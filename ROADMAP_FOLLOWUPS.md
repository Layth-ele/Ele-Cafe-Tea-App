# Roadmap — Follow-ups from the audit passes

This is the working list of items left on the table after the five
audit passes documented in `FIXES_CLAUDE_AUDIT.md`. Nothing here is a
known bug or active security risk — those are all closed. These are
the *deferred* items: things that need careful, scoped work rather
than a single-pass touch-up, plus a few "next time we touch this
area" reminders.

Items are grouped by priority. Effort is rough: **S** = a few hours,
**M** = a day or two, **L** = a week or more. Status is **OPEN** unless
noted.

---

## P0 — do this sprint

### 1. Baseline the a11y test suite (first run) — S — IN PROGRESS
The infra is in place (`tests/a11y/`, `playwright.a11y.config.ts`,
`npm run test:a11y`) but it's never been fully run against the
codebase. The first run will surface real violations — almost
certainly some, given a 12-route × 2-theme matrix and a codebase
with no prior automated a11y coverage.

**Progress so far** (audit pass 6 — see `FIXES_CLAUDE_AUDIT.md`
items 58, 59):

- Suite execution **verified** — `home` route in light + dark both
  pass axe in 23 s. Infrastructure works.
- Static a11y scan caught and fixed two confirmed violations:
  - `TeaProfilePage` quantity stepper buttons missing `aria-label`
    (item 59) — now have `t('Decrease quantity')` /
    `t('Increase quantity')`.
- Found and fixed an unrelated rule regression I'd introduced in
  pass 3 (item 58) — the translations cache field-name mismatch
  that was silently rejecting all cache writes.
- Static scan flagged ~50 form `<input>` elements without
  `<label htmlFor>` association across 7 files (mostly admin pages
  + AccountPage + CheckoutPage). Deferred to live-suite verification
  because some may have adjacent labels axe accepts via heuristic;
  blanket fixes risk the opposite "double-label" violation.

**Remaining steps** (need a real machine — sandbox can't keep
browser automation alive long enough):

- `cd app && npm install && npx playwright install chromium`
- `npm run test:a11y` (~5 min for 24 tests)
- For each `critical` / `serious` failure: read the help URL printed
  in the failure message, fix the violation in source.
- Re-run until green.
- Commit the fixes. The suite is now the floor — every PR has to
  keep it passing.

**Success criteria:** `npm run test:a11y` exits 0. Advisory
(`moderate` / `minor`) violations may still be printed via
`console.warn`; address those opportunistically as the relevant
component is touched.

---

## P1 — do this month

### 2. Auth fixture for tests (unblocks 3, 4, and admin coverage) — M
Both the visual suite and the new a11y suite currently exclude
authenticated routes (`/checkout`, `/orders`, `/account`) and the
entire `/admin/*` tree. These are the *highest-risk* parts of the app
(payment flow, customer data, admin actions) and they have zero
automated coverage.

The blocker is a Playwright fixture that signs a test user in before
each test, ideally with a seeded cart / order / credit balance for
realistic scenarios.

**Steps:**
- Add a "test user" account (or a pool of them) to the Firebase
  project — either to a separate test project or behind an env flag
  in the production project.
- Build a Playwright fixture that logs the user in via the Firebase
  client SDK on a `/test-login` route, OR via injecting a custom-token
  call. Pattern documented in `tests/visual/README.md` (deferred there
  too).
- For admin coverage: mint a custom claim on the test user via the
  existing `setAdminRole` callable, gated behind the same env flag.
- Extend both `tests/visual/public-pages.spec.ts` and
  `tests/a11y/public-pages.spec.ts` to add the protected and admin
  routes to their `PAGES` arrays.

**Success criteria:** every route in the app (public, protected,
admin) appears in both the visual and a11y suites. Both pass.

### 3. CI integration for the a11y suite — S
The visual suite has a GitHub Actions workflow at
`.github/workflows/visual-regression.yml`. The a11y suite doesn't.
Without CI it'll drift.

**Steps:**
- Duplicate `visual-regression.yml` to `a11y.yml`.
- Change the test command to `npm run test:a11y`.
- Skip the snapshot-baseline-handling step (a11y has no snapshots —
  pass/fail is binary).
- Make it required for merge in branch protection.

**Success criteria:** every PR runs the a11y suite. Failed a11y blocks
merge.

### 4. ESLint regression guard for the hoisting pattern — S — DONE
The original audit item #31 (`export default X;` at the top of 18 page
files, hoisting landmine) was actually already fixed in pass 2 of the
audit — every page's default export now lives at the bottom of its
file, after the function declaration. I misread the audit doc when I
wrote this roadmap and listed item 31 as open; corrected here.

The follow-up that *was* missing: nothing in the lint config prevented
the pattern from regressing. While installing the regression guard, a
**latent bug surfaced**: ESLint setup was completely broken
(`.eslintrc.json` is incompatible with the installed ESLint 9, which
needs flat config). Every `npx eslint` invocation since the v9 upgrade
has been failing — meaning the husky pre-commit hook + lint-staged
pipeline were silently bypassing lint entirely.

**Done in audit pass 7** (full detail in `FIXES_CLAUDE_AUDIT.md` items
60–64):
- Wrote `eslint.config.js` (flat config) replacing `.eslintrc.json`.
- Added `eslint-plugin-import@^2.32.0` and
  `eslint-plugin-react-hooks@^5.2.0` to `devDependencies`.
- Wired `import/first` (everywhere) and `import/exports-last` (page
  files only — schemas/stores legitimately interleave many small named
  exports).
- Added `npm run lint` + `npm run lint:fix` scripts.
- Fixed real findings the new lint setup surfaced:
  - **`Step2PickTeas.tsx`** — `useEffect` after a conditional early
    return (rules-of-hooks violation, real React bug).
  - **`useSettings.ts`** — duplicate `useQuery` import.
  - **3 files** with imports below code (AdminOrders type alias,
    firebase.ts, schemas/index.ts).
  - **3 files** with named exports above helper definitions
    (GiftsPage, AdminAnalytics, AdminSettings).

**Success criteria:** met. `npm run lint` runs clean (0 errors,
3 advisory warnings). Pre-commit hook will now actually catch
violations. `tsc` and `vite build` both still 0/0.

---

## P2 — backlog (prioritize as needs arise)

### 5. Build-time prerender for SEO (vite-ssg or similar) — M
Recommended *only if SEO is the goal*. The existing PWA + manual
chunks + `lazy()` routes already give fast first-paint and
instant repeat loads. The remaining gap is that crawlers see an empty
HTML shell on the first request — Googlebot does run JS now but other
bots (LinkedIn, Slack, Twitter unfurlers, archive.org) often don't.

A targeted prerender of the static-content routes (home, products,
tea-profile, about, info pages, gifts landing) gives 80% of the SEO
value at 5% of the migration risk vs full SSR.

**Steps:**
- Evaluate `vite-ssg` (lightweight, route-based prerender) vs
  `react-snap` vs the SSG mode of TanStack Start.
- Configure the prerender step to skip authenticated and admin
  routes.
- For tea-profile pages: enumerate the slugs from `mockProducts.ts` /
  Firestore at build time and render each.
- Verify the existing meta-tag system (React 19's native hoist of
  `<title>` / `<meta>`) survives the prerender step.
- Update `firebase.json` rewrites if the prerendered HTML files need
  different routing rules.

**Success criteria:** `view-source:` on each public route shows
real content, not just `<div id="root"></div>`. Build time stays
under 60s. No regression in the visual or a11y suites.

### 6. Zod rollout to AdminOrders + gift builder — S each
Pass 5 added Zod runtime validation to `SignupPage`,
`CheckoutPage` (shipping), and `AdminProducts` (create + update). Two
flows still rely on ad-hoc validation:

- `AdminOrders` edit modal — the `Math.max(0, parseFloat(...))`
  pattern is correct for negative-value rejection but doesn't catch
  things like NaN propagation through the totals calc when an admin
  pastes a malformed string. A Zod schema for the edit payload would
  formalize the contract.
- Gift builder Step 3 (Personalize) — recipient name, sender name,
  message, occasion. No length caps, no XSS guard at the schema
  level. The existing `giftBuilderStore.ts` does some validation but
  it's incomplete.

**Steps:** mirror the pattern in `SignupPage`/`CheckoutPage` — define
a Zod schema (already exists for orders), call `safeParse` on submit,
toast the first error message, and pass `parsed.data` to the write.

**Success criteria:** every form-driven Firestore write in the app
goes through a `safeParse` gate. The schema files in `src/schemas/`
are no longer "defined but unused".

### 7. Unit tests for cart / credit / gift bundle math — M
The project has Playwright (visual + a11y) but **no unit tests**.
The most consequential business logic — cart subtotal/GST/credit
math, credit redemption thresholds, gift bundle pricing —  has zero
test coverage. The current safety net is "the page renders the right
number when I click around in dev".

The highest-leverage modules to cover:

- `src/store/cartStore.ts` — subtotal, GST per-item, total
- `src/store/giftBuilderStore.ts` — bundle pricing, downgrade logic,
  selected-tea LIFO
- `src/schemas/credit.schema.ts` — `calcCreditValue`, `maxRedeemable`,
  `pointsToNextThreshold`
- `src/hooks/usePromoCode.ts` — discount calc with stacking rules

**Steps:**
- Add Vitest (Vite-native, faster than Jest, same `describe`/`it`
  API). One config file, one `npm run test` script.
- Write tests for the modules above. Aim for ~40 tests covering the
  decision points; full coverage isn't the goal.
- Add to CI alongside typecheck.

**Success criteria:** `npm run test` runs in <5s, covers the
cart/credit/gift math, runs in CI, fails the build on regression.

### 8. Watch firebase-admin upstream CVE fixes — passive
Currently accepted risk: `firebase-admin@^13.8.0` pulls in
`@tootallnate/once`, `uuid<14`, etc. with moderate advisories.
Google hasn't released a 13.x patch with updated transitive deps.

**Steps:** subscribe to the firebase-admin GitHub releases. When a
patch lands, bump and re-run `npm audit`. Until then, no action.

**Success criteria:** `npm audit` (functions/) reports 0
vulnerabilities once Google patches.

---

## P3 — quality of life, nice to have

### 9. Refactor large component files (one at a time) — L per file
Five files between 645 and 824 lines: `TeaProfilePage` (824),
`AdminSettings` (773), `AdminOrders` (706), `NotificationBell` (651),
`ProductsPage` (645). Not bugs, not risks — code-organization
preferences. 700-line admin pages are common in production.

**The case for doing it:** smaller components are easier to reason
about, reuse, and test. Sub-components extracted from these files
could be unit-tested in isolation (#7).

**The case against doing it now:** rushed extraction is a real source
of stale-closure / hook-order / prop-drilling bugs, and the only
safety net is manual click-through. Visual regression covers public
pages but not the admin tree (blocked on #2).

**Recommended order** (highest leverage first):

1. **`AdminProducts` / `AdminOrders` edit modals** — both files have
   a sizable modal that's used for both "create" and "edit" with
   slightly different field sets. Extract to a shared
   `<ProductEditModal>` / `<OrderEditModal>`. Cuts each file by
   ~200 lines.
2. **`TeaProfilePage` → split by section** — header, brewing,
   reviews, related teas, JSON-LD. Each is independent. Cuts ~400
   lines.
3. **`NotificationBell` → extract `<NotificationDropdown>` and
   `<NotificationRow>`** — the bell button stays small, the heavy
   list logic moves out. Cuts ~300 lines.
4. **`ProductsPage` → extract `<TeaGrid>` and lift the filter state
   into a hook** — the filter sidebar is already a separate file;
   the grid + filtering is the bulk. Cuts ~250 lines.
5. **`AdminSettings` → split by tab** — settings has 4-5 tabs in one
   file. One file per tab, one parent that wires the layout. Cuts
   ~500 lines.

**Pair each refactor with:**
- Adding visual regression coverage for the affected route
  (requires #2 for admin pages).
- A manual click-through of every interaction in the affected
  page (modals open/close, forms submit, error states).

**Success criteria:** every file under 400 lines. No behavior change.
Visual + a11y suites still pass.

### 10. Bundle size monitoring in CI — S
The build currently has `chunkSizeWarningLimit: 800` in
`vite.config.ts` but no enforcement on size *regression*. A new
dependency or a sloppy import could quietly add 100 kB to the
critical chunk and nobody'd notice until users complain.

**Steps:**
- Add `size-limit` or `bundlesize` to `devDependencies`.
- Configure budgets per chunk (e.g. `react-core` ≤ 80 kB gzipped,
  `firebase-firestore` ≤ 90 kB, `index` ≤ 30 kB).
- Run as a CI step.

**Success criteria:** CI fails on any chunk exceeding budget. Maintainers
get an explicit decision point on each size bump.

### 11. Error tracking integration (Sentry or similar) — M
Currently errors are logged via `console.error` and (for Cloud
Functions) end up in Cloud Logging. Customer-facing errors —
checkout failures, credit redemption failures, payment-tracking
issues — only surface to maintainers if a customer reports them.

**Steps:**
- Pick a tool (Sentry, Highlight, Rollbar, GlitchTip).
- Initialize in `main.tsx` for the client and at the top of
  `functions/src/index.ts` for the server.
- Tag releases via `import.meta.env.VITE_APP_VERSION`.
- Configure source-map upload as part of the build step.
- Hook into the existing `ErrorBoundary` for client-side React
  errors.

**Success criteria:** every uncaught error in production surfaces to
the dashboard within seconds. Source-mapped stack traces.

### 12. Internationalization audit — M
The app supports EN + FR via `src/i18n/translations.ts` and an
auto-translation system. The `translation.ts` lib targets Arabic
specifically (`translateToArabic`) — possibly stale code, possibly
the start of a third locale. Worth resolving:

**Steps:**
- Decide: is Arabic actually a target language? If yes, plumb it
  through `languageStore.ts` and `useT.ts`. If no, delete
  `translation.ts` (or rewrite as a generic `translateTo(lang)`
  helper).
- For EN+FR: audit every page for hardcoded English strings (`grep`
  for plain `>English text<` patterns in JSX). Most should already
  go through `useT`, but the audit will surface stragglers.
- For RTL languages (if Arabic stays): the design system needs
  `dir="rtl"` flow audit — flexbox order, padding/margin shorthand,
  icon directions.

**Success criteria:** `grep`-able list of supported languages
matches the `LanguageToggle` UI. No hardcoded strings in pages.

---

## Out of scope (won't do, with reasoning)

### Server-side rendering (full SSR rewrite)
Multi-week migration: framework swap, hosting change, server-side
auth via Admin SDK + session cookies, hydration audit on every
`window`/`localStorage` touch, bundle pipeline rework. The
user-visible benefit is small — PWA + manual chunks + lazy routes
already give fast loads. If SEO is the goal, see #5 (build-time
prerender) for 80% of the value at 5% of the risk.

### Replacing React 19 + Vite 6 with a meta-framework
Same reasoning as above. The current stack is intentional: the team
chose direct React + Vite for control. A migration to Next.js or
Remix would touch every file and isn't justified by any current pain.

### Migrating off Firebase
Firebase Auth, Firestore, Cloud Functions, Storage, and Hosting are
deeply wired in (rules, schedulers, triggers, custom claims). The
project's whole architecture assumes them. Migration would be a
greenfield rewrite, not a refactor.

---

## How to use this doc

1. Pick from P0 first, then P1, etc. Don't do P3 work while P0/P1
   items are open.
2. Move items here to a `## Done` section as they close — keep the
   audit history visible.
3. New issues go in the right tier when found, with the same
   `effort + steps + success criteria` format. Future-you (or
   future-me) needs the steps to be concrete.

---

## Quick reference — open items count

```
P0:  1 in-progress  (a11y baseline — partial; 2 fixes shipped, suite needs local run)
P1:  2 open         (auth fixture, a11y CI)   — was 3, item 4 done in pass 7
P2:  4 open         (prerender, Zod rollout, unit tests, firebase-admin watch)
P3:  4 open         (large-file refactors, bundle budgets, error tracking, i18n audit)
                  ─
total: 11 open + 1 done
```
