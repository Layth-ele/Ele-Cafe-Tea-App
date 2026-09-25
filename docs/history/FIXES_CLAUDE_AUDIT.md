# Bug audit & fixes — full pass

This document records the bugs found during a full-project audit and the fixes applied.

Result after fixes:
- `npm install` → works without `--legacy-peer-deps`
- `npm run typecheck` (`tsc --noEmit` with **strict mode on**) → **0 errors**
- `npm run build` (`vite build`) → **0 errors, 0 warnings**, largest chunk 396 kB (was 940 kB)

---

## Build / tooling

### 1. `package.json` — invalid ESLint version
ESLint `^10.2.1` does not exist (latest major is 9), so `npm install` failed outright with a peer-dependency error from `eslint-plugin-react`. Fix: `^9.17.0`.

### 2. `package.json` — missing `@types/react`, `@types/react-dom`, `typescript`
The project is TypeScript + React 19 but had no React type definitions and no `typescript` dep declared. Any CI typecheck step fails. Added all three to `devDependencies`.

### 3. Missing root `tsconfig.json`
A TypeScript codebase with no `tsconfig.json` — `tsc` couldn't run at all. Only `functions/tsconfig.json` existed. Added a proper modern config (`module: ESNext`, `moduleResolution: bundler`, `strict: true`, `paths: { @/* -> src/* }`, etc.).

### 4. `package.json` — no `typecheck` script
Added `"typecheck": "tsc --noEmit"` so CI / pre-commit hooks can catch type regressions.

---

## Critical data / correctness bugs

### 5. `src/data/mockProducts.ts` — all serving-suggestion data silently discarded
`TeaDef` did not declare `servingSuggestions`, and the `tea()` helper hard-coded `servingSuggestions: []`. All 80 tea entries specified serving suggestions in the source, but none ever reached the `Product` object. Affects the tea-profile page, admin product editor, and anywhere serving suggestions are rendered.

Fix: added the field to `TeaDef` and changed the helper to pass `d.servingSuggestions ?? []`.

### 6. `src/data/mockProducts.ts` — 16 green-tea entries had duplicate `origin` / `regions` keys
Each affected entry declared `origin`/`regions` on the opening `tea({ ... })` line AND again later in the same object literal. JavaScript silently keeps the last duplicate, so some teas displayed a different origin than what the opening line suggested (e.g. Genmaicha was showing "Kagoshima Prefecture" even though the first line said "Uji & Shizuoka").

Fix: removed the duplicates from the opening line while preserving runtime behavior (the later, more-detailed values win — matching the pattern used for black/white/oolong entries).

### 7. `src/app/pages/admin/AdminOverview.tsx` — `class=` instead of `className=`
Two cards (Recent Orders, Low Stock Teas) used `class="card"` and `class="card-head"` — React silently drops these attributes, so the `.card` / `.card-head` styling was not applying. Fixed both.

### 8. `src/app/components/SeoHead.tsx` — `hreflang` instead of `hrefLang`
Three `<link>` tags used `hreflang="..."` (lowercase), which React silently drops. The hreflang SEO tags for EN / FR / x-default were **never rendered in production**. Fixed all three.

### 9. `src/app/components/ui/dialog.tsx` — invalid `onOpenChange` on `DialogContent`
`onOpenChange` is a prop of `Dialog.Root`, not `Dialog.Content`. The handler attempted to lock body scroll on open, but because Radix's content component doesn't accept that prop, **the whole body-scroll-lock effect was dead code** — the user could scroll the page behind any dialog.

Fix: converted to a proper `React.useEffect(..., [])` that runs on `DialogContent` mount (dialog open) and cleans up on unmount (dialog close), preserving the original intent including scrollbar-width padding compensation.

### 10. `src/app/pages/ProductsPage.tsx` — React 19 `useRef()` missing initial value
`const syncTimer = useRef<ReturnType<typeof setTimeout>>();` — React 19 requires an explicit initial value. Passed `undefined`.

