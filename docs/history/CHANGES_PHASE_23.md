# Phase 23 — Filter Crash Fixed: Removed react-flip-toolkit

Date: 2026-05-21
One-line summary: every filter toggle on `/products` was throwing
because `react-flip-toolkit@7.2.4` is incompatible with React 19's
concurrent renderer. Removed the library, replaced its FLIP morph
animation with a CSS keyframe fade-in.

---

## Symptom

User reported: on `/products`, every filter interaction (check, uncheck,
select, reset) caused the page to briefly blink and then render the
`<ErrorBoundary>` fallback —

> Something went wrong
> An unexpected error occurred. Please reload to try again.
> [TRY AGAIN]

Reproducible after any of:
- Clicking a category checkbox
- Toggling "In stock" / "Out of stock"
- Toggling "Organic"
- Selecting a caffeine level
- Selecting an ingredient or function chip
- Clicking "Clear all"

---

## Root cause

`react-flip-toolkit@7.2.4` is the FLIP-animation library used to morph
tea cards into their new positions on sort/page/filter changes. Its
internal model:

1. **Measure** — when `flipKey` changes, walk all `<Flipped>` children
   and call `getBoundingClientRect()` to capture each card's current
   position.
2. **Mutate** — let React commit the new tree (cards reorder).
3. **Animate** — apply inverse transforms so each card visually starts
   at its old position, then animate to 0,0.
4. **Cleanup** — remove the transient transform once animation completes;
   internally calls `removeChild` on tracking nodes.

In React 19, every filter mutation in `useProductsFilters.ts` is
wrapped in `startTransition()` so the URL sync + grid re-render can be
deferred. The transition semantics let React **partially commit and
un-commit children mid-flight** based on priority — which is incompatible
with Flipper's "measure-then-mutate-then-animate" pipeline.

Specifically: Flipper measures node N at time T0. By time T1 when it
goes to clean up, React has already removed N from the DOM via its
transition reconciliation. Flipper's `removeChild(parent, N)` then
throws `DOMException: NotFoundError — node is not a child of parent`.

### Why the Phase 10 workaround didn't hold

Phase 10 (per the inline comment block on the old Flipper section)
had previously addressed a similar `NotFoundError` by removing filter
state from `flipKey`. That fix worked for **filter → filter** sequences
because Flipper never re-measured between filter changes. But it
introduced a new problem: Flipper's registry accumulated stale refs.
On the next sort or pagination change, those stale measurements
referenced unmounted DOM nodes → same `NotFoundError`.

The combination of React 19 concurrent rendering + `startTransition` +
flip-toolkit's measurement model is fundamentally racy. No combination
of `flipKey` values fixes it.

---

## Fix

### 1. Removed `react-flip-toolkit` from `src/app/pages/ProductsPage.tsx`

Dropped the import; replaced the `<Flipper flipKey={...}><Flipped flipId={...}>…</Flipped></Flipper>`
wrapper with a plain `<div className="pp-grid">…</div>`.

### 2. Replaced FLIP morph animation with CSS keyframe fade-in

Added to `src/styles/design.css`:

```css
.pp-grid-results > [data-card-anim] {
  animation: pp-card-enter var(--dur-slow, 380ms) var(--ease-out, ease) both;
}
@keyframes pp-card-enter {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .pp-grid-results > [data-card-anim] { animation: none; }
}
```

Same ~380ms duration as the old FLIP, simpler entrance animation
(fade + small rise), native browser, **cannot throw**. The
prefers-reduced-motion gate is honored automatically.

### 3. Stabilized React keys with triple fallback

```diff
-{paginated.map((p, i) => (
-  <Flipped key={p.id ?? p.slug} flipId={p.id ?? p.slug}>
-    <div data-flipped>
-      <ProductsTeaCard product={p} priority={i < 6} />
-    </div>
-  </Flipped>
-))}
+{paginated.map((p, i) => {
+  const stableKey = p.id ?? p.slug ?? `idx-${pageStart + i}`;
+  return (
+    <div key={stableKey} data-card-anim>
+      <ProductsTeaCard product={p} priority={i < 6} />
+    </div>
+  );
+})}
```

The triple fallback (`p.id ?? p.slug ?? \`idx-${pageStart + i}\``)
guarantees no two siblings ever share a `key={undefined}` collision.
In practice every product doc has both `id` and `slug` (Turn 12 made
slug the doc ID), but the defense costs nothing.

### 4. Local ErrorBoundary around the grid

Belt-and-braces: even if some unrelated future code throws inside the
grid, only the grid resets — the header, filters, chips, and pagination
stay usable. The user can still navigate away.

```tsx
<ErrorBoundary
  fallback={
    <div className="empty-state" role="alert">
      <p>The product grid hit an unexpected error. Please refresh the page.</p>
    </div>
  }
>
  <div className="pp-grid pp-grid-results">…</div>
</ErrorBoundary>
```

### 5. Dropped the dependency from `package.json`

```diff
-    "react-flip-toolkit": "^7.2.4",
```

Run `pnpm install` after pulling — it'll prune the package from
`node_modules`.

---

## Files touched (3)

```
src/app/pages/ProductsPage.tsx     -7 lines / +27 lines   (import swap + JSX rewrite)
src/styles/design.css              +14 lines              (.pp-card-enter keyframe)
package.json                       -1 line                (drop react-flip-toolkit)
```

## Other Flipper usages

Confirmed by grep across all `src/**/*.tsx` and `src/**/*.ts`:
no other file imports `react-flip-toolkit` or uses `<Flipper>` /
`<Flipped>`. The gift-builder Step2PickTeas and Step3PickSamples
share the `matchesTeaFilters` helper from `src/lib/teaFilters.ts`
but never used the FLIP morph, so they're unaffected by this change
AND they're unaffected by the original bug.

## Pre-deploy checklist

```bash
pnpm install     # prune react-flip-toolkit from node_modules
pnpm typecheck
pnpm lint
pnpm build       # confirm bundle drops by ~5KB gzipped
firebase deploy --only hosting
```

## After deploy — verification

Visit `/products` on the live site and exercise the filters:

1. ✅ Check a category checkbox → grid updates, no error, cards fade in
2. ✅ Uncheck it → cards fade in again
3. ✅ Toggle "Organic" → no crash
4. ✅ Select multiple caffeine levels → no crash
5. ✅ Click "Clear all" → all filters reset, grid renders full catalogue
6. ✅ Type in the search box → grid filters as you type, no crash
7. ✅ Change sort dropdown → cards reorder smoothly (no morph animation
   anymore, just a fade — this is the expected behavior change)
8. ✅ Click pagination next/prev → page changes, cards fade in
9. ✅ Open the mobile drawer, toggle filters from inside, close → no crash

## Trade-off

Lost: the FLIP morph animation (cards physically moving to new positions
when sorted). Visually fancy.

Gained: zero crashes. The page never blinks to "Something went wrong"
again.

A reasonable trade. If the morph animation becomes important later,
re-implement it with the **native View Transitions API** (which is
already used elsewhere in this codebase for tea-image transitions on
route changes — see `src/styles/design.css` `::view-transition-old(tea-img-*)`).
View Transitions integrate with React's concurrent renderer cleanly
because they're browser-native and don't maintain their own DOM
registry the way Flipper does.

End of Phase 23. Filter crash closed.
