# Audit Fixes — Ele Café

This document summarises the security and correctness fixes applied to
the codebase as a result of the deep audit. Every change in this batch
is in service of one of these priorities:

  1. Stop money / inventory leaks (free credits, free stock).
  2. Make features that silently failed actually work (reviews).
  3. Make admin tooling reflect reality (analytics, order edits).
  4. Tighten security boundaries (rules, reCAPTCHA, cache poisoning).
  5. Fix latent UX bugs (free-shipping bait-and-switch, UTC dates).

Every code change is paired with a typecheck + lint + unit-test pass.
185/185 unit tests pass; client and Cloud Functions both `tsc --noEmit`
clean; production build runs end-to-end with valid env vars.

## How the Google sign-in page (logo + custom domain) is changed

These are NOT code changes — they live in Firebase Console + Google
Cloud Console:

### Custom domain (replace `ele-cafe-d7237.firebaseapp.com`)
1. Firebase Console → Hosting → add custom domain `auth.elecafe.ca`.
2. Firebase Console → Authentication → Settings → Authorized domains
   → add `auth.elecafe.ca` and `elecafe.ca`.
3. In `.env`, change `VITE_FIREBASE_AUTH_DOMAIN` to `auth.elecafe.ca`.
4. Redeploy. Sign-in screen will say "to continue to auth.elecafe.ca".

### Logo on the Google sign-in screen
1. Google Cloud Console → APIs & Services → OAuth consent screen.
2. Upload logo (PNG/JPG, 120×120 minimum, <1 MB).
3. Fill app name, support email, app domain (elecafe.ca), privacy
   policy URL, terms-of-service URL.
4. Submit for verification. Approval takes a few business days to a
   few weeks. Until then, only listed test users see the logo.

---

## Critical fixes (money / inventory / data integrity)

### 1. Promo dropped on admin approve
**Files:** `src/app/pages/admin/AdminOrders.tsx`, `src/types/firestore.ts`

`OrderItem` was typed with `id`/`name` but the actual write shape is
`productId`/`productName`. Same drift caused AdminOrders' approve
recalc to read `order.discount` (legacy field) instead of
`order.promoDiscount` — overcharging customers by the promo amount
on every approved order using a code.

Fixed: type aligned with reality, approve recalc reads `promoDiscount`
with legacy `discount` fallback, EditOrderModal writes BOTH the
canonical and legacy field names so historical readers keep working.

### 2. Stock & credit "inflation" exploit on rejected orders
**Files:** `functions/src/index.ts` (`onOrderWrite`, `restoreStockAndCredit`)

When the cloud-function stock check failed (e.g., a malicious client
modified `localStorage['cart']` to set quantity beyond available stock),
the order was marked `rejected` — but `restoreStockAndCredit` then
blindly ran `FS.increment(quantity)` on every line item AND refunded
claimed `creditPointsRedeemed`, neither of which had been deducted.
Free stock and free credits.

Fixed:
- Pending branch sets `decremented: true` on successful decrement, or
  `decremented: false` when rejecting before the decrement runs.
- `restoreStockAndCredit` skips stock restoration when
  `data.decremented === false`.
- `restoreStockAndCredit` refunds `creditPointsActuallyDeducted` (the
  real amount written by the deduction transaction, possibly clamped
  by available balance) instead of the customer-claimed amount.
- Promo decrement now uses the existence of a `/promotionUsage` doc as
  proof that the original increment actually happened.

### 3. Reviews completely broken (PERMISSION_DENIED)
**Files:** `firestore.rules`

The review submission transaction in `TeaProfilePage` calls
`tx.update(teaRef, { avgRating, ratingCount })`, but `/teas` was
admin-only-write. The whole transaction rolled back silently for every
non-admin user. Reviews appeared to submit, then vanished.

Fixed: narrow customer-write carve-out on `/teas/{id}` allowing only
`avgRating` (number 0-5), `ratingCount` (non-negative int growing by
≤1 per request), and `updatedAt`.

### 4. SEO ratings rendered at 1 star
**Files:** `functions/src/index.ts` (`patchHeadForTea`)

`avgRating` is stored as a true mean (clamped 0-5) by the review
write transaction, but the cloud-function SEO renderer divided by
`ratingCount` again. A 4.5★ tea with 5 reviews rendered as 0.9★ to
crawlers. The corresponding bug in `SeoHead.tsx` was already fixed in
a previous iteration — this caught up the function copy.

Fixed: dropped the divide; clamp [1, 5] for legacy data safety.

### 5. New user's cart wiped on user switch
**Files:** `src/hooks/useCartSync.ts`

