# Schemas Directory

Zod schemas. Single source of truth for the shapes of data flowing
between the client, Firestore, and the Cloud Functions. Each schema
gives us a runtime validator AND the TypeScript type via `z.infer`.

## What's in here

### Core entity schemas — model a Firestore collection

| File | Collection | Notes |
|------|------------|-------|
| `product.schema.ts` | `/teas/{slug}` | `Product`, `productFormSchema` (UI shape used by AdminProducts), `productCategorySchema` (free-form string, validated against the live `/categories` list at admin-write time). |
| `order.schema.ts` | `/orders/{orderId}` | `Order`, `orderStatusSchema` (10 statuses), `adminOrderEditFormSchema` (UI shape for AdminOrders edit). |
| `user.schema.ts` | `/users/{uid}` | `UserProfile` (no `isAdmin` and no nested `preferences` — both were phantom fields removed during the schema-fidelity audit). `signupSchema`/`signupFormSchema` for auth. |
| `address.schema.ts` | inline on `/users.addresses[]` and `/orders.shippingAddress` | Phone validation uses the same 7-digit heuristic as `checkoutFormSchema`. |
| `cart.schema.ts` | `/carts/{userId}` | Round-trip validation only — `useCart` is the runtime source of truth. |
| `category.schema.ts` | `/categories/{id}` | Includes `labelFr` for FR-locale display (now actually surfaced by `useCategoriesRealtime`). |
| `review.schema.ts` | `/teas/{slug}/reviews/{userId}` | Subcollection. Schema is `userId + userName + rating + comment + createdAt` — no `productId` (parent slug serves), no `id` (userId IS the doc id), no `title/images/verified/helpful` (never built). |
| `promotion.schema.ts` | `/promotions/{id}` | Storage shape + `promotionFormSchema` (UI shape with `string` dates from HTML date inputs). |
| `notification.schema.ts` | `/notifications/{id}` | Discriminated union per `type`. Includes `notificationLooseSchema` for backward-compat read of historical docs. Also exports `generateOrderId` and `formatCustomerId`. |
| `credit.schema.ts` | `/credits/{userId}`, `/creditTransactions/{txId}` | Includes pure helper functions for points math (`calcPointsEarned`, `maxRedeemable`, `pointsToNextThreshold`, etc.) — these are the canonical implementations used by both client and Cloud Functions (the CF can't import the schema, so the functions there are duplicated; keep them in sync). |
| `comboGallery.schema.ts` | `/comboGalleryItems/{id}` | Reference example of a schema used CORRECTLY (validate, then write `parsed.data`). |

### Form / input schemas — RHF + zodResolver

| File | Consumer |
|------|----------|
| `auth.schema.ts` | `LoginPage` |
| `user.schema.ts` (`signupFormSchema`) | `SignupPage` |
| `checkout.schema.ts` | `CheckoutPage` (multi-step delivery → payment → review flow; pickup vs delivery branching via `superRefine`) |
| `address.schema.ts` (`addressesFormSchema`) | `AccountPage` (saved-addresses sub-form) |
| `product.schema.ts` (`productFormSchema`) | `AdminProducts` |
| `order.schema.ts` (`adminOrderEditFormSchema`) | `AdminOrders` edit modal |
| `promotion.schema.ts` (`promotionFormSchema`) | `AdminPromotions` |
| `credit.schema.ts` (`adminCreditFormSchema`) | `AdminCustomers` credit-adjust modal |

### Settings / preferences schemas

| File | Consumer |
|------|----------|
| `announcement.schema.ts` | `AdminSettings` (editor) + `Navbar` (`filterActiveAnnouncements`) |
| `userPreferences.schema.ts` | `NotificationPreferencesSection` (writes `/users/{uid}/preferences/notifications`); enforced server-side by `functions/src/lib/notificationPrefs.ts` |

### Utility schemas

| File | Notes |
|------|-------|
| `firestoreTimestamp.schema.ts` | Coerces Firestore `Timestamp`, `Date`, ISO string, or epoch-ms number to `Date \| null`. Used transitively by `notification.schema`. |

### Unused (kept for future features)

`gift.schema.ts`, `payment.schema.ts`, and `analytics.schema.ts` are
not re-exported from `index.ts` and have no runtime consumer. They
describe features that were never built (gift sub-orders, Stripe
provider integration, sales-aggregation dashboards). Direct-import
if you build those features later.

## Usage patterns

### Importing

```ts
// Preferred — central barrel.
import { Order, validateOrder } from '@/schemas';

// Also fine when you want to be specific or pick from the not-re-exported set.
import { Product, productFormSchema } from '@/schemas/product.schema';
import { giftSchema } from '@/schemas/gift.schema';
```

### Using with RHF

```ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productFormSchema, type ProductFormInput } from '@/schemas/product.schema';

const form = useForm<ProductFormInput>({
  resolver: zodResolver(productFormSchema),
  mode: 'onTouched',
  reValidateMode: 'onChange',
});
```

### The validate-then-write pattern

When writing to Firestore from the client, **validate the candidate
and then write `parsed.data`** — don't build a separate object literal
for the write call. `ComboGalleryAdmin` is the reference implementation.
`AdminProducts.handleAdd` originally drifted from this pattern (the
validated candidate carried `blurhash`/`variantsAvailable` but the
inline `setDoc` literal dropped them) and the gap caused silent
data loss until the schema-fidelity audit.

```ts
// Good
const parsed = validateCreateProduct(candidate);
if (!parsed.success) return;
await setDoc(ref, { ...parsed.data, createdAt: serverTimestamp() });

// Bad — drift bait
const parsed = validateCreateProduct(candidate);
if (!parsed.success) return;
await setDoc(ref, { name, price, /* ...different fields... */ });
```

### Cloud Functions

The functions package has its own `tsconfig.json` (`rootDir: 'src'`,
which means `functions/src`) and **cannot import from
`src/schemas/`**. Field names and defaults are duplicated where
needed (`functions/src/lib/notificationPrefs.ts` mirrors
`userPreferences.schema.ts` defaults; the `placeOrder` callable
mirrors `order.schema.ts` field names). If you change either side,
update the other in the same commit.

## Adding a new schema

1. Create `mything.schema.ts`.
2. Define the base shape with Zod. Mirror the actual Firestore doc
   field-for-field.
3. Export the inferred type: `export type MyThing = z.infer<typeof myThingSchema>;`
4. If admin/forms touch it, also export a `myThingFormSchema` whose
   inputs match what `<input>` produces (string for numbers, etc.).
5. Export `validate*` helper functions.
6. Re-export from `index.ts`.
7. Use the validate-then-write pattern at every write call site —
   don't duplicate the shape inline.

## Recent schema-fidelity audit (May 2026)

Findings and fixes in `CHANGES_2026-05-14.md` and `SCHEMA_AUDIT_2026-05-14.md`.
Headline gaps closed:

- `AdminProducts.handleAdd` was writing a literal that omitted `blurhash`/`variantsAvailable`.
- `placeOrder` was dropping `senderName`/`occasion`/`customOccasion` from the order doc.
- `userProfileSchema` declared `isAdmin` and `preferences` fields that no code ever wrote.
- `reviewSchema` declared `id`/`productId`/`title`/`images`/`verified`/`helpful`/`updatedAt` — none of which exist in real review docs.
- All 9 transactional order emails ignored the user's notification preferences (the gate was wired but unused).
- `categorySchema.labelFr` was declared but `useCategoriesRealtime` dropped it.
- Address `phone` rule disagreed with the checkout's rule (10 vs 7 digits).
- `index.ts` barrel was missing `auth`, `announcement`, `userPreferences`, and `firestoreTimestamp`.

## Resources

- [Zod](https://zod.dev/)
- [RHF + Zod](https://react-hook-form.com/get-started#SchemaValidation)
