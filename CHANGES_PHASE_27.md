# Phase 27 — Pairing-Aware Breadcrumb Continuity

Date: 2026-05-21
One-line summary: when a user clicks any tea/category link from a
pairing detail page, the destination's breadcrumb now continues the
journey (`Home > Pairings > <pairing> > <dest>`) instead of resetting
to the default product taxonomy.

---

## Symptom

On `/pairings/spinach-and-feta-strudal`, clicking any of:
- **Browse all teas** → went to `/products` with breadcrumb `Home > Our Teas`
- **Black Tea / Green Tea / …** pills → went to `/products/{cat}` with `Home > Teas > Black Tea`
- **A few of our favourites** cards → went to `/tea-profile/{cat}/{slug}` with `Home > Teas > Black Tea > Earl Grey Classic`

User feedback (paraphrased): "the breadcrumb broke!! make sure it
follows the same concept" — meaning the chain should preserve the
pairing context the user came from.

---

## Solution

Pass the pairing slug + title as URL query params on every outbound
link from `ComboPairingPage`. The destination pages read those params
and conditionally render a journey-aware breadcrumb chain.

```
/pairings/spinach-and-feta-strudal
  ↓ click any tea, category, or "browse all teas"
/products/black?fromPairing=spinach-and-feta-strudal
              &fromPairingTitle=Spinach%20and%20Feta%20Strudal
  ↓
Breadcrumb: Home > Pairings > Spinach and Feta Strudal > Black Tea
   (instead of: Home > Our Teas > Black Tea)
```

Title carried in the URL avoids a second Firestore fetch on the
destination just for a breadcrumb label. ~50 extra characters per
link — negligible.

---

## Changes

### 1. `src/app/pages/ComboPairingPage.tsx` — `withPairingCtx` helper

```ts
function withPairingCtx(href: string): string {
  const sep = href.includes('?') ? '&' : '?';
  const qs = new URLSearchParams({
    fromPairing:      combo.slug,
    fromPairingTitle: combo.title,
  }).toString();
  return `${href}${sep}${qs}`;
}
```

Applied to three outbound link types:

| Link | Before | After |
|---|---|---|
| "Browse all teas" CTA | `to={ROUTES.PRODUCTS}` | `to={withPairingCtx(ROUTES.PRODUCTS)}` |
| Category pills (Black, Green, …) | `to={ROUTES.PRODUCTS_CAT(cat.id)}` | `to={withPairingCtx(ROUTES.PRODUCTS_CAT(cat.id))}` |
| Featured tea cards | `to={ROUTES.TEA_PROFILE(t.category, t.slug)}` | `to={withPairingCtx(ROUTES.TEA_PROFILE(t.category, t.slug))}` |

### 2. `src/app/pages/TeaProfilePage.tsx` — read params + conditional breadcrumb

Added `useSearchParams` to the react-router import. Read both params:

```ts
const [tpSearchParams] = useSearchParams();
const fromPairingSlug  = tpSearchParams.get('fromPairing');
const fromPairingTitle = tpSearchParams.get('fromPairingTitle');
```

Rewrote both breadcrumb arrays (visible `<Breadcrumbs>` AND
`<SeoHead breadcrumbs={…}>` for JSON-LD) to a conditional:

- When pairing context present:
  `Home > Pairings > <pairing title> > <tea name>`
- Otherwise (organic visit, direct link, search):
  `Home > Teas > <category> > <tea name>` (unchanged)

JSON-LD chain mirrors visible — keeps schema.org accurate to what
the user actually sees.

### 3. `src/hooks/useProductsFilters.ts` — preserve params across filter syncs

Without this, the hook's `setSearchParams(params, { replace: true })`
debounced sync would clobber `fromPairing*` on every checkbox click,
silently breaking the breadcrumb mid-session.

Captured the context **once on mount** via a ref:

```ts
const preservedParamsRef = useRef<Record<string, string>>({});
useEffect(() => {
  const ctx   = searchParams.get('fromPairing');
  const title = searchParams.get('fromPairingTitle');
  if (ctx)   preservedParamsRef.current.fromPairing      = ctx;
  if (title) preservedParamsRef.current.fromPairingTitle = title;
}, []);  // mount-only; deps lint disabled with comment
```

Then re-added them in the sync timer:

