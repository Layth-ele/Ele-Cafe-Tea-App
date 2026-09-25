# Phase 21 — Sign-in Modal Viewport Anchor Fix

Date: 2026-05-21
One-line summary: portal the sign-in prompt to `document.body` so its
`position: fixed` is genuinely viewport-relative.

---

## Symptom

User opens `/gifts` as a guest, clicks "Build Your Tea Bundle". The
sign-in prompt overlay appears, but the modal panel itself is far
below the visible viewport — only the top edge is visible at the
bottom of the screen. User has to scroll down to see "Sign in to
build your bundle". On a tall enough viewport the panel might not
appear at all without scrolling.

---

## Root cause

In `App.tsx`:

```tsx
<main id="main-content" className="flex-1 page-enter">
```

`.page-enter` is defined as:

```css
.page-enter { animation: fadeUp var(--dur-slow) var(--ease-out) both; }

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Two things conspire:

1. **`animation-fill-mode: both`** preserves the final keyframe state
   after the animation ends.
2. **The final keyframe sets `transform: translateY(0)`** — an
   identity transform, but a non-`none` transform value all the same.

Per CSS spec ([CSS Transforms §3](https://www.w3.org/TR/css-transforms-1/#transform-rendering)):

> Any value other than `none` for the `transform` property results
> in a new containing block being established for all positioned
> descendants — including `position: fixed`.

So `<main>` becomes the containing block for every fixed-position
element inside it. The sign-in prompt was rendered inside
`<GiftsPage>` which is inside `<main>`. Its `position: fixed; inset: 0`
no longer means "fill the viewport" — it means "fill `<main>`".

On `/gifts`, `<main>` is the entire scrollable page content
(thousands of pixels tall on long pages). The overlay covered all
of it. `align-items: center` then centered the panel halfway down
the document, which on a tall page sits far below the viewport.

This is the classic "fixed positioning doesn't work inside transformed
ancestors" gotcha — one of the better-known CSS footguns.

---

## Fix

Portal the modal directly into `document.body`, bypassing every
parent containing-block constraint. Standard pattern; `Modal.tsx`
already does this (`createPortal(..., document.body)` at line 238).

```diff
- import React, { useState } from 'react';
+ import React, { useState, useEffect } from 'react';
+ import { createPortal } from 'react-dom';
+ import { lockBodyScroll } from '@/lib/bodyScrollLock';

- {signInPromptOpen && (
+ {signInPromptOpen && createPortal(
    <div className="gp-signin-overlay" ...>
      ...
    </div>
- )}
+ , document.body)}
```

While I was in there I also added two affordances that the modal
should have had from the start:

- **Body scroll lock** via `lockBodyScroll()` (the same ref-counted
  helper Modal.tsx uses) so the dimmed page underneath can't be
  scrolled away from under the dialog.
- **Escape key closes** the prompt — standard dialog behavior.

---

## Files touched (1)

```
src/app/pages/GiftsPage.tsx     +35 lines
```

No CSS changes needed. The CSS was already correct — only the React-side
rendering location needed to change.

---

## Why not "remove the translateY from fadeUp"?

Considered. Two reasons not to:

1. **It would break the rise animation** — the whole point of
   `fadeUp` is the 16px translateY → 0 motion on page enter. Removing
   it leaves only opacity, which feels flat.
2. **It only fixes this one symptom.** Other places in the app use
   transforms intentionally (e.g. card hover lifts, the navbar's
   sticky behavior on scroll). Anywhere a fixed-position modal lives
   inside a transformed ancestor would still break. Portalling is
   the architectural fix; suppressing one transform is a patch.

---

## Why not "use `transform: none` in the `to` keyframe"?

Also considered. `transform: none` doesn't create a containing block,
so it would work for THIS particular case. But:

- It changes the public contract of `.page-enter` — if anything else
  in the codebase depends on the post-animation transform being a
  no-op identity rather than truly absent, it could regress.
- It still leaves the architectural flaw — any future page-level
  animation that uses transform could trigger the same bug for a
  future modal.

Portal is the right architectural choice. The keyframe stays as it is.

---

## Verification

After `pnpm dev`:

1. Sign out
2. Visit `/gifts` (or scroll partway down the page first)
3. Tap "Build Your Tea Bundle"
4. The "Sign in to build your bundle" modal should appear
   **immediately centered** in the visible viewport, regardless of
   how far down the page you've scrolled
5. The page underneath should NOT scroll when you swipe / wheel
   inside the overlay
6. Press Escape — modal closes

End of Phase 21.
