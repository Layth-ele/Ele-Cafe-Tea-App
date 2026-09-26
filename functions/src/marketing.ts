/**
 * marketing.ts — the three opt-out notification kinds from Account →
 * Notifications that aren't tied to an order:
 *
 *   promotions  → a promotion goes live (auto when "Email customers" is
 *                 ticked on the promotion, or the admin's "Notify
 *                 customers" button → announcePromotion callable)
 *   newArrivals → a new tea is published (queued, sent as one digest by
 *                 the hourly tick so adding 5 teas ≠ 5 emails)
 *   reminders   → items left in the cart for 24–72 h (hourly tick, at
 *                 most one reminder per customer per week)
 *
 * Each recipient gets an email (in their site language, users/{uid}.lang),
 * an in-app bell entry and a push. Recipients are filtered through
 * userAcceptsCategory, so the Account toggles are honoured on every send.
 */
import * as functions from 'firebase-functions/v2';
import * as admin from './lib/admin';
import { userAcceptsCategory, type NotificationCategory } from './lib/notificationPrefs';
import { sendPushToUser } from './lib/push';
import { isInventoryEmail } from './lib/inventoryAccount';
import { translateBatchToFrench } from './translate';
import {
  renderEmail,
  emailBrandFrom,
  emailLang,
  L,
  p,
  strong,
  code,
  button,
  image,
  note,
  esc,
  itemsTable,
  type EmailBrand,
  type EmailLang,
} from './lib/emailLayout';

const REGION = 'us-central1';
const FROM = 'Ele Café <news@elecafe.ca>';
const SITE = 'https://elecafe.ca';
const db = () => admin.firestore();
const FS = admin.firestore.FieldValue;

// ── Shared plumbing ─────────────────────────────────────────────────────────

interface Recipient {
  uid: string;
  email: string;
  lang: EmailLang;
  firstName: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Timestamp | Date | ISO/`YYYY-MM-DD` string | millis → millis (NaN if unknown). */
function millis(v: unknown): number {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function')
    return (v as admin.firestore.Timestamp).toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v) return Date.parse(v.length === 10 ? `${v}T00:00:00-07:00` : v);
  return NaN;
}

async function brand(): Promise<EmailBrand> {
  try {
    return emailBrandFrom((await db().doc('settings/global').get()).data());
  } catch {
    return emailBrandFrom({});
  }
}

async function toRecipient(
  uid: string,
  d: FirebaseFirestore.DocumentData | undefined,
  category: NotificationCategory,
): Promise<Recipient | null> {
  const email = str(d?.email);
  if (!email || isInventoryEmail(email)) return null;
  if (!(await userAcceptsCategory(uid, category))) return null;
  return {
    uid,
    email,
    lang: emailLang(d?.lang),
    firstName: str(d?.displayName).split(' ')[0] ?? '',
  };
}

/** Every customer who hasn't turned `category` off. */
async function recipientsFor(category: NotificationCategory): Promise<Recipient[]> {
  const snap = await db().collection('users').select('email', 'lang', 'displayName').get();
  const out: Recipient[] = [];
  for (let i = 0; i < snap.docs.length; i += 50) {
    const chunk = await Promise.all(
      snap.docs.slice(i, i + 50).map((d) => toRecipient(d.id, d.data(), category)),
    );
    for (const r of chunk) if (r) out.push(r);
  }
  return out;
}

interface Outgoing {
  to: string;
  subject: string;
  html: string;
}

/** Resend batch API (100 per request, ~2 requests/s). Returns how many were accepted. */
async function sendBatch(
  mails: Outgoing[],
  replyTo: string,
): Promise<{ sent: number; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: 0, error: 'RESEND_API_KEY not set' };
  let sent = 0;
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100);
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(
        chunk.map((m) => ({
          from: FROM,
          to: [m.to],
          subject: m.subject,
          html: m.html,
          ...(replyTo ? { reply_to: replyTo } : {}),
          headers: { 'List-Unsubscribe': `<${SITE}/account>` },
        })),
      ),
    }).catch((err: unknown) => err as Error);
    if (res instanceof Error || !res.ok) {
      const detail =
        res instanceof Error
          ? res.message
          : `${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`;
      console.error('[marketing.sendBatch] Resend failed:', detail);
      return { sent, error: detail };
    }
    sent += chunk.length;
    if (i + 100 < mails.length) await new Promise((r) => setTimeout(r, 600));
  }
  return { sent };
}

