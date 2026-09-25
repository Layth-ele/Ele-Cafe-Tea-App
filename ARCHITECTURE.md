# Architecture Notes

These are the architectural decisions in the Ele Café codebase that aren't obvious from reading the code, paired with the reasoning behind them and the rules to follow when modifying them. Read this before making changes that touch Firebase, the cart, order placement, or the bundle layout.

## Lazy-loaded Firebase modules — the wrapper pattern

### What

Firebase Auth and Firebase Storage are not eagerly imported. They're loaded on demand via two helpers in `src/lib/firebase.ts`:

```ts
getAuthLazy()     // imports './firebaseAuthLazy'
getStorageLazy()  // imports './firebaseStorageLazy'
```

Each helper memoizes its dynamic import so concurrent callers share one module load. The wrapper files (`firebaseAuthLazy.ts`, `firebaseStorageLazy.ts`) statically import the named functions we use and re-export them.

### Why this is non-obvious

The wrappers exist because **`import('firebase/auth')` and `import('firebase/storage')` directly would defeat tree-shaking.** Vite/Rollup can't shake a namespace import — when the dynamic import target is a whole package, the entire public API ends up in the resulting chunk.

We discovered this the hard way. An earlier version of `getAuthLazy` did:

```ts
_authPromise = import('firebase/auth').then(mod => ({
  ...mod,
  auth: mod.getAuth(app),
}));
```

That made `firebase-auth` chunk grow from 123 KB → 192 KB — a 70 KB regression — because the spread `...mod` defeated any chance of tree-shaking. Replacing the namespace import with a wrapper that does named static imports brought it back to ~125 KB (and 44 KB for storage, down from 51 KB).

### Rules

1. **Never** `import('firebase/auth')` or `import('firebase/storage')` directly anywhere in the codebase. Always go through `getAuthLazy()` / `getStorageLazy()`.
2. When you need a new Auth or Storage function (e.g. `verifyPasswordResetCode`, `listAll`, `getMetadata`):
   - Add it to the named import list at the top of the corresponding wrapper file.
   - Add it to the re-export list below.
   - Use it in your callsite via `const sm = await getAuthLazy(); sm.verifyPasswordResetCode(...)`.
3. Wrapper files must use **named static imports**, not namespace imports. Don't write `import * as auth from 'firebase/auth'` in there.
4. The wrappers also export a memoized instance (`auth` for the Auth wrapper, `storage` for the Storage wrapper). Reuse those rather than calling `getAuth(app)` / `getStorage(app)` again — duplicates would create disconnected instances.

### How to verify the lazy-load is still working

After a build, check that `dist/index.html`'s `modulepreload` list does NOT include `firebase-auth` or `firebase-storage`:

```bash
grep modulepreload dist/index.html | grep -oE 'href="[^"]+"'
```

Both chunks should also exist as standalone files in `dist/assets/`, referenced only by `__vite__mapDeps` (the dynamic-import preload manifest), not by `<link rel="modulepreload">`.

If you ever see a `firebase-auth` chunk over ~140 KB raw, something has reverted the wrapper pattern — investigate before merging.

## Order idempotency — stable IDs + pre-check

### What

`CheckoutPage.tsx` generates a per-session order ID once via `useRef + generateOrderId()`, then writes the order using `setDoc(doc(db, 'orders', stableId), ...)` instead of `addDoc(collection(db, 'orders'), ...)`. Before writing, it `getDoc`s the same ID — if it exists, the submit is treated as a retry (jump straight to the confirmation step, skip the write).

### Why this is non-obvious

Three things conspire to make this design necessary:

1. `addDoc` generates a new ID every call. A double-click or refresh-during-submit would create two orders.
2. `setDoc` with a deterministic ID gives idempotency, BUT Firestore's update rules for `/orders/{id}` only allow specific status transitions (`pending → cancelled`, `approved → payment_sent`). A second `setDoc` with the same `pending` status would be REJECTED by the rules layer.
3. The pre-`getDoc` check sidesteps that: if the doc already exists, we know it was a successful first write — proceed to confirmation, don't re-write.

