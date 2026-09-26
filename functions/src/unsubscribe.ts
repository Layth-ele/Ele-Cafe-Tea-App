/**
 * unsubscribe.ts — one-click unsubscribe for marketing email (CASL).
 *
 * Every marketing email (promotions, new arrivals, cart/refill reminders,
 * back-in-stock) carries a personal link:
 *     https://elecafe.ca/api/unsubscribe?t=<token>&c=<category>
 * and List-Unsubscribe / List-Unsubscribe-Post headers, so Gmail and Apple
 * Mail can show their own "Unsubscribe" button (RFC 8058 one-click POST).
 *
 *  • GET  → a small confirmation page (link scanners open links; they must
 *           not unsubscribe people) with "Unsubscribe" and "Unsubscribe
 *           from all marketing email" buttons.
 *  • POST → turns the category off in users/{uid}/preferences/notifications
 *           — the same toggles as Account → Notifications — no sign-in.
 *
 * Tokens are random (not derived from the uid), one per customer, stored
 * in /unsubscribeTokens/{token} → { uid } (server-only collection).
 */
import * as functions from 'firebase-functions/v2';
import * as crypto from 'node:crypto';
import * as admin from './lib/admin';
import type { NotificationCategory } from './lib/notificationPrefs';

const SITE = 'https://elecafe.ca';
const MARKETING: NotificationCategory[] = ['promotions', 'newArrivals', 'reminders', 'lowStock'];
const db = () => admin.firestore();

