# Phase 3 — Inline-style → CSS-class migration playbook

This is the living guide for the 1,571-warning TODO list surfaced by
the `react/forbid-dom-props` rule. The rule is set to `warn` (not
`error`) so existing code still builds, but every `style={{}}` on a
DOM element is now visible in lint output.

## Why we're doing this

Three concrete wins:

1. **Bundle size** — repeated inline styles ship as JSX prop literals
   in the JS bundle. The same 50-line tea-card style appears once per
   tea card render cost. Moving to a class deduplicates it into the
   CSS bundle, which gzips much better and is cached separately.

2. **Render performance** — every render that creates a fresh object
   literal (`style={{ display: 'flex' }}`) breaks React's prop-equality
   check and reflows that element. Classes are referentially stable.

3. **Theming consistency** — inline styles bypass the `tokens.css`
   system. Hex codes get hard-coded by accident; dark-mode breaks
   silently. Classes force the discipline of "look up the right
   token first."

## Current status

- **Audit baseline:** 1,688 inline `style={{}}` instances across 64 files
- **Migrated so far:** CartSummary (25 → 2), EmailVerificationModal (14 → 0), WelcomeCreditModal (21 → 1), **OrdersPage (37 → 1)**, **PrivacyPolicyPage (18 → 0)**, **AboutPage (7 → 0)**, **RefundPolicyPage (23 → 0)**, **ShippingPolicyPage (17 → 0)**, **ComboPairingPage (36 → 0)**, **ContactCard (62 → 0**, 3 documented `style={style}` pass-throughs**)**, **CartDrawer (62 → 1**, dynamic --cd-progress**)**, **CreditWidget (34 → 1**, dynamic --cw-progress**)** ≈ 356 instances
- **Remaining:** ~1,270 ESLint warnings, ~1,315 raw `style={{}}` matches in production code (stories excluded by ESLint override).
- **Phase 3 analyzer:** `node scripts/inline-style-analyzer.mjs` — categorizes every remaining inline style and produces a per-file worklist. Use `--file <path>` for the per-instance breakdown of a single file.

## The pattern

For each file you migrate, follow this loop:

### Step 1 — Categorize the inline styles

Open the file. Each `style={{}}` falls into one of three buckets:

| Bucket                          | Action                                              |
|---------------------------------|-----------------------------------------------------|
| **Static** (no JS variables)    | Move to a CSS class                                 |
| **Dynamic** (computed values)   | Keep inline OR extract to a CSS custom property     |
| **Design token** (`var(--x)`)   | Move to a class — these are the easiest wins        |

A "static" style is one where every property value is a literal string,
number, or `var(--token)` reference. A "dynamic" style has a variable
or expression on the right-hand side (`color: error ? 'red' : 'green'`,
`width: ${pct}%`, `transform: rotate(${i * 47}deg)`).

### Step 2 — Add a class block to design.css

Component-specific classes follow a `<component>-<element>` naming
convention. For an "OrderListItem" component:

```css
/* ═══════════════════════════════════════════════════════════════
   ORDER LIST ITEM — replaces N inline styles in
   src/app/components/orders/OrderListItem.tsx
   ═══════════════════════════════════════════════════════════════ */
.oli-row { display: flex; align-items: center; gap: var(--sp-3); }
.oli-meta { color: var(--text-2); font-size: 13px; }
.oli-status-pill { ... }
```

Append to the bottom of `src/styles/design.css` so the source-order
of class declarations matches the source-order of components added.

For utility patterns that recur across many components (vertical
stacks, horizontal rows, common margins), use the existing utility
classes — see "Utility classes" section below. Don't duplicate them
into per-component blocks.

### Step 3 — Replace the JSX