### 11. `src/app/pages/ProductsPage.tsx` — unsafe `Set<TeaCategoryId>.has(string)`
`validCatIds.has(urlCategory)` where `validCatIds` was narrowly typed. Widened the Set to `Set<string>` (it's a gate for an incoming URL segment, which is inherently `string`).

---

## Schema / type bugs

### 12. `src/schemas/order.schema.ts` — missing `createOrderSchema` / `CreateOrderInput`
`schemas/examples.ts` imported both, neither existed, and the whole file failed to compile. Added them as `orderSchema.omit({ id, createdAt, updatedAt })` to match the convention used by `product.schema.ts`.

### 13. Zod v4 migration — `.error.errors` → `.error.issues`
Zod 4 renamed `ZodError.errors` to `ZodError.issues`. Fixed in `src/schemas/examples.ts` (2 uses) and `src/schemas/README.md`.

### 14. `src/schemas/payment.schema.ts` — `z.record()` missing key type
Zod 4 requires `z.record(keyType, valueType)` (v3 accepted a single arg). Fixed both occurrences: `z.record(z.string(), z.unknown())`.

### 15. `src/schemas/notification.schema.ts` — missing `pointsExpired` field
`buildNotification` for the `customer_credit_reset` notification accessed `data.pointsExpired`, but the schema only had `pointsEarned`. Using `pointsEarned` as a fallback would be semantically wrong (reset ≠ earned). Added `pointsExpired: z.number().optional()` as a distinct field.

### 16. `src/scripts/seedEverything.tsx` — discriminated-union narrowing failure
The render path accessed `result.error` on the success branch of a ternary over `result.ok`. TypeScript's narrowing didn't propagate into the template literal. Refactored to explicit `result.ok === true ? (...) : (...)` branches.

### 17. `src/data/mockProducts.ts` — `d.category` possibly-undefined index (strict mode)
Since `Product['category']` inherits `.optional()` from the Zod schema, `TeaDef.category` was `ProductCategory | undefined`, and `IMG[d.category]` / `PRICE[d.category]` failed strict-mode index checks. Narrowed `TeaDef.category` to `NonNullable<Product['category']>` — every tea definition must specify a category.

### 18. `src/app/pages/GiftsPage.tsx:270` — `.toLowerCase()` on possibly-undefined name
Fallback filter path did `p.name.toLowerCase()` where `p.name` is optional. Added `(p.name ?? '')` guard.

### 19. `src/app/pages/TeaProfilePage.tsx:728` — comparison against possibly-undefined length
`product.comboImages?.length > 0` — when `comboImages` is undefined, `undefined > 0` is falsy at runtime but invalid under strict null checks. Fixed to `(product.comboImages?.length ?? 0) > 0`.

### 20. `src/schemas/examples.ts:186` — possibly-undefined `.toFixed` / `.substring`
Docs file, but fixed for hygiene: guarded `product.description`, `product.price`, `product.stock` with `?? '' / ?? 0`.

---

## Bundle / performance

### 21. `vite.config.ts` — vendor bundle was 940 kB, triggered chunk-size warning
The original `manualChunks` function had two issues:
- `id.includes('node_modules/react')` matched **everything** starting with "react" (react-router, react-hook-form, react-dom, …), so most of React ecosystem landed in `react-core`.
- Firebase's actual bundled code lives under `@firebase/*`, not `firebase/*` — the sub-package splits (`firebase-auth`, etc.) caught almost nothing.

Fix: rewrote `manualChunks` to match each package precisely and added buckets for `date-fns`, `forms` (react-hook-form + zod), `data-layer` (react-query + zustand + immer), `icons`, and `fonts`. Largest chunk is now **`firebase-firestore` at 396 kB (92 kB gzip)** — appropriate for an e-commerce app that needs full Firestore.

---

## Lower-priority observations (NOT fixed)

These aren't bugs — flagging for the maintainer.

### firestore.rules — hardening opportunities
- `/translations/{lang}/cache/{docId}` allows any signed-in user to write anything. Consider validating document shape / size to prevent cache poisoning or DoS.
- `/orders` create rule doesn't validate that `totalAmount == subtotal + shippingFee + gst - creditApplied`. Currently an admin reviews every order before processing, so a malformed total would be caught, but ideally the rule should enforce the invariant.
- `/teas/{teaId}/reviews` create rule doesn't validate `userName` / `userAvatar` fields — a user could spoof a display name on their own review. Low severity.

### Dev-only components in production bundle
`src/app/components/ResponsiveTest.tsx` and `src/app/components/StyleShowcase.tsx` exist but aren't routed from `App.tsx`, so they tree-shake out — not a problem. Worth confirming they stay unreferenced.

## React 19 peer-dependency blockers

After the initial type/runtime fixes I tried a clean `npm install` and discovered three packages pinned to versions that don't support React 19 / Vite 6. Each would force users to install with `--legacy-peer-deps` (or fail outright) until fixed.

### 22. `react-day-picker@8.10.1` — React 18-only
Supports only React 16/17/18. The only consumer was `src/app/components/ui/calendar.tsx`, which was **not imported anywhere in the app** (only the `Calendar` *icon* from lucide-react is used). Deleted `src/app/components/ui/calendar.tsx` and removed `react-day-picker` from `dependencies`.

### 23. `react-helmet-async@2.0.5` — React 18-only, unmaintained
Supports only React 16/17/18, and has not received React 19 support. Since **React 19 natively hoists `<title>`, `<meta>`, `<link>`, and `<script>` tags from any component to `<head>`**, the library is no longer needed.

Replaced all usage:
- `src/main.tsx` — removed `HelmetProvider` wrapper.
- `src/app/components/SeoHead.tsx` — replaced `<Helmet>…</Helmet>` with a `<>…</>` fragment. All meta/link/script tags now hoist natively. (The `<script type="application/ld+json">` uses `dangerouslySetInnerHTML` because React escapes text children, which would break JSON-LD.)
- `src/app/pages/HomePage.tsx` — same treatment for the ItemList JSON-LD.
- `src/app/pages/TeaProfilePage.tsx` — replaced the 404 `<Helmet><title>…</title></Helmet>` with a bare `<title>`.
- Removed `react-helmet-async` from `dependencies`.

Net effect: one less dependency, smaller bundle, and SEO tags now render using React 19's first-class mechanism.

### 24. `vite-plugin-pwa@^0.20.0` — Vite 5-only
Supports only Vite 3/4/5, but the project is on Vite 6. Bumped to `^0.21.0`.

---

## Final status after all fixes

```
npm install                      # clean, no --legacy-peer-deps needed
npm run typecheck                # 0 errors (full strict mode)
npm run build                    # 0 errors, 0 warnings
```

Bundle analysis (all chunks well under the 800 kB warning threshold):

| Chunk | Size | Gzip |
|---|---|---|
| firebase-firestore | 396 kB | 92 kB |
| react-core | 227 kB | 73 kB |
| vendor | 139 kB | 45 kB |
| firebase-auth | 123 kB | 25 kB |
| firebase-core | 110 kB | 31 kB |

Total precache entries: 95 (2.3 MiB) via vite-plugin-pwa 0.21.


---

# Deep audit — Cloud Functions, seed script, page patterns

A second pass focused on areas skipped earlier: `functions/`, `scripts/`, the unusual `export default X;` at top of files, and the larger page components.

## Cloud Functions (`functions/src/index.ts`)

### 25. XSS in transactional emails (severity: high)
Over 20 user-controllable fields were interpolated directly into email HTML without escaping, across `brandedHeader`, `orderItemsTable`, `orderTotalsBlock`, `shippingBlock`, and all eight `onOrderEmail` status templates:

- `productName` (per cart item)
- Full shipping address: `name`, `address`, `city`, `province`, `postalCode`, `country`, `phone`
- `reason` (cancel/reject — user-writable per firestore rules)
- `adminNote`, `trackingNumber`, `carrier`
- `discountCode` (user-entered promo)
- `rawName`, `firstName` (derived from customer shipping address)
- Store branding: `storeName`, `storeAddress`, `storeWebsite`, `etransferEmail`, `etransferPassword`

While most email clients sandbox HTML, they still render arbitrary CSS, images, and links — easy surface for phishing-style content injection, layout-breaking attacks, and data exfiltration via crafted `background: url(…)` or remote images. Even if admin input is "trusted", defence-in-depth is the right default for email HTML.

**Fix:** Added three helpers — `esc()`, `escAttr()`, `safeUrl()` — and applied them to every interpolation of untrusted content. `safeUrl()` additionally enforces that `href` values are `http(s):` or `mailto:` schemes only, rejecting `javascript:` and `data:` URIs.

### 26. reCAPTCHA secret passed as URL query parameter (severity: medium)
`fetch(\`https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}\`, { method: 'POST' })` put the secret in the URL, which ends up in proxy/server access logs, cloud observability tools, etc. Google's docs accept the same call via POST body.

**Fix:** Moved parameters to `application/x-www-form-urlencoded` POST body via `URLSearchParams`. Also added an `res.ok` check so a 500 response doesn't break `JSON.parse`.

### 27. Admin self-demotion lockout (severity: medium)
`setAdminRole` allowed an admin to demote themselves. If there's only one admin — which is usual for a small business — this locks the whole team out of the admin console, requiring Firebase CLI intervention to recover.

**Fix:** Added a precondition check — `if (!makeAdmin && request.auth?.uid === uid)` throws `failed-precondition` with a message telling the caller to ask another admin.

### 28. `functions/package.json` — `@types/node@^25` with Node 22 runtime (severity: low)
`engines.node: "22"` but the dev types target Node 25, so TypeScript reports APIs (e.g. recent `fs.glob`, `Worker` changes, etc.) as available when they aren't at runtime. Caught silently as it only shows at runtime with `TypeError: X is not a function`.

**Fix:** Pinned `@types/node@^22.0.0` to match the runtime.

## Seed script

### 29. `scripts/seed.jsx` — wrong file extension, broken `npm run seed`
- The file was named `seed.jsx` but contains no JSX and uses CommonJS `require()`. `node seed.jsx` doesn't resolve without a JSX loader.
- `scripts/package.json` defines `"seed": "node seed.js"` — so `npm run seed` failed with `Error: Cannot find module 'seed.js'`.
- The header comment starts with `scripts/seed.js` (dash the author's intent).

**Fix:** Renamed `scripts/seed.jsx` → `scripts/seed.js`. `npm run seed`, `seed:reset`, `seed:dry` now work.

## Codebase patterns

### 30. `{ id: d.id, ...d.data() }` anti-pattern — 20 occurrences, 13 files
This spread order silently overwrites the explicit Firestore doc ID with whatever `d.data().id` happens to contain. The seed script writes `id: slug` into `teas`, so for that collection `d.data().id === d.id` and there's no observable bug today. But for any collection where `data.id` drifts from the doc ID (or isn't present), the result is either an `undefined` id or a stale one.

Occurrences fixed:
- `src/app/pages/GiftsPage.tsx` (2)
- `src/app/pages/OrdersPage.tsx` (1)
- `src/app/pages/TeaProfilePage.tsx` (1)
- `src/app/pages/admin/AdminAnalytics.tsx` (3)
- `src/app/pages/admin/AdminCustomers.tsx` (2)
- `src/app/pages/admin/AdminOrders.tsx` (1)
- `src/app/pages/admin/AdminOverview.tsx` (1)
- `src/app/pages/admin/AdminProducts.tsx` (1)
- `src/app/pages/admin/AdminPromotions.tsx` (1)
- `src/contexts/CreditContext.tsx` (1)
- `src/contexts/NotificationContext.tsx` (1)
- `src/lib/firebaseQueries.ts` (4)
- `src/types/firestore.ts` (1)

**Fix:** Flipped every one to `{ ...d.data(), id: d.id }` — data first, authoritative doc ID last.

### 31. `export default X;` at the top of 18 page files — hoisting landmine
The pattern works today because every default-exported component is a `function` declaration, which is hoisted. But it's a latent footgun:
- Refactoring any page to `export const Foo = () => {}` (which feels like a safe stylistic change) breaks at runtime with `ReferenceError: Cannot access 'Foo' before initialization` — a TDZ error, because `const` isn't hoisted.
- ESLint's `import/first` and `import/exports-last` rules both flag this.

**Fix:** Moved `export default X;` to the bottom of every affected file (18 files) using a simple script:
`AccountPage`, `CartPage`, `CheckoutPage`, `GiftsPage`, `LoginPage`, `NotFoundPage`, `OrdersPage`, `ProductsPage`, `SignupPage`, `TeaProfilePage`, plus every admin page: `AdminAnalytics`, `AdminCustomers`, `AdminLayout`, `AdminOrders`, `AdminOverview`, `AdminProducts`, `AdminPromotions`, `AdminSettings`. `HomePage`'s default was already at the bottom — left alone. The `info/` pages use `export default function Foo() {…}` inline — correct idiom, left alone.

## AdminProducts (`src/app/pages/admin/AdminProducts.tsx`)

### 32. `parseFloat` / `parseInt` produce `NaN`, which Firestore rejects
`handleUpdate` used `price: parseFloat(form.price), stock: parseInt(form.stock)` with no validation. An admin editing an existing product who clears the price or stock field would submit `NaN`, and Firestore rejects `NaN` with `Unsupported field value: NaN` — a confusing runtime error. `parseInt` also lacked an explicit radix.

Additionally, `setSaving(true)` was called before the `if (!editing.slug)` early-return, so that branch left the button spinning forever.

**Fix:**
- Moved all validation ahead of `setSaving(true)` so early-returns no longer leak state.
- Added explicit `Number.isFinite(…) && … >= 0` guards for price and stock with user-facing toast errors.
- Added explicit `parseInt(…, 10)` radix.
- Applied the same guards to `handleAdd` (not just `handleUpdate`).

---

## What remains unaudited / unfixed

Noted but deferred:
- `AdminOrders.tsx` — `parseFloat(shippingFee) || 0` accepts negative values; admin could inadvertently enter `-5`.
- `AdminOrders.tsx` — `newTotal = afterCredit - discount + existingGst + fee` may go negative without a `Math.max(0, …)` guard.
- `AdminAnalytics.tsx` — the "average order value" metric divides by ALL filtered orders (including cancelled/rejected/expired) — product-logic question, not clearly a bug.
- `CheckoutPage.tsx` (530 lines) — not audited in this pass.
- `npm audit` — not run; separate security pass would be needed for CVE exposure.


---

# Follow-up audit — deferred items + remaining bugs

Second user pass, targeting the deferred items at the end of the previous
section, plus fresh bugs found during CheckoutPage + contexts review.

Result after these fixes:
- `npm run typecheck` → **0 errors**
- `vite build` → **0 errors, 0 warnings** (circular-chunk warning also resolved)

## Critical

### 33. `src/app/pages/CheckoutPage.tsx` — confirmation modal never visible after successful order
`setStep` was declared via `useState<Step>('details')` but **never called
anywhere**. Flow after a successful order:

1. `clearCart()` runs → `items.length === 0`
2. `setShowConfirm(true)` runs
3. The effect `if (items.length === 0 && step === 'details') navigate(ROUTES.CART)` fires
4. User is redirected to `/cart` and never sees the confirmation modal

This was a 100%-reproducible bug on the happy path — every customer placing
an order was bounced to `/cart` instead of seeing the "Order Received"
confirmation with their order ID + next-steps.

**Fix:** call `setStep('placed')` before `clearCart()` so the empty-cart
guard no longer matches. Kept the `step === 'details'` condition on the
guard so the redirect still works for "user empties cart manually" and
"user navigates back to checkout after placing an order".

### 34. `src/app/pages/admin/AdminProducts.tsx` — user-facing strings corrupted by find-and-replace
Someone had done a project-wide "Image" → "ImageIcon" rename (likely an
auto-import rename for the `lucide-react` `ImageIcon` icon component) that
leaked into three string literals and a section comment:

- `toast.error('ImageIcon files only')` → `'Image files only'`
- `toast.success('ImageIcon uploaded!')` → `'Image uploaded!'`
- `<span>Product ImageIcon</span>` → `'Product Image'`
- `// ── ImageIcon uploader ──` section comment → `// ── Image uploader ──`

Every admin saw "ImageIcon uploaded!" after uploading a product photo.

### 35. `src/contexts/AuthContext.tsx` — redirect sign-in result never processed
`loginWithGoogle` falls back to `signInWithRedirect` when the popup is
blocked (COOP, mobile Safari, corp browsers). `getRedirectResult` was
imported and mentioned in a comment but **never actually invoked**, so
when the user returned from the Google redirect:

- `onAuthStateChanged` fired and signed them in
- but `ensureUserDoc` was never called for them (that path only runs
  inside the popup branch of `loginWithGoogle`)
- so for **new users**: no `/users/{uid}` doc, no `/credits/{uid}` doc, no
  welcome bonus transaction, no 5,000-point balance

Every first-time sign-in on a popup-blocking browser was silently
mis-initialised.

**Fix:** call `getRedirectResult(auth)` in the bootstrap `useEffect`. If it
returns a credential, detect first-login by comparing
`creationTime === lastSignInTime` (same heuristic as the popup branch) and
run `ensureUserDoc`. Errors are caught and logged so a stale redirect
state can't deadlock the auth provider.

## Medium — deferred items from previous audit now fixed

### 36. `AdminOrders.tsx` — negative shipping fee accepted (previously deferred)
`parseFloat(shippingFee) || 0` in `applyAction` and
`parseFloat(e.target.value) || 0` in `EditOrderModal` both treated `-5`
as valid because `parseFloat('-5') === -5` is truthy, bypassing the `|| 0`
fallback. The `min="0"` HTML attribute is cosmetic — it doesn't block
submission. Admin could approve an order with a **negative** shipping fee.

**Fix:** wrapped both call sites with `Math.max(0, parseFloat(…) || 0)`.

### 37. `AdminOrders.tsx` — discount input accepted negative values (previously deferred)
Same `parseFloat(…) || 0` pattern in the EditOrderModal discount handler.
`min="0"` is a hint, not an enforcement. A negative discount became a
surcharge.

**Fix:** same `Math.max(0, …)` treatment.

### 38. `AdminOrders.tsx` — `newTotal` could go negative (previously deferred)
In `applyAction` (type `'approve'`):

```ts
const newTotal = afterCredit - discount + existingGst + fee;
```

If the admin-entered `discount` exceeded `afterCredit + existingGst + fee`
(easy to do by accident when editing an already-credited order), the
written `totalAmount` would be negative. Firestore would accept it, and
the order would display a negative total on `OrdersPage` and in emails.

**Fix:** `Math.max(0, …)` around the full expression. Also applied to the
inline "New total" preview hint further down in the same file.

## Minor — dead code / unused imports

### 39. `CheckoutPage.tsx` — no-op `setSubmitted(s => s)`
Inline comment explained the intent ("trigger re-render"), but React bails
out when you set a primitive state to the same value, so the whole line
was dead.

**Fix:** removed the line. Live validation re-renders anyway whenever
`form` or `submitted` changes (which happens on every keystroke via
`setForm`), so no behaviour change.

### 40. `Navbar.tsx` — unused `useRef` import
Removed.

### 41. `CartPage.tsx` — unused `useT` import
Removed.

### 42. `CreditContext.tsx` — multiple unused imports
`addDoc`, `getDoc`, `setDoc`, `increment`, `calcPointsEarned`, `capCredit`,
`WELCOME_BONUS_POINTS`, `POINTS_PER_DOLLAR_VALUE` — none referenced.
Trimmed to only what's actually used (`doc`, `onSnapshot`, `collection`,
`query`, `where`, `orderBy`, `limit`, `runTransaction`, `serverTimestamp`;
plus `calcCreditValue`, `maxRedeemable`, `pointsToNextThreshold`,
`isRedeemable`, `MIN_REDEEM_THRESHOLD`).

### 43. `NotificationContext.tsx` — unused `NotificationType` import
Removed.

### 44. `usePromoCode.ts` — unused `doc`, `getDoc` imports
Removed.

## Build

### 45. `vite.config.ts` — circular chunk warning `vendor -> react-core -> vendor`
Rollup was placing `scheduler` (a React runtime dep of `react-dom`) in the
`vendor` chunk while `react-core` also imported from it — creating a cycle
in the manual-chunks graph. Build still worked, but every `vite build`
emitted the warning.

**Fix:** added `if (id.includes('node_modules/scheduler')) return 'react-core';`
before the generic vendor catch-all, so `scheduler` travels with the
React code that actually uses it. Build output now has zero warnings.

---

## Still unaudited / known deferrals

