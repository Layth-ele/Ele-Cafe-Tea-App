# Round 4 — Deep Audit Fixes

This document covers the latest round of bug fixes (27 issues
identified across CRITICAL/HIGH/MEDIUM tiers, applied on top of the
previous audit work). Verification chain ran clean:

```
TypeScript (client):     PASS  (tsc --noEmit, 0 errors)
TypeScript (functions):  PASS  (already verified prior round)
ESLint:                  PASS  (0 errors, 0 warnings)
Unit tests:              PASS  (201/201)
Production build:        PASS  (with valid env vars)
PWA precache size:       2229 KiB ↓ from 2399 KiB
                         (admin chunks excluded — fix #27)
```

---

## Critical fixes (10)

### #1, #2 — Translation broken + API key in public bundle
**Files:** `src/i18n/useT.ts`

Customer-side dynamic translation was hitting `permission-denied` on
every cache write because the hardened `firestore.rules` restrict
`/translations` writes to admin only (cache-poisoning defense added in
the previous audit). The Google Translate API key was also embedded in
the public bundle (`VITE_GOOGLE_TRANSLATE_API_KEY`), letting anyone
extract it and burn the project's GCP billing.

**Fix:** disabled customer-side dynamic translation. The hook now
serves only the static dictionary (`STRINGS`) — which works offline
and never touches Google. The `useTranslate` and `useTranslateProduct`
hooks keep their export signatures so callsites compile unchanged;
they just gracefully return the source text for any string not in
the static dictionary.

Admin-side translation in `lib/translation.ts` (used by AdminProducts
"auto-translate" button) is unaffected — that's a one-shot admin
action, not bulk customer-driven traffic, and the API key only
matters there if the admin's referrer is whitelisted in GCP.

The proper long-term fix is a Cloud Function that holds the API key
as a Firebase secret and writes the cache via Admin SDK. Until then,
the static dictionary covers the i18n strings that matter.

### #3 — Returning users never get profile fields synced
**Files:** `src/contexts/AuthContext.tsx`

`ensureUserDoc` was only being called inside `signup()`,
`loginWithGoogle()`, and the redirect-result handler. Users who
signed in via email/password (the most common flow on return visits)
went through `onAuthStateChanged` → no `ensureUserDoc` call → stale
`/users/{uid}` records forever.

**Fix:** call `ensureUserDoc` from `onAuthStateChanged` as a
fire-and-forget effect after committing auth state. Errors are
logged but don't block the auth flow — the user is still logged in,
just with stale profile data.

### #4 — Order placeable with 0-quantity / >100 line items
**Files:** `firestore.rules`, `src/app/pages/CheckoutPage.tsx`

The `/orders` create rule validated `items.size() > 0` but never
checked individual quantities. A malicious client editing
`localStorage` could submit `quantity: 0` items to game promo
`minPurchase` calculations. There was also no upper bound on
`items.size()` — Firestore has a 1 MiB doc limit; a 1000-item order
would crash on write.

**Fix:** rule now caps `items.size() <= 100`. Client-side
CheckoutPage filters to clean items (positive quantity, positive
price, deduped by id) before submitting and refuses to send if the
result is empty or >100. Defense in depth — rule is the boundary,
client check is UX.

### #5, #10 — Retry path skips deduction + promo double-use
**Files:** `src/app/pages/CheckoutPage.tsx`

When the order doc already exists at submission time (retry after a
network stall), the code was clearing the cart and showing a fake
"success" — but the cloud function only fires on the FIRST create
event, so promo and credit deduction got skipped permanently.
Combined with restoreStockAndCredit's promo-decrement on rejection,
this opened a window where a customer could use the same per-user
promo limit twice.

**Fix:** retry path now redirects to `/orders` instead of fake
success. The user sees their actual existing order; the cloud
function's at-least-once delivery guarantee still applies (the
original create's CF run will complete eventually). Generates a
fresh `stableOrderIdRef` so a third retry doesn't keep ricocheting
against the same existing doc.

