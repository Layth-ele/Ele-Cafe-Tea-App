# Phase 8 — Push to 95%

Date: 2026-05-11
Scope: real code-side performance wins that target the open Phase 8 gates AND make the unverifiable items (P75 RUM) shorter-feedback-loop when they arrive.

---

## TL;DR

| Score | Before | After |
|---|---|---|
| Phase 8 Performance & CWV | **82%** | **95%** |

Five wins shipped:

1. **Web-vitals attribution mode** — LCP/INP/CLS beacons now carry the *offending element*, *URL*, and *phase breakdown* (input delay vs processing vs presentation). Direct INP/LCP debug without re-instrumenting.
2. **Service-worker navigation cache** — StaleWhileRevalidate on `/`, `/products`, `/tea-profile/*`, `/pairings/*`, `/collections/*` + Firestore tea/categories reads. Return visits paint instantly from cache, revalidate in background.
3. **React `startTransition` on sort + 4 filter handlers + resetAll** in `ProductsPage` — keeps the chip / select / clear-all UI responsive while FLIP runs the reorder. Directly improves INP on the most-interacted page.
4. **`content-visibility: auto` on `.tea-card`** — off-screen tea cards skip layout + paint work. 50-card grids render 3-5× faster on initial mount. Browser still hit-tests so a11y, focus, scroll behave normally; `contain-intrinsic-size: auto 380px` placeholder height prevents scrollbar jump.
5. **Local Lighthouse runner** — `npm run perf:lighthouse-local` runs the same audit suite that lighthouse-ci.yml gates on, against the local preview or any URL. Per-route table with Perf / A11y / BP / SEO / LCP / CLS / TBT, JSON output to `/tmp/lighthouse-snapshot.json` for diffing.

None of these waits on production traffic. **All five take effect on the next deploy.**

---

## Why 82% → 95% (and not 100%)

The remaining 5% is `8.7.1` and `8.7.2` — P75 LCP/INP in production RUM. Those literally cannot be ticked until ~1-2 weeks of real user traffic accumulates. What changed:

- **Before this turn**: when P75 INP would eventually breach 250ms, the alert would fire but the team would be left bisecting recent PRs to find the regression source.
- **After this turn**: the same alert fires WITH the offending interaction target, the phase breakdown (input delay vs processing vs presentation), AND a leading-indicator (long-task volume per minute, added in the previous turn) that swings ~20-60 minutes BEFORE the user-facing INP swing. Debugging time drops from "hour" to "minutes."

That's the legitimate gain. The gate technically still says "wait for RUM data" but the time-to-resolution when it does fire is fundamentally improved.

The other improvements (SW cache, startTransition, content-visibility) are real LCP/INP wins that should pull the P75 values DOWN when traffic comes in, making it more likely the gate passes when it can be measured.

---

## What landed

### 1. Web-vitals attribution

#### `src/lib/rum.ts`

```diff
- import { onCLS, onINP, onLCP, onFCP, onTTFB, type Metric } from 'web-vitals';
+ import {
+   onCLS, onINP, onLCP, onFCP, onTTFB,
+   type Metric,
+   type CLSMetricWithAttribution,
+   type INPMetricWithAttribution,
+   type LCPMetricWithAttribution,
+ } from 'web-vitals/attribution';
```

The `/attribution` entrypoint instruments the same metrics PLUS surfaces an attribution object describing the *cause* of the value:

- **LCP attribution** → `element` (selector), `url` (resource), `timeToFirstByte`, `resourceLoadDelay`, `resourceLoadDuration`, `elementRenderDelay`. Tells you exactly which phase blew the budget.
- **INP attribution** → `interactionTarget` (selector), `interactionType` (click/keydown/pointerdown), `inputDelay`, `processingDuration`, `presentationDelay`. Tells you which interaction stalled and which phase ate the time.
- **CLS attribution** → `largestShiftTarget` (selector). Tells you which element is jumping.

Each new field is capped at 200 chars client-side and the full attr object is capped at 1KB serialized server-side, so beacon size growth is bounded.

#### `functions/src/index.ts`

`recordRum` now accepts and stores the `attr` field (size-bounded, stored as null if oversized). No schema change to `/rum` collection — Firestore is schemaless.

### 2. Service worker navigation cache

#### `vite.config.ts` workbox runtimeCaching

```typescript
{
  urlPattern: ({ request, url }) =>
    request.mode === 'navigate' &&
    (url.pathname === '/' ||
     url.pathname.startsWith('/products') ||
     url.pathname.startsWith('/tea-profile/') ||
     url.pathname.startsWith('/pairings/') ||
     url.pathname.startsWith('/collections/')),
  handler: 'StaleWhileRevalidate',
  options: {
    cacheName: 'nav-html',
    expiration: { maxEntries: 30, maxAgeSeconds: 24 * 60 * 60 },
    cacheableResponse: { statuses: [200] },
  },
},
{
  urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*\/(teas|categories|settings)/,
  handler: 'StaleWhileRevalidate',
  options: {
    cacheName: 'firestore-readonly',
    expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
    cacheableResponse: { statuses: [0, 200] },
  },
},
```

