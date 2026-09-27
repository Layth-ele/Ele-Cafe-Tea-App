import { Link } from 'react-router';
import { ROUTES, SITE_BASE } from '@/lib/routes';
import { prefetchRoutesForPage } from '@/lib/prefetchRoute';
import { toSlug } from '@/lib/slugify';
import { RecentlyViewedSection } from '@/app/components/RecentlyViewedSection';
import { ArrowRight, Package, ShieldCheck, Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchFeaturedTeas, fetchActiveTeaCount, queryKeys } from '@/lib/firebaseQueries';
import { useSettingsQuery, formatFreeShippingSubline } from '@/hooks/useSettings';
import { useCartStore as useCart } from '@/store/cartStore';
import { useCartFly } from '@/hooks/useCartFly';
import { categories } from '@/data/categories';
import type { Product } from '@/types';
import { LazyImage } from '@/app/components/LazyImage';
import { SeoHead } from '@/app/components/SeoHead';
import { ContactCard } from '@/app/components/ContactCard';
import { Skeleton } from '@/app/components/ui/skeleton';
import { StaleIndicator } from '@/app/components/ui/StaleIndicator';
import { useState, useEffect, useRef, memo } from 'react';
import { isProductAvailable } from '@/lib/availability';
import { formatPricePerWeight } from '@/lib/priceFormat';
import { useT, useTx, localizeTea, useLang } from '@/i18n/useT';
import { ShopByMood, TeaGuide, WhyEleCafe, HomeFaq } from '@/app/components/home/HomeGuideSections';
import { useStoreContent } from '@/hooks/useStoreContent';
import { CafeTrustLine } from '@/app/components/CafeTrustLine';
import {
  HOME_TITLE,
  buildHomeFaq,
  faqJsonLd,
  homeDescription,
  localBusinessLd,
} from '../../../functions/src/lib/storeContent';

import { formatMoneyShort } from '@/lib/money';
import { useVisibleCategoryIds } from '@/hooks/useVisibleCategoryIds';
/** Tea count the server stamped into the page (renderSeo, home only). */
function serverTeaCount(): number | undefined {
  const n = Number(document.querySelector('meta[name="ele:tea-count"]')?.getAttribute('content'));
  return n > 0 ? n : undefined;
}

// ── Animated underline hook — draws a gold rule on scroll into view ────────────
function useDrawLine() {
  const ref = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setDrawn(true);
          obs.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, drawn };
}

// ── Animated rule component ────────────────────────────────────────────────────
function AnimatedRule({
  direction = 'ltr',
  width = '48px',
}: {
  direction?: 'ltr' | 'rtl';
  width?: string;
}) {
  const { ref, drawn } = useDrawLine();
  return (
    <div
      ref={ref}
      className="hp-anim-rule"
      // eslint-disable-next-line react/forbid-dom-props -- width is dynamic per-call (default 48px, sometimes wider)
      style={{ width }}
    >
      <div
        className="hp-anim-rule-fill"
        data-direction={direction}
        data-drawn={drawn ? 'true' : 'false'}
      />
    </div>
  );
}

// ── Overline with animated underline ──────────────────────────────────────────
function SectionHeader({
  overline,
  title,
  direction = 'ltr',
  ruleWidth = '48px',
}: {
  overline: string;
  title: string;
  direction?: 'ltr' | 'rtl';
  ruleWidth?: string;
}) {
  const { ref: overRef, drawn: overDrawn } = useDrawLine();

  return (
    <div className="hp-section-header">
      {/* Overline with draw-in underline */}
      <div ref={overRef} className="hp-section-overline-wrap">
        <span className="overline">{overline}</span>
        <div className="hp-section-underline">
          <div
            className="hp-section-underline-fill"
            data-direction={direction}
            data-drawn={overDrawn ? 'true' : 'false'}
          />
        </div>
      </div>
      <h2 className="hp-section-h2">{title}</h2>
      <AnimatedRule direction={direction} width={ruleWidth} />
    </div>
  );
}

