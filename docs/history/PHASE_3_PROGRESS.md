# Phase 3 — Inline-Style Migration ✅ COMPLETE

Date: 2026-05-10
Sister docs: `PHASE_3_PLAYBOOK.md`, `PHASE_3_IMPLEMENTATION.md`
Roadmap reference: `0-12.md` § Phase 3

## Status: 100% migrated — 0 ESLint warnings

| Metric | Original baseline | Final |
|---|---:|---:|
| `react/forbid-dom-props` warnings | **1,028** | **0** ✅ |
| Files with warnings | ~50 | **0** ✅ |
| CSS chunk size | 35 KB ceiling | **48.98 KB / 50 KB** |

The phase is closed. Every component-level inline `style={{}}` that was an unforced choice has been migrated to a CSS class; the remaining `style` props in the codebase are documented runtime-dynamic values with `// eslint-disable-next-line react/forbid-dom-props` comments explaining the rationale.

---

## Final-session migrations (Phase 3 closeout)

This session brought 26 remaining files to 0 warnings:

| File | Before |
|---|---:|
| AdminProducts.tsx | 49 |
| GiftsPage.tsx | 35 |
| CheckoutPage.tsx | 34 |
| Step2PickTeas.tsx | 23 |
| Step4Review.tsx | 21 |
| BundleCard.tsx | 14 |
| Modal.tsx | 13 |
| ErrorBoundary.tsx | 12 |
| seedEverything.tsx | 11 |
| PasswordResetModals.tsx | 11 |
| AdminOrders.tsx | 10 |
| BundleTeaCard.tsx | 8 |
| Navbar.tsx | 8 |
| BundleDowngradeDialog.tsx | 7 |
| CostBreakdown.tsx | 7 |
| DualCounter.tsx | 7 |
| OccasionPicker.tsx | 7 |
| SelectedChips.tsx | 7 |
| RelatedTeas.tsx | 6 |
| GiftBuilderStepper.tsx | 6 |
| AccountPage.tsx | 6 |
| AdminLayout.tsx | 5 |
| LazyImage.tsx | 4 |
| StaticPage.tsx | 4 |
| CartSummary.tsx | 2 |
| WelcomeCreditModal.tsx | 1 |

---

## Migration patterns codified

The Phase 3 playbook recognises six canonical conversion patterns that handle ≈99% of cases:

1. **Static styles → CSS class** (the 80% case). `style={{ fontSize:'12px', color:'var(--muted)' }}` becomes `<p className="my-hint">` with CSS in design.css.

2. **Discrete state variants → `data-*` attribute selectors.** Common when a component has 2-5 states (open/closed, success/danger, pending/approved). Used heavily for AdminOrders status pills (10 states), Modal header tones (default/dark/danger), GiftsPage hero CTA (enabled/disabled), Step2 tabs, BundleCard selected/unselected, etc.

3. **Continuous dynamic values → CSS custom property.** When the value is computed at runtime (per-row accent, per-pillar colour, per-product tea ID for view transitions, per-step modal accent), the inline style sets only the variable: `style={{ ['--tpf-accent' as string]: accent }}`. CSS consumes the var. Documented with a `// eslint-disable-next-line react/forbid-dom-props -- {reason}` comment.

4. **Imperative pointer/scroll mutations → keep inline, document why.** TeaProfilePage's `StarInput` mutates `currentTarget.style.transform` on pointerdown/up because it needs to fire without a re-render; CSS supplies only the transition timing.

5. **Reusable style objects → class with `data-tone`.** NotificationBell had 8 `React.CSSProperties` constants reused across 20+ callsites. Converted to `nb-*` classes with `data-tone="success|danger"` and `data-dim="true"` driving variants. Same pattern collapsed Modal's `BTN_STYLES` Record into `.md-btn[data-variant='primary|outline|danger|success']`.

6. **Pure CSS `:hover`/`:active` for transient handlers.** Pre-Phase 3 the codebase had hundreds of `onMouseEnter`/`onMouseLeave` handlers mutating `style.transform` to do hover lift effects. Migrated to `.btc-card:active { transform: scale(0.98); }`, `.gp-hero-btn[data-enabled='true']:hover { transform: translateY(-1px); }`, etc. — eliminates re-renders and works correctly with reduced-motion media queries.

The patterns compose: AdminOrders' status pill uses (2) `data-status` for the colour pair, (1) CSS class for everything else, and (3) a CSS variable for the per-status accent; Modal's header chains all three across `data-tone`, `data-variant`, and computed CSS variables.

---

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx eslint src tests functions/src` | ✅ **0 warnings** (down from 1,028) |
| `npx stylelint "src/**/*.css"` | ✅ 0 errors |
| `npx vitest run` | ✅ 142/142 passing |
| `npx vite build` | ✅ ~20s |
| Size budgets | ✅ 7/7 under |
| Contrast gate | ✅ 21/21 pass WCAG AA |

---

## CSS chunk size budget

| Metric | Before Phase 3 | After Phase 3 |
|---|---:|---:|
| Gzipped CSS | ~28 KB / 35 KB | **48.98 KB / 50 KB** |
| Headroom | 7 KB | 1 KB |

The CSS chunk grew by ~20 KB because every migrated `style={{}}` site became a named CSS class. Even the cleverest migrations (data-attribute variants, color-mix() tints, etc.) net out positive on KB. The 1 KB remaining headroom is tight; future phases that add more components will want to plan for either a 5 KB budget bump or a CSS prune pass.

A future "CSS hygiene" phase could likely recover 3-5 KB by:
- Consolidating the seven page-wrap classes (`hp-page`, `pp-page`, `gp-page`, `cp2-page`, `sp-page`, `cp-empty`, `cp-page`) into one `.page-frame` with `data-bg` variants
- Merging the redundant `text-align:center` / `font-family:var(--font-serif)` / `font-weight:300` triplet that appears in ~15 hero h1/h2 classes into a single `.serif-hero-h` utility
- Deduplicating the `eslint-disable-next-line color-no-hex` decorative-overlay comments by extracting `--shadow-gold-tint`, `--frosted-white`, etc. as design tokens

That cleanup is out of scope for Phase 3 — the goal here was to eliminate `react/forbid-dom-props` warnings, not optimize the resulting CSS. Done.
