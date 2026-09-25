# Audit & Optimization Report — Round 3 (Layout / Modals / Mobile)

Date: 2026-05-05
Scope: deep layout audit with emphasis on modals, consistency, and
mobile/iOS performance — third pass of the audit series.

Builds on the original `AUDIT_REPORT_2026_05_05.md` (round 1: failing
test, lazy SeedButton, dev env warning, type cleanup) and
`AUDIT_REPORT_LIGHTHOUSE_FIXES.md` (round 2: license stripping, image
sizing, LCP priority, label fix).

---

## Issues found

### 1. Z-index chaos
**`tokens.css` defined `--z-modal`, `--z-drawer`, etc. — but nothing in
the codebase used them.** Raw numbers were sprinkled across components
and CSS:

| Layer                          | Found at         | Source       |
|--------------------------------|------------------|--------------|
| Cart drawer overlay            | `390`            | inline       |
| Cart drawer panel              | `400`            | inline       |
| Modal overlay                  | `800`            | inline       |
| Modal panel                    | `900`            | inline       |
| Welcome credit modal           | `950`            | css          |
| Notification overlay           | `9000`           | css          |
| Notification panel             | `9001`           | css          |
| Navbar drawer overlay          | `299`            | css          |
| Navbar drawer panel            | `300`            | css          |
| Search overlay                 | `250`            | css          |
| AdminAnalytics inline modal    | `400`            | inline       |
| Mobile filter drawer           | `300/400`        | inline css   |
| Gift-builder filter drawer     | `950/960`        | inline css   |
| Admin topbar sticky            | `30`             | css          |
| Tooltip on copy button         | `950`            | css          |

This was a layering-bug magnet. The notification panel at 9000+ outranking
modals was *probably* intentional (real-time payment alerts beating an
order detail modal), but with no documentation it wasn't enforced — the
gift-builder filter drawer had also reached for "950/960" because that's
the highest-looking value in the codebase. So a filter dropdown was
outranking the modal scrim around it.

### 2. Breakpoint chaos
**12 different breakpoint values in active use** across components — no
canonical scale, no tokens:

`360px, 380px, 480px, 540px, 599px, 600px, 640px, 768px, 880px, 960px, 1023px, 1024px`

This produces 40-pixel-wide ranges where one component thinks it's
"mobile" and a sibling thinks it's "tablet". Real bug surface.

### 3. Modal `90vh` on iOS Safari
`Modal.tsx` used `maxHeight: 'min(90vh, 800px)'`. On iOS, `vh` includes
the URL bar's reserved space, so 90vh was effectively 90% of the
SCROLL-collapsed viewport, which in practice cropped the modal's last
60-80px under the URL bar in normal portrait orientation.

### 4. ESC key cascades through modal stack
A confirm-on-modal pattern (admin clicks delete inside an edit modal)
dismissed BOTH dialogs on a single ESC press because every modal's ESC
listener fired independently. Lost form state, broke trust.

### 5. No focus trap
`Modal.tsx` set initial focus then let Tab escape into the underlying
page content — keyboard users could end up filling fields behind a
"blocking" dialog.

### 6. Modal injects `<style>` per render
The keyframes lived in a `<style>` tag inside the Modal component's JSX
output, so opening 3 modals in succession produced 3 identical stylesheet
inserts (deduplicated by browsers but still re-parsed).

### 7. Close button below WCAG AAA hit-target minimum
32×32 in a corner — under both WCAG AAA (44×44) and Apple HIG
recommendations. Easy mistakes on phones.

### 8. No `prefers-reduced-motion` path
Modal's spring easing (`cubic-bezier(0.34, 1.2, 0.64, 1)`) overshoots
deliberately — pleasant for most users, vestibular-disorder triggering
for some.

### 9. Backdrop blur uniform across viewports
`backdrop-filter: blur(6px)` is GPU-expensive on mid-range Android. Same
intensity on phones and desktops produced first-frame stutter on the
former.

