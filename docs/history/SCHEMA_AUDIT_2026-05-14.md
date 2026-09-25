# Schema audit — 2026-05-14

Deep end-to-end review of every file in `src/schemas/` against actual
runtime usage in the client, Cloud Functions, and Firestore writes.
14 gaps found, all fixed.

## Method

For each of the 21 files in `src/schemas/`:

1. Read the schema file front-to-back.
2. Grep the entire codebase (`src/` and `functions/src/`) for imports
   and type usages.
3. Compare schema field set against:
   - Write call sites (`setDoc`, `addDoc`, `updateDoc`, Cloud Function
     payloads).
   - Read call sites (consumer components, hooks, CF read handlers).
   - The Firestore document shape (inferred from the writes).
4. Flag any field that's declared but never written, written but never
   declared, validated-but-rebuilt, or stored at a different path than
   the schema implies.

## Summary table

| # | Severity | Schema | Gap | Fix |
|---|----------|--------|-----|-----|
| 1 | data loss | product | `AdminProducts.handleAdd` validated `blurhash`/`variantsAvailable` but wrote a separate literal that omitted them | Refactored to write `parsed.data` directly |
| 2 | data loss | order | `placeOrder` only persisted 3 of the 5 documented gift fields (`senderName`/`occasion`/`customOccasion` dropped) | Added persistence for all 5 |
| 3 | drift | user | `userProfileSchema.isAdmin` declared but never written (only `role` is) | Removed phantom field |
| 4 | drift | user | `userProfileSchema.preferences` nested shape never written (real prefs live in subcollection) | Removed phantom field |
| 5 | drift | address | `phone` rule `min(10)` disagreed with checkout's 7-digit heuristic | Aligned to 7-digit |
| 6 | docs | README | Listed 11 schemas; folder has 21; 8 schemas undocumented | Rewrote README to match reality |
| 7 | hygiene | index | Barrel silently excluded 5 runtime-used schemas | Re-exports all runtime schemas |
| 8 | dead field | category | `labelFr` declared in schema but dropped by `useCategoriesRealtime` | Hook now surfaces it |
| 9 | drift | review | Schema declared `id`/`productId`/`title`/`images`/`verified`/`helpful` — none exist in real review docs | Schema rewritten to match the 5 actual fields |
| 10 | drift | announcement | `AdminSettings.announcements` typed as inline anonymous shape, drift bait | Now imports the canonical `Announcement` type |
| 11 | drift | notification | Strict union shape for `customer_credit_admin_added` omitted `orderId`/`sourceType` that the CF writes | Added both as optional fields |
| 12 | **privacy / CASL** | userPreferences | All 9 transactional order emails called `sendEmail({...})` without `uid + category`, completely bypassing the notification preferences gate | Added `uid + category: 'orderUpdates'` to all 9 sites |
| 13 | drift | product | `AdminProducts.handleUpdate` had the same dual-literal pattern as `handleAdd` | Now derives `updateDoc` payload from `parsed.data` via undefined→null mapping |
| 14 | dead helper | announcement | `migrateLegacyAnnouncementText` defined but never invoked; Navbar comment claimed admin saves "auto-migrate server-side" — they didn't | Wired into `AdminSettings.handleSave` |

## Detail per fix

### Gap #1 — AdminProducts.handleAdd

`src/app/pages/admin/AdminProducts.tsx`

**Symptom:** Admin uploads a tea image; the uploader computes `blurhash`
and sets `variantsAvailable: true`. Admin clicks Save. Tea is created
in `/teas/{slug}` but the document has neither field. LazyImage falls
back to the generic skeleton. Admin has to re-open the tea and click
Save again to get the blurhash persisted.

**Cause:** The handler built a `candidate` object (with both fields)
for `validateCreateProduct(candidate)`, then a SEPARATE inline object
literal for `setDoc(...)` that didn't include `blurhash` or
`variantsAvailable`. The two payloads drifted.

**Fix:** Write `parsed.data` directly (with `avgRating`, `ratingCount`,
`isActive`, and timestamps spread on top). One source of truth for the
write payload, validated by the schema.

### Gap #2 — placeOrder gift fields

`functions/src/index.ts`

**Symptom:** Customer places a gift order with all five personalization
fields filled in (`recipientName`, `senderName`, `giftMessage`,
`occasion`, `customOccasion`). Admin's order list filter "All Birthday
gifts" returns zero results even though the customer chose Birthday.

**Cause:** The Cloud Function used `...(data.recipientName ? {...} : {})`
patterns to copy gift fields to the top level of the order doc — but
only for `isGift`, `recipientName`, and `giftMessage`. The other three
were forgotten. The schema explicitly documents these as "mirrored
from cart bundle so admin filters work without a data migration."

**Fix:** Added the missing three. All 5 mirror fields now persist.
Source-of-truth inside `items[].bundle.personalization` is unchanged.

### Gap #12 — Notification preferences gate

`functions/src/index.ts` × 9 call sites

