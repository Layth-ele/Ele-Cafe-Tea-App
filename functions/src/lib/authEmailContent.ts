/**
 * Account emails — verify email, reset password, confirm email change —
 * rendered with the shared Ele Café layout (lib/emailLayout.ts), so they
 * match the order and back-in-stock emails. Replaces the static HTML files
 * that used to live in email-templates/auth/.
 * Pure: no Firebase. Tests: tests/unit/lib/emailLayout.test.ts
 */
import { renderEmail, p, strong, button, note, linkFallback, esc, L, type EmailBrand, type EmailLang } from './emailLayout';

export type AuthEmailKind = 'verify-email' | 'password-reset' | 'email-change';

export interface AuthEmailInput {
  brand:    EmailBrand;
  link:     string;
  email:    string;
  newEmail?: string;
  /** Welcome bonus granted on verification (Admin → Settings). 0 hides the line. */
  welcomePoints?: number;
  /** $ value of 1,000 points (Admin → Settings). */
  creditValuePer1000?: number;
  /** Site language of the person asking. Defaults to English. */
  lang?: EmailLang;
}

const SECURITY_FOOTNOTE = (lang: EmailLang) =>
  L(lang, 'This is an automated account email from Ele Café.', 'Ceci est un courriel automatique concernant votre compte Ele Café.');

export function buildAuthEmail(kind: AuthEmailKind, i: AuthEmailInput): { subject: string; html: string } {
  const name = i.brand.name;
  const lang: EmailLang = i.lang ?? 'en';
  const T = (en: string, fr: string) => L(lang, en, fr);
  if (kind === 'verify-email') {
    const pts = Math.max(0, Math.floor(i.welcomePoints ?? 0));
    const dollars = pts && i.creditValuePer1000 ? (pts / 1000) * i.creditValuePer1000 : 0;
    return {
      subject: T(`Verify your email · ${name}`, `Vérifiez votre courriel · ${name}`),
      html: renderEmail({
        brand: i.brand,
        lang,
        preheader: T('One quick step to activate your account — confirm your email address.', 'Une petite étape pour activer votre compte — confirmez votre adresse courriel.'),
        eyebrow: T('Welcome', 'Bienvenue'),
        title: T('Confirm your email address', 'Confirmez votre adresse courriel'),
        body: [
          p(T(`You&#39;re almost in. Tap the button below to verify ${strong(esc(i.email))} and finish setting up your ${esc(name)} account.`,
              `Vous y êtes presque. Touchez le bouton ci-dessous pour vérifier ${strong(esc(i.email))} et terminer la création de votre compte ${esc(name)}.`)),
          pts > 0
            ? p(T(`Once you&#39;re verified you&#39;ll receive ${strong(`${pts.toLocaleString('en-CA')} welcome points`)}${dollars > 0 ? ` — $${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)} off your order` : ''}.`,
                  `Une fois vérifié, vous recevrez ${strong(`${pts.toLocaleString('fr-CA')} points de bienvenue`)}${dollars > 0 ? ` — ${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)} $ de rabais sur votre commande` : ''}.`))
            : '',
          button(T('Verify email', 'Vérifier mon courriel'), i.link),
          linkFallback(i.link, lang),
          note(T("Didn't sign up?", 'Vous ne vous êtes pas inscrit?'), T('You can ignore this email. The link expires automatically and no account will be activated.', 'Vous pouvez ignorer ce courriel. Le lien expire automatiquement et aucun compte ne sera activé.')),
        ],
        footnote: SECURITY_FOOTNOTE(lang),
      }),
    };
  }
  if (kind === 'password-reset') {
    return {
      subject: T(`Reset your password · ${name}`, `Réinitialisez votre mot de passe · ${name}`),
      html: renderEmail({
        brand: i.brand,
        lang,
        preheader: T('Use this link to choose a new password. It expires in 1 hour.', 'Utilisez ce lien pour choisir un nouveau mot de passe. Il expire dans 1 heure.'),
        eyebrow: T('Account security', 'Sécurité du compte'),
        title: T('Reset your password', 'Réinitialisez votre mot de passe'),
        body: [
          p(T(`We received a request to reset the password for your ${esc(name)} account at ${strong(esc(i.email))}. Tap the button below to choose a new one.`,
              `Nous avons reçu une demande de réinitialisation du mot de passe de votre compte ${esc(name)} associé à ${strong(esc(i.email))}. Touchez le bouton ci-dessous pour en choisir un nouveau.`)),
          button(T('Choose a new password', 'Choisir un nouveau mot de passe'), i.link),
          linkFallback(i.link, lang),
          p(T('The link expires in 1 hour.', 'Le lien expire dans 1 heure.'), { small: true }),
          note(T("Wasn't you?", "Ce n'était pas vous?"), T('No action is needed — your account is safe. The link will simply expire and your current password keeps working.', 'Aucune action n&#39;est requise — votre compte est en sécurité. Le lien expirera et votre mot de passe actuel continuera de fonctionner.')),
        ],
        footnote: SECURITY_FOOTNOTE(lang),
      }),
    };
  }
  return {
    subject: T(`Confirm your email change · ${name}`, `Confirmez le changement de courriel · ${name}`),
    html: renderEmail({
      brand: i.brand,
      lang,
      preheader: T('Confirm the new email address for your account.', 'Confirmez la nouvelle adresse courriel de votre compte.'),
      eyebrow: T('Account security', 'Sécurité du compte'),
      title: T('Confirm your new email', 'Confirmez votre nouveau courriel'),
      body: [
        p(T(`You asked to change the email on your ${esc(name)} account from ${strong(esc(i.email))} to ${strong(esc(i.newEmail ?? ''))}.`,
            `Vous avez demandé de changer le courriel de votre compte ${esc(name)} de ${strong(esc(i.email))} à ${strong(esc(i.newEmail ?? ''))}.`)),
        p(T('Confirm the change below. Your old address stops working as soon as you confirm.', 'Confirmez le changement ci-dessous. Votre ancienne adresse cessera de fonctionner dès la confirmation.')),
        button(T('Confirm new email', 'Confirmer le nouveau courriel'), i.link),
        linkFallback(i.link, lang),
        note(T("Didn't request this?", "Vous n'avez pas fait cette demande?"), T(`Ignore this message and consider resetting your password — someone may have access to your account. <a href="${esc(i.brand.website)}/account" style="color:#b8924a;text-decoration:none;">Go to your account</a>`,
          `Ignorez ce message et envisagez de réinitialiser votre mot de passe — quelqu&#39;un pourrait avoir accès à votre compte. <a href="${esc(i.brand.website)}/account" style="color:#b8924a;text-decoration:none;">Accéder à votre compte</a>`)),
      ],
      footnote: SECURITY_FOOTNOTE(lang),
    }),
  };
}
