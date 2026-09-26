/**
 * emailLayout — the ONE Ele Café email design. Every email (order
 * updates, back-in-stock, admin alerts, verify / reset / change-email,
 * health check) is rendered through renderEmail() and the block helpers
 * below, so they look like one family:
 *
 *   ┌──────────────────────────────┐
 *   │  navy header · white logo    │  store name + address (from Settings)
 *   ├──────────────────────────────┤
 *   │        EYEBROW (gold)        │
 *   │          Headline            │  everything centred
 *   │            ───               │
 *   │   paragraphs · boxes · CTA   │
 *   ├──────────────────────────────┤
 *   │  footer: name · contact      │
 *   └──────────────────────────────┘
 *
 * Email-client safe: table layout, inline styles, 600px card that
 * shrinks on phones, bulletproof (table) buttons, light-only scheme.
 * Pure (no Firebase) — preview/test it directly.
 * Tests: tests/unit/lib/emailLayout.test.ts
 */
import { readStoreContent, phoneTel, instagramHandle } from './storeContent';

// ── Brand ───────────────────────────────────────────────────────────────────

export interface EmailBrand {
  name:      string;
  address:   string;
  phone:     string;
  email:     string;
  website:   string;
  mapsUrl:   string;
  logoUrl:   string;
  instagram: string;
}

/** White logo for the navy header, served by Hosting (email clients
 *  can't pass App Check, so never a Storage URL). */
/** Customer-facing emails go out in the customer's site language. */
export type EmailLang = 'en' | 'fr';
export const emailLang = (v: unknown): EmailLang => (v === 'fr' ? 'fr' : 'en');
/** Pick the English or French copy. */
export const L = (lang: EmailLang, en: string, fr: string): string => (lang === 'fr' ? fr : en);

export const DEFAULT_EMAIL_LOGO = 'https://elecafe.ca/email-assets/logo-white.png';

/** Brand from the raw /settings/global doc (Admin → Settings). */
export function emailBrandFrom(settings: Record<string, unknown> | null | undefined): EmailBrand {
  const s = readStoreContent(settings);
  const d = settings ?? {};
  const website = typeof d.storeWebsite === 'string' && /^https?:\/\//.test(d.storeWebsite) ? d.storeWebsite : 'https://elecafe.ca';
  const logo = typeof d.emailLogoUrl === 'string' && /^https:\/\//.test(d.emailLogoUrl.trim()) ? d.emailLogoUrl.trim() : DEFAULT_EMAIL_LOGO;
  return {
    name: s.name, address: s.address, phone: s.phone, email: s.email || 'info@elecafe.ca',
    website: website.replace(/\/$/, ''), mapsUrl: s.mapsUrl, logoUrl: logo, instagram: s.instagramUrl,
  };
}

// ── Escaping ────────────────────────────────────────────────────────────────

export const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Only http(s)/mailto/tel URLs reach href/src attributes. */
export const safeUrl = (v: unknown): string =>
  (/^(https?:\/\/|mailto:|tel:)/i.test(String(v ?? '')) ? esc(v) : '');

// ── Tokens ──────────────────────────────────────────────────────────────────

const C = {
  page: '#f0ece6', card: '#ffffff', navy: '#0f1c26', navy2: '#1a2d40',
  cream: '#f7f1e6', gold: '#b8924a', goldSoft: '#d4b37a', ink: '#0f1c26',
  text: '#3f4d5a', muted: '#7b8794', line: '#ece5d8', panel: '#f8f4ed', ok: '#2a7a50',
};
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

// ── Blocks (return trusted HTML; callers esc() any user data) ───────────────

/** Centred paragraph. */
export const p = (html: string, opts: { small?: boolean } = {}): string =>
  `<p style="margin:0 0 16px;font-family:${SANS};font-size:${opts.small ? 13 : 15}px;line-height:1.7;color:${opts.small ? C.muted : C.text};text-align:center;">${html}</p>`;

/** Bold inline text in the ink colour. */
export const strong = (html: string): string => `<strong style="color:${C.ink};">${html}</strong>`;

/** Inline monospace chip — order ids, tracking numbers. */
export const code = (txt: string): string =>
  `<span style="background:${C.panel};border:1px solid ${C.line};padding:2px 8px;border-radius:4px;font-family:Menlo,Consolas,monospace;font-size:13px;color:${C.ink};white-space:nowrap;">${esc(txt)}</span>`;

