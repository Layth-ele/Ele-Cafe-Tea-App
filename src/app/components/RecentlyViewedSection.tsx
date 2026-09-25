/**
 * RecentlyViewedSection — Phase 11.1.
 *
 * Surfaces the last 10 teas the user viewed. Designed to drop into
 * any context with a meaningful heading; consumers control the
 * heading text and the max-count via props.
 *
 * Behavior:
 *   - If the user has no entries (anonymous first-time visitor),
 *     renders null. No "Your recently viewed will appear here" empty
 *     state — empty states for empty histories are noise.
 *   - Max 6 by default to keep the row compact; consumers can pass
 *     `limit={10}` for the dedicated section on a cart empty page.
 */
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useRecentlyViewed } from '@/store/recentlyViewedStore';
import { fetchTeas, queryKeys } from '@/lib/firebaseQueries';
import { ROUTES } from '@/lib/routes';
import { TeaImage } from './TeaImage';

import { useT, localizeTea, useLang } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
interface Props {
  /** Heading text — required, no default, because the right heading
   *  depends on context. "Pick up where you left off" works on home;
   *  "Recently viewed" works on the cart empty state. */
  heading: string;
  /** Max items to display. Default 6 (fits a 3×2 mobile grid or a
   *  6-wide desktop row). */
  limit?: number;
  /** Optional className applied to the root <section>. */
  className?: string;
}

export function RecentlyViewedSection({ heading, limit = 6, className }: Props) {
  const t = useT();
  const lang = useLang();
  const entries = useRecentlyViewed((s) => s.entries);
  // Entries store the image from when the tea was viewed, which goes stale
  // (photo changed, or it was viewed while the mock fallback was showing).
  // Prefer the current catalog image once it has loaded.
  const { data: teas = [] } = useQuery({
    queryKey: queryKeys.teas(),
    queryFn:  fetchTeas,
    enabled:  entries.length > 0,
  });

  if (entries.length === 0) return null;

  const liveImage = new Map(teas.map((t) => [t.slug ?? t.id, t.image]));
  const liveName = new Map(teas.map((t) => [t.slug ?? t.id, localizeTea(t, lang).name]));
  const nameOf = (e: { slug: string; name: string }) => liveName.get(e.slug) || e.name;

  const shown = entries.slice(0, limit);

  return (
    <section className={['rv-section', className].filter(Boolean).join(' ')} aria-labelledby="rv-heading">
      <h2 id="rv-heading" className="rv-heading">{heading}</h2>
      <ul className="rv-list" role="list">
        {shown.map((e) => (
          <li key={e.slug} className="rv-item">
            <Link
              to={ROUTES.TEA_PROFILE(e.category, e.slug)}
              className="rv-link"
              aria-label={t('{name} — viewed earlier', { name: nameOf(e) })}
            >
              <TeaImage
                product={{ image: liveImage.get(e.slug) || e.image, name: e.name, variantsAvailable: false }}
                variant="thumb"
                aspectRatio="1 / 1"
                borderRadius="var(--radius-md)"
                className="rv-img"
              />
              <span className="rv-name">{nameOf(e)}</span>
              {e.priceAtView > 0 && (
                <span className="rv-price">{formatMoney(e.priceAtView)}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
