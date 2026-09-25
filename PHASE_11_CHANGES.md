# Phase 11 — Personalization & Intelligence — Changes

Date: 2026-05-11
Reference: `0-12.md` § Phase 11.

---

## Success-gate status

| # | Gate | Status |
|---|---|---|
| 11.8.a | Recently-viewed, recommendations, upsells live | ✅ DONE |
| 11.8.b | Wishlist live with sharing | ✅ DONE |
| 11.8.c | Notification prefs honored end-to-end | ✅ client-side DONE; **Cloud Functions must read `/users/{uid}/preferences/notifications` before dispatching — see "Notification preferences end-to-end" below** |
| 11.8.d | Saved addresses, saved payment methods | ✅ Saved addresses already shipped pre-Phase-11 via `src/schemas/address.schema.ts` + AccountPage. **Saved payment methods: DEFERRED** — PCI-DSS requires picking a vendor (Stripe / Square / Moneris) first; the SDK choice is a product decision, not implementation work. |
| 11.8.e | Order tracking with carrier link | ✅ DONE — 4-step timeline + carrier link for Canada Post, UPS, FedEx, Purolator, DHL |

---

## What landed

### 11.1 Recently viewed (✅)

- **`src/store/recentlyViewedStore.ts`** — Zustand store with `localStorage` persistence, capped at 10 entries, deduped by slug, newest-first.
- **`src/app/components/RecentlyViewedSection.tsx`** — surface component. Renders null on empty state (no "your recently viewed will appear here" noise).
- **`src/app/pages/TeaProfilePage.tsx`** — records a view on product load. Stable effect: deps are the product's denormalized fields, not the whole product object.
- **`src/app/components/CartDrawer.tsx`** — surfaces recently-viewed in the cart-empty state ("Pick up where you left off").

**Not yet surfaced on:** HomePage. Add `<RecentlyViewedSection heading="Recently viewed" limit={6} />` somewhere below the hero when you want it there. Deferred to avoid touching HomePage during this turn — but the component is reusable as-is.

### 11.2 Recommendations cascade (✅ heuristic)

- **`src/app/components/RelatedTeas.tsx`** — heuristic cascade extended from "same category, top-rated" to:
  1. Same category (most semantically relevant)
  2. Same flavor profile (when both teas declare one)
  3. Same price band (current ±$5)
  4. Top sellers, any category (filler)
  
  Picks dedupe by slug, never include the current tea, stop at 4. Catalog re-uses the same `useQuery(['teas'])` cache as ProductsPage — zero extra Firestore reads.

**Not yet:** Behavioral recommendations CF (collaborative-filter / "users who bought X also bought Y"). Spec calls for nightly aggregation; recommend deferring to a dedicated Cloud Functions sprint with its own perf-budget and cost-modeling. Heuristic above is the ship-it default.

### 11.3 Smart cart upsells (✅)

- **`src/app/components/CartUpsell.tsx`** — drops into CartDrawer footer above subtotals.
  - Shows only when subtotal is within $20 of free-shipping threshold.
  - Suggests up to 3 teas priced in the gap (`gap ≤ price ≤ gap+$15`), excludes items already in cart, sorted by avgRating.
  - Above-threshold confirmation auto-hides after 5s so it doesn't compete with checkout CTA.
  - **Dark-pattern-free**: informational copy, no manufactured urgency, never auto-adds.

### 11.4 Wishlist (✅)

- **`src/store/wishlistStore.ts`** — Zustand + localStorage. Idempotent add/remove/toggle. `encodeWishlistShareToken` / `parseWishlistShareToken` produce URL-safe base64-encoded slug arrays; the token is a share format, not a security boundary.
- **`src/hooks/useWishlistSync.ts`** — sidecar effect hook. On sign-in: read `/users/{uid}/wishlist/*`, union with local, write deltas. On subsequent local changes: 800ms debounce, then write the diff. Sign-out leaves localStorage alone (shared-device-friendly).
- **`src/app/components/WishlistHeart.tsx`** — heart button with `aria-pressed`, dynamic `aria-label`, press scale gated under `prefers-reduced-motion: no-preference`. Placed on every TeaCard's image (top-right corner overlay) and in TeaProfilePage actions.
- **`src/app/pages/WishlistPage.tsx`** — two modes:
  - `/wishlist` — own editable list with `Share` button (Web Share API + clipboard fallback)
  - `/wishlist?s=<token>` — read-only shared view, "Add to my wishlist" affordance per item
