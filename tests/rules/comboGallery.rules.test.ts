/**
 * Café pairings: the pairingImageVariants function adds `imageVariants`
 * (small WebP copies) to each pairing. Admin edits must keep working after
 * that — the field allowlist once blocked every save of a resized pairing.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, test } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const adminDb = () =>
  env
    .authenticatedContext('owner', {
      email: 'info@elecafe.ca',
      email_verified: true,
      role: 'admin',
    })
    .firestore();
const customerDb = () =>
  env
    .authenticatedContext('alice', { email: 'alice@example.com', email_verified: true })
    .firestore();

const pairing = {
  imageUrl: 'https://firebasestorage.googleapis.com/x.png',
  storagePath: 'comboGallery/x.png',
  title: 'Leek and Parmesan Strudel',
  description: 'Savoury flaky strudel.',
  price: 9.99,
  currency: 'CAD',
  order: 3,
  enabled: true,
  slug: 'leek-and-parmesan-strudel',
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ele-cafe-pairings',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'comboGalleryItems/strudel'), {
      ...pairing,
      imageVariants: { src: pairing.imageUrl, set: [{ w: 320, url: 'https://x/320.webp' }] },
    });
  });
});
afterAll(async () => {
  await env?.cleanup();
});

describe('café pairings', () => {
  test('admin can edit a pairing whose photo has been resized', async () => {
    await assertSucceeds(
      updateDoc(doc(adminDb(), 'comboGalleryItems/strudel'), { title: 'Leek & Parmesan Strudel' }),
    );
  });

  test('admin can change the photo', async () => {
    await assertSucceeds(
      updateDoc(doc(adminDb(), 'comboGalleryItems/strudel'), {
        imageUrl: 'https://firebasestorage.googleapis.com/y.png',
        storagePath: 'comboGallery/y.png',
      }),
    );
  });

  test('admin can add a new pairing', async () => {
    await assertSucceeds(
      setDoc(doc(adminDb(), 'comboGalleryItems/muffin'), { ...pairing, slug: 'muffin' }),
    );
  });

  test('customers cannot edit pairings', async () => {
    await assertFails(updateDoc(doc(customerDb(), 'comboGalleryItems/strudel'), { price: 0 }));
  });

  test('unknown fields are still rejected', async () => {
    await assertFails(updateDoc(doc(adminDb(), 'comboGalleryItems/strudel'), { hacked: true }));
  });
});