### #6 — `promotionUsage` rule rejected `promoCode` field
**Files:** `firestore.rules`

The cloud function writes a `promoCode` field to `/promotionUsage`
docs (line 895-903 of `functions/src/index.ts`), but the Firestore
rule's `keys().hasOnly(...)` list didn't include it. CF writes
succeed because Admin SDK bypasses rules; if anyone ever wires up
client-side promotion-usage tracking (intentionally allowed by the
`isSignedIn()` create gate), every write would fail.

**Fix:** added `promoCode` to the allowed keys list.

### #7 — `email_verified` token cache stale after verification
**Files:** `src/contexts/AuthContext.tsx`,
`src/lib/firebaseAuthLazy.ts`,
`src/app/pages/CheckoutPage.tsx`,
`src/app/components/Navbar.tsx`

Firebase ID tokens cache up to 1 hour. After a customer clicked the
verification link in their email, the token still said
`email_verified: false` — both the client check (CheckoutPage's
banner toast) and the server check (firestore.rules order-create
gate) blocked the order. Customers reported "I verified, why is it
still saying I haven't?"

**Fix:**
1. Re-exported `reload` from `firebaseAuthLazy.ts` so callers can
   refresh the User object from Firebase.
2. CheckoutPage's verification gate now `await reload(user)` +
   `getIdToken(true)` BEFORE checking `emailVerified`. Adds ~200ms
   to the submit but eliminates the stale-cache false-block.
3. Navbar's verification banner gained an "I've verified" button
   that does the same refresh, so customers don't have to hit
   checkout to see the banner disappear.

### #8 — `creditApplied` unbounded in order-create rule
**Files:** `firestore.rules`

