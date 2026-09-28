/**
 * GiftsPage.tsx — Marketing landing for the Gift Bundle Builder.
 *
 * Day 16. Rebuild. Replaces the previous in-page form (which wrote
 * directly to the Firestore `gifts` and `orders` collections) with
 * a marketing-first landing page whose primary CTA opens the new
 * multi-step modal wizard.
 *
 * Public route — no auth wall. Auth gating happens later, at the
 * cart/checkout step (existing /checkout already requires auth).
 *
 * Renders <GiftBuilderModal /> at the bottom; visibility is driven
 * by useGiftBuilderStore.isOpen so any component on the page (or
 * elsewhere) can call open() to pop the wizard.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Gift, Sparkles, Heart, Truck, Lock, LogIn, UserPlus } from 'lucide-react';
import { SeoHead } from '@/app/components/SeoHead';
import { SITE_BASE, ROUTES } from '@/lib/routes';
import { useGiftBuilderStore } from '@/store/giftBuilderStore';
import { GiftBuilderModal } from '@/app/components/gift-builder/GiftBuilderModal';
import { BUNDLES } from '@/app/components/gift-builder/data/bundles';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/contexts/AuthContext';
import { logGiftBuilderEvent } from '@/lib/giftBuilderEvents';
import { formatMoneyShort } from '@/lib/money';
import { useT, useTx } from '@/i18n/useT';
import { lockBodyScroll } from '@/lib/bodyScrollLock';

// ── Step / Trust helpers ───────────────────────────────────────────────────
function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="gp-step">
      <span className="gp-step-num">{n}</span>
      <h3 className="gp-step-title">{title}</h3>
      <p className="gp-step-body">{body}</p>
    </li>
  );
}

function Trust({ icon, label, body }: { icon: React.ReactNode; label: string; body: string }) {
  return (
    <div>
      <div className="gp-trust-icon">{icon}</div>
      <h4 className="gp-trust-label">{label}</h4>
      <p className="gp-trust-body">{body}</p>
    </div>
  );
}

export function GiftsPage() {
  const t = useT();
  const tx = useTx();
  const openBuilder = useGiftBuilderStore((s) => s.open);

  // Day 16 v9: gift-builder is a feature-flagged experience. The two
  // CTA buttons below ("Build Your Tea Bundle" hero CTA + "Start
  // Building" secondary CTA) are disabled for non-admin visitors when
  // settings.giftBuilderEnabled is false. Admins can always preview
  // the wizard so they can QA it before turning the flag on. Toggle
  // lives at /admin/settings → "Gift Builder" section.
  const settings = useSettings();
  const { isAdmin, currentUser } = useAuth();
  const enabled = settings.giftBuilderEnabled || isAdmin;
  const adminPreviewBanner = isAdmin && !settings.giftBuilderEnabled;

  // Free-shipping copy — single source of truth, so admin's threshold
  // change in /admin/settings propagates here, the homepage pillar,
  // the footer perk, and the shipping policy page in one shot.
  // Two flavors:
  //   shippingHeroLine  — appears in the hero subtitle next to "Bundles
  //                       from $15", so we keep it short. "Free
  //                       shipping" alone when threshold is 0; "Free
  //                       shipping over $75" otherwise.
  //   shippingTrustText — full sentence for the Trust card body. Uses
  //                       the shared helper so the wording matches the
  //                       footer perk, homepage pillar, and policy page.
  const freeShipThreshold = Number(settings.freeShippingThreshold) || 0;
  const shippingHeroLine =
    freeShipThreshold <= 0
      ? t('Free shipping')
      : t('Free shipping over {amount}', { amount: formatMoneyShort(freeShipThreshold) });
  const shippingTrustLabel = shippingHeroLine; // same label for the Trust card

  // Wrap openBuilder in a guard so even if the user finds another
  // entry point later, the wizard refuses to open.
  const giftOfferCatalogJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Build a Tea Gift Bundle',
    description: 'Create a personalized tea gift bundle with curated tiers from $15 to $99 CAD.',
    url: `${SITE_BASE}/gifts`,
    mainEntity: {
      '@type': 'OfferCatalog',
      name: 'Ele Café Tea Gift Bundles',
      itemListElement: BUNDLES.map((b) => ({
        '@type': 'Offer',
        name: b.name,
        category: 'Tea Gift Bundle',
        price: Number(b.price).toFixed(2),
        priceCurrency: 'CAD',
        availability: 'https://schema.org/InStock',
        url: `${SITE_BASE}/gifts#${b.slug}`,
      })),
    },
  };

  // Phase 19 — sign-in prompt state. When an unauthenticated user
  // clicks any of the three CTA paths (hero, bundle card, bottom),
  // we show this small modal instead of silently failing. Two-CTA
  // design: "Sign in" and "Create account" both navigate to the
  // auth flows with a `next=/gifts` param so the user lands right
  // back here after authenticating.
  const [signInPromptOpen, setSignInPromptOpen] = useState(false);
  const navigate = useNavigate();

  // Phase 21 — lock the body scroll while the sign-in prompt is open
  // (ref-counted, see src/lib/bodyScrollLock.ts). Without this, the
  // page under the dimmed overlay would still scroll under finger or
  // wheel, which feels broken on a modal dialog.
  useEffect(() => {
    if (!signInPromptOpen) return;
    return lockBodyScroll();
  }, [signInPromptOpen]);

  // ESC closes the prompt. Modal.tsx has a stack-aware version of this
  // for nested modals; we don't need that complexity here since the
  // sign-in prompt is a leaf dialog.
  useEffect(() => {
    if (!signInPromptOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSignInPromptOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [signInPromptOpen]);

  const handleOpen = (source: string, bundleSlug?: string) => {
    void logGiftBuilderEvent(
      'landing_cta_clicked',
      { source, ...(bundleSlug ? { bundleSlug } : {}) },
      currentUser?.uid ?? null,
    );
    if (!enabled) return;
    // Phase 19 — gate on auth BEFORE opening the wizard. Without this,
    // the wizard would open and the modal's own sign-out auto-close
    // would silently kill it (the source of the "nothing happens" bug).
    if (!currentUser) {
      setSignInPromptOpen(true);
      return;
    }
    openBuilder();
  };

  return (
    <div className="gp-page">
      <SeoHead
        title="Build a Tea Gift Bundle | Ele Café Vancouver"
        description="Curate a tea gift box with bundle sizes from $15 to $99. Personalize with a recipient name, occasion, and handwritten card message."
        url={`${SITE_BASE}/gifts`}
        noIndex={!settings.giftBuilderEnabled}
        breadcrumbs={[
          { name: 'Home', url: SITE_BASE },
          { name: 'Gifts', url: `${SITE_BASE}/gifts` },
        ]}
        extraJsonLd={giftOfferCatalogJsonLd}
      />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="gp-hero">
        {/* Eyebrow */}
        <div className="gp-hero-eyebrow">
          <Sparkles size={12} />
          {t('Made for gifting')}
        </div>

        <h1 className="gp-hero-h1">
          {tx('Build a Bespoke {gift}', { gift: <em className="gp-hero-em">{t('Tea Gift')}</em> })}
        </h1>

        <p className="gp-hero-sub">
          {t(
            'Pick a bundle. Choose your teas. Add a handwritten card message. Shipped wrapped, ready to give.',
          )}
        </p>

        {/* Day 16 v9: admin-only banner — visible only when feature is
            disabled but the current user is an admin. Tells them
            they're previewing something customers can't see, and
            points to where to enable it. */}
        {adminPreviewBanner && (
          <div className="gp-admin-banner">
            <Lock size={11} />
            {t('Admin preview — feature is off for customers')}
          </div>
        )}

        {/* Phase 18 — visible-to-everyone notice when the gift builder
            is admin-disabled. Replaces the previous behavior where the
            page rendered all bundle cards but they were silently
            unclickable — now we explicitly tell the customer why. */}
        {!enabled && !isAdmin && (
          <div className="gp-unavailable-notice" role="status">
            <Lock size={14} />
            <span>{t('Coming soon')}</span>
          </div>
        )}

        <button
          onClick={() => handleOpen('hero_cta')}
          disabled={!enabled}
          aria-disabled={!enabled}
          title={enabled ? undefined : t('Not available currently')}
          className="gp-hero-btn"
          data-enabled={enabled ? 'true' : 'false'}
        >
          {enabled ? <Gift size={18} /> : <Lock size={16} />}
          {enabled ? t('Build Your Tea Bundle') : t('Not available currently')}
        </button>

        <p className="gp-hero-foot">
          {t('Bundles from {amount}', { amount: formatMoneyShort(15) })} · {shippingHeroLine}
        </p>
      </section>

      {/* ── Bundle preview row ────────────────────────────────────────────── */}
      <section className="gp-bundle-section">
        <h2 className="gp-bundle-h2">{t('Four sizes, one ritual')}</h2>
        <p className="gp-bundle-sub">
          {t('Pick the bundle that fits the moment — or browse all four in the builder.')}
        </p>

        <div className="gp-bundle-grid">
          {BUNDLES.map((b) => (
            <button
              key={b.slug}
              onClick={() => handleOpen('bundle_card_cta', b.slug)}
              disabled={!enabled}
              aria-disabled={!enabled}
              className="gp-bundle-card"
              data-enabled={enabled ? 'true' : 'false'}
            >
              {/* Day 16 v2: reserved badge row — always present (height
                  fixed at 22px) so cards align even when only some have
                  badges. Previously the badge was absolutely positioned
                  over the title, which clipped longer names like
                  "Connoisseur's Bundle". */}
              <div className="gp-bundle-badge-row">
                {b.badge && <span className="gp-bundle-badge">{t(b.badge)}</span>}
              </div>
              <h3 className="gp-bundle-name">{t(b.name)}</h3>
              <p className="gp-bundle-tag">{t(b.tagline)}</p>
              <div className="gp-bundle-price-row">
                <span className="gp-bundle-price">${b.price}</span>
                <span className="gp-bundle-cur">CAD</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="gp-how-section">
        <div className="gp-how-inner">
          <h2 className="gp-how-h2">{t('How it works')}</h2>
          <ol className="gp-how-grid">
            <Step
              n={1}
              title={t('Pick a bundle')}
              body={t('Four sizes, from a single tea to a seven-tea collection.')}
            />
            <Step
              n={2}
              title={t('Choose your teas')}
              body={t('Browse the full catalog. Add the ones you love.')}
            />
            <Step
              n={3}
              title={t('Personalize')}
              body={t('Recipient, occasion, a heartfelt card message.')}
            />
            <Step
              n={4}
              title={t('We wrap, you give')}
              body={t('Shipped ready to give, anywhere in Canada.')}
            />
          </ol>
        </div>
      </section>

      {/* ── Trust row ─────────────────────────────────────────────────────── */}
      <section className="gp-trust-row">
        <Trust
          icon={<Heart size={20} />}
          label={t('Hand-curated')}
          body={t('Every bundle hand-packed in Vancouver.')}
        />
        <Trust
          icon={<Truck size={20} />}
          label={shippingTrustLabel}
          body={t('Across Canada, ships within 3 business days.')}
        />
        <Trust
          icon={<Gift size={20} />}
          label={t('Wrapped to give')}
          body={t('Includes the printed card message.')}
        />
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────────────────── */}
      <section className="gp-bottom-cta">
        <button
          onClick={() => handleOpen('bottom_cta')}
          disabled={!enabled}
          aria-disabled={!enabled}
          title={enabled ? undefined : t('Not available currently')}
          className="gp-bottom-btn"
          data-enabled={enabled ? 'true' : 'false'}
        >
          {enabled ? <Gift size={16} /> : <Lock size={14} />}
          {enabled ? t('Start Building') : t('Not available currently')}
        </button>
      </section>

      {/* ── The wizard itself — invisible until openBuilder() is called ───── */}
      <GiftBuilderModal />

      {/* Phase 21 — sign-in prompt for guests. Opens when an
          unauthenticated user clicks any "Build" CTA. Two routes:
          existing customers go to /login, new ones to /signup; both
          carry returnUrl=/gifts so the user lands right back here.

          Rendered via createPortal directly into document.body so the
          modal's `position: fixed` is genuinely relative to the
          viewport. Without the portal, the modal would be a
          descendant of <main className="page-enter">, which has
          `animation-fill-mode: both` on the fadeUp keyframe — leaving
          a permanent `transform: translateY(0)` on <main> even after
          the animation finishes. Per CSS spec, any non-`none`
          transform on an ancestor of a fixed-position element turns
          it into position:absolute relative to that ancestor. That
          made the overlay's `inset: 0` cover the entire <main>
          (the whole tall /gifts page), and `align-items: center`
          centered the panel halfway down the document — far below
          the viewport. Portalling to body bypasses all parent
          containing-block trickery in one move. */}
      {signInPromptOpen &&
        createPortal(
          <div
            className="gp-signin-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gp-signin-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSignInPromptOpen(false);
            }}
          >
            <div className="gp-signin-panel">
              <div className="gp-signin-icon" aria-hidden="true">
                <Gift size={28} />
              </div>
              <h2 id="gp-signin-title" className="gp-signin-title">
                {t('Sign in to build your bundle')}
              </h2>
              <p className="gp-signin-body">
                {t(
                  'We’ll save your selections to your account so you can come back and finish later. It only takes a moment.',
                )}
              </p>
              <div className="gp-signin-actions">
                <button
                  type="button"
                  className="btn btn-dark btn-lg gp-signin-primary"
                  onClick={() =>
                    navigate(`${ROUTES.LOGIN}?returnUrl=${encodeURIComponent('/gifts')}`)
                  }
                >
                  <LogIn size={16} aria-hidden="true" />
                  {t('Sign in')}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-lg gp-signin-secondary"
                  onClick={() =>
                    navigate(`${ROUTES.SIGNUP}?returnUrl=${encodeURIComponent('/gifts')}`)
                  }
                >
                  <UserPlus size={16} aria-hidden="true" />
                  {t('Create account')}
                </button>
              </div>
              <button
                type="button"
                className="gp-signin-cancel"
                onClick={() => setSignInPromptOpen(false)}
              >
                {t('Maybe later')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default GiftsPage;
