/**
 * storeContent — store facts (address, phone, hours, shipping, points)
 * turned into customer copy and schema.org JSON-LD.
 *
 * Shared by BOTH sides so they can never disagree:
 *   • renderSeo (functions/src/index.ts) — first-byte HTML for crawlers
 *   • the React app (HomeGuideSections, SeoHead callers, ContactCard …)
 *
 * Every value comes from /settings/global (Admin → Settings), so editing
 * the address, phone, hours or shipping there updates the website, the
 * FAQ answers and what Google reads — no code change or deploy needed.
 *
 * Pure: no Firebase imports (the browser bundles this file).
 * Tests: tests/unit/lib/storeContent.test.ts
 */

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export interface StoreHoursDay {
  day: WeekdayKey;
  closed: boolean;
  open: string;
  close: string;
}

export interface StoreContent {
  name: string;
  /** Full one-line address, e.g. "895 West Broadway, Vancouver, BC V5Z 1J9". */
  address: string;
  /** Phone as the admin typed it (display). '' when not set. */
  phone: string;
  email: string;
  mapsUrl: string;
  whatsappUrl: string;
  instagramUrl: string;
  /** Public social profile URLs (schema.org sameAs). */
  sameAs: string[];
  /** Only the days the admin actually saved — empty when hours were never set. */
  hours: StoreHoursDay[];
  freeShippingThreshold: number;
  /** Free tea sample in every online order (default on). */
  freeSample: boolean;
  shippingFee: number;
  pointsPerDollar: number;
  minRedemptionPts: number;
  creditValuePer1000: number;
  welcomeBonusPoints: number;
  /** Gift builder open to customers (Admin → Settings toggle). */
  giftBuilderEnabled: boolean;
}

const WEEKDAYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SCHEMA_DAY: Record<WeekdayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
const HM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const httpsUrl = (v: unknown) => (/^https:\/\/\S+$/.test(str(v)) ? str(v) : '');

/** Normalise the raw /settings/global document (any shape) into StoreContent. */
export function readStoreContent(raw: Record<string, unknown> | null | undefined): StoreContent {
  const d = raw ?? {};
  const address = str(d.storeAddress);
  const hours: StoreHoursDay[] = [];
  if (Array.isArray(d.businessHours)) {
    for (const row of d.businessHours as Array<Record<string, unknown>>) {
      const day = row?.day as WeekdayKey;
      if (!WEEKDAYS.includes(day) || hours.some((h) => h.day === day)) continue;
      const open = str(row.open);
      const close = str(row.close);
      const closed = !!row.closed || !HM_RE.test(open) || !HM_RE.test(close);
      hours.push({ day, closed, open, close });
    }
    hours.sort((a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day));
  }
  const instagramUrl = httpsUrl(d.socialInstagram);
  return {
    name: str(d.storeName) || 'Ele Café',
    address,
    phone: str(d.storePhone),
    email: str(d.storeEmail),
    mapsUrl:
      httpsUrl(d.mapsUrl) ||
      (address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : ''),
    whatsappUrl: httpsUrl(d.socialWhatsapp),
    instagramUrl,
    sameAs: [instagramUrl, d.socialFacebook, d.socialX, d.socialPinterest, d.socialTiktok]
      .map(httpsUrl)
      .filter(Boolean),
    hours,
    freeShippingThreshold: num(d.freeShippingThreshold),
    freeSample: d.freeSampleWithOrders !== false,
    shippingFee: num(d.defaultShippingFee),
    pointsPerDollar: num(d.pointsPerDollar),
    minRedemptionPts: num(d.minRedemptionPts),
    creditValuePer1000: num(d.creditValuePer1000),
    welcomeBonusPoints: num(d.welcomeBonusPoints),
    giftBuilderEnabled: d.giftBuilderEnabled === true,
  };
}

/** Year Ele Café opened — shown on the About page and sent to Google
 *  (LocalBusiness.foundingDate). */
export const FOUNDING_YEAR = '2023';

export const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
/** Canadian French price: "18 $", "12,99 $". */
export const moneyFr = (n: number) =>
  `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} $`;

