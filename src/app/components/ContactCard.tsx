/**
 * ContactCard — reusable contact-info component.
 *
 * Address, phone, email, WhatsApp, Instagram, hours and the maps link
 * all come from Admin → Settings (via useStoreContent), so an edit there
 * updates this card everywhere it appears (Contact page, HomePage "Visit
 * Our Café", …) — and matches what renderSeo sends to Google. Rows whose
 * setting is blank (e.g. no WhatsApp) are simply not rendered.
 *
 * Variants:
 *   full     (default) — luxury 3-section gold card with icons.
 *   compact            — stacked single column, smaller icons.
 *   inline             — bare text, no card chrome (footer-style).
 *
 * Hours: settings.businessHours → formatBusinessHours() collapses
 * contiguous identical days ("Monday – Friday  8 am – 9 pm").
 */
import type { CSSProperties } from 'react';
import { Clock, Instagram, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useSettingsQuery } from '@/hooks/useSettings';
import { useStoreContent } from '@/hooks/useStoreContent';
import { addressLines, instagramHandle, phoneTel } from '../../../functions/src/lib/storeContent';
import {
  formatBusinessHours,
  formatBusinessHoursInline,
  normaliseBusinessHours,
  type BusinessHoursDay,
} from '@/lib/businessHours';

import { useT, useLang, tNow } from '@/i18n/useT';
const RESPONSE_NOTE =
  'We typically respond to emails within one business day. For urgent order issues, please call us directly.';

/** Display-ready store contact details. */
interface ContactInfo {
  line1: string; line2: string; full: string;
  /** Transit tip — only for the Broadway location it describes. */
  transitHint: string;
  mapsUrl: string;
  phone: string; tel: string;
  email: string;
  whatsapp: string;
  instagram: string; instagramHandle: string;
}

// ── Public props ────────────────────────────────────────────────────────────
export interface ContactCardProps {
  /** Visual layout. Default: 'full'. */
  variant?: 'full' | 'compact' | 'inline';
  /** Show the "we respond within one business day…" note below the
   *  card. Defaults to true on full/compact, false on inline. */
  showResponseNote?: boolean;
  /** Optional title override. Defaults to 'Visit Us'. Pass empty string
   *  to suppress. Inline variant ignores this. */
  title?: string;
  /** Optional inline-style override on the outer wrapper. Useful for
   *  margin/maxWidth tweaks in the parent's layout. */
  style?: CSSProperties;
}

export function ContactCard({
  variant = 'full',
  showResponseNote,
  title,
  style,
}: ContactCardProps) {
  const { data: settings } = useSettingsQuery();
  const store = useStoreContent();
  const [line1, line2] = addressLines(store.address);
  const info: ContactInfo = {
    line1, line2, full: store.address,
    transitHint: /\b895 W(est|\.)? Broadway\b/i.test(store.address) ? 'Near Broadway-City Hall SkyTrain' : '',
    mapsUrl: store.mapsUrl,
    phone: store.phone, tel: phoneTel(store.phone),
    email: store.email,
    whatsapp: store.whatsappUrl,
    instagram: store.instagramUrl, instagramHandle: instagramHandle(store.instagramUrl) || 'Instagram',
  };

  // Normalize the settings-supplied hours array (defends against
  // partial data) by falling back to defaults per-row.
  const hoursRows = normaliseBusinessHours(
    (settings as { businessHours?: BusinessHoursDay[] })?.businessHours,
  );
  const lang = useLang();
  const businessHoursDisplay = formatBusinessHours(hoursRows, lang);
  const businessHoursInline  = formatBusinessHoursInline(hoursRows, lang);

  // Default title per variant
  const resolvedTitle = title ?? (variant === 'inline' ? '' : tNow('Visit Us'));

  // Default for response note: shown on full/compact, hidden on inline
  const showNote = showResponseNote ?? (variant !== 'inline');

  if (variant === 'inline') {
    return <ContactCardInline info={info} style={style} showNote={showNote} businessHoursInline={businessHoursInline} />;
  }
  if (variant === 'compact') {
    return <ContactCardCompact info={info} title={resolvedTitle} showNote={showNote} style={style} businessHours={businessHoursDisplay} />;
  }
  return <ContactCardFull info={info} title={resolvedTitle} showNote={showNote} style={style} businessHours={businessHoursDisplay} />;
}

