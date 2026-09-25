/**
 * cartStore.ts — Zustand store replaces CartContext
 *
 * Why Zustand wins here:
 * - No Provider wrapper needed
 * - Any component reads cart state directly without prop drilling
 * - Immer integration makes updates cleaner
 * - persist middleware handles localStorage automatically
 *
 * Firebase sync (Firestore) is kept in a separate hook (useCartSync)
 * so the store itself stays pure and testable.
 *
 * Usage: const { items, addToCart, totalItems } = useCartStore();
 *
 * ── Bundle support (Day 16) ───────────────────────────────────────────────
 * A cart line item can carry an optional `bundle` blob describing a
 * gift-builder bundle (recipient, sender, message, the teas inside).
 * Bundles are NEVER merged with other items — each bundle gets a unique
 * `id: 'bundle-{uuid}'` so its quantity stays at 1 and its personalization
 * is preserved separately. This keeps the line-item shape flat (no
 * discriminated union) while letting the cart drawer and checkout render
 * bundles distinctly when `item.bundle` is present.
 */
import { create }        from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer }         from 'zustand/middleware/immer';
import { toast }         from 'sonner';
import { useCartDrawer } from '@/store/cartDrawerStore';
import { validateCart }  from '@/schemas/cart.schema';

import { currentLang, tNow } from '@/i18n/useT';
// ── Bundle line-item metadata ──────────────────────────────────────────────
// Lives ON a CartItem when that item represents a gift-builder bundle.
// Regular tea items leave this undefined.
export interface BundleLineItemTea {
  id:    string;
  name:  string;
  image: string;
  /** Origin string for the "from {origin}" subtitle in the cart drawer. */
  origin?: string;
}
export interface BundleLineItemMeta {
  /** Bundle tier slug — see app/components/gift-builder/data/bundles.ts */
  slug:        string;
  /** Display name like "Trio" or "Deluxe". */
  name:        string;
  teas:        BundleLineItemTea[];
  samples:     BundleLineItemTea[];
  hasFrenchPress: boolean;
  personalization: {
    recipientName:  string;
    senderName:     string;
    occasion:       string;       // OccasionId or '' or custom-from-Other
    customOccasion: string;
    message:        string;
    deliveryDate:   string | null;
  };
}

export interface CartItem {
  id:             string;
  name:           string;
  /** French tea name from the product (nameFr) — shown when the site is in
   *  French; see cartItemName(). Orders keep the English `name`. */
  nameFr?:        string;
  price:          number;
  quantity:       number;
  image:          string;
  category?:      string;
  /**
   * Per-item stock cap, copied from the product at add-time. The store
   * uses this to refuse increments past the available stock so
   * customers can't build a cart that the server-side stock check
   * (onOrderWrite) will reject. Optional — items without a stock value
   * (e.g. bundles) are uncapped and rely on the store-level rules.
   */
  stock?:         number;
  /**
   * Carried from the product. True only for non-food / taxable items.
   * Tea is zero-rated in Canada so this defaults to false. Bundles are
   * mostly tea + a French press; we keep them zero-rated to match the
   * existing tea policy. If GST policy on bundles changes, flip the
   * default in addBundle() below — admin will see correct totals
   * immediately because totalGst is derived per-item.
   */
  gstApplicable?: boolean;
  /**
   * Present iff this line item is a gift-builder bundle. Optional so
   * existing tea consumers (ProductsPage TeaCard, OrdersPage, admin
   * AdminOrders) keep working without changes.
   */
  bundle?:        BundleLineItemMeta;
}

/** The line's name in the given language (French name when available). */
export const cartItemName = (item: Pick<CartItem, 'name' | 'nameFr'>, lang: 'en' | 'fr'): string =>
  lang === 'fr' && item.nameFr?.trim() ? item.nameFr : item.name;

// Global GST rate applied to gstApplicable items (5% federal)
export const GST_RATE = 0.05;

// Centralised recalc so addToCart / removeFromCart / updateQuantity / setItems
// all stay in sync. Takes a state-like object and mutates its derived totals.
function recomputeTotals(state: { items: CartItem[]; totalItems: number; totalPrice: number; totalGst: number }) {
  state.totalItems = state.items.reduce((s, i) => s + i.quantity, 0);
  state.totalPrice = state.items.reduce((s, i) => s + i.price * i.quantity, 0);
  state.totalGst   = state.items.reduce((s, i) => s + (i.gstApplicable ? i.price * i.quantity * GST_RATE : 0), 0);
}

