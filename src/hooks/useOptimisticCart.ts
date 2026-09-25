/**
 * useOptimisticCart.ts — React 19 useOptimistic for instant UI feedback
 *
 * When a user clicks "Add to Cart", the item appears instantly in the UI
 * via optimistic update, while Firebase persists in the background.
 * If persistence fails, the update is rolled back automatically.
 *
 * React 19 makes this trivial with the built-in useOptimistic hook.
 */
import { useOptimistic, useTransition } from 'react';
import { useCartStore, type CartItem, GST_RATE, type AddToCartResult } from '@/store/cartStore';

export function useOptimisticCart() {
  // Subscribe only to the bits we actually read/return. Using the full store
  // would re-run this hook on every unrelated state change.
  const items          = useCartStore(s => s.items);
  const addToCart      = useCartStore(s => s.addToCart);
  const removeFromCart = useCartStore(s => s.removeFromCart);
  const updateQuantity = useCartStore(s => s.updateQuantity);
  const clearCart      = useCartStore(s => s.clearCart);

  const [isPending, startTransition] = useTransition();

  // Optimistic items — shows updated state before Firebase confirms
  const [optimisticItems, addOptimistic] = useOptimistic(
    items,
    (state: CartItem[], newItem: CartItem) => {
      const idx = state.findIndex(i => i.id === newItem.id);
      if (idx >= 0) {
        return state.map((i, j) =>
          j === idx ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...state, newItem];
    }
  );

  const addToCartOptimistic = (item: Omit<CartItem, 'quantity'>): AddToCartResult => {
    // R3 Bugs #11 + #12 follow-through: forward the store's result so
    // callers of this hook can also guard their UX (toast / drawer
    // open) on rejection.
    //
    // We commit to the store FIRST (synchronously) so the rejection
    // shape is captured immediately. Only show the optimistic update
    // when the store accepted the add — pre-emptively flashing a
    // sold-out item into the cart would be a worse UX than the
    // microsecond delay before the real items render.
    const result = addToCart(item);
    if (result.added) {
      startTransition(() => {
        addOptimistic({ ...item, quantity: 1 });
      });
    }
    return result;
  };

  const totalItems = optimisticItems.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = optimisticItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalGst   = optimisticItems.reduce((s, i) =>
    s + (i.gstApplicable ? i.price * i.quantity * GST_RATE : 0), 0
  );

  return {
    items:         optimisticItems,
    isPending,
    addToCart:     addToCartOptimistic,
    removeFromCart,
    updateQuantity,
    clearCart,
    totalItems,
    totalPrice,
    totalGst,
  };
}