```ts
Object.assign(params, preservedParamsRef.current);
setSearchParams(params, { replace: true });
```

A ref (not state) prevents a loop where `searchParams` in deps would
trigger after every `setSearchParams`, triggering another sync, etc.

Also exposed the captured context in the hook's return so consumers
can render the conditional breadcrumb without their own params read:

```ts
pairingCtx: {
  slug:  preservedParamsRef.current.fromPairing      ?? null,
  title: preservedParamsRef.current.fromPairingTitle ?? null,
},
```

### 4. `src/app/pages/ProductsPage.tsx` — pairing-aware breadcrumb

Destructured `pairingCtx` from `useProductsFilters`. Rewrote both
`<SeoHead breadcrumbs={…}>` and the visible `<Breadcrumbs>` as IIFEs
that branch on `pairingCtx.slug && pairingCtx.title`:

- With pairing ctx + active category:
  `Home > Pairings > <pairing> > <category>`
- With pairing ctx, bare `/products`:
  `Home > Pairings > <pairing> > Our Teas`
- Without pairing ctx, active category:
  `Home > Teas > <category>` (unchanged)
- Without pairing ctx, bare `/products`:
  no visible breadcrumb (unchanged — top-level destination)

The visible breadcrumb now also renders on bare `/products` when the
pairing context is present — so the back-trail to the pairing is
always visible, even before the user picks a category.

---

## Files touched (4)

```
src/app/pages/ComboPairingPage.tsx     +24 / 0  lines  (withPairingCtx helper + 3 link sites)
src/app/pages/TeaProfilePage.tsx       +25 / -7 lines  (useSearchParams + conditional breadcrumb)
src/app/pages/ProductsPage.tsx         +44 / -8 lines  (destructure pairingCtx + conditional)
src/hooks/useProductsFilters.ts        +24 / 0  lines  (preserve ref + return pairingCtx)
```

No CSS changes. No new dependencies.

---

## Pre-deploy

```bash
pnpm typecheck
pnpm lint
pnpm build
firebase deploy --only hosting
```

---

## After deploy — verify the user's flow

1. ☐ Open `/pairings/spinach-and-feta-strudal`
2. ☐ Click a tea card in "A few of our favourites" (e.g. Earl Grey
   Classic). Land on `/tea-profile/black/earl-grey-classic?fromPairing=…`
3. ☐ Breadcrumb reads:
   `Home > Pairings > Spinach and Feta Strudal > Earl Grey Classic`
   (NOT `Home > Teas > Black Tea > Earl Grey Classic`)
4. ☐ Click "Pairings" in the breadcrumb → goes to `/pairings` index
5. ☐ Click "Spinach and Feta Strudal" in the breadcrumb → returns to
   the original pairing page
6. ☐ Go back to a pairing, click a category pill (e.g. "Black Tea")
7. ☐ Land on `/products/black?fromPairing=…` with breadcrumb:
   `Home > Pairings > Spinach and Feta Strudal > Black Tea`
8. ☐ Toggle a filter checkbox. URL updates with the filter param;
   `fromPairing` and `fromPairingTitle` are **still present**.
   Breadcrumb stays intact.
9. ☐ Click "Browse all teas" CTA from a pairing → land on
   `/products?fromPairing=…` with breadcrumb:
   `Home > Pairings > Spinach and Feta Strudal > Our Teas`
10. ☐ Direct visit to `/tea-profile/black/earl-grey-classic` (no query
    params): breadcrumb reverts to the original
    `Home > Teas > Black Tea > Earl Grey Classic`. No regression for
    organic / search / direct-link arrivals.

---

## Why query params (not state / referrer / sessionStorage)

- **`document.referrer`**: stripped by browser privacy settings,
  unreliable when users share links via messaging apps.
- **`sessionStorage`**: persists across navigations but breaks if
  the user opens links in new tabs, breaks on hard refresh, breaks
  on share-link arrival.
- **Router state (`navigate(to, { state })`)**: lost on hard refresh
  and on share-link arrival.
- **Query params**: survive refresh, are shareable (sharing a link
  preserves the pairing context for the receiver too — actually nice
  for SEO crumbs), trivially testable, no global state.

The downside: the query string is visible in the URL bar. Acceptable
trade-off for a deterministic, refresh-safe, share-safe context
mechanism.

End of Phase 27. The breadcrumb finally follows the same concept.
