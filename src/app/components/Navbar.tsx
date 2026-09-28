import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { ChevronRight, Shield, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { TransitionLink } from './TransitionLink';
import { useAuth } from '@/contexts/AuthContext';
import { ensureAuth } from '@/contexts/AuthContext';
import { useSettingsQuery } from '@/hooks/useSettings';
import { useGiftsComingSoon } from '@/hooks/useGiftsComingSoon';
import { filterActiveAnnouncements } from '@/schemas/announcement.schema';
import { useThemeStore } from '@/store/themeStore';
import { useCartStore as useCart } from '@/store/cartStore';
import { useCartDrawer } from '@/store/cartDrawerStore';
import { CartDrawer } from './CartDrawer';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { LanguageToggle } from './LanguageToggle';
import { ROUTES } from '@/lib/routes';
import { lockBodyScroll } from '@/lib/bodyScrollLock';
import { prefetchHandlers, prefetchHandlersForPath } from '@/lib/prefetchRoute';
import { isInventoryEmail } from '@/lib/inventoryAccount';
import { toast } from 'sonner';

import { useT, tNow, useLang } from '@/i18n/useT';

// ── NAV_LINKS factory ─────────────────────────────────────────────────────────
// Gift Builder always shows; while it's switched off in Admin → Settings a
// click says "coming soon" (useGiftsComingSoon) instead of opening it.
const getNavLinks = (t: (key: string) => string) => [
  { to: ROUTES.HOME, label: t('Home'), chevron: false },
  { to: ROUTES.PRODUCTS, label: t('Teas'), chevron: true },
  // Phase 18 — replaces the removed "Discover" entry. Points to the
  // existing /pairings landing page (which lists every curated combo
  // we sell). The label is brand-aligned with the Cormorant Garamond
  // serif voice: "Tea pairings" reads as "tea + pastries together"
  // without being overly literal. French: "Accords gourmands".
  { to: ROUTES.CAFE, label: t('Café Menu'), chevron: false },
  { to: ROUTES.PAIRINGS, label: t('Tea pairings'), chevron: false },
  { to: ROUTES.GIFTS, label: t('Gift Builder'), chevron: false },
  // Side menu only — keeps the desktop top bar uncluttered.
  { to: ROUTES.REWARDS, label: t('Ele Rewards'), chevron: false, drawerOnly: true },
];

// ── Mobile drawer ─────────────────────────────────────────────────────────────
function Drawer({
  open,
  onClose,
  currentUser,
  isAdmin,
  pathname,
  onLogout,
  isInventoryAccount,
}: {
  open: boolean;
  onClose: () => void;
  currentUser: User | null;
  isAdmin: boolean;
  pathname: string;
  onLogout: () => void;
  isInventoryAccount: boolean;
}) {
  const t = useT();
  const giftsClick = useGiftsComingSoon();
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  // ESC to close — small accessibility win the previous version was missing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  const navLinks = getNavLinks(t);
  const allLinks = [
    ...(isInventoryAccount
      ? [{ to: ROUTES.INVENTORY, label: t('Inventory'), chevron: false }]
      : [
          ...navLinks,
          ...(currentUser
            ? [
                { to: ROUTES.ORDERS, label: t('My Orders'), chevron: false },
                { to: ROUTES.WISHLIST, label: t('Wishlist'), chevron: false },
                { to: ROUTES.ACCOUNT, label: t('My Account'), chevron: false },
              ]
            : []),
        ]),
    ...(isAdmin ? [{ to: ROUTES.ADMIN, label: t('Admin Dashboard'), chevron: true }] : []),
  ];

  // Day 16 v4: staggered fade-in. Each link gets an animation-delay
  // calculated from its index so they appear one after another.
  // v7: bumped step from 50ms→90ms after user feedback that
  // the reveal felt too quick. v9: another bump → 130ms step
  // and 380ms base. Each item now takes 540ms to fully settle
  // (set in design.css drawer-link animation-duration).
  const STAGGER_BASE = 380;
  const STAGGER_STEP = 130;
  const footDelay = STAGGER_BASE + allLinks.length * STAGGER_STEP;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={t('Navigation menu')}>
        {/* Day 16 v6: drawer head simplified to just the X close,
            top-left aligned. The reference (teashop.com) doesn't repeat
            the logo here — it's still visible in the header bar
            behind. Cleaner, more whitespace. */}
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose} aria-label={t('Close navigation')}>
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
        <nav className="drawer-nav">
          {allLinks.map(({ to, label, chevron }, i) => (
            <Link
              key={to}
              to={to}
              className={`drawer-link${isActive(to) ? ' active' : ''}`}
              onClick={(e) => {
                if (to === ROUTES.GIFTS && giftsClick(e)) return;
                onClose();
              }}
              style={{ animationDelay: `${STAGGER_BASE + i * STAGGER_STEP}ms` }}
            >
              <span className="nav-drawer-link-inner">
                {to === ROUTES.ADMIN && <Shield size={13} />}
                {label}
              </span>
              {chevron && <ChevronRight size={14} />}
            </Link>
          ))}
        </nav>
        <div
          className="drawer-foot"
          // eslint-disable-next-line react/forbid-dom-props -- foot stagger delay continues the animation sequence after all drawer links
          style={{ animationDelay: `${footDelay}ms` }}
        >
          {currentUser ? (
            <>
              <span className="drawer-foot-email">{currentUser.email}</span>
              <button
                className="drawer-foot-link"
                onClick={async () => {
                  // Phase 24 — await the logout BEFORE closing the
                  // drawer. Previously this was `() => { onLogout();
                  // onClose(); }` — onLogout is async but the call
                  // wasn't awaited, so onClose fired synchronously and
                  // the drawer closed mid-signOut. The drawer-close
                  // didn't break sign-out, but it did make the timing
                  // unpredictable in combination with the (now-removed)
                  // path-gate bug in AuthContext: closing the drawer
                  // sometimes navigated away from a path that had the
                  // listener wired, into a path that didn't.
                  await onLogout();
                  onClose();
                }}
              >
                {t('Sign out')}
              </button>
            </>
          ) : (
            <>
              <Link to={ROUTES.LOGIN} className="drawer-foot-link" onClick={onClose}>
                {t('Sign in')}
              </Link>
              <Link to={ROUTES.SIGNUP} className="drawer-foot-link" onClick={onClose}>
                {t('Create account')}
              </Link>
            </>
          )}

          {/* Day 16 v7: language + theme controls live in the drawer
              now (visible at all viewports — the header on mobile is
              clean as a result). On desktop they ALSO appear in the
              header so the drawer copies are duplicates there, which is
              fine — small cost for a much cleaner mobile header. */}
          <div className="drawer-controls">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Navbar ───────────────────────────────────────────────────────────────

const RESEND_COOLDOWN_SEC = 30;

/**
          applyNavHeight();
 * Email-verification resend banner. Owns its own cooldown state so a
 * rapid-fire click can't spam Firebase with verification email
            applyNavHeight();
 * and remount. Storing the EXPIRY timestamp (not remaining seconds)
 * means we don't have to keep ticking when the tab is backgrounded —
 * we just compute (expiry - now) when the component mounts. Without
 * persistence, a user who clicked Resend then refreshed the page
 * could spam-click the banner over and over, each time burning one
 * Firebase send-email quota unit.
 */
const RESEND_LS_KEY = 'ele:resendVerifyCooldownUntil';

function readCooldownRemaining(): number {
  try {
    const raw = localStorage.getItem(RESEND_LS_KEY);
    if (!raw) return 0;
    const expiry = Number(raw);
    if (!Number.isFinite(expiry)) return 0;
    return Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
  } catch (err) {
    // localStorage may be disabled (private browsing, storage quota
    // exceeded). In that case skip persistence — the in-memory
    // cooldown still defeats double-clicks within a single session.
    console.warn('[Navbar] Failed to read resend cooldown from storage:', err);
    return 0;
  }
}

function writeCooldownExpiry(seconds: number) {
  try {
    localStorage.setItem(RESEND_LS_KEY, String(Date.now() + seconds * 1000));
  } catch (err) {
    console.warn('[Navbar] Failed to persist resend cooldown:', err);
  }
}

function ResendVerifyBanner() {
  const tr = useT();
  // Initialise from localStorage so a refresh / remount doesn't grant
  // the user a fresh button. lazy-init lambda avoids reading storage
  // on every render.
  const [cooldown, setCooldown] = useState<number>(() => readCooldownRemaining());

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN_SEC);
    writeCooldownExpiry(RESEND_COOLDOWN_SEC);
    try {
      const { auth, mod } = await ensureAuth();
      if (!auth.currentUser) return;
      // Pin the continue URL so the verification link doesn't depend
      // on VITE_FIREBASE_AUTH_DOMAIN being a working hostname. See the
      // identical block in AuthContext.signup for the rationale.
      const continueUrl =
        typeof window !== 'undefined' && window.location?.origin
          ? `${window.location.origin}/account?verified=1`
          : undefined;
      await mod.sendEmailVerification(
        auth.currentUser,
        continueUrl ? { url: continueUrl, handleCodeInApp: false } : undefined,
      );
      toast.success(
        tNow(
          'Verification email sent! It can take up to 5 minutes — check your inbox and spam folder.',
        ),
      );
    } catch (err) {
      // Log AND surface a useful message — was previously a generic
      // toast that gave the user no path forward. Common cases:
      //   - auth/too-many-requests: cool-off then retry
      //   - auth/invalid-continue-uri: dev forgot to add the site
      //     origin to Firebase Console → Authorized domains
      console.error('[Navbar] sendEmailVerification failed:', err);
      const code = (err as { code?: string })?.code ?? '';
      const friendlyMsg =
        code === 'auth/too-many-requests'
          ? 'Too many requests — try again in a few minutes.'
          : 'Could not send email — try again shortly.';
      toast.error(friendlyMsg);
      // Failed — reset cooldown so the user can retry sooner.
      setCooldown(0);
      try {
        localStorage.removeItem(RESEND_LS_KEY);
      } catch (err) {
        console.warn('[Navbar] Failed to clear resend cooldown:', err);
      }
    }
  };

  // "I've verified" — explicit refresh button so a user who just clicked
  // the verification link in their email tab can come back to the app
  // tab and check without waiting an hour for the natural token refresh.
  // Reloads the User object (server-side state — picks up
  // emailVerified=true) and force-refreshes the ID token (so Firestore
  // rules see the new claim immediately).
  const [checking, setChecking] = useState(false);
  const handleCheck = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const { auth, mod } = await ensureAuth();
      if (!auth.currentUser) return;
      await mod.reload(auth.currentUser);
      await auth.currentUser.getIdToken(true);
      if (auth.currentUser.emailVerified) {
        toast.success(tNow('Email verified — thanks!'));
        // The banner gate (`!currentUser.emailVerified` in the parent
        // Navbar) will now hide this component on the next React
        // render. No manual hide needed.
      } else {
        toast.info(tNow("Looks like it's not verified yet — check your inbox or click Resend."));
      }
    } catch (err) {
      console.error('[Navbar] verification refresh failed:', err);
      toast.error(tNow('Could not refresh verification status — try again.'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="nav-verify-banner">
      <p className="nav-verify-msg">
        {tr('Please verify your email address to secure your account.')}
      </p>
      <button
        onClick={handleCheck}
        disabled={checking}
        className="nav-verify-btn"
        data-busy={checking ? 'true' : 'false'}
      >
        {checking ? tr('Checking…') : tr("I've verified")}
      </button>
      <button
        onClick={handleResend}
        disabled={cooldown > 0}
        className="nav-verify-btn"
        data-cooldown={cooldown > 0 ? 'true' : 'false'}
      >
        {cooldown > 0 ? tr('Resend in {n}s', { n: cooldown }) : tr('Resend')}
      </button>
    </div>
  );
}

export function Navbar() {
  const t = useT();
  const language = useLang();
  const { currentUser, logout, isAdmin } = useAuth();
  const { data: settings } = useSettingsQuery();
  const { theme } = useThemeStore();
  const totalItems = useCart((s) => s.totalItems);
  const { open: openCartDrawer } = useCartDrawer();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [heroMode, setHeroMode] = useState(true);

  // Theme-aware logo selection. In dark mode we want the white-bg logo
  // (which has a halo so it stays readable on the midnight nav). In
  // light mode we prefer the transparent logo (sits cleanly on cream
  // without a visible white block). Each prefers the new field, falls
  // back to the legacy field, then to the original logoUrl — so settings
  // docs from before the two-logo rollout still display something.
  const navLogoUrl: string =
    theme === 'dark'
      ? (settings as { logoUrlWhiteBg?: string })?.logoUrlWhiteBg ||
        settings?.footerLogoUrl ||
        settings?.logoUrl ||
        ''
      : (settings as { logoUrlNoBg?: string })?.logoUrlNoBg || settings?.logoUrl || '';

  const navLinks = getNavLinks(t);
  const giftsClick = useGiftsComingSoon();
  const isInventoryAccount = isInventoryEmail(currentUser?.email);
  const showCustomerControls = !isInventoryAccount;
  const brandLinkTo = isInventoryAccount ? ROUTES.INVENTORY : ROUTES.HOME;

  useEffect(() => {
    // ── Day-2 rewrite: scroll-race fix ────────────────────────────────────
    // Old handler called setState on every scroll event and fired a fresh
    // setTimeout(20) to measure offsetHeight on every scroll event. At 120
    // Hz that's 120 state writes + 120 pending timers per second, all
    // writing --nav-height, which body { padding-top: var(--nav-height) }
    // consumes, which changes scrollHeight, which re-fires scroll. That
    // feedback loop was the "race between scrolling" the audit flagged.
    //
    // Replacement strategy:
    //  1. ONE requestAnimationFrame throttle per scroll burst.
    //  2. State-change guards — setScrolled/setHeroMode only fire when the
    //     boolean actually flips (i.e. crossing y=16/17). Between crosses,
    //     React sees ZERO commits during scroll.
    //  3. ResizeObserver measures --nav-height exactly when the nav's own
    //     size changes — from class toggles, window resize, font loading,
    //     or announcement text changes. No setTimeout, no timer pileup, no
    //     measurement mid-transition.

    const unit = document.querySelector<HTMLElement>('.nav-fixed-unit');
    if (!unit) return;

    const MIN_NAV_HEIGHT = 132;

    const applyNavHeight = () => {
      const measured = unit.offsetHeight;
      const next = Math.max(MIN_NAV_HEIGHT, measured);
      // --nav-height: body offset, floored so the page doesn't jump when
      // the bar compacts on scroll. --nav-live-height: the bar's actual
      // height right now — what sticky elements must sit under, or a gap
      // (or overlap) appears when the bar shrinks.
      document.documentElement.style.setProperty('--nav-height', next + 'px');
      document.documentElement.style.setProperty('--nav-live-height', measured + 'px');
    };

    let ticking = false;
    let lastScrolled: boolean | null = null;
    let lastHero: boolean | null = null;

    const evaluateScrollState = () => {
      const y = window.scrollY;
      const nextScrolled = y > 16;
      const nextHero = y < 17;
      if (nextScrolled !== lastScrolled) {
        setScrolled(nextScrolled);
        lastScrolled = nextScrolled;
      }
      if (nextHero !== lastHero) {
        setHeroMode(nextHero);
        lastHero = nextHero;
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        evaluateScrollState();
        ticking = false;
      });
    };

    // Initial synchronous pass so first paint is correct.
    evaluateScrollState();
    applyNavHeight();

    // ResizeObserver fires once when observe() is called (reports initial
    // size on next frame), and on every subsequent size change of .nav-
    // fixed-unit. This covers: initial mount, hero ↔ compact class flip
    // (which changes nav height), window resize, font swap, and settings-
    // driven announcement text changes.
    const ro = new ResizeObserver(() => {
      applyNavHeight();
    });
    ro.observe(unit);

    // iOS Safari collapses the URL bar on scroll — that fires `resize`
    // without a scroll event and the viewport height changes. Route resize
    // through the same throttled scroll-state evaluator so classes stay
    // consistent with the new viewport.
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      ro.disconnect();
    };
  }, []);

  const navigate = useNavigate();
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await logout();
      // Drawer might be open if user clicked Sign Out from mobile menu.
      setDrawerOpen(false);
      // Navigate to home so the user lands somewhere sensible. Without
      // this, ProtectedRoute would bounce them to /login if they were
      // on a private page — but if they were on the home page, they'd
      // just see the same page with their account state cleared, which
      // is fine but less explicit.
      navigate(ROUTES.HOME, { replace: true });
    } catch (err) {
      // logout() rarely fails (it's mostly a local state clear), but
      // network errors during token revocation can throw. Surface
      // something rather than silently doing nothing.
      console.error('[Navbar] logout failed', err);
      toast.error(tNow('Could not sign out. Please refresh and try again.'));
    }
  };
  const isActive = (to: string) =>
    to === ROUTES.HOME ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <>
      {/* ── Single fixed unit: announcement strip + navbar ──────────────────
          Both live inside one position:fixed wrapper so they scroll as one,
          always visible, and the total height is measured correctly for
          body padding-top via --nav-height CSS variable.                    */}
      <div
        className="nav-fixed-unit"
        // eslint-disable-next-line react/forbid-dom-props -- z-index var sourced from design tokens; cleanest as inline so the navbar always layers above page content
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 'var(--z-sticky)' as unknown as number,
        }}
      >
        {/* Announcement strip — inside the fixed unit.
            Two-source render: prefers the new structured `announcements`
            array (with optional luxury highlight chips and date-bounded
            visibility); falls back to legacy `announcementText` for
            settings docs that haven't been migrated yet.

            Phase 8 CLS fix: the --nav-height CSS token defaults to 112px
            (nav 60 + announcement 52) in tokens.css so the body's
            padding-top reserves space for the strip from first paint.
            Earlier `settings === undefined` placeholder was unreachable
            because useSettingsQuery has placeholderData: SETTING_DEFAULTS
            which makes data truthy from t=0; the token-side fix is the
            actual lever. */}
        {settings?.announcementEnabled &&
          (() => {
            // Build the active-message list. Each entry has a `highlight`
            // (rendered as a flashy chip) and a `message` (the prose).
            let messages: { id: string; highlight?: string; message: string }[] = [];

            if (Array.isArray(settings.announcements) && settings.announcements.length > 0) {
              // New structured announcements — filter by enabled + date range.
              // French text when the site is in French and it's been filled in.
              const fr = language === 'fr';
              messages = filterActiveAnnouncements(settings.announcements).map((a) => {
                const highlight = (fr && a.highlightFr?.trim()) || a.highlight?.trim();
                return {
                  id: a.id,
                  highlight: highlight || undefined,
                  message: (fr && a.messageFr?.trim()) || a.message,
                };
              });
            } else if (settings?.announcementText) {
              // Legacy text — split on the same separators the old marquee
              // used so existing deploys keep working until admin saves
              // settings (which auto-migrates server-side).
              messages = settings.announcementText
                .split(/[·\-–—]/)
                .map((m: string) => m.trim())
                .filter(Boolean)
                .map((m: string, i: number) => ({ id: `legacy-${i}`, message: t(m) }));
            }

            if (messages.length === 0) return null;

            // Render one copy of the message track. We render it three
            // times below so the CSS marquee animation loops seamlessly
            // (item leaves the right edge before the same item from the
            // next copy enters from the left).
            const itemSet = (copyIdx: number) => (
              <span key={`copy-${copyIdx}`} className="announce-item">
                {messages.map((m) => (
                  <span key={`${copyIdx}-${m.id}`} className="announce-msg">
                    {m.highlight && (
                      // No aria-label here — the span's visible text content
                      // IS the accessible name. Adding `aria-label="Highlight"`
                      // (the previous behaviour) overrode the actual highlight
                      // text with the literal word "Highlight", which a screen
                      // reader would announce instead of the message and which
                      // axe flags as `label-content-name-mismatch`.
                      <span className="announce-highlight">{m.highlight}</span>
                    )}
                    <span className="announce-text">{m.message}</span>
                  </span>
                ))}
              </span>
            );

            return (
              <div
                className="announce"
                role="marquee"
                aria-label={t('Announcements')}
                aria-live="off"
              >
                <div className="announce-track">
                  {itemSet(0)}
                  {itemSet(1)}
                  {itemSet(2)}
                </div>
                <div className="announce-accent-line" aria-hidden="true" />
              </div>
            );
          })()}

        {/* Email verification banner — shows when the user has an
            unverified email AND has a password provider linked.
            providerData is an array of every linked provider; we
            check `.some()` rather than [0] because users with
            multiple providers (e.g. linked Google + password) might
            have password at any index. */}
        {currentUser &&
          !currentUser.emailVerified &&
          currentUser.providerData.some((p) => p.providerId === 'password') &&
          !isInventoryAccount &&
          !location.pathname.startsWith('/inventory') && <ResendVerifyBanner />}

        {/* Navbar — sits below the announcement strip inside the fixed unit */}
        <header role="banner">
          <div
            className={`nav-root${scrolled ? ' scrolled' : ''}${heroMode ? ' hero-mode' : ' compact-mode'}`}
          >
            <div className="nav-inner">
              {/* Left: hamburger + desktop nav links */}
              <div className="nav-left">
                <button
                  className="nav-ham"
                  onClick={() => setDrawerOpen(true)}
                  aria-label={t('Open navigation menu')}
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="15" y2="18" />
                  </svg>
                </button>
                <nav className="nav-links" aria-label={t('Main navigation')}>
                  {isInventoryAccount && (
                    <TransitionLink
                      to={ROUTES.INVENTORY}
                      className={isActive(ROUTES.INVENTORY) ? 'active' : ''}
                      {...prefetchHandlers('inventory')}
                    >
                      {t('Inventory')}
                    </TransitionLink>
                  )}
                  {!isInventoryAccount &&
                    navLinks
                      .filter((l) => !('drawerOnly' in l))
                      .map(({ to, label }) => (
                        <TransitionLink
                          key={to}
                          to={to}
                          className={isActive(to) ? 'active' : ''}
                          onClick={to === ROUTES.GIFTS ? giftsClick : undefined}
                          {...prefetchHandlersForPath(to)}
                        >
                          {label}
                        </TransitionLink>
                      ))}
                  {currentUser && !isInventoryAccount && (
                    <>
                      <TransitionLink
                        to={ROUTES.ORDERS}
                        className={isActive(ROUTES.ORDERS) ? 'active' : ''}
                        {...prefetchHandlers('orders')}
                      >
                        {t('Orders')}
                      </TransitionLink>
                      <TransitionLink
                        to={ROUTES.WISHLIST}
                        className={isActive(ROUTES.WISHLIST) ? 'active' : ''}
                        {...prefetchHandlers('wishlist')}
                      >
                        {t('Wishlist')}
                      </TransitionLink>
                    </>
                  )}
                </nav>
              </div>

              {/* Centre: logo / wordmark */}
              <div className="nav-mid">
                <TransitionLink
                  to={brandLinkTo}
                  className="nav-wordmark"
                  aria-label={isInventoryAccount ? t('Inventory dashboard') : t('Ele Café home')}
                >
                  {navLogoUrl ? (
                    <img
                      src={navLogoUrl}
                      alt="Ele Café"
                      className="nav-logo-img"
                      width={120}
                      height={40}
                    />
                  ) : (
                    'Ele Café'
                  )}
                </TransitionLink>
              </div>

              {/* Right: icons */}
              <div className="nav-right">
                {currentUser && showCustomerControls && <NotificationBell />}
                {/* Day 16 v7: language + theme are hidden in the mobile
                  header (too crowded with 5+ icons) and rendered inside
                  the drawer footer instead. The .nav-mobile-hide wrap
                  lets a single CSS rule pull both off-screen at <768px. */}
                <span className="nav-mobile-hide">
                  <LanguageToggle />
                </span>
                <span className="nav-mobile-hide">
                  <ThemeToggle />
                </span>
                {showCustomerControls && (
                  <>
                    <TransitionLink
                      to={currentUser ? ROUTES.ACCOUNT : ROUTES.LOGIN}
                      className="nav-icon"
                      aria-label={currentUser ? t('My account') : t('Sign in')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </TransitionLink>
                    <button
                      onClick={openCartDrawer}
                      className="nav-icon nav-cart-btn"
                      aria-label={
                        totalItems > 0
                          ? t('Cart — {count} items', { count: totalItems })
                          : t('Cart')
                      }
                      data-cart-icon
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <path d="M16 10a4 4 0 0 1-8 0" />
                      </svg>
                      {totalItems > 0 && (
                        <span className="nav-badge" aria-hidden="true">
                          {totalItems}
                        </span>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>
      </div>
      {/* end nav-fixed-unit */}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentUser={currentUser}
        isAdmin={isAdmin}
        pathname={location.pathname}
        onLogout={handleLogout}
        isInventoryAccount={isInventoryAccount}
      />
      {showCustomerControls && <CartDrawer />}
    </>
  );
}
