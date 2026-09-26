/**
 * reviews.ts — "Verified purchase" on tea reviews.
 *
 * When a customer writes or edits a review (teas/{teaId}/reviews/{uid}),
 * check whether they have a paid order containing that tea and record the
 * answer as `verifiedPurchase` on the review. Set only here (admin SDK);
 * the client can't write the field (firestore.rules → validReview).
 */
import * as functions from 'firebase-functions/v2';
import * as admin from './lib/admin';

/** Orders whose card was charged or that completed. */
const PAID = new Set(['in_progress', 'ready_for_pickup', 'shipped', 'delivered']);

export async function hasBoughtTea(uid: string, teaId: string, slug?: string): Promise<boolean> {
  const snap = await admin.firestore().collection('orders').where('userId', '==', uid).get();
  return snap.docs.some((d) => {
    if (!PAID.has(String(d.get('status')))) return false;
    const items = (d.get('items') as Array<{ productId?: string }> | undefined) ?? [];
    return items.some((i) => i.productId === teaId || (!!slug && i.productId === slug));
  });
}

export const onReviewWrite = functions.firestore.onDocumentWritten(
  {
    region: 'us-central1',
    document: 'teas/{teaId}/reviews/{uid}',
    memory: '256MiB',
    maxInstances: 5,
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const { teaId, uid } = event.params;
    try {
      const slug = (await admin.firestore().doc(`teas/${teaId}`).get()).get('slug') as
        string | undefined;
      const verified = await hasBoughtTea(uid, teaId, slug);
      // Only write on change — our own update re-triggers this function.
      if (after.get('verifiedPurchase') !== verified) {
        await after.ref.update({ verifiedPurchase: verified });
      }
    } catch (err) {
      console.warn(`[onReviewWrite] teas/${teaId}/reviews/${uid}:`, err);
    }
  },
);
