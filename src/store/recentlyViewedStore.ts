/**
 * recentlyViewedStore — Phase 11.1.
 *
 * Cheap, high-perceived-value: track the last 10 teas the user
 * viewed and surface them on / (home), in the cart-drawer empty
 * state, and on /cart empty state.
 *
 * Why localStorage and not Firestore: the value is short-lived
 * (a single browsing session), client-only, and 100% per-device
 * (someone using a shared family iPad shouldn't see another
 * household member's history). No PII concern.
 *
 * Why Zustand and not useState: many components (HomePage,
 * CartDrawer, CartPage) need to read the list reactively. A store
 * means they all subscribe to the same source of truth without
 * prop-drilling.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const MAX_ENTRIES = 10;

export interface RecentlyViewedEntry {
  /** Tea slug. Used to build the link back to /tea-profile/.../slug. */
  slug:     string;
  /** Tea name — denormalized so the surface can render even if the
   *  product cache hasn't loaded yet (cold-start on home). */
  name:     string;
  /** Category id (matches TEA_CATEGORIES). Needed for the URL. */
  category: string;
  /** Image URL, denormalized for the same cold-start reason. */
  image:    string;
  /** Price in cents at time of view. Display only — purchase price
   *  is always re-fetched from /teas/{slug}. */
  priceAtView: number;
  /** Timestamp (Date.now()) for sorting newest-first. */
  viewedAt: number;
}

interface RecentlyViewedState {
  entries: RecentlyViewedEntry[];
  /** Record a view. Adds to front, removes any prior entry with the
   *  same slug (so the list never duplicates), caps at MAX_ENTRIES. */
  record: (entry: Omit<RecentlyViewedEntry, 'viewedAt'>) => void;
  /** Clear all entries — exposed for the AccountPage "Privacy"
   *  control. */
  clear:  () => void;
}

export const useRecentlyViewed = create<RecentlyViewedState>()(
  persist(
    (set) => ({
      entries: [],
      record: (entry) =>
        set((state) => {
          const now = Date.now();
          const filtered = state.entries.filter((e) => e.slug !== entry.slug);
          const next = [{ ...entry, viewedAt: now }, ...filtered].slice(0, MAX_ENTRIES);
          return { entries: next };
        }),
      clear: () => set({ entries: [] }),
    }),
    {
      name: 'bakery_recently_viewed_v1',
      storage: createJSONStorage(() => localStorage),
      // Don't migrate from v0 — there's no v0. Bumping the key
      // version is the migration path if the entry shape ever changes.
      version: 1,
    },
  ),
);
