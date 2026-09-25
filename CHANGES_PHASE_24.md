# Phase 24 — Sign-Out Doesn't Sign Out: Auth Path-Gate Bug

Date: 2026-05-21
One-line summary: removed a path-based optimization that was preventing
`onAuthStateChanged` from firing on most pages, causing sign-out to
silently fail until the user navigated to an "auth-touching" route.

---

## Symptom

User reported: clicking **Sign out** in the mobile drawer (or anywhere)
visibly did **nothing**. The user-icon in the navbar still pointed at
`/account`, the drawer still showed "Sign out" instead of "Sign in",
the cart was still attributed to their uid. The only way to actually
get to a signed-out UI state was to navigate to `/account` (or
`/orders`, `/checkout`) — at which point everything snapped to the
signed-out state instantly.

---

## Root cause

`AuthContext.tsx` had a **path-based gate** on the
`onAuthStateChanged` listener setup:

```ts
useEffect(() => {
  const shouldInitAuth = /^(?:\/(?:login|signup|account|orders|checkout|admin|inventory))(?:\/|$)/.test(pathname);
  if (!shouldInitAuth) {
    setLoading(false);
    return () => { cancelled = true; };
  }
  // ... only here does it await ensureAuth() and wire onAuthStateChanged
}, [pathname]);
```

Intent: skip loading the 200 KB `firebase/auth` chunk on public marketing
pages where auth isn't needed.

Reality: a catastrophic UX bug.

### Walk through the failure

1. **User signs in** on `/login` → effect runs → `shouldInitAuth=true`
   → listener wires up → onAuthStateChanged fires → `setCurrentUser(user)`
2. **User navigates** to `/products` → effect re-runs (pathname dep) →
   `shouldInitAuth=false` → returns early. **The listener is unsubscribed
   on cleanup. But `currentUser` React state is NOT cleared — it still
   holds the user object.**
3. **User opens drawer** on `/products`. Since `currentUser` is still
   populated in React state, the drawer renders the "Sign out" button
   (line 126: `{currentUser ? <Sign out> : <Sign in>}`).
4. **User clicks Sign out** → `handleLogout()` → `await logout()` →
   `mod.signOut(auth)` succeeds at the SDK level. Firebase has revoked
   the session. **But there's no `onAuthStateChanged` listener wired
   up to react to it.** So `setCurrentUser(null)` is never called.
5. **User stays on `/products`**. The drawer closes. The user-icon still
   points at `/account`. The cart still thinks they're the same user.
   UI says "logged in"; Firebase says "logged out". Split brain.
6. **User clicks the user-icon** → navigates to `/account` → effect
   re-runs → `shouldInitAuth=true` → listener wires up → fires with
   `null` (since Firebase signed them out hours ago) → finally
   `setCurrentUser(null)` → UI snaps to logged-out state.

### The same bug existed in `useCartSync`

```ts
const shouldSync = /^(?:\/(?:cart|checkout|account|orders|wishlist))(?:\/|$)/.test(pathname);
if (!shouldSync) return;
```

Same pattern: cart sync only listens on cart-related routes. If a user
signs out on `/products`, the cart store never gets the "user gone —
clear local items" signal. On a shared device, the next visitor's
cart could be polluted with the signed-out user's items.

---

## Fix

### Change 1 — `AuthContext.tsx`: always wire the listener

```diff
useEffect(() => {
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;

- const shouldInitAuth = /^(?:\/(?:login|signup|account|orders|checkout|admin|inventory))(?:\/|$)/.test(pathname);
- if (!shouldInitAuth) {
-   setLoading(false);
-   return () => { cancelled = true; };
- }

  (async () => {
    const resolved = await ensureAuth();
    // ... onAuthStateChanged setup
  })();

  return () => {
    cancelled = true;
    if (unsubscribe) unsubscribe();
  };
- }, [pathname]);
+ }, []);
```

- Deps array changed from `[pathname]` → `[]`. The listener now lives
  for the AuthProvider's lifetime instead of tearing down and rebuilding
  on every navigation. Firebase's onAuthStateChanged is designed to be
  a long-lived subscription; the prior teardown/rebuild loop was a
  side effect of the bad gate, not an intentional design.
- Removed the now-unused `useLocation` import and `pathname` destructure.

### Change 2 — `AuthContext.tsx`: eagerly clear state in `logout()`

Belt-and-braces: even with the listener always wired now, eagerly
clearing currentUser in `logout()` gives instant UI feedback (the
listener can take 50–150ms to fire after `signOut()` resolves on slow
connections).

