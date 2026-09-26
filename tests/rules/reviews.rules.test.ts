/**
 * Tea reviews: customers write their own review with review fields only.
 * `verifiedPurchase` is set by the onReviewWrite Cloud Function (admin SDK)
 * and must never be writable from the browser.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, test } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

let env: RulesTestEnvironment;
const alice = () =>
  env
    .authenticatedContext('alice', { email: 'alice@example.com', email_verified: true })
    .firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ele-cafe-reviews',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'teas/assam'), {
      name: 'Assam',
      slug: 'assam',
      category: 'black',
    });
  });
});
afterAll(async () => {
  await env?.cleanup();
});

const review = {
  userId: 'alice',
  userName: 'Alice',
  rating: 5,
  comment: 'Lovely and malty.',
  createdAt: serverTimestamp(),
};

describe('tea reviews', () => {
  test('a customer can write their own review', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'teas/assam/reviews/alice'), review));
  });

  test('a customer cannot mark their own review as a verified purchase', async () => {
    await assertFails(
      setDoc(doc(alice(), 'teas/assam/reviews/alice'), { ...review, verifiedPurchase: true }),
    );
  });

  test('a customer cannot write a review under someone else’s id', async () => {
    await assertFails(setDoc(doc(alice(), 'teas/assam/reviews/bob'), { ...review, userId: 'bob' }));
  });
});