/** Centred call-to-action button (table-based: renders in Outlook). */
export const button = (label: string, href: string): string => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 8px;">
  <tr><td align="center" bgcolor="${C.navy}" style="border-radius:8px;">
    <a href="${safeUrl(href)}" target="_blank" rel="noopener" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.cream};text-decoration:none;border-radius:8px;">${esc(label)}</a>
  </td></tr>
</table>`;

/** Small centred eyebrow label used inside boxes and sections. */
const label = (txt: string, mt = 0): string =>
  `<p style="margin:${mt}px 0 12px;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${C.gold};text-align:center;">${esc(txt)}</p>`;

/** Panel with a heading and key → value rows (value is trusted HTML). */
export const infoBox = (title: string, rows: Array<[string, string]>): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;background:${C.panel};border:1px solid ${C.line};border-radius:10px;">
  <tr><td style="padding:18px 22px 10px;">
    ${label(title)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${rows.map(([k, v]) => `<tr>
        <td style="padding:6px 0;font-family:${SANS};font-size:13px;color:${C.muted};text-align:left;vertical-align:top;">${esc(k)}</td>
        <td style="padding:6px 0;font-family:${SANS};font-size:13px;color:${C.ink};text-align:right;vertical-align:top;font-weight:600;">${v}</td>
      </tr>`).join('')}
    </table>
  </td></tr>
</table>`;

/** Centred product photo. */
export const image = (src: string, alt: string): string =>
  safeUrl(src)
    ? `<img src="${safeUrl(src)}" alt="${esc(alt)}" width="220" style="display:block;width:220px;max-width:100%;height:auto;margin:6px auto 22px;border-radius:12px;border:0;" />`
    : '';

/** Itemised order lines. */
export function itemsTable(items: Array<{ productName: string; quantity: number; price: number }>, title?: string, lang: EmailLang = 'en'): string {
  title ??= L(lang, 'Your order', 'Votre commande');
  if (!items.length) return '';
  const rows = items.map((it) => `<tr>
    <td style="padding:12px 0;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:14px;color:${C.ink};text-align:left;">${esc(it.productName)}<br/><span style="font-size:12px;color:${C.muted};">${esc(it.quantity)} × $${Number(it.price ?? 0).toFixed(2)}</span></td>
    <td style="padding:12px 0;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:14px;font-weight:600;color:${C.ink};text-align:right;vertical-align:top;">$${(Number(it.price ?? 0) * Number(it.quantity ?? 0)).toFixed(2)}</td>
  </tr>`).join('');
  return `${label(title, 18)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.line};">${rows}</table>`;
}

/** Totals: [label, amount text, variant] — 'total' is the bold last line. */
export function totalsTable(rows: Array<[string, string, ('credit' | 'total')?]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;">${rows.map(([k, v, kind]) => {
    const color = kind === 'credit' ? C.ok : kind === 'total' ? C.ink : C.text;
    const weight = kind === 'total' ? 'font-weight:700;font-size:15px;padding-top:12px;' : 'font-size:13px;';
    return `<tr><td style="padding:5px 0;font-family:${SANS};color:${color};text-align:left;${weight}">${esc(k)}</td><td style="padding:5px 0;font-family:${SANS};color:${color};text-align:right;${weight}">${esc(v)}</td></tr>`;
  }).join('')}</table>`;
}

/** Postal address panel ("Deliver to"). */
export function addressBox(a: { name?: string; address?: string; city?: string; province?: string; postalCode?: string; country?: string; phone?: string }, lang: EmailLang = 'en'): string {
  const lines = [
    a.name ? strong(esc(a.name)) : '',
    esc(a.address),
    `${esc(a.city)}${a.province ? `, ${esc(a.province)}` : ''} ${esc(a.postalCode)}`.trim(),
    `${esc(a.country)}${a.phone ? ` · ${esc(a.phone)}` : ''}`,
  ].filter(Boolean);
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;background:${C.panel};border:1px solid ${C.line};border-radius:10px;">
  <tr><td style="padding:18px 22px;">${label(L(lang, 'Deliver to', 'Livrer à'))}<p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.7;color:${C.text};text-align:center;">${lines.join('<br/>')}</p></td></tr>
</table>`;
}

