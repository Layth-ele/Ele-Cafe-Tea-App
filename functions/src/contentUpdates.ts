/**
 * contentUpdates.ts — one-off content changes the owner approved, applied
 * from Admin with their own admin account (no machine credentials needed).
 *
 * applyApprovedTeaDescriptions: writes the approved longer descriptions
 * (lib/approvedTeaDescriptions.ts) and corrects Green Mate's caffeine
 * (yerba mate contains caffeine — it was listed as caffeine-free). A tea
 * whose description changed since the draft was made is skipped, never
 * overwritten. translate.ts then refreshes each French description.
 * Idempotent: running it again changes nothing.
 */
import * as functions from 'firebase-functions/v2';
import * as admin from './lib/admin';
import { APPROVED_TEA_DESCRIPTIONS } from './lib/approvedTeaDescriptions';

const norm = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

export const applyApprovedTeaDescriptions = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: true, invoker: 'public', timeoutSeconds: 120 },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admins only.');
    }
    const db = admin.firestore();
    const snap = await db.collection('teas').get();
    let updated = 0;
    let already = 0;
    let frCleared = 0;
    const skipped: string[] = [];
    const batch = db.batch();
    for (const doc of snap.docs) {
      const d = doc.data();
      const slug = typeof d.slug === 'string' ? d.slug : doc.id;
      const draft = APPROVED_TEA_DESCRIPTIONS[slug];
      const patch: Record<string, unknown> = {};
      if (draft) {
        const now = norm(d.description);
        let isApproved = false;
        if (now === norm(draft.proposed)) {
          already += 1;
          isApproved = true;
        } else if (draft.from.some((f) => norm(f) === now)) {
          patch.description = draft.proposed;
          isApproved = true;
        } else skipped.push(typeof d.name === 'string' ? d.name : slug);
        // French: the old French is a translation of the short original.
        // translate.ts only refreshes French it wrote itself, so clear a
        // clearly stale one (much shorter than the new English, not
        // auto-written) and the trigger translates the full description.
        if (isApproved) {
          const fr = norm(d.descriptionFr);
          const auto = (await db.doc(`translationMeta/teas__${doc.id}`).get()).get(
            'fields.descriptionFr',
          );
          if (fr && !auto && fr.length < norm(draft.proposed).length * 0.6) {
            patch.descriptionFr = '';
            frCleared += 1;
          }
        }
      }
      if (slug === 'green-mate' && d.caffeine !== 'Medium') patch.caffeine = 'Medium';
      if (Object.keys(patch).length) {
        batch.update(doc.ref, {
          ...patch,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (patch.description) updated += 1;
      }
    }
    await batch.commit();
    console.log(
      `[contentUpdates] descriptions: ${updated} updated, ${already} already done, skipped: ${skipped.join(', ') || 'none'}`,
    );
    return { updated, already, skipped, frCleared };
  },
);

// ── Café pairings: missing descriptions, calories and link fixes ──────────

const PLACEHOLDER_EN = 'Add a description for this pairing.';
const PLACEHOLDER_FR = 'Ajoutez une description pour cet accord.';

interface PairingUpdate {
  /** Current slug (how the pairing is found). */
  slug: string;
  newSlug?: string;
  /** Description, set only when the current one is the placeholder or `fromDescription`. */
  description?: string;
  fromDescription?: string;
  /** Typical calories for this kind of pastry — owner to confirm; set only when blank. */
  calories?: number;
}