When User A logged out and User B logged in on the same device, the
"clear local cart" `setItems([])` synchronously fired the persist
effect under User B's uid — wiping User B's remote cart before the
async `getDoc` could merge it back.

Fixed: set `suppressUntilRef.current = Date.now() + SUPPRESS_WRITE_MS`
BEFORE `setItems([])` so the persist effect's write is debounced past
the merge.

### 6. `creditApplied` not validated against rate
**Files:** `functions/src/index.ts` (`onOrderWrite`)

A malicious client could submit `creditPointsRedeemed: 100`,
`creditApplied: 50` (claiming $50 off for $0.10 worth of points). The
Firestore rule only checked `creditApplied >= 0`; the cloud function
used the claimed `creditApplied` to compute `totalAmount` lower bound
without verifying the rate.

Fixed: pending branch reads `creditValuePer1000` from `/settings/global`,
computes expected `creditApplied = points × (rate / 1000)`, rejects the
order with a meaningful reason if the claim exceeds expected by >1¢.

---

## High-severity fixes

### 7. Promo `usageCount` DoS
**Files:** `firestore.rules`

The customer carve-out allowed any signed-in user to repeatedly increment
`usageCount` by 1, exhausting the `usageLimit` in seconds and locking
other customers out.

Fixed: removed customer write path on `/promotions`. The cloud function
already does the increment server-side via Admin SDK (which bypasses
rules), so no functionality is lost.

### 8. Translation cache poisoning
**Files:** `firestore.rules`

`/translations/{lang}/cache/{docId}` allowed any signed-in user to
write — a malicious customer could replace "Add to Cart" with a
phishing string for every other visitor.

Fixed: writes locked to admin only.

### 9. `verifyRecaptcha` action not validated
**Files:** `functions/src/index.ts`

The function accepted an action parameter but never compared it against
the action embedded in Google's response token, allowing token replay
across different reCAPTCHA-gated actions.

Fixed: when client passes `action`, compare against `data.action` from
Google's response; treat mismatch as `pass: false`.

### 10. Promo missing from customer emails
**Files:** `functions/src/index.ts` (`onOrderEmail`)

Email template read `after.discount` / `after.discountCode` (legacy
names) instead of `promoDiscount` / `promoCode`. Customers using a
promo saw $0 discount in their confirmation email.

Fixed: read canonical names with legacy fallback.

### 11. Hard-deleted teas break refunds
**Files:** `functions/src/index.ts` (`restoreStockAndCredit`)

`tx.update(teaRef, ...)` on a hard-deleted tea threw `NOT_FOUND` and
aborted the entire transaction — so the customer's credit refund
never landed and the order was stuck.

Fixed: pre-`tx.get(teaRef)`; skip with a warning when the tea no
longer exists.

### 12. Admin-edited order items skipped stock tracking
**Files:** `src/app/pages/admin/AdminOrders.tsx`

EditOrderModal's "add tea" picker captured only `name`/`price`/`image`,
omitting the slug. The cloud function's stock-decrement loop filters
items by `productId`, so admin-added items silently bypassed inventory.

