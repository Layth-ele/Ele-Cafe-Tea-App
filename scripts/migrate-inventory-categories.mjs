/**
 * scripts/migrate-inventory-categories.mjs
 *
 * Inventory categories v3 — additive, reversible setup:
 *
 *   1. Creates the missing inventory categories (never renames/deletes):
 *        Alternative Milk, Syrups, Purées, Tea Powders, Coffee Bags,
 *        Pastries, Milk, and the system "Equipment · Cooler Log"
 *        (model 'temperature').
 *      Sets display order to match the café's list (only `sortOrder`
 *      changes on existing categories; old values go in the backup).
 *   2. Creates coolers "Cooler 1" and "Cooler 2" if there are none.
 *   3. Seeds the Pastries category with one item per pastry combo in
 *      Admin → Pairings (quantity 0), skipping names that already exist.
 *   4. Items whose category is missing are moved to "Uncategorized"
 *      (created if needed) so they stay visible — original categoryId is
 *      kept in the backup and in `previousCategoryId`.
 *
 * USAGE
 *   node scripts/migrate-inventory-categories.mjs                 # dry run (default): prints the plan
 *   node scripts/migrate-inventory-categories.mjs --apply         # writes + saves a backup JSON
 *   node scripts/migrate-inventory-categories.mjs --revert=<file> # undo using that backup
 *
 * CREDENTIALS
 *   GOOGLE_APPLICATION_CREDENTIALS / `gcloud auth application-default login`,
 *   or add --cli-auth to use your `firebase login` session.
 *
 * Idempotent: re-running --apply after success changes nothing.
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'ele-cafe-d7237';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const REVERT = args.find((a) => a.startsWith('--revert='))?.slice('--revert='.length);

// --cli-auth: reuse the `firebase login` session as application-default
// credentials via a private temp file (0600), deleted when the script exits.
function useCliAuth() {
  const require = createRequire(import.meta.url);
  const ftRoot = process.env.FIREBASE_TOOLS_PATH
    ?? path.join(execSync('npm root -g').toString().trim(), 'firebase-tools');
  const api = require(path.join(ftRoot, 'lib/api.js'));
  const cfg = JSON.parse(readFileSync(path.join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
  const dir = mkdtempSync(path.join(tmpdir(), 'ele-cli-auth-'));
  const file = path.join(dir, 'adc.json');
  writeFileSync(file, JSON.stringify({
    type: 'authorized_user', client_id: api.clientId(), client_secret: api.clientSecret(),
    refresh_token: cfg.tokens.refresh_token, quota_project_id: PROJECT_ID,
  }), { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
}
if (args.includes('--cli-auth')) useCliAuth();

if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

// Display order + defaults for the café's categories. `lowThreshold`:
// quantity strictly below it = "Low stock" (0 = out of stock).
const CATEGORIES = [
  { id: 'tea',              sortOrder: 0 },
  { id: 'vegan-tarts',      sortOrder: 10 },
  { id: 'alternative-milk', sortOrder: 20, name: 'Alternative Milk', unit: 'carton', lowThreshold: 3, color: 'color-1' },
  { id: 'syrups',           sortOrder: 30, name: 'Syrups',           unit: 'bottle', lowThreshold: 3, color: 'color-2' },
  { id: 'purees',           sortOrder: 40, name: 'Purées',           unit: 'bottle', lowThreshold: 3, color: 'color-3' },
  { id: 'tea-powders',      sortOrder: 50, name: 'Tea Powders',      unit: 'bag',    lowThreshold: 3, color: 'color-4' },
  { id: 'coffee-bags',      sortOrder: 60, name: 'Coffee Bags',      unit: 'bag',    lowThreshold: 3, color: 'color-8' },
  { id: 'pastries',         sortOrder: 70, name: 'Pastries',         unit: 'pcs',    lowThreshold: 3, color: 'color-7' },
  { id: 'milk',             sortOrder: 80, name: 'Milk',             unit: 'carton', lowThreshold: 3, color: 'color-5' },
  { id: 'cooler-log',       sortOrder: 90, name: 'Equipment · Cooler Log', model: 'temperature', isSystem: true, color: 'color-tea' },
];
const COOLERS = [
  { id: 'cooler-1', name: 'Cooler 1', sortOrder: 1 },
  { id: 'cooler-2', name: 'Cooler 2', sortOrder: 2 },
];

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const cleanName = (s) => s.replace(/\s+/g, ' ').trim();

async function plan() {
  const ops = [];
  const [catSnap, itemSnap, coolerSnap, comboSnap] = await Promise.all([
    db.collection('inventory_categories').get(),
    db.collection('inventory_items').get(),
    db.collection('inventory_coolers').get(),
    db.collection('comboGalleryItems').get(),
  ]);
  const cats = new Map(catSnap.docs.map((d) => [d.id, d.data()]));

  for (const c of CATEGORIES) {
    const existing = cats.get(c.id);
    if (existing) {
      if (existing.sortOrder !== c.sortOrder) {
        ops.push({ type: 'update', path: `inventory_categories/${c.id}`, data: { sortOrder: c.sortOrder },
          before: { sortOrder: existing.sortOrder ?? null }, why: `reorder "${existing.name}" ${existing.sortOrder} → ${c.sortOrder}` });
      }
      continue;
    }
    const model = c.model ?? 'quantity';
    ops.push({ type: 'create', path: `inventory_categories/${c.id}`, why: `create category "${c.name}" (${model}${c.lowThreshold ? `, low < ${c.lowThreshold}` : ''})`,
      data: { id: c.id, name: c.name, model, unit: model === 'quantity' ? c.unit : null,
        lowThreshold: model === 'quantity' ? c.lowThreshold : null, sortOrder: c.sortOrder, color: c.color,
        isSystem: c.isSystem === true, isActive: true, createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' } });
    cats.set(c.id, { name: c.name });
  }

  if (coolerSnap.empty) {
    for (const c of COOLERS) {
      ops.push({ type: 'create', path: `inventory_coolers/${c.id}`, why: `create cooler "${c.name}"`,
        data: { name: c.name, isActive: true, sortOrder: c.sortOrder } });
    }
  }

  const items = itemSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const pastryNames = new Set(items.filter((i) => i.categoryId === 'pastries').map((i) => cleanName(String(i.name ?? '')).toLowerCase()));
  const combos = comboSnap.docs.map((d) => d.data()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const c of combos) {
    const name = cleanName(String(c.title ?? ''));
    if (name.length < 2 || pastryNames.has(name.toLowerCase())) continue;
    pastryNames.add(name.toLowerCase());
    const id = `pastry-${slug(name)}`;
    ops.push({ type: 'create', path: `inventory_items/${id}`, why: `seed pastry item "${name}" (qty 0)`,
      data: { id, categoryId: 'pastries', name: name.slice(0, 60), image: null, unit: null, quantity: 0,
        lowThreshold: null, status: 'out_of_stock', updatedBy: 'system:migration', updatedAt: 'SERVER_TIME', isActive: true } });
  }

  const orphans = items.filter((i) => !i.categoryId || !cats.has(i.categoryId));
  if (orphans.length) {
    if (!cats.has('uncategorized')) {
      ops.push({ type: 'create', path: 'inventory_categories/uncategorized', why: 'create category "Uncategorized" for orphaned items',
        data: { id: 'uncategorized', name: 'Uncategorized', model: 'quantity', unit: 'unit', lowThreshold: 3, sortOrder: 999,
          color: 'color-5', isSystem: false, isActive: true, createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' } });
    }
    for (const i of orphans) {
      ops.push({ type: 'update', path: `inventory_items/${i.id}`, why: `move "${i.name}" from missing category "${i.categoryId ?? '(none)'}" to Uncategorized`,
        data: { categoryId: 'uncategorized', previousCategoryId: i.categoryId ?? null }, before: { categoryId: i.categoryId ?? null } });
    }
  }
  return ops;
}

const materialize = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === 'SERVER_TIME' ? FieldValue.serverTimestamp() : v]));

async function apply(ops) {
  const dir = path.resolve('..', `ele-cafe-inventory-migration-backup-${new Date().toISOString().slice(0, 10)}`);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `migration-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify({ project: PROJECT_ID, appliedAt: new Date().toISOString(), ops }, null, 2));
  const batch = db.batch();
  for (const op of ops) {
    const ref = db.doc(op.path);
    if (op.type === 'create') batch.create(ref, materialize(op.data));
    else batch.update(ref, materialize(op.data));
  }
  await batch.commit();
  console.log(`\nApplied ${ops.length} change(s). Backup: ${file}`);
  console.log(`Undo with: node scripts/migrate-inventory-categories.mjs --revert=${file}${args.includes('--cli-auth') ? ' --cli-auth' : ''}`);
}

async function revert(file) {
  const { ops } = JSON.parse(readFileSync(file, 'utf8'));
  const batch = db.batch();
  for (const op of [...ops].reverse()) {
    const ref = db.doc(op.path);
    if (op.type === 'create') {
      if (op.path.startsWith('inventory_coolers/')) {
        const logs = await db.collection('cooler_temp_logs').where('coolerId', '==', op.path.split('/')[1]).limit(1).get();
        if (!logs.empty) { console.log(`  keep ${op.path} — it already has temperature entries (audit trail)`); continue; }
      }
      batch.delete(ref);
      console.log(`  delete ${op.path}`);
    } else {
      batch.update(ref, { ...op.before, ...(op.data.previousCategoryId !== undefined ? { previousCategoryId: FieldValue.delete() } : {}) });
      console.log(`  restore ${op.path} ${JSON.stringify(op.before)}`);
    }
  }
  if (APPLY) { await batch.commit(); console.log('Reverted.'); }
  else console.log('\nDry run — add --apply to revert.');
}

if (REVERT) {
  await revert(REVERT);
} else {
  const ops = await plan();
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${ops.length} change(s):`);
  for (const op of ops) console.log(`  ${op.type.padEnd(6)} ${op.path.padEnd(48)} ${op.why}`);
  if (!ops.length) console.log('  Nothing to do — already migrated.');
  else if (APPLY) await apply(ops);
  else console.log('\nNothing written. Re-run with --apply to make these changes.');
}
