import type { ReactNode } from 'react';
import { TransitionLink } from './TransitionLink';
import { useSettingsQuery, formatFreeShippingSubline } from '@/hooks/useSettings';
import { useStoreContent } from '@/hooks/useStoreContent';
import { ROUTES, TEA_CATEGORIES } from '@/lib/routes';
import { useLang, useT, type TFunc } from '@/i18n/useT';

import { formatMoneyShort } from '@/lib/money';
import { useVisibleCategoryIds } from '@/hooks/useVisibleCategoryIds';
// ── Static data ───────────────────────────────────────────────────────────────
const ACCOUNT_LINKS = [
  { to: ROUTES.LOGIN, label: 'Sign In' },
  { to: ROUTES.SIGNUP, label: 'Create Account' },
  { to: ROUTES.ORDERS, label: 'My Orders' },
  { to: ROUTES.WISHLIST, label: 'Wishlist' },
  { to: ROUTES.ACCOUNT, label: 'My Account' },
  { to: ROUTES.GIFTS, label: 'Gift Builder' },
];
const INFO_LINKS = [
  { to: ROUTES.CAFE, label: 'Café Menu' },
  { to: ROUTES.ABOUT, label: 'About Us' },
  { to: ROUTES.SHIPPING_POLICY, label: 'Shipping Policy' },
  { to: ROUTES.REFUND_POLICY, label: 'Refund Policy' },
  { to: ROUTES.PRIVACY_POLICY, label: 'Privacy Policy' },
  { to: ROUTES.CONTACT, label: 'Contact Us' },
];
/**
 * Build the perks list inline with current settings. The "Free
 * Shipping" sub-line reads the live threshold from settings, so when
 * admin updates it the marketing copy across the app stays in sync
 * without a code deploy.
 */
function buildPerks(
  s: { freeShippingThreshold?: number; freeSampleWithOrders?: boolean } | undefined,
  t: TFunc,
) {
  return [
    ...(s?.freeSampleWithOrders === false
      ? []
      : [
          {
            title: t('Free Sample'),
            sub: t('With every online order'),
            icon: (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="8" width="18" height="13" rx="2" />
                <path d="M1 8h22" />
                <path d="M12 8V3" />
                <path d="M9 3h6" />
              </svg>
            ),
          },
        ]),
    {
      title: t('Free Shipping'),
      sub: formatFreeShippingSubline(s?.freeShippingThreshold, t, formatMoneyShort),
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      ),
    },
    {
      title: t('Certified Organic'),
      sub: t('Selected teas'),
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
    {
      title: t('Made with Care'),
      sub: t('Vancouver, BC'),
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      ),
    },
  ];
}
/**
 * Build the list of social icons to render based on which URLs the
 * admin has configured in settings. An icon shows up only when its
 * corresponding URL is non-empty — so a fresh deploy with no Pinterest
 * account simply won't render the Pinterest icon, no admin code-change
 * needed when accounts come and go.
 */
