#!/usr/bin/env node
/**
 * migrate-combo-enabled.mjs
 *
 * One-shot Firestore migration that backfills `enabled: true` on
 * every `/comboGalleryItems/*` document that doesn't have the field.
 *
 * Why this exists
 * ───────────────
 * The combo gallery's `enabled` flag was added after the feature
 * shipped. Legacy docs from before that release have no `enabled`
 * field. Code paths that needed to filter on `enabled` had to use
 * `enabled !== false` (treating undefined as enabled) instead of
 * `where('enabled', '==', true)` — because Firestore's `where` and
 * `!=` operators exclude documents missing the field entirely.
 *
 * That JS-side post-filter means every page load reads ALL docs
 * (enabled + disabled), then filters in memory. Cheap at café scale,
 * but the architecturally cleaner path is to make the field
 * universally present.
 *
 * What this script does
 * ─────────────────────
 *   1. Connects via firebase-admin using your service-account key.
 *   2. Reads /comboGalleryItems in one snapshot.
 *   3. For each doc where `enabled` is absent (NOT set to false),
 *      writes `enabled: true` via a batched update.
 *   4. Commits in batches of 400 to stay under Firestore's 500-op
 *      batch limit.
 *   5. Prints a summary at the end.
 *
 * Reversible? Yes — re-running is idempotent (only touches docs
 * missing the field). Setting enabled: false is the standard
 * "hide from carousel" operation and is unaffected.
 *
 * How to run
 * ──────────
 *   1. Generate a service-account key from Firebase Console →
 *      Project Settings → Service accounts → Generate new private
 *      key. Save it somewhere safe; DO NOT commit it.
 *   2. Export GOOGLE_APPLICATION_CREDENTIALS to its path:
 *      $ export GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
 *   3. From the project root:
 *      $ node scripts/migrate-combo-enabled.mjs
 *   4. Output prints "X docs migrated" — that's the count of docs
 *      where the field was previously absent.
 *
 * After running this migration the customer-side query in
 * `useComboGallery` (src/app/components/ComboGallery.tsx) and the
 * Cloud Function paths (`fetchComboBySlug`, `getSitemap`) can be
 * tightened to `where('enabled', '==', true)`. Until you've actually
 * RUN this script, the JS-side `enabled !== false` filters stay.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

// ── Credential resolution ──────────────────────────────────────────────────
// Prefer the GOOGLE_APPLICATION_CREDENTIALS env var (standard ADC), but
// also accept a `--key=path/to/key.json` flag for one-off runs.
const keyFlag = process.argv.find(a => a.startsWith('--key='));
const credentialPath = keyFlag
  ? keyFlag.slice('--key='.length)
  : process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!credentialPath) {
  console.error('Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS or pass --key=./service-account.json');
  process.exit(1);
}
if (!fs.existsSync(credentialPath)) {
  console.error(`Credentials file not found at: ${credentialPath}`);
  process.exit(1);
}

initializeApp({
  credential: cert(JSON.parse(fs.readFileSync(credentialPath, 'utf-8'))),
});

const db = getFirestore();

// ── Migration ──────────────────────────────────────────────────────────────
async function main() {
  console.log('[migrate-combo-enabled] reading /comboGalleryItems …');
  const snap = await db.collection('comboGalleryItems').get();
  console.log(`[migrate-combo-enabled] ${snap.size} total docs`);

  const toMigrate = snap.docs.filter(d => {
    const data = d.data();
    // Migrate ONLY docs where `enabled` is genuinely missing.
    // `enabled === false` means the admin explicitly disabled — leave
    // it alone. `enabled === true` is already correct.
    return !('enabled' in data);
  });

  console.log(`[migrate-combo-enabled] ${toMigrate.length} docs need backfill`);
  if (toMigrate.length === 0) {
    console.log('[migrate-combo-enabled] nothing to do — every doc already has `enabled`. ✅');
    return;
  }

  // Confirm before writing in case this is being run by mistake.
  if (!process.argv.includes('--yes')) {
    console.log('[migrate-combo-enabled] re-run with --yes to actually write.');
    console.log('[migrate-combo-enabled] (this dry-run mode is intentional — destructive ops should be explicit.)');
    return;
  }

  // Firestore caps batched writes at 500 operations. We add a tiny
  // safety margin and commit at 400 to leave room for anything else.
  const BATCH_SIZE = 400;
  let committed = 0;
  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const slice = toMigrate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const d of slice) {
      batch.update(d.ref, { enabled: true });
    }
    await batch.commit();
    committed += slice.length;
    console.log(`[migrate-combo-enabled] committed ${committed} / ${toMigrate.length}`);
  }

  console.log(`[migrate-combo-enabled] done — ${committed} docs migrated. ✅`);
  console.log('[migrate-combo-enabled] you can now switch the JS-side `enabled !== false` filters');
  console.log('[migrate-combo-enabled] to `where("enabled", "==", true)` queries.');
}

main().catch(err => {
  console.error('[migrate-combo-enabled] failed:', err);
  process.exit(2);
});
