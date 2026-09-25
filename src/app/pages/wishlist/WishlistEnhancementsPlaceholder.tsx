import { Link } from 'react-router';
import { ROUTES } from '@/lib/routes';

import { useT } from '@/i18n/useT';
/**
 * WishlistEnhancementsPlaceholder
 *
 * Non-routed placeholder that documents the next UX-ready wishlist
 * improvements while keeping the implementation scoped to existing
 * page structure (`src/app/pages/WishlistPage.tsx`).
 */
export default function WishlistEnhancementsPlaceholder() {
  const t = useT();
  return (
    <section className="wl-empty" aria-labelledby="wishlist-enhancements-title">
      <h2 id="wishlist-enhancements-title" className="wl-page-title">
        {t('Wishlist improvements coming soon')}
      </h2>
      <p>
        {t('We are preparing smarter wishlist filters, price-drop alerts, and improved shared-list controls.')}
      </p>
      <div className="wl-placeholder-actions">
        <Link to={ROUTES.WISHLIST} className="btn btn-dark">{t('Go to wishlist')}</Link>
        <Link to={ROUTES.PRODUCTS} className="btn btn-outline">{t('Browse teas')}</Link>
      </div>
    </section>
  );
}