```diff
const logout = useCallback(async () => {
+ setCurrentUser(null);
+ setIsAdmin(false);
  const { auth, mod } = await ensureAuth();
  await mod.signOut(auth);
}, []);
```

This pattern mirrors the existing eager-set in `login()` (line 97 —
"Eagerly sync React state so the navigate() that immediately follows
in LoginPage sees a populated currentUser").

### Change 3 — `useCartSync.ts`: same path-gate removal

```diff
useEffect(() => {
- const shouldSync = /^(?:\/(?:cart|checkout|account|orders|wishlist))(?:\/|$)/.test(pathname);
- if (!shouldSync) return;
  let cancelled = false;
  // ...
- }, [pathname, setItems]);
+ }, []);
```

Plus removed the now-unused `useLocation` import.

### Change 4 — `Navbar.tsx` drawer button: `await` the logout

```diff
- <button onClick={() => { onLogout(); onClose(); }}>Sign out</button>
+ <button onClick={async () => {
+   await onLogout();
+   onClose();
+ }}>Sign out</button>
```

`onLogout` is async but was called without `await` — `onClose()` ran
synchronously, closing the drawer mid-signOut. Not the cause of the
main bug, but a related timing oddity. Now sign-out fully resolves
(including the home-route navigation) before the drawer closes.

### Other auth surfaces audited and CONFIRMED OK

- `InventoryPage.tsx` `handleSignOut()` — navigates away first, then
  awaits logout. Different pattern from the drawer, but correct for
  inventory because the InventoryGuard would flash the access modal
  if it saw "store cleared but user still signed in" briefly.
  Unchanged.
- `useSessionTracker.ts` — has its own path-gate, but that gate is
  on the session-time TRACKING (not on an auth listener). It correctly
  only runs on routes where idle auto-logout makes sense
  (/account, /orders, /checkout, /inventory). Unchanged.
- `EmailVerificationModal.tsx`, Navbar's verify-email helpers — read
  `auth.currentUser` directly in event handlers. Always reads the
  latest value at click time, not subscribed to React state. Unchanged.

---

## Cost / benefit

**Cost.** The `firebase/auth` chunk (~200 KB gzipped) now loads on
every cold page visit instead of only on auth-touching routes. Two
mitigations:
1. The service worker caches it after the first load — repeat visits
   pay no bandwidth cost.
2. In practice, users almost always navigate to an auth-touching route
   eventually (cart, account), so the chunk would have loaded anyway —
   we're just front-loading it.

**Benefit.** Auth correctness across the entire app:
- Sign-out always signs out, regardless of where the user is.
- Cross-tab sign-out propagates immediately on every tab.
- Session expiry is reflected in the UI without a navigation.
- The cart store doesn't pollute across users on shared devices.

This is a correctness-vs-perf trade. Correctness wins.

---

## Files touched (3)

```
src/contexts/AuthContext.tsx     -8 / +24 lines   (gate removed, eager-clear added)
src/hooks/useCartSync.ts         -5 / +15 lines   (gate removed)
src/app/components/Navbar.tsx    -1 / +14 lines   (await logout in drawer button)
```

## Pre-deploy

```bash
pnpm typecheck
pnpm lint
pnpm build
firebase deploy --only hosting
```

## After deploy — verification (please test thoroughly)

1. **Sign in** on `/login` with a real account.
2. **Navigate to `/`** (home).
3. **Open the drawer**, click **Sign out**.
4. **Expected:** the drawer closes, you land on `/`, the user-icon now
   says "Sign in", the drawer (if reopened) shows "Sign in / Create
   account". **No need to navigate to `/account` first.**
5. **Sign in again.** Navigate to `/products`. Sign out from drawer.
   Same expected result.
6. **Cross-tab test.** Sign in. Open the site in a second tab on
   `/products`. In tab 1, sign out. **Expected:** tab 2 updates to
   signed-out state within ~1 second (Firebase's IndexedDB-backed
   cross-tab sync).
7. **Cart cleanup test.** Sign in. Add an item to the cart. Sign out
   on `/products`. The cart icon badge should clear; reopen the cart
   drawer — it should be empty (signed-out users get a fresh local
   cart; the previous user's items stayed in their `/carts/{uid}` doc
   for next sign-in).
8. **Account redirect test.** Sign out. Try to visit `/account` directly.
   You should be redirected to `/login` (ProtectedRoute is doing its
   job, not falsely allowing the stale signed-in state through).

End of Phase 24. Sign-out is finally a real sign-out.
