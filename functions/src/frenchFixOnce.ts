/**
 * frenchFixOnce.ts — temporary: applies quebecFrench() (translate.ts) to the
 * French already saved on teas and café pairings, once, and keeps
 * /translationMeta in step so those fields are still treated as
 * auto-translated. Records completion in /ops/contentUpdates. Remove after
 * it has run.
 */
import * as functions from 'firebase-functions/v2';
import * as admin from './lib/admin';
import { quebecFrench } from './translate';

const FIELDS: Record<string, Array<[string, string]>> = {
  teas: [
    ['name', 'nameFr'],
    ['description', 'descriptionFr'],
    ['benefits', 'benefitsFr'],
    ['ingredients', 'ingredientsFr'],
    ['origin', 'originFr'],
    ['regions', 'regionsFr'],
  ],
  comboGalleryItems: [
    ['title', 'titleFr'],
    ['description', 'descriptionFr'],
  ],
};

export const frenchFixOnce = functions.scheduler.onSchedule(
  { region: 'us-central1', schedule: 'every 2 minutes', timeoutSeconds: 120 },
  async () => {
    const db = admin.firestore();
    const done = db.doc('ops/contentUpdates');
    if ((await done.get()).get('quebecFrenchAt')) return;
    let docs = 0;
    let fields = 0;
    for (const [col, pairs] of Object.entries(FIELDS)) {
      const snap = await db.collection(col).get();
      for (const d of snap.docs) {
        const data = d.data();
        const patch: Record<string, string> = {};
        for (const [en, fr] of pairs) {
          const cur = typeof data[fr] === 'string' ? (data[fr] as string) : '';
          if (!cur) continue;
          const fixed = quebecFrench(typeof data[en] === 'string' ? (data[en] as string) : '', cur);
          if (fixed !== cur) patch[fr] = fixed;
        }
        if (!Object.keys(patch).length) continue;
        await d.ref.update(patch);
        // Keep the auto-translation record matching, so later English edits
        // still refresh the French.
        const metaRef = db.doc(`translationMeta/${col}__${d.id}`);
        const meta = ((await metaRef.get()).get('fields') ?? {}) as Record<
          string,
          { src: string; out: string }
        >;
        let metaChanged = false;
        for (const [fr, val] of Object.entries(patch)) {
          if (meta[fr] && meta[fr].out === data[fr]) {
            meta[fr] = { ...meta[fr], out: val };
            metaChanged = true;
          }
        }
        if (metaChanged) await metaRef.set({ fields: meta }, { merge: true });
        docs += 1;
        fields += Object.keys(patch).length;
      }
    }
    await done.set({ quebecFrenchAt: Date.now(), quebecFrench: { docs, fields } }, { merge: true });
    console.log(`[frenchFixOnce] fixed ${fields} French fields on ${docs} docs`);
  },
);