function normalizeCartItems(items: unknown[]): CartItem[] {
  return items.map((raw) => {
    const item = raw as Partial<CartItem> & { bundle?: unknown };
    return {
      ...(item as Partial<CartItem>),
      image: item.image ?? '',
    } as CartItem;
  });
}

/** Input shape for `addBundle`. Pulled out for typing clarity. */
export interface AddBundleInput extends BundleLineItemMeta {
  price: number;
  image: string;
}

// R3 Bugs #11 + #12: addToCart returns a result so callers can guard
// their success toasts and side-effects (cart drawer open, "added"
// toast, etc.). The store still emits its own info/error toasts for
// failure paths so the user gets ONE consistent feedback signal —
// callers should now skip emitting their own success toast when
// `added === false`.
export type AddToCartResult =
  | { added: true }
  | { added: false; reason: 'sold-out' | 'cap-reached' };

type CartSetter = (fn: (state: CartState) => void) => void;
type CartGetter = () => CartState;

export interface CartState {
  items:          CartItem[];
  addToCart:      (item: Omit<CartItem, 'quantity'>) => AddToCartResult;
  /**
   * Add a gift-builder bundle as a single, unique cart line item.
   * Generates a fresh UUID-based id so multiple bundles don't merge,
   * and so re-adding the same tier creates a separate gift order.
   * Returns the generated line-item id so the caller can scroll to it
   * or open a "view bundle" expander.
   */
  addBundle:      (input: AddBundleInput) => string;
  removeFromCart: (id: string)               => void;
  updateQuantity: (id: string, qty: number)  => void;
  clearCart:      ()                         => void;
  setItems:       (items: CartItem[])        => void;   // used by Firebase sync
  /** Bring tea lines in line with the live catalogue (price, French
   *  name, GST flag). Returns how many line prices changed. Bundles are
   *  priced by tier and left alone. */
  syncWithCatalog: (catalog: Array<{ id?: string; price?: number; nameFr?: string | null; gstApplicable?: boolean }>) => number;
  totalItems:     number;
  totalPrice:     number;
  /** GST amount on GST-applicable items only (0 for most tea orders) */
  totalGst:       number;
}

// Generate a unique id for bundle line items. crypto.randomUUID is
// available in all evergreen browsers and Node 19+. The fallback
// shim covers older Safari just in case — but it must still produce
// IDs that are unique within a session even on rapid back-to-back
// addBundle calls. Date.now() granularity is millisecond, so two
// adds in the same millisecond would collide on the time portion;
// we layer crypto.getRandomValues (cryptographically random, 64 bits)
// over the timestamp so the chance of a same-tick collision is 2^-64.
function bundleId(): string {
  const cryptoObj = (typeof crypto !== 'undefined' ? crypto : undefined) as
    (Crypto & { randomUUID?: () => string }) | undefined;
  if (cryptoObj?.randomUUID) {
    return `bundle-${cryptoObj.randomUUID()}`;
  }
  // Old-Safari fallback: 8 random bytes as hex + millisecond timestamp.
  // Combined entropy is well above any practical collision threshold
  // for a single browsing session.
  let randomHex = '';
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(8);
    cryptoObj.getRandomValues(bytes);
    randomHex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // True last-resort: Math.random. Not cryptographic, but for cart
    // ID purposes the uniqueness requirement is "no collision in this
    // tab's lifetime" which Math.random handles fine.
    randomHex = Math.random().toString(36).slice(2, 14)
              + Math.random().toString(36).slice(2, 14);
  }
  return `bundle-${Date.now().toString(36)}-${randomHex}`;
}

