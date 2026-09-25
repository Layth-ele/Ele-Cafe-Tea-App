#!/usr/bin/env node
/**
 * Phase 11 URL fix — migrate non-canonical slugs in /teas.
 *
 * If the database has any tea document whose `slug` field isn't in
 * canonical form (lowercase, alphanumeric + hyphens only, no leading/
 * trailing hyphens), URL handling becomes fragile:
 *
 *   - TeaProfilePage's redirect logic sends users to the canonical
 *     URL, but fetchTea then looks up the canonical form in /teas
 *     and finds nothing — because the DB has the non-canonical
 *     stored value.
 *   - The sitemap generator now canonicalizes at emit time (Phase 11
 *     URL fix), but the doc id and slug field still drift.
 *
 * This script:
 *   1. Reads every doc in /teas
 *   2. For each, computes the canonical form of its slug field
 *   3. Reports the mismatches
 *   4. With --apply, updates the slug field in place (NOT the doc id —
 *      doc id rename requires create-new + delete-old + relocate
 *      reviews subcollection, which is risky enough to keep manual)
 *
 * Usage:
 *   node scripts/migrate-non-canonical-slugs.mjs           # dry-run
 *   node scripts/migrate-non-canonical-slugs.mjs --apply   # write
 *
 * Requires the firebase-admin SDK + GOOGLE_APPLICATION_CREDENTIALS or
 * `firebase login` set up. Refuses to run without credentials.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Canonical slug rule — must match src/lib/slugify.ts exactly.
function toSlug(input) {
  if (!input) return '';
  return input
    .toLowerCase()
    .replace(/['\u2018\u2019\u201B\u2032"\u201C\u201D]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isCanonicalSlug(slug) {
  return Boolean(slug) && toSlug(slug) === slug;
}

const APPLY = process.argv.includes('--apply');

async function main() {
  // Lazy-import firebase-admin so the script can be linted/tested
  // without the dep being a hard requirement.
  let admin;
  try {
    admin = (await import('firebase-admin')).default;
  } catch {
    console.error('firebase-admin is not installed.');
    console.error('Install with:  cd functions && npm install firebase-admin');
    console.error('Then run from repo root:');
    console.error('  node scripts/migrate-non-canonical-slugs.mjs');
    process.exit(2);
  }

  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    } catch (err) {
      console.error('Failed to initialize firebase-admin. Set GOOGLE_APPLICATION_CREDENTIALS or run `gcloud auth application-default login`.');
      console.error(err);
      process.exit(2);
    }
  }

  const db = admin.firestore();
  const teas = await db.collection('teas').get();
  console.log(`Phase 11 URL fix — non-canonical slug migration`);
  console.log('────────────────────────────────────────────────────');
  console.log(`Scanned ${teas.size} /teas documents`);
  console.log('');

  const mismatches = [];
  teas.forEach((d) => {
    const data = d.data();
    const slug = data.slug;
    if (typeof slug !== 'string' || !slug) {
      mismatches.push({ id: d.id, kind: 'missing-slug', current: slug, canonical: toSlug(data.name ?? d.id) });
      return;
    }
    if (!isCanonicalSlug(slug)) {
      mismatches.push({ id: d.id, kind: 'non-canonical', current: slug, canonical: toSlug(slug) });
    }
    // Doc id drift — separate signal from slug drift. We don't auto-fix
    // doc ids here (it'd orphan reviews and order line items pointing
    // at the old id), but it's worth flagging.
    if (!isCanonicalSlug(d.id)) {
      mismatches.push({ id: d.id, kind: 'non-canonical-docid', current: d.id, canonical: toSlug(d.id) });
    }
  });

  if (mismatches.length === 0) {
    console.log('✓ All tea slugs and doc ids are canonical.');
    return;
  }

  console.log(`Found ${mismatches.length} mismatch(es):\n`);
  for (const m of mismatches) {
    console.log(`  [${m.kind}] doc id="${m.id}"  current="${m.current}"  canonical="${m.canonical}"`);
  }
  console.log('');

  if (!APPLY) {
    console.log('Dry-run only. Re-run with --apply to update slug fields.');
    console.log('(Doc id renames are NOT automated; do those manually with a migration that creates the new doc, copies subcollections, and deletes the old.)');
    return;
  }

  // Apply: only update the slug FIELD (not doc id). Each batch caps at
  // 500 writes per Firestore limits; tea catalogs are typically <100
  // so one batch is enough, but loop defensively.
  const fixable = mismatches.filter((m) => m.kind === 'non-canonical' || m.kind === 'missing-slug');
  if (fixable.length === 0) {
    console.log('Nothing to apply — only doc-id drifts found (those need manual migration).');
    return;
  }
  const chunks = [];
  for (let i = 0; i < fixable.length; i += 400) chunks.push(fixable.slice(i, i + 400));
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const m of chunk) {
      batch.update(db.collection('teas').doc(m.id), { slug: m.canonical });
    }
    await batch.commit();
    console.log(`Committed batch of ${chunk.length} slug fixes.`);
  }
  console.log(`\n✓ Fixed ${fixable.length} slug fields.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
