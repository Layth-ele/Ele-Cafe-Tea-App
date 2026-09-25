export type WishlistTodoPriority = 'P0' | 'P1' | 'P2';

export interface WishlistTodoItem {
  id: string;
  title: string;
  priority: WishlistTodoPriority;
  area: 'ui' | 'ux' | 'data' | 'a11y' | 'perf';
  done: boolean;
  notes: string;
}

/**
 * Wishlist TODO backlog
 *
 * Kept near the wishlist page module to match app page structure.
 * This file is intentionally code-first (not markdown) so items can
 * be imported into tooling or surfaced in an admin/dev view later.
 */
export const WISHLIST_TODO: WishlistTodoItem[] = [
  {
    id: 'wl-ui-001',
    title: 'Add wishlist sort controls',
    priority: 'P1',
    area: 'ui',
    done: false,
    notes: 'Support newest, price-low-high, and alphabetical modes.',
  },
  {
    id: 'wl-ux-002',
    title: 'Add shared-wishlist owner label',
    priority: 'P2',
    area: 'ux',
    done: false,
    notes: 'Show “Shared by {name}” when token includes optional owner metadata.',
  },
  {
    id: 'wl-data-003',
    title: 'Track wishlist analytics events',
    priority: 'P1',
    area: 'data',
    done: false,
    notes: 'Emit add/remove/share events for product affinity and growth reporting.',
  },
  {
    id: 'wl-a11y-004',
    title: 'Announce add/remove state via live region',
    priority: 'P0',
    area: 'a11y',
    done: false,
    notes: 'Add aria-live feedback for heart toggles in addition to visual toast.',
  },
  {
    id: 'wl-perf-005',
    title: 'Prefetch wishlist route chunk on likely paths',
    priority: 'P2',
    area: 'perf',
    done: false,
    notes: 'Add wishlist to prefetch registry and navbar/footer path map.',
  },
];
