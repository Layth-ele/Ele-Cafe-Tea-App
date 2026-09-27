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
    const skipped: string[] = [];
    const batch = db.batch();
    for (const doc of snap.docs) {
      const d = doc.data();
      const slug = typeof d.slug === 'string' ? d.slug : doc.id;
      const draft = APPROVED_TEA_DESCRIPTIONS[slug];
      const patch: Record<string, unknown> = {};
      if (draft) {
        const now = norm(d.description);
        if (now === norm(draft.proposed)) already += 1;
        else if (draft.from.some((f) => norm(f) === now)) patch.description = draft.proposed;
        else skipped.push(typeof d.name === 'string' ? d.name : slug);
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
    return { updated, already, skipped };
  },
);
