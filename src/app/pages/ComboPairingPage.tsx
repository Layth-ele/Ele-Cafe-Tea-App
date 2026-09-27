/**
 * ComboPairingPage — public landing page for a single combo, at
 * /pairings/{slug}. Designed for sharing to Instagram stories and
 * other social channels: the URL has dedicated OG metadata baked in
 * by the renderSeo Cloud Function, so when customers paste the link
 * in IG, Facebook, Slack, or iMessage, they see this combo's image
 * and description in the link card — not whatever happens to be
 * the active slide in the global carousel.
 *
 * Page anatomy:
 *   1. Hero — full-width combo image, frosted overlay with title +
 *      description + price chip
 *   2. Pairing context — "Pair this with one of our teas" + short
 *      pitch + browse-all-teas CTA button
 *   3. Featured teas — first 4 active teas as a quick browse grid
 *      (saves the customer one click on the way to making a purchase)
 *   4. Share strip — same WhatsApp / Email / Copy-link buttons used
 *      elsewhere, pre-loaded with this page's URL
 *
 * Data flow:
 *   - useComboGallery() (already exists) gives us the live list
 *   - we filter to find the one matching the URL slug
 *   - while loading: show a skeleton; if still empty after load: 404
 *
 * SEO:
 *   The Cloud Function `renderSeo` patches the first-byte HTML with
 *   per-combo OG/Twitter/JSON-LD when crawlers (or IG's link
 *   scraper) fetch /pairings/{slug}. The runtime <SeoHead> below
 *   handles client-side navigation between pages — both reflect the
 *   live Firestore data.
 *
 * Phase 3 status (2026-05-09): all 36 inline styles migrated to
 * `cpp-*` classes in design.css. The category-pill JS hover became
 * CSS `:hover` (playbook §step-4). 0 inline styles remain.
 */
import { DietBadges, caloriesText } from '@/app/components/DietBadges';
import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { normalizeSlugFromUrl } from '@/lib/slugify';
import { ArrowRight } from 'lucide-react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  documentId,
  getDocs,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { ROUTES, TEA_CATEGORIES, SITE_BASE } from '@/lib/routes';
import { useComboGallery } from '@/app/components/ComboGallery';
import { LazyImage } from '@/app/components/LazyImage';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { ShareButton } from '@/app/components/ShareButton';
import { ShareButtons } from '@/app/components/ShareButtons';
import { sendPairingViewBeacon } from '@/lib/rum';
import type { ComboItem } from '@/schemas/comboGallery.schema';

import {
  useT,
  tNow,
  localizeCombo,
  localizeTea,
  categoryName,
  useLang,
  currentLang,
} from '@/i18n/useT';
import { useVisibleCategoryIds } from '@/hooks/useVisibleCategoryIds';
import { formatMoney } from '@/lib/money';
interface FeaturedTea {
  id: string;
  slug: string;
  name: string;
  category: string;
  image?: string;
  price?: number;
}

function formatPrice(price: number, currency = 'CAD'): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price);
  } catch (err) {
    console.warn('[ComboPairingPage] Price formatting failed:', err);
    return formatMoney(price);
  }
}

