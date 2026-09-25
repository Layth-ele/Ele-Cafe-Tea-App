# Phase 17 — Desktop Scroll Fix

Date: 2026-05-20
Scope: One file (`src/styles/design.css`), the html/body overflow rules.

---

## Symptom (reported by merchant)

> "In mobile size screens app page scrolling but in desktop size not.
>  All pages in desktop size only."

Every page on desktop felt locked — content extended past viewport
but the user couldn't scroll to it. Mobile worked correctly.

## Root cause

The base stylesheet had:

```css
html, body {
  /* ... */
  overflow-x: hidden;
  width: 100%;
  max-width: 100vw;
}
```

`overflow-x: hidden` was applied to **both** html AND body. Per the
CSS spec, when an element has `overflow-x` set to a non-visible
value, the computed `overflow-y` cannot stay `visible` — it gets
promoted to `auto`. So:

- `<html>` became a scroll container (correct)
- `<body>` ALSO became a scroll container (the bug)

You now have two stacked scroll containers competing for the
scrollable height. On desktop browsers, with a reserved 15px
scrollbar gutter and `max-width: 100vw` on body, the layout often
resolved to:

- `<html>`'s scroll target was usurped by `<body>`
- `<body>`'s own height matched the outer `.min-h-screen` flex
  column at exactly `100dvh`
- Neither container reported any scrollable overflow
- **Result: page feels locked**

Mobile dodged this because the visual-viewport meta tag pins the
layout differently, so body's own scroll worked.

## Fix

Move horizontal clipping to `html` only, and use `overflow-x: clip`
instead of `hidden`:

```css
html {
  overflow-x: clip;       /* clips horizontally — does NOT create scroll container */
}
/* body deliberately omitted from overflow rules */
```

`overflow-x: clip` (Chrome 90+, Safari 16+, Firefox 81+, all 2020-2022)
clips visually without establishing a new scroll container. This
means:

- Horizontal overflow is still clipped at the document level
- Body's `overflow-y` stays at the default `visible`
- Body is NOT a scroll container
- Document-level vertical scrolling works correctly on every page

For browsers older than the 2020-2022 cutoff, `overflow-x: clip`
falls back to `overflow-x: visible` — a cosmetic regression (horizontal
overflow stops being clipped) but NOT a functional break. The
target browser baseline for this app is well past those cutoffs.

## Files changed (1)

```
src/styles/design.css        ~30 lines (the html/body block restructured;
                              + a detailed comment explaining the
                              cause so the next maintainer doesn't
                              "fix" it back to the broken pattern)
```

## Verification

- ✅ Brace balance ✓ (3473 open / 3473 close)
- ✅ All other html/body rules preserved (`scroll-behavior`,
  `scroll-padding-top`, `padding-top`, `padding-bottom`,
  `overscroll-behavior-y`, `touch-action`, safe-area insets)
- ✅ `width: 100%; max-width: 100vw` still on body as the
  belt-and-braces against rogue fixed-width children
- ✅ No other rules in design.css depend on body being a scroll
  container (the file uses `position: fixed` for navbar / drawers
  / modals, all anchored to the viewport, not body)

## How to verify the fix worked

1. Build + run: `pnpm dev`
2. Open any page on desktop in a 1920×1080 browser
3. Open DevTools console, paste:
   ```js
   console.table({
     htmlOverflow:    getComputedStyle(document.documentElement).overflow,
     bodyOverflow:    getComputedStyle(document.body).overflow,
     bodyOverflowY:   getComputedStyle(document.body).overflowY,
     pageHeight:      document.body.scrollHeight,
     viewportHeight:  window.innerHeight,
     canScroll:       document.body.scrollHeight > window.innerHeight,
   });
   ```
4. Expected output: `bodyOverflowY: 'visible'` (was `'auto'` before fix),
   and the page scrolls when `canScroll: true`.

## What was NOT changed

- Modal scroll lock (`bodyScrollLock.ts`) — unaffected; still sets
  `body.style.overflow = 'hidden'` when a modal opens, which works
  correctly because that's an inline style (highest specificity)
  and intentionally overrides defaults
- Admin layout (`.adm-shell` flex column with sticky sidebar) — still
  works; nothing in that layout depended on body being a scroll
  container
- Mobile behavior — unchanged; mobile was already working correctly
  via the visual-viewport meta path

End of Phase 17.
