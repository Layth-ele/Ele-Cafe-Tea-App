/**
 * scripts/migrate-qunit-to-qty.mjs
 *
 * Phase 20 — one-off rename of inventory category units.
 *
 * Background: a category was created with `unit: 'Qunit'` (likely a
 * typo for "Unit"). The merchant has asked us to rename it everywhere
 * to "Qty" (short for Quantity). Two Firestore surfaces are affected:
 *
 *   1. /inventoryCategories/{id}            — the category itself has
 *                                              a `unit` field
 *   2. /inventoryCategories/{id}/items/{id} — each item under that
 *                                              category may have its
 *                                              own `unit` field that
 *                                              overrides the parent
 *
 * The script walks both layers and rewrites any document whose
 * `unit` is exactly the string "Qunit". Case-sensitive on purpose —
 * we don't want to clobber legitimate values like "QU" or "Qu" if
 * any exist.
 *
 * USAGE
 *
 *   1. Make sure you've got admin credentials. Either:
 *      (a) export GOOGLE_APPLICATION_CREDENTIALS=/path/to/svc.json
 *      (b) gcloud auth application-default login
 *
 *   2. Dry-run first to see what would change:
 *
 *      node scripts/migrate-qunit-to-qty.mjs
 *
 *   3. Actually write the changes:
 *
 *      node scripts/migrate-qunit-to-qty.mjs --yes
 *
 *   4. If you'd prefer "Quantity" or "unit" instead of "Qty", pass:
 *
 *      node scripts/migrate-qunit-to-qty.mjs --to=Quantity --yes
 *
 * Idempotent: re-running after a successful migration is a no-op
 * because `Qunit` won't match anymore.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const FROM_VALUE = 'Qunit';
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--yes');
const TO_VALUE = (() => {
  const arg = args.find((a) => a.startsWith('--to='));
  if (arg) return arg.slice('--to='.length);
  return 'Qty';
})();

if (!getApps().length) {
  initializeApp({ credential: applicationDefault() });
}
const db = getFirestore();

async function main() {
  console.log(`\n🔧 Migration: rename inventory unit "${FROM_VALUE}" → "${TO_VALUE}"`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE (will write to Firestore)'}\n`);

  const categoriesSnap = await db.collection('inventoryCategories').get();
  let categoryHits = 0;
  let itemHits     = 0;

  // Pass 1 — categories themselves
  for (const catDoc of categoriesSnap.docs) {
    const data = catDoc.data();
    if (data.unit === FROM_VALUE) {
      categoryHits++;
      console.log(`  category   ${catDoc.id.padEnd(20)} unit: "${FROM_VALUE}" → "${TO_VALUE}"`);
      if (!DRY_RUN) {
        await catDoc.ref.update({ unit: TO_VALUE });
      }
    }

    // Pass 2 — items under this category
    const itemsSnap = await catDoc.ref.collection('items').get();
    for (const itemDoc of itemsSnap.docs) {
      const itemData = itemDoc.data();
      if (itemData.unit === FROM_VALUE) {
        itemHits++;
        console.log(`  item       ${catDoc.id}/${itemDoc.id.padEnd(12)} unit: "${FROM_VALUE}" → "${TO_VALUE}"`);
        if (!DRY_RUN) {
          await itemDoc.ref.update({ unit: TO_VALUE });
        }
      }
    }
  }

  console.log(`\n✅ Done. Categories touched: ${categoryHits}. Items touched: ${itemHits}.`);
  if (DRY_RUN && (categoryHits > 0 || itemHits > 0)) {
    console.log(`   Re-run with --yes to actually apply.\n`);
  } else if (categoryHits === 0 && itemHits === 0) {
    console.log(`   Nothing matched — already migrated, or "${FROM_VALUE}" doesn't exist as a unit in your data.\n`);
  }
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