/** "tel:" target in E.164 (+1 assumed for 10-digit North American numbers). */
export function phoneTel(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits.length >= 7 ? `+${digits}` : '';
}

/** "@handle" from an Instagram profile URL. */
export function instagramHandle(url: string): string {
  const m = /instagram\.com\/([A-Za-z0-9._]+)/.exec(url);
  return m ? `@${m[1]}` : '';
}

/** Best-effort split of a one-line Canadian address for PostalAddress. */
export function parseAddress(address: string): {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
} {
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return {};
  const out: ReturnType<typeof parseAddress> = {};
  const hasStreet = /\d/.test(parts[0]);
  if (hasStreet) out.streetAddress = parts.shift();
  if (parts[0]) out.addressLocality = parts.shift();
  const rest = parts.join(' ');
  const region = /\b(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\b/i.exec(rest);
  if (region) out.addressRegion = region[1].toUpperCase();
  const postal = /\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\b/i.exec(rest);
  if (postal) out.postalCode = `${postal[1]} ${postal[2]}`.toUpperCase();
  return out;
}

/** First line of the address ("895 West Broadway") and the rest. */
export function addressLines(address: string): [string, string] {
  const i = address.indexOf(',');
  return i === -1 ? [address, ''] : [address.slice(0, i).trim(), address.slice(i + 1).trim()];
}

/** Same-hours days collapsed: [{ days: ['Monday',…], opens, closes }]. */
export function groupedHours(
  hours: StoreHoursDay[],
): Array<{ days: string[]; opens: string; closes: string }> {
  const out: Array<{ days: string[]; opens: string; closes: string }> = [];
  let prev: StoreHoursDay | null = null;
  for (const h of hours) {
    if (!h.closed) {
      const last = out[out.length - 1];
      // Only extend a run of consecutive open days with identical hours.
      const adjacent =
        prev && !prev.closed && WEEKDAYS.indexOf(h.day) === WEEKDAYS.indexOf(prev.day) + 1;
      if (last && adjacent && last.opens === h.open && last.closes === h.close)
        last.days.push(SCHEMA_DAY[h.day]);
      else out.push({ days: [SCHEMA_DAY[h.day]], opens: h.open, closes: h.close });
    }
    prev = h;
  }
  return out;
}

const fmtHm = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
};

const DAY_FR: Record<string, string> = {
  Monday: 'lundi',
  Tuesday: 'mardi',
  Wednesday: 'mercredi',
  Thursday: 'jeudi',
  Friday: 'vendredi',
  Saturday: 'samedi',
  Sunday: 'dimanche',
};
/** 24-hour French time: "8 h", "21 h 30". */
const fmtHmFr = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};

/** "Monday – Friday 8 am – 9 pm · Saturday 9 am – 9 pm" (open days only);
 *  French: "lundi – vendredi 8 h – 21 h · samedi 9 h – 21 h". */
export function hoursText(hours: StoreHoursDay[], lang: 'en' | 'fr' = 'en'): string {
  return groupedHours(hours)
    .map((g) => {
      const name = (d: string) => (lang === 'fr' ? DAY_FR[d] : d);
      const days =
        g.days.length > 1
          ? `${name(g.days[0])} – ${name(g.days[g.days.length - 1])}`
          : name(g.days[0]);
      return lang === 'fr'
        ? `${days} ${fmtHmFr(g.opens)} – ${fmtHmFr(g.closes)}`
        : `${days} ${fmtHm(g.opens)} – ${fmtHm(g.closes)}`;
    })
    .join(' · ');
}

