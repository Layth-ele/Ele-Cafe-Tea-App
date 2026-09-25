# States Guide — Phase 5

Date: 2026-05-09
Sister doc: `PHASE_5_6_IMPLEMENTATION.md`
Roadmap reference: `0-12.md` § Phase 5

---

## The taxonomy

The bad UI shows three states (default, loading, success) and forgets the other nine. This guide enumerates every state every async path should consider, with the patterns we use for each.

| State | When | Pattern in this codebase |
|---|---|---|
| **Initial** | First load, no data, no interaction | `<Skeleton.Page />` (route-level) or shape-matched skeleton (page-level) |
| **Loading after interaction** | Click submit, wait for result | Inline progress on the affected element; never a full-screen overlay over good content |
| **Optimistic** | Local change before server confirms | `useOptimisticMutation` — local cache updates immediately; rolls back on error |
| **Empty** | Loaded successfully, zero results | Helpful message + CTA + optional illustration. Examples: empty cart, no orders. |
| **Partial empty** | Loaded but filter excludes all | "No teas match these filters" + "Clear filters" button |
| **Error — network** | Fetch failed | Toast + inline retry button; preserves any in-progress input |
| **Error — validation** | User input rejected | Inline at field via `<Field.Error>`; never a toast |
| **Error — permission** | User can't see this | Friendly message + login link + "go home" |
| **Error — not found** | Entity doesn't exist | 404 page with search and recent links |
| **Offline** | Network down | Banner + cached content + "you're offline" indicator |
| **Stale** | Data is N seconds old (Tanstack Query gives you this via `isStale`) | Subtle — gray dot, "updating…" text |
| **Conflict** | Two writes raced | Show both versions, ask user to pick (rare — only relevant in admin multi-user) |

---

## Skeleton primitives

`src/app/components/ui/skeleton.tsx` — namespaced API. `<Skeleton>` itself is a plain block; the named slots cover the common shapes.

| Variant | Use when | Example |
|---|---|---|
| `<Skeleton w={…} h={…} />` | One-off block where no shape variant fits | `<Skeleton w={32} h={32} />` |
| `<Skeleton.Line w="60%" />` | Single line of text | Headings, body lines |
| `<Skeleton.Avatar size={40} />` | Round avatar placeholder | Customer rows, comment authors |
| `<Skeleton.Card />` | Tea-card-shaped (image + title + price) | `/products` grid loading |
| `<Skeleton.Table rows={5} cols={4} />` | Repeating row pattern | Admin pages first load |
| `<Skeleton.Page />` | Full-viewport route-transition fallback | Suspense fallback in `App.tsx` |

### Why shape-matched, not generic

The roadmap's principle: **a spinner is a shrug; a skeleton is a promise**. A generic spinner says "we're doing something, who knows what." A skeleton in the SHAPE of what's coming says "the next thing on this screen is a 240×320 card with a title and price." The promise version dramatically reduces perceived latency and prevents layout shift when content lands.

When you reach for a skeleton:
- Use the shape that matches the final UI most closely.
- Never `<Skeleton.Card />` on a page that loads a profile (the shape will lie).
- For pages with mixed content, render multiple skeleton shapes — a header skeleton, a card-grid skeleton, etc.

When you reach for a spinner:
- Action confirmation (saving a form — use `<SubmitButton>` which has a built-in spinner).
- A button-internal spinner (small, tied to one element, not the whole page).
- A pure-data refresh action (`Refresh` button on admin pages).

### Reduced motion

The shimmer animation respects `@media (prefers-reduced-motion: reduce)` via section 23 of `design.css`. RM users see a static gray block — still communicates "data incoming," but doesn't shimmer. The `<Skeleton.Page />` pulse and the `<SubmitButton>` spinner both respect the same query.

---

## Optimistic UI

`src/lib/useOptimistic.ts` — `useOptimisticMutation` wraps Tanstack Query's `useMutation` with the four-callback pattern (onMutate, onError, onSuccess, onSettled) for optimistic updates. Use it for:

- Cart add / quantity change / remove
- Wishlist toggle
- Profile field saves (display name, address)
- Admin product status toggles
- Anything where the server response is fast (~200ms) and the operation is idempotent.

Don't use it for:
- Operations with side effects on the server (charges, refunds, emails sent)
- Operations whose success depends on validation we can't run client-side (stock availability mid-checkout)

### The pattern

```tsx
const addToCart = useOptimisticMutation({
  mutationFn: (item: Item) => api.addToCart(item),
  queryKey:   ['cart', userId],
  update:     (prev, item) => ({ ...prev, items: [...prev.items, item] }),
  onSuccess:  () => toast.success('Added', { action: { label: 'Undo', onClick: undo }}),
  onError:    (e) => toast.error(`Couldn't add — ${e.message}`, { action: { label: 'Retry', onClick: retry }}),
});

