/**
 * seedEverything.tsx
 * Browser-based seed — runs from the Admin Panel (you must be logged in as admin).
 *
 * Seeds on a fresh Firebase project (78 teas):
 *   /teas/{slug}         -> 79 teas from mockProducts
 *   /categories/{id}     -> 8 categories
 *   /counters/customers  -> { count: 0 }
 *   /counters/orders     -> { count: 0 }
 */

import {
  collection,
  doc,
  setDoc,
  writeBatch,
  serverTimestamp,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Modal, ModalBtn } from '@/app/components/modals/Modal';
import { mockProducts, categories } from '@/data/mockProducts';
import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
type SeedResult =
  | { ok: true; teasWritten: number; teasBackfilled: number; teasSkipped: number }
  | { ok: false; error: string };

/**
 * Seed mode determines how the seeder treats existing teas.
 *
 *   'skip'     — write only teas that don't yet exist in Firestore.
 *                Default for fresh-install scenarios.
 *   'overwrite'— destructive. Writes the full seed for every tea,
 *                replacing whatever's there. Loses admin customisations
 *                (image uploads, custom stock, prices, edited text).
 *                Use only on a project with bad data.
 *   'backfill' — for each existing tea, fill in missing fields from
 *                the seed but PRESERVE everything the admin already set.
 *                Use this to add new schema fields (antioxidants,
 *                regions, brewingTemp etc.) to a production catalogue
 *                without losing admin's image uploads or stock numbers.
 */
export type SeedMode = 'skip' | 'overwrite' | 'backfill';