/** Bell entries (batched) + push, a few at a time. */
async function bellAndPush(
  rs: Recipient[],
  idFor: (r: Recipient) => string,
  type: string,
  msg: (r: Recipient) => { title: string; body: string },
  data: Record<string, unknown>,
  url: string,
) {
  for (let i = 0; i < rs.length; i += 400) {
    const batch = db().batch();
    for (const r of rs.slice(i, i + 400)) {
      const m = msg(r);
      batch.set(db().doc(`notifications/${idFor(r)}`), {
        recipientId: r.uid,
        type,
        title: m.title,
        body: m.body,
        data,
        isRead: false,
        createdAt: FS.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  for (let i = 0; i < rs.length; i += 25) {
    await Promise.allSettled(
      rs.slice(i, i + 25).map((r) => {
        const m = msg(r);
        return sendPushToUser(r.uid, m.title, m.body, { notifId: idFor(r), type, url });
      }),
    );
  }
}

const manageNote = (lang: EmailLang, why: string) =>
  note(
    L(lang, 'Why you got this', 'Pourquoi ce courriel'),
    `${esc(why)} <a href="${SITE}/account" style="color:#b8924a;text-decoration:none;">${L(lang, 'Manage email preferences', 'Gérer mes préférences de courriel')}</a>`,
  );

// ── Promotions ──────────────────────────────────────────────────────────────

type Promo = {
  code?: string;
  description?: string;
  descriptionFr?: string;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  minPurchase?: number;
  startDate?: unknown;
  endDate?: unknown;
  isActive?: boolean;
  usageLimit?: number;
  usageCount?: number;
  announce?: boolean;
  announcedAt?: unknown;
  announcingAt?: number;
};

export function promoIsLive(d: Promo, now = Date.now()): boolean {
  if (d.isActive === false || !str(d.code)) return false;
  const start = millis(d.startDate);
  const end = millis(d.endDate);
  if (Number.isFinite(start) && start > now) return false;
  // endDate is a calendar day — live through the end of it.
  if (Number.isFinite(end) && end + 24 * 3600_000 < now) return false;
  if (typeof d.usageLimit === 'number' && (d.usageCount ?? 0) >= d.usageLimit) return false;
  return true;
}

function offerText(d: Promo, lang: EmailLang): string {
  const v = Number(d.discountValue ?? 0);
  const base =
    d.discountType === 'fixed'
      ? L(lang, `$${v} off`, `${v} $ de rabais`)
      : L(lang, `${v}% off`, `${v} % de rabais`);
  const min = Number(d.minPurchase ?? 0);
  return min > 0
    ? `${base}${L(lang, ` on orders over $${min}`, ` sur les commandes de plus de ${min} $`)}`
    : base;
}

function promoEmail(d: Promo, r: Recipient, b: EmailBrand): Outgoing {
  const lang = r.lang;
  const T = (en: string, fr: string) => L(lang, en, fr);
  const codeTxt = str(d.code).toUpperCase();
  const offer = offerText(d, lang);
  const end = millis(d.endDate);
  const endTxt = Number.isFinite(end)
    ? new Date(end + 12 * 3600_000).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
        month: 'long',
        day: 'numeric',
        timeZone: 'America/Vancouver',
      })
    : '';
  const desc = (lang === 'fr' && str(d.descriptionFr)) || str(d.description);
  return {
    to: r.email,
    subject: T(
      `${offer} with code ${codeTxt} | ${b.name}`,
      `${offer} avec le code ${codeTxt} | ${b.name}`,
    ),
    html: renderEmail({
      brand: b,
      lang,
      preheader: T(
        `Use code ${codeTxt} at checkout${endTxt ? ` — ends ${endTxt}` : ''}.`,
        `Utilisez le code ${codeTxt} à la caisse${endTxt ? ` — jusqu'au ${endTxt}` : ''}.`,
      ),
      eyebrow: T('A new offer', 'Nouvelle offre'),
      title: offer,
      body: [
        p(
          T(
            `${r.firstName ? `Hi ${esc(r.firstName)}, ` : ''}here&#39;s something for your next cup.`,
            `${r.firstName ? `Bonjour ${esc(r.firstName)}, ` : ''}voici de quoi agrémenter votre prochaine tasse.`,
          ),
        ),
        desc ? p(esc(desc)) : '',
        p(
          `${T('Use code', 'Utilisez le code')} ${code(codeTxt)} ${T('at checkout', 'à la caisse')}${endTxt ? T(` — ends ${strong(esc(endTxt))}`, ` — jusqu&#39;au ${strong(esc(endTxt))}`) : ''}.`,
        ),
        button(T('Shop now', 'Magasiner'), `${SITE}/products`),
        manageNote(
          lang,
          T(
            'You get Ele Café offers because Promotions is on in your account.',
            'Vous recevez les offres Ele Café, car les promotions sont activées dans votre compte.',
          ),
        ),
      ],
    }),
  };
}

/** Email + bell + push a promotion to everyone subscribed. Claims the
 *  promotion first so two callers can't double-send. */
async function announcePromotion(
  promoId: string,
  force = false,
): Promise<{ sent: number; skipped?: string; error?: string }> {
  const ref = db().doc(`promotions/${promoId}`);
  const d = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    const data = s.data() as Promo;
    if (!force && data.announcedAt) return null;
    if (data.announcingAt && Date.now() - data.announcingAt < 15 * 60_000) return null;
    tx.update(ref, { announcingAt: Date.now() });
    return data;
  });
  if (!d) return { sent: 0, skipped: 'already announced or in progress' };
  if (!promoIsLive(d)) {
    await ref.update({ announcingAt: FS.delete() });
    return { sent: 0, skipped: 'promotion is not live' };
  }

  // The French description may still be in flight from autoTranslatePromotion.
  if (str(d.description) && !str(d.descriptionFr)) {
    try {
      d.descriptionFr = (await translateBatchToFrench([str(d.description)]))[0];
    } catch {
      /* English fallback */
    }
  }
  const [b, rs] = await Promise.all([brand(), recipientsFor('promotions')]);
  const result = await sendBatch(
    rs.map((r) => promoEmail(d, r, b)),
    b.email,
  );
  const codeTxt = str(d.code).toUpperCase();
  await bellAndPush(
    rs,
    (r) => `promo_${promoId}_${r.uid}`,
    'customer_promotion',
    (r) => ({
      title: L(
        r.lang,
        `${offerText(d, 'en')} with code ${codeTxt}`,
        `${offerText(d, 'fr')} avec le code ${codeTxt}`,
      ),
      body: L(r.lang, 'Use the code at checkout.', 'Utilisez le code à la caisse.'),
    }),
    {
      code: codeTxt,
      discountType: d.discountType ?? 'percentage',
      discountValue: Number(d.discountValue ?? 0),
      minPurchase: Number(d.minPurchase ?? 0),
      url: '/products',
    },
    '/products',
  );
  await ref.update({
    announcingAt: FS.delete(),
    announcedAt: FS.serverTimestamp(),
    announcedCount: result.sent,
    announceError: result.error ?? FS.delete(),
  });
  console.log(
    `[announcePromotion] ${promoId}: ${result.sent}/${rs.length} emails${result.error ? ` (error: ${result.error})` : ''}`,
  );
  return { sent: result.sent, ...(result.error ? { error: result.error } : {}) };
}

