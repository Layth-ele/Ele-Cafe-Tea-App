import { Link } from 'react-router';
import { ArrowLeft, Leaf } from 'lucide-react';
import { ROUTES } from '@/lib/routes';

import { SeoHead } from '@/app/components/SeoHead';

import { useT } from '@/i18n/useT';
/**
 * NotFoundPage — 404 fallback rendered by the catch-all route.
 *
 * Phase 3 migration note: 7 inline styles → .nfp-* classes in
 * design.css. Page is now zero-inline-style and is included in the
 * a11y test sweep (see tests/a11y/public-pages.spec.ts).
 */
export function NotFoundPage() {
  const t = useT();
  return (
    <>
      <SeoHead title="Page Not Found | Ele Café" description="The page you're looking for doesn't exist or has moved." noIndex={true} />
      <div className="nfp-shell">
        <div className="nfp-content">
          <div className="empty-state-icon nfp-icon">
            <Leaf size={28} />
          </div>
          <span className="overline nfp-overline-spacing">{t('Page not found')}</span>
          <h1 className="nfp-headline">{t('Nothing brewed here')}</h1>
          <p className="nfp-lead">
            {t('The page you\'re looking for doesn\'t exist or has moved.')}
          </p>
          <Link to={ROUTES.HOME} className="btn btn-dark nfp-back-btn">
            <ArrowLeft size={15} /> {t('Back to Home')}
          </Link>
        </div>
      </div>
    </>
  );
}
export default NotFoundPage;
