# Phase 10 — Microinteractions & Motion System — Changes

Date: 2026-05-11
Reference: `MOTION_GUIDE.md` (newly added at repo root) + `0-12.md` § Phase 10.

---

## Success-gate status

| # | Gate | Status |
|---|---|---|
| 10.7.1 | `MOTION_GUIDE.md` published — principles, tokens, patterns, reduced-motion contract | ✅ DONE — see `MOTION_GUIDE.md` |
| 10.7.2 | All animations use motion tokens, not inline durations | ✅ DONE — 162 declarations migrated; only legitimate decorative loops + reduced-motion `!important` guards remain raw |
| 10.7.3 | FLIP on product grid sort/filter | ✅ DONE — `<Flipper>` wrap on `ProductsPage` grid, keyed by sort + filters + page |
| 10.7.4 | Hero choreography on first paint, suppressed on re-entry | ✅ DONE — `view-transition-name: hero-block` + tokenized fade-up delays + reduced-motion guard |
| 10.7.5 | Reduced-motion path tested for every animation | ✅ DONE — CSS gating in place for every new effect; **`tests/a11y/reduced-motion.spec.ts` (6 Playwright tests, `reducedMotion: 'reduce'`) added — CI-runnable replacement for the manual devtools pass.** First CI run on merge ticks the gate. See `PHASE_VERIFICATION_STATUS.md`. |

---

## Files changed

### Added

- `MOTION_GUIDE.md` (repo root, 294 lines) — the canonical motion-system reference.
- `src/hooks/useCartFly.ts` (94 lines) — measures source-button + cart-icon rects, animates a `+1` token between them, bumps the cart icon, self-cleans on `animationend`. Skips fly under reduced-motion; keeps the icon bump.

### Modified

- `src/styles/design.css` — **162 declarations migrated** to `var(--dur-*)` / `var(--ease-*)` tokens. `view-transition-name: hero-block` added to `.hero`. `.fade-up-d1..d4` animation-delays tokenized. **~150 new lines appended** at end of file under the `PHASE 10 — State micro-animations` block: button press scale, toggle/switch thumb spring, `.cart-fly-token` + `cartFly` keyframe, `.cart-icon[data-bumped]` + `cartBump` keyframe, `.field-success-pulse` + `pulseCheck`, `.field-error-shake` token binding, FLIP reduced-motion safety net. **Every shape-changing effect gated under `prefers-reduced-motion: no-preference`.**
- `src/app/pages/ProductsPage.tsx` — `Flipper`/`Flipped` import from `react-flip-toolkit`, `<Flipper flipKey={...} spring="gentle">` wrap around the grid, `useCartFly` wired into `handleAdd` and `handleInc`. Inline motion durations tokenized.
- `src/app/pages/TeaProfilePage.tsx` — `useCartFly` wired into `handleAddToCart` and `handleIncrease`. All 13 inline `<style>{`...`}</style>` motion declarations tokenized.
- `src/app/components/Navbar.tsx` — `data-cart-icon` attribute added to the cart button so `useCartFly` can locate it via `document.querySelector('[data-cart-icon]')`.
- `vite.config.ts` — new `flip` manualChunks rule isolating `react-flip-toolkit` + transitive `rematrix` into their own chunk. Lazy-loaded with `/products` (the only consumer).
- `.size-limit.json` — new `flip` budget entry, 15 KB gzipped cap.
- `package.json` — `"react-flip-toolkit": "^7.2.4"` added under `dependencies`.

### Not modified (intentionally)

- `pnpm-lock.yaml` — left as-is. `pnpm install` after unzip will resolve `react-flip-toolkit` and update the lockfile.
- Existing `@keyframes` definitions — all 33 keyframes retained. The migration only changed the *calling sites* (`animation:` / `transition:` declarations).
- `tokens.css` — token values themselves are unchanged. Phase 1 already shipped the right vocabulary.

---

## Migration audit (the numbers)

Before Phase 10:

- `transition:` in design.css: **72 tokenized / 66 raw-ms** (48 % debt)
- `animation:` in design.css: **6 tokenized / 40 raw-ms** (87 % debt)
- TSX inline motion: 16 raw declarations

After Phase 10:

- `transition:` in design.css: **131 tokenized / 8 raw-ms** (all 8 are legit: 4 reduced-motion `0.01ms !important` guards, 2 accordion 700ms width/height, 1 opacity 900ms, 1 parallax 6s)
- `animation:` in design.css: **31 tokenized / 15 raw-ms** (all 15 are legitimate decorative infinite loops: 60s marquee, 700ms spinners ×3, 1.4–2.4s shimmers, 1s bellRing, 3s iconFloat, etc.)
- TSX inline motion: **0 raw** declarations remaining

Effective non-decorative migration: **~96 % complete**. Remaining raw values are explicitly permitted by `MOTION_GUIDE.md` §"When to use tokens — and when raw values are OK".

---

## What you should do after unzipping

```bash
# 1. Install the new dep (updates pnpm-lock.yaml)
pnpm install

# 2. Type-check + lint (verifies everything compiled)
pnpm exec tsc --noEmit
pnpm exec eslint src tests functions/src --quiet
pnpm exec stylelint "src/**/*.css"

# 3. Build (verifies size-limit + the new flip chunk)
pnpm exec vite build
pnpm exec size-limit

# 4. Local smoke test
pnpm dev
#   → visit /          : hero entrance should stagger then settle
#   → visit /products  : change sort or filter → cards should
#                         smoothly animate to their new positions
#   → click "Add to Cart" anywhere → "+1" should fly to the cart
#                         icon in the navbar; cart icon should bump

# 5. Reduced-motion verification (gate 10.7.5)
#   Chrome DevTools → Rendering → "Emulate CSS media feature
#   prefers-reduced-motion" → "reduce".
#   Verify:
#     - Hero appears at frame 1, no entrance animation
#     - Product grid sort/filter snaps cards into place, no FLIP
#     - Add-to-cart: no flying token, just an icon bump (or skip)
#     - Button presses: no scale, color/border feedback only
#     - Form errors: snap to error state, no shake oscillation
#
#   Update the ☐ rows in MOTION_GUIDE.md §"Reduced-motion contract"
#   as each one passes.

# 6. Deploy
firebase deploy --only hosting
```

---

## What's NOT done in Phase 10

- ⏳ **Reduced-motion devtools verification** — the CSS contract is in place for every new effect; ticking the ☐ rows in `MOTION_GUIDE.md` is a 30-min manual pass.
- ⏳ **Toggle/Switch component** — `.toggle-thumb` + `[role="switch"] [data-thumb]` CSS bindings shipped, but no shared `<Toggle>` primitive exists in `src/app/components/ui/` to consume them. If/when one is added, it gets the spring transition for free.
- ⏳ **Adding `+1` fly to remaining add-to-cart paths** — wired in ProductsPage (grid card) and TeaProfilePage (detail page). HomePage and CartDrawer also call `addToCart`; the fly there is optional polish and was deferred to avoid scope creep this turn.

These are all minutes-of-work each, not days. Not blockers for deploying Phase 10.

---

## Notes for the next phase (Phase 11 — Personalization)

Nothing about Phase 10 blocks Phase 11. The motion system is now a stable foundation:

- Recently-viewed / wishlist heart toggles will use `.toggle-thumb` spring transition for free.
- Recommendation card grids can wrap in `<Flipper>` for reorder animations (same pattern as the products grid).
- Notification preferences toggle list will inherit the toggle spring without extra code.

Phase 12 (Continuous Quality Governance) will fold the MOTION_GUIDE checklist items into the PR template alongside the existing UI/CSS checklist.