/** Get (or create) this customer's unsubscribe token. */
export async function unsubscribeToken(uid: string, known?: unknown): Promise<string> {
  if (typeof known === 'string' && /^[a-f0-9]{40}$/.test(known)) return known;
  const token = crypto.randomBytes(20).toString('hex');
  const batch = db().batch();
  batch.set(db().doc(`unsubscribeTokens/${token}`), {
    uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  batch.set(db().doc(`users/${uid}`), { unsubToken: token }, { merge: true });
  await batch.commit();
  return token;
}

export function unsubscribeUrl(token: string, category: NotificationCategory): string {
  return `${SITE}/api/unsubscribe?t=${token}&c=${category}`;
}

/** Headers for Resend so mail apps show a native one-click Unsubscribe. */
export function unsubscribeHeaders(url: string): Record<string, string> {
  return { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

const LABELS: Record<string, { en: string; fr: string }> = {
  promotions: { en: 'promotions and offers', fr: 'promotions et offres' },
  newArrivals: { en: 'new tea announcements', fr: 'annonces de nouveaux thés' },
  reminders: { en: 'cart and refill reminders', fr: 'rappels de panier et de réapprovisionnement' },
  lowStock: { en: 'back-in-stock alerts', fr: 'alertes de retour en stock' },
  all: { en: 'all marketing email', fr: 'tous les courriels marketing' },
};

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

function page(title: string, body: string, fr: boolean): string {
  return `<!DOCTYPE html><html lang="${fr ? 'fr' : 'en'}"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex"/>
<title>${esc(title)} | Ele Café</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#faf7f2;color:#0f1c26}
  main{max-width:460px;margin:12vh auto;padding:32px 24px;background:#fff;border:1px solid #e8e2d6;border-radius:16px;text-align:center}
  h1{font-family:Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px}
  p{line-height:1.6;color:#4a5560;margin:0 0 20px}
  button,a.btn{display:block;width:100%;box-sizing:border-box;padding:14px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;margin-top:10px;text-decoration:none}
  .primary{background:#0f1c26;color:#fff;border:0}.secondary{background:#fff;color:#0f1c26;border:1px solid #0f1c26}
  .small{font-size:13px;margin-top:18px}
</style></head><body><main>${body}</main></body></html>`;
}

export const unsubscribe = functions.https.onRequest(
  { region: 'us-central1', memory: '256MiB', maxInstances: 5, cors: false },
  async (req, res) => {
    const token = String(req.query.t ?? '');
    const catParam = String(req.query.c ?? 'promotions');
    const fr =
      String(req.query.l ?? '') === 'fr' ||
      /^fr\b/i.test(String(req.headers['accept-language'] ?? ''));
    const T = (en: string, frText: string) => (fr ? frText : en);
    res.set('Cache-Control', 'no-store');

    if (!/^[a-f0-9]{40}$/.test(token)) {
      res
        .status(400)
        .send(
          page(
            T('Link not valid', 'Lien non valide'),
            `<h1>${T('Link not valid', 'Lien non valide')}</h1><p>${T('This unsubscribe link is incomplete. You can manage your email preferences in your account.', 'Ce lien de désabonnement est incomplet. Vous pouvez gérer vos préférences dans votre compte.')}</p><a class="btn primary" href="${SITE}/account">${T('Email preferences', 'Préférences de courriel')}</a>`,
            fr,
          ),
        );
      return;
    }
    const snap = await db().doc(`unsubscribeTokens/${token}`).get();
    const uid = snap.get('uid') as string | undefined;
    if (!uid) {
      res
        .status(404)
        .send(
          page(
            T('Link expired', 'Lien expiré'),
            `<h1>${T('Link expired', 'Lien expiré')}</h1><p>${T('Manage your email preferences in your account instead.', 'Gérez plutôt vos préférences de courriel dans votre compte.')}</p><a class="btn primary" href="${SITE}/account">${T('Email preferences', 'Préférences de courriel')}</a>`,
            fr,
          ),
        );
      return;
    }
    const category =
      catParam === 'all' || MARKETING.includes(catParam as NotificationCategory)
        ? catParam
        : 'promotions';

    if (req.method === 'POST') {
      // Buttons post ?c=…; RFC 8058 one-click posts to the header URL as-is.
      const which = String((req.body && (req.body as Record<string, unknown>).scope) || category);
      const off = which === 'all' ? MARKETING : [which as NotificationCategory];
      await db()
        .doc(`users/${uid}/preferences/notifications`)
        .set(
          { ...Object.fromEntries(off.map((k) => [k, false])), updatedAt: Date.now() },
          { merge: true },
        );
      const label = LABELS[which] ?? LABELS.promotions;
      res
        .status(200)
        .send(
          page(
            T('Unsubscribed', 'Désabonné'),
            `<h1>${T('You’re unsubscribed', 'Vous êtes désabonné')}</h1><p>${T(`You won’t receive ${label.en} from Ele Café anymore. Order updates still arrive as usual.`, `Vous ne recevrez plus de ${label.fr} d’Ele Café. Les mises à jour de commande continuent d’arriver.`)}</p><a class="btn secondary" href="${SITE}/account">${T('Change email preferences', 'Modifier mes préférences')}</a><a class="btn secondary" href="${SITE}">${T('Back to Ele Café', 'Retour à Ele Café')}</a>`,
            fr,
          ),
        );
      return;
    }

    const label = LABELS[category] ?? LABELS.promotions;
    const action = `${SITE}/api/unsubscribe?t=${token}&c=${category}${fr ? '&l=fr' : ''}`;
    res.status(200).send(
      page(
        T('Unsubscribe', 'Se désabonner'),
        `<h1>${T('Unsubscribe?', 'Se désabonner?')}</h1>
<p>${T(`Stop receiving ${label.en} from Ele Café. Order updates will still arrive.`, `Ne plus recevoir de ${label.fr} d’Ele Café. Les mises à jour de commande continueront d’arriver.`)}</p>
<form method="post" action="${esc(action)}"><input type="hidden" name="scope" value="${esc(category)}"/><button class="primary" type="submit">${T('Unsubscribe', 'Me désabonner')}</button></form>
${category === 'all' ? '' : `<form method="post" action="${esc(action)}"><input type="hidden" name="scope" value="all"/><button class="secondary" type="submit">${T('Unsubscribe from all marketing email', 'Me désabonner de tous les courriels marketing')}</button></form>`}
<p class="small"><a href="${SITE}/account">${T('Or choose exactly what you receive', 'Ou choisissez exactement ce que vous recevez')}</a></p>`,
        fr,
      ),
    );
  },
);
