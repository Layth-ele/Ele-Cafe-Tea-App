import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CafeMenuFor, cafeSectionForTea } from '@/app/components/cafe/CafeMenuBoard';
import { TeaImage } from '@/app/components/TeaImage';
import { Skeleton } from '@/app/components/ui/skeleton';
import { fetchTea, queryKeys } from '@/lib/firebaseQueries';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router';
import { ROUTES, SITE_BASE } from '@/lib/routes';
import { useT, useTx, tNow, localizeTea, type Lang, localeFor } from '@/i18n/useT';
import { useLanguageStore } from '@/store/languageStore';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { StaleIndicator } from '@/app/components/ui/StaleIndicator';
import { ComboGallery } from '@/app/components/ComboGallery';
import { RelatedTeas } from '@/app/components/RelatedTeas';
import { ShareButtons } from '@/app/components/ShareButtons';
import { EmailVerificationModal } from '@/app/components/modals/EmailVerificationModal';
import { ensureAuth } from '@/contexts/AuthContext';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellRing,
  Coffee,
  Flame,
  Flower2,
  Gift,
  Globe,
  Heart,
  Leaf,
  MapPin,
  Minus,
  Package,
  Plus,
  ShoppingCart,
  Sparkles,
  Star,
  Thermometer,
  Timer,
} from 'lucide-react';
import { useSettingsQuery } from '@/hooks/useSettings';
import {
  doc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  isProductAvailable,
  getAvailabilityLabel,
  getAvailabilityStatus,
} from '@/lib/availability';
import { useCartStore as useCart } from '@/store/cartStore';
import { useWishlist } from '@/store/wishlistStore';
import { requestBackInStock, cancelBackInStock } from '@/lib/backInStock';
import { useCartFly } from '@/hooks/useCartFly';
import { useRecentlyViewed } from '@/store/recentlyViewedStore';
import { useAuthGuard } from '@/guards/useAuthGuard';
import { canUsePush, requestPushPermission } from '@/hooks/usePushNotifications';
import { normalizeSlugFromUrl, toSlug } from '@/lib/slugify';
import { toast } from 'sonner';
import { z } from 'zod';
import { categories } from '@/data/categories';
import { formatPricePerWeight } from '@/lib/priceFormat';
import { CafeTrustLine } from '@/app/components/CafeTrustLine';

// ── Colour palette ─────────────────────────────────────────────────────────────
// Day 5 rewrite: was hex literals like '#0f1c26' which never flipped in dark
// mode, so this entire page rendered with a white surface and dark text
// against the app's dark background. Values are now CSS custom-property
// references that resolve against tokens.css's :root (light) and .dark
// (dark) blocks. All 161 downstream usages (style={{ color: C.text }},
// style={{ background: C.surface }}, etc.) stay identical.
const C = {
  midnight: 'var(--midnight)',
  surface: 'var(--surface)',
  surface2: 'var(--surface-2)',
  bg: 'var(--bg)',
  border: 'var(--border)',
  text: 'var(--text)',
  text2: 'var(--text-2)',
  muted: 'var(--muted)',
  gold: 'var(--gold)',
  goldText: 'var(--gold-text)',
  goldSoft: 'var(--gold-soft)',
  accent20: 'var(--accent-20)',
  // Section colour palette — resolves to sky-blue / lavender in light mode,
  // muted blue/lavender tints against dark surface in dark mode. Dark values
  // live in tokens.css's .dark block.
  servingBg: 'var(--serving-bg)',
  servingBd: 'var(--serving-border)',
  brewBg: 'var(--midnight)', // brew guide uses midnight — in dark
  // mode .dark redefines --midnight to a
  // light colour so brew bg inverts
  // correctly and its light-on-dark text
  // stays readable.
  success: 'var(--success)',
  danger: 'var(--danger)',
};

// ── Star display ───────────────────────────────────────────────────────────────
function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="tpf-stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          fill={i <= Math.round(rating) ? C.gold : 'none'}
          className="tpf-star"
          data-on={i <= Math.round(rating) ? 'true' : 'false'}
        />
      ))}
    </div>
  );
}

// ── Star input — pure pointer events, no state re-renders on hover ─────────────
function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useT();
  return (
    <div className="tpf-star-input" role="group" aria-label={t('Star rating')}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          aria-label={tNow(i === 1 ? '{n} star' : '{n} stars', { n: i })}
          aria-pressed={i === value}
          className="tpf-star-btn"
          // Pointer transforms are imperative because they need to
          // run on every pointerdown/up without re-render. The CSS
          // sets the transition; the inline style mutations supply
          // the target transform value. Filed-only style is `transform`
          // which can't be encoded as a class on a per-event basis.
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'scale(0.82)';
          }}
          onPointerUp={(e) => {
            (e.currentTarget as HTMLElement).style.transform =
              i <= value ? 'scale(1.18)' : 'scale(1)';
          }}
          onPointerLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
          }}
        >
          <Star
            size={30}
            fill={i <= value ? C.gold : 'none'}
            className="tpf-star-input-icon"
            data-on={i <= value ? 'true' : 'false'}
          />
        </button>
      ))}
    </div>
  );
}

interface ReviewDoc {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment?: string;
  createdAt: Timestamp | null;
  /** Set server-side (onReviewWrite) when the reviewer ordered this tea. */
  verifiedPurchase?: boolean;
}

