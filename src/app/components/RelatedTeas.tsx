/**
 * RelatedTeas — programmatic-SEO internal linking component
 *
 * Renders a grid of 4 teas in the same category as the current tea,
 * excluding the current tea itself. The links are crawled by search
 * engines and create a denser internal-link graph: every tea page
 * gains 4 inbound links from same-category siblings, which:
 *  - improves crawl discovery (no orphan pages even if categories
 *    aren't browsed)
 *  - distributes link equity across the catalog
 *  - gives users a relevant "what to try next" affordance
 *
 * Source of truth is the same `useQuery(['teas'])` cache that
 * ProductsPage uses, so this adds zero extra Firestore reads when the
 * customer has already browsed the catalog. On a deep-link landing
 * (paste tea URL into address bar), the query fires once and is then
 * shared across the rest of the session.
 *
 * The component renders nothing if fewer than 4 sibling teas exist
 * (keeps the section from looking sparse on small categories).
 */
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchTeas } from '@/lib/firebaseQueries';
import { toSlug } from '@/lib/slugify';
import { TeaImage } from './TeaImage';
import { formatPricePerWeight } from '@/lib/priceFormat';
import type { Product } from '@/schemas/product.schema';

import { useT, localizeTea, useLang, tNow } from '@/i18n/useT';
interface Props {
  currentSlug:    string;
  currentCategory: string;
}

export function RelatedTeas({ currentSlug, currentCategory }: Props) {
  const tr = useT();
  // Same query key ProductsPage uses — leverages the existing cache.
  const { data: allTeas } = useQuery({
    queryKey: ['teas'],
    queryFn:  () => fetchTeas(),
    staleTime: 5 * 60 * 1000,
  });

  if (!allTeas || allTeas.length === 0) return null;

  // Phase 11.2 — recommendation cascade:
  //   1. Same category as current (most semantically relevant)
  //   2. + same flavor profile (warmth, floral, etc.) if catalog has it
  //   3. + same price band (current ±$5) if it helps fill the slot
  //   4. + top sellers by rating, regardless of category, as filler
  //
  // We accumulate up to 4 picks across these tiers, deduplicating by
  // slug, never including the current tea. If all four tiers can't
  // produce 4 picks, we still render whatever we have (Tier 4 is
  // catalog-wide, so this only fails on a 1-product catalog — a
  // case where rendering at all is moot).
  const currentTea = allTeas.find(t => t.slug === currentSlug);
  const currentFlavor = (currentTea as { flavorProfile?: string } | undefined)?.flavorProfile;
  const currentPrice  = typeof currentTea?.price === 'number' ? currentTea.price : null;
  const PRICE_BAND    = 5; // ±$5 of current

  const pickedSlugs = new Set<string>([currentSlug]);
  const picks: Product[] = [];

  const considerTier = (predicate: (t: Product) => boolean) => {
    if (picks.length >= 4) return;
    const tier = allTeas
      .filter((t) => !pickedSlugs.has(t.slug ?? '') && t.isActive !== false && predicate(t))
      .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0));
    for (const t of tier) {
      if (picks.length >= 4) break;
      picks.push(t);
      pickedSlugs.add(t.slug ?? '');
    }
  };

  // Tier 1: same category
  considerTier((t) => t.category === currentCategory);
  // Tier 2: same flavor profile (only if the field exists on both)
  if (currentFlavor) {
    considerTier((t) => (t as { flavorProfile?: string }).flavorProfile === currentFlavor);
  }
  // Tier 3: same price band
  if (currentPrice !== null) {
    considerTier((t) =>
      typeof t.price === 'number' &&
      Math.abs(t.price - currentPrice) <= PRICE_BAND,
    );
  }
  // Tier 4: top sellers fallback (any category)
  considerTier(() => true);

  const related = picks.slice(0, 4);

  if (related.length < 4) return null;

  return (
    <section
      aria-labelledby="related-teas-heading"
      className="rt-section"
    >
      <div className="rt-inner">
        <h2
          id="related-teas-heading"
          className="rt-h2"
        >
          {tr('You might also like')}
        </h2>

        <div className="rt-grid">
          {related.map(tea => (
            <RelatedTeaCard key={tea.slug} tea={tea} />
          ))}
        </div>
      </div>
    </section>
  );
}

// Sub-component so the rel="" + aria-label live close to the link.
// rel attribute intentionally omitted — these are first-party links
// and shouldn't carry nofollow.
function RelatedTeaCard({ tea }: { tea: Product }) {
  const name = localizeTea(tea, useLang()).name;
  const href  = `/tea-profile/${encodeURIComponent(tea.category ?? '')}/${encodeURIComponent(toSlug(tea.slug ?? ''))}`;
  const price = typeof tea.price === 'number' ? formatPricePerWeight(tea.price, tea) : '';

  return (
    <Link
      to={href}
      aria-label={tNow('View {name}', { name: name || tNow('tea') })}
      className="rt-link"
    >
      {/* Related-teas grid — same layout context as the products card,
          so we reuse the "card" variant. variant="card" uses sizes
          appropriate for a grid of 2–4 columns. */}
      <TeaImage
        product={tea}
        variant="card"
        aspectRatio="4/5"
        borderRadius="8px"
        className="rt-image"
      />
      <div className="rt-name">
        {name}
      </div>
      {price && (
        <div className="rt-price">
          {price}
        </div>
      )}
    </Link>
  );
}
