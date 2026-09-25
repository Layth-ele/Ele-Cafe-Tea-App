/**
 * scripts/backfillImageVariants.mjs
 *
 * One-shot script run AFTER the Firebase Resize Images extension has
 * finished generating variants for the entire `/teas/` bucket. Marks
 * every product with a non-empty `image` field as `variantsAvailable:
 * true` so the LazyImage <picture> source set kicks in.
 *
 * Optionally also encodes a blurhash for products that don't have one,
 * by fetching the original image, downscaling to 32×32, and running the
 * blurhash encoder. Skip with `--no-blurhash` to run only the variants
 * flag flip (faster, no network per product).
 *
 * Usage:
 *   node scripts/backfillImageVariants.mjs
 *   node scripts/backfillImageVariants.mjs --no-blurhash
 *   node scripts/backfillImageVariants.mjs --dry-run
 *
 * Auth:
 *   Uses Application Default Credentials. Locally:
 *     gcloud auth application-default login
 *   On a GCE/Cloud Build runner: ADC is automatic.
 *   The service account needs Firestore read/write on /teas.
 *
 * What it does NOT do:
 *   - Doesn't trigger variant generation. Variants must already exist
 *     (extension has run, or backfill via the extension's own UI).
 *   - Doesn't validate that the variants ACTUALLY exist (no HEAD per
 *     URL). Trust the extension; if a variant 404s the <picture>
 *     falls through to the original src so the page still renders.
 *   - Doesn't re-encode existing blurhashes. A product with a hash
 *     keeps it.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { encode } from 'blurhash';
// node-canvas is a peer dep here. Install with:  npm i -D canvas
// Skipping --no-blurhash avoids needing it.
let createCanvas, loadImage;
try {
  ({ createCanvas, loadImage } = await import('canvas'));
} catch {
  // node-canvas not installed — only --no-blurhash mode will work.
}

const args = new Set(process.argv.slice(2));
const DRY_RUN     = args.has('--dry-run');
const NO_BLURHASH = args.has('--no-blurhash') || !createCanvas;

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function blurhashFromUrl(url) {
  const img = await loadImage(url);
  const canvas = createCanvas(32, 32);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, 32, 32);
  const { data } = ctx.getImageData(0, 0, 32, 32);
  return encode(data, 32, 32, 4, 4);
}

async function main() {
  console.log(`[backfill] Mode: dry-run=${DRY_RUN} blurhash=${!NO_BLURHASH}`);
  if (NO_BLURHASH && !createCanvas && !args.has('--no-blurhash')) {
    console.warn('[backfill] node-canvas not installed — skipping blurhash. ' +
                 'Run `npm i -D canvas` to enable, or pass --no-blurhash to silence.');
  }

  const snap = await db.collection('teas').get();
  console.log(`[backfill] Found ${snap.size} products`);

  let touched = 0, hashed = 0, skipped = 0;
  // Firestore batches cap at 500 writes. We chunk to keep batches small
  // and to avoid memory spikes from holding 500 image fetches in flight.
  const CHUNK = 50;

  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batchDocs = snap.docs.slice(i, i + CHUNK);
    const batch = db.batch();
    // Encode hashes in parallel within the chunk — network-bound work,
    // 50 concurrent fetches is well under any reasonable rate limit.
    await Promise.all(batchDocs.map(async (d) => {
      const data = d.data();
      // Skip if no image at all — nothing to flag.
      if (!data.image) { skipped++; return; }

      const updates = {};
      // Flag variants available. Cheap, idempotent.
      if (!data.variantsAvailable) {
        updates.variantsAvailable = true;
      }
      // Compute blurhash if missing and we can.
      if (!NO_BLURHASH && !data.blurhash) {
        try {
          updates.blurhash = await blurhashFromUrl(data.image);
          hashed++;
        } catch (err) {
          console.warn(`[backfill] ${d.id}: blurhash failed (${err.message}) — keeping unset`);
        }
      }
      if (Object.keys(updates).length > 0) {
        if (!DRY_RUN) batch.update(d.ref, updates);
        touched++;
      }
    }));
    if (!DRY_RUN && touched > 0) await batch.commit();
    process.stdout.write('.');
  }

  console.log(`\n[backfill] Done. Touched ${touched} products (hashed ${hashed}), skipped ${skipped} (no image).`);
  if (DRY_RUN) console.log('[backfill] DRY RUN — no writes performed.');
}

main().catch(err => { console.error(err); process.exit(1); });