### 10. Bypass modals reinvent infrastructure
`AdminAnalytics` date picker, `WelcomeCreditModal`, and `NotificationBell`
each implemented their own scroll-lock + ESC + z-index logic with subtle
behavioural differences.

### 11. No global iOS / mobile polish
- No `-webkit-tap-highlight-color: transparent` (iOS gray flash on every tap)
- No `touch-action: manipulation` (300ms double-tap zoom delay on every button)
- No `text-size-adjust: 100%` (landscape rotation auto-bumps text size, breaks `clamp()` typography)

### 12. Page wrappers used `100vh` instead of `100dvh`
9 customer-facing pages and the Admin layout had `minHeight: '100vh'`
which on iOS overflows when the URL bar is visible.

---

## Fixes applied

### A. Z-index ladder — fully tokenized
Expanded `tokens.css` with the missing tiers and a clear documentation
block:

```css
--z-below:        -1;
--z-base:          0;
--z-raised:        1;
--z-sticky:      200;
--z-dropdown:    250;
--z-overlay:     300;
--z-drawer:      400;
--z-drawer-panel: 410;
--z-modal:       800;
--z-modal-panel: 900;
--z-notification:      950;
--z-notification-panel: 960;
--z-toast:      1000;
--z-top:        9999;
```

**Migrated every meaningful raw z-index** across CSS and inline styles
to `var(--z-*)`. Built bundle now contains 7 distinct z-index tokens
in CSS, zero raw numbers in the modal/drawer/overlay range. Local
stacking-context values (0, 1, 2 inside cards, gallery slides, etc.)
were left as-is — they don't participate in the global ladder.

### B. Breakpoint tokens
Added `--bp-xs/sm/md/lg/xl` to `tokens.css` with documentation
explaining:
- The canonical 5-tier scale
- Why CSS `var()` doesn't work inside `@media` queries (spec hasn't
  shipped yet) and the workaround (declare the canonical, hand-write
  the @media)
- How to handle one-off breakpoints (leave a comment justifying)

Existing 12 ad-hoc breakpoints are left in place for now (touching
every component would be a separate refactor) but new code now has a
clear scale to reach for.

### C. `Modal.tsx` — full overhaul
1. **Token z-index**: `var(--z-modal)` + `var(--z-modal-panel)`
2. **`dvh`**: `max-height: min(90dvh, 800px)` with `vh` fallback
3. **Mobile slide-up**: ≤480px panel slides up from bottom, pinned to
   bottom edge, rounded-top corners (iOS-native sheet pattern)
4. **Real focus trap**: Tab/Shift+Tab cycle within the panel
5. **ESC stack**: only the topmost open modal handles Escape
6. **`prefers-reduced-motion`**: animations cut to 1ms linear
7. **Reduced backdrop blur on mobile**: 6px → 1.5px
8. **44×44 close button** (was 32×32) with the visible 32px circle
   nested inside as the visual
9. **Keyframes moved to `design.css`** under `.app-modal-*` selectors
10. **Focus restoration**: on close, focus returns to the element that
    triggered the modal
11. **`touch-action: manipulation`** + **`WebkitTapHighlightColor: transparent`**
    on every button

### D. Bypass modals migrated or aligned
- **AdminAnalytics date picker** → uses shared `Modal` + `ModalBtn` (gets
  scroll-lock, focus trap, ESC stack, mobile slide-up, dvh for free)
- **CartDrawer** → tokens + `100dvh`
- **NotificationBell panel** → token z-index + `100dvh` + reduced-motion path
  (kept its custom side-panel UX since it's structurally a sheet, not a
  centered modal)
- **WelcomeCreditModal** → token z-index in `design.css`
- **CheckoutPage confirm modal** → token z-index in `design.css`
- **Mobile filter drawers** (ProductsPage, GiftBuilder Step2) → tokens

### E. Global iOS / mobile polish
Added to the base layer of `design.css`:

```css
html, body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
button, [role="button"], a, input[type="button"], input[type="submit"] {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
```

Three nuisances eliminated app-wide in 6 lines of CSS.

