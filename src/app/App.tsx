/**
 * App.tsx — Enterprise Routing Layer
 *
 * Architecture:
 * - React Router v6 with BrowserRouter (compatible with v7 data APIs when ready)
 * - All routes defined via ROUTES constants (lib/routes.ts) — single source of truth
 * - Every page is lazy-loaded for optimal code-splitting
 * - ScrollRestoration on every navigation
 * - ProtectedRoute wrapper for auth-gated pages
 * - Nested admin routes via <Outlet>
 * - Mobile-app-ready: ROUTES registry consumed by React Native Navigation
 *
 * Route map:
 *   /                           → HomePage
 *   /products                   → ProductsPage (all teas)
 *   /products/:category         → ProductsPage (filtered, e.g. /products/black)
 *   /collections/:slug          → CollectionPage (keyword landing pages, lib/seoCatalog)
 *   /cafe                       → CafePage (in-store café menu, lib/cafeMenu)
 *   /rewards                    → RewardsPage (Ele Rewards loyalty, lib/rewards)
 *   /franchise                  → FranchisePage (franchise inquiries, lib/franchise)
 *   /tea-profile/:category/:slug → TeaProfilePage
 *   /cart                       → CartPage
 *   /login                      → LoginPage
 *   /signup                     → SignupPage
 *   /about                      → AboutPage
 *   /shipping-policy            → ShippingPolicyPage
 *   /refund-policy              → RefundPolicyPage
 *   /privacy-policy             → PrivacyPolicyPage
 *   /contact                    → ContactPage
 *   /gifts          [public]    → GiftsPage
 *   /orders         [auth]      → OrdersPage
 *   /checkout       [auth]      → CheckoutPage
 *   /account        [auth]      → AccountPage
 *   /admin          [admin]     → AdminLayout (nested)
 *     index                     → AdminOverview
 *     /admin/products           → AdminProducts
 *     /admin/orders             → AdminOrders
 *     /admin/analytics          → AdminAnalytics
 *     /admin/settings           → AdminSettings
 *     /admin/customers          → AdminCustomers
 *   *                           → NotFoundPage
 */

import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/queryClient';
import { useCartSync }       from '@/hooks/useCartSync';
import { useWishlistSync }   from '@/hooks/useWishlistSync';
import { useSessionTracker } from '@/hooks/useSessionTracker';
import { useProfileLangSync } from '@/hooks/useProfileLangSync';
import { useTrackPageView } from '@/hooks/useTrackPageView';
import { useEffect, Suspense, lazy } from 'react';

import { Toaster }             from './components/ui/sonner';
import { Skeleton }            from './components/ui/skeleton';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CreditProvider }      from '@/contexts/CreditContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { Navbar }              from './components/Navbar';
import { OfflineBanner }       from './components/OfflineBanner';
import { Footer }              from './components/Footer';
import { ProtectedRoute }      from './components/ProtectedRoute';
import { InventoryGuard }      from '@/features/inventory/components/InventoryGuard';
import { InventorySessionSync } from '@/features/inventory/components/InventorySessionSync';
import { ErrorBoundary }       from './components/ErrorBoundary';
import { CommandPaletteProvider } from './components/CommandPalette';
import { SharePage }              from './pages/SharePage';
import { PwaInstallBanner }       from './components/PwaInstallBanner';
import { SwUpdateBanner }         from './components/SwUpdateBanner';
import { PushPermissionPrompt }   from './components/PushPermissionPrompt';
import { ROUTES }              from '@/lib/routes';
import { isInventoryEmail }    from '@/lib/inventoryAccount';
import { isStaffDevice }       from '@/features/inventory/lib/staffDevice';

import { useT } from '@/i18n/useT';
import { useCartCatalogSync } from '@/hooks/useCartCatalogSync';
// Welcome modals — both lazy because they only render in narrow cases:
//   • WelcomeCreditModal — fires once when the customer_welcome_bonus
//                          notification arrives for a brand-new user.
//   • WelcomeVerifyModal — fires once when a user with a password
//                          provider signs in unverified (post-signup
//                          flag, OR auto-detected legacy account).
const WelcomeCreditModal = lazy(() => import('./components/WelcomeCreditModal').then(m => ({ default: m.WelcomeCreditModal })));
const WelcomeVerifyModal = lazy(() => import('./components/WelcomeVerifyModal').then(m => ({ default: m.WelcomeVerifyModal })));

// ── Lazy page imports ────────────────────────────────────────────────────────
const lazy_ = <T extends { default: React.ComponentType<any> }>(fn: () => Promise<T>) =>
  lazy(fn);

