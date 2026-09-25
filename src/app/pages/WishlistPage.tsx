/**
 * WishlistPage — Phase 11.4.
 *
 * Two modes determined by the URL:
 *
 *   /wishlist          — the signed-in user's own wishlist, editable.
 *                        Heart toggles remove items in place.
 *
 *   /wishlist?s=<tok>  — a read-only view of someone else's list,
 *                        shared via the token format documented in
 *                        wishlistStore.ts. The visitor's own wishlist
 *                        is untouched. Each item has an "Add to my
 *                        wishlist" affordance.
 *
 * Anonymous users on /wishlist (no share token) get a sign-in CTA
 * with explanatory copy ("Sign in to sync your wishlist across
 * devices"). Their localStorage list is still visible if non-empty.
 */
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchTeas } from '@/lib/firebaseQueries';
import { ROUTES } from '@/lib/routes';
import { useWishlist, parseWishlistShareToken, encodeWishlistShareToken } from '@/store/wishlistStore';
import { TeaImage } from '@/app/components/TeaImage';
import { SeoHead } from '@/app/components/SeoHead';
import type { Product } from '@/schemas/product.schema';

import { useT, tNow, localizeTea, useLang, currentLang } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
function WishlistPage() {
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get('s');

  if (shareToken) {
    return (
      <>
        <SeoHead
          title="Shared Wishlist | Ele Café"
          description="A shared Ele Café wishlist. Browse saved teas and add favourites to your own list."
          noIndex={true}
        />
        <SharedWishlistView token={shareToken} />
      </>
    );
  }
  return (
    <>
      <SeoHead
        title="My Wishlist | Ele Café"
        description="Save your favourite teas to your wishlist and access them later."
        noIndex={true}
      />
      <OwnWishlistView />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Own (editable)
// ──────────────────────────────────────────────────────────────────
function OwnWishlistView() {
  const t = useT();
  const items   = useWishlist((s) => s.items);
  const remove  = useWishlist((s) => s.remove);

  const handleShare = async () => {
    const token = encodeWishlistShareToken(items.map((i) => i.slug));
    const url = `${window.location.origin}${ROUTES.HOME}wishlist?s=${token}`.replace(/\/+wishlist/, '/wishlist');
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'My Ele Café wishlist',
          text:  'Take a look at the teas I’m thinking about.',
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(tNow('Wishlist link copied to clipboard'));
      }
    } catch (err) {
      // User cancelled or share/copy unavailable.
      console.warn('[WishlistPage] share failed or was cancelled:', err);
    }
  };

  if (items.length === 0) {
    return (
      <main className="wl-page">
        <h1 className="wl-page-title">{t('Your wishlist')}</h1>
        <div className="wl-empty">
          <p>{t('You haven’t saved any teas yet.')}</p>
          <Link to={ROUTES.PRODUCTS} className="btn btn-dark">{t('Browse teas')}</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wl-page">
      <div className="wl-page-head">
        <h1 className="wl-page-title">{t('Your wishlist')}</h1>
        <button
          type="button"
          onClick={handleShare}
          className="btn btn-outline wl-share-btn"
          aria-label={t('Share wishlist')}
        >
          {t('Share')}
        </button>
      </div>

      <ul className="wl-grid" role="list">
        {items.map((it) => (
          <li key={it.slug} className="wl-card">
            <Link
              to={ROUTES.TEA_PROFILE(it.category, it.slug)}
              className="wl-card-link"
              aria-label={it.name}
            >
              <TeaImage
                product={{ image: it.image, name: it.name, variantsAvailable: false }}
                variant="card"
                aspectRatio="1 / 1"
                borderRadius="var(--radius-md)"
                className="wl-card-img"
              />
              <span className="wl-card-name">{it.name}</span>
              <span className="wl-card-price">{formatMoney(it.priceAtSave)}</span>
            </Link>
            <button
              type="button"
              className="wl-card-remove"
              onClick={() => remove(it.slug)}
              aria-label={tNow('Remove {name} from wishlist', { name: it.name })}
            >
              {t('Remove')}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────
// Shared (read-only)
// ──────────────────────────────────────────────────────────────────
function SharedWishlistView({ token }: { token: string }) {
  const tr = useT();
  const lang = useLang();
  const slugs = parseWishlistShareToken(token);
  const add   = useWishlist((s) => s.add);
  const has   = useWishlist((s) => s.has);
  const { data: allTeas, isLoading, isError, error } = useQuery({
    queryKey: ['teas'],
    queryFn:  () => fetchTeas(),
    staleTime: 5 * 60 * 1000,
  });

  const matched = useMemo<Product[]>(() => {
    if (!slugs || !allTeas) return [];
    const bySlug = new Map(allTeas.map((t) => [t.slug ?? t.id, t]));
    return slugs.map((s) => bySlug.get(s)).filter((x): x is Product => Boolean(x));
  }, [slugs, allTeas]);

  if (!slugs) {
    return (
      <main className="wl-page">
        <h1 className="wl-page-title">{tr('Shared wishlist')}</h1>
        <div className="wl-empty">
          <p>{tr('That share link doesn’t look valid.')}</p>
          <Link to={ROUTES.PRODUCTS} className="btn btn-dark">{tr('Browse teas')}</Link>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="wl-page">
        <h1 className="wl-page-title">{tr('Loading shared wishlist…')}</h1>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="wl-page">
        <h1 className="wl-page-title">{tr('Shared wishlist')}</h1>
        <div className="wl-empty">
          <p>{error instanceof Error ? error.message : tr('Could not load teas right now.')}</p>
          <Link to={ROUTES.PRODUCTS} className="btn btn-dark">{tr('Browse teas')}</Link>
        </div>
      </main>
    );
  }

  if (matched.length === 0) {
    return (
      <main className="wl-page">
        <h1 className="wl-page-title">{tr('Shared wishlist')}</h1>
        <div className="wl-empty">
          <p>{tr('None of the teas in this list are currently available in our catalog.')}</p>
          <Link to={ROUTES.PRODUCTS} className="btn btn-dark">{tr('Browse all teas')}</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wl-page">
      <h1 className="wl-page-title">{tr('Shared wishlist')}</h1>
      <p className="wl-shared-sub">{tr(matched.length === 1 ? 'A friend shared 1 tea with you.' : 'A friend shared {count} teas with you.', { count: matched.length })}</p>

      <ul className="wl-grid" role="list">
        {matched.map((p) => {
          const slug = p.slug ?? p.id ?? '';
          const inMyWishlist = has(slug);
          return (
            <li key={slug} className="wl-card">
              <Link
                to={ROUTES.TEA_PROFILE(p.category ?? 'other', slug)}
                className="wl-card-link"
                aria-label={localizeTea(p, lang).name}
              >
                <TeaImage
                  product={{ image: p.image ?? '', name: p.name ?? 'Tea', variantsAvailable: false }}
                  variant="card"
                  aspectRatio="1 / 1"
                  borderRadius="var(--radius-md)"
                />
                <span className="wl-card-name">{localizeTea(p, lang).name}</span>
                <span className="wl-card-price">
                  ${typeof p.price === 'number' ? p.price.toFixed(2) : '—'}
                </span>
              </Link>
              <button
                type="button"
                className="wl-card-add"
                disabled={inMyWishlist}
                onClick={() => add({
                  slug,
                  name:        p.name ?? 'Tea',
                  category:    p.category ?? 'other',
                  image:       p.image ?? '',
                  priceAtSave: typeof p.price === 'number' ? p.price : 0,
                })}
                aria-label={inMyWishlist ? tNow('{name} already in your wishlist', { name: localizeTea(p, currentLang()).name }) : tNow('Add {name} to your wishlist', { name: localizeTea(p, currentLang()).name })}
              >
                {inMyWishlist ? tr('In your wishlist') : tr('Add to my wishlist')}
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

export default WishlistPage;