// ── Variant: Full ───────────────────────────────────────────────────────────
//
// Luxury 3-section card. Same gold-tinted vocabulary as the
// In-Store Pickup card (ShippingPolicyPage), Quality Guarantee
// (RefundPolicyPage), and Your Rights (PrivacyPolicyPage) so all
// premium customer-facing blocks feel like a cohesive set.
function ContactCardFull({
  info,
  title,
  showNote,
  style,
  businessHours,
}: {
  info: ContactInfo;
  title: string;
  showNote: boolean;
  style?: CSSProperties;
  businessHours: ReadonlyArray<{ label: string; range: string }>;
}) {
  const t = useT();
  return (
    /* The `style` prop is a public API of ContactCard — callers (e.g.
       a parent page) use it for margin/maxWidth tweaks. Genuinely
       dynamic; not a static class. */
    /* eslint-disable-next-line react/forbid-dom-props */
    <div className="cc-card cc-card-full" style={style}>
      {title && (
        <div className="cc-title-block">
          <p className="cc-eyebrow">{t('Find us')}</p>
          <h2 className="cc-title">{title}</h2>
        </div>
      )}

      <div className="cc-grid">
        {/* ── Visit Us ── */}
        <ContactSection
          icon={<MapPin size={22} className="cc-icon-deep" aria-hidden="true" />}
          label={t('Visit Us')}
        >
          <a
            href={info.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('Open {address} in Google Maps', { address: info.full })}
            className="cc-address"
          >
            {info.line1}
            <br />
            {info.line2}
          </a>
          {info.transitHint && <p className="cc-transit-hint">{t(info.transitHint)}</p>}
        </ContactSection>

        {/* ── Hours ── */}
        <ContactSection
          icon={<Clock size={22} className="cc-icon-deep" aria-hidden="true" />}
          label={t('Hours')}
        >
          {businessHours.map(({ label, range }) => (
            <div key={label} className="cc-hours-row">
              <span className="cc-hours-label">{label}</span>
              <span className="cc-hours-range">{range}</span>
            </div>
          ))}
        </ContactSection>

        {/* ── Get in Touch ── */}
        <ContactSection
          icon={<Phone size={22} className="cc-icon-deep" aria-hidden="true" />}
          label={t('Get in Touch')}
        >
          {info.tel && (
            <a href={`tel:${info.tel}`} className="cc-link-touch">
              <Phone size={14} aria-hidden="true" className="cc-link-tail" />
              {info.phone}
            </a>
          )}
          {info.whatsapp && (
            <a
              href={info.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="cc-link-touch"
            >
              <MessageCircle size={14} aria-hidden="true" className="cc-link-tail" />
              WhatsApp
            </a>
          )}
          {info.email && (
            <a href={`mailto:${info.email}`} className="cc-link-mail">
              <Mail size={14} aria-hidden="true" />
              {info.email}
            </a>
          )}
          {info.instagram && (
            <a
              href={info.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="cc-link-touch"
            >
              <Instagram size={14} aria-hidden="true" className="cc-link-tail" />
              {info.instagramHandle}
            </a>
          )}
        </ContactSection>
      </div>

      {showNote && <p className="cc-note">{t(RESPONSE_NOTE)}</p>}
    </div>
  );
}

// ── Variant: Compact ────────────────────────────────────────────────────────
//
// Stacked single column. Same gold card chrome as full, but the three
// sections render vertically with smaller icons and tighter spacing.
function ContactCardCompact({
  info,
  title,
  showNote,
  style,
  businessHours,
}: {
  info: ContactInfo;
  title: string;
  showNote: boolean;
  style?: CSSProperties;
  businessHours: ReadonlyArray<{ label: string; range: string }>;
}) {
  const t = useT();
  return (
    /* User-provided `style` pass-through; same rationale as the full
       variant — public API for parent layout tweaks. */
    /* eslint-disable-next-line react/forbid-dom-props */
    <div className="cc-card cc-card-compact" style={style}>
      {title && <h3 className="cc-compact-title">{title}</h3>}

      <div className="cc-compact-stack">
        {/* Address */}
        <div className="cc-compact-row cc-compact-row-top">
          <MapPin size={18} className="cc-compact-icon-top" aria-hidden="true" />
          <div className="cc-compact-content">
            <a
              href={info.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('Open {address} in Google Maps', { address: info.full })}
              className="cc-compact-address"
            >
              {info.full}
            </a>
            {info.transitHint && <p className="cc-compact-hint">{t(info.transitHint)}</p>}
          </div>
        </div>

        {/* Hours */}
        <div className="cc-compact-row cc-compact-row-top">
          <Clock size={18} className="cc-compact-icon-top" aria-hidden="true" />
          <div className="cc-compact-hours">
            {businessHours.map(({ label, range }) => (
              <div key={label} className="cc-compact-hours-row">
                <span className="cc-hours-label">{label}</span>
                <span className="cc-hours-range">{range}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Phone */}
        {info.tel && <div className="cc-compact-row">
          <Phone size={18} className="cc-compact-icon" aria-hidden="true" />
          <a href={`tel:${info.tel}`} className="cc-compact-link">{info.phone}</a>
        </div>}

        {/* WhatsApp */}
        {info.whatsapp && <div className="cc-compact-row">
          <MessageCircle size={18} className="cc-compact-icon" aria-hidden="true" />
          <a
            href={info.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="cc-compact-link"
          >
            WhatsApp
          </a>
        </div>}

        {/* Email */}
        {info.email && <div className="cc-compact-row">
          <Mail size={18} className="cc-compact-icon" aria-hidden="true" />
          <a href={`mailto:${info.email}`} className="cc-compact-link-mail">{info.email}</a>
        </div>}

        {/* Instagram */}
        {info.instagram && <div className="cc-compact-row">
          <Instagram size={18} className="cc-compact-icon" aria-hidden="true" />
          <a
            href={info.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="cc-compact-link"
          >
            {info.instagramHandle}
          </a>
        </div>}
      </div>

      {showNote && <p className="cc-compact-note">{t(RESPONSE_NOTE)}</p>}
    </div>
  );
}

// ── Variant: Inline ─────────────────────────────────────────────────────────
//
// Bare text rendering, no card chrome. The surrounding container
// provides visual frame. Used in Footer or any context where a
// luxury card would clash with the existing layout.
function ContactCardInline({
  info,
  showNote,
  style,
  businessHoursInline,
}: {
  info: ContactInfo;
  showNote: boolean;
  style?: CSSProperties;
  businessHoursInline: string;
}) {
  const t = useT();
  return (
    /* User-provided `style` pass-through; same rationale as the other
       variants — public API for parent layout tweaks (margin, etc). */
    /* eslint-disable-next-line react/forbid-dom-props */
    <div className="cc-inline-wrap" style={style}>
      <p className="cc-inline-p">
        <a
          href={info.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('Open {address} in Google Maps', { address: info.full })}
          className="cc-inline-link-address"
        >
          {info.full}
        </a>
      </p>
      <p className="cc-inline-p">{businessHoursInline}</p>
      <p className="cc-inline-p-tight">
        {joinDots([
          info.tel && <a key="tel" href={`tel:${info.tel}`} className="cc-inline-link">{info.phone}</a>,
          info.whatsapp && <a key="wa" href={info.whatsapp} target="_blank" rel="noopener noreferrer" className="cc-inline-link">WhatsApp</a>,
        ])}
      </p>
      <p className="cc-inline-p-last">
        {joinDots([
          info.email && <a key="mail" href={`mailto:${info.email}`} className="cc-inline-link-mail">{info.email}</a>,
          info.instagram && <a key="ig" href={info.instagram} target="_blank" rel="noopener noreferrer" className="cc-inline-link">{info.instagramHandle}</a>,
        ])}
      </p>
      {showNote && <p className="cc-inline-note">{t(RESPONSE_NOTE)}</p>}
    </div>
  );
}

/** Render the truthy items separated by " · ". */
function joinDots(items: Array<React.ReactNode | false | ''>): React.ReactNode[] {
  return items.filter(Boolean).flatMap((el, i) => (i === 0 ? [el] : [' · ', el]));
}

// ── Internal helper: section block (icon + label + content) ────────────────
function ContactSection({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="cc-section-header">
        <div className="cc-section-icon">{icon}</div>
        <h3 className="cc-section-label">{label}</h3>
      </div>
      <div>{children}</div>
    </div>
  );
}