### F. `dvh` everywhere viewport-height is used
- 9 customer page wrappers: `minHeight: '100vh'` → `'100dvh'`
- AdminLayout flex wrapper + sticky sidebar: `100vh` → `100dvh`
- ProductsPage sticky filter sidebar: `calc(100vh - 88px)` → `calc(100dvh - 88px)`
- `.min-h-screen` utility + `.page-shell` class: dual `100vh` + `100dvh`
  declaration for safe fallback on browsers older than dvh

---

## Files changed

```
src/styles/tokens.css                                       (+ tokens, breakpoints)
src/styles/design.css                                       (modal CSS rewrite, dvh, iOS polish, token migrations)
src/app/components/modals/Modal.tsx                         (rewrite v3)
src/app/components/CartDrawer.tsx                           (tokens, dvh)
src/app/components/Navbar.tsx                               (--z-sticky)
src/app/pages/admin/AdminAnalytics.tsx                      (migrate to shared Modal)
src/app/pages/admin/AdminLayout.tsx                         (dvh, --z-10)
src/app/pages/ProductsPage.tsx                              (filter drawer tokens, dvh sticky sidebar)
src/app/pages/CheckoutPage.tsx                              (dvh wrapper)
src/app/pages/LoginPage.tsx                                 (dvh wrapper)
src/app/pages/TeaProfilePage.tsx                            (dvh wrapper)
src/app/pages/CartPage.tsx                                  (dvh wrapper)
src/app/pages/GiftsPage.tsx                                 (dvh wrapper)
src/app/pages/SignupPage.tsx                                (dvh wrapper)
src/app/pages/OrdersPage.tsx                                (dvh wrapper)
src/app/pages/info/StaticPage.tsx                           (dvh wrapper)
src/app/components/gift-builder/steps/Step2PickTeas.tsx     (filter drawer tokens, dvh)
```

17 files modified in this round. Combined with rounds 1+2 and the
email-templates folder, total scope of audit work:

- **30 files modified** across the codebase
- **2 audit reports added** (this one + Lighthouse fixes)
- **1 email-templates folder added** (3 HTML auth templates + plain-text + preview + build script + README)

---

## Verification

| Gate                       | Result                                              |
|----------------------------|-----------------------------------------------------|
| `tsc --noEmit` (src)       | ✅ 0 errors                                         |
| `tsc --noEmit` (functions) | ✅ 0 errors                                         |
| `eslint --quiet`           | ✅ 0 errors                                         |
| `vitest run`               | ✅ 142 / 142 passing                                |
| `vite build`               | ✅ ~11 s, PWA generates                             |
| Static bundle audit        | ✅ 7 z-index tokens in CSS, 0 raw 9000+ values, dvh present, modal classes shipped |
| Firestore chunk minified   | ✅ 14 lines (from rounds 1+2 fix)                   |

---

## What was deliberately not done

- **Full inline-style → CSS-class migration**: tracked in
  `PHASE_3_PLAYBOOK.md`, ~1500 ESLint warnings, separate refactor.
- **Restyling individual pages**: out of scope for an audit pass — the
  page-level styles are already well-tuned, just needed the
  modal/drawer/iOS cleanup underneath.
- **Migrating remaining 12 ad-hoc breakpoints** to canonical tiers: each
  one needs design judgement (is 880px = navbar collapse a one-off
  worth keeping, or should it move to 768px?). Tokens are now in place
  so future code starts from the canonical scale.

---

## What you should notice as a user after this round

- **iOS Safari**: bottom of every modal/drawer no longer cropped under
  the URL bar
- **Modal animations**: silky on phones (no more first-frame stutter on
  mid-range Android)
- **ESC behaviour**: a confirm-over-modal correctly closes only the
  confirm
- **Tab inside modals**: focus stays trapped, doesn't escape to
  background page content
- **Tap response**: ~300ms snappier on every button (touch-action +
  no tap-highlight gray flash)
- **Reduced-motion users**: instant calm transitions, no overshoot bounce
- **Mobile modals**: slide up from the bottom edge like an iOS sheet
  instead of scaling in from the centre