/** Secondary section with a small heading — security notes, "why you got this". */
export const note = (title: string, html: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;border-top:1px solid ${C.line};"><tr><td style="padding-top:22px;">${label(title)}${p(html, { small: true })}</td></tr></table>`;

/** "Or paste this link" fallback under a button. */
export const linkFallback = (href: string, lang: EmailLang = 'en'): string =>
  `<p style="margin:14px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted};text-align:center;">${L(lang, 'Button not working? Paste this link into your browser:', 'Le bouton ne fonctionne pas? Collez ce lien dans votre navigateur :')}<br/><a href="${safeUrl(href)}" style="color:${C.ink};word-break:break-all;">${esc(href)}</a></p>`;

// ── Page ────────────────────────────────────────────────────────────────────

export interface RenderEmailInput {
  brand:     EmailBrand;
  /** Inbox preview line (hidden in the body). */
  preheader: string;
  eyebrow:   string;
  /** Plain text — escaped here. */
  title:     string;
  /** Trusted HTML blocks built with the helpers above. */
  body:      string[];
  /** Small print above the footer (plain text). */
  footnote?: string;
  /** Sets <html lang>. Defaults to English. */
  lang?:     EmailLang;
}

export function renderEmail(i: RenderEmailInput): string {
  const b = i.brand;
  const tel = phoneTel(b.phone);
  const site = b.website.replace(/^https?:\/\//, '');
  const contact = [
    tel ? `<a href="tel:${esc(tel)}" style="color:${C.muted};text-decoration:none;">${esc(b.phone)}</a>` : '',
    b.email ? `<a href="mailto:${esc(b.email)}" style="color:${C.muted};text-decoration:none;">${esc(b.email)}</a>` : '',
    b.instagram ? `<a href="${safeUrl(b.instagram)}" style="color:${C.muted};text-decoration:none;">${esc(instagramHandle(b.instagram) || 'Instagram')}</a>` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  // The address is an explicit, styled link — otherwise Gmail auto-links
  // it in default blue with an underline.
  const address = b.address
    ? `<a href="${safeUrl(b.mapsUrl) || '#'}" style="color:${C.goldSoft};text-decoration:none;">${esc(b.address)}</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="${i.lang ?? 'en'}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${esc(i.title)}</title>
<style>
  @media only screen and (max-width: 620px) {
    .ec-card { width: 100% !important; border-radius: 0 !important; }
    .ec-pad  { padding-left: 24px !important; padding-right: 24px !important; }
    .ec-h1   { font-size: 24px !important; }
  }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};">${esc(i.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" class="ec-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${C.card};border-radius:14px;overflow:hidden;box-shadow:0 2px 24px rgba(15,28,38,0.08);">
      <tr><td align="center" bgcolor="${C.navy}" style="background:${C.navy};background-image:linear-gradient(135deg,${C.navy} 0%,${C.navy2} 60%,${C.navy} 100%);padding:34px 24px 28px;text-align:center;">
        <img src="${safeUrl(b.logoUrl)}" alt="${esc(b.name)}" width="72" height="78" style="display:block;width:72px;height:78px;margin:0 auto 14px;border:0;" />
        <p style="margin:0;font-family:${SERIF};font-size:26px;font-weight:400;letter-spacing:0.04em;color:${C.cream};line-height:1.2;">${esc(b.name)}</p>
        ${address ? `<p style="margin:8px 0 0;font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;line-height:1.6;">${address}</p>` : ''}
      </td></tr>
      <tr><td class="ec-pad" align="center" style="padding:40px 48px 36px;text-align:center;">
        <p style="margin:0 0 12px;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${C.gold};text-align:center;">${esc(i.eyebrow)}</p>
        <h1 class="ec-h1" style="margin:0;font-family:${SERIF};font-size:28px;font-weight:400;letter-spacing:-0.01em;line-height:1.25;color:${C.ink};text-align:center;">${esc(i.title)}</h1>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:18px auto 24px;"><tr><td width="44" height="2" bgcolor="${C.gold}" style="width:44px;height:2px;line-height:2px;font-size:2px;background:${C.gold};">&nbsp;</td></tr></table>
        ${i.body.join('\n')}
      </td></tr>
      <tr><td class="ec-pad" align="center" style="padding:26px 48px 30px;background:${C.panel};border-top:1px solid ${C.line};text-align:center;">
        <p style="margin:0 0 6px;font-family:${SERIF};font-size:17px;color:${C.ink};">${esc(b.name)}</p>
        ${b.address ? `<p style="margin:0 0 6px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted};">${esc(b.address)}</p>` : ''}
        ${contact ? `<p style="margin:0 0 10px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted};">${contact}</p>` : ''}
        <p style="margin:0;font-family:${SANS};font-size:12px;"><a href="${safeUrl(b.website)}" style="color:${C.gold};text-decoration:none;font-weight:600;">${esc(site)}</a></p>
        ${i.footnote ? `<p style="margin:14px 0 0;font-family:${SANS};font-size:11px;line-height:1.6;color:${C.muted};">${esc(i.footnote)}</p>` : ''}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
