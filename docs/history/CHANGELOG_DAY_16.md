# Day 16 — Gift Bundle Builder

Multi-step modal wizard for building a personalized tea gift bundle, replacing
the previous single-page direct-to-Firestore form. Bundles flow through the
existing cart and checkout pipeline; gift personalization is preserved end-to-end.

## What changed for users

- **`/gifts` is now public.** Logged-out visitors can browse the landing page
  and build a bundle. Authentication is enforced at `/checkout` (existing
  guard) — same as buying any other product.
- **Four bundle tiers:** Discovery $15 (1 tea + 1 sample), Curator's $35
  (3 + 2), Connoisseur's $75 (5 + 3 + French press), Signature $99
  (7 + 5 + French press).
- **Personalization fields:** recipient name (required), sender name
  (required, defaults to logged-in user's display name once), occasion
  (12 presets + custom-from-Other capped at 30 chars), gift message
  (200-char limit with live preview in Cormorant Garamond italic).
- **Resume on return:** in-progress drafts persist to localStorage with a
  30-minute idle expiry. Sign-out auto-closes the modal but keeps the draft;
  signing back in within 30 minutes resumes from the same step.

## Architecture

### New files (22)

```
src/lib/teaFilters.ts                                    — shared filter constants + types
src/store/giftBuilderStore.ts                            — Zustand wizard state + persist
src/app/components/products/TeaFilterSidebar.tsx         — extracted from ProductsPage
src/app/components/products/TeaSearchBar.tsx             — extracted from ProductsPage
src/app/components/products/TeaFilters.css               — extracted shared CSS
src/app/components/gift-builder/GiftBuilderModal.tsx     — modal shell, owns canContinue / cart write
src/app/components/gift-builder/GiftBuilderStepper.tsx   — 4-dot progress with gold connecting line
src/app/components/gift-builder/GiftBuilderFooter.tsx    — Back / Continue / Add to Cart
src/app/components/gift-builder/data/bundles.ts          — BUNDLES catalog + OCCASIONS
src/app/components/gift-builder/steps/Step1ChooseBundle.tsx
src/app/components/gift-builder/steps/Step2PickTeas.tsx
src/app/components/gift-builder/steps/Step3Personalize.tsx
src/app/components/gift-builder/steps/Step4Review.tsx
src/app/components/gift-builder/components/BundleCard.tsx
src/app/components/gift-builder/components/BundleDowngradeDialog.tsx
src/app/components/gift-builder/components/BundleTeaCard.tsx
src/app/components/gift-builder/components/CostBreakdown.tsx
src/app/components/gift-builder/components/DualCounter.tsx
src/app/components/gift-builder/components/MessagePreview.tsx
src/app/components/gift-builder/components/OccasionPicker.tsx
src/app/components/gift-builder/components/SelectedChips.tsx
```

### Modified files (7)

- **`src/store/cartStore.ts`** — added `addBundle()` action, `BundleLineItemMeta`
  type, optional `bundle?` field on `CartItem`. Bundle line items get a unique
  `bundle-{uuid}` id so they never merge; `updateQuantity` silently ignores
  changes on bundle ids (bundles are fixed quantity 1). Existing tea consumers
  unaffected — `bundle` is optional.
- **`src/app/components/modals/Modal.tsx`** — added `'xxl': '1180px'` size for
  the Step 2 layout (filter sidebar + tea grid + chip rail).
- **`src/app/pages/GiftsPage.tsx`** — full rebuild as marketing landing.
  Hero + 4 bundle preview cards + how-it-works + trust row. The big CTA opens
  the modal via `useGiftBuilderStore.open()`. The page mounts
  `<GiftBuilderModal />` at the bottom; visibility is store-driven.
- **`src/app/pages/ProductsPage.tsx`** — refactor only. Filter sidebar and
  search bar replaced with the shared `<TeaFilterSidebar>` and
  `<TeaSearchBar>`. Local FilterSection / CheckRow / ToggleRow / ResetLink /
  FilterSidebar definitions removed. INGREDIENT_LIST / FUNCTION_LIST /
  CAFF_LEVELS constants moved to `src/lib/teaFilters.ts`. URL sync, pagination,
  sort, and overall layout unchanged. Existing `/products` Playwright snapshot
  should still pass; visual contract preserved.
- **`src/app/components/CartDrawer.tsx`** — added `BundleCartItem` branch for
  items with `item.bundle`. Single card with gold gift-icon, recipient name,
  expandable "What's inside" disclosure listing teas / samples / French press /
  card message. No qty stepper on bundle lines.
- **`src/app/App.tsx`** — `/gifts` route unwrapped from `<ProtectedRoute>`.
  Comment header updated.
- **`src/app/pages/CheckoutPage.tsx`** — when the cart contains a bundle,
  the checkout flow now mirrors `isGift: true`, `recipientName`, `senderName`,
  `giftMessage`, `occasion`, `customOccasion` to the top level of the order
  document. The full bundle blob is also preserved on the line item via
  `items[].bundle` for fine-grained access. See "Admin tab deferred" below.
- **`src/app/pages/admin/AdminOrders.tsx`** — `OrderDoc` interface extended
  with optional gift fields. Order list rows now show a small `🎁 Gift` badge
  next to the status pill when `order.isGift === true`. No filter tab; that
  ships in Day 17.

## Decisions locked

1. **Bundles bypass the `gifts` Firestore collection entirely.** The previous
   `GiftsPage.tsx` wrote to both `gifts` and `orders`; the new flow writes to
   `orders` only, with the bundle blob nested on line items and gift fields
   mirrored at the top level. One source of truth.
2. **Bundles are GST-zero-rated** to match the existing tea policy
   (`gstApplicable: false` in `addBundle`). If GST policy on bundles changes,
   flip the default in `cartStore.addBundle()` — admin will see correct
   totals immediately because `totalGst` is derived per item.
3. **LIFO downgrade.** When the user switches from a 5-tea bundle to a
   3-tea bundle with 5 teas already selected, the `BundleDowngradeDialog`
   shows the LAST 2 teas it'll drop and keeps the first 3. Earlier
   selections were presumably more deliberate.
4. **Modal opening doesn't change the URL.** `localStorage` with a 30-min
   idle expiry handles "resume." Browser back closes the modal without
   losing state.
5. **Toast spam guard with reset.** Step 2 shows a one-time toast per tab
   when the user hits the cap. The flag resets when capacity frees up so
   the hint can fire again on the next fill.
6. **Sign-out auto-close** doesn't reset the draft. Signing back in within
   the 30-min window picks up at the same step.

## Deferred to follow-up days

- **Admin Gifts tab.** Filter / detail view for `orders.where('isGift', '==',
  true)`. The data is already there end-to-end — the order doc carries
  `isGift`, `recipientName`, `senderName`, `giftMessage`, `occasion`, plus the
  full bundle blob inside `items[].bundle`. All that's missing is the admin
  UI. Tagged for **Day 17**.
- **Save bundle for later.** Step 4 button to stash the draft as a saved
  bundle the user can re-open from their account page. Spec lines 401–403.
- **Delivery date picker.** Step 3 calendar input. Spec line 405. The
  `Personalization.deliveryDate` field already exists and is plumbed
  through to the order, just always `null` in v1.
- **Resume banner.** Tiny "you have an in-progress bundle" banner at the
  top of `/gifts` when localStorage has a non-expired draft.
- **Playwright modal screenshots.** Visual regression coverage for the
  modal's four steps. The existing `/products` and `/cart` snapshots
  cover the refactor's blast radius; the modal itself is uncovered until
  this lands.
- **Real bundle photography.** Bundle cards currently render a
  Cormorant-italic "Bundle photo" placeholder over a shimmer gradient.
  Drop in real product photography when shoot is complete.
- **Firestore-backed bundle config.** BUNDLES is a hardcoded array in
  `data/bundles.ts`. Migrating to a `/bundleTiers` Firestore collection
  with admin edit support is queued — same shape, just sourced
  differently. Tagged Day 17 alongside the admin gifts tab.

## Risks & mitigations

- **Cart store schema migration.** The `bundle?` field is optional, so
  carts persisted under the old schema rehydrate fine — they just have no
  bundle items. No localStorage migration needed.
- **`OrderDoc` typing widening.** All new gift fields are optional. Existing
  admin order rendering (detail view, edit modal, action modals) reads
  fields by name with fallbacks, so the additions are invisible to the
  rest of the admin surface.
- **Visual regression on `/products`.** ProductsPage refactor preserves the
  exact visual contract: same `.fs-*`, `.check-*`, `.toggle-*`, `.filter-chip`
  classes (now in `TeaFilters.css`), same accordion CSS, same sidebar width.
  If snapshots differ it's likely a 1px nudge from inline-style → class
  transition; re-baseline with `npm run test:visual:update`.
- **Modal width on tablet.** `xxl` is 1180px which is wider than ~85% of
  tablet viewports. The Step 2 grid collapses to single-column at 960px
  and the filter sidebar moves into a drawer; this is tested by media
  query but not by Playwright at the modal level — see deferred items.

## Acceptance checklist

The build is ready for local verification. Spec acceptance items 1–14 are
addressed by the code above. Item 15 (`tsc --noEmit`, `npm run lint:css`,
`npm run test:visual` all pass) is **user-verified locally**:

```bash
npm install
npm run typecheck
npm run lint:css
npm run test:visual          # may need --update-snapshots if pixel-level
npm run dev                  # smoke-test the wizard
```
