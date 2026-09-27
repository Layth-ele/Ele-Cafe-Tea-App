/**
 * translate.ts — automatic English → French for admin-entered content.
 *
 * The site's UI strings are translated in code (src/i18n/translations.ts).
 * Content the admin types (teas, pairings, categories, announcements,
 * footer) has a French mirror field per English field. These triggers
 * fill that mirror automatically with the Cloud Translation API, so a new
 * tea shows up in French without anyone typing French.
 *
 * Rules (per field):
 *   • French empty                        → auto-translate.
 *   • French was auto-filled by us and the
 *     English changed since               → re-translate.
 *   • French was typed/edited by a human  → never touched.
 *
 * "Auto-filled by us" is remembered in /translationMeta/{collection}__{id}
 * ({ [frField]: { src, out } }) rather than on the doc itself, so admin
 * forms that overwrite the whole doc can't wipe the bookkeeping.
 *
 * Auth: the function's service account (Application Default Credentials)
 * — no API key anywhere in the client. Requires the Cloud Translation API
 * to be enabled on the project; if it isn't, triggers log and skip.
 */
import * as functions from 'firebase-functions/v2';
import * as admin from './lib/admin';

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';
const OPTS = { region: 'us-central1', memory: '256MiB' as const, maxInstances: 5 };

const db = () => admin.firestore();

/** Translate a batch of English strings to French. Order is preserved. */
/**
 * Canadian-French touches the translation engine gets wrong for a Quebec
 * tea shop: a teaspoon is a « cuillère à thé » (not France's « à café »),
 * and caffeine-free is « sans caféine » — « décaféiné » means decaf, so it
 * stays only when the English actually says decaf.
 */
export function quebecFrench(src: string, out: string): string {
  let s = out.replace(
    /cuill(è|e)re(s?) à café/gi,
    (m, e: string, pl: string) => `${m[0]}uill${e}re${pl} à thé`,
  );
  if (!/decaf/i.test(src)) {
    s = s.replace(/(?<!\p{L})décaféiné(?:e?s?)(?!\p{L})/giu, 'sans caféine');
  }
  return s;
}