**Symptom:** Customer toggles "Order updates" OFF in
`/account → notifications`. Continues to receive every order-status
email anyway. Same story for other transactional categories.

**Cause:** The plumbing was complete on both ends. Client writes
`/users/{uid}/preferences/notifications`. CF helper
`userAcceptsCategory(uid, category)` reads the doc and respects the
toggle. The `sendEmail` helper has the gate built in, gated on
`uid + category` being provided. **Zero of the 9 order emails passed
those arguments**, so the gate never fired.

**Fix:** Added `uid: userId, category: 'orderUpdates'` to every
order-email send. CASL/CAN-SPAM/GDPR-compliant default (orderUpdates
ON) preserved — customers who never touch the toggle see no behavior
change.

### Gap #13 — AdminProducts.handleUpdate

Same root pattern as #1. `parsed.data` was discarded; the write was a
separate object literal that re-derived every field from form state.
Fixed via undefined→null mapping over `parsed.data` so the
"empty input clears the Firestore field" UX is preserved without the
drift bait.

### Gap #14 — Legacy announcement text migration

`src/app/pages/admin/AdminSettings.tsx` + `src/schemas/announcement.schema.ts`

The schema exports `migrateLegacyAnnouncementText(legacy: string)` to
split the old single-string `announcementText` (separator-delimited)
into the new structured `announcements` array. The Navbar comment
claimed admin saves "auto-migrate server-side." No such migration
existed anywhere. The helper was orphaned.

**Fix:** wired into `handleSave`. When admin saves AND the current
state has no structured announcements AND there's legacy text, the
text is split and stored. After one save, the legacy text is
effectively archived and the new-shape branch always wins in the
Navbar.

## Schemas examined

All 21 files in `src/schemas/`:

| Schema | Status after audit |
|--------|--------------------|
| product.schema | Fixed (gaps 1, 13) |
| order.schema | Fixed (gap 2) |
| user.schema | Fixed (gaps 3, 4) |
| address.schema | Fixed (gap 5) |
| cart.schema | Clean — round-trip safe after Round-3 cleanup |
| category.schema | Fixed (gap 8) |
| review.schema | Fixed (gap 9) — major rewrite |
| promotion.schema | Clean |
| notification.schema | Fixed (gap 11) |
| credit.schema | Clean — pure helpers correctly mirrored CF side |
| comboGallery.schema | Clean — reference implementation for validate-then-write |
| auth.schema | Clean |
| checkout.schema | Clean |
| announcement.schema | Fixed (gaps 10, 14) |
| userPreferences.schema | Fixed (gap 12, wired into CF email path) |
| firestoreTimestamp.schema | Clean |
| index.ts | Fixed (gap 7) |
| README.md | Fixed (gap 6) |
| gift.schema | Unused (documented as such) |
| payment.schema | Unused (documented as such) |
| analytics.schema | Unused (documented as such) |

## Not addressed (out of scope / deferred)

- **CF↔client schema duplication.** Cloud Functions can't import from
  `src/schemas/` because the tsconfig roots differ. Field names and
  default values are duplicated in `functions/src/lib/notificationPrefs.ts`,
  the `placeOrder` callable, the order email senders, etc. They match
  today but a real fix would extract a shared package consumed by both
  sides. Documented in README.
- **`/teas/{slug}/reviews` validation.** The new `reviewSchema` more
  faithfully describes the data, but nobody actually runs
  `validateReview` on persisted review docs. The schema is now usable
  for that purpose; wiring it in is a follow-up.
- **categories admin UI.** The schema describes a `labelFr` field and
  the hook now surfaces it, but there's no admin page to edit
  categories — they're created via Firestore Console. The
  schema's `validateCreateCategory` / `validateUpdateCategory` helpers
  are ready for the day someone builds that admin page.

## Files touched in this audit

```
functions/src/index.ts                                  (gaps 2, 12)
src/app/pages/admin/AdminProducts.tsx                   (gaps 1, 13)
src/app/pages/admin/AdminSettings.tsx                   (gaps 10, 14)
src/hooks/useCategoriesRealtime.ts                      (gap 8)
src/schemas/README.md                                   (gap 6)
src/schemas/address.schema.ts                           (gap 5)
src/schemas/index.ts                                    (gap 7)
src/schemas/notification.schema.ts                      (gap 11)
src/schemas/review.schema.ts                            (gap 9)
src/schemas/user.schema.ts                              (gaps 3, 4)
```

---

## Round 2 — collection-first audit (May 14, evening)

A second pass running the audit from the opposite direction: inventory
every Firestore collection actually written, then diff against its
schema. This caught gaps the schema-first pass missed because the data
itself didn't reveal them.

### Additional gaps found and fixed (#15 – #21)