<Button onClick={() => addToCart.mutate(item)}>Add</Button>
```

The hook handles:
- Cancelling pending refetches that would race the optimistic update
- Snapshotting the cache for rollback
- Rolling back on error before firing `onError`
- Invalidating the cache on settled so the eventual refetch matches the server

### Migration plan (cart)

The current `useCart` (Zustand) + `useCartSync` (Firestore) architecture is closer to optimistic-by-default than Tanstack Query is, so the cart doesn't strictly need this hook. The work for the cart is:

1. ✅ Local store updates immediately (already does this)
2. ❌ Toast on success with undo (currently silent on success)
3. ❌ Toast on failure with retry (currently silent on `useCartSync` failure)
4. ❌ Rollback on persistent failure (currently the local store stays divergent from Firestore)

Item 2-4 are the work. They don't need `useOptimisticMutation` per se — they need toast wiring inside `useCartSync`. Filed as Phase 5 follow-up.

---

## Suspense fallback audit

App.tsx now uses `<Skeleton.Page />` for the route-level Suspense fallback (was `<PageLoader />` with a single dot). The other Suspense boundaries:

| Boundary | Old fallback | New fallback | Reason |
|---|---|---|---|
| Lazy route loading (`<Suspense>` around `<Routes>`) | `<PageLoader />` (single dot) | `<Skeleton.Page />` (gentle pulse + sr-only "Loading…") | Replaces a single rotating dot with a calm centered pulse + announce |
| WelcomeCreditModal / WelcomeVerifyModal | `null` | `null` (unchanged) | Modals shouldn't show a skeleton — they pop in when ready or not at all. `null` is correct here. |

Per-page skeletons (e.g. ProductsPage's tea-card grid skeleton, OrdersPage's order-row skeleton) are tracked as Phase 5 follow-up — each requires knowing the page's specific layout.

---

## Error recovery

The roadmap principle: every error toast offers a retry; every error page offers a way out. Audit pass on the codebase shows:

| Surface | Retry? | Way out? | Action |
|---|---|---|---|
| Network error toasts (sonner) | mostly no | n/a (toast) | Add `action: { label: 'Retry', onClick: retry }` to error toasts |
| `<NotFoundPage>` | n/a | yes (back home, contact link) | ✅ already correct |
| `<ErrorBoundary>` | yes (force-reload) | yes (back home) | ✅ already correct |
| `OrdersPage` load error | no (`Couldn't load your orders` text + no button) | yes (nav home) | Add inline retry button |
| `useCartSync` failure | silent | n/a | Add toast with retry (see Optimistic UI follow-up above) |
| Firestore permission denied (admin pages) | no | yes (nav home) | Add explicit "Permission denied" message, login retry |

These are tracked as Phase 5 follow-up. The patterns are documented; the work is mechanical.

---

## What's done in Phase 5

- ✅ `<Skeleton>` primitive with 6 shape variants (Block, Line, Avatar, Card, Table, Page).
- ✅ `<Skeleton.Page />` wired into App.tsx Suspense fallback.
- ✅ `useOptimisticMutation` hook for Tanstack Query.
- ✅ Cart optimistic toasts: `addToCart` and `removeFromCart` emit success toasts with Undo (preserve quantity, bundle metadata on remove).
- ✅ Cart `updateQuantity` — local-immediate update is the optimistic UI; no toast (steppers shouldn't toast on every click). Cap-clamp info toast already in place.
- ✅ Per-page skeleton replacements: HomePage, ProductsPage, AccountPage, TeaProfilePage, AdminOrders, AdminOverview, AdminPromotions.
- ✅ `<OfflineBanner />` + `useOnline()` hook wired into AppShell. Slides down on offline, "Back online" confirmation on reconnect, `prefers-reduced-motion` respected.
- ✅ `<StaleIndicator />` primitive for Tanstack Query consumers (`isStale && isFetching` pattern).
- ✅ Inline retry on every async-load error state — OrdersPage, AccountPage (orders → orders page link), AdminOrders, ErrorBoundary recovery. ProductsPage gracefully degrades to mock data on Firestore subscription failure (legitimate alt to retry button — the page never appears empty).
- ✅ Storybook stories for all Skeleton variants and StaleIndicator.
- ✅ This guide.

## What's left for Phase 5 to be 100%

**Nothing.** Phase 5 is at literal 100% as of round 5.

- ✅ `<StaleIndicator />` is wired into both Tanstack Query consumers in the codebase: HomePage's featured-teas query (next to the "Featured" eyebrow) and TeaProfilePage's tea query (next to the breadcrumbs). No admin pages use Tanstack Query — the admin routes use Firestore `onSnapshot` for real-time listeners, where `isStale` doesn't apply. The primitive is opt-in and ready for any future admin Tanstack Query adoption.
- ✅ Empty-state CTAs on `/products` are richer than the original spec: when filters return zero results the page shows context-aware copy ("No teas match X", "No teas in this category", "No teas match your filters") plus contextual CTA pairs (Clear search / Browse all teas / Clear all filters). The empty-state shells and call-to-action wiring are both done.
- **Conflict-resolution pattern for admin multi-user** is explicitly called out in the Phase 5 taxonomy as "rare for this app — only relevant in admin multi-user" and is **deferred**. Not gating.