type SocialEntry = { label: string; href: string; icon: ReactNode };
function buildSocialList(
  s:
    | {
        socialInstagram?: string;
        socialWhatsapp?: string;
        socialFacebook?: string;
        socialX?: string;
        socialPinterest?: string;
        socialTiktok?: string;
      }
    | undefined,
): SocialEntry[] {
  if (!s) return [];
  const out: SocialEntry[] = [];

  // Order matters — this is the visual order in the footer. Instagram
  // first because it's the most engaged platform; WhatsApp next because
  // customers actively message us there for orders / inquiries; rest in
  // a sensible default.
  if (s.socialInstagram?.trim())
    out.push({
      label: 'Instagram',
      href: s.socialInstagram.trim(),
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      ),
    });
  if (s.socialWhatsapp?.trim())
    out.push({
      label: 'WhatsApp',
      href: s.socialWhatsapp.trim(),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.04 21.785h-.003a9.87 9.87 0 0 1-5.031-1.378l-.36-.214-3.733.978.996-3.638-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413" />
        </svg>
      ),
    });
  if (s.socialTiktok?.trim())
    out.push({
      label: 'TikTok',
      href: s.socialTiktok.trim(),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.84a8.16 8.16 0 0 0 4.77 1.52V6.93a4.85 4.85 0 0 1-1.84-.24z" />
        </svg>
      ),
    });
  if (s.socialFacebook?.trim())
    out.push({
      label: 'Facebook',
      href: s.socialFacebook.trim(),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      ),
    });
  if (s.socialX?.trim())
    out.push({
      label: 'X',
      href: s.socialX.trim(),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    });
  if (s.socialPinterest?.trim())
    out.push({
      label: 'Pinterest',
      href: s.socialPinterest.trim(),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.477 2 12c0 4.236 2.636 7.855 6.356 9.312-.088-.791-.167-2.005.035-2.868.181-.78 1.172-4.97 1.172-4.97s-.299-.598-.299-1.482c0-1.388.806-2.428 1.808-2.428.852 0 1.265.64 1.265 1.408 0 .858-.546 2.14-.828 3.33-.236.995.499 1.806 1.476 1.806 1.772 0 3.137-1.868 3.137-4.564 0-2.387-1.715-4.057-4.163-4.057-2.836 0-4.498 2.126-4.498 4.323 0 .856.33 1.773.741 2.273a.3.3 0 0 1 .069.286c-.076.313-.244.995-.277 1.134-.044.183-.146.222-.336.134-1.249-.581-2.03-2.407-2.03-3.874 0-3.154 2.292-6.052 6.608-6.052 3.469 0 6.165 2.473 6.165 5.776 0 3.447-2.173 6.22-5.19 6.22-1.013 0-1.966-.527-2.292-1.148l-.623 2.378c-.226.869-.835 1.958-1.244 2.621.938.29 1.931.446 2.962.446 5.522 0 10-4.477 10-10S17.522 2 12 2z" />
        </svg>
      ),
    });
  return out;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function Footer() {
  const t = useT();
  const lang = useLang();
  const { data: settings } = useSettingsQuery();
  const store = useStoreContent();
  const visibleCats = useVisibleCategoryIds();
  const year = new Date().getFullYear();

  return (
    <footer className="footer" role="contentinfo">
      {/* ══════════════════════════════════════════════════════
          SECTION 1 — PERKS STRIP
          4-col desktop · 2×2 tablet · stacked mobile
          ══════════════════════════════════════════════════════ */}
      <div className="footer-perks">
        {buildPerks(settings, t).map(({ icon, title, sub }) => (
          <div key={title} className="footer-perk">
            <div className="footer-perk-icon">{icon}</div>
            <div>
              <p className="footer-perk-title">{title}</p>
              <p className="footer-perk-sub">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          SECTION 2 — MAIN COLUMNS
          Desktop: brand(2fr) + Collections + Account + Company
          Tablet: brand full-width top row, 3 cols below
          Mobile: brand full-width, 2-col link grid
          ══════════════════════════════════════════════════════ */}
      <div className="footer-main">
        <div className="footer-grid">
          {/* ── Brand column ───────────────────────────────── */}
          <div>
            <div className="footer-brand-shell">
              {(() => {
                // Footer always has a midnight bg, so it always wants
                // the white-background logo regardless of site theme.
                // Prefer the new logoUrlWhiteBg field; fall back to the
                // legacy footerLogoUrl for unmigrated settings docs.
                const footerLogo: string =
                  (settings as { logoUrlWhiteBg?: string })?.logoUrlWhiteBg ||
                  settings?.footerLogoUrl ||
                  '';
                return footerLogo ? (
                  <img
                    src={footerLogo}
                    alt="Ele Café"
                    className="footer-logo-img"
                    // Explicit width/height attributes are CRITICAL for CLS.
                    // Without them, the browser reserves 0×0 layout space
                    // until the image loads, then expands → footer height
                    // jumps → 0.22 CLS hit measured in production.
                    //
                    // CSS still controls actual display size (height: 52px;
                    // max-width: 140px in design.css). These attributes
                    // just give the browser an aspect-ratio hint to
                    // reserve PROPORTIONAL space upfront — when the image
                    // arrives, no reflow.
                    //
                    // The 140×52 ratio is the desktop max size; mobile
                    // CSS overrides to 120×44 but the aspect ratio
                    // (~2.7:1) is preserved, so reserved space scales
                    // correctly.
                    width={140}
                    height={52}
                    // loading="lazy" is correct here — footer is below
                    // the fold. Removed by request would WORSEN LCP by
                    // forcing eager fetch of a non-critical asset.
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="footer-logo-slot" aria-hidden="true">
                    <p className="footer-brand-name">Ele Café</p>
                  </div>
                );
              })()}
              <span className="footer-brand-city">{t('Tea & Coffee · Vancouver, BC')}</span>
              <p className="footer-brand-text">
                {t(
                  "Curating the world's finest teas for discerning palates. Every cup tells a story of its origin.",
                )}
              </p>

              {/* Social icons — only render platforms admin has configured.
                Empty list → render nothing (preferable to a row of dead
                placeholder icons that link to instagram.com generic). */}
              {(() => {
                const socials = buildSocialList(settings as Parameters<typeof buildSocialList>[0]);
                if (socials.length === 0) {
                  return (
                    <div className="footer-social footer-social--reserve" aria-hidden="true" />
                  );
                }
                return (
                  <div className="footer-social">
                    {socials.map(({ label, href, icon }) => (
                      <a
                        key={label}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={label}
                        className="footer-social-btn"
                      >
                        {icon}
                      </a>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── Collections ────────────────────────────────── */}
          <div>
            <span className="footer-col-title">{t('Collections')}</span>
            {TEA_CATEGORIES.filter((cat) => visibleCats.has(cat.id)).map((cat) => (
              <TransitionLink key={cat.id} to={ROUTES.PRODUCTS_CAT(cat.id)} className="footer-link">
                {t(cat.label)}
              </TransitionLink>
            ))}
            <TransitionLink to={ROUTES.PRODUCTS} className="footer-link footer-link-cta">
              {t('All Teas →')}
            </TransitionLink>
          </div>

          {/* ── Account ────────────────────────────────────── */}
          <div>
            <span className="footer-col-title">{t('Account')}</span>
            {ACCOUNT_LINKS.map(({ to, label }) => (
              <TransitionLink key={to} to={to} className="footer-link">
                {t(label)}
              </TransitionLink>
            ))}
          </div>

          {/* ── Company ────────────────────────────────────── */}
          <div>
            <span className="footer-col-title">{t('Company')}</span>
            {INFO_LINKS.map(({ to, label }) => (
              <TransitionLink key={to} to={to} className="footer-link">
                {t(label)}
              </TransitionLink>
            ))}
            <TransitionLink to={ROUTES.REWARDS} className="footer-link">
              {t('Ele Rewards')}
            </TransitionLink>
            <TransitionLink to={ROUTES.FRANCHISE} className="footer-link">
              {t('Franchise')}
            </TransitionLink>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            SECTION 3 — BOTTOM BAR
            ══════════════════════════════════════════════════════ */}
        <div className="footer-bottom">
          <span>
            {(lang === 'fr' && settings?.footerTextFr) ||
              settings?.footerText ||
              t('© {year} Ele Café. All rights reserved.', { year })}
          </span>
          {(() => {
            // Address line — the store address from Settings, linked to
            // Google Maps (the admin's mapsUrl, else a maps search).
            const addressText = store.address || 'Vancouver, British Columbia, Canada';
            const mapsUrl = store.mapsUrl;
            return mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('Open {address} in Google Maps', { address: addressText })}
                className="footer-address-link"
              >
                {addressText}
              </a>
            ) : (
              <span>{addressText}</span>
            );
          })()}
        </div>
      </div>
    </footer>
  );
}
