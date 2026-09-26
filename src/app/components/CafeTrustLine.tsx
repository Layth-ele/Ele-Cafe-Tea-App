/**
 * CafeTrustLine — "Taste it in Vancouver before you buy it online."
 *
 * The physical café is the store's trust advantage over anonymous online
 * tea sellers. Street address and map link come from Admin → Settings
 * (useStoreContent), so they stay in step with the footer and contact
 * page; the line hides itself if no address is set.
 */
import { Link } from 'react-router';
import { MapPin } from 'lucide-react';
import { useStoreContent } from '@/hooks/useStoreContent';
import { useT } from '@/i18n/useT';
import { ROUTES } from '@/lib/routes';
import { addressLines } from '../../../functions/src/lib/storeContent';

export function CafeTrustLine({ variant }: { variant: 'hero' | 'product' }) {
  const t = useT();
  const store = useStoreContent();
  const [street] = addressLines(store.address);
  if (!street) return null;

  const where = store.mapsUrl ? (
    <a href={store.mapsUrl} target="_blank" rel="noopener noreferrer" className="ctl-where">
      {street}
    </a>
  ) : (
    <Link to={ROUTES.CONTACT} className="ctl-where">
      {street}
    </Link>
  );

  return (
    <p className={`ctl ctl-${variant}`}>
      <MapPin size={variant === 'hero' ? 16 : 15} aria-hidden="true" className="ctl-icon" />
      <span>
        <strong className="ctl-lead">
          {variant === 'hero'
            ? t('Taste it in Vancouver before you buy it online')
            : t('Taste it first at our café')}
        </strong>
        {' · '}
        {where}
        {' · '}
        {t('Free pickup')}
      </span>
    </p>
  );
}