/** "Free shipping across Canada on orders over $100 ($12.99 flat rate below)." */
export function shippingText(s: StoreContent, lang: 'en' | 'fr' = 'en'): string {
  if (lang === 'fr') {
    if (s.freeShippingThreshold <= 0)
      return 'Livraison gratuite partout au Canada sur chaque commande.';
    return (
      `Livraison gratuite partout au Canada pour les commandes de plus de ${moneyFr(s.freeShippingThreshold)}` +
      (s.shippingFee > 0 ? ` (tarif fixe de ${moneyFr(s.shippingFee)} en dessous).` : '.')
    );
  }
  if (s.freeShippingThreshold <= 0) return 'Free shipping on every order across Canada.';
  return (
    `Free shipping across Canada on orders over ${money(s.freeShippingThreshold)}` +
    (s.shippingFee > 0 ? ` (${money(s.shippingFee)} flat rate below).` : '.')
  );
}

/** Shipping cost for one item bought on its own. */
export function shippingRateFor(price: number, s: StoreContent): number {
  if (s.freeShippingThreshold <= 0 || price >= s.freeShippingThreshold) return 0;
  return s.shippingFee;
}

/** schema.org LocalBusiness for the café — only fields the admin has filled. */
export function localBusinessLd(
  s: StoreContent,
  siteBase: string,
  extra: { image?: string; description?: string } = {},
): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'CafeOrCoffeeShop', 'Store'],
    '@id': `${siteBase}/#business`,
    name: s.name,
    url: siteBase,
    logo: `${siteBase}/icons/icon.svg`,
    image: extra.image ?? `${siteBase}/og-default.png`,
    priceRange: '$$',
    servesCuisine: ['Tea', 'Matcha', 'Coffee', 'Pastries'],
    // hasMenu is the current schema.org property; menu kept for older parsers.
    hasMenu: `${siteBase}/cafe`,
    menu: `${siteBase}/cafe`,
    foundingDate: FOUNDING_YEAR,
  };
  if (extra.description) ld.description = extra.description;
  const tel = phoneTel(s.phone);
  if (tel) ld.telephone = tel;
  if (s.email) ld.email = s.email;
  if (s.address)
    ld.address = { '@type': 'PostalAddress', ...parseAddress(s.address), addressCountry: 'CA' };
  if (s.mapsUrl) ld.hasMap = s.mapsUrl;
  const hours = groupedHours(s.hours);
  if (hours.length) {
    ld.openingHoursSpecification = hours.map((g) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: g.days.length === 1 ? g.days[0] : g.days,
      opens: g.opens,
      closes: g.closes,
    }));
  }
  if (s.sameAs.length) ld.sameAs = s.sameAs;
  return ld;
}

/** The refund policy (src/app/pages/info/RefundPolicyPage.tsx) in schema form:
 *  sales are final; spoiled/damaged tea is refunded within 7 days. */
export const RETURN_POLICY_LD = {
  '@type': 'MerchantReturnPolicy',
  applicableCountry: 'CA',
  returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
};

// ── Homepage FAQ ────────────────────────────────────────────────────────────

export interface FaqItem {
  q: string;
  a: string;
}

