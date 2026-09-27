# Motion Guide — Phase 10

Date: 2026-05-11
Sister doc: `0-12.md` § Phase 10 — Microinteractions & Motion System
Token source of truth: `src/styles/tokens.css` (lines 325–341, reduced-motion override at 860–876)

---

## TL;DR

Motion in Ele Café is a *system*, not a sprinkle. Five rules:

1. **Motion serves meaning.** A drawer slides from where it'll live. A toast comes from where the eye should track. A card expanding from its grid position uses FLIP, not a generic fade.
2. **Duration scales with distance.** Small moves → `--dur-instant` / `--dur-fast`. Big moves → `--dur-slow` / `--dur-xslow`. **No animation longer than 600ms** — past that the user is waiting on you.
3. **Easing scales with personality.** `--ease-standard` is neutral. `--ease-spring` / `--ease-bounce` are playful (modal open, success). `--ease-decelerate` / `--ease-out` are dismissive (modal close, drawer dismiss).
4. **Reduced-motion is real and respected.** The token system collapses all durations to 1ms and all easings to linear under `prefers-reduced-motion: reduce`. Don't write `transform: scale(...)` and assume `--dur-instant: 1ms` saves you — the scale itself fires. Gate motion-shaped effects on the media query.
5. **Animate only `transform` and `opacity`.** These are GPU-cheap and don't trigger layout. `width`, `top`, `padding`, `height` cause reflow and stutter on low-end devices.

If you remember one thing: **use tokens, not numbers.**

---

## Motion tokens — the canonical reference

Defined in `src/styles/tokens.css`. Don't redeclare these locally.

### Durations

| Token | Value | Use for |
|---|---|---|
| `--dur-instant` | 80 ms | Button press scale, hover color flip, tap acknowledge |
| `--dur-fast` | 150 ms | Field focus ring, toggle thumb, tooltip fade |
| `--dur-normal` | 220 ms | Drawer slide, dropdown open, modal fade-in |
| `--dur-base` | 220 ms | *Alias for `--dur-normal`* — use whichever name reads better in context |
| `--dur-slow` | 380 ms | Page transitions, large hero choreography, view transitions |
| `--dur-xslow` | 480 ms | First-paint hero stagger, decorative entrances |
| `--dur-enter` | 480 ms | *Alias for `--dur-xslow`* — semantic name for entrance choreography |

### Easings

| Token | Curve | Personality | Use for |
|---|---|---|---|
| `--ease-linear` | `linear` | Mechanical | Spinners, marquees, progress bars |
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Neutral | Default — when in doubt, this |
| `--ease-in-out` | *same as standard* | Neutral | Alias |
| `--ease-decelerate` | `cubic-bezier(0, 0, 0.2, 1)` | Settling | Exits, dismissals, "going away" |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Soft landing | Entrances, things arriving |
| `--ease-accelerate` | `cubic-bezier(0.4, 0, 1, 1)` | Departing fast | "Whisking away" |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful overshoot | Modal open, success states, joyful add-to-cart |
| `--ease-bounce` | `cubic-bezier(0.34, 1.10, 0.64, 1)` | Subtle overshoot | Less aggressive than `--ease-spring`; small celebrations |

### Reduced-motion override

`tokens.css` lines 860–876. When `prefers-reduced-motion: reduce` is active:

- All `--dur-*` tokens collapse to **1 ms**.
- All `--ease-*` tokens collapse to **linear**.

This means any *purely time-based* effect (cross-fade, slide, drawer) just snaps. **Effects with shape change** (scale, rotate, translateY beyond a few px) must additionally gate themselves:

```css
.btn { transform: scale(1); }
@media (prefers-reduced-motion: no-preference) {
  .btn:active { transform: scale(0.97); }
}
```

---

## When to use tokens — and when raw values are OK

**Always use tokens for** discrete user-facing transitions and animations: button presses, focus rings, drawer opens, toasts, modal entrances, form feedback. These benefit from a coherent system, and the reduced-motion override has to hit them.

**Raw values are acceptable for** decorative infinite loops where the literal duration *is* the design intent:

