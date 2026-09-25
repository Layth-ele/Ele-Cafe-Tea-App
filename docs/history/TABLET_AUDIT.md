# Tablet Audit Catalog — Ele Café

> Phase 9.6 of the UI/UX roadmap. Catalogues the surfaces that need testing at tablet viewports (768×1024 portrait + 1024×768 landscape) and the issues we know are likely there based on static review.

Tablet is the forgotten breakpoint. Mobile gets careful attention (it's 60% of traffic). Desktop gets the design treatment. Tablet sits in between and inherits whichever side's layout the breakpoint happens to apply — sometimes correctly, often awkwardly.

This document is the catalog of what to test. The actual fixes will land in a follow-up pass once we can render the app at these viewports.

---

## Breakpoint inventory

Static scan across all `src/styles/*.css` files reveals the following media-query thresholds:

| Threshold | Direction | Count | Used for |
|---|---|---|---|
| 380px | max-width | 3 | Tiny-phone overrides (PWA banner stacking, etc.) |
| 480px | max-width | 3 | Small-phone overrides |
| 540px | max-width | 2 | Phone landscape |
| 600px | max-width | 1 | Phablet boundary |
| 640px | max-width | 3 | Tailwind sm boundary |
| 768px | min-width | 2 | Tailwind md boundary (THE tablet bp) |
| 768px | max-width | 1 | Below-tablet |
| 641–1023px | range | 2 | Explicit tablet-only |
| 1024px | min-width (implied) | — | Tailwind lg, desktop+ |

Plus 17 `prefers-reduced-motion: reduce` overrides (out of scope).

**Two of the three Tailwind-aligned breakpoints (`md` = 768px, `lg` = 1024px) are actually in use**. The 641–1023px tablet-only range is used twice but only for narrow tweaks. Most layout-changing rules pivot at 640/768/1024.

---

## Surfaces to test

Each row below is a page or component that has tablet-specific risk. Test order is rough impact priority.

### Customer-side (high traffic)

| # | Surface | Portrait 768 | Landscape 1024 | Risk |
|---|---|---|---|---|
| 1 | HomePage hero | likely OK | likely OK | The hero crop ratio might force a too-tall first paint at 768×1024 (less of an LCP concern at landscape) |
| 2 | ProductsPage filter sidebar | **HIGH** | OK | The filter sidebar is desktop-only above 768; on tablet portrait the user gets the mobile drawer pattern, which is fine. But on tablet landscape (1024) the sidebar appears and the grid drops to 2-3 columns — verify it's not awkward. |
| 3 | ProductsPage tea grid | OK | **MED** | `repeat(auto-fill, minmax(min(160px, 45vw), 1fr))` produces 4 columns at 768px and 5-6 at 1024px. That's a lot of cards per row in landscape — verify cards aren't stretched / awkward. |
| 4 | TeaProfilePage gallery + buy-box | **MED** | OK | The 2-column desktop layout (gallery / buy-box) probably collapses to single-column at tablet portrait. Verify the buy-box CTA doesn't fall below-fold on first paint. |
| 5 | CartPage line items | OK | OK (now) | Phase 9.1 container query handles this — list adapts to its container width. |
| 6 | CheckoutPage delivery form | **MED** | OK | Two-column form (name + phone, postal + country) at desktop. At tablet portrait verify it doesn't squeeze into a single very-narrow column. |
| 7 | CommandPalette modal | OK | OK | Radix dialog sizes correctly. |
| 8 | CartDrawer | OK | OK | Fixed width 420px regardless of viewport. Tablet just sees the same drawer with backdrop on a wider canvas. |
| 9 | Navbar | OK | OK | Mobile hamburger below 768, desktop nav above. Tablet portrait gets hamburger (correct), tablet landscape gets desktop nav (correct). |
| 10 | Footer | OK | OK | 1 column → 2 columns → 4 columns at standard Tailwind breakpoints. Verify the 2-column intermediate isn't crammed. |

### Modals + drawers (cross-cutting)

| Component | 768 portrait | 1024 landscape | Risk |
|---|---|---|---|
| All modals | Should be **centered** at tablet, not full-screen | Should be **centered** | Roadmap §9.6 specifically calls out "Modals that go full-screen on mobile but not on tablet (often wrong — tablet should have centered modals like desktop)." Audit every modal: WelcomeCreditModal, WelcomeVerifyModal, EmailVerificationModal, admin edit modals (8 of them), CommandPalette. |
| ProductsPage filter drawer | Mobile drawer pattern | Should switch to inline sidebar | At 1024 the inline sidebar appears via `min-width: 1024px`. At 768 the drawer pattern applies. The 768-1023 dead zone gets the drawer which is fine. |
| CartDrawer | Right-side drawer | Right-side drawer | Always a right-side drawer. Same UX across viewports. |
| Sonner toasts | Bottom-right | Bottom-right | Verify they don't overlap the PWA install banner on tablet (both bottom-anchored). |

### Admin-side (lower traffic but used daily)

| # | Surface | Portrait 768 | Landscape 1024 | Risk |
|---|---|---|---|---|
| 11 | AdminLayout sidebar | **HIGH** | OK | The admin nav is a left sidebar at desktop. At tablet portrait it should collapse to a hamburger. Verify. |
| 12 | AdminProducts table | **HIGH** | **MED** | The 6-column table has horizontal scroll below 1024. At tablet portrait the user is scrolling a wide table — verify the scroll is smooth and the row click target is still usable. |
| 13 | AdminOrders | **HIGH** | **MED** | Same — card grid below 1024, table above. Verify the breakpoint feels natural. |
| 14 | AdminAnalytics charts | **MED** | OK | Recharts auto-resizes; verify legend doesn't overflow at 768. |
| 15 | AdminSettings form sections | OK | OK | Single-column form, scales naturally. |

---

## Known issues (identified from static review)

These are issues spotted during the cataloguing pass that almost certainly need fixing once we can render at tablet viewports:

1. **The 641-1023px "explicit tablet range" is only used in 2 places.** Both customer-side. Admin pages don't have any tablet-specific rules. Likely the admin tables jump from "card grid" below 1024 to "table" above 1024 with no intermediate — verify this is intentional, not an oversight.

2. **Modal centering** — `<Modal>` from `src/app/components/ui/modal.tsx` (Radix-based) should center on tablet. Verify the default behavior on portrait orientation; some Radix Dialog configs go full-screen on mobile via CSS, which then incorrectly applies at tablet.

3. **Footer 2-column intermediate** — footer is 1 col → 4 col across mobile → desktop. At 640-1023px it likely passes through a 2-col intermediate which can look cramped. Verify.

4. **PWA install banner overlap with bottom-anchored toasts** — both bottom-anchored. On tablet there's room for both side-by-side but the current CSS doesn't enforce a no-overlap rule. Verify on a tablet whether they stack correctly or fight for the same space.

5. **CheckoutPage step navigation** — the multi-step header (Delivery → Payment → Review) uses a horizontal layout. Verify it doesn't wrap awkwardly at 768 portrait.

---

## How to actually run the audit

Once a deploy environment exists:

```bash
# Desktop browsers at tablet sizes
# Chrome DevTools: Toolbar → Device → "iPad Air" portrait + landscape
# Safari Responsive Design Mode: iPad Pro 11"
# Firefox: Responsive Design Mode → iPad

# OR Playwright across both orientations
npx playwright test --project="iPad Pro" tests/visual/
```

For each of the 15 surfaces above, capture:
- Screenshot at 768×1024
- Screenshot at 1024×768
- Note any layout issue (cramped column, awkward gap, modal sizing wrong, etc.)

The output is a delta list against this catalog — the fixes will be CSS-only in 90% of cases (a breakpoint adjustment or a missing `@container` rule).

---

## What I can verify here (static review)

Without a tablet to actually render against, I went through every page component and noted layout rules. Findings:

✅ **No fixed-pixel widths that would break at tablet** — everything is fluid or uses `min(420px, 100vw)` patterns.
✅ **No `vw`/`vh` that would behave weirdly at tablet** — only `100dvh` on full-screen surfaces.
✅ **No orientation-locked layouts** — every page works in both portrait and landscape by design.
⚠️ **The modal sizing question can't be confirmed without a real render.** Static review says Radix dialogs are responsive by default, but the CSS additions on top (`<Modal>` wrapper) may force full-screen incorrectly at tablet portrait.

This catalog will close out the Phase 9.6 success-gate item ("Tablet audit checklist run; layout fixed") in two steps: this catalog is the checklist, and the live render + fix pass is the closing step.
