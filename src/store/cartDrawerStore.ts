/**
 * cartDrawerStore.ts
 * Tiny global store for the slide-in cart drawer.
 * Any component can call openCartDrawer() — ProductsPage, Navbar, etc.
 */
import { create } from 'zustand';

interface CartDrawerState {
  isOpen: boolean;
  open:  () => void;
  close: () => void;
  toggle: () => void;
}

export const useCartDrawer = create<CartDrawerState>()(set => ({
  isOpen: false,
  open:   () => set({ isOpen: true }),
  close:  () => set({ isOpen: false }),
  toggle: () => set(s => ({ isOpen: !s.isOpen })),
}));