export async function seedEverything({
  overwrite = false,
  mode,
  onProgress,
}: {
  overwrite?: boolean;
  mode?: SeedMode;
  onProgress?: (msg: string) => void;
}): Promise<SeedResult> {
  // Backward-compat: callers using `overwrite: true` map to 'overwrite' mode.
  // New callers should pass `mode` directly.
  const seedMode: SeedMode = mode ?? (overwrite ? 'overwrite' : 'skip');
  const log = (msg: string) => {
    onProgress?.(msg);
    console.log(msg);
  };

  try {
    log('Reading existing teas...');

    // Get existing slugs + data in one query (data needed for backfill mode).
    const existingSnap = await getDocs(collection(db, 'teas'));
    const existingMap = new Map<string, Record<string, unknown>>();
    existingSnap.docs.forEach((d) => existingMap.set(d.id, d.data() as Record<string, unknown>));
    const existingSlugs = new Set(existingMap.keys());
    log(`Found ${existingSlugs.size} existing teas in Firestore (mode: ${seedMode})`);

    let toWrite: typeof mockProducts;
    if (seedMode === 'overwrite') {
      toWrite = mockProducts;
    } else if (seedMode === 'backfill') {
      // Backfill mode targets EXISTING teas — fills in missing fields.
      // Also seed any teas that don't exist yet.
      toWrite = mockProducts;
    } else {
      // 'skip' — only new teas.
      toWrite = mockProducts.filter((p) => !existingSlugs.has(p.slug ?? p.id ?? ''));
    }

    const toSkip = mockProducts.length - toWrite.length;
    log(`Processing ${toWrite.length} teas, skipping ${toSkip}...`);

    // Counters hoisted so they're visible to the return statement.
    let written = 0;
    let backfilled = 0;
    let skippedNothing = 0;

    if (toWrite.length > 0) {
      // Batch write — Firestore limit is 500 ops per batch
      const BATCH_SIZE = 490;
      let batch = writeBatch(db);
      let batchOps = 0;

      // Helper — true when admin hasn't set the field. Empty string and
      // empty array count as "not set" so seed values fill them in.
      const isEmpty = (v: unknown): boolean => {
        if (v === undefined || v === null) return true;
        if (typeof v === 'string' && v.trim() === '') return true;
        if (Array.isArray(v) && v.length === 0) return true;
        return false;
      };

      for (const product of toWrite) {
        const slug = product.slug ?? product.id ?? '';
        if (!slug) continue;

        const ref = doc(db, 'teas', slug);
        const existing = existingMap.get(slug);
        const isNewDoc = !existing;

        // The full schema object — seed defaults for every field.
        // IMPORTANT: every field the admin form / public TeaProfilePage
        // reads must be written here. If you add a field to the schema,
        // add it to mockProducts.ts → tea() defaults, then add it here.
        const fullSeed = {
          // Identity
          id: slug,
          slug,
          // Bilingual name + description
          name: product.name ?? '',
          nameFr: (product as { nameFr?: string }).nameFr ?? null,
          description: product.description ?? '',
          descriptionFr: (product as { descriptionFr?: string }).descriptionFr ?? null,
          // Pricing
          price: product.price ?? 0,
          image: product.image ?? '',
          category: product.category ?? 'black',
          // Turn 6: stock dropped from the schema. Seeded teas have
          // their inventory auto-provisioned by the onTeaCreate
          // trigger (Turn 1) at level=10, which projects available=
          // true via onInventoryWrite. No need to write stock here.
          weight: product.weight ?? '90g',
          // Flags
          featured: product.featured ?? false,
          isActive: product.isActive ?? true,
          isOrganic: product.isOrganic ?? false,
          gstApplicable: product.gstApplicable ?? false,
          allergens: product.allergens ?? [],
          // Tea details
          caffeine: product.caffeine ?? null,
          antioxidants: product.antioxidants ?? null,
          benefits: product.benefits ?? '',
          benefitsFr: (product as { benefitsFr?: string }).benefitsFr ?? null,
          ingredients: product.ingredients ?? '',
          ingredientsFr: (product as { ingredientsFr?: string }).ingredientsFr ?? null,
          origin: product.origin ?? '',
          originFr: (product as { originFr?: string }).originFr ?? null,
          regions: product.regions ?? '',
          regionsFr: (product as { regionsFr?: string }).regionsFr ?? null,
          // Brewing
          brewingTemp: product.brewingTemp ?? '',
          brewingTime: product.brewingTime ?? '',
          // Serving options (Enjoy at Ele Café widget)
          servingSuggestions: product.servingSuggestions ?? [],
          // Reviews aggregate
          avgRating: product.avgRating ?? 0,
          ratingCount: product.ratingCount ?? 0,
        };

        if (seedMode === 'backfill' && !isNewDoc) {
          // Build a sparse update — only fields the admin hasn't set.
          // Skip these fields for backfill: createdAt (preserve original),
          // updatedAt (only bump if we actually fill something),
          // featured/isActive/stock/price (admin business decisions).
          const SKIP_BACKFILL = new Set([
            'id',
            'slug', // never need to backfill identity
            'createdAt', // preserve original creation date
            'featured', // admin business decision
            'price', // admin business decision
            'stock', // live inventory
            'isActive', // admin business decision
            'image', // admin uploaded photo
          ]);

          const updates: Record<string, unknown> = {};
          let touched = false;
          for (const [key, seedValue] of Object.entries(fullSeed)) {
            if (SKIP_BACKFILL.has(key)) continue;
            if (isEmpty(existing[key])) {
              updates[key] = seedValue;
              touched = true;
            }
          }

          if (touched) {
            updates.updatedAt = serverTimestamp();
            batch.set(ref, updates, { merge: true });
            batchOps++;
            backfilled++;
          } else {
            skippedNothing++;
          }
        } else {
          // 'overwrite' mode OR new doc: full write with createdAt.
          batch.set(ref, {
            ...fullSeed,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batchOps++;
          written++;
        }

        if (batchOps >= BATCH_SIZE) {
          await batch.commit();
          log(`  ✓ Committed ${written + backfilled} teas so far...`);
          batch = writeBatch(db);
          batchOps = 0;
        }
      }

      if (batchOps > 0) {
        await batch.commit();
      }
      log(`✅ ${written} new tea(s), ${backfilled} backfilled, ${skippedNothing} already complete`);
    }

    // Seed categories
    log('Seeding categories...');
    const catBatch = writeBatch(db);
    categories.forEach((cat, i) => {
      catBatch.set(doc(db, 'categories', cat.id), {
        id: cat.id,
        name: cat.name,
        nameFr: cat.nameFr ?? '',
        order: i,
        createdAt: serverTimestamp(),
      });
    });
    await catBatch.commit();
    log(`✅ ${categories.length} categories written`);

    // Seed counters — only initialize when missing. The counters are
    // incremented by Cloud Functions on each signup/order, so re-running
    // the seed after launch must NOT reset them to 0. getDoc-then-setDoc
    // is idempotent and saves a write when the doc already exists.
    log('Seeding counters...');
    for (const id of ['customers', 'orders'] as const) {
      const ref = doc(db, 'counters', id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { count: 0 });
      }
    }
    log('✅ Counters ready');

    log('✅ Seed complete!');
    // teasSkipped here means "teas that the seed didn't change" —
    // both teas we never tried to process AND teas that were already
    // complete (in backfill mode). The dialog can display this as a
    // single number.
    return {
      ok: true,
      teasWritten: written,
      teasBackfilled: backfilled,
      teasSkipped: toSkip + skippedNothing,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('seedEverything failed:', err);
    return { ok: false, error: msg };
  }
}

// ── SeedButton UI component ────────────────────────────────────────────────────
export function SeedButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<SeedMode>('backfill');
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<SeedResult | null>(null);

  const addLog = (msg: string) => setLog((prev) => [...prev, msg]);

  const run = async () => {
    setBusy(true);
    setLog([]);
    setResult(null);
    const res = await seedEverything({ mode, onProgress: addLog });
    setResult(res);
    setBusy(false);
  };

  const handleOpen = () => {
    setLog([]);
    setResult(null);
    setOpen(true);
  };

  // Mode metadata for the radio cards
  const MODES: { value: SeedMode; title: string; desc: string; tone: string }[] = [
    {
      value: 'backfill',
      title: 'Backfill missing fields',
      desc: 'Fill in benefits, caffeine, origin, regions, antioxidants, brewing temps, etc. on existing teas. Preserves admin-uploaded images, stock counts, prices, and any text already filled in.',
      tone: 'var(--success)',
    },
    {
      value: 'skip',
      title: 'Skip existing teas',
      desc: "Only write teas that don't yet exist. Doesn't touch any existing tea — useful right after a fresh deploy.",
      tone: 'var(--steel)',
    },
    {
      value: 'overwrite',
      title: 'Overwrite all teas (destructive)',
      desc: 'Replace every tea with seed values. WIPES admin-uploaded images, custom prices, stock counts, and any edited text. Use only on a project with bad data you want to reset.',
      tone: 'var(--danger)',
    },
  ];

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen}>
        Seed Database
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Seed Firestore Database"
        size="md"
        footer={
          <>
            <ModalBtn variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </ModalBtn>
            <ModalBtn onClick={run} loading={busy} disabled={!!result}>
              Run Seed
            </ModalBtn>
          </>
        }
      >
        <div className="se-body">
          <p className="se-lead">
            Writes the starter teas, categories and counters from <code>mockProducts.ts</code>.
            Choose a mode based on what you want to do.
          </p>

          <div className="se-modes">
            {MODES.map((m) => {
              const selected = mode === m.value;
              return (
                <label
                  key={m.value}
                  className="se-mode"
                  data-selected={selected ? 'true' : 'false'}
                  data-busy={busy ? 'true' : 'false'}
                  // eslint-disable-next-line react/forbid-dom-props -- per-mode tone (success/warning/danger) drives the selected border colour at runtime
                  style={{ ['--se-tone' as string]: m.tone }}
                >
                  <input
                    type="radio"
                    name="seed-mode"
                    checked={selected}
                    onChange={() => setMode(m.value)}
                    disabled={busy}
                    className="se-radio"
                    // eslint-disable-next-line react/forbid-dom-props -- accent-color is per-mode and matches the tone the parent uses for its selected border
                    style={{ accentColor: m.tone }}
                  />
                  <div className="se-mode-info">
                    <div className="se-mode-title">{m.title}</div>
                    <div className="se-mode-desc">{m.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>

          {log.length > 0 && (
            <div className="rounded-lg p-3 text-xs font-mono space-y-0.5 max-h-56 overflow-y-auto se-log">
              {log.map((line, i) => (
                <div
                  key={i}
                  className="se-log-row"
                  data-tone={
                    line.startsWith('✅') || line.startsWith('  ✓') ? 'success' : 'default'
                  }
                >
                  {line}
                </div>
              ))}
            </div>
          )}

          {result && (
            <div
              className="rounded-lg px-4 py-3 text-sm se-result"
              data-ok={result.ok ? 'true' : 'false'}
            >
              {result.ok === true ? (
                <>
                  ✅ {result.teasWritten} new
                  {result.teasBackfilled > 0 && <> · {result.teasBackfilled} backfilled</>}
                  {result.teasSkipped > 0 && <> · {result.teasSkipped} unchanged</>}
                </>
              ) : (
                <>❌ {(result as { ok: false; error: string }).error}</>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