### Rules

1. Don't replace `setDoc` with `addDoc` in `handlePlaceOrder`. The deterministic ID is what makes retries safe.
2. Don't remove the `useRef` wrapping `generateOrderId()`. If you call `generateOrderId()` afresh on each submit, you defeat the idempotency.
3. Don't loosen the Firestore rule that pins `pending → pending` updates as illegal — that constraint is what forces us into the pre-check pattern, but it's also what protects against client-side status tampering.
4. `generateOrderId()` itself relies on `crypto.getRandomValues()` for 6 random base-36 chars (≈2.18 billion combos per millisecond). Don't downgrade to `Math.random` — there's a unit test (`tests/unit/schemas/notification.schema.test.ts`) that fails if the collision rate creeps back up.

## Type-safe Firestore reads — `Partial<DocType>`

### What

Admin pages that snapshot Firestore collections type the result as `Partial<OrderDoc> & { id: string }` (or the equivalent `Partial<TeaDoc>`, `Partial<UserDoc>`):

```ts
const orders: OrderRow[] = snap.docs.map(d => ({
  ...(d.data() as Partial<OrderDoc>),
  id: d.id,
}));
```

The doc types live in `src/types/firestore.ts`.

### Why this is non-obvious

Firestore docs in production are **never** guaranteed to match the current TypeScript shape. Reasons:

- A field was added in a later release; older docs don't have it.
- A migration is in progress.
- An admin manually edited a doc via the Firebase Console and missed a field.
- A Cloud Function wrote a partial update.

Casting to the full `OrderDoc` would lie to the type system — `o.customerId` would be typed `string` but might actually be `undefined`. `Partial<>` is honest: every field is `T | undefined`, and TypeScript forces you to handle the missing case (which we do via `?? 0`, `?? ''`, etc.).

### Rules

1. New admin pages that read Firestore collections should use `Partial<DocType>` casts, not full `DocType` casts.
2. Add safe accessors at every read site: `o.totalAmount ?? 0`, `t.stock ?? 50`, `c.email ?? ''`. Never assume a field is present.
3. If a field is genuinely required (e.g. a doc would be invalid without it), validate via Zod at the boundary (`src/schemas/*.schema.ts`) and skip docs that fail validation, rather than crashing on missing fields.

## mockProducts fallback chain

### What

`src/lib/firebaseQueries.ts` lazy-imports `src/data/mockProducts.ts` only when Firestore returns an empty result or errors:

```ts
const { mockProducts } = await loadMockProducts();
return mockProducts.filter(p => p.isActive !== false);
```

`mockProducts.ts` ships as its own ~44 KB chunk that's NOT in the eager bundle.

### Why this is non-obvious

`mockProducts.ts` is 79 hand-curated tea entries. It exists for three reasons:

1. **Local dev with empty Firestore** — devs can `npm run dev` immediately without seeding.
2. **First-deploy fallback** — production pages render even before the seed script has populated Firestore.
3. **Catastrophe insurance** — if Firestore goes down or the project's quota is exhausted, the site degrades to "static mode" instead of going blank.

In normal production every visitor's Firestore reads succeed, so the mock data is never loaded. Eagerly importing it would have meant shipping 12 KB gzip / 44 KB raw to every visitor for code that never runs.

The `categories` constant was extracted to `src/data/categories.ts` for the same reason — pages need that small list (~600 bytes), but if they imported it from `mockProducts.ts`, Vite would pull the entire 79-tea data array into their chunk.

### Rules

1. `loadMockProducts()` is the only correct way to access the seed data at runtime. Don't add `import { mockProducts } from '../data/mockProducts'` anywhere in src/app/ or src/lib/firebaseQueries.ts (other than the lazy helper itself).
2. Pages that need `categories` should import from `'../data/categories'`, not `'../data/mockProducts'`. The latter still re-exports it for backwards compat, but new code should use the dedicated file.
3. Don't add new fields to `mockProducts.ts` that won't also exist on real Firestore documents. The fallback path returns mock data into UI that expects Firestore-shaped data; field drift breaks the fallback silently.