// Public
const HomePage         = lazy_(() => import('./pages/HomePage'));
const ProductsPage     = lazy_(() => import('./pages/ProductsPage'));
const TeaProfilePage   = lazy_(() => import('./pages/TeaProfilePage'));
const ComboPairingPage = lazy_(() => import('./pages/ComboPairingPage'));
const PairingsIndexPage = lazy_(() => import('./pages/PairingsIndexPage'));
const CollectionPage    = lazy_(() => import('./pages/CollectionPage'));
const CafePage          = lazy_(() => import('./pages/CafePage'));
const RewardsPage       = lazy_(() => import('./pages/RewardsPage'));
const FranchisePage     = lazy_(() => import('./pages/FranchisePage'));
const CartPage         = lazy_(() => import('./pages/CartPage'));
const LoginPage        = lazy_(() => import('./pages/LoginPage'));
const SignupPage       = lazy_(() => import('./pages/SignupPage'));
const NotFoundPage     = lazy_(() => import('./pages/NotFoundPage'));

// Info (static)
const AboutPage          = lazy_(() => import('./pages/info/AboutPage'));
const ShippingPolicyPage = lazy_(() => import('./pages/info/ShippingPolicyPage'));
const RefundPolicyPage   = lazy_(() => import('./pages/info/RefundPolicyPage'));
const PrivacyPolicyPage  = lazy_(() => import('./pages/info/PrivacyPolicyPage'));
const ContactPage        = lazy_(() => import('./pages/info/ContactPage'));

// Protected
const GiftsPage    = lazy_(() => import('./pages/GiftsPage'));
const OrdersPage   = lazy_(() => import('./pages/OrdersPage'));
const CheckoutPage = lazy_(() => import('./pages/CheckoutPage'));
const AccountPage  = lazy_(() => import('./pages/AccountPage'));
const WishlistPage = lazy_(() => import('./pages/WishlistPage'));
const InventoryPage = lazy_(() => import('./pages/InventoryPage'));

// Admin (nested)
const AdminLayout    = lazy_(() => import('./pages/admin/AdminLayout'));
const AdminOverview  = lazy_(() => import('./pages/admin/AdminOverview'));
const AdminProducts  = lazy_(() => import('./pages/admin/AdminProducts'));
const AdminOrders    = lazy_(() => import('./pages/admin/AdminOrders'));
const AdminCustomers = lazy_(() => import('./pages/admin/AdminCustomers'));
const AdminAnalytics = lazy_(() => import('./pages/admin/AdminAnalytics'));
const AdminSettings   = lazy_(() => import('./pages/admin/AdminSettings'));
const AdminPromotions = lazy_(() => import('./pages/admin/AdminPromotions'));
// Verification + visits analytics — separate pages from main Analytics
// because each has its own filter / shape and admin needs to find them
// quickly when investigating their respective signals.
const AdminVerificationAnalytics = lazy_(() => import('./pages/admin/AdminVerificationAnalytics'));
const AdminVisitsAnalytics       = lazy_(() => import('./pages/admin/AdminVisitsAnalytics'));
const AdminInventory             = lazy_(() => import('./pages/admin/AdminInventory'));
const AdminInventoryLogs         = lazy_(() => import('./pages/admin/AdminInventoryLogs'));
const AdminEmployees             = lazy_(() => import('./pages/admin/AdminEmployees'));

// ── Scroll restoration ───────────────────────────────────────────────────────
// Scrolls to top on every route change.
// Skip-to-content is handled by the #main-content anchor.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

// ── Loading fallback ─────────────────────────────────────────────────────────
// Phase 5.2: was a single spinner shell — upgraded to Skeleton.Page,
// which uses a gentle scale+fade pulse and announces "Loading…" to
// screen readers via role=status + sr-only label. The old spinner
// flashed for a single frame on fast routes; the gentle pulse is
// less anxious and more honest about what's happening.
//
// The decision: skeleton-shaped fallbacks belong inside individual
// route components where we know what's coming (a tea card, a
// product list, an order row). At the app-shell level we don't
// know which route just lazy-loaded, so the generic Page pulse is
// the right granularity. Per-route Skeletons are a follow-up round.
function PageLoader() {
  return <Skeleton.Page />;
}

// ── Firebase ↔ Zustand cart sync (must live inside BrowserRouter) ────────────
function CartSync() { useCartSync(); return null; }
// Re-price saved cart lines against the live catalogue after price changes.
function CartCatalogSync() { useCartCatalogSync(); return null; }

// ── Phase 11.4 — Firebase ↔ Zustand wishlist sync (logged-in users only).
//     Initial-merge on sign-in unions remote + local; subsequent local
//     changes debounce-write to Firestore. See useWishlistSync. ──────────
function WishlistSync() { useWishlistSync(); return null; }