// ── Skeleton ────────────────────────────────────────────────────────────────────
function PageSkeleton() {
  // Phase 5.2: was 8 inline-styled `.skeleton` divs mimicking the
  // tea profile layout (back link, hero image, body lines). Now uses
  // <Skeleton.Block> + <Skeleton.Line> from the namespaced primitive
  // — same layout, no inline style noise, gentle pulse via the
  // shared @keyframes shimmer.
  return (
    <div className="tp-skel-shell">
      <div className="tp-skel-container">
        <Skeleton w={80} h={32} className="tp-skel-back" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <Skeleton className="tp-skel-hero" />
          <div className="tp-skel-body">
            {[80, 200, 60, 120, 48, 48].map((w, i) => (
              <Skeleton.Line key={i} w={`${w}%`} h={i === 1 ? 80 : 20} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────
export function TeaProfilePage() {
  const { data: settingsLive } = useSettingsQuery();
  const t = useT();
  const tx = useTx();
  const { language } = useLanguageStore();
  const { category, slug } = useParams();
  const navigate = useNavigate();
  // Phase 27 — Pairing-aware breadcrumb. When the user arrived from a
  // /pairings/{slug} page, ComboPairingPage attached ?fromPairing= and
  // ?fromPairingTitle= to every outbound link. We use those to swap
  // the default "Home > Teas > <cat> > <tea>" chain for one that
  // continues the user's actual journey: "Home > Pairings >
  // <pairing title> > <tea>".
  const [tpSearchParams] = useSearchParams();
  const fromPairingSlug = tpSearchParams.get('fromPairing');
  const fromPairingTitle = tpSearchParams.get('fromPairingTitle');

  // ── Slug canonicalization (URL robustness) ───────────────────────────────
  // The catalog stores slugs in canonical form (lowercase, alphanumeric +
  // hyphens, no apostrophes). When a user types or shares a non-canonical
  // URL — e.g. `/tea-profile/black/monk's-blend` instead of the canonical
  // `/tea-profile/black/monks-blend` — we still want the page to load AND
  // for the address bar to reflect the canonical form (so subsequent
  // shares are clean and SEO doesn't see duplicate URLs).
  //
  // canonicalSlug is what we query with; if it differs from the URL we
  // do a single `navigate(replace: true)` to fix the address bar without
  // adding a back-button entry.
  const canonicalSlug = slug ? normalizeSlugFromUrl(slug) : '';
  useEffect(() => {
    if (slug && canonicalSlug && slug !== canonicalSlug) {
      navigate(
        `/tea-profile/${encodeURIComponent(category ?? '')}/${encodeURIComponent(canonicalSlug)}`,
        { replace: true },
      );
    }
  }, [slug, canonicalSlug, category, navigate]);
  const { addToCart, items, updateQuantity, removeFromCart } = useCart();
  // Out-of-stock "Notify me" plumbing — see lib/backInStock.ts.
  const wishlistAdd = useWishlist((s) => s.add);
  const wishlistSetNotify = useWishlist((s) => s.setNotify);
  // Phase 10 — +1 fly animation to cart icon on add. Hook is stateless;
  // reduced-motion users skip the fly token automatically.
  const { fly } = useCartFly();
  const { user, requireAuth } = useAuthGuard();
  const qClient = useQueryClient();

  // Phase 5 polish: extract isStale + isFetching for StaleIndicator
  // wiring in the breadcrumb area below. When the cache is stale AND
  // a background refetch is in-flight, the indicator shows so users
  // know fresh data is on the way without dimming the visible page.
  const {
    data: product = null,
    isLoading: loading,
    isStale: productStale,
    isFetching: productFetching,
  } = useQuery({
    // Phase 11 URL fix — query with the canonical slug, not the raw
    // URL slug. Without this, `monk's-blend` in the URL would do an
    // exact-match Firestore lookup for `monk's-blend` and miss the
    // catalog's `monks-blend`. With it, the URL is robust to
    // apostrophes, spaces, uppercase, etc. The effect above redirects
    // the address bar to the canonical form on next paint.
    queryKey: queryKeys.tea(canonicalSlug),
    queryFn: () => fetchTea(canonicalSlug),
    enabled: !!canonicalSlug,
  });
  // Tea text in the current language (French fields from the /teas doc).
  const teaText = localizeTea(product, language as Lang);

  // ── Back-in-stock email request ─────────────────────────────────────────
  // Signed-in: saved straight to /users/{uid}/wishlist/{slug} with
  // notify:true; onInventoryWrite emails once when the tea is restocked.
  // Guests: sent to /login and back with ?notify=1, then saved here.
  const notifyRequested = useWishlist((s) =>
    s.items.some((i) => i.slug === product?.slug && i.notify === true),
  );
  const [notifyBusy, setNotifyBusy] = useState(false);

  const wantsNotify = tpSearchParams.get('notify') === '1';

  const saveNotifyRequest = async (uid: string) => {
    if (!product?.slug) return;
    const slugToSave = product.slug;
    setNotifyBusy(true);
    try {
      wishlistAdd({
        slug: slugToSave,
        name: product.name ?? slugToSave,
        category: product.category ?? 'other',
        image: product.image ?? '',
        priceAtSave: typeof product.price === 'number' ? product.price : 0,
      });
      const item = useWishlist.getState().items.find((i) => i.slug === slugToSave);
      if (!item) throw new Error('wishlist item rejected');
      await requestBackInStock(uid, item);
      wishlistSetNotify(slugToSave, true);
      toast.success(t("You're on the list — we'll email you when it's back."));
    } catch (err) {
      console.warn('[TeaProfilePage] back-in-stock request failed:', err);
      toast.error(t("Couldn't save your request. Please try again."));
    } finally {
      setNotifyBusy(false);
    }
  };

  const handleNotifyMe = () => {
    const returnParams = new URLSearchParams(tpSearchParams);
    returnParams.set('notify', '1');
    requireAuth(() => {
      if (!user?.uid) return;
      // Must be called straight from the click — browsers ignore
      // permission requests that aren't tied to a user gesture.
      // "Notify me" is a high-intent moment to offer phone/desktop push
      // too. No-op when push isn't configured or was already decided.
      if (canUsePush()) void requestPushPermission();
      void saveNotifyRequest(user.uid);
    }, `${window.location.pathname}?${returnParams.toString()}`);
  };

  const handleCancelNotify = async () => {
    if (!user?.uid || !product?.slug) return;
    setNotifyBusy(true);
    try {
      await cancelBackInStock(user.uid, product.slug);
      wishlistSetNotify(product.slug, false);
      toast.info(t("OK — we won't email you about this tea."));
    } catch (err) {
      console.warn('[TeaProfilePage] back-in-stock cancel failed:', err);
      toast.error(t("Couldn't update your request. Please try again."));
    } finally {
      setNotifyBusy(false);
    }
  };

  // Returning from /login with ?notify=1 — finish the request the guest
  // started, then drop the param so a refresh doesn't repeat it.
  useEffect(() => {
    if (!wantsNotify || !user?.uid || !product?.slug) return;
    const rest = new URLSearchParams(tpSearchParams);
    rest.delete('notify');
    const qs = rest.toString();
    navigate(`${window.location.pathname}${qs ? `?${qs}` : ''}`, { replace: true });
    if (!isProductAvailable(product) && !notifyRequested) void saveNotifyRequest(user.uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when all three are ready
  }, [wantsNotify, user?.uid, product?.slug]);

  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  // Arriving from a "Rate your teas" link (…#reviews): scroll to the review
  // form once the page has rendered, like a normal in-page anchor.
  const scrolledToReviews = useRef(false);
  useEffect(() => {
    if (scrolledToReviews.current || window.location.hash !== '#reviews') return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById('reviews');
      if (!el) return;
      scrolledToReviews.current = true;
      el.scrollIntoView({ block: 'start' });
      // Images and sections above finish loading and push the reviews
      // down; land on them again once the page has settled.
      window.setTimeout(() => el.scrollIntoView({ block: 'start' }), 1200);
    }, 400);
    return () => window.clearTimeout(timer);
  });
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  // Verification modal state — review submit gates on emailVerified.
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);

  const submitReviewMutation = useMutation({
    mutationFn: async ({ rating: r, comment: c }: { rating: number; comment: string }) => {
      const reviewRef = doc(db, 'teas', slug ?? '', 'reviews', user!.uid);
      const teaRef = doc(db, 'teas', slug ?? '');
      await runTransaction(db, async (tx) => {
        // Read both docs first — Firestore requires all reads before
        // any writes inside a transaction.
        const [existing, teaSnap] = await Promise.all([tx.get(reviewRef), tx.get(teaRef)]);
        const teaData = teaSnap.data() ?? {};
        const rawOldAvg = (teaData.avgRating as number | undefined) ?? 0;
        const oldCount = (teaData.ratingCount as number | undefined) ?? 0;
        const oldRating = existing.exists()
          ? ((existing.data().rating as number | undefined) ?? 0)
          : 0;
        // Legacy data correction: an earlier writer stored avgRating as
        // a SUM (e.g. 30 for six 5★ reviews) instead of an average. If
        // we see a value above 5 or one that doesn't divide cleanly into
        // [0,5] with the count, treat it as untrustworthy and start a
        // fresh average from this point. Once the new value lands, all
        // subsequent reviews use the corrected average.
        const isLegacy = rawOldAvg > 5 || rawOldAvg < 0;
        const oldAvg = isLegacy ? 0 : rawOldAvg;
        const useCount = isLegacy ? 0 : oldCount;

        tx.set(reviewRef, {
          userId: user!.uid,
          userName: user!.displayName ?? 'Anonymous',
          rating: r,
          comment: c,
          createdAt: serverTimestamp(),
        });

        // Recompute avgRating as a TRUE average (clamped 0-5 per schema).
        // Was previously stored as a sum via plain increment(), which
        // (a) violated the schema's 0-5 constraint after the second review
        // and (b) made the SeoHead aggregate-rating math a no-op
        // (sum × count / count = sum, displayed as the rating value).
        if (existing.exists() && !isLegacy) {
          // Updated review on clean data — count unchanged, sum shifts by (r - oldRating).
          const newSum = oldAvg * useCount - oldRating + r;
          const newAvg = useCount > 0 ? newSum / useCount : 0;
          tx.update(teaRef, { avgRating: Math.max(0, Math.min(5, newAvg)) });
        } else {
          // New review OR legacy reset path. For legacy: treat this as
          // the first reliable review and reset the count to 1.
          const newCount = isLegacy ? 1 : useCount + 1;
          const newSum = isLegacy ? r : oldAvg * useCount + r;
          const newAvg = newSum / newCount;
          tx.update(teaRef, {
            ratingCount: newCount,
            avgRating: Math.max(0, Math.min(5, newAvg)),
          });
        }
      });
    },
    onSuccess: () => {
      toast.success(tNow('Review submitted!'));
      setRating(0);
      setComment('');
      qClient.invalidateQueries({ queryKey: queryKeys.tea(slug ?? '') });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to submit review'),
  });

  const submitting = submitReviewMutation.isPending;
  const cartQty = product?.id ? (items.find((i) => i.id === product.id)?.quantity ?? 0) : 0;

  useEffect(() => {
    if (!slug) return;
    const q = query(
      collection(db, 'teas', slug, 'reviews'),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    setReviewsError(null);
    return onSnapshot(
      q,
      (snap) => setReviews(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as ReviewDoc)),
      (err) => {
        console.error('[TeaProfilePage] reviews subscription failed:', err);
        setReviewsError(tNow('Reviews are temporarily unavailable.'));
      },
    );
  }, [slug]);

  // Phase 11.1 — record this tea in the recently-viewed history.
  // Runs once when the product loads (or when navigating to a
  // different tea). The store de-duplicates by slug and caps at 10.
  const recordRecentlyViewed = useRecentlyViewed((s) => s.record);
  useEffect(() => {
    if (!product?.slug || !product?.name) return;
    recordRecentlyViewed({
      slug: product.slug,
      name: product.name,
      category: product.category ?? 'other',
      image: product.image ?? '',
      priceAtView: typeof product.price === 'number' ? product.price : 0,
    });
  }, [
    product?.slug,
    product?.name,
    product?.category,
    product?.image,
    product?.price,
    recordRecentlyViewed,
  ]);

  const handleAddToCart = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!product) return;
    // Turn 5 defense-in-depth: a user could remove the disabled
    // attribute on the Sold Out button via devtools and click. The
    // visual gate is just visual — this guard is the real one.
    // Server-side onOrderWrite has its own check too (also added in
    // Turn 5), so this is one of two redundant layers.
    if (!isProductAvailable(product)) return;
    // R3 Bugs #11 + #12: addToCart now returns { added, reason? }.
    // Skip the success toast if the store rejected the add (sold out,
    // cap reached) — the store has already toasted the reason.
    const result = addToCart({
      id: product.id ?? '',
      name: product.name ?? 'Unknown',
      nameFr: product.nameFr ?? undefined,
      price: typeof product.price === 'number' ? product.price : 0,
      image: product.image ?? '',
      category: product.category ?? 'other',
      gstApplicable: product.gstApplicable ?? false,
    });
    if (result.added) {
      // Phase 10 — +1 fly to cart icon. Reduced-motion users still see
      // the cart-icon bump and the toast; no flying token.
      fly(e.currentTarget, '+1');
    }
  };
  const handleIncrease = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!product) return;
    // Same defense-in-depth check as handleAddToCart — the stepper is
    // hidden when !isProductAvailable, but a JS-level attack could
    // still reach this handler. Server is the real gate; this is
    // belt-and-braces.
    if (!isProductAvailable(product)) return;
    // No success toast needed for increment — the +/- stepper is its
    // own visual feedback; rejection still gets the store's toast.
    addToCart({
      id: product.id ?? '',
      name: product.name ?? 'Unknown',
      nameFr: product.nameFr ?? undefined,
      price: typeof product.price === 'number' ? product.price : 0,
      image: product.image ?? '',
      category: product.category ?? 'other',
      gstApplicable: product.gstApplicable ?? false,
    });
    fly(e.currentTarget, '+1');
  };
  const handleDecrease = () => {
    if (!product) return;
    if (cartQty <= 1) removeFromCart(product.id ?? '');
    else updateQuantity(product.id ?? '', cartQty - 1);
  };
  const handleSubmitReview = () => {
    requireAuth(async () => {
      if (rating === 0) {
        toast.error(tNow('Please select a star rating'));
        return;
      }
      // Email-verification gate — same shape as CheckoutPage. The
      // /teas/{id}/reviews rule + the avgRating update on /teas
      // both gate on email_verified=true; without this client-side
      // check, the transaction silently rolls back with
      // permission-denied and the user sees a confusing error
      // toast. Refresh User + token first so users who verified in
      // another tab don't get stuck on a stale-token false block.
      if (user) {
        const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
        if (hasPasswordProvider && !user.emailVerified) {
          try {
            const { mod } = await ensureAuth();
            await mod.reload(user);
            await user.getIdToken(true);
          } catch (refreshErr) {
            console.warn('[TeaProfilePage] verification refresh failed:', refreshErr);
          }
          if (!user.emailVerified) {
            setVerifyModalOpen(true);
            return;
          }
        }
      }
      // Validate just the fields the user provides — server-side fields
      // (id, userId, userName, createdAt) are added by the mutation below.
      // The original code validated against a full schema that required
      // those server-side fields, so every submit failed silently.
      const inputSchema = z.object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().min(10, 'Review must be at least 10 characters').max(1000).optional(),
      });
      const r = inputSchema.safeParse({ rating, comment: comment || undefined });
      if (!r.success) {
        toast.error(r.error.issues[0].message);
        return;
      }
      submitReviewMutation.mutate({ rating: r.data.rating, comment: r.data.comment ?? '' });
    });
  };

  if (loading) return <PageSkeleton />;
  if (!product)
    return (
      <>
        <title>{t('Tea Not Found | Ele Cafe')}</title>
        <div className="tpf-notfound">
          <div className="tpf-notfound-inner">
            <h1 className="tpf-notfound-title">{t('Tea Not Found')}</h1>
            <p className="tpf-notfound-msg">{t("The tea you're looking for doesn't exist.")}</p>
            <Link
              to={category ? ROUTES.PRODUCTS_CAT(category) : ROUTES.PRODUCTS}
              className="btn btn-dark"
            >
              {t('Back to Teas')}
            </Link>
          </div>
        </div>
      </>
    );

  const catLabel =
    categories.find((c) => c.id === product.category)?.name ?? product.category ?? 'Tea';
  // Phase 11 URL fix — emit a canonical URL for og:url + rel=canonical
  // even when the DB has drifted slugs. Without this, Google indexes
  // both /monk's-blend and /monks-blend as separate pages.
  const canonicalUrl = `${SITE_BASE}/tea-profile/${encodeURIComponent(product.category ?? 'other')}/${encodeURIComponent(toSlug(product.slug ?? ''))}`;
  const metaDesc =
    product.description?.slice(0, 155) ||
    `${product.name ?? 'Tea'} — premium ${catLabel} from Ele Cafe Vancouver.`;
  const userReview = user ? reviews.find((r) => r.userId === user.uid) : undefined;
  const avgRating =
    reviews.length > 0 ? reviews.reduce((s, r) => s + (r.rating ?? 0), 0) / reviews.length : 0;
  // Two most recent reviews that have a comment, for "What customers say".
  const latestReviews = [...reviews]
    .filter((r) => (r.comment ?? '').trim().length > 0)
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
    .slice(0, 2);
  const goToReviews = (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Serving suggestions — the data may be in legacy format (plain
  // strings) or new format ({ label, enabled? }) depending on when
  // the tea doc was last edited. Normalize then filter out disabled.
  type ServingItem = { label: string; enabled?: boolean };
  const servingVisible: ServingItem[] = (product.servingSuggestions ?? [])
    .map((s: string | ServingItem): ServingItem =>
      typeof s === 'string' ? { label: s, enabled: true } : s,
    )
    .filter((s: ServingItem) => s.enabled !== false);
  const cafeMenuId = cafeSectionForTea(product);
  const freeSample = settingsLive?.freeSampleWithOrders !== false;

  return (
    <>
      <EmailVerificationModal
        open={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        variant="blocked"
        reason="review-blocked"
        onVerified={() => {
          toast.info(tNow('Email verified — please click "Submit Review" again.'));
        }}
      />

      <SeoHead
        title={`${product.name} | ${catLabel} | Ele Café Vancouver`}
        description={metaDesc}
        image={product.image ?? ''}
        url={canonicalUrl}
        type="product"
        breadcrumbs={
          fromPairingSlug && fromPairingTitle
            ? [
                { name: 'Home', url: SITE_BASE },
                { name: 'Pairings', url: `${SITE_BASE}/pairings` },
                { name: fromPairingTitle, url: `${SITE_BASE}/pairings/${fromPairingSlug}` },
                { name: product.name ?? '', url: canonicalUrl },
              ]
            : [
                { name: 'Home', url: SITE_BASE },
                { name: 'Our Teas', url: `${SITE_BASE}/products` },
                { name: catLabel, url: `${SITE_BASE}/products?category=${product.category}` },
                { name: product.name ?? '', url: canonicalUrl },
              ]
        }
        product={{
          name: product.name ?? '',
          description: metaDesc,
          image: product.image ?? '',
          price: product.price ?? 0,
          currency: 'CAD',
          inStock: isProductAvailable(product),
          sku: product.slug,
          category: catLabel,
          avgRating: product.avgRating ?? 0,
          reviewCount: product.ratingCount ?? reviews.length,
        }}
      />

      {/* Visible breadcrumbs — JSON-LD already handled by <SeoHead breadcrumbs=…>
          so we pass withoutSchema to avoid duplicate ld+json scripts.
          Phase 27 — when arriving from a pairing page, the breadcrumb chain
          continues the user's journey through Pairings > <pairing> instead
          of resetting to Teas > <category>. */}
      <div className="bc-page-wrap tp-bc-wrap">
        <Breadcrumbs
          withoutSchema
          items={
            fromPairingSlug && fromPairingTitle
              ? [
                  { name: t('Home'), url: ROUTES.HOME },
                  { name: t('Pairings'), url: ROUTES.PAIRINGS },
                  { name: fromPairingTitle, url: ROUTES.PAIRING(fromPairingSlug) },
                  {
                    name: teaText.name,
                    url: ROUTES.TEA_PROFILE(product.category ?? '', product.slug ?? ''),
                  },
                ]
              : [
                  { name: t('Home'), url: ROUTES.HOME },
                  { name: t('Teas'), url: ROUTES.PRODUCTS },
                  { name: t(catLabel), url: ROUTES.PRODUCTS_CAT(product.category ?? '') },
                  {
                    name: teaText.name,
                    url: ROUTES.TEA_PROFILE(product.category ?? '', product.slug ?? ''),
                  },
                ]
          }
        />
        <StaleIndicator visible={productStale && productFetching} />
      </div>

      <div className="tpf-page">
        {/* ── Back ────────────────────────────────────────────────────────────
            Smart back: if the visitor has meaningful in-app history (e.g.
            they came from /products), we honor it. If they arrived from a
            shared link / search engine / new tab, navigate(-1) would dump
            them off the site entirely — so we route them to a sensible
            destination on elecafe.ca instead.

            Heuristic: window.history.length <= 1 means this is the only
            entry in the tab's history (direct arrival). document.referrer
            being empty or off-site is the same signal. Either way, send
            them to the same-category listing (more useful than home —
            they're clearly tea-shopping). */}
        <div className="tpf-back-wrap">
          {(() => {
            // We have meaningful in-app history when BOTH conditions hold:
            //  1. history.length > 1 — this isn't the only entry in the tab
            //  2. referrer is from our origin — they navigated here from
            //     within elecafe.ca, not via a shared link or search engine
            //
            // Empty referrer is the strongest signal of a shared-link
            // arrival (privacy headers strip the referrer on cross-origin
            // clicks from messaging apps, search engines, etc.). Treating
            // it as "in-app" would defeat the whole point of this fix.
            const hasInAppHistory =
              typeof window !== 'undefined' &&
              window.history.length > 1 &&
              document.referrer !== '' &&
              document.referrer.startsWith(window.location.origin);

            const fallbackDest = product.category
              ? ROUTES.PRODUCTS_CAT(product.category)
              : ROUTES.PRODUCTS;
            const fallbackLabel = product.category
              ? t('All {category}', {
                  category: t(
                    categories.find((c) => c.id === product.category)?.name ?? 'Teas',
                  ).toLowerCase(),
                })
              : t('All teas');

            const onBack = () => {
              if (hasInAppHistory) navigate(-1);
              else navigate(fallbackDest);
            };

            return (
              <button onClick={onBack} className="tpf-back-btn">
                <ArrowLeft size={14} /> {hasInAppHistory ? t('Back') : fallbackLabel}
              </button>
            );
          })()}
        </div>

        {/* ── Hero — 2 col grid ─────────────────────────────────────────────── */}
        <section className="tpf-hero-section">
          <div className="tpf-hero-grid">
            {/* ── Left: image ────────────────────────────────────────────────── */}
            <div className="tpf-hero">
              {/* Phase 4.5 shared-element View Transition: the
                  inner div carries `viewTransitionName: tea-img-{id}`
                  which matches the same name on the product card on
                  /products. When the user clicks a card, the browser
                  animates the card's image into this hero position
                  (and reverses on back). Tied to product.id so each
                  product has a unique pair. */}
              <div
                className="tpf-hero-img"
                // eslint-disable-next-line react/forbid-dom-props -- viewTransitionName is dynamic per-product for the shared-element transition
                style={{
                  ['viewTransitionName' as string]: `tea-img-${product.id ?? product.slug ?? ''}`,
                }}
              >
                {/* Hero image — LCP element on this route. priority=true
                    sets fetchpriority=high + decoding=sync + skips lazy
                    load. variant="hero" uses sizes="(min-width: 768px)
                    50vw, 100vw" so phones download a 320–640w variant
                    instead of the full-resolution 1280w. */}
                <TeaImage product={product} variant="hero" priority className="tpf-hero-img-el" />
                {/* Badges */}
                <div className="tpf-badges">
                  {product.isOrganic && (
                    <span className="tpf-badge tpf-badge-organic">
                      <Leaf size={10} /> {t('Organic')}
                    </span>
                  )}
                  {product.caffeine === 'None' && (
                    <span className="tpf-badge tpf-badge-decaf">{t('✦ Caffeine-free')}</span>
                  )}
                </div>
                {/* Stock — Turn 5 cutover: uses inventory-projected
                    availabilityLabel when present, with a legacy fallback
                    for tea docs that haven't been touched by the trigger
                    yet. getAvailabilityStatus / getAvailabilityLabel
                    encapsulate the precedence. */}
                <div className="tpf-stock-wrap">
                  {(() => {
                    // Hoist the status read so we don't call the helper
                    // three times in the ternary below — one call, then
                    // reuse the result for the data-status mapping.
                    const status = getAvailabilityStatus(product);
                    const dataStatus =
                      status === 'out_of_stock'
                        ? 'oos'
                        : status === 'low_stock'
                          ? 'low'
                          : 'instock';
                    return (
                      <span className="tpf-stock-badge" data-status={dataStatus}>
                        <Package size={11} />
                        {/* Turn 5 cutover: wrap in t() so French customers
                            see translated labels. getAvailabilityLabel
                            returns the dictionary keys verbatim ('In stock',
                            'Low stock', 'Out of stock'), so they look up
                            directly. 'Available' is the rare-case fallback. */}
                        {t(getAvailabilityLabel(product) ?? 'Available')}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* ── Right: info ────────────────────────────────────────────────── */}
            <div className="tpf-info">
              {/* Category + allergens */}
              <div className="tpf-cat-row">
                <span className="tpf-cat-label">{t(catLabel)}</span>
                {product.allergens?.length > 0 && (
                  <span className="tpf-allergens">
                    <AlertTriangle size={11} />{' '}
                    {product.allergens
                      .map((a: string) => a.charAt(0).toUpperCase() + a.slice(1))
                      .join(' · ')}
                  </span>
                )}
              </div>

              {/* Name */}
              <h1 className="tpf-name">{teaText.name || t('Tea')}</h1>

              {/* Stars */}
              {avgRating > 0 && (
                <div className="tpf-rating-row">
                  <Stars rating={avgRating} />
                  <span className="tpf-rating-num">{avgRating.toFixed(1)}</span>
                  <span className="tpf-rating-count">
                    ({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})
                  </span>
                </div>
              )}

              {/* Price (per weight) */}
              <div className="tpf-price-row">
                <span className="tpf-price">
                  {typeof product.price === 'number'
                    ? formatPricePerWeight(product.price, product)
                    : '—'}
                </span>
                <span className="tpf-price-cur">CAD</span>
              </div>

              {/* Gold rule */}
              <div className="tpf-gold-rule" />

              {/* Description */}
              {teaText.description && <p className="tpf-desc">{teaText.description}</p>}

              {/* Spec chips */}
              {(product.caffeine ||
                product.origin ||
                product.brewingTemp ||
                product.brewingTime) && (
                <div className="tpf-specs">
                  {product.caffeine && (
                    <div className="tpf-spec-chip">
                      <Coffee size={14} className="tpf-spec-icon" />
                      <span className="tpf-spec-text">{t(product.caffeine)}</span>
                    </div>
                  )}
                  {product.origin && (
                    <div className="tpf-spec-chip">
                      <Globe size={14} className="tpf-spec-icon" />
                      <span className="tpf-spec-text">
                        {(teaText.origin || product.origin).split('/')[0].trim()}
                      </span>
                    </div>
                  )}
                  {product.brewingTemp && (
                    <div className="tpf-spec-chip">
                      <Thermometer size={14} className="tpf-spec-icon" />
                      <span className="tpf-spec-text">{product.brewingTemp}</span>
                    </div>
                  )}
                  {product.brewingTime && (
                    <div className="tpf-spec-chip">
                      <Timer size={14} className="tpf-spec-icon" />
                      <span className="tpf-spec-text">{product.brewingTime}</span>
                    </div>
                  )}
                </div>
              )}

              {/* CTA — Turn 5 cutover: disables Add-to-Cart when the
                  product is unavailable per the inventory projection.
                  isProductAvailable handles the legacy stock fallback. */}
              <div className="tpf-cta-wrap">
                {!isProductAvailable(product) ? (
                  <button disabled className="tpf-cta tpf-cta-soldout">
                    <ShoppingCart size={17} /> {t('Sold Out')}
                  </button>
                ) : cartQty === 0 ? (
                  <button onClick={handleAddToCart} className="tpf-cta tpf-add-btn">
                    <ShoppingCart size={17} /> {t('Add to Cart')}
                  </button>
                ) : (
                  <div className="tpf-cart-stepper-shell">
                    <button
                      onClick={handleDecrease}
                      className="tpf-cart-minus tpf-cart-step-btn"
                      aria-label={t('Decrease quantity')}
                    >
                      <Minus size={16} />
                    </button>
                    <div className="tpf-cart-step-display">
                      <span className="tpf-cart-step-qty">{cartQty}</span>
                    </div>
                    <button
                      onClick={handleIncrease}
                      className="tpf-cart-plus tpf-cart-step-btn"
                      aria-label={t('Increase quantity')}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                )}
              </div>
              {freeSample && isProductAvailable(product) && (
                <p className="tpf-sample-note">
                  <Gift size={16} aria-hidden="true" />
                  {t('Free tea sample with every online order')}
                </p>
              )}
              <CafeTrustLine variant="product" />

              {/* What customers say — right under the buy box. Real reviews
                  only; with none yet, one small invitation instead. */}
              <div className="tpf-social">
                {reviews.length > 0 ? (
                  <>
                    <div className="tpf-social-head">
                      <span className="tpf-social-title">{t('What customers say')}</span>
                      <a href="#reviews" onClick={goToReviews} className="tpf-social-score">
                        <Stars rating={avgRating} size={14} />
                        <strong>{avgRating.toFixed(1)}</strong>
                        <span>
                          {t(reviews.length === 1 ? '{count} review' : '{count} reviews', {
                            count: reviews.length,
                          })}
                        </span>
                      </a>
                    </div>
                    {latestReviews.map((r) => (
                      <blockquote key={r.id} className="tpf-social-quote">
                        <p>“{r.comment}”</p>
                        <footer>
                          {r.userName}
                          {r.verifiedPurchase && (
                            <span className="tpf-verified">✓ {t('Verified purchase')}</span>
                          )}
                        </footer>
                      </blockquote>
                    ))}
                    <a href="#reviews" onClick={goToReviews} className="tpf-social-more">
                      {t('Read all reviews')} →
                    </a>
                  </>
                ) : (
                  <a href="#reviews" onClick={goToReviews} className="tpf-social-first">
                    <Star size={14} aria-hidden="true" />{' '}
                    {t('No reviews yet — be the first to review this tea')}
                  </a>
                )}
              </div>

              {/* Out-of-stock: back-in-stock email request. */}
              {!isProductAvailable(product) &&
                product.slug &&
                (notifyRequested ? (
                  <div className="tpf-oos-prompt tpf-oos-prompt-saved" role="status">
                    <BellRing size={16} aria-hidden="true" />
                    <div className="tpf-oos-prompt-text">
                      <strong>{t("You're on the list")}</strong>
                      <span>
                        {user?.email
                          ? t("We'll email {email} when it's back.").replace('{email}', user.email)
                          : t("We'll email you when it's back.")}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelNotify}
                      disabled={notifyBusy}
                      className="tpf-oos-prompt-secondary"
                    >
                      {t('Cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="tpf-oos-prompt">
                    <Bell size={16} aria-hidden="true" />
                    <div className="tpf-oos-prompt-text">
                      <strong>{t('Want to know when this is back?')}</strong>
                      <span>
                        {user
                          ? t("We'll send you one email as soon as it's restocked.")
                          : t("Sign in and we'll email you as soon as it's restocked.")}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleNotifyMe}
                      disabled={notifyBusy}
                      aria-busy={notifyBusy}
                      className="tpf-oos-prompt-primary"
                    >
                      {t('Notify me')}
                    </button>
                  </div>
                ))}

              {/* Share */}
              <div>
                <p className="tpf-share-label">{t('Share')}</p>
                <div className="tpf-share-row">
                  <ShareButtons
                    title={t('{name} — premium tea from Ele Café Vancouver', {
                      name: teaText.name,
                    })}
                    url={typeof window !== 'undefined' ? window.location.href : ''}
                    size="sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Description card (DESCRIPTION label style from screenshot) ────── */}
        {teaText.description && (
          <section className="tpf-desc-section">
            <div className="tpf-desc-inner">
              <div className="tpf-desc-card">
                {/* DESCRIPTION pill */}
                <span className="tpf-desc-pill">{t('Description')}</span>
                <p className="tpf-desc-text">{teaText.description}</p>
              </div>
            </div>
          </section>
        )}

        {/* ── Tea Details — blue card section (matches screenshot) ─────────── */}
        {(product.benefits ||
          product.ingredients ||
          product.caffeine ||
          product.antioxidants ||
          product.origin ||
          product.regions) && (
          <section className="tpf-details-section">
            <div className="tpf-details-inner">
              <h2 className="tpf-details-title">{t('Tea Details')}</h2>
              {/* Locale-aware reads — prefer the admin-supplied FR
                  translation when language is French, fall back to
                  the English field if the FR mirror is empty so we
                  never leave a missing-data hole. */}
              {(() => {
                const displayBenefits = teaText.benefits;
                const displayIngredients = teaText.ingredients;
                const displayOrigin = teaText.origin;
                const displayRegions = teaText.regions;
                return (
                  <div>
                    {displayBenefits && (
                      <div className="tpf-detail-section tpf-detail-row">
                        <div className="tpf-detail-row-inner">
                          <span className="ph-icon tpf-detail-row-icon" data-color="leaf">
                            <Leaf size={20} />
                          </span>
                          <div>
                            <p className="tpf-detail-row-title">{t('Benefits')}:</p>
                            <p className="tpf-detail-row-body">{displayBenefits}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {displayIngredients && (
                      <div className="tpf-detail-section tpf-detail-row">
                        <div className="tpf-detail-row-inner">
                          <span className="ph-icon tpf-detail-row-icon" data-color="flower">
                            <Flower2 size={20} />
                          </span>
                          <div>
                            <p className="tpf-detail-row-title">{t('Ingredients')}:</p>
                            <p className="tpf-detail-row-body">{displayIngredients}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {product.caffeine && (
                      <div className="tpf-detail-section tpf-detail-row">
                        <div className="tpf-detail-row-inner">
                          <span className="ph-icon tpf-detail-row-icon" data-color="coffee">
                            <Coffee size={20} />
                          </span>
                          <div>
                            <p className="tpf-detail-row-title">{t('Caffeine')}:</p>
                            <p className="tpf-detail-row-body">
                              {product.caffeine === 'None'
                                ? t('Caffeine Free')
                                : t(product.caffeine)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    {product.antioxidants && (
                      <div className="tpf-detail-section tpf-detail-row">
                        <div className="tpf-detail-row-inner">
                          <span className="ph-icon tpf-detail-row-icon" data-color="fire">
                            <Sparkles size={20} />
                          </span>
                          <div>
                            <p className="tpf-detail-row-title">{t('Antioxidants')}:</p>
                            <p className="tpf-detail-row-body">{t(product.antioxidants)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {displayOrigin && (
                      <div className="tpf-detail-section tpf-detail-row">
                        <div className="tpf-detail-row-inner">
                          <span className="ph-icon tpf-detail-row-icon" data-color="fire">
                            <MapPin size={20} />
                          </span>
                          <div>
                            <p className="tpf-detail-row-title">{t('From')}:</p>
                            <p className="tpf-detail-row-body">{displayOrigin}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {displayRegions && (
                      <div className="tpf-detail-section tpf-detail-row">
                        <div className="tpf-detail-row-inner">
                          <span className="ph-icon tpf-detail-row-icon" data-color="fire">
                            <Globe size={20} />
                          </span>
                          <div>
                            <p className="tpf-detail-row-title">{t('Regions')}:</p>
                            <p className="tpf-detail-row-body">{displayRegions}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {/* ── Brew Guide ───────────────────────────────────── */}
        {(product.brewingTemp || product.brewingTime) && (
          <section className="tpf-brew-section">
            <div className="tpf-brew-inner">
              <div className="tpf-brew-head">
                <span className="tpf-brew-eyebrow">{t('Brew Guide')}</span>
                <h2 className="tpf-brew-title">{t('Perfect Cup')}</h2>
              </div>
              <div className="tpf-brew-grid">
                {product.brewingTemp && (
                  <div className="tpf-brew-card">
                    <div className="tpf-brew-card-icon">
                      <Thermometer size={28} color={C.gold} />
                    </div>
                    <p className="tpf-brew-card-eyebrow">{t('Temperature')}</p>
                    <p className="tpf-brew-card-value">{product.brewingTemp}</p>
                  </div>
                )}
                {product.brewingTime && (
                  <div className="tpf-brew-card">
                    <div className="tpf-brew-card-icon">
                      <Timer size={28} color={C.gold} />
                    </div>
                    <p className="tpf-brew-card-eyebrow">{t('Brew Time')}</p>
                    <p className="tpf-brew-card-value">{product.brewingTime}</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Enjoy at Ele Café — styled like screenshot 2 ─────────────────── */}
        {servingVisible.length > 0 && (
          <section className="tpf-serving-section">
            <div className="tpf-serving-inner">
              <div className="tpf-serving-card">
                <div className="tpf-serving-head">
                  <div className="tpf-serving-icon-wrap">
                    <Heart size={16} color={C.goldText} />
                  </div>
                  <h2 className="tpf-serving-title">{t('Enjoy at Ele Café')}</h2>
                </div>
                <div className="tpf-serving-rule" />
                <div className="tpf-serving-list">
                  {servingVisible.map((s) => (
                    <div key={s.label} className="tpf-serving-pill">
                      <Flame size={14} color={C.gold} />
                      {t(s.label)}
                    </div>
                  ))}
                </div>
                {/* Share strip moved to ComboGallery (pass 15) — sits at the
                    bottom of the page rhythm now, after curated pairings. */}
              </div>
            </div>
          </section>
        )}

        {/* Matcha / hojicha powders: the drinks we make with them in the café. */}
        {cafeMenuId && (
          <div className="cmb-page-wrap">
            <CafeMenuFor id={cafeMenuId} />
          </div>
        )}

        {/* ── Combo Gallery ─────────────────────────────────────────────────
            Global "Pairs with our tea" carousel. Self-contained — the
            component itself reads /comboGalleryItems via onSnapshot
            and the comboGalleryEnabled flag from settings, and renders
            null when either condition isn't met. So no per-tea data is
            passed here other than the personalisation props.

            teaName  — drives the "Try this tea — {name}" overline
            shareUrl — drives the share-strip URL. Window-guarded so
                       SSR/prerender code paths don't crash. */}
        <ComboGallery
          teaName={teaText.name}
          shareUrl={typeof window !== 'undefined' ? window.location.href : undefined}
        />

        {/* ── Reviews ───────────────────────────────────────────────────────── */}
        <section className="tpf-reviews-section" id="reviews">
          <div className="tpf-reviews-inner">
            <div className="tpf-reviews-head">
              <h2 className="tpf-reviews-title">{t('Reviews')}</h2>
              {avgRating > 0 && (
                <div className="tpf-reviews-summary">
                  <Stars rating={avgRating} size={15} />
                  <span className="tpf-reviews-num">{avgRating.toFixed(1)}</span>
                  <span className="tpf-reviews-count">
                    ·{' '}
                    {t(reviews.length === 1 ? '{count} review' : '{count} reviews', {
                      count: reviews.length,
                    })}
                  </span>
                </div>
              )}
            </div>

            {/* Write review */}
            <div className="tpf-review-form">
              {userReview ? (
                <div>
                  <p className="tpf-review-eyebrow">{t('Your review')}</p>
                  <Stars rating={userReview.rating} />
                  {userReview.comment && (
                    <p className="tpf-review-mine-text">{userReview.comment}</p>
                  )}
                </div>
              ) : (
                <div className="tpf-review-stack">
                  <p className="tpf-review-prompt">{t('Rate this tea')}</p>
                  <StarInput value={rating} onChange={setRating} />
                  <textarea
                    className="field tpf-review-textarea"
                    placeholder={t('Share your thoughts (optional)…')}
                    aria-label={t('Review comment')}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    maxLength={1000}
                  />
                  <div className="tpf-review-actions">
                    <button
                      onClick={handleSubmitReview}
                      disabled={submitting || rating === 0}
                      className="tpf-cta tpf-review-submit"
                      data-rating={rating === 0 ? 'empty' : 'set'}
                    >
                      <Star
                        size={13}
                        fill={rating > 0 ? C.gold : 'none'}
                        color={rating > 0 ? C.gold : C.muted}
                      />
                      {submitting ? t('Submitting…') : t('Submit Review')}
                    </button>
                    {!user && (
                      <p className="tpf-review-signin">
                        {tx('{signIn} to leave a review', {
                          signIn: (
                            <Link to={ROUTES.LOGIN} className="tpf-review-signin-link">
                              {t('Sign in')}
                            </Link>
                          ),
                        })}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {reviewsError ? (
              <div className="tpf-reviews-empty">
                <div className="tpf-reviews-empty-icon">
                  <AlertTriangle size={22} className="tpf-reviews-empty-icon-svg" />
                </div>
                <p className="tpf-reviews-empty-msg">{reviewsError}</p>
              </div>
            ) : reviews.length === 0 ? (
              <div className="tpf-reviews-empty">
                <div className="tpf-reviews-empty-icon">
                  <Star size={22} className="tpf-reviews-empty-icon-svg" />
                </div>
                <p className="tpf-reviews-empty-msg">{t('No reviews yet — be the first!')}</p>
              </div>
            ) : (
              <div className="tpf-review-list">
                {reviews.map((r) => (
                  <div key={r.id} className="tpf-review-card">
                    <div className="tpf-review-card-head">
                      <div>
                        <p className="tpf-review-card-name">
                          {r.userName}
                          {r.verifiedPurchase && (
                            <span className="tpf-verified">✓ {t('Verified purchase')}</span>
                          )}
                        </p>
                        <Stars rating={r.rating} size={13} />
                      </div>
                      {r.createdAt && (
                        <span className="tpf-review-card-date">
                          {r.createdAt.toDate().toLocaleDateString(localeFor(language as Lang), {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                    {r.comment && <p className="tpf-review-card-comment">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Related Teas — programmatic SEO + internal linking ───────────
            4 same-category teas, excludes the current one. Real internal
            links create a denser link graph for both crawl discovery and
            user navigation. The component renders nothing if there aren't
            at least 4 sibling teas. */}
        <RelatedTeas currentSlug={slug ?? ''} currentCategory={category ?? ''} />
      </div>
    </>
  );
}
export default TeaProfilePage;
