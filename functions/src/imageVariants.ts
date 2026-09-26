/**
 * imageVariants.ts — small WebP copies of admin-uploaded photos.
 *
 * Tea and pairing photos are uploaded as full-size PNG/JPG (often
 * 1.5–2 MB each). For every photo we make WebP copies at 320 / 640 /
 * 1280 px wide and record their download URLs on the doc:
 *
 *   imageVariants: { src: <the original URL>, set: [{ w, url }, …] }
 *
 * The site's LazyImage uses them as a WebP srcset, so a phone downloads
 * a ~30 KB image instead of 1.8 MB. `src` ties the copies to the photo
 * they were made from; when the admin swaps the photo they're remade.
 *
 * Runs on every tea / pairing write, plus a sweep every 30 minutes that
 * catches anything missing (including photos uploaded before this existed).
 */
import * as functions from 'firebase-functions/v2';
import * as admin from './lib/admin';
import * as crypto from 'node:crypto';
import sharp from 'sharp';

const REGION = 'us-central1';
const WIDTHS = [320, 640, 1280] as const;
const OPTS = { region: REGION, memory: '1GiB' as const, timeoutSeconds: 300, maxInstances: 3 };

export interface ImageVariants {
  src: string;
  set: Array<{ w: number; url: string }>;
}

const db = () => admin.firestore();

/** { bucket, path } from a Firebase Storage download URL, else null. */
export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== 'firebasestorage.googleapis.com') return null;
    const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!m) return null;
    return { bucket: m[1], path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

function downloadUrl(bucket: string, path: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/** Make (or reuse) the WebP copies of one photo. */
export async function ensureVariants(src: string): Promise<ImageVariants | null> {
  const loc = parseStorageUrl(src);
  if (!loc || !/\.(png|jpe?g|webp|avif)$/i.test(loc.path)) return null;
  const bucket = admin.storage().bucket(loc.bucket);
  const stem = `variants/${loc.path.replace(/\.[^.]+$/, '')}`;

  let original: Buffer | null = null;
  let meta: sharp.Metadata | null = null;
  const set: ImageVariants['set'] = [];

  for (const w of WIDTHS) {
    const file = bucket.file(`${stem}_${w}.webp`);
    const [exists] = await file.exists();
    if (exists) {
      const [m] = await file.getMetadata();
      const token = String(m.metadata?.firebaseStorageDownloadTokens ?? '').split(',')[0];
      const width = Number(m.metadata?.width) || w;
      if (token) {
        set.push({ w: width, url: downloadUrl(loc.bucket, file.name, token) });
        continue;
      }
    }
    if (!original) {
      [original] = await bucket.file(loc.path).download();
      meta = await sharp(original).metadata();
    }
    // Never upscale: a 1254 px original gets a full-size 1254 px copy in
    // place of 1280, and nothing larger.
    const target = Math.min(w, meta?.width ?? w);
    if (set.some((x) => x.w >= target)) break;
    const out = await sharp(original)
      .rotate()
      .resize({ width: target, withoutEnlargement: true })
      .webp({ quality: 78, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    const token = crypto.randomUUID();
    await file.save(out.data, {
      resumable: false,
      contentType: 'image/webp',
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: {
          firebaseStorageDownloadTokens: token,
          width: String(out.info.width),
          source: loc.path,
        },
      },
    });
    set.push({ w: out.info.width, url: downloadUrl(loc.bucket, file.name, token) });
  }
  return set.length ? { src, set } : null;
}

const needsVariants = (image: unknown, current: unknown): image is string =>
  typeof image === 'string' &&
  !!parseStorageUrl(image) &&
  (current as ImageVariants | undefined)?.src !== image;

async function processDoc(ref: FirebaseFirestore.DocumentReference, image: string): Promise<void> {
  try {
    const v = await ensureVariants(image);
    if (!v) return;
    // Only write if the photo hasn't changed while we worked.
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const field = ref.parent.id === 'teas' ? 'image' : 'imageUrl';
      if (snap.get(field) === image) tx.update(ref, { imageVariants: v });
    });
    console.log(`[imageVariants] ${ref.path}: ${v.set.map((s) => s.w).join('/')} px`);
  } catch (err) {
    console.warn(`[imageVariants] ${ref.path} failed:`, err instanceof Error ? err.message : err);
  }
}

export const teaImageVariants = functions.firestore.onDocumentWritten(
  { ...OPTS, document: 'teas/{id}' },
  async (event) => {
    const snap = event.data?.after;
    const d = snap?.data();
    if (!snap?.exists || !d || !needsVariants(d.image, d.imageVariants)) return;
    await processDoc(snap.ref, d.image);
  },
);

export const pairingImageVariants = functions.firestore.onDocumentWritten(
  { ...OPTS, document: 'comboGalleryItems/{id}' },
  async (event) => {
    const snap = event.data?.after;
    const d = snap?.data();
    if (!snap?.exists || !d || !needsVariants(d.imageUrl, d.imageVariants)) return;
    await processDoc(snap.ref, d.imageUrl);
  },
);

/** Catch-up: photos uploaded before this existed, or a failed run. */
export const imageVariantsSweep = functions.scheduler.onSchedule(
  { ...OPTS, schedule: 'every 30 minutes', timeoutSeconds: 540 },
  async () => {
    const started = Date.now();
    for (const [coll, field] of [
      ['teas', 'image'],
      ['comboGalleryItems', 'imageUrl'],
    ] as const) {
      const snap = await db().collection(coll).get();
      for (const doc of snap.docs) {
        if (Date.now() - started > 480_000) return; // leave the rest for the next run
        const d = doc.data();
        if (needsVariants(d[field], d.imageVariants)) await processDoc(doc.ref, d[field]);
      }
    }
  },
);
