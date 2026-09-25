/**
 * useSettings — reads /settings/global from Firestore with fallbacks.
 *
 * Used by: CheckoutPage (shipping math), AdminSettings, storefront chrome.
 *
 * GST note: Tea and most foodstuffs are zero-rated in Canada. GST (5%) is
 * applied only on products with gstApplicable: true (set per-product in
 * AdminProducts).
 * A single in-memory cache prevents repeated reads across page navigations.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursDay } from '@/lib/businessHours';

export const SETTING_DEFAULTS = {
  adminEmail:            'info@elecafe.ca',

  // ── Store identity ──────────────────────────────────────────────────────
  // Schema-fidelity round 2: these fields are written by AdminSettings AND
  // read by Cloud Functions (getStoreSettings → branded email headers,
  // order confirmation emails). Pre-fix they
  // lived ONLY in AdminSettings's DEFAULTS, so the client-side TypeScript
  // type `AppSettings` (derived from SETTING_DEFAULTS via `typeof`) didn't
  // know about them — any client component that tried `settings.storeName`
  // got a phantom-field TypeScript error even though the field was real
  // on disk. Now declared here so the type matches the on-disk shape.
  storeName:             'Ele Café',
  storeEmail:            'info@elecafe.ca',
  // Single store address/phone — shown on the website (contact card,
  // footer, policies, FAQ), sent to Google (LocalBusiness JSON-LD via
  // renderSeo + SeoHead) and printed in emails.
  storeAddress:          '895 West Broadway, Vancouver, BC V5Z 1J9',
  storePhone:            '604-566-9998',
  storeWebsite:          'https://elecafe.ca',
  orderExpiryHours:      72,
  // Free shipping threshold and flat delivery fee. Per the storefront's
  // current model: pickup is always free (selected at checkout); delivery
  // is $12.99 flat unless the order qualifies for free shipping at $100+.
  // Admin can override both via AdminSettings.
  freeShippingThreshold: 100,
  pointsPerDollar:       100,
  minRedemptionPts:      10000,
  creditValuePer1000:    1,
  // Welcome bonus given to brand-new customers when they create an
  // account. Admin can change this value via the Credit System
  // section of /admin/settings — the cloud function reads it from
  // /settings/global before crediting new users. The dollar value
  // shown in WelcomeCreditModal is derived from creditValuePer1000
  // (e.g. 500 pts × $1/1000pts = $0.50).
  welcomeBonusPoints:    500,
  defaultShippingFee:    12.99,

  // ── Email controls ──────────────────────────────────────────────────────
  // Top-level kill switches consumed by `sendEmail` in functions/src/index.ts.
  // Pre-fix these toggles existed only in AdminSettings DEFAULTS and were
  // wired to a form UI, but the server-side sendEmail function never read
  // them — admin set the toggle, the toggle did nothing. Schema-fidelity
  // round 2 wires `sendOrderEmails` as a global kill switch (the per-user
  // `userAcceptsCategory` gate is still applied on top of it).
  //
  // sendShippingEmails gates the ready-for-pickup / shipped / delivered
  // emails (functions/src/index.ts → onOrderEmail).
  sendOrderEmails:       true,
  sendShippingEmails:    true,
  // Email logo override. Cloud Functions read this via getStoreSettings
  // and use it in the email header — admin can override the hosted
  // default by pasting a CDN URL here. Pre-fix this lived only in the
  // CF's defaults; admin had no UI surface to change it.
  emailLogoUrl:          '',
  announcementText:      'Free shipping on all orders · Free sample with every order',
  announcementEnabled:   true,

  /** New rotating announcements list. Each entry has its own message,
   *  optional highlight chip (luxury-flashy style for promo codes,
   *  prices, dates), and optional date range for scheduled campaigns.
   *
   *  When this array is non-empty AND announcementEnabled is true,
   *  the Navbar renders this list and ignores `announcementText`.
   *  Empty array → falls back to legacy `announcementText` rendering
   *  so existing deploys don't lose their marquee on first load. */
  announcements:         [] as Array<{
    id:        string;
    message:   string;
    highlight?: string;
    enabled:   boolean;
    startDate?: string;
    endDate?:   string;
  }>,

  // Day 16 v9: gift-builder feature flag.
  // When false (default), the two CTA buttons on /gifts are disabled
  // for non-admin users, and the GiftBuilderModal closes itself on
  // mount if a non-admin somehow opens it (defensive). Admins can
  // always preview the wizard regardless of this flag — useful for
  // QA before flipping the toggle on. Toggle lives in AdminSettings.
  giftBuilderEnabled:    false,

  // Combo Gallery feature flag — global "pairs with our tea" carousel
  // rendered on every tea profile page between the "Enjoy at Ele Café"
  // section and "Reviews". Off by default so the section stays hidden
  // until the admin actually populates the gallery. Items live in the
  // /comboGalleryItems collection; toggle lives here.
  comboGalleryEnabled:   false,

  // ── Social links ─────────────────────────────────────────────────────────
  // Each social icon in the Footer renders only when its URL is set.
  // Empty string = icon hidden. This way admin can add/remove platforms
  // without code changes — e.g. when a Pinterest account is created,
  // pasting the URL here makes the icon appear automatically.
  //
  // The Instagram handle is @elecafe_ (with trailing underscore) — the
  // older @elecafe handle is not Ele Café's account.
  //
  // For WhatsApp, use the wa.me click-to-chat URL format:
  //   https://wa.me/<E.164 phone with no plus>
  //   e.g. https://wa.me/16045669998
  // Works on iOS, Android, desktop. WhatsApp Business and consumer
  // WhatsApp share the same deep-link scheme.
  socialInstagram:       'https://www.instagram.com/elecafe_' as string,
  socialWhatsapp:        'https://wa.me/16045669998' as string,
  socialFacebook:        '' as string,
  socialX:               '' as string,   // formerly Twitter
  socialPinterest:       '' as string,
  socialTiktok:          '' as string,

  // ── Location / map ───────────────────────────────────────────────────────
  // When set, the footer's address line becomes a clickable link that
  // opens Google Maps to this URL in a new tab. Empty = address renders
  // as plain text. Use the "Share" link from Google Maps to get a stable
  // URL (https://maps.app.goo.gl/...) — those don't go stale.
  mapsUrl:               '' as string,

  // ── Business hours ───────────────────────────────────────────────────────
  // 7-row array (Mon → Sun) consumed by ContactCard. Each row has
  // { day, closed, open: 'HH:MM', close: 'HH:MM' }. The display layer
  // collapses contiguous identical rows into ranges (e.g. "Mon – Fri")
  // — see lib/businessHours.ts for the formatter. Admin edits this via
  // /admin/settings → "Business Hours" section.
  //
  // Default mirrors the previous hardcoded BUSINESS_HOURS in
  // ContactCard, so an existing deploy that hasn't saved settings yet
  // shows the exact same hours customers were already seeing.
  businessHours:         DEFAULT_BUSINESS_HOURS.map(d => ({ ...d })) as BusinessHoursDay[],

  // Uploaded via AdminSettings → Branding section.
  //
  // Two-logo system:
  //   - logoUrlNoBg:     transparent-background logo. Used in the header
  //                      navbar in LIGHT mode (sits cleanly on cream).
  //   - logoUrlWhiteBg:  logo with a white/light background. Used in the
  //                      footer (which has a midnight bg) AND in the
  //                      header navbar when DARK mode is active (a
  //                      transparent-bg logo would disappear on dark).
  //
  // Legacy fields kept for backward compat with deployed settings:
  //   - logoUrl:         was the only header logo before the dark-mode
  //                      split; reads as fallback for logoUrlNoBg
  //   - footerLogoUrl:   was the footer-only logo; reads as fallback
  //                      for logoUrlWhiteBg
  // Admin UI auto-fills new fields from legacy ones on first save so
  // existing deployments transition cleanly.
  logoUrlNoBg:           '' as string,   // transparent — header light mode
  logoUrlWhiteBg:        '' as string,   // white bg    — footer + header dark mode
  // Legacy compat fields ───────────────────────────────────────────────────
  logoUrl:               '' as string,   // legacy: header logo (any bg)
  faviconUrl:            '' as string,   // browser tab icon
  footerLogoUrl:         '' as string,   // legacy: footer logo
  ogImageUrl:            '' as string,   // og:image fallback
  footerText:            '' as string,   // Custom footer text
  footerTextFr:          '' as string,   // French footer text (auto-translated when blank)
};

