/**
 * wishlistStore — Phase 11.4.
 *
 * Hearts. Persistent. Sharable.
 *
 * Storage strategy:
 *   - Anonymous user: localStorage only.
 *   - Logged-in user: localStorage + Firestore mirror at
 *     /users/{uid}/wishlist/{slug}.
 *
 * The sync is handled by useWishlistSync (hook), NOT inside this
 * store, because the store should be framework-agnostic and not
 * depend on Firebase at module init. The hook subscribes to auth
 * changes and reconciles the two stores.
 *
 * Sharing: /wishlist?s=<base64 of slugs[]> — read-only view of
 * someone else's list. The token is a plain encoding, not auth:
 * it's a share URL, not a security boundary. Recipients see the
 * shared list as "Your friend's wishlist" without overwriting their
 * own.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  createWishlistItemInputSchema,
  parseWishlistItem,
  parseWishlistShareSlugs,
  type WishlistItemSchema,
} from '@/schemas/wishlist.schema';

export type WishlistItem = WishlistItemSchema;

interface WishlistState {
  items: WishlistItem[];

  /** Whether the slug is in the wishlist. Memo-cheap because Zustand
   *  selectors only re-render when the returned value changes. */
  has: (slug: string) => boolean;

  /** Add to wishlist. Idempotent — adding a slug that's already
   *  present is a no-op (does not refresh the addedAt timestamp). */
  add: (item: Omit<WishlistItem, 'addedAt'>) => void;

  /** Remove from wishlist. Idempotent. */
  remove: (slug: string) => void;

  /** Toggle. Returns the new state ('added' | 'removed') so the UI
   *  can show the right confirmation toast. */
  toggle: (item: Omit<WishlistItem, 'addedAt'>) => 'added' | 'removed';

  /** Turn the back-in-stock email request on/off for a slug already in
   *  the list. No-op if the slug isn't present. */
  setNotify: (slug: string, notify: boolean) => void;

  /** Clear all — used during sign-out + on the AccountPage Privacy
   *  control. */
  clear: () => void;

  /** Replace all — used by the Firestore sync hook to reconcile
   *  remote state. */
  replaceAll: (items: WishlistItem[]) => void;
}

export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      has: (slug) => get().items.some((i) => i.slug === slug),
      add: (item) =>
        set((state) => {
          if (state.items.some((i) => i.slug === item.slug)) return state;
          const validInput = createWishlistItemInputSchema.safeParse(item);
          if (!validInput.success) return state;
          const next = parseWishlistItem({ ...validInput.data, addedAt: Date.now() });
          if (!next) return state;
          return { items: [next, ...state.items] };
        }),
      remove: (slug) =>
        set((state) => ({ items: state.items.filter((i) => i.slug !== slug) })),
      toggle: (item) => {
        const present = get().has(item.slug);
        if (present) {
          get().remove(item.slug);
          return 'removed';
        }
        get().add(item);
        return 'added';
      },
      setNotify: (slug, notify) =>
        set((state) => ({
          items: state.items.map((i) => (i.slug === slug ? { ...i, notify } : i)),
        })),
      clear: () => set({ items: [] }),
      replaceAll: (items) => set({ items }),
    }),
    {
      name: 'bakery_wishlist_v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

/**
 * Encode the wishlist for sharing. Output is a URL-safe base64 of
 * the slugs list. Caller appends as `?s=<token>` to the /wishlist
 * route. The receiver decodes via parseWishlistShareToken below.
 *
 * Why slugs only and not the full snapshot:
 *  - Names and images can change; sharing should reflect current
 *    catalog state at view time, not at share time.
 *  - Slugs alone are short — typically 12-30 chars each — so a list
 *    of 10 fits in well under URL length limits.
 *  - The view-side resolver looks each slug up in the products
 *    cache. Slugs the receiver's catalog can't resolve (deactivated
 *    teas) are silently dropped from the view.
 */
export function encodeWishlistShareToken(slugs: string[]): string {
  const json = JSON.stringify(slugs);
  // btoa is fine here — we control the input format.
  const b64 = btoa(unescape(encodeURIComponent(json)));
  // URL-safe variant: replace + / =
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function parseWishlistShareToken(token: string): string[] | null {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    // Re-pad to a multiple of 4.
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json);
    return parseWishlistShareSlugs(parsed);
  } catch (err) {
    console.warn('[wishlistStore] Failed to parse share token:', err);
    return null;
  }
}
