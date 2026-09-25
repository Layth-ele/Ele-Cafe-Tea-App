#!/usr/bin/env node
/**
 * scripts/migrate-inventory.mjs
 *
 * One-time migration: convert the legacy `teas/{teaId}.stock: number`
 * field to the new `inventory/{teaId}` collection model. Idempotent —
 * re-running skips any tea that already has an inventory doc.
 *
 * Mapping:
 *   level = clamp(round((stock ?? 50) / 5), 0, 10)
 *
 *   stock 0    → level 0   (out_of_stock)
 *   stock 1-7  → level 0-1 (low_stock / out_of_stock)
 *   stock 8-22 → level 2-4 (low_stock → in_stock boundary)
 *   stock 50+  → level 10  (full)
 *
 * The boundaries are deliberate — a tea sitting at the legacy default
 * of 50 lands at level 10 (clearly in stock); a tea at 1 lands at 0
 * (treat as out_of_stock and let an employee bump it on next refill
 * check). Status is derived from level via the same rules the trigger
 * uses (4-10 in_stock, 1-3 low_stock, 0 out_of_stock).
 *
 * Usage (locally):
 *
 *   1. Authenticate via Google Application Default Credentials. Note:
 *      `firebase login` sets up the Firebase CLI but NOT ADC. The
 *      Admin SDK needs gcloud creds:
 *
 *        gcloud auth application-default login
 *
 *   2. Tell the script which Firebase project to write to:
 *
 *        export GCLOUD_PROJECT=ele-cafe-prod  # or your project ID
 *
 *      (Without this, applicationDefault() may pick the wrong project
 *      or fail with "Unable to detect a Project Id".)
 *
 *   3. Run:
 *
 *        node scripts/migrate-inventory.mjs                  # dry-run
 *        node scripts/migrate-inventory.mjs --apply          # commits
 *
 * The dry-run mode prints the planned writes so you can sanity-check
 * the mapping before committing. --apply is the only mode that writes.
 *
 * What this DOES NOT do:
 *   - Does not delete the legacy `stock` field from /teas. Leave it for
 *     one deploy cycle as a safety net; remove in a follow-up after
 *     confirming the new system reads correctly.
 *   - Does not seed availability fields on the tea doc — the
 *     onInventoryWrite trigger fires on each inventory create and
 *     writes those server-side. Run this AFTER deploying the new
 *     functions so the trigger picks up the projection.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');

// Fail fast on missing project ID — applicationDefault() may otherwise
// silently target the wrong project or surface a confusing
// "Unable to detect a Project Id" error mid-run.
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!PROJECT) {
  console.error('Missing GCLOUD_PROJECT env. Set it before running:');
  console.error('  export GCLOUD_PROJECT=<your-firebase-project-id>');
  process.exit(2);
}

initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore();

function deriveStatus(level) {
  if (level >= 4) return 'in_stock';
  if (level >= 1) return 'low_stock';
  return 'out_of_stock';
}

function levelFromStock(stock) {
  const raw = (typeof stock === 'number' ? stock : 50) / 5;
  return Math.max(0, Math.min(10, Math.round(raw)));
}

async function main() {
  console.log(`migrate-inventory — ${APPLY ? 'APPLY MODE (writes will happen)' : 'dry-run (no writes)'}\n`);

  const teasSnap = await db.collection('teas').get();
  console.log(`Found ${teasSnap.size} teas.\n`);

  let toCreate = 0;
  let skipped  = 0;

  for (const teaDoc of teasSnap.docs) {
    const teaId = teaDoc.id;
    const tea   = teaDoc.data();

    const invRef   = db.doc(`inventory/${teaId}`);
    const existing = await invRef.get();
    if (existing.exists) {
      skipped++;
      continue;
    }

    const level  = levelFromStock(tea.stock);
    const status = deriveStatus(level);

    console.log(
      `  ${teaId.padEnd(28)}  stock=${String(tea.stock ?? 'unset').padStart(4)}  →  level=${String(level).padStart(2)}  ${status}`
    );

    if (APPLY) {
      await invRef.set({
        teaId,
        level,
        status,
        weight:    null,
        updatedBy: 'system:migrate-inventory',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    toCreate++;
  }

  console.log(`\nSummary: ${toCreate} to ${APPLY ? 'create' : 'create (dry-run)'}, ${skipped} skipped (already had inventory doc).`);
  if (!APPLY) console.log('\nRe-run with --apply to commit.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('migrate-inventory failed:', err);
  process.exit(1);
});