const cartStoreCreator = (set: CartSetter, get: CartGetter): CartState => ({
      items: [],

      addToCart: (item: Omit<CartItem, 'quantity'>) => {
        // R3 Bugs #11 + #12: surface the outcome to the caller so the
        // page-level "added" toast and `openCartDrawer()` calls can
        // skip on rejection. The store keeps emitting its own info/
        // error toast for the rejection path so the failure feedback
        // is consistent across every consumer (drawer, product page,
        // checkout) without each component duplicating the logic.
        const existing = get().items.find(i => i.id === item.id);
        if (existing) {
          const cap = typeof existing.stock === 'number' ? existing.stock : Infinity;
          if (existing.quantity >= cap) {
            toast.info(tNow('Only {count} of “{name}” available.', { count: cap, name: cartItemName(existing, currentLang()) }));
            return { added: false, reason: 'cap-reached' };
          }
        } else {
          if (typeof item.stock === 'number' && item.stock <= 0) {
            toast.error(tNow('“{name}” is sold out.', { name: cartItemName(item, currentLang()) }));
            return { added: false, reason: 'sold-out' };
          }
        }
        set((state: CartState) => {
          const idx = state.items.findIndex(i => i.id === item.id);
          if (idx >= 0) {
            const cur = state.items[idx];
            const cap = typeof cur.stock === 'number' ? cur.stock : Infinity;
            if (cur.quantity < cap) state.items[idx].quantity += 1;
          } else {
            state.items.push({ ...item, quantity: 1 });
          }
          recomputeTotals(state);
        });
        // The single "added" confirmation for every Add button (the cart
        // drawer never opens by itself — shoppers keep browsing):
        // "View cart" opens the drawer, "Undo" reverts. One toast id, so
        // quick repeat adds replace it instead of stacking.
        // Phase 5.3: undo. The undo handler
        // mirrors removeFromCart but takes the local snapshot so it
        // works even after the item's quantity has further changed
        // (we restore the PRE-add quantity, not zero). For brand-new
        // items (no existing row), undo just removes the line.
        const wasNewItem = !existing;
        const prevQty    = existing?.quantity ?? 0;
        toast.success(tNow('{name} added to cart', { name: cartItemName(item, currentLang()) }), {
          id: 'cart-added',
          action: {
            label: tNow('View cart'),
            onClick: () => useCartDrawer.getState().open(),
          },
          cancel: {
            label: tNow('Undo'),
            onClick: () => {
              set((state: CartState) => {
                const idx = state.items.findIndex(i => i.id === item.id);
                if (idx < 0) return;
                if (wasNewItem) {
                  state.items.splice(idx, 1);
                } else {
                  state.items[idx].quantity = prevQty;
                }
                recomputeTotals(state);
              });
            },
          },
        });
        return { added: true };
      },

      addBundle: (input: AddBundleInput) => {
        // Always generate a fresh per-instance ID. Two adds of the
        // "same bundle" produce two distinct line items (different
        // recipients, different messages) and must NOT merge — that's
        // the bundle invariant.
        //
        // We also guard against an existing line item happening to
        // collide with our new id: cart sync round-trips a bundle
        // back from Firestore preserving its original id, then a
        // local addBundle re-using that id would conflict with the
        // store's ordinary findIndex(i => i.id === item.id) logic.
        // Since `id` here is freshly minted and unique by construction
        // (UUID + millisecond time fallback), the worst-case is a
        // 1-in-2^64 collision. Belt-and-braces: regenerate if we
        // somehow hit one.
        let id = bundleId();
        const existingIds = new Set(get().items.map(i => i.id));
        let attempts = 0;
        while (existingIds.has(id) && attempts < 5) {
          id = bundleId();
          attempts++;
        }
        // Bundle blob = everything except the price/image which become
        // the line-item's price/image. The rest goes under .bundle.
        const { price, image, ...bundleMeta } = input;
        set((state: CartState) => {
          state.items.push({
            id,
            name:           input.name,
            price,
            quantity:       1,
            image,
            category:       'gift-bundle',
            gstApplicable:  false,
            bundle:         bundleMeta as BundleLineItemMeta,
          });
          recomputeTotals(state);
        });
        return id;
      },

      removeFromCart: (id: string) => {
        // Phase 5.3: snapshot the removed item BEFORE mutation so
        // the undo callback can restore exactly what was there
        // (preserving the quantity, the bundle metadata, etc).
        const removed = get().items.find(i => i.id === id);
        set((state: CartState) => {
          state.items = state.items.filter(i => i.id !== id);
          recomputeTotals(state);
        });
        if (removed) {
          toast.success(tNow('Removed “{name}”', { name: cartItemName(removed, currentLang()) }), {
            action: {
              label: tNow('Undo'),
              onClick: () => {
                set((state: CartState) => {
                  // If a different line was added in the meantime
                  // with the same id (rare — only happens for non-
                  // bundle items where the id is the product id),
                  // we restore the prior snapshot's quantity.
                  const existingIdx = state.items.findIndex(i => i.id === removed.id);
                  if (existingIdx >= 0) {
                    state.items[existingIdx] = removed;
                  } else {
                    state.items.push(removed);
                  }
                  recomputeTotals(state);
                });
              },
            },
          });
        }
      },

      updateQuantity: (id: string, qty: number) => {
        if (qty <= 0) { get().removeFromCart(id); return; }
        // Bundles are a fixed-quantity-1 product. Silently ignore qty
        // changes on bundle lines so the cart drawer stepper can't
        // accidentally turn one $35 bundle into ten.
        const item = get().items.find(i => i.id === id);
        if (item?.bundle) return;
        // R2 Bug #15: detect the clamp and toast the user. Previously
        // typing "10" into a quantity input where stock=5 silently
        // snapped the value down to 5 with no feedback — looked like
        // a UI glitch. Toast before mutating.
        if (item) {
          const cap = typeof item.stock === 'number' ? item.stock : Infinity;
          if (qty > cap) {
            toast.info(tNow('Only {count} of “{name}” available — set to {count}.', { count: cap, name: cartItemName(item, currentLang()) }));
          }
        }
        set((state: CartState) => {
          const it = state.items.find(i => i.id === id);
          if (it) {
            // Respect stock cap (if known). Customer cannot push qty
            // above available stock — the server-side check would
            // reject the order anyway, so we save them the trip.
            const cap = typeof it.stock === 'number' ? it.stock : Infinity;
            it.quantity = Math.min(qty, cap);
          }
          recomputeTotals(state);
        });
      },

      clearCart: () => set((state: CartState) => { state.items = []; state.totalItems = 0; state.totalPrice = 0; state.totalGst = 0; }),

      setItems: (items: CartItem[]) => set((state: CartState) => {
        const parsed = validateCart({ items });
        state.items = parsed.success ? normalizeCartItems(parsed.data.items) : [];
        recomputeTotals(state);
      }),

      syncWithCatalog: (catalog) => {
        let changed = 0;
        const byId = new Map(catalog.filter((p) => p.id).map((p) => [p.id as string, p]));
        set((state: CartState) => {
          for (const item of state.items) {
            if (item.bundle) continue;
            const live = byId.get(item.id);
            if (!live) continue;
            if (typeof live.price === 'number' && live.price > 0 && Math.abs(live.price - item.price) > 0.001) {
              item.price = live.price;
              changed++;
            }
            if (live.nameFr && live.nameFr !== item.nameFr) item.nameFr = live.nameFr;
            if (typeof live.gstApplicable === 'boolean') item.gstApplicable = live.gstApplicable;
          }
          if (changed) recomputeTotals(state);
        });
        return changed;
      },

      // NOTE: derived — kept on state for cheap reads. Always recomputed via
      // recomputeTotals() after every mutation, and also re-derived on rehydrate
      // (see onRehydrateStorage below) so they never drift from `items`.
      totalItems: 0,
      totalPrice: 0,
      totalGst:   0,
    });

export const useCartStore = create<CartState>()(
  persist(
    immer(cartStoreCreator),
    {
      name:    'cart',
      storage: createJSONStorage(() => localStorage),
      // Persist only the source of truth — derived totals are recomputed on rehydrate.
      // This prevents stale totals surviving across schema changes or hot reloads.
      partialize: (state: CartState) => ({ items: state.items }) as CartState,
      onRehydrateStorage: () => (state: CartState | undefined) => {
        if (!state) return;
        const parsed = validateCart({ items: state.items });
        state.items = parsed.success ? normalizeCartItems(parsed.data.items) : [];
        recomputeTotals(state);
      },
    },
  ),
);

// ── Backward-compatible hook — matches the old useCart() API ──────────────
// Existing pages that import { useCartStore as useCart } from '@/store/cartStore'
// can be updated to import from this file with no other changes.
export const useCart = useCartStore;