// ── Active session tracking + 1-min idle auto-logout (must live inside
//     AuthProvider so it can read currentUser and call logout). Render-null
//     side-effect component — same pattern as CartSync. ───────────────────
function SessionTracker() { useSessionTracker(); return null; }
// Saves the site language on the customer's profile for server emails.
function ProfileLangSync() { useProfileLangSync(); return null; }
// PageViewTracker fires logPageView on every route change for
// customer-side traffic. Skipped on admin routes; see hook.
function PageViewTracker() { useTrackPageView(); return null; }

// ── Staff (inventory@) mode ──────────────────────────────────────────────────
// The shared inventory account only ever sees the inventory app: any other
// page redirects to /inventory, and inventory pages render without the
// storefront chrome (announcement bar, navbar, footer, promos). A staff
// device is recognised before Auth finishes restoring (lib/staffDevice.ts),
// so the storefront home page never flashes on the counter iPad.
function useStaffMode() {
  const { pathname } = useLocation();
  const { currentUser, loading } = useAuth();
  const onStaffRoute = pathname === ROUTES.INVENTORY || pathname.startsWith(`${ROUTES.INVENTORY}/`);
  const staffAccount = !!currentUser && isInventoryEmail(currentUser.email);
  const staffPending = loading && isStaffDevice();
  const redirect = (staffAccount || staffPending) && !onStaffRoute && pathname !== ROUTES.LOGIN;
  // The login page on a staff device is chrome-free too (counter iPad).
  const staffLogin = pathname === ROUTES.LOGIN && (staffAccount || isStaffDevice());
  // Admin pages have their own shell (sidebar + page headers): no shop
  // perks strip / footer / promos under them.
  const adminRoute = pathname === ROUTES.ADMIN || pathname.startsWith(`${ROUTES.ADMIN}/`);
  return { redirect, staffChrome: onStaffRoute || redirect || staffLogin, adminChrome: adminRoute };
}

