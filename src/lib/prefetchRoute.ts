/**
 * prefetchRoute.ts — Phase 4.4 of the UI/UX roadmap
 *
 * Predictive prefetching for lazy-loaded route chunks.
 *
 * The problem:
 *   Every page is `React.lazy(() => import('./pages/X'))`. The
 *   chunk only loads on FIRST render of that route, which means
 *   when a user clicks a nav link they see a Suspense skeleton
 *   while the chunk downloads. On a fast connection that's 50-150
 *   ms — perceptible but not a deal-breaker. On a slow connection
 *   it's 500-1500 ms and the perceived latency is real.
 *
 * The solution:
 *   When a user HOVERS a link (or it enters the viewport), pre-
 *   trigger the chunk import. By the time they click, the chunk
 *   is already cached and the navigation feels instant.
 *
 * Why this is cheap:
 *   - import() is idempotent — calling it twice deduplicates.
 *   - We only register hover listeners once per route entry.
 *   - We respect `navigator.connection.saveData` — no prefetch on
 *     metered or data-saver connections, where the cost outweighs
 *     the benefit.
 *
 * Why a dedicated registry (and not just `prefetch` on Link):
 *   react-router 7's <Link prefetch> is data-router-only at the
 *   time of writing. The project uses BrowserRouter (data router
 *   migration is out of scope here), so we roll our own.
 *
 * Usage:
 *   1. Register the lazy chunk in the registry below — same
 *      `() => import(...)` shape as the route's lazy() call. Both
 *      hands point at the same module, so Vite's chunk graph
 *      deduplicates and the prefetch hits the cache the route
 *      itself will pull from.
 *
 *   2. In a Link / NavLink, attach the hover prefetcher:
 *
 *        <Link to={ROUTES.PRODUCTS} {...usePrefetch('products')}>
 *          Teas
 *        </Link>
 *
 *      `usePrefetch` returns event handlers (onMouseEnter, onFocus,
 *      onTouchStart) that all trigger the same prefetch — desktop
 *      hover, keyboard focus, and mobile touch all warm the chunk.
 *
 * Limits:
 *   - Each registered route prefetches at most ONCE per session.
 *   - Save-data and slow-connection users skip prefetch entirely.
 *   - SSR / no-window guard keeps this from blowing up in non-
 *     browser environments.
 */

type LazyImporter = () => Promise<unknown>;

/* ── Registry ─────────────────────────────────────────────────────────────
 * Keys are short stable IDs aligned with App.tsx lazy route targets.
 * Use stable canonical module specifiers (we standardize on `@/`)
 * so route lazy-imports and prefetch imports resolve to the same
 * module IDs/chunks in Vite.
 */
const REGISTRY: Record<string, LazyImporter> = {
  // Customer-facing primary nav targets.
  home:        () => import('@/app/pages/HomePage'),
  products:    () => import('@/app/pages/ProductsPage'),
  teaProfile:  () => import('@/app/pages/TeaProfilePage'),
  cart:        () => import('@/app/pages/CartPage'),
  gifts:       () => import('@/app/pages/GiftsPage'),
  pairings:    () => import('@/app/pages/ComboPairingPage'),

  // Auth flows.
  login:       () => import('@/app/pages/LoginPage'),
  signup:      () => import('@/app/pages/SignupPage'),

  // Auth-required.
  checkout:    () => import('@/app/pages/CheckoutPage'),
  orders:      () => import('@/app/pages/OrdersPage'),
  account:     () => import('@/app/pages/AccountPage'),
  wishlist:    () => import('@/app/pages/WishlistPage'),

  // Inventory employee path. Called from the access modal during the
  // success-hold so the chunk is warm by the time the guard commits
  // the session and reveals the page (no skeleton flash).
  inventory:   () => import('@/app/pages/InventoryPage'),

  // Footer info.
  about:       () => import('@/app/pages/info/AboutPage'),
  contact:     () => import('@/app/pages/info/ContactPage'),
  shipping:    () => import('@/app/pages/info/ShippingPolicyPage'),
  refund:      () => import('@/app/pages/info/RefundPolicyPage'),
  privacy:     () => import('@/app/pages/info/PrivacyPolicyPage'),
};

/** Per-session set of route IDs already prefetched, so the second
 *  hover doesn't fire a redundant import. */
const fired = new Set<string>();

