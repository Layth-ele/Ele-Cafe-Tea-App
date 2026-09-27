/** "Vegan" label for café pairings (Admin → Pairings → Vegan). */
import { Leaf } from 'lucide-react';
import { useT } from '@/i18n/useT';

export function VeganBadge({ variant = 'card' }: { variant?: 'card' | 'onDark' }) {
  const t = useT();
  return (
    <span className="vegan-badge" data-variant={variant}>
      <Leaf size={12} aria-hidden="true" />
      {t('Vegan')}
    </span>
  );
}