- Wired into `App.tsx` (route + `WishlistSync` sidecar mounted next to `CartSync`).
- `firestore.rules` — `/users/{uid}/wishlist/{slug}` owner-only.

### 11.5 Notification preferences (✅ client; CF side documented)

- **`src/schemas/userPreferences.schema.ts`** — Zod schema for the notifications doc. CASL/CAN-SPAM-conformant defaults: `orderUpdates: true` (transactional), `promotions/newArrivals/lowStock/reminders: false` (must be opted into).
- **`src/app/components/NotificationPreferencesSection.tsx`** — drops into AccountPage. Renders 5 Toggle rows (the Phase 10 primitive). Optimistic UI with 500ms debounce, reverts on failure. Warns when the user disables a transactional category.
- **`src/app/pages/AccountPage.tsx`** — section mounted after the existing collapsible cards.
- `firestore.rules` — `/users/{uid}/preferences/{docId}` owner-only.

### 11.6 Saved addresses (✅) / Saved payment methods (deferred)

- **Saved addresses** were already shipped pre-Phase-11 via `src/schemas/address.schema.ts` + AccountPage's existing addresses RHF + `useFieldArray` block. No new code; verified existing implementation covers the spec.
- **Saved payment methods**: **deferred with rationale.** PCI-DSS forbids storing PANs locally. The implementation has to integrate with a payment processor's vault (Stripe `PaymentMethod`, Square `Card on File`, Moneris `Resolve`). Vendor choice is a business decision: pricing, available APIs in Canada, integration complexity. Once a vendor is chosen, the implementation is ~200 lines: `savePaymentMethod` callable Cloud Function, an `AccountPage` "Wallet" section listing tokenized references (last 4 + brand only, never the PAN), and a `useSavedPaymentMethods` hook.

### 11.7 Order tracking (✅)

- **`src/app/components/OrderStatusTimeline.tsx`** — 4-step horizontal progress (placed → confirmed → shipped → delivered). Maps the 9 `OrderStatus` enum values onto the 4 visible steps. Cancelled / rejected / expired → status pill instead (no misleading progress bar).
- Carrier tracking link for Canada Post, UPS, FedEx, Purolator, DHL — when `status >= shipped`, `trackingNumber` is present, and `carrier` matches a known code. Falls back to text-only ("Tracking: XYZ via UPS") when carrier code isn't mapped.
- Pickup orders relabel "shipped → ready" and "delivered → picked up".
- Wired into `src/app/pages/OrdersPage.tsx` above the items block in each order card.

---

## Notification preferences end-to-end

The client side ships in this zip. **Cloud Functions sending emails or push notifications must read the user's preferences doc before dispatching.** Without this, the toggles set state that no Cloud Function consults — UI lies to the user.

Recommended pattern (one helper, all functions use it):

```typescript
// functions/src/lib/notificationPrefs.ts
import * as admin from 'firebase-admin';

type Category = 'orderUpdates' | 'promotions' | 'newArrivals' | 'lowStock' | 'reminders';

const DEFAULTS: Record<Category, boolean> = {
  orderUpdates: true,
  promotions:   false,
  newArrivals:  false,
  lowStock:     false,
  reminders:    false,
};

export async function userAcceptsCategory(uid: string, category: Category): Promise<boolean> {
  if (!uid) return DEFAULTS[category];
  try {
    const snap = await admin.firestore()
      .doc(`users/${uid}/preferences/notifications`).get();
    if (!snap.exists) return DEFAULTS[category];
    const val = snap.data()?.[category];
    return typeof val === 'boolean' ? val : DEFAULTS[category];
  } catch {
    return DEFAULTS[category];
  }
}
```