// ── Tea card with stepper ──────────────────────────────────────────────────────
const TeaCard = memo(function TeaCard({
  product,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const t = useT();
  const addToCart = useCart((s) => s.addToCart);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeFromCart = useCart((s) => s.removeFromCart);
  const { fly } = useCartFly();
  const id = product.id ?? '';
  const name = product.name ?? '';
  const nameFr = product.nameFr ?? undefined;
  const displayName = localizeTea(product, useLang()).name;
  const price = product.price ?? 0;
  const image = product.image ?? '';
  const category = product.category ?? '';
  const slug = product.slug ?? id;
  // Turn 6: dropped `stock` constant — inventory projection drives
  // availability now; cart line items no longer carry a stock cap.
  const available = isProductAvailable(product);
  const cat = categories.find((c) => c.id === category)?.name ?? category;
  // Only re-render this card when its own cart quantity changes.
  const cartQty = useCart((s) => s.items.find((i) => i.id === id)?.quantity ?? 0);

  const handleAdd = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Defense-in-depth: disabled attribute is just visual.
    if (!available) return;
    // No drawer — shoppers keep browsing; the cart's own toast offers
    // "View cart" (and "Undo").
    const result = addToCart({
      id,
      name,
      nameFr,
      price,
      image,
      category,
      gstApplicable: product.gstApplicable ?? false,
    });
    if (result.added) fly(e.currentTarget, '+1');
  };
  const handleInc = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!available) return;
    addToCart({
      id,
      name,
      nameFr,
      price,
      image,
      category,
      gstApplicable: product.gstApplicable ?? false,
    });
  };
  const handleDec = (e: React.MouseEvent) => {
    e.preventDefault();
    cartQty <= 1 ? removeFromCart(id) : updateQuantity(id, cartQty - 1);
  };

  return (
    <div className="tea-card">
      <Link to={ROUTES.TEA_PROFILE(category, toSlug(slug))}>
        <div className="tea-card-img">
          <LazyImage
            src={image}
            alt={displayName}
            aspectRatio="1/1"
            objectFit="cover"
            borderRadius="var(--radius-lg)"
            priority={priority}
          />
          {product.isOrganic && <span className="tea-tag tea-tag-green">{t('Organic')}</span>}
          {product.caffeine === 'None' && !product.isOrganic && (
            <span className="tea-tag">{t('Caffeine-free')}</span>
          )}
          {cartQty > 0 && <span className="hp-tc-cart-badge">{cartQty}</span>}
        </div>
      </Link>
      <span className="tea-cat">{t(cat)}</span>
      <Link to={ROUTES.TEA_PROFILE(category, toSlug(slug))}>
        <span className="tea-name">{displayName}</span>
      </Link>
      <span className="tea-price">{formatPricePerWeight(price, product)}</span>
      {!available ? (
        <button className="btn-add hp-tc-soldout" disabled>
          {t('Sold Out')}
        </button>
      ) : cartQty === 0 ? (
        <button className="btn-add tc-add-btn" onClick={handleAdd}>
          {t('Add to Cart')}
        </button>
      ) : (
        <div className="tc-stepper">
          <button className="tc-stepper-btn" onClick={handleDec} aria-label={t('Decrease')}>
            <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
              <path d="M1 1h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <span className="tc-stepper-qty">{cartQty}</span>
          <button className="tc-stepper-btn" onClick={handleInc} aria-label={t('Increase')}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M5 1v8M1 5h8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
});

function CardSkeleton() {
  // Phase 5.2: was 5 inline-styled `.skeleton` divs mimicking the
  // tea-card shape. Now <Skeleton.Card /> from the namespaced primitive
  // — same shape, no inline styles, layout-shift-free transition.
  return <Skeleton.Card />;
}

// ── Page ───────────────────────────────────────────────────────────────────────
export function HomePage() {
  const t = useT();
  const tx = useTx();
  const { data: settings } = useSettingsQuery();
  // Phase 5 polish: wire StaleIndicator. When the cache is stale AND
  // a background refetch is in-flight, the indicator shows so users
  // know fresh data is on the way without dimming the visible list.
  const {
    data: featured = [],
    isLoading: loading,
    isStale: featuredStale,
    isFetching: featuredFetching,
    isError: featuredIsError,
  } = useQuery({
    queryKey: queryKeys.featured(),
    queryFn: fetchFeaturedTeas,
    staleTime: 5 * 60 * 1000,
  });

  // Phase 8 improvement — idle-time prefetch of likely next routes.
  // The home page's most common forward navigations are /products
  // (catalog) and /gifts (curated bundles). Eagerly fetching those
  // chunks during browser idle time (requestIdleCallback) means the
  // first click on either link feels instant — the chunk is already
  // in the cache, no network round trip.
  //
  // prefetchRoutesForPage existed in src/lib/prefetchRoute.ts but was
  // never wired in. Sidecar pattern: fires once on mount, no cleanup
  // needed because the underlying dynamic-import call is idempotent.
  useEffect(() => {
    prefetchRoutesForPage('home');
  }, []);

  // Live active-tea count (aggregation query). Copy omits the number
  // while loading or on error rather than showing a hard-coded one. The
  // server-rendered home page carries the count in <meta name="ele:tea-count">
  // so the hero (the mobile LCP element) paints final text immediately.
  const { data: teaCount = 0 } = useQuery({
    queryKey: queryKeys.teaCount(),
    queryFn: fetchActiveTeaCount,
    staleTime: 10 * 60 * 1000,
    placeholderData: serverTeaCount,
  });
  const store = useStoreContent();
  const lang = useLang();

  const visibleCats = useVisibleCategoryIds(); // Google gets the English FAQ; visitors see their language.
  const faq = buildHomeFaq(store);
  const faqShown = lang === 'fr' ? buildHomeFaq(store, 'fr') : faq;

  const PILLARS = [
    {
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="8" width="18" height="13" rx="2" />
          <path d="M1 8h22M12 8V3M9 3h6" />
        </svg>
      ),
      lucideIcon: <Package size={18} />,
      title: t('Free Sample'),
      sub: t('On every online order'),
      color: '#e8f5ed',
      iconColor: '#2d6e4f',
    },
    {
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      ),
      lucideIcon: <Truck size={18} />,
      title: t('Free Shipping'),
      sub: formatFreeShippingSubline(settings?.freeShippingThreshold, t, formatMoneyShort),
      color: '#e8f2f8',
      iconColor: '#4a7a9b',
    },
    {
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      lucideIcon: <ShieldCheck size={18} />,
      title: t('Certified Organic'),
      sub: t('Selected teas certified'),
      color: '#fef3c7',
      iconColor: '#c47d0a',
    },
  ];

  return (
    <>
      <SeoHead
        title={HOME_TITLE}
        description={homeDescription(teaCount, store)}
        url={SITE_BASE}
        breadcrumbs={[{ name: 'Home', url: SITE_BASE }]}
        extraJsonLd={[faqJsonLd(faq), localBusinessLd(store, SITE_BASE)]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Featured Teas at Ele Café',
            url: `${SITE_BASE}/products`,
            numberOfItems: Math.min(featured.length, 6),
            itemListElement: featured.slice(0, 6).map((p, idx) => ({
              '@type': 'ListItem',
              position: idx + 1,
              name: p.name,
              url: `${SITE_BASE}/tea-profile/${encodeURIComponent(p.category ?? '')}/${encodeURIComponent(toSlug(p.slug ?? ''))}`,
            })),
          })
            // XSS guard: tea names come from Firestore. Escape `</script`
            // and `<!--` so a malicious tea name can't break out of the
            // <script> tag. JSON parsers tolerate `\/` so SEO is intact.
            .replace(/<\/(script|style)/gi, '<\\/$1')
            .replace(/<!--/g, '<\\!--'),
        }}
      />

      <div className="hp-page">
        {/* ══ HERO ══════════════════════════════════════════════════════════ */}
        <section className="hero">
          {/*
            Outer container does NOT have fade-up.

            Why this matters for LCP: the browser measures Largest
            Contentful Paint as the moment the largest visible element
            reaches its final state. When this container had fade-up,
            the LCP timing waited for the 480ms fade animation to
            complete + render delays = 1.5s LCP measured in Lighthouse.

            Removing fade-up here makes the container present
            immediately at full opacity. Inner elements (h1, p, buttons)
            still have staggered fade-ups for visual polish, but the
            LCP measurement is now the inner h1 reaching opacity 1
            after only its 80ms-delay (fade-up-d1) + 480ms duration
            ≈ 560ms, half the previous LCP.

            Visual impact: barely noticeable. The container itself
            held nothing visual — it was just a layout wrapper. The
            content (h1, divider, p, buttons) was always going to fade
            up via their own classes.
          */}
          <div className="container hp-hero-container">
            {/* Day 16 v14: removed the duplicated logo above the hero
                (the navbar already shows it) and the small eyebrow
                strip — the headline alone, larger and on a single
                line, reads more confidently. */}
            {/*
              LCP element. The fade-up classes were REMOVED from this h1
              specifically because Lighthouse measures Largest Contentful
              Paint as the moment the element reaches its FINAL state
              (full opacity, no transform). With fade-up-d1 (80ms delay)
              + fade-up (480ms duration), the LCP timing waited ~560ms
              for the animation to finish — adding ~500ms to LCP for no
              UX benefit.

              The page still feels animated: the gold rule below, the
              sub-paragraph (.fade-up-d2), and the action buttons
              (.fade-up-d3) keep their staggered fade-ups. Only the
              biggest visible element on the page (h1) renders
              immediately at full opacity.
            */}
            <h1 className="hero-title hero-title-flourish">
              <span className="hp-hero-kicker">
                {t('Premium loose leaf tea · Vancouver, Canada')}
              </span>
              {tx('The Art of {fineTea}', { fineTea: <em>{t('Fine Tea')}</em> })}
            </h1>
            {/* Hero rule — always visible, no scroll needed */}
            <div className="hp-hero-rule" />
            {/* No fade: on phones this paragraph is the LCP element (see h1 note). */}
            <p className="hero-sub">
              {teaCount > 0
                ? t(
                    '{count} loose leaf teas — black, green, white, oolong, rooibos, herbal, flower & fruit — shipped across Canada or ready for pickup in Vancouver',
                    { count: teaCount },
                  )
                : t(
                    'Loose leaf teas — black, green, white, oolong, rooibos, herbal, flower & fruit — shipped across Canada or ready for pickup in Vancouver',
                  )}
            </p>
            <div className="hero-btns fade-up fade-up-d3">
              <Link to={ROUTES.PRODUCTS} className="btn btn-dark btn-lg">
                {t('Shop Collection')}
              </Link>
              {store.giftBuilderEnabled && (
                <Link to={ROUTES.GIFTS} className="btn btn-outline btn-lg">
                  {t('Gift Builder')}
                </Link>
              )}
              <Link to={ROUTES.PAIRINGS} className="btn btn-gold btn-lg">
                {t('Tea pairings')}
              </Link>
            </div>
            <CafeTrustLine variant="hero" />
          </div>
        </section>

        {/* ══ PILLARS ═══════════════════════════════════════════════════════ */}
        <section className="hp-pillars-section">
          <div className="home-pillars-grid hp-pillars-grid">
            {PILLARS.map(({ icon, title, sub, color, iconColor }, idx) => (
              <div
                key={title}
                className="pillar icon-hover-bounce hp-pillar"
                data-last={idx === PILLARS.length - 1 ? 'true' : 'false'}
              >
                <div
                  className="pillar-icon hp-pillar-icon"
                  // eslint-disable-next-line react/forbid-dom-props -- per-pillar accent colour from the PILLARS data array
                  style={{ background: color }}
                >
                  <span
                    className="hp-pillar-icon-inner"
                    // eslint-disable-next-line react/forbid-dom-props -- per-pillar icon colour from the PILLARS data array
                    style={{ color: iconColor }}
                  >
                    {icon}
                  </span>
                </div>
                <div>
                  <p className="pillar-title">{title}</p>
                  <p className="pillar-sub">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ══ BEST SELLERS ══════════════════════════════════════════════════ */}
        <section className="section">
          <div className="container">
            <div className="hp-best-header">
              <SectionHeader
                overline={t('Best Sellers')}
                title={t('Our Most-Loved Loose Leaf Teas')}
                direction="ltr"
                ruleWidth="48px"
              />
              <StaleIndicator visible={featuredStale && featuredFetching} />
            </div>
            {featuredIsError ? (
              <div className="empty-state hp-featured-error">
                <div className="empty-state-icon">
                  <span aria-hidden="true">!</span>
                </div>
                <h3>{t('Featured teas are unavailable')}</h3>
                <p>{t('Please refresh the page or try again in a moment.')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-10">
                {loading
                  ? Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)
                  : featured.map((p, i) => <TeaCard key={p.id} product={p} priority={i < 5} />)}
              </div>
            )}
            <div className="hp-see-all-wrap">
              <Link to={ROUTES.PRODUCTS} className="btn btn-outline btn-lg hp-see-all-btn">
                {teaCount > 0 ? t('See All {count} Teas', { count: teaCount }) : t('See All Teas')}{' '}
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>

        {/* ══ RECENTLY VIEWED (Phase 11.1) ══════════════════════════════════
            Surfaces for returning visitors who have viewed teas in
            recent sessions. Renders nothing for first-time visitors
            (the store returns an empty list → component returns null),
            so this section doesn't add visual clutter for new users. */}
        <section className="section-sm hp-recent-section">
          <div className="container">
            <RecentlyViewedSection
              heading={t('Pick up where you left off')}
              limit={6}
              className="hp-recently-viewed"
            />
          </div>
        </section>

        {/* ══ SHOP BY MOOD — benefit / occasion entry points ════════════════ */}
        <ShopByMood giftBuilderEnabled={store.giftBuilderEnabled} />

        {/* ══ EIGHT COLLECTIONS ═════════════════════════════════════════════ */}
        <section className="section-sm hp-collections-section">
          <div className="container">
            <SectionHeader
              overline={t('Browse by Type')}
              title={t('Shop Loose Leaf Tea by Type')}
              direction="rtl"
              ruleWidth="56px"
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {categories
                .filter((cat) => visibleCats.has(cat.id))
                .map((cat) => (
                  <Link key={cat.id} to={ROUTES.PRODUCTS_CAT(cat.id)} className="hp-cat-link">
                    <div
                      className="home-cat-card hp-cat-card"
                      // eslint-disable-next-line react/forbid-dom-props -- per-category accent colour from the categories data array
                      style={{ background: cat.color }}
                    >
                      <div className="hp-cat-overlay" />
                      <span className="hp-cat-label">{t(cat.name)}</span>
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        </section>

        {/* ══ TEA GUIDE — tea types, caffeine & brewing ═════════════════════ */}
        <TeaGuide />

        {/* ══ GIFT CTA ══════════════════════════════════════════════════════ */}
        {store.giftBuilderEnabled && (
          <section className="hp-gift-cta">
            <span className="overline hp-gift-eyebrow">{t('For someone special')}</span>
            <h2 className="hp-gift-h2">{t('Build a Bespoke Tea Gift Box')}</h2>
            <Link to={ROUTES.GIFTS} className="btn btn-lg hp-gift-btn">
              {t('Start Building')} <ArrowRight size={15} />
            </Link>
          </section>
        )}

        {/* ══ WHY ELE CAFÉ + FAQ (FAQPage JSON-LD via SeoHead) ═══════════════ */}
        <WhyEleCafe store={store} />
        <HomeFaq items={faqShown} />

        {/* ══ VISIT US ══════════════════════════════════════════════════════
            Reusable ContactCard. Same component renders on /contact and
            in the Footer. One source of truth for hours/address/contact. */}
        <section className="section-sm hp-visit-section">
          <div className="container hp-visit-container">
            <SectionHeader
              overline={t('Come say hello')}
              title={t('Visit Our Café')}
              direction="ltr"
              ruleWidth="48px"
            />
            <ContactCard variant="full" title="" />
          </div>
        </section>
      </div>
    </>
  );
}

export default HomePage;