/** Auto-announce when a promotion with "Email customers" ticked goes live. */
export const onPromotionWrite = functions.firestore.onDocumentWritten(
  {
    region: REGION,
    document: 'promotions/{id}',
    secrets: ['RESEND_API_KEY'],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (event) => {
    const after = event.data?.after?.data() as Promo | undefined;
    const before = event.data?.before?.data() as Promo | undefined;
    if (!after || after.announce !== true || after.announcedAt || !promoIsLive(after)) return;
    // Only on the change that made it announceable — not on our own bookkeeping writes.
    if (before && before.announce === true && promoIsLive(before)) return;
    await announcePromotion(event.params.id);
  },
);

/** Admin "Notify customers" button. */
export const notifyPromotion = functions.https.onCall(
  {
    region: REGION,
    enforceAppCheck: true,
    secrets: ['RESEND_API_KEY'],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request) => {
    if (request.auth?.token?.role !== 'admin')
      throw new functions.https.HttpsError('permission-denied', 'Admins only.');
    const { promotionId, force } = (request.data ?? {}) as {
      promotionId?: unknown;
      force?: unknown;
    };
    if (typeof promotionId !== 'string' || !promotionId)
      throw new functions.https.HttpsError('invalid-argument', 'promotionId required.');
    return announcePromotion(promotionId, force === true);
  },
);

// ── New arrivals ────────────────────────────────────────────────────────────

type Tea = {
  name?: string;
  nameFr?: string;
  slug?: string;
  category?: string;
  image?: string;
  price?: number;
  isActive?: boolean;
  createdAt?: unknown;
};

/** Queue a tea when it's first published (created active, or activated
 *  within 30 days of being created). Re-activating an old tea doesn't count. */
export const onTeaPublished = functions.firestore.onDocumentWritten(
  { region: REGION, document: 'teas/{id}' },
  async (event) => {
    const after = event.data?.after?.data() as Tea | undefined;
    if (!after || after.isActive === false) return;
    const before = event.data?.before?.data() as Tea | undefined;
    if (before && before.isActive !== false) return;
    const created = millis(after.createdAt);
    if (before && !(Number.isFinite(created) && Date.now() - created < 30 * 86400_000)) return;
    const ref = db().doc(`newArrivalQueue/${event.params.id}`);
    await db().runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return; // queued or announced before
      tx.set(ref, { queuedAt: Date.now(), sentAt: null });
    });
  },
);