export type AppSettings = typeof SETTING_DEFAULTS;

// Re-export the pure shipping helpers so callers can keep importing
// `formatFreeShippingSubline` / `calcShippingFee` from useSettings
// without knowing they actually live in lib/shipping.ts. The split
// exists so unit tests can import the helpers without dragging in
// Firebase init (which throws in test envs without VITE_FIREBASE_*).
export { formatFreeShippingSubline, calcShippingFee } from '@/lib/shipping';

// Module-level cache — survives re-renders, cleared on page refresh.
let _cache: AppSettings | null = null;
let _fetching: Promise<AppSettings> | null = null;

export async function fetchSettings(): Promise<AppSettings> {
  if (_cache) return _cache;
  if (_fetching) return _fetching;

  _fetching = getDoc(doc(db, 'settings', 'global')).then(snap => {
    const raw = snap.exists() ? snap.data() : {};
    _cache = { ...SETTING_DEFAULTS, ...(raw as Partial<AppSettings>) };
    _fetching = null;
    return _cache;
  }).catch(() => {
    _fetching = null;
    return SETTING_DEFAULTS;
  });

  return _fetching;
}

/** Invalidates the cache — call after AdminSettings saves. */
export function invalidateSettingsCache() {
  _cache = null;
  _fetching = null;
}

/** React hook — returns settings (defaults immediately, Firestore values shortly after). */
export function useSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>(_cache ?? SETTING_DEFAULTS);

  useEffect(() => {
    if (_cache) { setSettings(_cache); return; }
    fetchSettings().then(setSettings);
  }, []);

  return settings;
}

// ── TanStack Query hook — preferred over manual useEffect ──────────────────

export function useSettingsQuery() {
  return useQuery({
    queryKey: ['settings'],
    queryFn:  fetchSettings,
    staleTime: 10 * 60 * 1000,  // settings rarely change — 10 min
    gcTime:    60 * 60 * 1000,  // keep in cache for 1 hour
    placeholderData: SETTING_DEFAULTS,
  });
}