Drop the `style={{}}` and add `className="..."`. If a component
already has a className, append (don't overwrite):

```tsx
// BEFORE
<div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>

// AFTER
<div className="stack-2 mb-4">
```

For a static style with a dynamic *trigger* (e.g. shipping fee shown
free vs paid), use two classes and toggle between them:

```tsx
// BEFORE
<span style={{
  color: shippingFree ? 'var(--success)' : 'var(--muted)',
  fontSize: shippingFree ? '13px' : '11px',
  fontStyle: shippingFree ? 'normal' : 'italic',
}}>
  {shippingFree ? 'Free' : 'Calculated at checkout'}
</span>

// AFTER
<span className={shippingFree ? 'cart-summary-shipping-free' : 'cart-summary-shipping-pending'}>
  {shippingFree ? 'Free' : 'Calculated at checkout'}
</span>
```

### Step 4 — Convert JS-driven hover effects to CSS `:hover`

The codebase has many `onMouseEnter` / `onMouseLeave` handlers that
mutate `e.currentTarget.style` to fake a hover. These are slower
than CSS `:hover` and break under React StrictMode. Always replace:

```tsx
// BEFORE
<button
  style={{ background: 'var(--midnight)', transition: 'box-shadow 180ms' }}
  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.25)'; }}
  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
>

// AFTER
<button className="my-button">
// ─── design.css ───
.my-button {
  background: var(--midnight);
  transition: box-shadow 180ms;
}
.my-button:hover {
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
}
```

### Step 5 — Suppress remaining inline styles with a reason

After migration, any `style={{}}` that survives MUST be a genuinely
dynamic value (CSS can't represent it from a class). Add a one-line
suppression with a reason:

```tsx
{/* Animation duration is computed per-piece in the loop, so it
    can't be statically declared in CSS. */}
{/* eslint-disable-next-line react/forbid-dom-props */}
<span style={{ animation: `wcm-fall ${duration}s linear` }} />
```

The reason is required — "I gave up" is not a reason. Reviewers
should reject suppressions without one.

For dynamic values that COULD live in CSS via a custom property,
prefer that pattern:

```tsx
// Use --pct as a CSS variable in the class definition.
<div className="progress-bar" style={{ '--pct': `${pct}%` } as React.CSSProperties} />

// design.css
.progress-bar { width: var(--pct); ... }
```

This still trips the lint rule (because there's still a `style` prop)
but is preferred over hardcoding `width: ${pct}%` because the class
can layer additional properties around it.

### Step 6 — Verify

After migrating a file, run:

```bash
npm run typecheck   # no TS regressions
npm run lint        # warning count should drop by N (where N is the styles you migrated)
npm run lint:css    # no new stylelint errors
npm test            # no behavior regressions
npm run build       # bundle still builds
```

Take a screenshot before/after if the file renders something visually
distinctive — visual regression for high-traffic surfaces is a real
risk. The `playwright.config.ts` visual snapshot suite covers most
customer-facing pages but not admin.

## Utility classes available

Defined in `src/styles/design.css` under the "PHASE 3 — UTILITY CLASSES"
header. Use these for cross-component patterns; reach for component
classes for one-offs.

| Class           | What it does                                                |
|-----------------|-------------------------------------------------------------|
| `.stack-N`      | Vertical flex column, gap = `var(--sp-N)` (N = 1–6)         |
| `.row-N`        | Horizontal flex row, items center-aligned, gap = sp-N        |
| `.row-start-N`  | Same as row-N but items align to flex-start (icon + multi-line text) |
| `.cluster-N`    | Wrappable horizontal row, gap = sp-N (badge groups)          |
| `.row-between`  | Flex row with `justify-content: space-between`               |
| `.row-between-N`| Same + gap = sp-N                                            |
| `.mb-N`, `.mt-N`| Margin-bottom / margin-top = sp-N (N = 1–6, plus mb-8)       |
| `.grid-auto-N`  | Auto-fit grid with min column width = N px (140, 180, 200, 220) |
| `.text-muted`   | `color: var(--muted)`                                        |
| `.text-muted-sm`| muted + `font-size: 12px`                                    |
| `.text-muted-xs`| muted + `font-size: 11px`                                    |
| `.text-text2-sm`| `color: var(--text-2); font-size: 13px; line-height: 1.6`    |
| `.text-center`  | `text-align: center`                                         |

## Suggested migration order

Do customer-facing high-traffic surfaces first (LCP impact > admin):

1. ~~CartSummary~~ ✓
2. ~~EmailVerificationModal~~ ✓
3. ~~WelcomeCreditModal~~ ✓
4. ~~OrdersPage (37 → 1)~~ ✓ — Phase 3 round 2
5. ~~PrivacyPolicyPage (18 → 0)~~ ✓ — Phase 3 round 2 (also unlocked the
   shared `.ip-*` luxury-card classes for Refund/Shipping/About pages)
6. ~~AboutPage (7 → 0)~~ ✓ — Phase 3 round 3 (shared `.ip-*` classes, no new CSS)
7. ~~RefundPolicyPage (23 → 0)~~ ✓ — Phase 3 round 3 (extended `.ip-*` with notice-card + pill primitives)
8. ~~ShippingPolicyPage (17 → 0)~~ ✓ — Phase 3 round 3 (added `.ip-pickup-*`; replaced JS-driven hover with CSS `:hover` per step-4)
9. ~~ComboPairingPage (36 → 0)~~ ✓ — Phase 3 round 4 (added `.cpp-*` block; replaced category-pill JS hover per step-4)
10. ~~ContactCard (62 → 0)~~ ✓ — Phase 3 round 4 (added `.cc-*` block covering 3 variants + ContactSection helper; 4 JS-driven hovers → CSS `:hover`; 3 user-`style` pass-throughs documented per step-5)
11. ~~CartDrawer (62 → 1)~~ ✓ — Phase 3 round 5 (added `.cd-*` block; backdrop/panel toggle via `data-open` attributes; sibling-row borders via `:not(:last-child)`; progress fill width via `--cd-progress` CSS custom property)
12. ~~CreditWidget (34 → 1)~~ ✓ — Phase 3 round 5 (added `.cw-*` block; tier-button JS hover → CSS `:hover`; progress fill width via `--cw-progress`)
13. **TeaProfilePage** (152 — the LCP page on a tea visit; 9 truly-dynamic styles need careful handling)

Reusable classes shipped from rounds 1-5:
- `orders-*` block — only OrdersPage uses this; per-component
- `ip-*` block — used by **all four info pages**; new info pages can drop their inline styles by composing the existing primitives
- `cpp-*` block — ComboPairingPage; per-page
- `cc-*` block — ContactCard (full / compact / inline variants); reusable if other components need a luxury contact-info block
- `cd-*` block — CartDrawer; per-component (the data-attribute toggle pattern is reusable elsewhere though)
- `cw-*` block — CreditWidget + CreditSelector; component-scoped

Then admin (less perf-critical, but big absolute counts):

8. AdminSettings (142)
9. AdminOrders (101)
10. AdminCustomers (84)
11. AdminAnalytics (77)
12. AdminVerificationAnalytics (59)

Plus the long tail (~50 files with 1–20 instances each).

## When you've finished a file

Drop it from the "Migrated so far" / "Remaining" counts at the top
of this doc. When the warning count hits zero, flip the rule to
`error` in `eslint.config.js`.