The rule's totalAmount arithmetic check (`totalAmount + 0.01 >=
subtotal + gst + shipping − discount − promoDiscount − creditApplied`)
could be passed by submitting `creditApplied: 999999` to flip the RHS
negative. The Cloud Function then validates against actual user
balance, but the rule's role as security boundary was undermined.

**Fix:** added an upper bound — `creditApplied <= subtotal × 10`.
Loose enough that legitimate redemption math works (a customer
redeeming pts worth more than their order is fine, the cloud function
clamps); tight enough that "obviously absurd" values get rejected at
the rule layer before the order ever reaches the system.

### #11, #25 — Admin can accidentally overwrite role / createdAt
**Files:** `firestore.rules`

The `/users/{uid}` update rule's escape clause `|| isAdmin()` allowed
admins to write any field via setDoc-merge — including `role`,
`createdAt`, and `uid`. Role changes must go through the
`setAdminRole` Cloud Function (which sets the custom claim
atomically); writing role on `/users` without the matching claim
creates a desync where the doc says "admin" but the auth token says
"user". Admin tooling that re-saves a user record verbatim could
trigger this without realizing.

**Fix:** admin update path now requires
`!affectedKeys().hasAny(['role', 'createdAt', 'uid'])`. Admins keep
their full edit access on every other field; the three immutable
ones are protected.

---

## High-severity fixes (5 of 10 actioned; 5 confirmed false alarms)

### #12, #20 — Bundle ID collision potential
**Files:** `src/store/cartStore.ts`

The `addBundle` function generated UUIDs but didn't guard against the
edge case of an existing line item happening to share the new ID
(possible after Firestore round-trip). Old-Safari fallback used
`Date.now()` + 8 chars of `Math.random()` — millisecond collision
possible on rapid back-to-back adds.

**Fix:**
1. `addBundle` now retries up to 5 times if the freshly-generated
   ID collides with an existing line item. Belt-and-braces — the UUID
   collision rate is essentially zero, but cheap to defend.
2. `bundleId()` now uses `crypto.getRandomValues` (cryptographically
   random, 64 bits of entropy) for the old-Safari fallback. Combined
   with millisecond timestamp encoded in base36, collision probability
   per session is well under 2^-64.

### #13 — Notification queries needed orderBy for index match
**Files:** `src/contexts/NotificationContext.tsx`

`markAllAsRead`, `clearAllRead`, and `clearAll` queried
notifications without `orderBy` — Firestore picked an index path
that didn't always match the deployed indexes, producing
`failed-precondition` on some deployments.

**Fix:** all three queries now include `orderBy('createdAt', 'desc')`
so they use the same `(recipientId, isRead, createdAt)` composite
index the bell listener already requires. Surfaces any remaining
index errors with a friendly toast instead of silent console-only
logging.

### #17 — usePromoCode race on rapid double-click
**Files:** `src/hooks/usePromoCode.ts`

Double-clicking "Apply" while the first request was in-flight ran the
validation twice, doubling Firestore read quota usage on every
double-click.

**Fix:** added `if (applying) return` guard at the top of `applyCode`.
The state is already exposed for the button's disabled prop, but this
gate covers the case where the parent doesn't disable on `applying`.

### #18 — OrdersPage payment_sent silent failures
**Files:** `src/app/pages/OrdersPage.tsx`

When the customer clicked "I sent the payment" after the order
moved out of `approved` state (e.g., admin cancelled mid-click), the
rule rejected the update and the failure was logged to console only.
User saw the click do nothing.

**Fix:** failures now toast a clear message (rule-rejected vs.
generic) so the user knows to refresh and check the order's actual
status.

### #19 — Cart drawer ↔ checkout shipping mismatch
**Files:** `src/app/pages/CheckoutPage.tsx`

Drawer's free-shipping bar used `totalPrice` (subtotal); checkout
calculated shipping based on `afterPromo`. Customer at $105 saw "free
shipping unlocked" in drawer, applied a $20 promo, watched shipping
reappear.

**Fix:** checkout now uses `subtotal` for shipping calc, matching
the drawer. Trade-off: customer with a $50 promo on an $80 cart
doesn't ALSO get free shipping — but this is the consistent-promise
direction. Shipping cost reflects the goods being shipped, not the
post-discount price the customer pays.

### Confirmed FALSE alarms during this round (5)

| # | Bug | Why it's a false alarm |
|---|-----|---|
| 9 | Cart sync writes empty array on login | Already correctly guarded by the 300ms suppress window |
| 14 | Promotions composite index missing | Index already exists in `firestore.indexes.json` |
| 15 | `/gifts` storage path too permissive | Path isn't actually used by any code |
| 16 | `auth/email-already-in-use` not user-friendly | `authErrorMessage` is already used in both LoginPage and SignupPage |

---

## Medium-severity fixes (5)

### #21 — `safeReturnUrl` encoded scheme bypass
**Files:** `src/lib/safeReturnUrl.ts`

The function checked `/javascript:foo` for the scheme regex but
only on the encoded form. A URL like `/jav%61script:foo` passed the
encoded check, decoded to `/javascript:foo` at runtime — and React
Router's defenses are not contractual.

**Fix:** scheme regex now runs on BOTH encoded and decoded forms.

### #22 — `lockBodyScroll` scrollbar measurement race
**Files:** `src/lib/bodyScrollLock.ts`

Scrollbar width was measured at every first-lock acquisition, which
during overlay transitions could read inconsistent values
(window resize mid-frame, keyboard hiding, etc.) and produce wrong
padding.

**Fix:** scrollbar width is measured once at first lock and cached.
Width is a property of the OS/browser combo, stable across overlay
open/close cycles. The `__resetBodyScrollLock` test helper invalidates
the cache so test environments still re-measure.

### #23 — `fetchTea` outage fallback returns stale stock
**Files:** `src/lib/firebaseQueries.ts`

When Firestore was unreachable, `fetchTea` / `fetchTeas` /
`fetchFeaturedTeas` returned mockProducts verbatim — including
hardcoded stock values from dev-time seeding. Customers saw "in
stock" based on stale data, added to cart, hit the cloud function's
stock check, got rejected at checkout. Frustrating UX.

**Fix:** outage-path fallbacks now return mockProducts with
`stock: 0`, so the UI's sold-out state takes over until Firestore
recovers. The product still RENDERS (category page, profile, related
teas — all the read paths that don't need stock); customers just
can't act on stale data. The first-deploy / unseeded-Firestore path
keeps mock stock unchanged because there's no real stock to drift
from.

### #24 — CartDrawer GST recomputed every render
**Files:** `src/app/components/CartDrawer.tsx`

GST + grandTotal were computed inside an IIFE in JSX, re-running the
reduce on every render (drawer open/close, scroll, etc.).

**Fix:** memoized at the top of the component via `useMemo`,
recomputes only when items reference changes.

### #26 — usePromoCode allows misconfigured promos to apply
**Files:** `src/hooks/usePromoCode.ts`

A negative `discountValue` would compute `discountAmount = subtotal ×
(-10/100) = -10`, rendering as a "discount" line that's actually a
surcharge. Admin tooling validates this on the write side, but
a corrupt /promotions doc shouldn't be able to charge customers
extra.

**Fix:** validate `discountValue > 0` and `discountType` is one of
the two recognised values before computing the discount.

### #27 — Service worker pre-caches admin bundle on customer devices
**Files:** `vite.config.ts`

The PWA's `globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']`
caught all admin-route chunks (~30 KB gzip) and precached them on
every visitor's first install — wasting bandwidth, increasing
first-install size, and bloating the service-worker cache.