## SITE_BASE centralization

### What

Every absolute URL composition in the app goes through `SITE_BASE` from `src/lib/routes.ts`:

```ts
import { SITE_BASE } from '../../lib/routes';
const url = `${SITE_BASE}/products/${category}`;
```

There's exactly one place where `'https://elecafe.ca'` appears as a string literal: the `storeWebsite` default in `AdminSettings.tsx`. That's intentional — it's user-editable config (an admin can change "their website" to anything in settings), not URL composition.

### Why this is non-obvious

If someone wants to rename the domain, run a staging environment at a different URL, or set up preview deploys, they need exactly one edit in the codebase. Without this centralization, the domain leaks into 30+ files (we saw it firsthand — that's how many we had to fix).

`SITE_BASE` is also the natural upgrade path for env-driven configuration:

```ts
export const SITE_BASE = import.meta.env.VITE_SITE_BASE ?? 'https://elecafe.ca';
```

That's a one-line change when staging/preview deploys become a need.

### Rules

1. New code that needs the site origin imports `SITE_BASE`, never hardcodes the URL.
2. Don't introduce local `const SITE_BASE = '...'` or `const BASE_URL = '...'` constants in component files. (Earlier passes had `SITE_URL` in `TeaProfilePage`, `BASE_URL` in `SeoHead`, and `SITE_BASE` in `ComboPairingPage` — all consolidated.)
3. Email addresses (`info@elecafe.ca`, `pay@elecafe.ca`) are NOT URL composition and should stay where they are. Don't try to derive them from `SITE_BASE`.

## Toast system — sonner with brand tokens

### What

The app uses `sonner` for toasts, wrapped in `src/app/components/ui/sonner.tsx`. The wrapper:

- Sets brand-aware CSS custom properties (`--surface`, `--midnight`, `--gold`, etc.) on the toast root.
- Picks bottom-center on desktop, top-center on mobile (avoids home-indicator conflicts).
- Disables sonner's `richColors` because they hardcode saturated greens/reds that fight the brand palette.

Toast styling lives in `src/styles/design.css` (~150 lines under "Toaster (sonner-based, brand-skinned)").

### Rules

1. Don't enable `richColors` in the Toaster props — it overrides the CSS-variable theming.
2. Don't hardcode hex literals in toast styles. Use tokens (`var(--success)`, `var(--danger)`, `var(--gold-deep)`). Stylelint will reject hex literals — see `.stylelintrc`.
3. If you add a new toast variant (e.g. `toast.warning('...')`), check the existing variant CSS in `design.css` to make sure your accent-bar color token exists.

## Quality gates — what should pass before merge

Run all of these before committing changes:

```bash
npx tsc --noEmit                                 # 0 errors
npx vite build                                    # 0 errors
node node_modules/eslint/bin/eslint.js src tests functions/src   # 0 errors, 0 warnings
npx stylelint "src/**/*.css"                      # 0 errors
node node_modules/vitest/vitest.mjs run           # 36/36 tests passing
cd functions && npm run build                     # 0 errors
```

The eslint baseline is currently **0 warnings**. New code that introduces `react-hooks/exhaustive-deps` warnings should either fix the underlying issue or add a localized `// eslint-disable-next-line` with a comment explaining why (see `useT.ts` for the pattern).

## Things explicitly NOT done (and why)

- **No SSR or prerendering.** The app is a SPA with dynamic SEO via the `renderSeo` Cloud Function for crawlers. Adding SSR would be a significant complexity step that the SEO data doesn't justify.
- **No real i18n routing (`/fr/...`).** Translation is handled client-side via `useT` and Google Translate API for tea descriptions. Adding URL-prefixed locales would require restructuring the entire route tree.
- **No multi-region Cloud Functions.** Firebase Hosting rewrites only route to a single region anyway; multi-region would be a no-op.
- **`firebase-admin` has 10 transitive vulnerabilities** (chain through `@tootallnate/once`). Running `npm audit fix --force` downgrades to `firebase-admin` v10, losing two major versions. Wait for Google to update; don't auto-fix.
