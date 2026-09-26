/**
 * Back-in-stock email — sent by onInventoryWrite (inventory.ts) when a
 * tea goes from out_of_stock to available. Rendered with the shared
 * Ele Café email layout (lib/emailLayout.ts) like every other email.
 * Pure function: no Firestore, easy to preview/test.
 */
import {
  renderEmail,
  p,
  strong,
  image,
  button,
  note,
  esc,
  L,
  type EmailBrand,
  type EmailLang,
} from './emailLayout';

export interface BackInStockEmailInput {
  brand: EmailBrand;
  teaName: string;
  teaUrl: string;
  /** Public image URL, or '' to omit the photo. */
  teaImage: string;
  /** Price in dollars, or 0 to omit. */
  price: number;
  /** True when the customer clicked "Notify me" (one-time request);
   *  false when they only hearted it (lowStock preference). */
  explicitRequest: boolean;
  /** One-click unsubscribe link (back-in-stock alerts). */
  unsubUrl?: string;
  /** Customer's site language (users/{uid}.lang). Defaults to English. */
  lang?: EmailLang;
}

export function buildBackInStockEmail(i: BackInStockEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const lang: EmailLang = i.lang ?? 'en';
  const T = (en: string, fr: string) => L(lang, en, fr);
  const subject = T(
    `${i.teaName} is back in stock | ${i.brand.name}`,
    `${i.teaName} est de retour en stock | ${i.brand.name}`,
  );
  const manageUrl = `${i.brand.website}/account`;
  const priceLine =
    i.price > 0 ? T(`$${i.price.toFixed(2)} CAD`, `${i.price.toFixed(2)} $ CA`) : '';
  const why = i.explicitRequest
    ? T(
        'You asked us to let you know when this tea was restocked. This is a one-time email.',
        "Vous nous avez demandé de vous aviser du retour de ce thé. Ce courriel ne sera envoyé qu'une fois.",
      )
    : T(
        'You saved this tea to your wishlist. You can turn off back-in-stock emails in your account.',
        'Vous avez ajouté ce thé à vos favoris. Vous pouvez désactiver les avis de retour en stock dans votre compte.',
      );
  const teaUrl = /^https?:\/\//i.test(i.teaUrl) ? i.teaUrl : i.brand.website;

  const html = renderEmail({
    brand: i.brand,
    lang,
    preheader: T(
      `${i.teaName} is available again — grab it before it sells out.`,
      `${i.teaName} est de nouveau disponible — procurez-le-vous avant qu'il ne s'écoule.`,
    ),
    eyebrow: T('Back in stock', 'De retour en stock'),
    title: T(`${i.teaName} is back`, `${i.teaName} est de retour`),
    body: [
      image(i.teaImage, i.teaName),
      p(
        T(
          `Good news — ${strong(esc(i.teaName))} is available again${priceLine ? ` at ${esc(priceLine)}` : ''}. Restocks can sell out quickly, so grab it while it lasts.`,
          `Bonne nouvelle — ${strong(esc(i.teaName))} est de nouveau disponible${priceLine ? ` à ${esc(priceLine)}` : ''}. Les réapprovisionnements s&#39;écoulent vite, alors profitez-en.`,
        ),
      ),
      button(T(`Shop ${i.teaName}`, `Acheter ${i.teaName}`), teaUrl),
      note(
        T('Why you got this', 'Pourquoi ce courriel'),
        `${esc(why)} <a href="${esc(manageUrl)}" style="color:#b8924a;text-decoration:none;">${T('Manage email preferences', 'Gérer mes préférences de courriel')}</a>${i.unsubUrl ? ` · <a href="${esc(`${i.unsubUrl}${lang === 'fr' ? '&l=fr' : ''}`)}" style="color:#b8924a;text-decoration:none;">${T('Unsubscribe', 'Se désabonner')}</a>` : ''}`,
      ),
    ],
  });

  const text = [
    `${i.teaName} is back in stock`,
    '',
    `Good news — ${i.teaName} is available again${priceLine ? ` at ${priceLine}` : ''}.`,
    `Shop it here: ${teaUrl}`,
    '',
    why,
    `Manage email preferences: ${manageUrl}`,
    ...(i.unsubUrl ? [`Unsubscribe: ${i.unsubUrl}`] : []),
    '',
    `${i.brand.name}${i.brand.address ? ` · ${i.brand.address}` : ''}`,
  ].join('\n');

  return { subject, html, text };
}
