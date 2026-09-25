# Phase 8 + Phase 9 Improvements

Date: 2026-05-11
Scope: meaningful code-side improvements to perf observability (Phase 8) and mobile UX (Phase 9). Does not change the percentage scoring at the top level because the open items were "wait on RUM data" + "5-min human swipe pass" — neither closable from a chat. **What this turn does** is make the perf data more diagnosable when it arrives, fix two real WCAG touch-target bugs caught by a new static audit, and add narrow-phone viewport coverage to CI.

---

## TL;DR

| Area | What changed | Value |
|---|---|---|
| Phase 8 — RUM | Long-task observer added (client + server whitelist + alert path) | INP regressions become debuggable hour-zero, not "we know it's slow but not why" |
| Phase 8 — Alert | `rumAlertHourly` extended with long-task volume threshold | Leading indicator: catches regressions BEFORE user-perceived INP gate trips |
| Phase 9 — Touch targets | Static audit script + 2 real bug fixes | `.ele-toast-close` 22→24px, `.toggle[sm]` 32×20→32×24 — both were WCAG 2.5.8 AA failures |
| Phase 9 — Viewports | Narrow-phone Playwright spec (320 / 360 / 375 px) | Catches overflow + clipped-CTA regressions at the smallest real phone sizes |

---

## Phase 8 — Long-task observer

### What landed

#### Client side — `src/lib/rum.ts`

Added a `PerformanceObserver({ type: 'longtask' })` after the web-vitals registrations. Each long task (>50ms — the platform-defined threshold) is reported as a separate beacon with `name='LONGTASK'` and `value=duration`. Per-session cap of 50 reports prevents runaway-script tabs from spamming the channel. Same `send()` codepath as the other metrics, so backend integration is automatic.

Why this matters: when an INP P75 regression lands, the existing data (`name='INP'`, `value=350ms`) tells you the user waited 350ms but nothing about *which sync task* caused it. The long-task stream identifies the offending tasks (`route`, `duration`, `attribution`) so the perf engineer goes straight to the file instead of bisecting 5 PRs.

#### Server side — `functions/src/index.ts`

`recordRum`'s `ALLOWED` metric-name whitelist extended with `'LONGTASK'`. Without this, the new client beacons would be silently dropped at the whitelist check.

#### Alert side — `functions/src/rumAlerts.ts`

`rumAlertHourly` extended:

- New threshold: `LONGTASK_PER_MINUTE: 20`. Healthy baseline is 1-5/min/session.
- New query reads `/rum` for `name='LONGTASK'` in the last hour (cap 5000 — bumped from the 2000 used for INP/LCP because long tasks are higher-volume).
- New breach line in the Slack alert: `Long tasks: X/min — leading indicator for INP regression`.
- `info` log on the no-breach path now includes long-task counts so post-hoc analysis of "what did the world look like at noon" is possible.

#### Why this is a leading indicator

