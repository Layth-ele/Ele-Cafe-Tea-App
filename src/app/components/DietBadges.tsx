/** Dietary tags on a café pairing (Admin → Pairings → Diet). */
import { Leaf } from 'lucide-react';
import { useLang } from '@/i18n/useT';
import { DIET_LABEL, comboDiet } from '../../../functions/src/lib/cafeMenu';

export function DietBadges({
  item,
  variant = 'card',
}: {
  item: { diet?: unknown; vegan?: unknown };
  variant?: 'card' | 'onDark';
}) {
  const lang = useLang();
  const tags = comboDiet(item);
  if (!tags.length) return null;
  return (
    <ul
      className="diet-badges"
      data-variant={variant}
      aria-label={lang === 'fr' ? 'Préférences alimentaires' : 'Dietary preferences'}
    >
      {tags.map((t) => (
        <li key={t} className="vegan-badge" data-variant={variant} data-tag={t}>
          {t === 'vegan' && <Leaf size={12} aria-hidden="true" />}
          {DIET_LABEL[t][lang === 'fr' ? 'fr' : 'en']}
        </li>
      ))}
    </ul>
  );
}

/** "400 Cal" (same in French). */
export function caloriesText(item: { calories?: unknown }): string {
  return typeof item.calories === 'number' && item.calories > 0
    ? `${Math.round(item.calories)} Cal`
    : '';
}