export async function translateBatchToFrench(texts: string[]): Promise<string[]> {
  if (!texts.length) return [];
  const { access_token } = await admin.credential.applicationDefault().getAccessToken();
  const out: string[] = [];
  // v2 accepts up to 128 segments per request.
  for (let i = 0; i < texts.length; i += 100) {
    const chunk = texts.slice(i, i + 100);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: chunk, source: 'en', target: 'fr', format: 'text' }),
    });
    if (!res.ok)
      throw new Error(`Translation API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as {
      data?: { translations?: Array<{ translatedText?: string }> };
    };
    const t = json.data?.translations ?? [];
    if (t.length !== chunk.length) throw new Error('Translation API returned a partial result');
    out.push(...t.map((x, j) => quebecFrench(chunk[j], x.translatedText ?? '')));
  }
  return out;
}

/** [English field, French field, max length the site's schemas accept]. */
type Pair = readonly [string, string, number];
type AutoMeta = Record<string, { src: string; out: string }>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Decide which French fields need (re)translation. */
function planFields(
  data: Record<string, unknown>,
  pairs: ReadonlyArray<Pair>,
  meta: AutoMeta,
  prefix = '',
) {
  const todo: Array<{ key: string; frField: string; src: string; max: number }> = [];
  for (const [en, fr, max] of pairs) {
    const src = str(data[en]);
    if (!src) continue;
    const cur = str(data[fr]);
    const key = prefix + fr;
    const m = meta[key];
    const auto = m && cur === m.out;
    if (!cur || (auto && m.src !== src)) todo.push({ key, frField: fr, src, max });
  }
  return todo;
}

async function loadMeta(id: string): Promise<AutoMeta> {
  const s = await db().doc(`translationMeta/${id}`).get();
  return (s.data()?.fields as AutoMeta | undefined) ?? {};
}

function saveMeta(id: string, meta: AutoMeta) {
  return db()
    .doc(`translationMeta/${id}`)
    .set(
      { fields: meta, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
}

/** Shared handler for flat docs (teas, pairings, categories). */
async function fillDoc(
  collection: string,
  id: string,
  ref: FirebaseFirestore.DocumentReference,
  data: Record<string, unknown>,
  pairs: ReadonlyArray<Pair>,
) {
  const metaId = `${collection}__${id}`;
  const meta = await loadMeta(metaId);
  const todo = planFields(data, pairs, meta);
  if (!todo.length) return;
  let out: string[];
  try {
    out = await translateBatchToFrench(todo.map((t) => t.src));
  } catch (err) {
    console.warn(
      `[translate] ${collection}/${id} skipped:`,
      err instanceof Error ? err.message : err,
    );
    return;
  }
  const patch: Record<string, string> = {};
  todo.forEach((t, i) => {
    // Too long for the schema → leave it; the site falls back to English.
    if (!out[i] || out[i].length > t.max) return;
    patch[t.frField] = out[i];
    meta[t.key] = { src: t.src, out: out[i] };
  });
  if (!Object.keys(patch).length) return;
  await ref.update(patch);
  await saveMeta(metaId, meta);
  console.log(`[translate] ${collection}/${id}: filled ${Object.keys(patch).join(', ')}`);
}

const TEA_FIELDS: Pair[] = [
  ['name', 'nameFr', 200],
  ['description', 'descriptionFr', 2000],
  ['benefits', 'benefitsFr', 1000],
  ['ingredients', 'ingredientsFr', 500],
  ['origin', 'originFr', 100],
  ['regions', 'regionsFr', 200],
];
const PAIRING_FIELDS: Pair[] = [
  ['title', 'titleFr', 100],
  ['description', 'descriptionFr', 500],
];

export const autoTranslateTea = functions.firestore.onDocumentWritten(
  { ...OPTS, document: 'teas/{id}' },
  async (event) => {
    const snap = event.data?.after;
    if (!snap?.exists) return;
    await fillDoc('teas', event.params.id, snap.ref, snap.data() ?? {}, TEA_FIELDS);
  },
);

export const autoTranslatePairing = functions.firestore.onDocumentWritten(
  { ...OPTS, document: 'comboGalleryItems/{id}' },
  async (event) => {
    const snap = event.data?.after;
    if (!snap?.exists) return;
    await fillDoc(
      'comboGalleryItems',
      event.params.id,
      snap.ref,
      snap.data() ?? {},
      PAIRING_FIELDS,
    );
  },
);

export const autoTranslateCategory = functions.firestore.onDocumentWritten(
  { ...OPTS, document: 'categories/{id}' },
  async (event) => {
    const snap = event.data?.after;
    if (!snap?.exists) return;
    const d = snap.data() ?? {};
    // Older docs use label/labelFr; newer use name/nameFr.
    const pairs: Pair[] =
      typeof d.name === 'string' ? [['name', 'nameFr', 100]] : [['label', 'labelFr', 100]];
    await fillDoc('categories', event.params.id, snap.ref, d, pairs);
  },
);

export const autoTranslatePromotion = functions.firestore.onDocumentWritten(
  { ...OPTS, document: 'promotions/{id}' },
  async (event) => {
    const snap = event.data?.after;
    if (!snap?.exists) return;
    await fillDoc('promotions', event.params.id, snap.ref, snap.data() ?? {}, [
      ['description', 'descriptionFr', 500],
    ]);
  },
);

/** settings/global: announcement messages + custom footer text. */
export const autoTranslateSettings = functions.firestore.onDocumentWritten(
  { ...OPTS, document: 'settings/global' },
  async (event) => {
    const snap = event.data?.after;
    if (!snap?.exists) return;
    const d = snap.data() ?? {};
    const metaId = 'settings__global';
    const meta = await loadMeta(metaId);

    const anns = Array.isArray(d.announcements)
      ? (d.announcements as Array<Record<string, unknown>>)
      : [];
    // Highlights are codes/prices ("SAVE15", "$2.99") — left as typed.
    const annTodo = anns.flatMap((a, i) =>
      planFields(a, [['message', 'messageFr', 140]], meta, `ann:${str(a.id) || i}:`).map((t) => ({
        ...t,
        i,
      })),
    );
    const footTodo = planFields(d, [['footerText', 'footerTextFr', 500]], meta);
    const todo = [...annTodo, ...footTodo.map((t) => ({ ...t, i: -1 }))];
    if (!todo.length) return;

    let out: string[];
    try {
      out = await translateBatchToFrench(todo.map((t) => t.src));
    } catch (err) {
      console.warn(
        '[translate] settings/global skipped:',
        err instanceof Error ? err.message : err,
      );
      return;
    }
    const nextAnns = anns.map((a) => ({ ...a }));
    const patch: Record<string, unknown> = {};
    todo.forEach((t, k) => {
      if (!out[k] || out[k].length > t.max) return;
      if (t.i >= 0) nextAnns[t.i].messageFr = out[k];
      else patch.footerTextFr = out[k];
      meta[t.key] = { src: t.src, out: out[k] };
    });
    if (annTodo.length) patch.announcements = nextAnns;
    if (!Object.keys(patch).length) return;
    await snap.ref.update(patch);
    await saveMeta(metaId, meta);
    console.log(`[translate] settings/global: filled ${todo.length} field(s)`);
  },
);

/** Admin "Translate" buttons — same API, no client-side key. */
export const translateToFrench = functions.https.onCall(
  { ...OPTS, enforceAppCheck: true },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admins only.');
    }
    const texts = (request.data as { texts?: unknown })?.texts;
    if (
      !Array.isArray(texts) ||
      texts.length === 0 ||
      texts.length > 50 ||
      texts.some((t) => typeof t !== 'string' || t.length > 5000)
    ) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'texts must be 1–50 strings of ≤5000 chars.',
      );
    }
    try {
      return { translations: await translateBatchToFrench(texts as string[]) };
    } catch (err) {
      console.error('[translateToFrench]', err);
      throw new functions.https.HttpsError(
        'unavailable',
        'Translation service is unavailable right now.',
      );
    }
  },
);