const PAIRING_UPDATES: PairingUpdate[] = [
  {
    slug: 'walnut-carrot-muffin',
    description:
      'Moist carrot muffin with crunchy walnuts, served with your choice of tea or Americano. Lovely with a chai or a rooibos.',
    calories: 470,
  },
  {
    slug: 'new-pairing-2',
    newSlug: 'spiral-croissant',
    description:
      'Flaky, buttery spiral croissant, served with your choice of tea or Americano — a simple café breakfast in Vancouver.',
    calories: 360,
  },
  {
    slug: 'marble-english-cake',
    description:
      'A classic English marble cake, swirled with vanilla and chocolate sponge, served with your choice of tea or Americano. Perfect with an Earl Grey or English Breakfast.',
    calories: 360,
  },
  {
    slug: 'almond-croissant',
    description:
      'Buttery croissant filled with almond cream and topped with toasted sliced almonds, served with your choice of tea or Americano.',
    calories: 430,
  },
  { slug: 'butter-croissant', calories: 300 },
  { slug: 'pistachio-puff-cream', calories: 440 },
  { slug: 'pistachio-danish', calories: 420 },
  { slug: 'nutella-croissant', calories: 400 },
  { slug: 'pear-danish', calories: 360 },
  { slug: 'blueberry-walnut-danish', calories: 400 },
  { slug: 'spinach-and-feta-strudal', newSlug: 'spinach-and-feta-strudel', calories: 380 },
  { slug: 'leek-and-parmesan-strudal', newSlug: 'leek-and-parmesan-strudel', calories: 400 },
  {
    slug: 'orange-brownie-vegan-tart',
    fromDescription:
      'Rich, fugy, and deeply chocolatey with a bright citrus twist — this Orange Brownie Tart blends cacao with real orange juice, zest, and orange purée for a fresh, uplifting finish. served with your choice of tea or Americano.',
    description:
      'Rich, fudgy and deeply chocolatey with a bright citrus twist — this Orange Brownie Tart blends cacao with real orange juice, zest and orange purée for a fresh, uplifting finish. Served with your choice of tea or Americano.',
  },
  {
    slug: 'mango-passion-fruit-vegan-tart',
    fromDescription:
      'A tropical tart layered with soft cashew-date crust, smooth mango mousse, and hand-poured passion fruit jelly. served with your choice of tea or Americano.',
    description:
      'A tropical tart layered with a soft cashew-date crust, smooth mango mousse and hand-poured passion fruit jelly. Served with your choice of tea or Americano.',
  },
  {
    slug: 'banana-caramel-vegan-tart',
    fromDescription:
      'A rich, comforting tart made with ripe banana, creamy cashew mousse, and our signature vegan caramel poured slow on top. served with your choice of tea or Americano.',
    description:
      'A rich, comforting tart made with ripe banana, creamy cashew mousse and our signature vegan caramel poured slowly on top. Served with your choice of tea or Americano.',
  },
];

export const applyPairingUpdates = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: true, invoker: 'public', timeoutSeconds: 60 },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admins only.');
    }
    const db = admin.firestore();
    const snap = await db.collection('comboGalleryItems').get();
    const bySlug = new Map(snap.docs.map((d) => [String(d.get('slug') ?? ''), d]));
    const changed: string[] = [];
    const batch = db.batch();
    for (const u of PAIRING_UPDATES) {
      const d = bySlug.get(u.slug) ?? (u.newSlug ? bySlug.get(u.newSlug) : undefined);
      if (!d) continue;
      const data = d.data();
      const patch: Record<string, unknown> = {};
      const desc = norm(data.description);
      if (u.description && desc !== norm(u.description)) {
        if (
          desc === norm(PLACEHOLDER_EN) ||
          (u.fromDescription && desc === norm(u.fromDescription))
        ) {
          patch.description = u.description;
          // Let translate.ts write the French from the new English.
          if (desc === norm(PLACEHOLDER_EN) || norm(data.descriptionFr) === norm(PLACEHOLDER_FR))
            patch.descriptionFr = '';
        }
      }
      if (u.calories && !(typeof data.calories === 'number' && data.calories > 0))
        patch.calories = u.calories;
      if (u.newSlug && data.slug === u.slug && !bySlug.has(u.newSlug)) patch.slug = u.newSlug;
      if (Object.keys(patch).length) {
        batch.update(d.ref, { ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        changed.push(String(data.title ?? u.slug));
      }
    }
    await batch.commit();
    console.log(`[contentUpdates] pairings updated: ${changed.join(', ') || 'none'}`);
    return { changed };
  },
);
