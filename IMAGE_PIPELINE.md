# Image pipeline — operational setup

This site uses a runtime image pipeline rather than a build-time one.
Tea images are uploaded by admins to Firebase Storage; build-time tools
(Sharp, vite-imagetools) can't reach those because they don't exist
yet when `npm run build` runs. The pipeline below generates responsive
variants automatically as a side effect of upload.

## What the client expects

`<TeaImage>` (and `<LazyImage>` underneath it) renders a `<picture>`
with three image sources:

| Order | Format   | Widths           | Use                                             |
|-------|----------|------------------|-------------------------------------------------|
| 1st   | AVIF     | 640              | Best compression, modern browsers prefer it    |
| 2nd   | WebP     | 320, 640, 1280   | Universal support, full responsive set         |
| 3rd   | Original | 320, 640, 1280   | Last-resort fallback, original format          |

The fallback `<img src>` is the original full-resolution upload — it
always works, even if no variants exist.

URLs follow this naming convention (matches the Firebase
`storage-resize-images` extension):

```
Original:  teas/1714000000_assam.jpg
Variants:  teas/1714000000_assam_320x320.webp
           teas/1714000000_assam_640x640.webp
           teas/1714000000_assam_1280x1280.webp
           teas/1714000000_assam_640x640.avif
```

The Firebase download URL is path-encoded; the variant URL is built by
`src/lib/imageVariants.ts:buildFirebaseVariantUrl` which inserts the
`_WxH` suffix and swaps the extension while keeping the `?alt=media&token=…`
query intact.

## One-time Firebase setup

### 1. Install the Resize Images extension

In the Firebase Console:

1. **Extensions** → **Browse the Hub** → search "Resize Images" → choose
   "Resize Images" by Firebase.
2. Click **Install in console**.
3. Configuration:

   | Field                          | Value                          |
   |--------------------------------|--------------------------------|
   | Cloud Storage bucket           | (your default bucket)          |
   | Sizes of resized images        | `320x320,640x640,1280x1280`    |
   | Deletion of original file      | `No` (we serve the original as `<img src>` fallback)|
   | Cloud Storage path for resized | (leave blank — same folder as original)|
   | Make resized images public     | `Yes`                          |
   | Backfill existing images       | `No` first time, `Yes` on a maintenance window|
   | Convert image format           | `webp,avif`                    |
   | Output options for `webp`      | `quality=80`                   |
   | Output options for `avif`      | `quality=60`                   |
   | Sharp animation key            | (leave default)                |
   | Cache-Control header           | `public, max-age=31536000, immutable` |

4. Click **Install extension**. First install takes ~3 min to provision
   the underlying Cloud Function.

### 2. Test it

Upload a tea image through `/admin/products` → "Add tea" → upload an
image. Wait ~5 seconds. In Firebase Console → Storage → `teas/` you
should now see the original plus four siblings:

```
1714000000_assam.jpg
1714000000_assam_320x320.webp
1714000000_assam_640x640.webp
1714000000_assam_1280x1280.webp
1714000000_assam_640x640.avif
```

### 3. Set `variantsAvailable: true` on new uploads

Admin upload code in `AdminProducts.tsx` should set
`variantsAvailable: true` on the product document AFTER the
extension finishes generating variants. The simplest pattern is to
write the field on the same `setDoc` that records the image URL —
the extension typically finishes within 5 seconds, well before the
admin clicks "Save", and the eventually-consistent fallback (`<img
src>` on the original) covers the gap.

If you backfill existing images in step 1 (set "Backfill existing
images" to `Yes`), run a one-shot script to flip
`variantsAvailable: true` on every product with a non-empty
`image` field:

```ts
// scripts/backfillVariants.ts — run once after backfill completes
import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../src/lib/firebase';

const snap = await getDocs(collection(db, 'teas'));
const batch = writeBatch(db);
snap.docs.forEach(d => {
  if (d.data().image) batch.update(d.ref, { variantsAvailable: true });
});
await batch.commit();
```

## Blurhash placeholders (optional, ~+2 score)

Blurhash is a separate concern from variants — both work standalone.
When a product record has a `blurhash` field, `<LazyImage>` decodes
it to a tiny canvas and shows it as the placeholder until the real
image loads, instead of the generic skeleton pulse. Visually feels
~200ms faster.

### Generating blurhash on upload

In `AdminProducts.tsx`, after the image upload completes but before
the `setDoc`, compute a hash from the uploaded file:

```ts
import { encode } from 'blurhash';

async function makeBlurhash(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    // Sample at a small canvas — blurhash works on aggressive
    // downsamples and 32×32 is plenty for the encode.
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 32, 32);
    const { data } = ctx.getImageData(0, 0, 32, 32);
    return encode(data, 32, 32, 4, 4);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// then on save:
const blurhash = await makeBlurhash(file);
await setDoc(doc(db, 'teas', productId), { ...rest, image: url, blurhash });
```

The `blurhash` package is already a runtime dependency (used by
the decoder in `LazyImage`). The encoder is the same package; no
additional install.

## Failure modes and recovery

| Symptom                                              | Cause                                              | Fix                                                          |
|------------------------------------------------------|----------------------------------------------------|--------------------------------------------------------------|
| Image renders but variants 404 in Network tab        | Resize Images extension not installed             | Install per "One-time Firebase setup" above                  |
| Variants 404 only on recent uploads                  | Extension lag (typical) or quota exhausted        | Wait 30s and reload; check Cloud Functions logs              |
| Image renders at full original resolution on phones  | `variantsAvailable` not set on the product        | Run the backfill script above                                |
| Blurhash decode prints a console warning             | Malformed hash (manual edit?)                     | Re-upload the image; encoder always produces valid output    |
| Original image is 4 MB and customers complain        | Upload path doesn't enforce a max input size      | Add a client-side `file.size` guard in the admin upload UI   |

## Verification

After setup, on a tea profile page (e.g. `/tea-profile/black/assam`),
DevTools → Network → filter by "Img":

- One request to `*_640x640.avif` for modern browsers, OR
- Three requests to `*_{320,640,1280}x*.webp` with the browser
  picking one based on viewport (visible by hovering the row → "Size"
  column matches the breakpoint)
- No request to the original full-resolution URL (it's `<img src>` but
  the browser skips it when a `<source>` matches)