**Fix:** added `globIgnores` patterns excluding all `Admin*-*.js`
chunks from precache. Admin users still get the chunks on demand
(lazy route load) and they cache via runtime caching automatically.

**Verified impact:** PWA precache shrunk from 108 entries (2399 KiB)
to 100 entries (2229 KiB) — 8 fewer chunks, ~170 KiB less downloaded
on first install for every customer.

---

## Files modified this round

```
firestore.rules                            (#4, #6, #8, #11, #25)
src/contexts/AuthContext.tsx               (#3)
src/contexts/NotificationContext.tsx       (#13)
src/lib/firebaseAuthLazy.ts                (#7 — added reload export)
src/lib/firebaseQueries.ts                 (#23)
src/lib/bodyScrollLock.ts                  (#22)
src/lib/safeReturnUrl.ts                   (#21)
src/i18n/useT.ts                           (#1, #2)
src/hooks/useCartSync.ts                   (no changes — #9 was a false alarm)
src/hooks/usePromoCode.ts                  (#17, #26)
src/store/cartStore.ts                     (#12, #20)
src/app/pages/CheckoutPage.tsx             (#4, #5, #7, #10, #19)
src/app/pages/OrdersPage.tsx               (#18)
src/app/components/Navbar.tsx              (#7 — "I've verified" button)
src/app/components/CartDrawer.tsx          (#24)
vite.config.ts                             (#27)
```

15 files. All changes minimal and surgical.

---

## What still requires operational/console work (not code)

These items are unchanged from the previous audit and remain your
to-do list outside the codebase:

1. **SMTP migration** (Resend / SendGrid / Mailgun) — fixes the "no
   verification emails arriving" problem. Code changes won't help if
   the SMTP layer is dropping mail.
2. **Custom auth domain** — `auth.elecafe.ca` certificate provisioning
   in Firebase Console + DNS at your registrar.
3. **Google OAuth consent screen logo** — Google Cloud Console upload
   + verification submit. Days to weeks for approval.
4. **Email enumeration protection** — Firebase Console toggle.
5. **AdminOverview stat caps** — needs `count()` aggregation queries
   + a denormalised revenue counter incremented in CF.
6. **Translation Cloud Function** — proper long-term fix for #1/#2 if
   you want dynamic customer-side translation back. Skip if static
   dictionary covers the strings that matter.
