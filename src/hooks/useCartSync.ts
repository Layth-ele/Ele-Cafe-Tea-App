/**
 * useCartSync.ts — syncs Zustand cart store ↔ Firestore
 *
 * Mount this once in App.tsx or a top-level layout component.
 * Separated from the store so the store stays pure and SSR-safe.
 *
 * Implementation notes:
 * - Uses individual selectors so this hook only re-runs when `items`
 *   actually changes (subscribing to the whole store would fire on every
 *   unrelated state update).
 * - `suppressUntilRef` is a single timestamp ref — no any-casts, no
 *   two-field tracking.
 * - Firebase Auth is lazy-loaded via `ensureAuth()` (shared with
 *   AuthContext). Keeps firebase/auth out of the eager bundle while
 *   still hooking onAuthStateChanged here for cart-on-login merge.
 */
import { useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ensureAuth } from '@/contexts/AuthContext';
import { useCartStore, type CartItem } from '@/store/cartStore';
import { tryReadWithOfflineRetry } from '@/lib/firestoreRetry';

// Window in ms after a remote load during which we skip writing the just-loaded
// cart back to Firestore (avoid echo-write).
const SUPPRESS_WRITE_MS = 300;

function mergeCartItems(local: CartItem[], remote: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const i of local)  map.set(i.id, i);
  for (const i of remote) {
    const ex = map.get(i.id);
    map.set(i.id, ex ? { ...ex, quantity: Math.max(ex.quantity, i.quantity) } : i);
  }
  return Array.from(map.values());
}

export function useCartSync() {
  // Individual selectors — stable refs, subscribe only to what we use.
  const items    = useCartStore(s => s.items);
  const setItems = useCartStore(s => s.setItems);

  const uidRef            = useRef<string | null>(null);
  // Epoch ms until which we should skip persisting (0 = never suppress).
  const suppressUntilRef  = useRef<number>(0);

  // On login: load remote cart + merge.
  // The auth import is async (lazy-loaded) — we hold the unsubscribe
  // in a closure-captured variable so cleanup still fires correctly
  // even if the component unmounts before the import resolves.
  //
  // Phase 24 — removed the path-gate that previously skipped this
  // listener on non-cart routes. That gate caused a subtle but nasty
  // bug paired with the matching gate in AuthContext: when a user
  // signed out from the drawer on a public page (/, /products, etc.),
  // neither this listener nor the AuthContext listener was wired up.
  // Firebase signed out at the SDK level, but our cart store never got
  // the "user is gone — clear local items" signal, so on the next
  // navigation to a cart-route the just-arrived listener fired with
  // the NEW (or null) user, and the suppress-window logic could write
  // stale data to the wrong /carts/{uid} doc. The fix is to always
  // listen; the perf cost (one Firebase auth listener) is negligible.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    ensureAuth().then(({ auth, mod }) => {
      if (cancelled) return;
      unsubscribe = mod.onAuthStateChanged(auth, async user => {
        if (!user) {
          // Logout — clear local cart so the next visitor on a shared
          // device starts fresh. Order matters: nullify uidRef BEFORE
          // setItems([]) so the persist effect's `if (!uidRef.current)
          // return` guard fires and we don't wipe the logged-out user's
          // remote cart. Their items stay in /carts/{uid} for next login.
          const wasLoggedIn = uidRef.current !== null;
          uidRef.current = null;
          if (wasLoggedIn) setItems([]);
          return;
        }
        // New-user detection — if uidRef previously held a DIFFERENT
        // uid, we're switching users on a shared device. Clear local
        // cart so User A's items don't contaminate User B's remote
        // when User B's first cart change triggers a persist.
        //
        // CRITICAL: set the suppress window BEFORE the setItems([]) call.
        // setItems triggers the persist effect synchronously on the next
        // render with the NEW uid (already assigned to uidRef.current
        // above), and without the window, that effect commits an empty
        // items array to /carts/{newUserUid} — wiping User B's remote
        // cart before the getDoc below has a chance to merge it back.
        const prevUid = uidRef.current;
        uidRef.current = user.uid;
        if (prevUid && prevUid !== user.uid) {
          suppressUntilRef.current = Date.now() + SUPPRESS_WRITE_MS;
          setItems([]);
        }
        // Capture the uid this callback is for. After the await, if
        // uidRef.current has changed (rapid user switch on a shared
        // device), this response is stale — discard rather than
        // committing User A's remote cart into User B's session.
        const targetUid = user.uid;
        // Firestore can throw "client is offline" during the early
        // mount window — the SDK is initialised but the long-poll
        // handshake to firestore.googleapis.com hasn't completed
        // yet. Use the shared retry helper which handles backoff
        // and downgrades final failures to a soft `null` return.
        // The user keeps their local cart; the persist effect will
        // sync to /carts on their next cart action.
        const snap = await tryReadWithOfflineRetry(
          () => getDoc(doc(db, 'carts', targetUid)),
          '[useCartSync] /carts read',
          { cancelled: () => cancelled || uidRef.current !== targetUid },
        );
        if (cancelled || uidRef.current !== targetUid) return;
        if (snap && snap.exists()) {
          const remote: CartItem[] = snap.data().items ?? [];
          if (remote.length > 0) {
            suppressUntilRef.current = Date.now() + SUPPRESS_WRITE_MS;
            setItems(mergeCartItems(useCartStore.getState().items, remote));
          }
        }
      });
    }).catch(err => {
      console.error('[useCartSync] auth init failed:', err);
    });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
    // Phase 24 — empty deps (was [pathname, setItems]). The auth
    // listener should live for the lifetime of the mount, not tear
    // down on every navigation. setItems comes from a Zustand
    // selector — its identity is stable across renders, so it doesn't
    // need to be in deps either.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist to Firestore when items change (if logged in).
  //
  // We don't retry here — setDoc on a transient offline state will be
  // replayed automatically by the Firestore SDK once the connection
  // restores (Firestore's offline queue is the durability story for
  // writes). So we just log at warn level and move on. If the queue
  // overflows or there's a permission-denied error, those would
  // surface here — worth keeping the log so engineers see them in
  // production telemetry, but not as `error` since the typical case
  // is a benign transient.
  useEffect(() => {
    if (!uidRef.current) return;
    if (Date.now() < suppressUntilRef.current) return;
    setDoc(doc(db, 'carts', uidRef.current), { items, updatedAt: Date.now() })
      .catch(e => {
        const code = (e as { code?: string })?.code;
        if (code === 'unavailable' || (e as { message?: string })?.message?.includes?.('offline')) {
          // Firestore SDK retries this internally — no action needed.
          return;
        }
        console.warn('[useCartSync] cart persist failed:', e);
      });
  }, [items]);
}
