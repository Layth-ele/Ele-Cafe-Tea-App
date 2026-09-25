/**
 * useWishlistSync — Phase 11.4 sync hook.
 *
 * Mounts at app shell level. Watches auth state and:
 *
 *   - On sign-in: read /users/{uid}/wishlist/{slug} subcollection,
 *     merge with local Zustand state (union of slugs; local wins on
 *     conflicting fields like the priceAtSave snapshot since the
 *     local one is more recent). Write any local-only entries up to
 *     Firestore so the cross-device sync completes both directions.
 *
 *   - On any subsequent local change: debounce 800ms, then write
 *     the diff to Firestore. The debounce prevents a chain of
 *     add/remove clicks from spamming Firestore writes.
 *
 *   - On sign-out: the previous user's wishlist stays in localStorage
 *     (people share devices; clearing on sign-out would be hostile).
 *     The next sign-in of a different user merges THAT user's
 *     remote list onto whatever local state remains. If you want
 *     strict isolation you opt into it via the AccountPage Privacy
 *     control.
 *
 * Why a subcollection per slug (vs a single doc with an items
 * array): allows targeted reads/writes, sidesteps the 1 MB doc
 * size cap, and lets a low-stock CF query "who has slug X
 * wishlisted?" with a collectionGroup query.
 */
import { useEffect, useRef } from 'react';
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useWishlist } from '@/store/wishlistStore';
import type { WishlistItem } from '@/store/wishlistStore';

const DEBOUNCE_MS = 800;

/** What counts as a change worth writing: a re-add or a notify toggle. */
const syncKey = (i: WishlistItem) => `${i.addedAt}:${i.notify === true}`;

export function useWishlistSync() {
  const { currentUser: user } = useAuth();
  const items = useWishlist((s) => s.items);
  const replaceAll = useWishlist((s) => s.replaceAll);

  // Track what was last synced so we only write the diff.
  const lastSyncedRef = useRef<Map<string, string>>(new Map());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialMergeDoneRef = useRef<string | null>(null);
  const lowStockAutoEnabledRef = useRef<string | null>(null);

  const ensureBackInStockPreference = async (uid: string, itemCount: number) => {
    if (!uid || itemCount <= 0) return;
    if (lowStockAutoEnabledRef.current === uid) return;
    try {
      const prefRef = doc(db, 'users', uid, 'preferences', 'notifications');
      const snap = await getDoc(prefRef);
      if (!snap.exists()) {
        await setDoc(prefRef, {
          lowStock: true,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        lowStockAutoEnabledRef.current = uid;
        return;
      }
      lowStockAutoEnabledRef.current = uid;
    } catch (err) {
      // Non-fatal — if prefs can't be written we still keep the wishlist.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[wishlistSync] failed to auto-enable back-in-stock preference', err);
      }
    }
  };

  // Initial merge on sign-in.
  useEffect(() => {
    if (!user?.uid) {
      // Signed out: forget the last-synced map but leave the local
      // store alone. See module doc.
      lastSyncedRef.current.clear();
      initialMergeDoneRef.current = null;
      lowStockAutoEnabledRef.current = null;
      return;
    }

    // Only run the initial merge once per uid (re-renders of the
    // user object don't re-trigger).
    if (initialMergeDoneRef.current === user.uid) return;
    initialMergeDoneRef.current = user.uid;

    (async () => {
      try {
        const col = collection(db, 'users', user.uid, 'wishlist');
        const snap = await getDocs(col);
        const remote: WishlistItem[] = [];
        snap.forEach((d) => {
          const data = d.data();
          remote.push({
            slug:        d.id,
            name:        data.name        ?? '',
            category:    data.category    ?? '',
            image:       data.image       ?? '',
            priceAtSave: typeof data.priceAtSave === 'number' ? data.priceAtSave : 0,
            addedAt:     typeof data.addedAtMs === 'number'    ? data.addedAtMs   : Date.now(),
            notify:      data.notify === true,
          });
        });

        // Union by slug. Local snapshot wins on conflicting fields
        // (more recent client write).
        const localBySlug = new Map(useWishlist.getState().items.map((i) => [i.slug, i]));
        const remoteBySlug = new Map(remote.map((i) => [i.slug, i]));
        const allSlugs = new Set<string>([...localBySlug.keys(), ...remoteBySlug.keys()]);
        const merged: WishlistItem[] = [];
        allSlugs.forEach((slug) => {
          const local = localBySlug.get(slug);
          const remoteItem = remoteBySlug.get(slug);
          // The server owns `notify` once a doc exists remotely: it
          // clears the flag after sending the back-in-stock email, and
          // a stale local `true` must not re-arm it.
          merged.push(local && remoteItem ? { ...local, notify: remoteItem.notify } : (local ?? remoteItem!));
        });
        // Newest-first.
        merged.sort((a, b) => b.addedAt - a.addedAt);
        replaceAll(merged);

        // Seed the last-synced map from remote so the next debounced
        // write only sends genuine deltas.
        lastSyncedRef.current = new Map([...remoteBySlug.values()].map((i) => [i.slug, syncKey(i)]));

        // First wishlist item = implicit opt-in to back-in-stock emails.
        // If the user already has a notifications doc we leave it alone;
        // if it doesn't exist yet, create it with lowStock=true so the
        // backend can actually send the alert promised in the UI.
        void ensureBackInStockPreference(user.uid, merged.length);
      } catch (err) {
        // Sync failure is non-fatal — the user keeps their local
        // wishlist. Log at debug level only; this is normal during
        // offline use.
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('[wishlistSync] initial merge failed', err);
        }
      }
    })();
  }, [user?.uid, replaceAll]);

  // Debounced upload of subsequent local changes.
  useEffect(() => {
    if (!user?.uid) return;
    if (initialMergeDoneRef.current !== user.uid) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      void ensureBackInStockPreference(user.uid, items.length);

      const localBySlug = new Map(items.map((i) => [i.slug, i]));
      const lastSlugs = lastSyncedRef.current;

      // Adds and updates.
      const adds: Array<Promise<void>> = [];
      localBySlug.forEach((item, slug) => {
        if (lastSlugs.get(slug) === syncKey(item)) return; // unchanged
        adds.push(
          setDoc(doc(db, 'users', user.uid, 'wishlist', slug), {
            slug,
            name:        item.name,
            category:    item.category,
            image:       item.image,
            priceAtSave: item.priceAtSave,
            addedAtMs:   item.addedAt,
            notify:      item.notify === true,
            updatedAt:   serverTimestamp(),
          }, { merge: true }).then(() => undefined),
        );
      });

      // Deletes.
      const deletes: Array<Promise<void>> = [];
      lastSlugs.forEach((_, slug) => {
        if (!localBySlug.has(slug)) {
          deletes.push(deleteDoc(doc(db, 'users', user.uid, 'wishlist', slug)).then(() => undefined));
        }
      });

      Promise.allSettled([...adds, ...deletes])
        .then(() => {
          // Update the last-synced snapshot.
          lastSyncedRef.current = new Map(items.map((i) => [i.slug, syncKey(i)]));
        })
        .catch((err) => {
          if (typeof console !== 'undefined' && console.debug) {
            console.debug('[wishlistSync] write batch failed', err);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [items, user?.uid]);
}