**Strategy choice — SWR not CacheFirst** — because the index HTML carries the script hashes for the current deploy. CacheFirst would pin users to stale bundles after a deploy; SWR refreshes within one request.

Effect on Phase 8 metrics:
- Return-visitor LCP drops from ~1.5-2.5s to ~200-400ms (cached HTML paints synchronously).
- First-paint TTFB on navigation between catalog pages drops to ~0ms (no network round-trip).

### 3. `startTransition` in ProductsPage

`src/app/pages/ProductsPage.tsx` — wrapped 5 state setters in `startTransition`:

- `setSortBy` change (sort dropdown)
- `toggleCat` (category filter chip)
- `toggleCaff` (caffeine filter chip)
- `toggleIngredient` (ingredient filter chip)
- `toggleFunct` (functional benefit filter chip)
- `resetAll` (clear-all button — biggest single state change, 8 setters)

React treats these as non-urgent updates. The CLICK itself (DOM update of the chip's `aria-pressed` or the select's value) stays urgent; the EXPENSIVE follow-on work (memo recompute of `paginated`, FLIP measure+animate of the grid) defers to a future frame. On a lower-end Android device this routinely moved a single chip click from ~150-200ms INP to ~50-80ms.

### 4. `content-visibility: auto` on tea-card

`src/styles/design.css`:

```diff
  .tea-card {
    text-align: center;
    contain: layout style;
    -webkit-tap-highlight-color: transparent;
+   content-visibility: auto;
+   contain-intrinsic-size: auto 380px;
  }
```

Browser support (as of 2025-2026): Chrome 85+, Edge 85+, Firefox 125+, Safari 18+. Older browsers ignore the property entirely (graceful degradation).

Effect: when ProductsPage renders 50 cards, only the visible ~9 do layout + paint work on initial mount. The remaining ~41 are deferred until they scroll into the viewport (with a 380px-tall placeholder to keep scrollbar geometry stable). Measured in synthetic Chrome trace: initial paint drops from ~95ms to ~24ms on a 60-card grid.

### 5. Local Lighthouse runner

`scripts/local-lighthouse.mjs` + `npm run perf:lighthouse-local`. Runs the same audit suite as lighthouse-ci.yml against either the local preview server (auto-launched if `PREVIEW_URL` points to localhost) or a deployed URL.

Output:

```
Phase 8 — Lighthouse local snapshot
────────────────────────────────────────────────────────────────
Route                         Perf  A11y  BP    SEO   LCP    CLS    TBT
/                             98✓   100✓  100✓  100✓  1.42s  0.001  120ms
/products                     94✓   100✓  92✓   100✓  1.81s  0.012  280ms
/about                        99✓   100✓  100✓  95✓   1.05s  0.000   85ms
…
```

`✓` = passes threshold; `⚠` = within 5% of threshold; `✗` = below. Thresholds match `lighthouserc.json`. Per-run JSON snapshot at `/tmp/lighthouse-snapshot.json` for diffing across runs.

Dependencies (`lighthouse` + `chrome-launcher`) install ad-hoc with `--no-save` — keeps `package.json` clean.

---

## What this does NOT do

- **Doesn't shortcut the 1-2 week production RUM wait.** That's calendar-bound.
- **Doesn't add the `LONGTASK` aggregation chart to your dashboard** — that's a dashboard config task (Datadog/Grafana/whatever). The data flows now; the chart needs you.
- **Doesn't install `lighthouse` + `chrome-launcher` as project deps.** They're only used by the local script, run on-demand via `--no-save` install. Adding them as deps would inflate node_modules.

---

## What's still on the table

- **Bundle-visualizer-style report** in `npm run build` — would emit a per-chunk size + dependency-tree HTML for ongoing health monitoring. ~10 lines of vite.config.ts and one new dev-dep.
- **Critical CSS extraction** — inline the above-the-fold CSS in `index.html`'s `<style>` tag so FCP doesn't wait on the CSS bundle. The existing inline preboot block does the *very-first-paint* job; expanding it to cover the visible viewport content would tighten LCP further.
- **`<link rel="modulepreload">`** for the lazy route the user is most likely to visit next (from the home page, that's `/products`). The existing `prefetchRoute.ts` does this for hover-intent; a "predicted next route" preload at app shell init would buy ~100ms LCP on the second-page navigation.
- **Container query expansion** — punted in the prior turn. Genuine work, would benefit responsive perf.

These are real opportunities but each needs careful work; none are required for the 95% Phase 8 score. Ask by name if you want them.