function ComboPairingPage() {
  const tr = useT();
  const lang = useLang();
  const visibleCats = useVisibleCategoryIds();
  const { slug: rawSlug = '' } = useParams<{ slug: string }>();
  // A link with a shared description glued on still opens the pairing,
  // and the address bar is cleaned up.
  const slug = normalizeSlugFromUrl(rawSlug);
  const navigateTo = useNavigate();
  useEffect(() => {
    if (rawSlug && slug && rawSlug !== slug) navigateTo(ROUTES.PAIRING(slug), { replace: true });
  }, [rawSlug, slug, navigateTo]);
  const { items, loading } = useComboGallery();

  // Find the combo by slug. ComboGallery's hook already filters to
  // enabled items; we don't want to render a disabled combo here
  // because IG would still show the OG card and customers would tap
  // through to a "this isn't available" experience.
  const combo: ComboItem | undefined = useMemo(
    () => items.find((c) => c.slug && c.slug === slug),
    [items, slug],
  );

  // Featured teas — Phase 13: prefer the combo's explicit
  // `pairedTeaIds` curation when set, fall back to the generic
  // "4 random featured" otherwise. The curated branch resolves the
  // associated teas via a Firestore documentId IN query (capped at
  // 10 IDs by Firestore — we limit pairedTeaIds to 8 in the schema
  // so we have headroom). The fallback branch is unchanged from the
  // previous behaviour and keeps every existing combo working without
  // any migration.
  const [featured, setFeatured] = useState<FeaturedTea[]>([]);
  const [featuredError, setFeaturedError] = useState<string | null>(null);
  // Stable comma-joined dep — including `combo?.pairedTeaIds` as an
  // array would change identity on every snapshot tick even when the
  // contents are the same, re-firing the effect needlessly.
  const pairedKey = (combo?.pairedTeaIds ?? []).join(',');
  useEffect(() => {
    const ids = combo?.pairedTeaIds ?? [];

    // ── Curated path: pairedTeaIds non-empty ──────────────────────
    if (ids.length > 0) {
      let cancelled = false;
      (async () => {
        try {
          // Firestore IN supports up to 10 values. Schema caps at 8.
          const snap = await getDocs(
            query(collection(db, 'teas'), where(documentId(), 'in', ids.slice(0, 10))),
          );
          if (cancelled) return;
          // Filter to active only (silently drop deactivated teas), then
          // re-sort to match the order admin specified — Firestore's IN
          // doesn't preserve input order, so we sort here to keep the
          // first chip the admin added showing first.
          const byId = new Map<string, FeaturedTea>();
          snap.forEach((d) => {
            const data = d.data();
            if (data.isActive === false) return;
            if (typeof data.slug !== 'string') return;
            if (typeof data.category !== 'string') return;
            if (typeof data.name !== 'string') return;
            byId.set(d.id, {
              id: d.id,
              slug: data.slug,
              name: data.name,
              category: data.category,
              image: typeof data.image === 'string' ? data.image : undefined,
              price: typeof data.price === 'number' ? data.price : undefined,
            });
          });
          const ordered: FeaturedTea[] = [];
          for (const id of ids) {
            const t = byId.get(id);
            if (t) ordered.push(t);
          }
          setFeatured(ordered);
          setFeaturedError(null);
        } catch (err) {
          console.error('[ComboPairingPage] paired teas fetch failed:', err);
          setFeaturedError(tNow('Curated pairings are temporarily unavailable.'));
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    // ── Fallback path: no curation, show 4 featured teas ──────────
    // Pull 4 active teas ordered by featured-flag (true first), then by
    // name for stable tiebreak. Uses the composite index
    // `teas: isActive(ASC) + featured(DESC) + name(ASC)` declared in
    // firestore.indexes.json.
    const q = query(
      collection(db, 'teas'),
      where('isActive', '==', true),
      orderBy('featured', 'desc'),
      orderBy('name', 'asc'),
      limit(4),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: FeaturedTea[] = [];
        snap.forEach((doc) => {
          const d = doc.data();
          if (
            typeof d.slug === 'string' &&
            typeof d.category === 'string' &&
            typeof d.name === 'string'
          ) {
            out.push({
              id: doc.id,
              slug: d.slug,
              name: d.name,
              category: d.category,
              image: typeof d.image === 'string' ? d.image : undefined,
              price: typeof d.price === 'number' ? d.price : undefined,
            });
          }
        });
        setFeatured(out);
        setFeaturedError(null);
      },
      (err) => {
        console.error('[ComboPairingPage] featured teas listener failed:', err);
        setFeaturedError(tNow('Featured teas are temporarily unavailable.'));
      },
    );
    return () => unsub();
    // pairedKey is the stable string form of pairedTeaIds — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairedKey]);

  // Phase 13 — fire a "pairing viewed" beacon once per combo load so
  // we can see which pairings get traffic. Fired ONLY when we have a
  // resolved combo (skips the loading / 404 paths). The beacon is
  // fire-and-forget; failures are swallowed inside the helper.
  useEffect(() => {
    if (!combo?.slug) return;
    sendPairingViewBeacon(combo.slug);
  }, [combo?.slug]);

  // Show skeleton while loading; 404 if loaded and combo not found.
  if (loading && !combo) return <PairingSkeleton />;
  if (!combo) return <PairingNotFound slug={slug} />;

  const pageUrl = `${SITE_BASE}/pairings/${combo.slug}`;
  const priceText =
    typeof combo.price === 'number' ? formatPrice(combo.price, combo.currency || 'CAD') : '';

  // Phase 27 — Append pairing context to outbound links so the
  // destination page (TeaProfilePage / ProductsPage) can render a
  // breadcrumb that continues the user's actual journey rather than
  // resetting to "Home > Teas > Black Tea > Earl Grey Classic".
  //
  // The two params land in the destination's URL as:
  //   ?fromPairing=spinach-and-feta-strudal
  //   &fromPairingTitle=Spinach%20and%20Feta%20Strudal
  //
  // Page readers (search "fromPairing" in TeaProfilePage / ProductsPage)
  // detect the params and override the default breadcrumb chain with:
  //   Home > Pairings > <pairing title> > <destination>
  //
  // We carry the title in the URL itself (not fetched on the
  // destination) to avoid a second Firestore read just for a label.
  // ~50 extra chars per link is negligible.
  const pairingSlug = combo.slug ?? slug ?? '';
  const pairingTitle = combo.title ?? '';
  // Visible text follows the language; SEO + share links stay English.
  const shown = localizeCombo(combo, lang);
  function withPairingCtx(href: string): string {
    if (!pairingSlug) return href;
    const sep = href.includes('?') ? '&' : '?';
    const qs = new URLSearchParams({
      fromPairing: pairingSlug,
      fromPairingTitle: pairingTitle,
    }).toString();
    return `${href}${sep}${qs}`;
  }

  return (
    <>
      <SeoHead
        title={`${combo.title} — Ele Café Pairings`}
        description={combo.description}
        url={pageUrl}
        image={combo.imageUrl}
        type="product"
        breadcrumbs={[
          { name: 'Home', url: SITE_BASE },
          { name: 'Pairings', url: `${SITE_BASE}/pairings` },
          { name: combo.title, url: pageUrl },
        ]}
      />

      <main id="main-content" className="cpp-bg">
        {/* Breadcrumbs — JSON-LD already in <SeoHead breadcrumbs=…>;
            withoutSchema avoids duplicate ld+json. */}
        <div className="bc-page-wrap">
          <Breadcrumbs
            withoutSchema
            items={[
              { name: 'Home', url: '/' },
              { name: 'Pairings', url: '/pairings' },
              { name: shown.title, url: `/pairings/${combo.slug}` },
            ]}
          />
        </div>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="cpp-hero">
          {/* Image — LazyImage handles missing/failed src by showing the
              tea-name placeholder. We pass combo.title as alt so the
              placeholder reads as "{combo.title} — image coming soon". */}
          <LazyImage
            src={combo.imageUrl}
            alt={shown.title}
            aspectRatio="16/9"
            priority
            className="cpp-hero-image"
          />
          {/* Gradient veil for text legibility */}
          <div className="cpp-hero-veil" />

          {/* Frosted overlay panel — Phase 26: structured to mirror the
              .cg-frosted card from ComboGallery (the inline pairing
              card on TeaProfilePage). Horizontal flex: text-block
              left, price chip right. Eyebrow + title + desc stack
              inside the text-block. Share button is absolutely
              positioned in the top-right corner (corner-icon variant)
              on desktop, or as a pill below on mobile. */}
          <div className="cpp-hero-overlay">
            <ShareButton
              variant="icon"
              title={combo.title}
              url={pageUrl}
              text={combo.description}
              className="cpp-hero-share-corner"
            />
            <div className="cpp-hero-text">
              <p className="cpp-hero-eyebrow">{tr('Curated Pairing')}</p>
              <DietBadges item={combo} variant="onDark" />
              <h1 className="cpp-hero-title">{shown.title}</h1>
              <p className="cpp-hero-desc">{shown.description}</p>
            </div>
            <div className="price-group">
              <div className="cpp-price-chip">{priceText}</div>
              {caloriesText(combo) && <span className="price-cal">{caloriesText(combo)}</span>}
            </div>
            {/* Mobile companion to the corner icon — rendered always
                but CSS hides it on desktop. Pill variant is more
                discoverable on the dark mobile card than an icon. */}
            <ShareButton
              variant="pill"
              title={combo.title}
              url={pageUrl}
              text={combo.description}
              className="cpp-hero-share"
            />
          </div>
        </section>

        {/* ── Pair-with-our-tea callout + CTA ──────────────────────────── */}
        <section className="cpp-section-pair">
          <div className="cpp-section-pair-inner">
            <p className="cpp-eyebrow-gold">{tr('Best with')}</p>
            <h2 className="cpp-section-h2">
              {tr('Pair {item} with one of our premium teas', { item: shown.title.toLowerCase() })}
            </h2>
            <p className="cpp-section-body">
              {tr(
                'We hand-select loose-leaf teas to bring out the best in every pairing — browse our full collection or start with a category that suits your taste.',
              )}
            </p>
            <div className="cpp-cta-row">
              <Link to={withPairingCtx(ROUTES.PRODUCTS)} className="btn btn-lg cpp-cta-dark">
                {tr('Browse all teas')} <ArrowRight size={15} />
              </Link>
            </div>

            {/* Category quick links — natural internal linking, helps SEO too.
                Hover state lives entirely in CSS (.cpp-cat-pill:hover); the
                previous version used onMouseEnter/onMouseLeave to mutate
                style, which is slower and breaks under React StrictMode. */}
            <div className="cpp-cat-row">
              {TEA_CATEGORIES.filter((cat) => visibleCats.has(cat.id)).map((cat) => (
                <Link
                  key={cat.id}
                  to={withPairingCtx(ROUTES.PRODUCTS_CAT(cat.id))}
                  className="cpp-cat-pill"
                >
                  {categoryName(cat, lang)}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── Featured teas grid ─────────────────────────────────────────
            Keeps the customer one tap from a real purchase. Hidden when
            Firestore returns nothing (e.g. brand-new install with no
            seeded teas) — the CTA above is enough on its own. */}
        {featuredError ? (
          <section className="cpp-section-featured">
            <div className="cpp-featured-inner">
              <h3 className="cpp-featured-h3">{tr('Featured teas')}</h3>
              <p className="cpp-featured-empty">{featuredError}</p>
            </div>
          </section>
        ) : (
          featured.length > 0 && (
            <section className="cpp-section-featured">
              <div className="cpp-featured-inner">
                <h3 className="cpp-featured-h3">
                  {/* Headline reflects whether the admin curated this
                    list. When pairedTeaIds is set, customers should
                    see that this is a hand-picked recommendation;
                    when it's a generic fallback, the softer "favourites"
                    line stays in place. */}
                  {(combo.pairedTeaIds ?? []).length > 0
                    ? tNow('Recommended with {name}', {
                        name: localizeCombo(combo, currentLang()).title,
                      })
                    : tr('A few of our favourites')}
                </h3>
                <div className="cpp-featured-grid">
                  {featured.map((tea) => (
                    <Link
                      key={tea.id}
                      to={withPairingCtx(ROUTES.TEA_PROFILE(tea.category, tea.slug))}
                      className="cpp-featured-link"
                    >
                      <LazyImage
                        src={tea.image ?? ''}
                        alt={localizeTea(tea, lang).name}
                        aspectRatio="1/1"
                        borderRadius="14px"
                        className="cpp-featured-image-mb"
                      />
                      <h4 className="cpp-featured-name">{localizeTea(tea, lang).name}</h4>
                      {typeof tea.price === 'number' && (
                        <p className="cpp-featured-price">{formatPrice(tea.price)}</p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )
        )}

        {/* ── Share strip ────────────────────────────────────────────────
            Uses the shared ShareButtons component (IG / TikTok /
            WhatsApp / Copy link). Pre-loaded with this combo's
            pageUrl so a visitor can re-share with one tap. */}
        <section className="cpp-section-share">
          <p className="cpp-share-eyebrow">{tr('Share this pairing')}</p>
          <ShareButtons title={combo.title} url={pageUrl} size="md" />
        </section>
      </main>
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────
function PairingSkeleton() {
  const t = useT();
  return (
    <main id="main-content" className="cpp-bg">
      <div className="cpp-skel-block" aria-busy="true" aria-label={t('Loading pairing')} />
    </main>
  );
}

function PairingNotFound({ slug }: { slug: string }) {
  const t = useT();
  return (
    <main id="main-content" className="cpp-nf-main">
      <div className="cpp-nf-inner">
        <p className="cpp-eyebrow-gold">{t('Pairing not found')}</p>
        <h1 className="cpp-nf-title">{t('We couldn’t find “{slug}”', { slug })}</h1>
        <p className="cpp-nf-body">
          {t(
            'This pairing may have been removed or the link could be incorrect. Browse our teas or check the gallery on any tea profile.',
          )}
        </p>
        <Link to={ROUTES.PRODUCTS} className="btn btn-lg cpp-cta-dark">
          {t('Browse all teas')} <ArrowRight size={15} />
        </Link>
      </div>
    </main>
  );
}

export default ComboPairingPage;