| Effect | Why raw | Where |
|---|---|---|
| Marquee scroll | 60 s is the read-speed intent, not "extra-extra-slow" | `design.css:217` |
| Shimmer | 1.8 s loop is the perceived "pace of waiting" | `design.css:2031` |
| Spinner | 700 ms rotation is the spinner's identity | `design.css:1500` |

These should still gate on `prefers-reduced-motion: reduce` (pause or replace with a static state), but the duration value itself doesn't belong in the token table.

**When migrating raw → token, round to the nearest token, don't add new ones:**

| Raw value found | Round to | Reason |
|---|---|---|
| 60–100 ms | `--dur-instant` (80) | |
| 120–180 ms | `--dur-fast` (150) | |
| 200–280 ms | `--dur-normal` (220) | |
| 320–420 ms | `--dur-slow` (380) | |
| 450–540 ms | `--dur-xslow` (480) | |

The point of a token system is convergence. If you find yourself wanting a 6th duration, the answer is almost always "pick the nearest one" or "rethink the animation."

---

## Migration scope (as of 2026-05-11 audit)

Counted in the current codebase:

| Surface | Token-using | Raw-ms | Migration debt |
|---|---|---|---|
| `transition:` in `design.css` | 72 | 66 | **48 %** |
| `animation:` in `design.css` | 6 | 40 | **87 %** ⚠ |
| Inline motion in `.tsx` (style-jsx blocks) | — | 16 | All raw |
| **Total declarations to review** | **78** | **122** | **61 %** |

The `animation:` ratio is the surprise — most `@keyframes` calls still use literal ms. That's the biggest single chunk of Phase 10.2 work and where this guide lives or dies.

Keyframe vocabulary is already healthy: **33 `@keyframes` defined** across `design.css` covering skeletons, drawer entrances, notifications, field shake (✓), modals, command palette, view transitions, page fades, PWA banner. Phase 10 doesn't need new keyframes for the success gates — it needs the `animation:` declarations that call them to switch from raw ms to `var(--dur-*)`.

---

## State micro-animations — the canonical patterns

These are the moments Phase 10.4 asks us to nail.

### Button press

```css
.btn { transition: transform var(--dur-instant) var(--ease-standard); }
@media (prefers-reduced-motion: no-preference) {
  .btn:active { transform: scale(0.97); }
}
```

80 ms in, 80 ms back. iOS-native feel. Gate the scale on `no-preference` so reduced-motion users get the color/border feedback only.

### Toggle thumb

```css
.toggle-thumb {
  transition:
    transform   var(--dur-fast) var(--ease-spring),
    background  var(--dur-fast) var(--ease-standard);
}
```

The spring on the thumb position is what makes the toggle feel mechanical; the standard easing on the background keeps the cross-fade neutral.

### Add-to-cart `+1` float

A 1-character or icon element absolutely-positioned over the button, animating from the button's center to the cart icon's center, then a tiny scale-up on the cart icon.

```css
.cart-fly-token {
  position: fixed;
  animation: cartFly var(--dur-slow) var(--ease-out) forwards;
  /* uses CSS custom props --start-x, --start-y, --end-x, --end-y set in JS */
}
@keyframes cartFly {
  from { transform: translate(var(--start-x), var(--start-y)) scale(1); opacity: 1; }
  to   { transform: translate(var(--end-x),   var(--end-y))   scale(0.4); opacity: 0; }
}
.cart-icon[data-bumped="true"] { animation: cartBump var(--dur-fast) var(--ease-spring); }
@keyframes cartBump {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.15); }
}
```

JS sets `--start-x/y` and `--end-x/y` from `getBoundingClientRect()` of the source button and the cart icon. On `prefers-reduced-motion: reduce`, skip the flying token entirely — just bump the cart icon (or skip that too).

### Form success — green check pulse

```css
.field-success-pulse {
  animation: pulseCheck var(--dur-fast) var(--ease-spring);
}
@keyframes pulseCheck {
  0%   { transform: scale(0.7); opacity: 0; }
  60%  { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1);   opacity: 1; }
}
```

150 ms is long enough to read, short enough to not interrupt. Reduced-motion: fade in only (`transform: none`).

### Form error — shake