function teaPath(t: Tea) {
  return t.category && t.slug
    ? `/tea-profile/${encodeURIComponent(t.category)}/${encodeURIComponent(t.slug)}`
    : `/products`;
}

async function sendNewArrivals(): Promise<void> {
  // Wait 30 min after publishing so the French translation and photo settle.
  const q = await db().collection('newArrivalQueue').where('sentAt', '==', null).get();
  const ready = q.docs.filter((d) => Date.now() - Number(d.get('queuedAt') ?? 0) > 30 * 60_000);
  if (!ready.length) return;
  const teas: Array<Tea & { id: string }> = [];
  for (const d of ready) {
    const t = (await db().doc(`teas/${d.id}`).get()).data() as Tea | undefined;
    if (t && t.isActive !== false) teas.push({ ...t, id: d.id });
  }
  // Claim first so an overlapping run can't resend.
  const claim = db().batch();
  ready.forEach((d) => claim.update(d.ref, { sentAt: Date.now() }));
  await claim.commit();
  if (!teas.length) return;

  const [b, rs] = await Promise.all([brand(), recipientsFor('newArrivals')]);
  const nameOf = (t: Tea, lang: EmailLang) =>
    (lang === 'fr' && str(t.nameFr)) || str(t.name) || t.slug || '';
  const shown = teas.slice(0, 6);
  const mails = rs.map((r): Outgoing => {
    const lang = r.lang;
    const T = (en: string, fr: string) => L(lang, en, fr);
    const first = nameOf(teas[0], lang);
    const one = teas.length === 1;
    return {
      to: r.email,
      subject: one
        ? T(`New at ${b.name}: ${first}`, `Nouveau chez ${b.name} : ${first}`)
        : T(`${teas.length} new teas at ${b.name}`, `${teas.length} nouveaux thés chez ${b.name}`),
      html: renderEmail({
        brand: b,
        lang,
        preheader: one
          ? T(
              `${first} just arrived — be among the first to try it.`,
              `${first} vient d'arriver — soyez parmi les premiers à le goûter.`,
            )
          : T(
              'Fresh teas just arrived — be among the first to try them.',
              "De nouveaux thés viennent d'arriver — soyez parmi les premiers à les goûter.",
            ),
        eyebrow: T('New arrivals', 'Nouveautés'),
        title: one ? first : T('Fresh from our shelves', 'Tout juste arrivés'),
        body: [
          ...shown.flatMap((t) => [
            one ? image(str(t.image), nameOf(t, lang)) : '',
            p(
              `${strong(esc(nameOf(t, lang)))}${typeof t.price === 'number' && t.price > 0 ? ` · ${T(`$${t.price.toFixed(2)}`, `${t.price.toFixed(2)} $`)}` : ''} — <a href="${SITE}${teaPath(t)}" style="color:#b8924a;text-decoration:none;">${T('View tea', 'Voir le thé')}</a>`,
            ),
          ]),
          teas.length > shown.length
            ? p(
                T(
                  `…and ${teas.length - shown.length} more.`,
                  `…et ${teas.length - shown.length} de plus.`,
                ),
                { small: true },
              )
            : '',
          button(
            one ? T('View tea', 'Voir le thé') : T('Shop new teas', 'Découvrir les nouveautés'),
            one ? `${SITE}${teaPath(teas[0])}` : `${SITE}/products`,
          ),
          manageNote(
            lang,
            T(
              'You get new-tea alerts because New arrivals is on in your account.',
              'Vous recevez les alertes de nouveautés, car « Nouveautés » est activé dans votre compte.',
            ),
          ),
        ],
      }),
    };
  });
  const result = await sendBatch(mails, b.email);
  const key = teas
    .map((t) => t.id)
    .sort()
    .join('_')
    .slice(0, 200);
  await bellAndPush(
    rs,
    (r) => `newtea_${key}_${r.uid}`.slice(0, 700),
    'customer_new_arrival',
    (r) =>
      teas.length === 1
        ? {
            title: L(
              r.lang,
              `New tea: ${nameOf(teas[0], 'en')}`,
              `Nouveau thé : ${nameOf(teas[0], 'fr')}`,
            ),
            body: L(
              r.lang,
              'Be among the first to try it.',
              'Soyez parmi les premiers à le goûter.',
            ),
          }
        : {
            title: L(
              r.lang,
              `${teas.length} new teas just arrived`,
              `${teas.length} nouveaux thés viennent d'arriver`,
            ),
            body: L(
              r.lang,
              'Be among the first to try them.',
              'Soyez parmi les premiers à les goûter.',
            ),
          },
    {
      count: teas.length,
      teaName: nameOf(teas[0], 'en'),
      teaNameFr: nameOf(teas[0], 'fr'),
      url: teas.length === 1 ? teaPath(teas[0]) : '/products',
    },
    teas.length === 1 ? teaPath(teas[0]) : '/products',
  );
  console.log(
    `[newArrivals] ${teas.length} tea(s): ${result.sent}/${rs.length} emails${result.error ? ` (error: ${result.error})` : ''}`,
  );
}