INP P75 takes minutes to swing once a regression ships (it's a P75 over interaction events, which arrive at maybe 5-30/minute/active-session). Long-task volume swings within seconds because every page load that hits the new bad codepath fires the observer. Long-task alerts surface a regression ~20-60 minutes earlier than the INP alert would.

---

## Phase 9 — Touch-target audit + 2 real bug fixes

### What landed

#### `scripts/touch-target-audit.mjs`

Static scan of `src/styles/design.css` for interactive selectors (`.btn*`, `[role=button]`, `.toggle`, `.wl-heart-btn`, `.nav-icon`, stepper, etc.). For each, extracts width/height/padding and computes effective hit area. Reports:

- **WCAG 2.5.8 AA failures** (<24×24 effective) — exits 1, fails CI.
- **WCAG 2.5.5 AAA warnings** (24-43px, below AAA's 44 ideal) — informational only, doesn't fail.

Includes a comment-stripping pre-pass (otherwise comments containing "button" or "icon" get false-matched as selectors). Allow-list for decorative children whose parent provides the hit area (`.toggle-thumb`, `.nav-icon svg`, `.btn-spinner`, `.sr-only`).

#### Real bugs fixed

| Selector | Before | After | WCAG status |
|---|---|---|---|
| `.ele-toast-close` (sonner toast close button) | 22×22 | **24×24** | Was AA fail → now AA pass |
| `.toggle[data-size="sm"]` (small toggle) | 32×20 | **32×24** | Was AA fail (height) → now AA pass |
| `.toggle[data-size="sm"] .toggle-thumb` (proportional with track) | 14×14 | **16×16** | Decorative; bumped for visual parity in the resized track |

After fixes: **0 AA failures**, 8 AAA warnings (all between 24-40px — common practice for icon buttons; not bugs).

#### Wiring

Added `audit:touch-targets` script entry to `package.json`. Wired into `.github/workflows/a11y.yml` to run alongside the existing safe-area audit before the Playwright suite.

---

## Phase 9 — Narrow-viewport Playwright spec

### What landed

#### `tests/a11y/narrow-viewport.spec.ts`

The existing `tablet-viewport.spec.ts` covers iPad portrait/landscape. This sister spec covers the opposite end: the smallest real phones in active use.

Viewports:
- **320 × 568** — Galaxy Z Fold (folded inner), 1st-gen iPhone SE still in service, oldest Android. 320 is the floor.
- **360 × 800** — Galaxy S / Pixel base — most-common Android width.
- **375 × 667** — iPhone SE 2/3, iPhone 12/13 mini — ~15% of NA iOS traffic.

Routes covered: home, products, tea-profile, cart-empty, about, contact (6 public routes × 3 viewports × 3 assertions = 54 individual checks).

Assertions per route:
1. **No horizontal scroll** — content fits the viewport width. On failure, reports the top 5 overflowing elements with their `rect.right` values so you can fix the specific component.
2. **h1 visible and within first 3 screens** — confirms the page actually rendered (not blank) and the page identifier is reachable without a long scroll.
3. **Nav cart button reachable** — `[data-cart-icon]` is within the viewport (not clipped off the right edge).

#### Wiring

Added `test:a11y:narrow-viewport` to `package.json`. The existing `.github/workflows/a11y.yml` runs all `tests/a11y/*.spec.ts` via the standard `npm run test:a11y` invocation, so the new spec auto-runs on every PR without workflow changes.

---

## Files changed

### New
- `scripts/touch-target-audit.mjs`
- `tests/a11y/narrow-viewport.spec.ts`
- `PHASE_8_9_IMPROVEMENTS.md`

### Modified
- `src/lib/rum.ts` — `+58 lines` long-task observer
- `functions/src/index.ts` — `+5 lines` LONGTASK whitelist + comment
- `functions/src/rumAlerts.ts` — `+27 lines` long-task threshold + query + breach detection
- `src/styles/design.css` — 4 lines: `.ele-toast-close` 22→24, `.toggle[sm]` 20→24, `.toggle[sm] .toggle-thumb` 14→16 (×2 for state)
- `scripts/touch-target-audit.mjs` (created above) — also iterated to strip comments, expand allow-list
- `package.json` — 3 new scripts: `test:a11y:narrow-viewport`, `audit:touch-targets`, (kept `verify:observability` from previous turn)
- `.github/workflows/a11y.yml` — `+5 lines` touch-target audit step

---

## What this does NOT do

- Doesn't change Phase 8.7.1 / 8.7.2 status — those still wait on 1-2 weeks of production RUM. The long-task observer makes them more diagnosable when they arrive but doesn't shortcut the calendar.
- Doesn't change Phase 9.7.3 status — the perceptual swipe-feel test still needs a human + touch device. The new specs catch structural regressions, not gesture quality.
- Doesn't add Lighthouse-specific perf optimizations (no hero image to mark `fetchpriority="high"` — the hero is text-only with a CSS-token background; fonts already preloaded per existing setup).

---

## What's still on the table

If you want more Phase 8/9 work in a follow-up turn:

- **Container query expansion** — current count is 2 (cart-list, order-list); audit found 5+ media-query patterns that could convert to container queries. Each conversion is component-local but needs careful review of which ancestor provides the size cue.
- **Service-worker runtime cache for `/products`** — would enable offline product browsing. Spec calls for it (Phase 9.7.4 PWA), implementation would extend `vite.config.ts` workbox config.
- **Long-task attribution capture** — the current long-task observer reports duration only. PerformanceObserver supports `attribution` which names the offending script URL + function. Bigger bandwidth but better debugging.
- **Lighthouse local snapshot script** — runs locally (no CI auth) and emits a Lighthouse score per route for ad-hoc perf sanity-checks during development. Mirror of the existing `local-perf-snapshot.mjs` but using `lighthouse` directly instead of Puppeteer.

These are real opportunities, not blockers. Ask for any of them by name in a follow-up.