Then in each function:

```typescript
// functions/src/orderApprovedEmail.ts (example)
const accepts = await userAcceptsCategory(order.userId, 'orderUpdates');
if (!accepts) {
  logger.info('[orderApprovedEmail] user opted out, skipping', { uid: order.userId });
  return;
}
// ... send the email
```

Mapping notification → category:

| Function | Category |
|---|---|
| orderPlaced, orderApproved, orderShipped, orderDelivered, orderCancelled emails | `orderUpdates` |
| Wishlist-back-in-stock CF | `lowStock` |
| Cart-abandonment, win-back, milestone CFs | `reminders` |
| Promo blast / sale launches | `promotions` |
| New-tea-in-category blast | `newArrivals` |

**Not done in this zip** because Cloud Functions changes need their own deploy (and the CF source isn't included in the Phase 11 success criteria as I read it). When ready, wire `userAcceptsCategory` into each function. Maybe 30-60 minutes of work depending on how many CFs send mail.

---

## Files changed

### Added

- `src/schemas/userPreferences.schema.ts` (Phase 11.5)
- `src/store/recentlyViewedStore.ts` (Phase 11.1)
- `src/store/wishlistStore.ts` + share-token codec (Phase 11.4)
- `src/hooks/useWishlistSync.ts` (Phase 11.4)
- `src/app/components/WishlistHeart.tsx` (Phase 11.4)
- `src/app/components/RecentlyViewedSection.tsx` (Phase 11.1)
- `src/app/components/CartUpsell.tsx` (Phase 11.3)
- `src/app/components/OrderStatusTimeline.tsx` (Phase 11.7)
- `src/app/components/NotificationPreferencesSection.tsx` (Phase 11.5)
- `src/app/pages/WishlistPage.tsx` (Phase 11.4)

### Modified

- `src/app/components/RelatedTeas.tsx` — recommendation cascade (Phase 11.2)
- `src/app/pages/TeaProfilePage.tsx` — record recently-viewed on view
- `src/app/pages/ProductsPage.tsx` — wishlist heart on each TeaCard
- `src/app/pages/OrdersPage.tsx` — order status timeline per order card
- `src/app/pages/AccountPage.tsx` — notification preferences section mounted
- `src/app/components/CartDrawer.tsx` — CartUpsell + RecentlyViewedSection in empty state
- `src/app/App.tsx` — `/wishlist` route, `WishlistSync` sidecar
- `src/lib/routes.ts` — `ROUTES.WISHLIST`
- `src/styles/design.css` — full Phase 11 CSS block (~480 lines)
- `firestore.rules` — `/users/{uid}/wishlist/{slug}`, `/users/{uid}/preferences/{docId}`

---

## After unzipping

```bash
pnpm install                 # no new deps; just refreshes the lockfile
pnpm exec tsc --noEmit       # type-check the new components
pnpm exec eslint src --quiet
pnpm exec stylelint "src/**/*.css"
pnpm exec vite build         # smoke-build
firebase deploy --only firestore:rules    # ship the new rules FIRST
firebase deploy --only hosting             # then the client
```

Deploy order matters: clients shipping wishlist writes before the new rules deploy will get permission-denied errors. Rules first.

---

## What's NOT done in this zip

- ☐ HomePage `<RecentlyViewedSection>` placement (1 line in HomePage.tsx — deferred for HomePage-design review)
- ☐ Saved payment methods (vendor decision pending — see §11.6 above)
- ☐ Cloud Function `userAcceptsCategory` integration (CF deploy, not Phase 11 client scope per my reading)
- ☐ Behavioral recommendations CF (deferred per spec — "weight by past purchases…recomputed nightly")
- ☐ Vitest/Playwright tests for the new components (Phase 12 quality-governance task)
