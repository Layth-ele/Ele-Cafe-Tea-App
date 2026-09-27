export const SITE_BASE = import.meta.env.VITE_SITE_BASE ?? 'https://elecafe.ca';

export const TEA_CATEGORIES = [
  { id: 'black', label: 'Black Tea' },
  { id: 'green', label: 'Green Tea' },
  { id: 'white', label: 'White Tea' },
  { id: 'oolong', label: 'Oolong Tea' },
  { id: 'rooibos', label: 'Rooibos Tea' },
  { id: 'herbal', label: 'Herbal Tea' },
  { id: 'flower', label: 'Flower Tea' },
  { id: 'fruit', label: 'Fruit Tea' },
  { id: 'powder', label: 'Tea Powders' },
] as const;

export const ROUTES = {
  HOME: '/',
  PRODUCTS: '/products',
  PRODUCTS_CAT: (category: string) => `/products/${encodeURIComponent(category)}`,
  TEA_PROFILE: (category: string, slug: string) =>
    `/tea-profile/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`,
  PAIRINGS: '/pairings',
  CAFE: '/cafe',
  REWARDS: '/rewards',
  FRANCHISE: '/franchise',
  CAFFEINE_CALCULATOR: '/tea-caffeine-calculator',
  PRESS: '/press',
  PAIRING: (slug: string) => `/pairings/${encodeURIComponent(slug)}`,
  COLLECTION: (slug: string) => `/collections/${encodeURIComponent(slug)}`,
  CART: '/cart',
  LOGIN: '/login',
  SIGNUP: '/signup',
  GIFTS: '/gifts',
  ORDERS: '/orders',
  CHECKOUT: '/checkout',
  ACCOUNT: '/account',
  WISHLIST: '/wishlist',
  ABOUT: '/about',
  SHIPPING_POLICY: '/shipping-policy',
  REFUND_POLICY: '/refund-policy',
  PRIVACY_POLICY: '/privacy-policy',
  TERMS: '/terms',
  CONTACT: '/contact',
  ADMIN: '/admin',
  ADMIN_PRODUCTS: '/admin/products',
  ADMIN_ORDERS: '/admin/orders',
  ADMIN_CUSTOMERS: '/admin/customers',
  ADMIN_ANALYTICS: '/admin/analytics',
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_PROMOTIONS: '/admin/promotions',
  ADMIN_VERIFICATION_ANALYTICS: '/admin/verification-analytics',
  ADMIN_VISITS_ANALYTICS: '/admin/visits-analytics',
  ADMIN_INVENTORY: '/admin/inventory',
  ADMIN_INVENTORY_LOGS: '/admin/inventory/logs',
  ADMIN_EMPLOYEES: '/admin/employees',
  /** Employee-facing inventory dashboard. Requires sign-in to the
   *  shared `inventory@elecafe.ca` account AND a validated 4-digit
   *  access code (session-only, see InventoryGuard).
   *  The admin path /admin/inventory uses requireAdmin only — no code. */
  INVENTORY: '/inventory',
} as const;

export function loginWithReturn(returnUrl: string): string {
  return `/login?returnUrl=${encodeURIComponent(returnUrl || '/')}`;
}
