# IA Map — Phase 4.1

Date: 2026-05-09
Owner: any engineer maintaining customer-facing routes
Sister doc: `PHASE_0_1_4_IMPLEMENTATION.md` (where this is referenced)

---

## Why this exists

Phase 4.1 of the UI/UX roadmap calls for a navigation-tree audit before adding new IA features. The principle: you can't put breadcrumbs on a page until you can answer "what trail leads here?", and you can't do prefetching well until you know which routes the customer actually moves between.

The output of this exercise is the table below — every public route, every incoming-link source, and the breadcrumb trail each route should display. Decisions like "do we add a /collections page?" or "should /pairings be a tab in the nav or a footer link?" follow naturally from the gaps the table surfaces.

---

## Route inventory

Pulled from `src/lib/routes.ts` and verified against `src/app/App.tsx`.

| Route | Auth | Top-level? | Linked from (incoming) | Outgoing nav |
|---|---|---|---|---|
| `/` | public | yes | (entrypoint) | nav · cart · footer · cmd+K |
| `/products` | public | yes | nav · home cards · footer · cmd+K | category routes · tea profiles · cart |
| `/products/:category` | public | no | `/products` (filter) · cmd+K · category pills | tea profiles · cart · `/products` |
| `/tea-profile/:category/:slug` | public | no | `/products`, `/products/:cat`, search results, `/pairings/:slug` | cart · related teas · pairings |
| `/pairings/:slug` | public | no | shared external links (IG, FB, iMessage) · `/tea-profile` related | `/products` · tea profiles · share |
| `/cart` | public | no | nav (cart icon) · cart drawer "view full cart" · cmd+K | checkout · `/products` |
| `/checkout` | auth | no | `/cart` · cart drawer "proceed to checkout" | `/orders/:id` (post-purchase) |
| `/orders` | auth | no | `/account` · nav user-menu · cmd+K | `/orders/:id` |
| `/orders/:id` | auth | no | `/orders` list · checkout success · order email | `/orders` · `/account` |
| `/account` | auth | no | nav user-menu · cmd+K · post-signup | `/orders` · `/account/*` sub-pages |
| `/login` | public | yes\* | nav · cart "sign in to checkout" · cmd+K · auth-required redirects | `/signup` · returnUrl |
| `/signup` | public | yes\* | nav · login page · cmd+K | `/login` · `/account` (post-signup) |
| `/about` | public | no | footer · cmd+K | `/contact` |
| `/contact` | public | no | footer · cmd+K · home "visit us" block | (external maps · phone · email) |
| `/gifts` | public | yes | nav · home cards · cmd+K | `/cart` (post-build) |
| `/shipping-policy` | public | no | footer · checkout · cmd+K | (none) |
| `/refund-policy` | public | no | footer · cart · cmd+K | (none) |
| `/privacy-policy` | public | no | footer · signup · cmd+K | (none) |
| `/admin` | admin | yes (within admin) | admin nav · cmd+K (when admin) | admin sub-pages |
| `/admin/products` | admin | no | admin nav | `/admin/products/:id` |
| `/admin/orders` | admin | no | admin nav | `/admin/orders/:id` |
| `/admin/customers` | admin | no | admin nav | `/admin/customers/:id` |
| `/admin/analytics` | admin | no | admin nav | (none) |
| `/admin/settings` | admin | no | admin nav | (none) |
| `/admin/promotions` | admin | no | admin nav | `/admin/promotions/:id` |
| `/admin/verification-analytics` | admin | no | admin nav | (none) |
| `/admin/visits-analytics` | admin | no | admin nav | (none) |

\* `/login` and `/signup` are top-level navigationally but breadcrumb-suppressed because the focus on a landing form is helped by ambient minimalism, not navigation noise.

---

## Breadcrumb trail decisions

Per Phase 4.2, the rule is "every non-top-level customer page gets breadcrumbs." Auth flows and top-level destinations skip them. Here's the explicit map:

| Route | Trail | Status |
|---|---|---|
| `/` | — | top-level, no breadcrumbs |
| `/products` | — | top-level, no breadcrumbs |
| `/products/:category` | Home › Teas › {Category} | ✅ wired (Phase 4 round 1) |
| `/tea-profile/:category/:slug` | Home › Teas › {Category} › {Tea name} | ✅ wired (this round) |
| `/pairings/:slug` | Home › Pairings › {Pairing title} | ✅ wired (this round) |
| `/cart` | — | top-level destination, breadcrumbs would feel noisy |
| `/checkout` | — | conversion page, focus matters more than nav |
| `/orders` | Home › My Account › Orders | ✅ wired (this round) |
| `/orders/:id` | Home › My Account › Orders › #{shortId} | ✅ wired (this round) |
| `/account` | Home › My Account | ✅ wired (this round) |
| `/login`, `/signup` | — | auth flows; ambient minimalism |
| `/about`, `/contact` | — | top-level info pages, single-segment from home |
| `/gifts` | — | top-level destination |
| `/shipping-policy`, `/refund-policy`, `/privacy-policy` | — | footer pages, single-segment, intentional minimalism (they're long-read content; breadcrumbs distract) |
| `/admin` | — | admin home, no breadcrumbs above it |
| `/admin/{section}` | Admin › {Section} | ✅ wired (this round, via AdminLayout) |
| `/admin/{section}/:id` | Admin › {Section} › #{shortId} | ✅ wired (this round, via AdminLayout) |

---

## Findings (gaps the audit surfaced)

### Gap 1 — no `/collections` page

Customers can find tea by category (`/products/:cat`) and by search, but there's no curated-collection landing page. Pairings are individual SKUs (`/pairings/:slug`) but there's no `/pairings` index. **Recommendation:** add `/pairings` (low cost; the data exists in `useComboGallery`) and consider a future `/collections/:slug` for editorial groupings (e.g. "morning teas", "gifts under $40"). Out of scope for Phase 4; adding to the next IA round.

### Gap 2 — orphan footer policy pages get no internal traffic except the footer

`/shipping-policy`, `/refund-policy`, and `/privacy-policy` have no inbound links from product/cart pages. **Recommendation:** add a contextual "Shipping" link inside `CartSummary` (already done — verified in audit pass 4) and a "Privacy & data" link inside checkout's "Shipping address" form. Track via Phase 7 (a11y) where the same form deserves more `aria-describedby` wiring.

### Gap 3 — admin user-management deep-links not in cmd+K

The palette currently lists "My Orders / My Account" for signed-in users but nothing admin-specific. **Recommendation:** when `isAdmin`, add an Admin group to the palette with "Products", "Orders", "Customers", "Analytics", "Settings". Done in this round.

### Gap 4 — duplicate destinations from home cards vs nav

The home page has cards for "Teas", "Gift Builder", "Visit Us", duplicating exact nav links. This is fine — multiple entry points lower cognitive cost — but documenting it so future redesigns don't accidentally diverge the labels.

---

## Sign-off

The map above is the source of truth for which trail every page renders. When new routes land, append a row here and to the breadcrumb-decisions table. Reviewers should reject route additions that don't update this doc.