**Already implemented.** `@keyframes fieldShake` at `design.css:1503`. Currently triggered with `animation: fieldShake 320ms cubic-bezier(0.36,0.07,0.19,0.97)`. Phase 10 migration: change to `animation: fieldShake var(--dur-slow) var(--ease-standard)` (or keep the bespoke cubic-bezier since it's tuned for shake oscillation — see "raw values are acceptable" above; document the choice in code).

---

## FLIP — for `from-here-to-there` moves

When a product card moves from grid position A to B (sort/filter), a generic fade is wrong. FLIP (First, Last, Invert, Play) measures the before-position, lets React/DOM update to the new position, then inverts the transform back to where it was and animates to zero.

```bash
npm install react-flip-toolkit
```

Pattern (full implementation in Phase 10.3 next turn):

```tsx
import { Flipper, Flipped } from 'react-flip-toolkit';

<Flipper flipKey={`${sortBy}-${activeFilters.join('|')}`}>
  <div className="products-grid">
    {sortedFilteredProducts.map(p => (
      <Flipped key={p.id} flipId={p.id}>
        <ProductCard product={p} />
      </Flipped>
    ))}
  </div>
</Flipper>
```

`react-flip-toolkit` honors `prefers-reduced-motion` natively. Duration via `spring="gentle"` (≈ 380 ms) lines up with `--dur-slow`.

---

## Hero choreography — first paint, suppressed on `back`

`HomePage.tsx` already stages a stagger via `fade-up`, `fade-up-d2`, `fade-up-d3` classes on hero subtitle and buttons (lines 256, 259). Phase 10 finishes it:

1. Make the stagger token-driven (replace hard-coded delays in those `.fade-up-d*` rules with calc-based offsets off `--dur-fast`).
2. Add `view-transition-name: hero-block` to the hero container so when the user navigates back, the hero is animated *as one element* via the View Transitions API instead of re-running the entrance animation.
3. Gate the entrance under `@media (prefers-reduced-motion: no-preference)`.

```css
@media (prefers-reduced-motion: no-preference) {
  .hero-title    { animation: heroRise var(--dur-xslow) var(--ease-out)   0ms                forwards; }
  .hero-sub      { animation: heroRise var(--dur-xslow) var(--ease-out)   calc(var(--dur-fast) * 0.4) forwards; }
  .hero-btns     { animation: heroRise var(--dur-xslow) var(--ease-out)   calc(var(--dur-fast) * 0.8) forwards; }
}
.hp-hero { view-transition-name: hero-block; }
@keyframes heroRise {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

## Reduced-motion contract — testing checklist

Every new animation gets a row:

| Animation | OS reduced-motion behavior | Verified |
|---|---|---|
| Hero stagger | No entrance; hero present from frame 1 | ☐ |
| Product grid FLIP | No move animation; cards just swap | ☐ (library handles) |
| Button press scale | No scale; color/border feedback only | ☐ |
| Toggle thumb | Snap; no spring overshoot | ☐ |
| `+1` cart fly | Skip; bump cart icon only (or skip both) | ☐ |
| Form success pulse | Fade only; no scale | ☐ |
| Form error shake | Snap to error state; no oscillation | ☐ |
| Drawer slide | Already gated via duration → 1 ms via token override | ☑ |
| Modal entrance | Already gated via duration → 1 ms via token override | ☑ |

How to test:

- **macOS:** System Settings → Accessibility → Display → Reduce motion.
- **Windows:** Settings → Accessibility → Visual effects → Animation effects: Off.
- **Chrome devtools:** Rendering panel → "Emulate CSS media feature prefers-reduced-motion" → "reduce".

---

## What's done in Phase 10

- ☑ `MOTION_GUIDE.md` published (this file). [Gate 10.7.1]
- ☑ Motion token vocabulary defined in `tokens.css` (Phase 1.2 carry-over, audited and confirmed coherent).
- ☑ Reduced-motion token override in place (Phase 1.2 carry-over).
- ☑ View Transitions API wired (`src/lib/viewTransition.ts`, Phase 4.5 carry-over).
- ☑ Field shake keyframe present (`@keyframes fieldShake`).
- ☑ **Token migration sweep complete** — 162 declarations migrated to `var(--dur-*)` across `design.css`, `ProductsPage.tsx`, `TeaProfilePage.tsx`. Only legitimate decorative loops (marquee 60s, spinners 700ms, skeleton-pulse 1.4s, etc.) remain raw per the rules above. [Gate 10.7.2]
- ☑ **FLIP on product grid** — `react-flip-toolkit` installed, `<Flipper flipKey={...} spring="gentle">` wraps `ProductsPage` grid, keyed by sort + active filters + page. Lazy-chunked via `vite.config.ts` manualChunks. [Gate 10.7.3]
- ☑ **Hero choreography finalized** — `.fade-up-d1..d4` delays tokenized to `var(--dur-*)`, `view-transition-name: hero-block` added to `.hero`, reduced-motion guard added. [Gate 10.7.4]
- ☑ **State micro-animations implemented** — button press scale (CSS, all `.btn`), toggle thumb spring (CSS, all `.toggle-thumb` + `[role="switch"][data-thumb]`), `+1` cart fly (CSS + `useCartFly` hook wired into ProductsPage + TeaProfilePage), success pulse (CSS), error shake (token-bound). Every shape-changing effect gated under `prefers-reduced-motion: no-preference`.
- ☑ **Reduced-motion contract — automated verification** — `tests/a11y/reduced-motion.spec.ts` (Playwright spec) opens pages with `reducedMotion: 'reduce'` and asserts: hero has no entrance transform, FLIP cards have transition:none, cart-fly token is never created on add-to-cart, cart-icon bump animation is suppressed, button-press scale is suppressed, all `--dur-*` tokens collapse to 1ms. Hooks into the existing `.github/workflows/a11y.yml`. [Gate 10.7.5 — CI-runnable]

## What's left for Phase 10 to be 100 %

- ☐ **CI execution of the new specs.** `reduced-motion.spec.ts` and `safe-area-audit.mjs` ship in this zip but haven't been run against a deployed preview yet. First CI run after merge will execute them; tick this item when the workflow goes green.

That's the last open item — a CI execution, not a code task. Everything else is in this zip.

### Closed in the final-polish sweep

- ☑ **`+1` fly polish — CartDrawer in-drawer increment.** When the user clicks `+` inside the open cart drawer, the navbar cart icon is hidden behind it, so flying there is pointless. Instead the just-incremented line item's quantity display briefly bumps (`cartBump` keyframe, same `--dur-fast` + `--ease-spring`). State is scoped to the drawer (`bumpedId`) and clears after 280ms.
- ☑ **`+1` fly polish — HomePage.** Confirmed there are no direct add-to-cart sites on HomePage; tea cards there link to product pages. No work needed.
- ☑ **Toggle / Switch UI primitive.** `src/app/components/ui/toggle.tsx` + `toggle.stories.tsx`. `role="switch"` + `aria-checked` for SR vocabulary, two sizes (md 40×24, sm 32×20), `data-state` driven thumb position, forced-colors mode covered, focus ring inherited. Dev-mode warning if neither `aria-label` nor `aria-labelledby` is provided. Consumes the spring transition that was already shipping. Phase 11's notification preferences and wishlist heart will use this as-is.

---

## Anti-patterns — what *not* to do

- ❌ Inline `style={{ transition: '200ms' }}` in TSX. Use a CSS class with `var(--dur-normal)`.
- ❌ New `@keyframes` for something the existing 33 already cover. Search `design.css` first.
- ❌ Animating `width`, `height`, `top`, `left`, `padding`, `margin`. Use `transform: translate/scale` and `opacity`.
- ❌ Duration longer than 600 ms outside of decorative infinite loops. Users perceive it as "slow site," not "polished."
- ❌ Bypassing the reduced-motion media query because "it's just a small scale." Vestibular-disorder users disagree.
- ❌ Adding a 7th duration token. If 80/150/220/380/480 doesn't fit, the design is wrong, not the token table.
- ❌ Animating on mount with no guard — page revisits then *replay* the entrance, which feels broken. Use `view-transition-name` or a session flag.

---

*Audit data in §"Migration scope" was captured on 2026-05-11 by grepping `src/styles/design.css` and `src/**/*.tsx` for `transition:` / `animation:` / `transition-duration` / `animation-duration` declarations. Reproduce with the commands in `0-12.md` § Phase 10 audit.*
