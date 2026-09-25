# Phase 7-9 Closeout — 2026-05-11

This doc captures what shipped for **Phase 7 (Accessibility)**, **Phase 8 (Performance & CWV)**, and **Phase 9 (Mobile-First & Cross-Device)** in the second sprint after the Phase 0-6 closeout.

The approach was different from phases 0-6. Those phases established structural foundations (token system, primitive library, forms architecture). Phases 7-9 are about *finishing the work the structure enables* — there's no big platform shift here, just deliberate fills of specific gaps.

---

## Final verification

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | ✅ 0 errors |
| ESLint | `npx eslint src tests functions/src --quiet` | ✅ 0 errors |
| Stylelint | `npx stylelint "src/**/*.css"` | ✅ 0 errors |
| Unit tests | `npx vitest run` | ✅ 166 / 166 |
| Production build | `npx vite build` | ✅ ~32 s, PWA generated |
| Bundle budgets | `npx size-limit` | ✅ 7 / 7 within budget |
| Static a11y scan | `node scripts/a11y-static-scan.mjs` | ✅ 0 findings (now **112 files** scanned; was 110) |

---

## Phase 7 — Accessibility

### 7.1 Forced-colors-mode CSS — broad surface coverage

Previously the forced-colors block in `focus.css` covered three rules: button border, focus-visible outline, skip-nav background. That handles only ~10% of what a Windows High Contrast user sees.

Expanded to cover:

- **Interactive surfaces** — buttons + `[role="button"]` get explicit `ButtonText` borders so they don't collapse to invisible
- **Focus indicator** — `:focus-visible` uses system `Highlight` color (the user's chosen focus color)
- **Cards & surfaces** — `.card`, `.product-card`, `.tea-card`, `[class*="-card"]` get a `CanvasText` border for delineation
- **Modals & drawers** — `[role="dialog"]`, `.modal-content`, `.drawer`, `[class*="-drawer"]` get a 2px `CanvasText` border + `Canvas` background; overlays get `Canvas` at 0.85 opacity
- **Form inputs** — `.field`, `input`, `textarea`, `select` get `CanvasText` borders; `[aria-invalid="true"]` adds a `Mark` outline for error state
- **Links** — `LinkText` / `VisitedText` for visited state
- **Disabled state** — `:disabled` + `[aria-disabled="true"]` use `GrayText` for color + border
- **State badges** — `.badge`, `[class*="-badge"]`, `[class*="-chip"]` get `CanvasText` borders so success/warning/danger don't all collapse to identical low-contrast pairs
- **Decorative elements** — `.skeleton`, `.divider`, `hr` use `GrayText`
- **Active nav** — `[aria-current="page"]`, `.active`, `[data-active="true"]` use `Highlight` / `HighlightText` so the user can tell which page they're on

The block is gated with `stylelint-disable scale-unlimited/declaration-strict-value` because system color keywords (Canvas, CanvasText, GrayText, Highlight, etc.) are the *entire point* of the block — tokens would defeat the OS-driven palette. The disable scope is exactly the @media block, nothing else.

### 7.2 aria-live regions for dynamic content

- **ProductsPage result count** (`.pp-page-count`) — now `aria-live="polite" aria-atomic="true"`. Filter changes announce "21 results" / "3 results · page 1 of 2" to screen readers.
- **CartDrawer subtotals** (`.cd-subtotals`) — now `aria-live="polite" aria-atomic="true"`. Add-to-cart and quantity-stepper changes announce the new subtotal.

These were the two highest-traffic dynamic regions in the customer journey that lacked a live region.

### 7.3 Heading hierarchy audit

Initial scan flagged ComboPairingPage and TeaProfilePage with multiple H1s. On inspection, both are mutually-exclusive render branches: `PairingNotFound` only renders when `combo` is undefined; the main `<h1>` only renders when it's defined. Only one H1 ever appears per page render. False positive — no fix needed.

(Static analysis can't see this without flow analysis. The static scan continues to read both branches; we leave it to be conservative.)

---

## Phase 8 — Performance & CWV

### 8.1 DNS prefetch for observability endpoints

Added in `index.html` after the existing Firebase `preconnect` block:

```html
<link rel="dns-prefetch" href="https://o4509073.ingest.sentry.io" />
<link rel="dns-prefetch" href="https://www.google-analytics.com" />
<link rel="dns-prefetch" href="https://www.googletagmanager.com" />
```

These fire only when the corresponding endpoint is actually hit (Sentry on the first error, GA when GTM loads, etc.). Zero cost when those env vars aren't set; saves 50-100ms of DNS resolution when they are.

`preconnect` was rejected for these because preconnect opens a real TCP+TLS connection. Both Sentry and GA are conditional — pre-opening connections that may never be used wastes battery + may not survive idle timeout. `dns-prefetch` is the right tool here.

### 8.2 What we did NOT do (deliberately)

- **Font preload via `<link rel="preload" href="…woff2">`** — rejected. `@fontsource/*` files are hashed by Vite, so static preload paths in `index.html` can't be reliably pinned. The packages already set `font-display: swap` so we get the right behavior (instant render with fallback, swap when ready).
- **`startTransition` wrapping for ProductsPage filter toggles** — rejected. ProductsPage already uses `useDeferredValue` on `search` (the slowest input). Toggles are discrete clicks, not typing — wrapping them would lag the checkbox tick without measurable grid-render benefit. Confirmed via render tree inspection: filter-set state updates already run in a single batch with `setPage(1)`.

### 8.3 Existing perf work that holds up

The codebase already had: AVIF + WebP variants in `<LazyImage>` with `<picture>`, lazy-loaded admin chunks (recharts isolated), Firebase modular SDK with feature-by-feature splitting, `useDeferredValue` on search inputs, useMemo on the filter pipeline, route-level prefetch on Navbar/Footer links, View Transitions on primary nav. We didn't redo any of it.

---

## Phase 9 — Mobile-First & Cross-Device

### 9.1 Web Share Target (PWA)

Added to the manifest in `vite.config.ts`:

```ts
share_target: {
  action: '/share',
  method: 'GET',
  params: { title: 'title', text: 'text', url: 'url' },
},
categories: ['food', 'shopping', 'lifestyle'],
```

Created `src/app/pages/SharePage.tsx` — a redirect-only component (no UI) that parses the incoming share payload and routes to:

1. The matching tea profile if the shared URL is `/tea-profile/:cat/:slug`
2. The matching pairing page if the shared URL is `/pairings/:slug`
3. `/products?q=<title>` with search prefilled (capped to 80 chars) if there's a title/text
4. `/products` (catalog) as a fallback

Wired as an **eager** route in `App.tsx` (not lazy) — a redirect-only landing should not trigger a chunk fetch on arrival. Eager-importing it costs ~0.5 KB on the main entry, which is well within budget.

Safari iOS doesn't implement Web Share Target as of 2026, but Chrome / Edge / Samsung Internet on Android (plus desktop Chrome on Windows) cover the majority of mobile-share traffic. Zero cost on unsupported browsers.

### 9.2 Custom PWA install prompt at high-intent moments

Two new files:

**`src/hooks/usePwaInstall.ts`** — manages the `beforeinstallprompt` event, exposes `{ canInstall, promptInstall, dismiss }`. Includes:

- 30-day dismiss cooldown via `localStorage.eleInstallDismissedAt`
- `appinstalled` listener that flips `localStorage.eleInstalled = '1'` so we never re-prompt after install
- `display-mode: standalone` check (already installed → never show)
- Null-safe on browsers without the event (Safari desktop, Firefox)

**`src/app/components/PwaInstallBanner.tsx`** — the visible UI. Renders only when:

- The browser's beforeinstallprompt event has fired
- The user isn't in a cooldown
- The app isn't already installed
- **AND** one of: cart has items, OR the user is anywhere except `/`

That last gate is the high-intent filter. First-time landers on the home page don't see it. Once they engage (browse to a category, add to cart, navigate to checkout/account), they do.

The banner is bottom-anchored, respects `env(safe-area-inset-bottom)`, animates in (entrance collapses to fade for `prefers-reduced-motion: reduce`), and stacks vertically on viewports < 380px. Dismiss button has `aria-label="Dismiss install prompt"`; the region has `role="region" aria-label="Install Ele Café app"`.

Styles live in `design.css` under the `/* PWA INSTALL BANNER */` section. ~80 lines of CSS, ~0.61 KB gzipped.

### 9.3 Existing mobile work that holds up

Already in place from pre-Phase 9 work: 10 `safe-area-inset` usages across fixed/sticky elements, a `@container` query usage, the announcement bar's swipe gesture, the existing manifest with proper icons. We didn't redo any of it.

### 9.4 What we did NOT do (deliberately)

- **Container queries migration of all media queries** — too large a refactor for one sprint; would touch ~80 components. Deferred to a future targeted sprint when there's a concrete component-portability need.
- **Swipe-to-dismiss on CartDrawer** — would need a gesture library (~3 KB gzipped) for a feature that the existing X-button + overlay-tap already covers well. Cost/benefit doesn't justify.
- **Screenshots in the manifest** — needs real product screenshots in `/public/screenshots/`. Configured as commented-out forward path so adding them later is a 1-line change.

---

## Bundle deltas vs Phase 0-6 closeout

| Chunk | After 0-6 (gz) | After 7-9 (gz) | Δ |
|---|---|---|---|
| main entry | 36.32 KB | 37.08 KB | +0.76 KB (SharePage + PwaInstallBanner eager-imported; intentional) |
| icons (lucide-react) | 7.76 KB | 7.82 KB | +0.06 KB (Download + X icons for the banner) |
| css | 49.02 KB | 49.63 KB | +0.61 KB (banner styles + expanded forced-colors block) |
| schemas | 29.40 KB | 29.40 KB | 0 |
| vendor | 50.77 KB | 50.77 KB | 0 |
| firebase total | 122.45 KB | 122.45 KB | 0 |
| react-core | 73.61 KB | 73.61 KB | 0 |
| data-layer | 5.50 KB | 5.50 KB | 0 |

Total delta: **+1.43 KB gzipped** across the whole app for everything Phase 7-9 added.

**Watch item**: CSS is at 49.63 KB / 50 KB budget. Next CSS additions need to displace something. Easiest displacement candidates: the verbose flexbox utility blocks that mostly duplicate Tailwind classes already available.

---

## Files modified

**New:**
- `src/schemas/checkout.schema.ts` (already shipped in Phase 6 closeout)
- `src/app/pages/SharePage.tsx`
- `src/app/components/PwaInstallBanner.tsx`
- `src/hooks/usePwaInstall.ts`
- `PHASE_7_9_CLOSEOUT.md` (this file)

**Modified:**
- `src/styles/focus.css` — expanded forced-colors block from 14 lines to ~120 lines covering all interactive surfaces
- `src/styles/design.css` — appended ~80 lines for PWA install banner
- `src/app/pages/ProductsPage.tsx` — `aria-live` on result count
- `src/app/components/CartDrawer.tsx` — `aria-live` on subtotals
- `index.html` — 3 dns-prefetch entries
- `vite.config.ts` — Web Share Target + categories in PWA manifest
- `src/app/App.tsx` — imported SharePage + PwaInstallBanner, wired `/share` route, mounted banner

---

## What's still pending

Same external-infra items as Phase 0-6: real `.env`, Firebase project setup, Cloud Functions secrets, visual regression baselines, Playwright test users, optional Sentry DSN / Chromatic token. None are codebase items.

Phase 10-12 (Microinteractions & Motion, Personalization, Continuous Quality Governance) and the 13-18 extension are the natural next bars.