/** Homepage FAQ — the visible accordion AND the FAQPage JSON-LD. */
export function buildHomeFaq(s: StoreContent, lang: 'en' | 'fr' = 'en'): FaqItem[] {
  if (lang === 'fr') return buildHomeFaqFr(s);
  const delivery =
    'Delivery usually takes 1–7 business days in BC and up to 8 business days elsewhere in Canada (7–14 for the territories).';
  const where = s.address ? `${s.name}, ${s.address}` : `${s.name} in Vancouver`;
  const items: FaqItem[] = [
    {
      q: 'Do you ship loose leaf tea across Canada?',
      a:
        s.freeShippingThreshold > 0
          ? `Yes — orders over ${money(s.freeShippingThreshold)} ship free anywhere in Canada.${s.shippingFee > 0 ? ` Smaller orders ship for a flat ${money(s.shippingFee)}.` : ''} ${delivery}`
          : `Yes — every order ships free anywhere in Canada. ${delivery}`,
    },
    {
      q: 'Can I pick up my order in Vancouver?',
      a:
        `Yes. Choose free in-store pickup at checkout and collect your order at ${where} — pickup orders are usually ready within 2 hours of confirmation.` +
        (s.hours.length ? ` Opening hours: ${hoursText(s.hours)}.` : ''),
    },
    {
      q: 'When is my card charged?',
      a: 'We only place a temporary hold when you order. Your card is charged after we confirm every tea is in stock; if we can’t fill the order, the hold is released and you pay nothing.',
    },
    {
      q: 'Do you have caffeine-free teas?',
      a: 'Yes. Rooibos, fruit and most herbal and flower teas are naturally caffeine-free — use the caffeine filter in the shop to see them all.',
    },
    {
      q: 'Are your teas organic?',
      a: 'Many of our teas are certified organic; they are marked “Organic” in the shop, and you can filter the collection to show only organic teas.',
    },
    {
      q: 'How do I brew loose leaf tea?',
      a: 'Use about one teaspoon (2–3 g) of leaves per 250 ml cup. Green and white teas like cooler water (75–85°C) and short steeps; black, rooibos, herbal and fruit teas take boiling water and 3–7 minutes. Each tea page lists its exact temperature and time.',
    },
    {
      q: 'Can I try a tea before buying a full bag?',
      a: 'Yes — every online order includes a free sample, and you can taste any tea in our Vancouver café before you buy.',
    },
    {
      q: 'Can I return tea?',
      a: 'Because tea is a food product, sales are final. If your tea arrives spoiled or damaged, contact us within 7 days and we’ll refund or replace it.',
    },
  ];
  if (s.pointsPerDollar > 0 && s.creditValuePer1000 > 0) {
    items.push({
      q: 'Do you have a tea rewards program?',
      a: `Yes. Members earn ${s.pointsPerDollar} points per dollar spent${s.welcomeBonusPoints > 0 ? ` plus ${s.welcomeBonusPoints} welcome points` : ''}. Every 1,000 points is worth ${money(s.creditValuePer1000)} off${s.minRedemptionPts > 0 ? `, redeemable from ${s.minRedemptionPts.toLocaleString('en-CA')} points` : ''}.`,
    });
  }
  if (s.giftBuilderEnabled) {
    items.push({
      q: 'Do you offer tea gift boxes?',
      a: 'Yes. Our gift builder lets you choose the teas, add samples and a personal message, from a single-tea taster to a seven-tea gift box.',
    });
  }
  return items;
}

export function faqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

// ── Homepage title / description (browser SeoHead + renderSeo "/") ──────────

export const HOME_TITLE = 'Loose Leaf Tea Online in Canada | Ele Café Vancouver Tea Shop';
export const HOME_TITLE_FR =
  'Thé en vrac en ligne au Canada | Ele Café, boutique de thé à Vancouver';

/** Meta description with the live tea count and shipping threshold (≤155 chars). */
export function homeDescription(
  teaCount: number,
  s: StoreContent,
  lang: 'en' | 'fr' = 'en',
): string {
  if (lang === 'fr') {
    const livraison =
      s.freeShippingThreshold > 0
        ? `dès ${moneyFr(s.freeShippingThreshold)}`
        : 'sur chaque commande';
    return (
      `${teaCount > 0 ? `${teaCount} thés` : 'Thés'} en vrac haut de gamme : noir, vert, oolong, rooibos et tisanes. ` +
      `Café de thé à Vancouver : cueillette gratuite, livraison gratuite au Canada ${livraison}.`
    );
  }
  const ship =
    s.freeShippingThreshold > 0
      ? `on orders over ${money(s.freeShippingThreshold)}`
      : 'on every order';
  return (
    `Shop ${teaCount > 0 ? `${teaCount} ` : ''}premium loose leaf teas — black, green, oolong, rooibos & herbal. ` +
    `Vancouver tea café: free pickup, free Canada shipping ${ship}.`
  );
}

/** French homepage FAQ (same facts as buildHomeFaq; the visible accordion
 *  in French — Google still gets the English FAQPage). */