// ── Cart reminders ──────────────────────────────────────────────────────────

type CartItem = { name?: string; nameFr?: string; quantity?: number; price?: number };

async function sendCartReminders(): Promise<void> {
  const now = Date.now();
  const snap = await db()
    .collection('carts')
    .where('updatedAt', '<=', now - 24 * 3600_000)
    .where('updatedAt', '>=', now - 72 * 3600_000)
    .get();
  if (snap.empty) return;
  const b = await brand();
  const due: Array<{ r: Recipient; items: CartItem[]; updatedAt: number }> = [];
  for (const c of snap.docs) {
    const items = (Array.isArray(c.get('items')) ? c.get('items') : []) as CartItem[];
    if (!items.length) continue;
    const logRef = db().doc(`cartReminders/${c.id}`);
    const log = (await logRef.get()).data();
    const updatedAt = Number(c.get('updatedAt'));
    if (log && (log.cartUpdatedAt === updatedAt || now - Number(log.sentAt ?? 0) < 7 * 86400_000))
      continue;
    const r = await toRecipient(c.id, (await db().doc(`users/${c.id}`).get()).data(), 'reminders');
    if (!r) continue;
    await logRef.set({ sentAt: now, cartUpdatedAt: updatedAt });
    due.push({ r, items, updatedAt });
  }
  if (!due.length) return;

  const mails = due.map(({ r, items }): Outgoing => {
    const lang = r.lang;
    const T = (en: string, fr: string) => L(lang, en, fr);
    return {
      to: r.email,
      subject: T(`Your cart is waiting | ${b.name}`, `Votre panier vous attend | ${b.name}`),
      html: renderEmail({
        brand: b,
        lang,
        preheader: T(
          'Your teas are still in your cart.',
          'Vos thés sont toujours dans votre panier.',
        ),
        eyebrow: T('Still thinking it over?', 'Vous hésitez encore?'),
        title: T('Your cart is waiting', 'Votre panier vous attend'),
        body: [
          p(
            T(
              `${r.firstName ? `Hi ${esc(r.firstName)}, you` : 'You'} left a few teas in your cart. They&#39;re saved for you whenever you&#39;re ready.`,
              `${r.firstName ? `Bonjour ${esc(r.firstName)}, vous` : 'Vous'} avez laissé quelques thés dans votre panier. Ils vous attendent quand vous serez prêt.`,
            ),
          ),
          itemsTable(
            items.map((it) => ({
              productName: (lang === 'fr' && str(it.nameFr)) || str(it.name) || T('Tea', 'Thé'),
              quantity: Number(it.quantity ?? 1),
              price: Number(it.price ?? 0),
            })),
            T('In your cart', 'Dans votre panier'),
            lang,
          ),
          button(T('Return to cart', 'Retour au panier'), `${SITE}/cart`),
          manageNote(
            lang,
            T(
              'You get cart reminders because Cart reminders is on in your account.',
              'Vous recevez ces rappels, car « Rappels de panier » est activé dans votre compte.',
            ),
          ),
        ],
      }),
    };
  });
  const result = await sendBatch(mails, b.email);
  await bellAndPush(
    due.map((x) => x.r),
    (r) => `cart_${r.uid}_${due.find((x) => x.r.uid === r.uid)?.updatedAt ?? now}`,
    'customer_cart_reminder',
    (r) => {
      const n =
        due
          .find((x) => x.r.uid === r.uid)
          ?.items.reduce((s, it) => s + Number(it.quantity ?? 1), 0) ?? 1;
      return {
        title: L(r.lang, 'Your cart is waiting', 'Votre panier vous attend'),
        body:
          n === 1
            ? L(
                r.lang,
                'An item is waiting in your cart.',
                'Un article vous attend dans votre panier.',
              )
            : L(
                r.lang,
                `${n} items are waiting in your cart.`,
                `${n} articles vous attendent dans votre panier.`,
              ),
      };
    },
    { url: '/cart' },
    '/cart',
  );
  console.log(
    `[cartReminders] ${result.sent}/${due.length} emails${result.error ? ` (error: ${result.error})` : ''}`,
  );
}

// ── Hourly tick ─────────────────────────────────────────────────────────────

/** Promotions that went live on their start date, new-arrival digests,
 *  and cart reminders. Each part is independent — one failing doesn't
 *  stop the others. */
export const marketingTick = functions.scheduler.onSchedule(
  {
    region: REGION,
    schedule: 'every 60 minutes',
    secrets: ['RESEND_API_KEY'],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    try {
      const promos = await db().collection('promotions').where('announce', '==', true).get();
      for (const d of promos.docs) {
        const data = d.data() as Promo;
        if (!data.announcedAt && promoIsLive(data)) await announcePromotion(d.id);
      }
    } catch (err) {
      console.error('[marketingTick] promotions failed:', err);
    }
    try {
      await sendNewArrivals();
    } catch (err) {
      console.error('[marketingTick] new arrivals failed:', err);
    }
    try {
      await sendCartReminders();
    } catch (err) {
      console.error('[marketingTick] cart reminders failed:', err);
    }
  },
);