// ── App shell (inside providers) ─────────────────────────────────────────────
function AppShell() {
  const t = useT();
  const { redirect: staffRedirect, staffChrome, adminChrome } = useStaffMode();
  return (
    <>
      <CartSync />
      <CartCatalogSync />
      <WishlistSync />
      <SessionTracker />
      <ProfileLangSync />
      <PageViewTracker />
      <ScrollToTop />

      {/* Skip to main content — keyboard / screen-reader fast path */}
      <a href="#main-content" className="skip-nav">
        {t('Skip to main content')}
      </a>

      <div className="min-h-screen flex flex-col" data-shell={staffChrome ? 'staff' : undefined}>
        <OfflineBanner />
        {!staffChrome && <Navbar />}

        <ErrorBoundary>
          <main id="main-content" className="flex-1 page-enter" role="main">
            {/* ARIA live region for screen-reader route announcements */}
            <div id="page-announcer" className="live-region" aria-live="polite" aria-atomic="true" />

            <Suspense fallback={<PageLoader />}>
              {staffRedirect ? <Navigate to={ROUTES.INVENTORY} replace /> : (
              <Routes>
                {/* ── Public ─────────────────────────────────────── */}
                <Route path={ROUTES.HOME}    element={<HomePage />} />
                <Route path={ROUTES.CART}    element={<CartPage />} />
                <Route path={ROUTES.LOGIN}   element={<LoginPage />} />
                <Route path={ROUTES.SIGNUP}  element={<SignupPage />} />

                {/* Products — /products and /products/:category share same component */}
                <Route path={ROUTES.PRODUCTS}          element={<ProductsPage />} />
                <Route path={`${ROUTES.PRODUCTS}/:category`} element={<ProductsPage />} />

                {/* Tea detail — unchanged URL */}
                <Route path="/tea-profile/:category/:slug" element={<TeaProfilePage />} />
                {/* /pairings — collection landing page (Phase 12 fix; the breadcrumb
                    on /pairings/:slug pages pointed here and produced a soft 404
                    before this route existed). Must be registered BEFORE the
                    :slug variant so the exact "/pairings" path doesn't get
                    captured as a slug literal. */}
                <Route path="/pairings"                     element={<PairingsIndexPage />} />
                <Route path="/collections/:slug"            element={<CollectionPage />} />
                <Route path={ROUTES.CAFE}                   element={<CafePage />} />
                <Route path={ROUTES.REWARDS}                element={<RewardsPage />} />
                <Route path={ROUTES.FRANCHISE}              element={<FranchisePage />} />
                <Route path="/pairings/:slug"               element={<ComboPairingPage />} />

                {/* ── PWA share target (Phase 9.5) ─────────────────
                    OS share sheet posts here with ?url=&title=&text=.
                    SharePage parses + redirects (no UI of its own),
                    so we eager-import to avoid a chunk fetch on the
                    redirect path. */}
                <Route path="/share" element={<SharePage />} />

                {/* ── Info (static pages) ────────────────────────── */}
                <Route path={ROUTES.ABOUT}           element={<AboutPage />} />
                <Route path={ROUTES.SHIPPING_POLICY} element={<ShippingPolicyPage />} />
                <Route path={ROUTES.REFUND_POLICY}   element={<RefundPolicyPage />} />
                <Route path={ROUTES.PRIVACY_POLICY}  element={<PrivacyPolicyPage />} />
                <Route path={ROUTES.CONTACT}         element={<ContactPage />} />

                {/* ── Gift builder — public landing (Day 16) ───────── */}
                {/* Auth gating happens at /checkout when adding to cart;
                    the marketing landing must be indexable and accessible
                    to logged-out visitors. */}
                <Route path={ROUTES.GIFTS}    element={<GiftsPage />} />
                <Route path={ROUTES.WISHLIST} element={<WishlistPage />} />

                {/* ── Protected ──────────────────────────────────── */}
                <Route path={ROUTES.ORDERS}   element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
                <Route path={ROUTES.CHECKOUT} element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
                <Route path={ROUTES.ACCOUNT}  element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />

                {/* ── Inventory (employee) ───────────────────────────
                    The InventoryGuard handles all three gates itself
                    (sign-in, inventory-account email match, validated
                    access-code session). Children unmount cleanly when
                    any gate trips, so the inventory data layer never
                    subscribes for an unauthorized user. */}
                <Route path={ROUTES.INVENTORY} element={<InventoryGuard><InventoryPage /></InventoryGuard>} />
                <Route path={`${ROUTES.INVENTORY}/:category`} element={<InventoryGuard><InventoryPage /></InventoryGuard>} />

                {/* ── Admin (nested) ─────────────────────────────── */}
                <Route
                  path={ROUTES.ADMIN}
                  element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}
                >
                  <Route index                                           element={<AdminOverview />} />
                  <Route path={ROUTES.ADMIN_PRODUCTS.split('/').pop()}  element={<AdminProducts />} />
                  <Route path={ROUTES.ADMIN_ORDERS.split('/').pop()}    element={<AdminOrders />} />
                  <Route path={ROUTES.ADMIN_ANALYTICS.split('/').pop()} element={<AdminAnalytics />} />
                  <Route path={ROUTES.ADMIN_SETTINGS.split('/').pop()}  element={<AdminSettings />} />
                  <Route path={ROUTES.ADMIN_CUSTOMERS.split('/').pop()}  element={<AdminCustomers />} />
                  <Route path={ROUTES.ADMIN_PROMOTIONS.split('/').pop()} element={<AdminPromotions />} />
                  <Route path={ROUTES.ADMIN_VERIFICATION_ANALYTICS.split('/').pop()} element={<AdminVerificationAnalytics />} />
                  <Route path={ROUTES.ADMIN_VISITS_ANALYTICS.split('/').pop()}       element={<AdminVisitsAnalytics />} />
                  <Route path={ROUTES.ADMIN_INVENTORY.split('/').pop()}              element={<AdminInventory />} />
                  {/* Two-segment route: /admin/inventory/logs. Can't
                      use the .pop() pattern other admin routes share
                      because that would yield 'logs' alone. */}
                  <Route path="inventory/logs"                                       element={<AdminInventoryLogs />} />
                  <Route path="inventory/:category"                                  element={<AdminInventory />} />
                  <Route path={ROUTES.ADMIN_EMPLOYEES.split('/').pop()}              element={<AdminEmployees />} />
                </Route>

                {/* ── 404 ────────────────────────────────────────── */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
              )}
            </Suspense>
          </main>
        </ErrorBoundary>

        {!staffChrome && !adminChrome && <Footer />}
        <Toaster />
        {!staffChrome && !adminChrome && <PwaInstallBanner />}
        {/* SW lifecycle: "offline ready" + "update available" toasts. */}
        <SwUpdateBanner />
        {!staffChrome && (
          <>
            {/* Push permission request — shown after high-intent signals. */}
            <PushPermissionPrompt />
            <Suspense fallback={null}>
              <WelcomeCreditModal />
              <WelcomeVerifyModal />
            </Suspense>
          </>
        )}
      </div>
    </>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <AuthProvider>
            {/* Sync: clears the inventory access-code store on sign-out.
                Always mounted, regardless of which route the user is on,
                so the session can't survive past a logout that happened
                from a non-inventory page (would otherwise let the next
                person who signs in to the shared inventory account land
                on /inventory with the previous employee's session). */}
            <InventorySessionSync />
            <NotificationProvider>
              <CreditProvider>
                {/* Phase 4.3: cmd+K command palette. Mounted inside
                    AuthProvider so the palette can show different
                    entries based on auth state (Sign In vs My Account). */}
                <CommandPaletteProvider>
                  <AppShell />
                </CommandPaletteProvider>
              </CreditProvider>
            </NotificationProvider>
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