function buildHomeFaqFr(s: StoreContent): FaqItem[] {
  const m = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} $`;
  const delivery =
    'La livraison prend habituellement de 1 à 7 jours ouvrables en C.-B. et jusqu’à 8 jours ouvrables ailleurs au Canada (7 à 14 pour les territoires).';
  const where = s.address ? `${s.name}, ${s.address}` : `${s.name}, à Vancouver`;
  const items: FaqItem[] = [
    {
      q: 'Livrez-vous du thé en vrac partout au Canada?',
      a:
        s.freeShippingThreshold > 0
          ? `Oui — les commandes de plus de ${m(s.freeShippingThreshold)} sont livrées gratuitement partout au Canada.${s.shippingFee > 0 ? ` Les plus petites commandes sont livrées pour un tarif fixe de ${m(s.shippingFee)}.` : ''} ${delivery}`
          : `Oui — toutes les commandes sont livrées gratuitement partout au Canada. ${delivery}`,
    },
    {
      q: 'Puis-je récupérer ma commande à Vancouver?',
      a:
        `Oui. Choisissez le ramassage gratuit en boutique au moment de payer et récupérez votre commande chez ${where} — elle est habituellement prête dans les 2 heures suivant la confirmation.` +
        (s.hours.length ? ` Heures d’ouverture : ${hoursText(s.hours, 'fr')}.` : ''),
    },
    {
      q: 'Quand ma carte est-elle débitée?',
      a: 'Nous plaçons seulement une retenue temporaire au moment de la commande. Votre carte est débitée une fois que nous avons confirmé que chaque thé est en stock; si nous ne pouvons pas remplir la commande, la retenue est libérée et vous ne payez rien.',
    },
    {
      q: 'Avez-vous des thés sans caféine?',
      a: 'Oui. Le rooibos, les thés aux fruits ainsi que la plupart des tisanes et des thés aux fleurs sont naturellement sans caféine — utilisez le filtre de caféine de la boutique pour tous les voir.',
    },
    {
      q: 'Vos thés sont-ils biologiques?',
      a: 'Plusieurs de nos thés sont certifiés biologiques; ils portent la mention « Bio » dans la boutique, et vous pouvez filtrer la collection pour n’afficher que les thés biologiques.',
    },
    {
      q: 'Comment infuser du thé en vrac?',
      a: 'Comptez environ une cuillère à thé (2 à 3 g) de feuilles par tasse de 250 ml. Les thés verts et blancs préfèrent une eau moins chaude (75 à 85 °C) et une infusion courte; les thés noirs, le rooibos, les tisanes et les thés aux fruits demandent une eau bouillante et de 3 à 7 minutes. Chaque fiche de thé indique la température et le temps exacts.',
    },
    {
      q: 'Puis-je goûter un thé avant d’acheter un sachet complet?',
      a: 'Oui — chaque commande en ligne comprend un échantillon gratuit, et vous pouvez déguster n’importe quel thé dans notre café de Vancouver avant d’acheter.',
    },
    {
      q: 'Puis-je retourner du thé?',
      a: 'Comme le thé est un produit alimentaire, les ventes sont finales. Si votre thé arrive gâté ou endommagé, contactez-nous dans les 7 jours et nous le rembourserons ou le remplacerons.',
    },
  ];
  if (s.pointsPerDollar > 0 && s.creditValuePer1000 > 0) {
    items.push({
      q: 'Avez-vous un programme de récompenses?',
      a: `Oui. Les membres gagnent ${s.pointsPerDollar} points par dollar dépensé${s.welcomeBonusPoints > 0 ? `, plus ${s.welcomeBonusPoints.toLocaleString('fr-CA')} points de bienvenue` : ''}. Chaque tranche de 1 000 points vaut ${m(s.creditValuePer1000)} de rabais${s.minRedemptionPts > 0 ? `, échangeable à partir de ${s.minRedemptionPts.toLocaleString('fr-CA')} points` : ''}.`,
    });
  }
  if (s.giftBuilderEnabled) {
    items.push({
      q: 'Offrez-vous des coffrets-cadeaux de thé?',
      a: 'Oui. Notre créateur de coffrets vous permet de choisir les thés, d’ajouter des échantillons et un message personnel, du coffret découverte d’un seul thé au coffret de sept thés.',
    });
  }
  return items;
}