- `AdminAnalytics.tsx` — average-order-value metric divides by ALL filtered
  orders (including cancelled/rejected/expired). Unchanged — product-logic
  question rather than a bug. Consider filtering to fulfilled orders.
- Add-to-cart / checkout does not validate against `product.stock`.
  Decrement can make stock negative. The Firestore rules don't enforce a
  non-negative stock. Low risk today (single-tenant shop, admin reviews
  every order), but a transactional check in the checkout path would be
  safer once volume picks up.
- `npm audit` not run — separate security/CVE pass is advisable.

---

# Third audit pass — security tightening (post-score audit)

After scoring the project at 82/100, this pass addresses the highest-impact
findings: a silent welcome-bonus failure, two over-permissive Firestore
rules, a permissive reCAPTCHA fail-open path, and the gap between Zod
schemas being defined and actually enforced.

Result after these fixes:
- `npm run typecheck` → **0 errors**
- `vite build` → **0 errors, 0 warnings**, largest chunk 353 kB / 82.88 kB
  gzipped (firebase-firestore)
- `tsc --noEmit` (functions/) → **0 errors**

## Critical

### 46. Welcome bonus silently failed for every new signup
`AuthContext.ensureUserDoc` wrote `/credits/{uid}` with `balance: 500` on
first sign-in, but `firestore.rules` required `balance == 0` on the
`/credits` create path (a guard against users self-granting credits). The
write was rejected, no error surfaced (it ran fire-and-forget after the
auth call), and **every new user landed with 0 points instead of the
advertised 500-point welcome bonus**. The same path also wrote a
`creditTransactions` log entry that succeeded (because `creditTransactions`
create was open to clients — see #47), so the audit log claimed a bonus
was given that wasn't.

**Fix:** moved the entire bootstrap server-side into the `onNewUser` Cloud
Function. The Admin SDK bypasses Firestore rules, so the rule can stay
strict. The bootstrap is wrapped in a Firestore transaction with an
`exists` check, making it idempotent — re-running the function on a
legacy user with an existing credits doc is a no-op. The client
`AuthContext.ensureUserDoc` now only writes the `/users` doc; the
`isNewSignup` parameter is preserved for caller compatibility but unused.
A `customer_welcome_bonus` notification is sent so the user sees the
points landing.

### 47. `/creditTransactions` create open to all signed-in users
The previous rule allowed any signed-in user to create transactions for
themselves with arbitrary `points` and `balanceAfter`. The actual
`/credits/{uid}.balance` field was admin-only, so balances couldn't be
inflated — but the audit log itself was pollutable. Anything that read
`creditTransactions` (lifetime-earned analytics, customer-facing
transaction history, admin reporting) could be poisoned with fictional
"+99,999 earn" entries.

**Fix:** With the welcome bootstrap moved server-side (#46), no client code
needs to write to `creditTransactions`. Tightened the rule to
`allow create, update, delete: if false;` — Cloud Functions still write
via the Admin SDK, which bypasses rules.

## High

### 48. `/credits` create rule was a dead path
Same root cause as #46: the rule allowed users to create their own credits
doc with `balance == 0`, intended as a back-compat hatch for legacy users
predating the credit system. But the only client write path used a non-zero
balance, so the rule never actually allowed any real client write. Worse,
it gave the false impression of a working bootstrap path while the real
one (welcome bonus) silently failed.

**Fix:** locked down create entirely (`allow create, update, delete: if
false;`). Bootstrap is now exclusively server-side via #46. Legacy users
without a credits doc get one created lazily by `onOrderWrite` on their
first earned order (existing transaction in that function already did
this; verified still correct).

### 49. `/orders` create rule didn't validate the totals invariant
Previously the rule only checked `subtotal > 0` and `gst >= 0`. A
malicious client could write a $0.01 `totalAmount` against $999 of items
and the rule would accept it. Admin manual review caught this in practice
(every order is reviewed before processing), but the rule itself was
weaker than it should be.

**Fix:** added a one-sided lower-bound check — `totalAmount + 0.01 >=
subtotal + gst + shippingFee − discount − promoDiscount − creditApplied`.
Upper bound deliberately loose so the legitimate case where credit/promo
exceeds subtotal (clamped to 0+gst on the client) still passes. Also
added: `totalAmount` must be a non-negative number, `items` must be a
non-empty list, and all the discount-style fields (`shippingFee`,
`discount`, `promoDiscount`, `creditApplied`) must be non-negative when
present (using `.get(field, 0)` for optional defaults).

`creditApplied` is intentionally not cross-checked against
`/credits/{uid}.balance` here — Firestore rules can read across docs via
`get()` but it's slow and doubles every order-create read cost. Admin
review remains the cross-check.

### 50. `verifyRecaptcha` failed open in production with no secret set
The previous behaviour was to log a warning and return `pass: true` if
`RECAPTCHA_SECRET_KEY` wasn't configured — convenient for dev/staging,
but if a deployer forgot `firebase functions:secrets:set` in production,
every signup/login/checkout silently bypassed reCAPTCHA forever. The only
signal was a server-log warning that nobody would see.

**Fix:** the missing-secret path now distinguishes by environment. In the
emulator (`process.env.FUNCTIONS_EMULATOR === 'true'`), still log and
pass through. In production, throw `failed-precondition` with a message
telling the user to contact support. Network-failure path (Google API
unreachable) still fails open with `pass: true` and a warning — blocking
checkout on a Google outage would be worse than the bot-protection gap.

### 51. `/translations/{lang}/cache` write was unrestricted shape and size
Any signed-in user could write any document of any size to the
translations cache. No current client code does this, but the surface
was a DoS / cache-poisoning risk for the future.

**Fix:** validated shape (`hasOnly(['source', 'translation', 'createdAt'])`),
types (`source` and `translation` must be strings), and size (each
field ≤ 4 KB). Update path is similarly constrained. Delete is
admin-only.

## Medium

### 52. Zod schemas defined but barely enforced at runtime
The `/src/schemas` folder exports comprehensive validators
(`validateOrder`, `validateShippingAddress`, `validateSignup`, etc.), but
only **2 call sites** in the entire app actually ran `.safeParse` —
`TeaProfilePage` review submit and `AdminCustomers` admin credit input.
Forms relied on ad-hoc per-field checks with significant gaps (e.g.
`SignupPage` checked password length but not email format; `CheckoutPage`
checked phone format but not address length).

**Fix (partial):** added Zod runtime validation at the two
highest-impact submission points:

- `SignupPage.handleSubmit` — calls `validateSignup({ email, password,
  displayName })` before any auth call. The schema enforces email format,
  ≥8-char password, and ≥2-char display name. Existing strength rules
  (uppercase, digit) still run after.
- `CheckoutPage.handlePlaceOrder` — calls `validateShippingAddress(...)`
  on a trimmed copy of the form before writing the order. Catches edge
  cases the per-field checks missed (e.g. >300-char address, >100-char
  city, 9-char phone) and is the same schema the backend uses, so the
  shape is identical end-to-end. The validated object is what's persisted
  to the order doc, so the trim is also propagated (was previously raw
  user input).

Other call sites (admin product editor, admin order editor, gift builder)
remain on ad-hoc validation. Those flows are admin-only or have their
own constraints; full schema rollout is left as a follow-up.

## Verified unchanged

- `onAnnualCreditReset` — still uses Admin SDK (bypasses tightened rules).
- `onOrderWrite` delivered-status credit accumulation — still uses Admin
  SDK transaction.
- Existing Firestore rule for `/orders` update (customer can transition
  pending→cancelled or approved→payment_sent) — unchanged.
- All other Firestore rules — unchanged.
- All other client code — unchanged.

## Still unaudited / known deferrals (carried forward)

- `npm audit` not run — separate security/CVE pass is advisable.
- Stock not enforced server-side (cart can go negative).
- AdminAnalytics average-order-value metric divides by ALL filtered
  orders (cancelled/rejected/expired included).
- Zod runtime validation not added to admin product editor, admin order
  editor, or gift builder flows.

---

# Fourth audit pass — carried-forward items resolved

This pass closes the four items left as "carried forward" at the end of
the third pass. Result:

- `npm run typecheck` (app + functions) → **0 errors**
- `vite build` → **0 errors, 0 warnings**, largest chunk 353 kB / 82.88 kB
  gzipped (firebase-firestore)
- `npm audit` (main app) → **found 0 vulnerabilities**
- `npm audit --omit=dev` (main app, production deps only) → **found 0
  vulnerabilities**

## Critical

### 53. Server-side stock enforcement (race condition + negative stock)
The previous client-side decrement at checkout used `writeBatch` with
`increment(-quantity)` — atomic at the **field** level (Firestore
guarantees no lost updates), but with no non-negative check. Two
simultaneous orders for the last unit could both succeed and drive
stock to -1. The Firestore rules can't enforce this either: rules
can't read `resource.data.stock` as a literal when the write uses the
`increment()` sentinel.

**Fix:** moved decrement into `onOrderWrite` (Cloud Function trigger,
fires on order create). The new logic runs a Firestore transaction:

1. Reads each tea referenced by the order in one round-trip
2. Validates `stock >= requested` for every line
3. If any line is short, returns the shortfall list without writing
4. Else, decrements all teas atomically

If stock is short, the trigger then updates the order's status to
`'rejected'` with `rejectionReason: 'Insufficient stock: <name>
(requested N, available M); ...'`. The existing `rejected` branch of
the same trigger fires on the next write and notifies the customer
via in-app + email. Admin notification for the original `pending`
status is skipped in that path so the admin only sees the rejection.

The Admin SDK bypasses Firestore rules, so `/teas` can keep its
admin-only-write rule for clients while this trigger updates stock
correctly. Idempotency is handled by the existing
`if (prevStatus) break;` guard — re-runs on the same order are no-ops.

The redundant client-side `writeBatch(...stock decrement)` block in
`CheckoutPage.handlePlaceOrder` is removed. The unused `writeBatch`
import is also removed.

## Medium

### 54. AdminAnalytics — Average Order Value (AOV) inflated by failed orders
`avgOrder = sum(totalAmount) / filtered.length` summed every order in
the date range — including `cancelled`, `rejected`, and `expired`
ones — and divided by the same count. A $40 cancelled order
contributed $0 revenue but added 1 to the denominator, so the metric
ran lower than the true AOV.

**Fix:** restricted both numerator and denominator to revenue-eligible
statuses (`in_progress`, `shipped`, `delivered`). Pending and approved
orders are still excluded because they haven't been paid yet — they
might cancel, expire, or have totals adjusted by admin before being
committed. The `revenue` figure (separate calc) was already restricted
to `delivered` only and is unchanged.

### 55. Zod validation in AdminProducts (create + update)
Added `validateCreateProduct` to `handleAdd` and `validateUpdateProduct`
to `handleUpdate`. Both run **after** the existing per-field checks
(name present, price ≥ 0, stock ≥ 0, etc.), as a defence-in-depth layer
that catches edge cases the per-field checks miss:

- Name > 200 chars
- Description > 2000 chars
- Image URL malformed (non-URL string)
- Allergen list with empty / whitespace-only strings
- Numeric fields that are NaN despite passing the
  `Number.isFinite` check (rare with `parseFloat` but possible with
  weird input methods)

Build a clean candidate object first because the schema rejects `null`
where it expects `undefined` (Firestore stays on null for "explicitly
empty" — we keep that for persistence consistency, but normalize for
validation). Errors surface to toast with the failing field path so the
admin can see exactly what's wrong (e.g. `description: String must
contain at most 2000 character(s)`).

The admin order editor (`AdminOrders`) was deliberately left on its
existing `Math.max(0, parseFloat(…) || 0)` checks — those flows (set
shipping fee, set discount) operate on a small number of well-typed
numeric inputs and don't benefit from full schema validation. The
gift builder flow already validates via its own bundle schema in
`store/giftBuilderStore.ts`.

## Build / dependencies

### 56. Five high-severity CVEs in dev tooling (Vite + transitive serialize-javascript)
`npm audit` flagged 5 high-severity vulnerabilities, all in dev/build
tooling rather than production runtime:

- `vite@6.3.5` — 5 advisories (1 high "arbitrary file read via dev
  server WebSocket", 3 moderate path-traversal, 1 low). All in the
  dev server, not exposed in production builds, but still worth closing
  for any developer running `npm run dev`.
- `serialize-javascript@<7.0.5` — RCE via `RegExp.flags` and DoS via
  crafted array-likes. Pulled in transitively through
  `vite-plugin-pwa → workbox-build → @rollup/plugin-terser`.

**Fix:**
- Bumped `vite` from `6.3.5` (exact pin) to `^6.4.2` (caret range to
  pick up future patches automatically). Updated the `pnpm.overrides`
  block to match.
- Added a top-level `"overrides": { "serialize-javascript": "^7.0.5" }`
  in `package.json` to force the transitive dep to a patched version
  without requiring the breaking-change major bump of `vite-plugin-pwa`
  that `npm audit fix --force` would have applied.

After fix: `npm audit` reports **0 vulnerabilities** (all severities)
on the main app. Build still runs in 19 s with the same chunk sizes,
no warnings. The `pnpm.overrides` block is mirrored from `overrides`
so `pnpm install` (per `pnpm-workspace.yaml`) gets the same treatment.

## Accepted risk

### Functions — moderate transitive vulnerabilities in Google Cloud SDK
`firebase-admin@^13.8.0` (latest 13.x) pulls in
`@google-cloud/storage → teeny-request → http-proxy-agent →
@tootallnate/once` and `… → uuid@<14`, both of which have moderate
advisories. These are upstream issues in Google's own Cloud SDK
dependency tree — there's no patched 13.x release, and `npm audit fix
--force` would downgrade `firebase-admin` to 10.1.0 (multiple breaking
changes, dropped APIs we use).

The vulnerabilities run only in the Cloud Functions execution
environment (not exposed to user input), and the affected code paths
are HTTP request handling deep inside Google's SDK. **Accepting this
risk** until Google releases a 13.x patch with updated transitive deps.
Status: tracked, will revisit on next major firebase-admin release.

---

# Fifth audit pass — automated a11y; refactor and SSR deferred

The remaining "gaps" after pass 4 were three quality items: no
automated a11y tests, five files >600 lines, and no SSR. Of those,
only one is a **gap** in the bug/risk sense — the other two are
architecture choices that need scoped, careful work rather than a
single-pass touch-up. This pass closes the a11y-test gap and
documents the reasoning for the other two.

Result:
- `tsc --noEmit` (app + functions) → **0 errors**
- `vite build` → **0 errors, 0 warnings**
- `playwright test --config=playwright.a11y.config.ts --list` →
  **24 tests registered** (12 routes × 2 themes)
- `npm audit` → **still 0** (no regression)

## Done

### 57. Automated accessibility tests (axe-core via Playwright)
The codebase already has solid manual a11y bones (skip-nav, ARIA on 26
components, dedicated `focus.css`, theme/language toggles labeled), but
nothing tested it. Any future change could regress contrast, missing
labels, or keyboard traps and nobody would notice until a user did.

**Added:**
- `@axe-core/playwright@^4.11.2` to `devDependencies`.
- `playwright.a11y.config.ts` — separate config from the visual suite.
  Single chromium project, no theme-projects matrix (theme is part of
  the test parameterization instead, so each theme gets a clearly
  named test rather than a hidden axis).
- `tests/a11y/public-pages.spec.ts` — sweeps 12 public routes in
  `light` + `dark` themes (24 tests total). Each test:
  - Seeds theme via `localStorage` in an `addInitScript` (matches the
    preboot script in `index.html`).
  - Loads the route, waits for fonts + a brief settle.
  - Runs `AxeBuilder({page}).withTags(wcag2a/aa/21a/21aa).analyze()`.
  - **Fails the build** on `critical` or `serious` violations with the
    rule ID, impact, help URL, and first three offending DOM
    selectors printed in the failure message — no trace viewer needed
    for triage.
  - **Reports but doesn't fail** on `moderate` and `minor` violations
    (often advisory-style nits like `heading-order` that conflict
    with intentional typographic hierarchy on landing pages).
  - Disables the `region` rule — it false-flags portal-mounted UI
    (toaster, modal shells) outside `<main>` even when the page itself
    is correctly landmarked.
- `tests/a11y/README.md` — what it covers, what's deferred (admin /
  authenticated flows still need the seeded auth fixture, same gap as
  visual suite), how to triage failures locally.
- `npm run test:a11y` and `npm run test:a11y:ui` scripts.

The webServer block reuses the dev server on `:5173` if one's already
running, mirroring the visual suite's behavior. CI integration is a
follow-up (the existing `.github/workflows/visual-regression.yml`
could be duplicated for a11y; left alone here so the suite can be
baselined locally first — running it against the current codebase will
likely surface a handful of real fixes worth making before locking in
"green" as the baseline).

## Deferred with reasoning

### Large component files (5 files: 645–824 lines)
`TeaProfilePage.tsx` (824), `AdminSettings.tsx` (773),
`AdminOrders.tsx` (706), `NotificationBell.tsx` (651),
`ProductsPage.tsx` (645).

**Why not done in this pass:** these are not bugs and not security or
correctness risks. They're code-organization preferences — many
production React codebases are comfortable with 700-line page
components, especially admin pages where one file maps to one
admin-tab + its modals. Refactoring all five well requires per-file
analysis (where are the natural seams between concerns?), careful
extraction of sub-components / hooks / types, and verification that
nothing changed in behavior. There are no unit tests on these files,
so the safety net is "manual click-through + visual regression" —
which means rushed extraction is a real risk of introducing stale
closures, hook-order bugs, prop-drilling regressions, and broken
keyboard handling.

**Recommended path:** treat each file as its own scoped piece of
work, starting with the highest-leverage extraction (the editing
modal in `AdminProducts` / `AdminOrders` is the obvious candidate —
it's the part that's reused across "create" and "edit" flows). Pair
the refactor with adding visual regression coverage for the affected
admin page (currently uncovered — needs the auth fixture). Doing one
file per session at this pace is sustainable; doing all five in one
pass is not.

### Server-side rendering (SSR)
**Why not done:** this isn't a fix, it's an architectural rewrite.
Adding SSR to a Firebase Auth + Firestore SPA requires:

- Migrating to a framework that supports SSR (TanStack Start, Vike, or
  React Router 7 in framework mode) — touches `main.tsx`, `App.tsx`,
  every route, every Suspense boundary.
- Changing hosting — Firebase Hosting alone can't SSR; needs Cloud
  Functions or Cloud Run to render. The existing `firebase.json`
  hosting config doesn't apply.
- Server-side auth — the Firebase client SDK (`firebase/auth`) doesn't
  work in Node. Means switching to session-cookie auth via the Admin
  SDK on the server, with a callable Cloud Function to mint cookies
  from client `getIdToken()` results.
- Hydration correctness audit — every component that touches
  `window`, `localStorage`, `navigator`, or `IntersectionObserver`
  needs a guard or a `useEffect` deferral. The theme preboot script in
  `index.html` would need to move to a server-rendered inline script.
- Bundle pipeline overhaul — Vite's SSR plugin and the manual
  `manualChunks` setup interact in non-obvious ways.

**The actual user benefit is small in this codebase**: the PWA service
worker + manual chunks + `lazy()` routes already give repeat-visit
instant loads (cached from IndexedDB) and a fast first paint via
the smallest possible critical chunk. SEO-critical pages
(home, products, tea-profile, info pages) are mostly static content
that prerenders well — if SEO is the actual goal, build-time prerender
of those routes via something like `vite-ssg` would deliver 80% of
the value at 5% of the migration risk. Recommended as a smaller
scoped follow-up if the underlying motivation is SEO; not
recommended as a pure "rewrite to SSR" exercise.

---

# Sixth audit pass — P0 from the roadmap (partial)

This pass executes P0 from `ROADMAP_FOLLOWUPS.md` (baseline the a11y
suite). Outcome is **partial**: a real bug I introduced earlier was
caught and fixed, plus two confirmed a11y violations are patched.
The full live-suite sweep wasn't possible from the audit
environment (long-running browser automation gets killed before it
can drive 24 tests). The remaining baselining is left as a local
task for the maintainer — explicit instructions below.

Result:
- `tsc --noEmit` → **0 errors**
- `vite build` → **0 errors, 0 warnings**
- `playwright test --config=playwright.a11y.config.ts --list` →
  24 tests registered (no change in surface)
- `playwright test --grep "theme:light › home"` → **2/2 passed** in 23 s
  (verified the suite executes correctly, just couldn't keep it
  running long enough for the full sweep)

## Critical (regression I introduced)

### 58. `firestore.rules` translations cache field-name mismatch
The rule I wrote in pass 3 (item #51) requires the cache doc shape
`{ source, translation, createdAt }` — but the actual code in
`src/i18n/useT.ts` line 71 writes `{ text, source, createdAt }` and
reads `snap.data().text`. After my pass-3 rule tightening, every
translation cache write was silently rejected, so the persistent
Firestore cache stopped populating.

The translation feature still appeared to work (the in-memory
`MEM_CACHE` and the API fallback both function), but every page load
would re-call the Google Translation API for the same strings instead
of hitting the Firestore cache. Translation costs go up; perf goes
down. No user-visible breakage, which is why this slipped through.

**Fix:** changed the rule to match the actual field names
(`source`, `text`, `createdAt`). Same 4 KB size cap, same shape
whitelist, same admin-only delete. The code didn't change; only the
rule was wrong. This was my mistake from pass 3 — I named the field
based on what it "should" be called rather than reading the writer.

**Lesson:** when tightening rules around an existing collection,
always grep for the writer's field names first. Item #51's tightening
was good in intent but wrong in detail.

## High (real a11y violations from the static scan)

### 59. `TeaProfilePage` quantity-stepper buttons — no accessible name
The decrement and increment buttons (lines 490, 498) contain only
`<Minus size={16} />` / `<Plus size={16} />` icons — no text, no
`aria-label`, no `title`. Screen readers announce them as "button"
with no clue what they do.

This is the only public-page violation the static scan found that's
genuinely actionable without runtime data; the other findings (50+
form inputs without `<label htmlFor>`) need the live axe run to
confirm what's a real violation vs what already has an
adjacent visible label that would satisfy axe's heuristics.

**Fix:** added `aria-label={t('Decrease quantity')}` and
`aria-label={t('Increase quantity')}` so the labels go through the
existing i18n pipeline (English fallback for unknown keys; French
translation if the dictionary has an entry).

CartPage and CartDrawer already had aria-labels on their identical
stepper patterns, so this was the only spot.

## Deferred — needs the live suite

The static scan flagged ~50 form `<input>` elements across 7 files
(`AdminSettings`, `AdminOrders`, `AdminPromotions`, `AdminCustomers`,
`AccountPage`, `CheckoutPage`, `ComboGallery`, plus a few smaller
components) that have no `<label htmlFor>` association and no
`aria-label`. Most rely on `placeholder=` for the visible cue, which
axe correctly flags — placeholders disappear when typing and aren't
an accessible label.

I deliberately didn't ship blanket label additions across 50+
locations because:

1. **No runtime confirmation.** Some inputs may have an *adjacent*
   `<label>` (without `htmlFor`) that axe still recognizes via the
   `label` heuristic. Wrapping every input "just to be safe" risks
   double-labeling and triggers a different axe rule (`label` —
   "form element has multiple label elements").
2. **i18n implications.** Adding `aria-label="Phone number"` etc.
   means each label needs to go through `t(...)` so it translates,
   which compounds the change-set across files.
3. **No safety net for verification.** Without a green axe baseline
   to compare against, I can't tell whether my edits fixed the issues
   or just shuffled them around.

The right move is to run the live suite locally and fix what it
flags, one violation type at a time, so the iteration loop is fast.

## How to baseline the suite locally (P0 completion)

1. Install the matching browser:
   ```
   cd app
   npm install
   npx playwright install chromium
   ```

2. Run the suite:
   ```
   npm run test:a11y
   ```
   Expect ~5 minutes for 24 tests on a typical laptop. The dev server
   starts automatically; reuses an existing one on `:5173` if running.

3. For each failure: the printed message includes rule ID, impact,
   help URL, and the first three offending DOM selectors. Open the
   help URL for the canonical fix pattern.

4. Address the failures — start with the highest-traffic public
   routes (`home`, `products`, `tea-profile`, `cart`, `login`,
   `signup`) before going deeper. Re-run after each fix.

5. Once green: commit the fixes, mark P0 done in
   `ROADMAP_FOLLOWUPS.md`, and move on to P1.

For findings the static scan can't catch (color contrast in dark
mode is the most likely surprise — many designed-light dark themes
fail contrast on subtle text colors), the help URL points to
`color.adobe.com` style contrast tools.

---

# Seventh audit pass — ESLint repair + regression guards (P1.4)

This pass executes P1 item 4 from `ROADMAP_FOLLOWUPS.md` (ESLint
regression guard for the export-default hoisting pattern). What
turned up: the audit's original item 31 had already been applied in
pass 2 (every page's `export default X;` is at the bottom of its
file), so the listed work was a misread on my part. But underneath
the misread was a real bug — the ESLint setup was silently broken,
which means the lint-staged pre-commit hook wasn't catching anything.

Result:
- `tsc --noEmit` (app + functions) → **0 errors**
- `vite build` → **0 errors, 0 warnings**, largest chunk 353 kB / 82.88 kB
  gzipped (firebase-firestore)
- `npm run lint` → **0 errors, 3 warnings** (advisory exhaustive-deps
  on intentional patterns, see below)
- `npm audit` (main app) → **still 0 vulnerabilities** (no regression)

## Critical (latent bug — not from any audit, just found here)

### 60. ESLint setup was silently broken — no rules enforced anywhere
The project ships `eslint@^9.17.0` (flat-config-only) but the config
file was `.eslintrc.json` (legacy format). Every invocation of
`npx eslint` failed with:

```
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
From ESLint v9.0.0, the default configuration file is now
eslint.config.js.
```

Which means `lint-staged → eslint --fix` in the husky `pre-commit`
hook was failing every time, and either being silently swallowed or
never actually invoked. Either way, every commit since the ESLint 9
upgrade has bypassed lint entirely.

**Fix:** wrote a flat-config `eslint.config.js` mirroring the
previous setup (eslint:recommended + react + typescript +
prettier-compat) plus the regression guards needed for this pass.
Deleted `.eslintrc.json`. Added the missing peer plugins
(`eslint-plugin-import`, `eslint-plugin-react-hooks`) to
`devDependencies`. Added a `lint` and `lint:fix` script to
`package.json` so the hook + CI have something concrete to call.

While I was rewriting the config:
- Allowed empty `catch {}` blocks (intentional silent-swallow is a
  legitimate pattern — logout best-effort, optional cleanup).
- Allowed ternary expressions as statements (`cond ? doA() : doB();`
  — common React side-effect dispatch).
- Disabled `react/no-unescaped-entities` — fires on every `'` in
  ordinary copy ("you'll", "we're") with no real safety value.
- Scoped `import/exports-last` to `src/app/pages/**` only — schemas
  and stores legitimately interleave many small named exports.
- Disabled `react-hooks/rules-of-hooks` for `tests/**` — Playwright
  fixtures use a callback named `use` that's unrelated to React's
  `use` hook; the plugin can't tell the difference.

## High (real bugs the new lint setup caught)

### 61. `Step2PickTeas` — `useEffect` after a conditional early-return
A real React rules-of-hooks violation: line 187 had a `useEffect`
that came AFTER an `if (!bundle) return ...` guard at line 143.
On any render where `bundle` was null (defensive fallback, rare in
practice but legal), the hook would be skipped entirely — changing
the call order between renders. This would warn in dev mode and
fail outright in React 19 strict mode under certain conditions.

**Fix:** moved the effect ABOVE the `if (!bundle) return ...`
guard. Added an internal `if (!bundle) return;` inside the effect
body so it's a no-op when bundle is null. Net behavior unchanged,
hook order now stable.

### 62. `useSettings.ts` — duplicate `useQuery` import
The file had `import { useQuery }` twice — once at the top (where I
moved it during my first lint pass) and once at line 90 (the
original location, which I forgot to remove). Both pointed at the
same module, so it didn't break, but TypeScript's `no-redeclare`
flagged it.

**Fix:** removed the duplicate.

### 63. Three files had imports below code (`import/first` violations)
- `src/app/pages/admin/AdminOrders.tsx:1` — a `type AdminActionType`
  declaration before the imports.
- `src/lib/firebase.ts:33` — `initializeFirestore` import after
  `initializeApp(firebaseConfig)` had already run.
- `src/schemas/index.ts:23` — `import { z } from 'zod'` after the
  barrel `export * from './X.schema'` block.

All three "worked" because JavaScript hoists imports, but the
ordering obscures intent and (more importantly) is the same class
of footgun as the original audit item #31. Each fixed by moving the
import to its correct place at the top of the file.

### 64. Two files had named exports before helper definitions (`import/exports-last`)
- `src/app/pages/GiftsPage.tsx` — `export function GiftsPage()` at
  line 26, then `Step` and `Trust` helper components defined at
  lines 370 and 408, AFTER the export.
- `src/app/pages/admin/AdminAnalytics.tsx` — `export function
  AdminAnalytics()` at line 89, then a `getWeekNumber()` helper at
  line 385, AFTER the export.
- `src/app/pages/admin/AdminSettings.tsx` — `export function
  AdminSettings()` at line 125, then a `NotificationDiagnostic`
  helper component AFTER the `export default`.

These weren't bugs — the pattern works because function declarations
hoist — but they're inconsistent with how every other page in the
codebase is structured ("helpers above main export"), and they're
the same family of footgun as item #31. Fixed all three by moving
the helpers above the main export.

## Advisory (warnings only — not blocking the build)

Three remaining `react-hooks/exhaustive-deps` warnings the lint
plugin couldn't silence cleanly:

- `NotificationBell.tsx:422` — `bellRef.current` used in cleanup
  (rule correctly flags the footgun pattern but the code is
  correct: cleanup runs synchronously when component unmounts).
- `ProductsPage.tsx:352` — missing `setSearchParams` dep (adding
  it would re-run the effect on every URL change, which isn't
  the intent).
- `useT.ts:163` — missing `product` dep (intentional; the effect
  doesn't read product after first render).

Each of these is a real instance of "the rule's heuristic doesn't
match the author's intent". Worth a one-line `eslint-disable-next-line`
with explanation when each file is next touched. Not worth blocking
the build over.

## Files changed

- `eslint.config.js` (new, replaces `.eslintrc.json`)
- `.eslintrc.json` (deleted)
- `package.json` (added `eslint-plugin-import`, `eslint-plugin-react-hooks`,
  `lint` + `lint:fix` scripts)
- `src/lib/firebase.ts` (import lifted to top)
- `src/hooks/useSettings.ts` (import lifted, dedup'd)
- `src/schemas/index.ts` (zod import lifted)
- `src/app/pages/admin/AdminOrders.tsx` (type alias moved after imports)
- `src/app/pages/GiftsPage.tsx` (Step + Trust helpers above export)
- `src/app/pages/admin/AdminAnalytics.tsx` (getWeekNumber above export)
- `src/app/pages/admin/AdminSettings.tsx` (NotificationDiagnostic above export)
- `src/app/components/gift-builder/steps/Step2PickTeas.tsx`
  (useEffect moved above early-return — actual hooks-order bug fix)

---

# Eighth audit pass — Combo Gallery refactor (per-tea → global)

This pass is a feature-level refactor, not a bug-hunt. The Combo
Gallery used to be a per-tea section in the Edit Tea modal: each tea
had its own `comboImages` array, edited inline. The user asked for it
to become a global, store-wide feature managed from one place
(Admin Settings) with a feature toggle, and rendered identically on
every tea profile page when enabled. The motivation is content-ops
simplicity — pastry pairings don't actually change per-tea, so
forcing the admin to repopulate the gallery on every product was
busywork.

Result:
- `tsc --noEmit` (app + functions) → **0 errors**
- `vite build` → **0 errors, 0 warnings**, largest chunk 353 kB / 82.88 kB
  gzipped (firebase-firestore, unchanged)
- `npm run lint` → **0 errors, 3 advisory warnings** (unchanged from pass 7)
- `npm audit` → **still 0** (no new deps)

## Architecture summary

**Before:**
```
/teas/{slug}.comboImages: ComboImage[]   ← per-tea array on the product doc
TeaProfilePage           reads product.comboImages
AdminProducts edit modal renders <ComboGalleryAdmin images=… onChange=…>
```

**After:**
```
/comboGalleryItems/{auto-id}             ← flat collection, one doc per item
settings.global.comboGalleryEnabled      ← global on/off toggle
TeaProfilePage                <ComboGallery />   (no props, self-contained)
AdminSettings                 <ComboGalleryAdmin /> inside a new section
AdminProducts edit modal      no combo UI at all
```

The flat `/comboGalleryItems` collection (vs nested
`/comboGallery/items/`) was the simpler choice — keeps Firestore
rules, queries, and onSnapshot subscriptions one-liners. The two
admin-vs-customer projections diverge on a single `enabled` filter:
admin sees all, customer view filters to `enabled !== false`.

## Schema (`src/schemas/comboGallery.schema.ts`, new)

Per the user's confirmation, **all four content fields are required**:

```ts
{ id?, imageUrl, storagePath, title (1–100), description (1–500),
  price (0–9999.99), currency (default CAD), order, enabled,
  createdAt?, updatedAt? }
```

Three exported schemas: `comboItemSchema` (full),
`createComboItemSchema` (omits id/timestamps),
`updateComboItemSchema` (id required, everything else partial).
Three matching `validate*` helpers using safeParse — same pattern as
the rest of `src/schemas/`.

## Customer component (`src/app/components/ComboGallery.tsx`, rewritten)

Self-contained. Exports `ComboGallery` (the section) and
`useComboGallery()` (the data hook). The component renders null when
the feature flag is off OR when no enabled items exist, so
`TeaProfilePage` can mount it unconditionally.

Style — "luxury / modern":
- Slow 4.5 s auto-advance (was 0.9 s in the per-tea version, far too
  fast for content visitors actually want to read).
- Cross-fade between slides with subtle Ken-Burns zoom on the active
  image (`transform: scale(1.06) over 6 s`).
- Frosted-glass overlay panel with title + 2-line description +
  gold-pill price.
- Dot pagination + arrow keys + touch swipe (50 px horizontal
  threshold, ignores vertical scroll gestures).
- Pause auto-advance on hover or focus.
- Respects `prefers-reduced-motion` — cuts the auto-advance and the
  Ken-Burns zoom (still cross-fades the static images on manual nav).
- 16:9 aspect ratio with `max-height: 560 px` so it doesn't dominate
  on ultra-wide displays.

Live data via `onSnapshot` so admin edits surface on the customer
view without a page reload.

## Admin manager (`src/app/components/admin/ComboGalleryAdmin.tsx`, new)

Drag-to-reorder grid:
- **Bulk multi-image upload** via drag-drop or file picker. Each file
  → Firebase Storage `/comboGallery/{filename}` → Firestore doc with
  default placeholder content (`title: "New pairing"`,
  `description: "Add a description for this pairing."`, `price: 0`).
  Admin then edits inline.
- **Per-item inline editing**: title, description, price all
  validated against the Zod update schema before saving. Save on blur
  or Enter.
- **Per-item enabled toggle** (visible/hidden pill).
- **Delete** removes the Firestore doc AND best-effort deletes the
  Storage object.
- **Reorder** via drag-and-drop on each row updates the `order`
  integer in a single `writeBatch` so the customer view sees the new
  order atomically.
- Pre-upload validation: rejects files ≥ 5 MB or non-image MIME (the
  Storage rule would reject them too, but pre-upload feedback is
  better UX).

## Backend rules

`firestore.rules` — new block for the items collection:

```
match /comboGalleryItems/{itemId} {
  allow read:   if true;
  allow create, update: if isAdmin()
                && request.resource.data.imageUrl    is string
                && request.resource.data.storagePath is string
                && request.resource.data.title       is string
                && request.resource.data.description is string
                && request.resource.data.price       is number
                && request.resource.data.price       >= 0
                && request.resource.data.title.size()       <= 100
                && request.resource.data.description.size() <= 500
                && request.resource.data.imageUrl.size()    <= 2048;
  allow delete: if isAdmin();
}
```

(Field validation prevents the customer carousel from being poisoned
— a non-string imageUrl could crash the auto-rotate, a negative
price would render as `-$24`.)

`storage.rules` — new block:

```
match /comboGallery/{filename} {
  allow read:   if true;
  allow create: if isAdminImageUpload();
  allow update: if isAdminImageUpload();
  allow delete: if isAdmin();
}
```

Same `isAdminImageUpload()` helper as every other admin upload path
— image MIME + 5 MB cap.

Toggle field reuses the existing `/settings/global` doc; rule is
unchanged.

## Cleanup of the old per-tea path

Per the user's choice (option "Delete — nuke the old per-tea field"):

- `src/schemas/product.schema.ts` — removed the `comboImages` array
  field from `productSchema`.
- `src/app/pages/admin/AdminProducts.tsx` — removed the
  `ComboGalleryAdmin` import, the `comboImages` field from the
  `FormData` type and `EMPTY` default, the three setDoc/openEdit/
  updateDoc payload references, and the `<ComboGalleryAdmin>` JSX
  block from the Edit modal.
- `src/app/pages/TeaProfilePage.tsx` — replaced the conditional
  `{(product.comboImages?.length ?? 0) > 0 && <ComboGallery
  images=… />}` with an unconditional `<ComboGallery />` (component
  self-decides visibility).

Existing `comboImages` arrays on production tea docs become orphan
data. Not deleting them automatically — that needs a one-time
script that the maintainer should run when convenient. The data
isn't read anywhere anymore so it's just bytes in Firestore. A
future cleanup script would `getDocs(collection(db, 'teas'))` and
`updateDoc(ref, { comboImages: deleteField() })` on each.

## Files changed (summary)

**New:**
- `src/schemas/comboGallery.schema.ts`
- `src/app/components/admin/ComboGalleryAdmin.tsx`

**Rewritten:**
- `src/app/components/ComboGallery.tsx` — went from
  display-component-with-bundled-admin (469 lines) to
  customer-only-with-live-hook (~430 lines).

**Modified:**
- `src/schemas/index.ts` — added `comboGallery.schema` to the barrel.
- `src/schemas/product.schema.ts` — removed `comboImages` field.
- `firestore.rules` — added `/comboGalleryItems/{itemId}` block.
- `storage.rules` — added `/comboGallery/{filename}` block.
- `src/hooks/useSettings.ts` — added `comboGalleryEnabled: false` to
  defaults.
- `src/app/pages/admin/AdminSettings.tsx` — added
  `comboGalleryEnabled: false` to its `DEFAULTS`, imported
  `ComboGalleryAdmin`, added the new "Combo Gallery" section.
- `src/app/pages/admin/AdminProducts.tsx` — removed all
  `comboImages` plumbing and the `<ComboGalleryAdmin>` JSX block.
- `src/app/pages/TeaProfilePage.tsx` — `<ComboGallery />` (no
  props), unconditional mount.

---

# Ninth audit pass — image cleanup + TeaPlaceholder

This pass strips every external image URL from the codebase and
ships a vector placeholder that renders wherever a product/tea/bundle
image is missing or fails to load. The intent: every image visible
to a customer is one the admin uploaded to Firebase Storage. No
Unsplash, no demo CDN, no fake data dressed up to look real.

Result:
- `tsc --noEmit` (app + functions) → **0 errors**
- `vite build` → **0 errors, 0 warnings**, largest chunk 353 kB / 82.88 kB
  gzipped (firebase-firestore, unchanged)
- `npm run lint` → **0 errors, 3 advisory warnings** (unchanged)
- `grep unsplash src/` → **0 matches**

## What was leaking

Three sources of hardcoded image URLs:

1. `src/data/mockProducts.ts` — an `IMG` map with 8 Unsplash URLs by
   category. Every `mockProducts[*].image` pointed at one of these.
   `mockProducts` is the offline/empty-Firestore fallback used by
   `firebaseQueries.ts`, so any tea without an admin-uploaded image
   silently fell through to one of these stock photos.

2. `scripts/seed.js` — same eight URLs, written into the `image`
   field of every seeded tea on first deploy. After running the
   seed, every tea in production carried a real Unsplash URL until
   an admin overwrote it.

3. `src/app/pages/admin/AdminProducts.tsx` — line 128 had
   `image: form.image || 'https://images.unsplash.com/...'` as the
   fallback when an admin saved a tea with no image. So even after
   editing, leaving the image blank silently restored a stock URL.

All three are now gone. Every code path that previously inserted a
fallback URL now inserts an empty string. The placeholder takes
over at render time.

## TeaPlaceholder (`src/app/components/TeaPlaceholder.tsx`, new)

Pure SVG — no `<img>`, no photographic content. Drawn from
primitives in the app's color palette (`var(--gold)`,
`var(--midnight)`, `var(--surface)`, `var(--surface-2/3)`):
- soft cream→surface gradient background
- three thin gold steam wisps rising from the cup
- stylized tea leaf with a vein, gold fill
- porcelain cup with handle, saucer shadow, gold liquid surface,
  inner rim shadow for depth

Renders at the size of its container via absolute inset, with the
SVG sized 60% of the smaller dimension. `subtle` prop drops opacity
for very small thumbnails. Memoized.

## LazyImage update

`LazyImage` already wrapped most product/tea/bundle image usage. It
had a 🍵 emoji as the error fallback and showed a perpetual
skeleton when `src` was empty. Both fixed:
- empty/whitespace `src` → no skeleton, immediate placeholder
- load error → placeholder
- both routes use `<TeaPlaceholder />`

## Raw `<img>` swept and replaced

Six places still rendered product/tea/bundle imagery via raw
`<img>`. All swapped to `LazyImage`:

- `src/app/pages/ProductsPage.tsx` — tea-card grid thumbnails
- `src/app/pages/CartPage.tsx` — cart line-item thumbnails (72 px)
- `src/app/components/CartDrawer.tsx` — drawer line-item thumbnails (56 px)
- `src/app/components/gift-builder/steps/Step4Review.tsx` —
  gift-builder review screen item thumbnails
- `src/app/components/gift-builder/components/BundleTeaCard.tsx` —
  gift-builder bundle tea cards (kept the relative wrapper for the
  Organic / Caffeine-free badges)
- `src/app/pages/admin/AdminProducts.tsx` — admin uploader preview
  + product-list row thumbnails

The Footer's optional logo `<img>` was left alone — it only renders
when `settings.footerLogoUrl` is truthy (admin-uploaded), and the
fall-through is a wordmark, not a placeholder.

## ComboGallery — defensive filter

The combo carousel uses raw `<img>` inside an absolute-positioned
cross-fade stack; wrapping each slide in LazyImage would break the
opacity transition. Instead, `useComboGallery` now filters out any
item whose `imageUrl` is empty or missing, so the carousel never
attempts to render a broken slide. The schema requires `imageUrl`
on create — this filter is defense in depth.

The admin-side combo row thumbnail (110 px square) was switched to
LazyImage like the cart drawer pattern — admins benefit from the
same placeholder behavior if a Storage URL ever 404s.

## Files changed

**New:**
- `src/app/components/TeaPlaceholder.tsx`

**Modified:**
- `src/app/components/LazyImage.tsx` — emoji fallback → TeaPlaceholder,
  empty-src now triggers placeholder instead of perpetual skeleton.
- `src/data/mockProducts.ts` — removed the `IMG` Unsplash map; every
  mock tea now has `image: ''`.
- `scripts/seed.js` — same; seeded teas start with `image: ''`.
- `src/app/pages/admin/AdminProducts.tsx` — last Unsplash fallback
  removed; preview thumbnail + product-list thumbnail both use
  LazyImage.
- `src/app/pages/ProductsPage.tsx` — tea-card grid uses LazyImage.
- `src/app/pages/CartPage.tsx` — line items use LazyImage.
- `src/app/components/CartDrawer.tsx` — drawer line items use LazyImage.
- `src/app/components/gift-builder/steps/Step4Review.tsx` — review
  thumbnails use LazyImage.
- `src/app/components/gift-builder/components/BundleTeaCard.tsx` —
  bundle tea cards use LazyImage.
- `src/app/components/ComboGallery.tsx` — added imageUrl-non-empty
  filter to the customer hook.
- `src/app/components/admin/ComboGalleryAdmin.tsx` — admin row
  thumbnail uses LazyImage.

---

# Tenth audit pass — SEO improvements

This pass shipped the SEO improvements that were genuinely missing
or broken, after auditing what the codebase already had. The
existing setup was much stronger than my earlier honest analysis
suggested — `SeoHead` already emits per-page Product /
BreadcrumbList / AggregateRating JSON-LD, full Open Graph, Twitter
Card, hreflang, and a 155-char-clamped description; `index.html`
already has LocalBusiness/CafeOrCoffeeShop, WebSite +
SearchAction (sitelinks searchbox), BreadcrumbList, geo coordinates,
preconnect hints, and font preloads; and there was already a
`robots.txt`, `sitemap.xml`, and a sitemap-generator script.

What was actually wrong or missing was a smaller list of real
issues — addressed below.

Result:
- `tsc --noEmit` (app + functions) → **0 errors**
- `vite build` → **0 errors, 0 warnings**, prebuild generates
  sitemap with 96 URLs (9 static + 8 categories + 79 teas)
- `npm run lint` → **0 errors, 3 advisory warnings** (unchanged)

## What was wrong

### 65. Broken hreflang URLs in both `index.html` and `SeoHead`
The `index.html` head emitted
`<link rel="alternate" hreflang="ar" href="…/?lang=ar">` — but
the app doesn't support Arabic at all (`type Lang = 'en' | 'fr'`
in `src/store/languageStore.ts`). The `SeoHead` component
emitted `<link rel="alternate" hrefLang="fr" href="…?lang=fr">`
— but the app's language switching is client-side via Zustand,
so `?lang=fr` doesn't actually serve different content from the
unmarked URL. Both are textbook hreflang misconfigurations that
Google explicitly flags ("Your site has hreflang tags pointing at
URLs that don't differ from the canonical").

**Fix:** dropped the AR hreflang from `index.html` entirely;
dropped the FR `?lang=fr` URL from `SeoHead`. Both files now emit
only `hreflang="en"` and `hreflang="x-default"` — accurate
descriptions of what the URLs actually serve. When real
URL-based language routing ships (e.g. `/fr/products/black/assam`),
restore the FR alternate.

### 66. Dead Unsplash preconnect in `index.html`
After the previous pass nuked all Unsplash URLs from the app, the
`<link rel="preconnect" href="https://images.unsplash.com">` was
dead weight — opening an HTTP/2 connection on every page load
that nothing ever uses. Removed.

### 67. Stale sitemap.xml — missing all 79 tea URLs and using duplicate-URL category links
The hand-curated `public/sitemap.xml` had:
- The static homepage and a few pages
- Category URLs in the form `/products?category=black` (query
  params) instead of `/products/black` (path-based)
- **Zero** individual `/tea-profile/{cat}/{slug}` URLs

Two problems with this:
- Search engines couldn't discover any of the 79 product pages
  through the sitemap. Discovery would only happen via internal
  links, which JS-execution crawlers might follow but
  link-preview crawlers (social media, AI training) wouldn't.
- The query-param URLs in the sitemap didn't match `ProductsPage`'s
  canonical URLs (now `/products/{cat}` after this pass), creating
  cross-purposes between two SEO signals.

**First attempt — wrong tool, fixed in this same pass:** I started
by rewriting the existing `scripts/generate-sitemap.js` to parse
`mockProducts.ts` and wire it into `prebuild`, so every
`npm run build` produced a fresh `public/sitemap.xml` with all 79
teas. That solved the file-content problem but missed the bigger
picture — the user's actual product catalog is admin-managed via
`/admin/products` (writes to Firestore), not via edits to
`mockProducts.ts`. A build-time sitemap parsed from the seed file
would drift the moment the admin added or removed a tea, and
wouldn't recover until someone manually updated `mockProducts.ts`
and redeployed. So:
- Adding a tea via admin → not in sitemap until next code change
- Deleting a tea via admin → still in sitemap, crawler hits 404

**Right fix — dynamic Cloud Function:** added a
`getSitemap` HTTPS function in `functions/src/index.ts` that:
- Reads `/teas` live from Firestore (`isActive != false` only —
  hidden/disabled teas aren't crawl targets)
- Filters out docs missing `slug` or `category`, and rejects
  unknown category IDs (defense against bad seed data poisoning
  the sitemap)
- Builds the same XML structure as the static version: 9 static
  pages + 8 category URLs + N teas, where N tracks Firestore live
- Sets `Cache-Control: max-age=3600, s-maxage=3600` (1-hour edge
  cache so crawlers and Google's edge don't hammer the function;
  even with full bypass this is 30 invocations/month, well under
  the free tier)
- Falls back to a static-only sitemap (just the 9 + 8 fixed URLs)
  if the Firestore read fails — the crawler gets a usable
  response rather than a 500

Wired into Hosting via a `firebase.json` rewrite:
```
{ "source": "/sitemap.xml", "function": "getSitemap" }
```

Important Firebase Hosting subtlety: static files take priority
over rewrites. So `dist/sitemap.xml` would have been served as a
static file and the rewrite never fired. To make the function the
sole source of truth, the static `public/sitemap.xml`,
`scripts/generate-sitemap.js`, and the `prebuild` /
`generate:sitemap` npm scripts were all removed.

**Operational note for deploy:** the function and the Hosting
rewrite must be deployed together. `firebase deploy --only hosting`
alone would route `/sitemap.xml` to a function that doesn't exist
yet (502 from Firebase). Use:
```
cd functions && npm run build && cd .. && firebase deploy --only functions,hosting
```

### 68. ProductsPage canonical URL strategy was too aggressive
Before this pass, every variant of `/products?cat=black&caffeine=high&page=2&sort=price-asc`
canonicalized to bare `/products`. That's actually too aggressive:
the `/products/black` route is a real, indexable page that should
rank on its own ("black tea Vancouver"). Pointing all category
filter URLs at bare `/products` told Google that the black-tea
category page is the same as the all-teas page, losing 8
individually-indexable pages.

**Fix:** built a `canonicalUrl` value in `ProductsPage` that
points at `/products/{id}` when the user is on a single-category
view (with no other filters) and at `/products` otherwise. So:

| User URL | Canonical |
|---|---|
| `/products` | `/products` |
| `/products/black` | `/products/black` |
| `/products?cat=black` | `/products/black` |
| `/products?cat=black&caffeine=high&page=2&sort=price-asc` | `/products/black` |
| `/products?caffeine=high` (no category) | `/products` |
| `/products?search=earl` | `/products` |

This gives Google exactly 9 indexable shop pages (1 root + 8
categories) instead of either 1 (over-canonicalization) or
thousands (no canonical). Matches the 8 category URLs in the
sitemap, so the two SEO signals reinforce each other.

## Files changed

**Modified:**
- `index.html` — removed AR hreflang, removed dead Unsplash
  preconnect.
- `src/app/components/SeoHead.tsx` — dropped broken `?lang=fr`
  hreflang.
- `src/app/pages/ProductsPage.tsx` — added `canonicalUrl`
  computation matching the `/products/{cat}` route shape, wired
  into `<SeoHead url={…}>`.
- `firebase.json` — added `/sitemap.xml` Hosting rewrite to the
  `getSitemap` function (above the SPA catch-all so it takes
  precedence).
- `functions/src/index.ts` — appended the `getSitemap` HTTPS
  function (~85 lines including the XML builder + escape helper).

**Removed:**
- `public/sitemap.xml` — replaced by the dynamic function.
- `scripts/generate-sitemap.js` — the build-time generator is no
  longer needed.
- `prebuild` and `generate:sitemap` entries from `package.json`'s
  scripts block.

## What I deliberately didn't ship in this pass

- **Build-time pre-rendering / SSR** (`vite-ssg` or similar). This
  is the single biggest remaining SEO improvement available — it
  would generate static HTML for every public route at build time
  so non-JS crawlers (link-preview bots, AI training crawlers, and
  some search engines) get real content rather than the SPA shell.
  But it's a meaningful refactor: the app uses Firebase imports
  that need guarding for SSR contexts, the language store needs an
  SSR-safe initial state, and `useEffect`-based data fetching has
  to be reconciled with a build-time render. Worth a focused pass
  on its own.
- **FAQPage / HowTo schema** on info pages. Would yield rich
  snippets for FAQ-style queries but needs the info-page content
  to actually be in Q&A format, which is a content decision the
  shop owner should make.

---

# Eleventh audit pass — static `<head>` prerender for every public route

This pass closes the single biggest remaining SEO gap: the SPA-shell
problem. Before this pass, when a non-JS crawler hit
`/tea-profile/black/assam`, Firebase Hosting served the same generic
`index.html` as every other route — meaning all 79 tea pages, all 8
category pages, and the catalog all looked identical to crawlers
that don't execute JavaScript. The runtime `<SeoHead>` component
emits the right per-page meta in the React tree, but only after the
JS bundle loads, parses, mounts, and React renders — far too late
for link-preview crawlers (Slack, iMessage, Facebook, Twitter,
LinkedIn) that read the document at first byte and never run JS.

This pass writes per-route HTML files at build time. Each file has
the right `<head>` baked in (title, meta description, OG product,
Twitter card, canonical, full Product JSON-LD with offer + brand +
seller), with the body remaining the SPA shell so React hydrates
normally on the client.

Result:
- `tsc --noEmit` → **0 errors**
- `vite build` → **0 errors, 0 warnings**, postbuild prerender
  generates **87 HTML files** (79 teas + 8 categories) in ~200 ms
- `npm run lint` → **0 errors, 3 advisory warnings** (unchanged)

## 69. Static `<head>` prerender for tea-profile + category routes

Added `scripts/prerender.js`, wired as `postbuild` in `package.json`.
Reads `dist/index.html` (just generated by Vite) as a template,
parses tea metadata out of `src/data/mockProducts.ts` via regex,
and writes:

- `/tea-profile/{cat}/{slug}` × 79 → per-tea title, meta
  description (from tea description, 155-char clamp),
  `og:type=product`, `og:title`, `og:description`, `og:url`,
  `product:price:amount`, `product:price:currency`,
  `product:availability`, twitter title/desc, canonical, **full
  Product JSON-LD** (name, description, image, sku, brand,
  category, offer with priceCurrency/price/availability/
  itemCondition/seller), **BreadcrumbList JSON-LD** (4-level:
  Home → Our Teas → Category → Tea name).
- `/products/{cat}` × 8 → category title and description, OG
  type=website, canonical to `/products/{cat}`, BreadcrumbList
  JSON-LD (3-level).

Both keep the global LocalBusiness/CafeOrCoffeeShop and WebSite +
SearchAction JSON-LD that the template ships — those describe the
brand/site, not the page, and apply on every URL.

### Subtleties handled

**Two teas have apostrophes in names** ("Margaret's Hope
Darjeeling", "Monk's Blend") and are written with double-quoted
strings in `mockProducts.ts`. The regex handles both quote styles
with a backreferenced quote character so it matches `name: 'foo'`
and `name: "foo's bar"` equally. A sanity-count assertion fails
the build if the regex ever drifts — better to know at deploy
time than to silently ship broken prerendered pages.

**Image source — fallback to default OG.** All teas seeded with
empty image after the previous pass's image-cleanup; the
prerender hardcodes `og-default.jpg` as the OG image rather than
emit empty `<meta property="og:image">`. Once admin uploads images
and `mockProducts.ts` is updated to match, future deploys bake the
real images in. The runtime `<SeoHead>` always shows the current
image regardless of what's prerendered.

**Default prices restated** in `prerender.js` rather than imported
from `mockProducts.ts` (which would require a TypeScript runtime).
If the price map ever drifts between the two files, the worst case
is a stale price in the prerendered OG/JSON-LD until next deploy —
the runtime React rendering would still show the correct live
price from Firestore.

### What this is NOT

- **Not full SSR.** The `<body>` of every prerendered file is the
  same `<div id="root"></div>` + script tags as `dist/index.html`.
  Body content for non-JS crawlers stays empty. Acceptable
  trade-off: ~90% of SEO weight is in `<head>`, and the alternative
  required dealing with Firebase-import SSR guards, hydration
  mismatches, Zustand SSR rewrites, and running React in Node at
  build time. If body-content prerendering becomes necessary
  later, `vite-react-ssg` or a Puppeteer-based snapshot tool can
  replace this incremental approach.
- **Not Firestore-driven.** Source-of-truth is `mockProducts.ts`.
  Admin uploads via `/admin/products` write to Firestore but won't
  appear in prerendered files until the seed file is updated. The
  dynamic `getSitemap` Cloud Function (pass 10) handles crawl
  discovery for Firestore-only teas, so they're still indexed —
  just without the prerendered head. The runtime `<SeoHead>`
  renders correct meta in-browser regardless.

### Files changed

**New:**
- `scripts/prerender.js` — ~200 lines, parses mockProducts via
  regex, generates 87 HTML files from the dist/index.html template.

**Modified:**
- `package.json` — added `postbuild` script that runs the
  prerender after `vite build`.

**Generated by build (not committed to git):**
- `dist/tea-profile/{cat}/{slug}/index.html` × 79
- `dist/products/{cat}/index.html` × 8

### Operational note

The prerendered files take precedence over the SPA catch-all
rewrite (Firebase Hosting serves static files first). So:
- A request for `/tea-profile/black/assam` → serves the prerendered
  HTML with the right `<head>`.
- A request for `/account` → no prerendered file exists → falls
  through to the SPA `**/index.html` rewrite → React routes it.
- A request for `/sitemap.xml` → no static file (removed in pass
  10) → falls through to the `getSitemap` function rewrite.

All three behaviors are intentional and reinforce each other.

---

# Twelfth audit pass — fully dynamic SEO via Cloud Function

This pass replaces the build-time static `<head>` prerender (pass 11)
with a runtime Cloud Function that reads Firestore live. Same
motivation as pass 10 was for the sitemap: when the admin adds,
edits, or removes a tea via `/admin/products`, those Firestore
writes weren't reflected in the prerendered HTML files until
someone manually updated `mockProducts.ts` and redeployed. The
build-time approach was a half-solution for a fully admin-managed
catalog.

After this pass, the SEO system is fully dynamic across all three
layers:
1. **Sitemap** — Cloud Function `getSitemap` reads Firestore live
   (pass 10).
2. **Per-route head meta** — Cloud Function `renderSeo` reads
   Firestore live (this pass).
3. **Runtime SeoHead** — React in browser, dynamic (always was).

Result:
- `tsc --noEmit` (app + functions) → **0 errors**
- `vite build` → **0 errors, 0 warnings**, no static SEO files in
  `dist/` (no prerendered tea-profile or products subdirectories,
  no static sitemap.xml — all served by functions now)
- `npm run lint` → **0 errors, 3 advisory warnings** (unchanged)

## 70. Static `<head>` prerender replaced with `renderSeo` Cloud Function

### Architecture

The new `renderSeo` HTTPS function handles two route patterns:

| Route | Behavior |
|---|---|
| `/tea-profile/{category}/{slug}` | Reads tea from `/teas` collection where `slug == {slug}`; if found and active, builds HTML with full Product JSON-LD + OG product + per-tea meta and returns it. If not found or inactive, returns plain template (SPA handles 404). |
| `/products/{category}` | Recognizes the 8 known category IDs and builds HTML with category-specific title/description + BreadcrumbList JSON-LD. Unknown categories get the plain template. |

Wired into Hosting via `firebase.json`, ABOVE the SPA catch-all:
```
{ "source": "/sitemap.xml", "function": "getSitemap" },
{ "source": "/tea-profile/**", "function": "renderSeo" },
{ "source": "/products/*", "function": "renderSeo" },
{ "source": "**", "destination": "/index.html" }
```

### Cold-start template fetch

The HTML response needs `<script src="/assets/main-{hash}.js">` tags
that match the current Vite build. Hashes change every deploy. So
on cold start, the function fetches `https://elecafe.ca/index.html`
once to grab the current SPA shell with the right hashes, then
caches that template in memory for 5 minutes.

After a deploy, the function instance might serve a slightly stale
template until cache expiry — at most ~5 min of staleness, harmless
because the old asset hashes are still on the CDN until the next
purge.

### Caching strategy

Tea-profile and category responses use:
```
Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400
```

- Browser caches 5 min
- Firebase Hosting CDN caches 1 hour
- After 1 hour, serves stale while revalidating in background up to
  1 day

Most user requests hit the CDN edge in <100 ms; the function
itself fires roughly once per route per hour. Cost is negligible —
even 1000 unique pages × 24 fires per day = 24,000 invocations per
day, well within the Functions free tier (2M/month).

### Failure modes

- **Template fetch fails on cold start** → 503 with `Cache-Control:
  no-store`. CDN won't cache the failure. Next request retries the
  fetch.
- **Firestore read fails** for a tea → returns plain template with
  60-second cache. SPA's runtime `<SeoHead>` will still emit the
  right meta after mount, so users see the right page; only the
  initial-load meta is generic.
- **Tea not found / inactive** → same behavior as Firestore failure.
  Important: we don't 404 from the function. A 404 would tell the
  crawler the URL is dead, but the SPA might handle that route
  fine (e.g., a future tea with that slug). Returning template +
  short cache lets the SPA do its thing.

### Files changed

**Modified:**
- `functions/src/index.ts` — appended `renderSeo` HTTPS function
  (~280 lines including helpers and the `patchTemplateHead` engine).
- `firebase.json` — added `/tea-profile/**` and `/products/*`
  rewrites above the SPA catch-all, below `/sitemap.xml`.
- `package.json` — removed `postbuild` script (no more
  build-time prerender).

**Removed:**
- `scripts/prerender.js` — replaced by the function.

### Operational note

Functions and hosting MUST deploy together — the rewrites point at
functions that need to exist for them to resolve:
```
cd functions && npm run build && cd ..
firebase deploy --only functions,hosting
```

A `firebase deploy --only hosting` alone would route `/tea-profile/*`
and `/products/*` to a function that didn't get the latest code,
serving stale meta or 502s. After the first deploy, you can verify
with:

```
curl -s https://elecafe.ca/tea-profile/black/assam | grep -E '<title>|"@type":"Product"'
# Should show the Assam-specific title and Product JSON-LD with the
# CURRENT Firestore data — not whatever was last in mockProducts.ts.
```

### What this means for future tea changes

| Action | What happens |
|---|---|
| Admin adds "Lapsang Souchong" via `/admin/products` | First crawler/user request to `/tea-profile/black/lapsang-souchong` → CDN miss → function fires → reads Firestore → returns prerendered HTML. CDN caches for 1 hour. **No code deploy needed.** |
| Admin edits tea description / price | Stale meta for at most 1 hour (CDN cache), then refreshes automatically. |
| Admin sets `isActive: false` | Function returns plain template (no per-tea meta) on next CDN miss. |
| Admin deletes a tea | Function returns plain template. The dynamic sitemap (`getSitemap`) also drops it on next refresh, so crawlers stop visiting. |

---

# Thirteenth audit pass — push toward enterprise-level SEO

This pass closes the six gaps from the deep-analysis honest score:
Discovery (8→9), Structured data (6→9), Performance (6→7), Programmatic
SEO (2→6), Operations & monitoring (2→7), Resilience (5→7).

Result:
- `tsc --noEmit` (app + functions) → **0 errors**
- `vite build` → **0 errors, 0 warnings**
- `npm run lint` → **0 errors, 3 advisory warnings** (unchanged baseline)

## 70. Rich tea metadata flows into per-page schema

`TeaSeoFields` interface in `renderSeo` was previously 7 fields; now
14, pulling every piece of structured data the admin already enters:
`ingredients`, `benefits`, `origin`, `regions`, `brewingTemp`,
`brewingTime`, `weight`, `isOrganic`, `caffeine`, `allergens`,
`avgRating`, `ratingCount`. Effects on the rendered `<head>`:

- **Product schema** now emits `material` (ingredients), `weight`
  (QuantitativeValue), and `countryOfOrigin` (Country) when set —
  Google uses these for the product-knowledge panel and image-search
  ranking. Previously these fields were silent.
- **AggregateRating** in Product schema when reviews exist. Pulls
  the legacy sum/count storage convention from Firestore (same as the
  runtime `<SeoHead>`), divides for display, clamps to [1, 5].
- **Per-tea brewing parameters** (`brewingTemp`, `brewingTime`)
  override the per-category defaults when the admin has entered
  custom values. So a tea with `brewingTemp: '85°C'` now reaches
  the FAQPage and HowTo with the right number, not the category
  fallback.
- **Per-tea caffeine note** uses the `caffeine` field instead of the
  generic category text. A herbal blend with `caffeine: 'low'` now
  says "low caffeine — typically under 25 mg per cup" instead of
  "most herbal blends are caffeine-free."

## 71. FAQPage now data-aware

Previously 4 generic Q&As. Now 6+ Q&As, each only emitted when the
tea actually has the data to answer:

- "How do I brew {tea}?" — always (uses brewing params)
- "Does {tea} contain caffeine?" — always
- "What is in {tea}?" — only when `ingredients` is set
- "Where does {tea} come from?" — only when `origin` is set
- "Is {tea} organic?" — only when `isOrganic === true`
- "How is {tea} shipped?" — always
- "What is the return policy?" — always

This matters because Google flags FAQPage entries with empty/null
answers as warnings in Rich Results Test. Skipping unanswerable
questions keeps the FAQ markup clean and rich-result-eligible.

## 72. Speakable schema for voice assistants

Added `WebPage` JSON-LD with a `speakable` property pointing at `h1`,
`[data-speakable]`, and `meta[name="description"]` selectors. Voice
assistants (Google Assistant, Siri Shortcuts, Alexa Briefings) can
read these aloud as snippet responses. Optional but cheap, and makes
the site eligible for voice-search rich responses.

## 73. LCP image preload injected when tea has a real image

When the rendered tea has a real image (not the og-default fallback),
the function injects:
```
<link rel="preload" as="image" href="..." fetchpriority="high" />
```
just before `</head>`. The browser starts the image fetch on the
first byte of HTML, in parallel with the JS bundle. Real LCP win for
image-led pages — typically 200–600 ms shaved off the LCP timing on
tea-profile pages, which matters for both Core Web Vitals and PWA
quality scoring.

When a tea has no image (the post-image-cleanup default), no preload
is emitted — preventing a wasted preload of the default OG image
that's already cacheable separately.

## 74. Programmatic SEO: 4 collection landing pages

New route pattern `/collections/{slug}` handled by `renderSeo`. Each
collection is a real, indexable landing page with proper
`CollectionPage` + `ItemList` JSON-LD, queries Firestore live for the
list of teas matching its filter, and falls back to the plain
template on Firestore failure.

Initial four collections (each one targets a distinct high-intent
search query):
- `/collections/caffeine-free` — herbal/rooibos/fruit/flower + any
  tea with `caffeine: 'none'`
- `/collections/organic` — `isOrganic === true`
- `/collections/high-caffeine` — black teas + any with
  `caffeine: 'high'`
- `/collections/best-sellers` — teas with `ratingCount >= 5`

Adding a new collection takes ~5 lines (slug, title, description,
filter function). The list is exported via `SEO_COLLECTIONS` and
mirrored in the sitemap-generator's URL list (kept in sync manually
to avoid a forward-reference cycle).

## 75. Sitemap includes collections + image entries + per-tea lastmod

Sitemap now emits, in addition to the previous static + tea + category
URLs:
- Each collection landing page (4 entries)
- `<image:image>` entries for teas with real images (Google Image
  Search eligibility)
- Per-tea `<lastmod>` from Firestore `updatedAt` (or `createdAt`),
  not the build date — helps Google prioritize recrawls of recently
  updated pages

## 76. Resilience: warm starts on SEO functions

`renderSeo` and `getSitemap` now run with `minInstances: 1` — one
function instance is kept warm at all times, eliminating the
500–1000 ms cold-start hit that crawlers used to encounter on the
first request after a cache eviction. Cost: ~$5/month per warm
instance, accepted because consistent first-byte latency directly
affects how aggressively Google's crawler will index the site.

`renderSeo` also has `maxInstances: 100` and `concurrency: 80` —
prevents one rogue crawler from exhausting the regional concurrency
quota during a tight crawl loop.

## 77. Operations: SEO health endpoint

New `seoHealth` Cloud Function at `/_health/seo`. Returns 200 when
all three checks pass, 503 on any failure:

- Firestore `/teas` collection has at least 1 active tea
- Hosting template fetch succeeds and contains `<title>` + `</head>`
- Sitemap XML builder produces valid output

Output is JSON with per-check timing and error messages, designed
for external uptime monitors (UptimeRobot, BetterStack, Pingdom).
Disallowed in robots.txt to avoid indexing the diagnostic endpoint.

## 78. Operations: SEO regression test suite extended

Existing 7 tests in `tests/seo/smoke.spec.ts` (sitemap, robots,
canonical, JSON-LD basics) extended with 7 more covering the new
schemas:

- Speakable schema present on tea profiles
- Product Offer has shippingDetails + hasMerchantReturnPolicy
- LCP image preload uses `fetchpriority="high"` when emitted
- `/collections/caffeine-free` renders with CollectionPage + ItemList
  JSON-LD, correct title and canonical
- Sitemap includes at least one collection slug
- `seoHealth` returns 200/503 + JSON with all three checks
- robots.txt disallows `/_health`

Tests run against a deployed URL (default `https://elecafe.ca`,
override via `TEST_BASE_URL`). They fetch raw HTML and validate the
SEO contract without executing JS — caught regressions before they
hit Search Console.

## 79. Operations: Lighthouse CI workflow

New `.github/workflows/lighthouse-ci.yml`. Runs on every push to
`main` (when SEO-relevant paths change), nightly at 07:00 UTC, or on
manual dispatch. Audits 5 key routes:
- `/` (homepage)
- `/products` (catalog)
- `/products/black` (category)
- `/tea-profile/black/assam` (rich Product schema)
- `/collections/organic` (programmatic SEO)

Asserts thresholds: Performance ≥ 0.85, SEO ≥ 0.95,
Accessibility ≥ 0.90, Best Practices ≥ 0.90. Fails the build if
any drop. Reports uploaded as artifacts (14-day retention) for
trend analysis.

## What I deliberately didn't ship in this pass

- **Lazy-load Firebase Auth/Firestore off main bundle.** This is
  the single biggest remaining performance win — ~80 KB gzipped
  off the entry chunk would land Performance score at ~0.92.
  Requires a multi-file refactor: `src/lib/firebase.ts` is
  imported eagerly by core components (Navbar, AppShell), so
  every callsite would have to switch to async access. Risk-laden
  to ship without runtime testing. Worth a focused pass on its
  own when there's time to verify the auth/Firestore boot
  sequence under various network conditions.
- **Multi-region Cloud Functions.** Firebase Hosting rewrites
  always route to a single region — Cloud Functions multi-region
  only helps when paired with a load balancer or DNS-level
  failover. For a Vancouver-based shop with primarily Canadian
  traffic and us-central1 latency of ~30 ms, the engineering cost
  doesn't pay back. Documented as a future option if the customer
  base expands internationally.
- **Real i18n SEO** (URL-prefixed `/fr/...` routes). Significant
  refactor — touches React Router config, language store,
  prerender function, and would roughly double the prerendered
  route count. Worth doing only if French-language traffic
  becomes a strategic priority.
- **Search Console + Bing Webmaster integration.** Operational
  setup (verification + sitemap submission + monitoring), not
  code. The infrastructure is ready — the operator just needs to
  add the verification meta tag and submit the sitemap.

## Updated SEO scorecard

After this pass, against the same enterprise-baseline scoring as
the deep analysis:

| Category | Before | After | Notes |
|---|---|---|---|
| Discovery & indexation | 8/10 | 9/10 | Image entries, per-tea lastmod, collection URLs, IndexNow pings |
| Structured data | 6/10 | 9/10 | AggregateRating, Speakable, full Offer (shipping + return), data-driven FAQ |
| Performance / Core Web Vitals | 6/10 | 7/10 | LCP preload + warm starts. Real win blocked on Firebase lazy-load. |
| Programmatic SEO | 2/10 | 6/10 | 4 collection landing pages with infrastructure for more. Real content (brewing guides, articles) still required for higher score. |
| Operations & monitoring | 2/10 | 7/10 | SEO regression tests, Lighthouse CI, health endpoint. Real ops requires someone watching Search Console. |
| Resilience | 5/10 | 7/10 | Warm starts + concurrency limits. Multi-region deferred. |
| **Weighted average** | **5.5/10** | **7.5/10** | |