/** Best-effort detector for "user is on a slow / metered connection
 *  and would NOT thank us for prefetching." Honored even on a paid
 *  connection if save-data is on. */
function shouldSkipPrefetch(): boolean {
  if (typeof navigator === 'undefined') return true;
  const conn = (navigator as unknown as {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
  if (!conn) return false;                   // no API → assume OK
  if (conn.saveData) return true;            // user-opted-in data-saver
  if (conn.effectiveType === 'slow-2g') return true;
  if (conn.effectiveType === '2g') return true;
  return false;
}

/** Trigger a route's chunk to start downloading. Idempotent + safe.
 *  Fire-and-forget — we don't await the import, the route will
 *  re-await whichever module Vite has cached. */
export function prefetchRoute(id: keyof typeof REGISTRY): void {
  if (typeof window === 'undefined') return;
  if (shouldSkipPrefetch()) return;
  if (fired.has(id)) return;
  const importer = REGISTRY[id];
  if (!importer) {
    if (import.meta.env.DEV) {
      console.warn(`[prefetchRoute] unknown route id: ${String(id)}`);
    }
    return;
  }
  fired.add(id);
  // Fire and forget. The promise rejection (offline, network blip)
  // is silently swallowed — we tried to prefetch, it didn't work,
  // the route will re-attempt on real navigation.
  importer().catch(() => { /* drop */ });
}

/** Returns event handlers you can spread onto a <Link> /
 *  <NavLink> / button. Triggers prefetchRoute on hover, focus, or
 *  the first touch (so mobile users get a chunk warmup the moment
 *  their finger touches the link, before the click event fires).
 *
 *  Note: this is a plain factory, not a React hook. Earlier drafts
 *  named it `usePrefetch` which tripped the rules-of-hooks linter
 *  inside `.map()` calls — it never actually called any hooks
 *  internally, so the rename to `prefetchHandlers` removes the
 *  false-positive without changing behavior. */
export function prefetchHandlers(id: keyof typeof REGISTRY) {
  const onTrigger = () => prefetchRoute(id);
  return {
    onMouseEnter: onTrigger,
    onFocus:      onTrigger,
    onTouchStart: onTrigger,
  };
}

/** Map a route path to the registry key it represents. Used by
 *  Navbar where the link's `to=` is the path; we look up the key
 *  to fire the right prefetch. */
const PATH_TO_ID: Record<string, keyof typeof REGISTRY> = {
  '/':          'home',
  '/products':  'products',
  '/cart':      'cart',
  '/gifts':     'gifts',
  '/login':     'login',
  '/signup':    'signup',
  '/checkout':  'checkout',
  '/orders':    'orders',
  '/account':   'account',
  '/wishlist':  'wishlist',
  '/about':     'about',
  '/contact':   'contact',
};
export function prefetchHandlersForPath(path: string) {
  const id = PATH_TO_ID[path];
  if (!id) return {};
  return prefetchHandlers(id);
}

/** Eagerly warm the most-likely-next routes from a given page. Use
 *  in a `useEffect(() => prefetchRoutesForPage('home'), [])` to run
 *  AFTER the current route's render is done.
 *
 *  This is the "I'm idle, what's next?" prefetch — distinct from
 *  the `usePrefetch` hover prefetch which is "user signaled
 *  interest in THIS specific link." */
const VIEWPORT_PREFETCHES: Partial<Record<string, Array<keyof typeof REGISTRY>>> = {
  home:    ['products', 'gifts'],          // top of funnel → catalog or gifting
  products:['teaProfile', 'cart', 'wishlist'], // browsing → detail/cart/wishlist save flow
  cart:    ['checkout', 'login'],          // cart → conversion path (auth or checkout)
  account: ['orders', 'wishlist'],         // account area often branches into order history/wishlist
};

export function prefetchRoutesForPage(currentPage: string): void {
  if (typeof window === 'undefined') return;
  // requestIdleCallback isn't on Safari; setTimeout 1s is the safe
  // fallback. Either way: don't compete with the current page's
  // initial render for the main thread.
  const fire = () => {
    const list = VIEWPORT_PREFETCHES[currentPage] ?? [];
    list.forEach(prefetchRoute);
  };
  type WindowWithIdle = Window & { requestIdleCallback?: (cb: () => void) => number };
  const w = window as WindowWithIdle;
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(fire);
  } else {
    setTimeout(fire, 1000);
  }
}