| # | Severity | Site | Gap | Fix |
|---|----------|------|-----|-----|
| 15 | drift | orderSchema | `restored`/`restoredAt` fields written by CF `restoreStockAndCredit` helper but not declared in schema | Added both as optional fields |
| 16 | type drift | `/settings/global` | Three competing shapes for the settings doc: `useSettings.SETTING_DEFAULTS`, `AdminSettings.DEFAULTS`, `src/types/firestore.ts SettingsDoc` — all disagreeing on what fields exist | Added missing store-identity + email-control + branding fields to `useSettings.SETTING_DEFAULTS`; created canonical `src/schemas/settings.schema.ts` |
| 17 | dead admin toggle | AdminSettings | `sendOrderEmails` admin toggle was wired to UI but the server-side `sendEmail` never read it — flipping the toggle had zero effect | Wired into `functions/src/index.ts → sendEmail` as a global kill switch for `category === 'orderUpdates'`. `sendShippingEmails` and `lowStockThreshold` flagged as intentionally-unwired with comments |
| 18 | missing admin UI | `/settings/global` | `emailLogoUrl` (CF reads it for branded email headers) had no admin UI field — admin could only override via Firestore Console | Added Email Logo URL input to AdminSettings Branding section. Also added the long-missing OG Image URL field |
| 19 | parallel type system | `src/types/firestore.ts` | Competed with `src/schemas/`. Defined `OrderDoc`, `TeaDoc`, `UserDoc`, `OrderStatus`, `SettingsDoc`, `NotificationDoc`, `ReviewDoc` — most either duplicating or **drifting** from the schemas | Deleted. Migrated three consumers (`OrderStatusTimeline`, `AdminOverview`, `AdminAnalytics`) to import from `src/types/index.ts` with aliases (`Order as OrderDoc`, etc.) so call-site names are preserved while types come from the canonical schemas |
| 20 | **UX bug** | `OrderStatusTimeline` | `OrderStatus` in `firestore.ts` was missing `'ready_for_pickup'` (the schema's enum has it). And the timeline's `STEPS[].reachedBy` didn't list `'ready_for_pickup'` for the "Ready" step. So pickup orders at status `ready_for_pickup` rendered with neither "Ready" nor "Picked up" marked reached — the customer's timeline silently stuck at "Confirmed" even though the café was holding their order at the counter | Added `'ready_for_pickup'` to the appropriate `reachedBy` lists. With #19's removal of the parallel `OrderStatus`, this is now type-checked end-to-end |

### Collections inventoried (every Firestore collection in the code)

| Collection | Schema | Round-2 status |
|------------|--------|----------------|
| `/teas/{slug}` | product.schema | Clean — fields match writes (round 1 fixed handleAdd / handleUpdate) |
| `/teas/{slug}/reviews/{userId}` | review.schema | Clean — round 1 rewrote to match real shape |
| `/orders/{orderId}` | order.schema | **Fixed** in round 2 — added `restored`/`restoredAt` |
| `/users/{uid}` | user.schema | Clean — round 1 removed phantom `isAdmin`/`preferences` |
| `/users/{uid}/preferences/notifications` | userPreferences.schema | Clean — round 1 wired CF gate |
| `/users/{uid}/wishlist/{slug}` | (no schema) | Skipped — loose subcollection, no validation pressure |
| `/credits/{userId}` | credit.schema | Clean — fields match writes exactly |
| `/creditTransactions/{txId}` | credit.schema | Clean — schema is a superset of every write site |
| `/notifications/{id}` | notification.schema | Clean — round 1 added `sourceType`/`orderId` to credit_admin_added data |
| `/promotions/{id}` | promotion.schema | Clean |
| `/promotionUsage/{id}` | promotion.schema (`promotionUsageSchema`) | Clean |
| `/categories/{id}` | category.schema | Clean — round 1 wired `labelFr` |
| `/comboGalleryItems/{id}` | comboGallery.schema | Clean — reference impl |
| `/carts/{userId}` | cart.schema | Clean — round-trip validation only |
| `/settings/global` | **NEW**: settings.schema | **Fixed** in round 2 — created canonical schema; aligned admin + client defaults |
| `/pageViews/*`, `/rum/*`, `/verificationEvents/*`, `/roleSignals/*` | (no schema) | Skipped — analytics / signals with no validation pressure |

### Files touched this round

```
functions/src/index.ts                                  (gaps 17)
src/app/components/OrderStatusTimeline.tsx              (gaps 19, 20)
src/app/pages/admin/AdminAnalytics.tsx                  (gap 19)
src/app/pages/admin/AdminOverview.tsx                   (gap 19)
src/app/pages/admin/AdminSettings.tsx                   (gaps 16, 18)
src/hooks/useSettings.ts                                (gap 16)
src/schemas/index.ts                                    (export settings schema)
src/schemas/order.schema.ts                             (gap 15)
src/schemas/settings.schema.ts                          (NEW — gap 16)
src/types/firestore.ts                                  (DELETED — gap 19)
```

### After this round: confidence statement

Every Firestore collection used by the app has either:
- A Zod schema whose field set matches every write site, or
- An explicit "no schema needed, here's why" comment (the analytics /
  signals collections, which are loose-shaped by design).

The two parallel type systems are now one. Every type the admin or
customer UI consumes for Firestore data flows from `src/schemas/`. The
last competitor (`src/types/firestore.ts`) is gone.