Fixed: picker now captures `slug`, attaches it as `productId`. Custom
items (admin's "$0 freebie" path) still omit `productId` deliberately —
they don't map to a tea doc.

### 13. AdminAnalytics top-teas chart was empty
**Files:** `src/app/pages/admin/AdminAnalytics.tsx`

The aggregation keyed off `item.id` / `item.name` (which never
existed), producing `{undefined: ...}`. The chart silently rendered
nothing.

Fixed: keys off `productId || productName` with proper fallback.

### 14. `adminAdjustCredit` audit drift
**Files:** `src/contexts/CreditContext.tsx`

When admin tried to deduct more points than the user had, balance
floored at 0 (e.g., −5 actual delta) but the audit log recorded the
claimed amount (−100). Audit chain diverged from running balance.

Fixed: compute `actualDelta = newBalance - oldBalance` and log THAT.
No-op deductions (zero-balance customers) skip the audit row entirely.

### 15. Free-shipping inconsistency between cart drawer and checkout
**Files:** `src/app/pages/CheckoutPage.tsx`

Cart drawer's progress bar used `totalPrice` (subtotal); CheckoutPage
called `calcShippingFee(afterCredit, ...)`. A customer at $80 saw
"You qualify for free shipping!" in the drawer, applied $50 of credit,
then watched shipping reappear because $30 < threshold.

Fixed: CheckoutPage now uses `afterPromo` (post-promo, pre-credit) so
applying loyalty currency doesn't penalise the customer with a
shipping surcharge.

---

## Medium-severity fixes

### 16. `useSessionTracker` dead ternary
**Files:** `src/hooks/useSessionTracker.ts`

`final ? serverTimestamp() : serverTimestamp()` — both branches
identical. Periodic mid-session flushes wrote
`lastSessionEndedAt: serverTimestamp()`, so admin's customer-list
"currently active" indicator never showed anyone.

Fixed: `final ? serverTimestamp() : null`.

### 17. `mockProducts` bleed-through prevents admin field clearing
**Files:** `src/lib/firebaseQueries.ts`

`firestoreData.description || mock.description` treats empty string as
"not provided", falling back to mock data. Admin clearing a
description had no effect — customers still saw the mock content.

Fixed: explicit `undefined` check via a `pick()` helper that respects
empty strings.

### 18. Announcement filter uses UTC, not local time
**Files:** `src/schemas/announcement.schema.ts`

`now.toISOString().slice(0, 10)` returns UTC date. For Vancouver-tz
admin entering `endDate: '2026-07-02'`, the announcement vanished at
4 PM Pacific on July 2 (when UTC ticked to July 3) — Canada Day
banners died early.

Fixed: build date string from `now.getFullYear()` / `getMonth()` /
`getDate()` (local).

### 19. `fetchComboBySlug` `!=` filter excludes legacy docs
**Files:** `functions/src/index.ts`

Firestore's `where('enabled', '!=', false)` excludes documents missing
the `enabled` field entirely. Combo docs seeded before the field was
introduced never appeared in pairing pages.

Fixed: drop the inequality filter, post-filter in JS treating
`enabled === undefined` as enabled.

### 20. `onAnnualCreditReset` unpaginated
**Files:** `functions/src/index.ts`

`db.collection('credits').get()` loads the entire user base into
memory and risks OOM/timeout. Worked at small scale, would fail
silently on a busy New Year's Day.

Fixed: paginate via `orderBy(FieldPath.documentId()).limit(500)`
with cursor; safety stop at 200 pages (100k accounts).

### 21. `roleSignals` listener re-mounts on role change
**Files:** `src/contexts/AuthContext.tsx`

`useEffect(...)` had `isAdmin` in deps. Every successful role refresh
updated isAdmin, which tore down + re-subscribed, which skipped the
NEXT signal as "first snapshot" — silently dropping role changes
arriving while the listener was rebooting.

Fixed: read latest `isAdmin` through a ref; effect only re-runs on
`currentUser` change.

---

## What's NOT fixed (and why)

### Translation API key in client bundle
`VITE_GOOGLE_TRANSLATE_API_KEY` is in `useT.ts` and `lib/translation.ts`.
Anyone can extract it from the deployed bundle and rack up your GCP
bill. Real fix requires a new Cloud Function (`translateText`) calling
Google's API server-side with a Firebase secret, plus client refactor
of both files to call the function instead.

This is an architectural change (~1 day of work), not a 5-line edit.
Mitigation in the meantime: in Google Cloud Console restrict the API
key to (a) the Translation API only, and (b) HTTP referrer allowlist
of `elecafe.ca` and `*.elecafe.ca`. That stops casual abuse but
doesn't block a determined attacker forging the Referer header.

### AdminOverview stat caps
`limit(200)` on orders, `limit(1000)` on users, `limit(2000)` on
credits. Once the store grows past these, the dashboard silently lies.
Real fix: Firestore `count()` aggregation queries for counts; a
denormalised `/counters/global` doc incremented in the
`delivered` branch of `onOrderWrite` for revenue. Doable but needs
matching test coverage I can't run here.

### Account enumeration on signup
`auth/email-already-in-use` reveals which emails are registered.
Firebase Console toggle (Email enumeration protection) suppresses it.
That's the real fix — requires opening the console, not a code change.

### Custom auth domain + Google OAuth logo
Console-only. See "How the Google sign-in page is changed" above.

---

## Test status

```
Client typecheck:       PASS  (tsc --noEmit, 0 errors)
Functions typecheck:    PASS  (tsc --noEmit, 0 errors)
ESLint:                 PASS  (0 errors, 0 warnings)
Unit tests:             PASS  (185/185)
Production build:       PASS  (with valid env vars)
```

---

## Files modified

```
firestore.rules
functions/src/index.ts
src/types/firestore.ts
src/app/pages/admin/AdminOrders.tsx
src/app/pages/admin/AdminAnalytics.tsx
src/app/pages/CheckoutPage.tsx
src/contexts/CreditContext.tsx
src/contexts/AuthContext.tsx
src/hooks/useCartSync.ts
src/hooks/useSessionTracker.ts
src/lib/firebaseQueries.ts
src/schemas/announcement.schema.ts
```

12 files. All changes are minimal and surgical; nothing was
restructured or rewritten beyond what each fix needed.
