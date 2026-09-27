import { useEffect, useRef, useState, useMemo, cloneElement, isValidElement } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactElement } from 'react';
import {
  ImageIcon,
  ImageOff,
  Languages,
  Loader2,
  Pencil,
  Plus,
  Power,
  Trash2,
  Upload,
} from 'lucide-react';
import { SearchBar } from '@/app/components/ui/SearchBar';
import { toSlug as slugifyShared } from '@/lib/slugify';

import {
  collection,
  onSnapshot,
  query,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { db, getStorageLazy } from '@/lib/firebase';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Modal, ModalBtn, ConfirmModal } from '@/app/components/modals/Modal';
import { useCategoriesRealtime } from '@/hooks/useCategoriesRealtime';
import type { Product } from '@/types';
import { toast } from 'sonner';
import { translateMultipleToFrench } from '@/lib/translation';
import { SeoHead } from '@/app/components/SeoHead';
import { LazyImage } from '@/app/components/LazyImage';
import {
  validateCreateProduct,
  validateUpdateProduct,
  productFormSchema,
  type ProductFormInput,
} from '@/schemas/product.schema';
import { getAvailabilityLabel, getAvailabilityStatus } from '@/lib/availability';

import { AdminPageHeader } from '@/app/components/admin/AdminPageHeader';
import { ApprovedDescriptionsBanner } from '@/app/components/admin/ApprovedDescriptionsBanner';
function toSlug(n: string) {
  // Phase 11 URL fix — was an inline duplicate of src/lib/slugify.ts.
  // Now delegates so write-side (admin slug generation) and read-side
  // (URL canonicalization in TeaProfilePage) can't drift. Kept as a
  // thin wrapper so existing call sites in this file don't need
  // import changes.
  return slugifyShared(n);
}

type ProductFormState = {
  name: string;
  nameFr: string;
  description: string;
  descriptionFr: string;
  // category is required in the form (admin must pick one), so this
  // is `string` not `Product['category']` which is optional in the
  // canonical schema. Keeping the form's shape strict prevents the
  // RHF resolver from getting a `string | undefined` it can't reconcile.
  price: string;
  category: string;
  image: string;
  featured: boolean;
  isOrganic: boolean;
  allergens: string;
  caffeine: string;
  brewingTemp: string;
  brewingTime: string;
  weight: string;
  gstApplicable: boolean;
  servingSuggestions: { label: string; enabled: boolean }[];
  // Tea profile detail fields — surfaced on the public TeaProfilePage
  // "Tea Details" card. Schema for these existed but the admin form
  // was missing them, so admin couldn't update what customers saw.
  benefits: string; // free-text, multi-line
  benefitsFr: string; // French mirror of benefits
  ingredients: string; // free-text (used by ingredient filter via includes())
  ingredientsFr: string; // French mirror of ingredients
  antioxidants: string; // enum select: None / Low / Medium / High / Very High
  origin: string; // primary country, e.g. "China"
  originFr: string; // French mirror of origin
  regions: string; // specific area, e.g. "Fujian Province"
  regionsFr: string; // French mirror of regions
  // Phase 2 image-pipeline fields. Both written by ImageUploader's
  // onBlurhash / onVariantsReady callbacks. Optional in the schema —
  // legacy products without them still render fine via the original
  // src + skeleton fallback.
  blurhash: string; // ~30-char placeholder hash
  variantsAvailable: boolean; // resized variants exist alongside the original
};

const EMPTY: ProductFormState = {
  name: '',
  nameFr: '',
  description: '',
  descriptionFr: '',
  price: '18',
  category: 'black',
  image: '',
  featured: false,
  isOrganic: false,
  allergens: '',
  caffeine: '',
  brewingTemp: '',
  brewingTime: '',
  weight: '90',
  gstApplicable: false,
  servingSuggestions: [],
  benefits: '',
  benefitsFr: '',
  ingredients: '',
  ingredientsFr: '',
  antioxidants: '',
  origin: '',
  originFr: '',
  regions: '',
  regionsFr: '',
  blurhash: '',
  variantsAvailable: false,
};

// ── Image uploader ────────────────────────────────────────────────────────────
//
// Phase 2 operational wiring (perf roadmap):
//   On every upload the uploader now also computes a blurhash placeholder
//   from the file BEFORE handing the storage URL back. The hash is a ~30-
//   character string the LazyImage component decodes to a tiny preview
//   while the real image loads.
//
//   The uploader also reports `variantsAvailable: true` once Firebase's
//   Resize Images extension has had time to generate variants. We assume
//   the extension is configured (see IMAGE_PIPELINE.md) — when it isn't,
//   the variants 404 and <picture> falls back through to the original
//   src, so the worst case is "no responsive selection," not a broken
//   image. Setting variantsAvailable=true unconditionally on save trades
//   a 5-second window of potentially-slow image picking for the simpler
//   contract.
//
//   Callbacks:
//     onChange(url)       — the storage URL, like before. Always fires.
//     onBlurhash?(hash)   — optional, fires once the hash encodes
//                           successfully. Failure is silent (we keep
//                           shipping the image without a placeholder).
//     onVariantsReady?()  — optional, fires after onChange. Caller
//                           should set product.variantsAvailable = true.
function ImageUploader({
  value,
  onChange,
  onBlurhash,
}: {
  value: string;
  onChange: (url: string) => void;
  onBlurhash?: (hash: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);

  // Encode a blurhash from the raw file BEFORE upload starts, in
  // parallel with the storage write. Failures (decoding, canvas
  // unavailable, malformed image) just mean we ship without a
  // placeholder — not blocking. Lazy-imported so the encoder bundle
  // (~3 KB gz) only loads on admin upload, never for customers.
  const computeBlurhash = async (file: File): Promise<string | null> => {
    try {
      const { encode } = await import('blurhash');
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        // 32×32 sample is plenty — the encoder runs at the sample
        // resolution, not the full file. Larger samples just burn
        // CPU for no perceptible quality gain.
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, 32, 32);
        const { data } = ctx.getImageData(0, 0, 32, 32);
        // 4×4 = 16 components per channel, the recommended balance
        // between fidelity and string length (~27 chars output).
        return encode(data, 32, 32, 4, 4);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      // Logged but non-fatal — image still uploads, just without
      // a fancy placeholder. Common causes: HEIC files some browsers
      // can't decode in <img>, animated WebP frames, etc.
      console.warn('[ImageUploader] blurhash encode failed:', err);
      return null;
    }
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Image files only');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Max 5 MB');
      return;
    }
    setBusy(true);

    // Kick off both work streams in parallel:
    //   (1) Storage upload — primary, gates onChange()
    //   (2) Blurhash encode — secondary, fires onBlurhash() when ready
    const blurhashPromise = onBlurhash ? computeBlurhash(file) : Promise.resolve(null);

    // Lazy-load Storage on first upload — keeps firebase/storage out
    // of the public bundle. Resolves instantly on subsequent uploads.
    const sm = await getStorageLazy();
    // Sanitize filename: collapse whitespace, strip path separators
    // and non-ascii so download URLs are predictable and the storage
    // console stays browseable. Defense-in-depth — storage rules
    // already restrict /teas/ to images via content-type check, but
    // we don't want admin-uploaded files like "passport scan (1).jpg"
    // producing URL-encoded mess in the download URL.
    const safeName =
      file.name
        .replace(/[\s/\\]+/g, '_') // spaces and path separators -> underscore
        .replace(/[^a-zA-Z0-9._-]/g, '') // strip everything else
        .replace(/_+/g, '_') // collapse multiple underscores
        .slice(0, 80) || 'upload'; // cap length, fallback if everything was stripped
    const task = sm.uploadBytesResumable(
      sm.ref(sm.storage, `teas/${Date.now()}_${safeName}`),
      file,
    );
    task.on(
      'state_changed',
      (s) => setPct(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      () => {
        toast.error('Upload failed');
        setBusy(false);
      },
      async () => {
        const url = await sm.getDownloadURL(task.snapshot.ref);
        onChange(url);
        // Fire blurhash callback after the URL is set so the parent's
        // setForm sees a consistent transition: image goes from empty →
        // (url, hash) in two micro-batches rather than (hash) → (url).
        const hash = await blurhashPromise;
        if (hash && onBlurhash) onBlurhash(hash);
        setBusy(false);
        setPct(0);
        toast.success('Image uploaded!');
      },
    );
  };

  return (
    <div className="space-y-2">
      <span className="field-label ap-iu-label">Product Image</span>
      {value && (
        <LazyImage
          src={value}
          alt="Preview"
          aspectRatio="1/1"
          borderRadius="0.5rem"
          className="ap-iu-preview"
        />
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {pct}%
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" /> Upload Image
          </>
        )}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <div className="flex items-center gap-2">
        <ImageIcon size={16} className="ap-iu-icon" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or paste image URL…"
          className="text-xs"
        />
      </div>
    </div>
  );
}

// ── Form helper components — at MODULE scope ───────────────────────────────
//
// CRITICAL: these MUST live at module scope, NOT inside AdminProducts.
// Defining components inside another component's body re-creates them
// on every render, which makes React see "different" components and
// unmount/remount the entire subtree on every keystroke. The visible
// symptom is "input only accepts one letter at a time" — typing
// triggers setForm → parent re-renders → these components are new
// references → focused input remounts → loses focus → next keystroke
// hits a different element. Selects lose their state for the same
// reason. Hoisting to module scope makes them stable identities so
// React can preserve the input/select instances across renders.

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ap-form-section">
      <div className="ap-form-section-head">
        <span className="ap-form-section-label">{label}</span>
      </div>
      <div className="ap-form-section-body">{children}</div>
    </div>
  );
}

function ProductFormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  // Phase 6: renamed local `FormField` → `ProductFormField` to avoid
  // shadowing the new compound `<Field>` primitive when we (eventually)
  // migrate this file's per-input wiring to the shared component.
  // Injects htmlFor + child id via cloneElement so the label-input
  // association works for screen readers without every callsite
  // having to spell out an id (same pattern as AdminSettingsField).
  const id = useMemo(
    () =>
      'pf-' +
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    [label],
  );
  const wired = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string }>, { id })
    : children;
  return (
    <div className="ap-prod-field">
      <span className="ap-prod-field-label">{label}</span>
      {wired}
      {hint && <span className="ap-prod-field-hint">{hint}</span>}
    </div>
  );
}

// ── ProductForm — at MODULE scope, prop-driven ─────────────────────────────
//
// Owns no state itself; receives form + setters from the parent. This is
// the standard React pattern for forms that appear inside multiple
// containers (here: Add modal + Edit modal). Parent owns truth, child
// renders fields.
//
// The translate buttons (one inline in Basic Info, one at the bottom)
// trigger different translation scopes — the inline one only translates
// name + description (kept for backward compat with the previous
// behavior); the bottom one is the new "translate everything" action
// that covers all five French-translatable string fields at once.

interface ProductFormProps {
  form: ProductFormState;
  setForm: React.Dispatch<React.SetStateAction<ProductFormState>>;
  handleTranslate: () => void; // legacy: translates name + description only
  handleTranslateAll: () => void; // new: translates ALL fr-able fields
  translating: boolean;
}

function ProductForm({
  form,
  setForm,
  handleTranslate,
  handleTranslateAll,
  translating,
}: ProductFormProps) {
  const categories = useCategoriesRealtime();
  return (
    <div className="ap-form-root">
      {/* ── Basic info ─────────────────────────────────────────── */}
      <FormSection label="Basic Info">
        <div className="ap-grid-2">
          <ProductFormField label="Name *">
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Royal Green"
            />
          </ProductFormField>
          <ProductFormField label="Name (French)">
            <Input
              value={form.nameFr}
              onChange={(e) => setForm((f) => ({ ...f, nameFr: e.target.value }))}
              placeholder="Nom du thé"
            />
          </ProductFormField>
        </div>
        <ProductFormField label="Description">
          <textarea
            className="field"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder="Describe this tea…"
          />
        </ProductFormField>
        <ProductFormField label="Description (French)">
          <textarea
            className="field"
            value={form.descriptionFr}
            onChange={(e) => setForm((f) => ({ ...f, descriptionFr: e.target.value }))}
            rows={2}
            placeholder="Description en français"
          />
        </ProductFormField>
        {/* Inline translate — quick action right next to the basic
            text fields. Only translates name + description for speed.
            For a "translate everything" action see the gold button at
            the very bottom of the form. */}
        <div className="ap-translate-banner">
          <div className="ap-translate-info">
            <Languages className="h-4 w-4 ap-translate-icon" />
            <span className="ap-translate-text">Translate name &amp; description only</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleTranslate} disabled={translating}>
            {translating ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />…
              </>
            ) : (
              'Translate'
            )}
          </Button>
        </div>
      </FormSection>

      {/* ── Pricing ──────────────────────────────────────────────
           Turn 6: removed the "Stock" form field. Inventory levels
           are now managed on /admin/inventory (the per-tea sliders
           in the inventory table). Keeping a separate stock count
           here created drift between two sources of truth. */}
      <FormSection label="Pricing">
        <div className="ap-grid-3">
          <ProductFormField label="Price (CAD) *">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              placeholder="18.00"
            />
          </ProductFormField>
          <ProductFormField label="Weight (g) *">
            <Input
              type="number"
              min="1"
              step="1"
              value={form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
              placeholder="90"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used for "price per weight" on the tea card. Defaults to 90g if left blank.
            </p>
          </ProductFormField>
        </div>
        <ProductFormField label="Category *">
          <Select
            value={form.category}
            onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ProductFormField>
      </FormSection>

      {/* ── Tea details ────────────────────────────────────────── */}
      <FormSection label="Tea Details">
        <div className="ap-grid-3">
          <ProductFormField label="Caffeine">
            {/* `form.caffeine || undefined` — Radix Select 2.x doesn't
                reliably render the <SelectValue placeholder> when the
                Root receives `value=""`. Coercing the empty-string
                default to `undefined` puts the Select in its proper
                "no value selected" state and the placeholder shows.
                The onValueChange path always receives a non-empty
                string (Radix forbids empty-string SelectItem values),
                so the round-trip stays consistent. */}
            <Select
              value={form.caffeine || undefined}
              onValueChange={(v) => setForm((f) => ({ ...f, caffeine: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {['None', 'Low', 'Medium', 'High'].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ProductFormField>
          <ProductFormField label="Brewing Temp">
            <Input
              value={form.brewingTemp}
              onChange={(e) => setForm((f) => ({ ...f, brewingTemp: e.target.value }))}
              placeholder="85–90°C"
            />
          </ProductFormField>
          <ProductFormField label="Brew Time">
            <Input
              value={form.brewingTime}
              onChange={(e) => setForm((f) => ({ ...f, brewingTime: e.target.value }))}
              placeholder="3–5 min"
            />
          </ProductFormField>
        </div>
        <ProductFormField label="Allergens" hint="Comma-separated, e.g. almond, coconut">
          <Input
            value={form.allergens}
            onChange={(e) => setForm((f) => ({ ...f, allergens: e.target.value }))}
            placeholder="almond, coconut, dairy"
          />
        </ProductFormField>

        {/* Antioxidants — single-locale (enum value, no translation needed) */}
        <ProductFormField label="Antioxidants">
          {/* See caffeine note above for the `|| undefined` coercion. */}
          <Select
            value={form.antioxidants || undefined}
            onValueChange={(v) => setForm((f) => ({ ...f, antioxidants: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            {/* "Very High" kept as legacy option so existing Firestore
                docs with that value continue to display correctly.
                "Ultra High" is the preferred new option going forward. */}
            <SelectContent>
              {['None', 'Low', 'Medium', 'High', 'Very High', 'Ultra High'].map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ProductFormField>

        {/* ── Origin (EN / FR pair) ──────────────────────────────────── */}
        <div className="ap-grid-2">
          <ProductFormField label="Origin (country)" hint='e.g. "China", "Japan"'>
            <Input
              value={form.origin}
              onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))}
              placeholder="China"
            />
          </ProductFormField>
          <ProductFormField label="Origin (French)" hint="Shown when language is FR">
            <Input
              value={form.originFr}
              onChange={(e) => setForm((f) => ({ ...f, originFr: e.target.value }))}
              placeholder="Chine"
            />
          </ProductFormField>
        </div>

        {/* ── Regions (EN / FR pair) ─────────────────────────────────── */}
        <div className="ap-grid-2">
          <ProductFormField label="Regions" hint='e.g. "Fujian Province"'>
            <Input
              value={form.regions}
              onChange={(e) => setForm((f) => ({ ...f, regions: e.target.value }))}
              placeholder="Fujian Province"
            />
          </ProductFormField>
          <ProductFormField label="Regions (French)" hint="Shown when language is FR">
            <Input
              value={form.regionsFr}
              onChange={(e) => setForm((f) => ({ ...f, regionsFr: e.target.value }))}
              placeholder="Province du Fujian"
            />
          </ProductFormField>
        </div>

        {/* ── Benefits (EN / FR pair) ────────────────────────────────── */}
        <div className="ap-grid-2">
          <ProductFormField
            label="Benefits"
            hint="Used by the Functionality filter — include keywords like 'antioxidant', 'energising', 'relaxing'."
          >
            <textarea
              className="field"
              rows={3}
              value={form.benefits}
              onChange={(e) => setForm((f) => ({ ...f, benefits: e.target.value }))}
              placeholder="Rich in antioxidants, supports skin health, boosts metabolism…"
            />
          </ProductFormField>
          <ProductFormField label="Benefits (French)" hint="Shown when language is FR">
            <textarea
              className="field"
              rows={3}
              value={form.benefitsFr}
              onChange={(e) => setForm((f) => ({ ...f, benefitsFr: e.target.value }))}
              placeholder="Riche en antioxydants, soutient la peau, stimule le métabolisme…"
            />
          </ProductFormField>
        </div>

        {/* ── Ingredients (EN / FR pair) ─────────────────────────────── */}
        <div className="ap-grid-2">
          <ProductFormField
            label="Ingredients"
            hint="Comma-separated. Used by the Ingredients filter — include common words like 'mint', 'ginger', 'rose'."
          >
            <Input
              value={form.ingredients}
              onChange={(e) => setForm((f) => ({ ...f, ingredients: e.target.value }))}
              placeholder="White tea leaves, mint, jasmine"
            />
          </ProductFormField>
          <ProductFormField label="Ingredients (French)" hint="Shown when language is FR">
            <Input
              value={form.ingredientsFr}
              onChange={(e) => setForm((f) => ({ ...f, ingredientsFr: e.target.value }))}
              placeholder="Feuilles de thé blanc, menthe, jasmin"
            />
          </ProductFormField>
        </div>
      </FormSection>

      {/* ── Flags ──────────────────────────────────────────────── */}
      <FormSection label="Flags">
        <div className="ap-flags-row">
          {(
            [
              { key: 'featured', label: 'Featured', icon: '⭐' },
              { key: 'isOrganic', label: 'Organic', icon: '🌿' },
              { key: 'gstApplicable', label: 'GST Applicable', icon: '🏷️' },
            ] as const
          ).map(({ key, label, icon }) => {
            const checked = form[key];
            return (
              <label key={key} className="ap-flag-pill" data-checked={checked ? 'true' : 'false'}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                  className="ap-flag-cb"
                />
                <span>{icon}</span> {label}
              </label>
            );
          })}
        </div>
        {form.gstApplicable && (
          <p className="ap-gst-warn">
            ⚠ GST (5%) will be charged. Only enable for non-food items — tea is zero-rated in
            Canada.
          </p>
        )}
      </FormSection>

      {/* ── Serving suggestions (Enjoy at Ele Café) ── */}
      <div>
        <div className="ap-serv-head">
          <span className="field-label ap-serv-label">Enjoy at Ele Café — Serving Options</span>
          <button
            type="button"
            onClick={() => {
              const label = prompt('New serving option (e.g. Iced Tea):');
              if (label?.trim()) {
                setForm((f) => ({
                  ...f,
                  servingSuggestions: [
                    ...f.servingSuggestions,
                    { label: label.trim(), enabled: true },
                  ],
                }));
              }
            }}
            className="btn btn-outline ap-serv-add"
          >
            + Add Option
          </button>
        </div>
        <p className="ap-serv-hint">
          Toggle each option on/off to control what appears on the tea profile page. Drag to reorder
          (coming soon).
        </p>
        {form.servingSuggestions.length === 0 ? (
          <p className="ap-serv-empty">No serving options yet. Click "+ Add Option" to add one.</p>
        ) : (
          <div className="ap-serv-list">
            {form.servingSuggestions.map((s, i) => (
              <div key={i} className="ap-serv-row" data-on={s.enabled ? 'true' : 'false'}>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      servingSuggestions: f.servingSuggestions.map((x, j) =>
                        j === i ? { ...x, enabled: !x.enabled } : x,
                      ),
                    }))
                  }
                  className="ap-serv-toggle"
                  data-on={s.enabled ? 'true' : 'false'}
                  aria-label={s.enabled ? 'Disable' : 'Enable'}
                >
                  <span className="ap-serv-thumb" />
                </button>
                <span className="ap-serv-row-label">{s.label}</span>
                <span className="ap-serv-row-status" data-on={s.enabled ? 'true' : 'false'}>
                  {s.enabled ? 'Visible' : 'Hidden'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      servingSuggestions: f.servingSuggestions.filter((_, j) => j !== i),
                    }))
                  }
                  className="ap-serv-remove"
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Phase 2 op wiring: also collect blurhash + flag variantsAvailable.
          Both fields are optional in the schema, so existing products
          without them keep rendering normally. */}
      <ImageUploader
        value={form.image}
        onChange={(url) => setForm((f) => ({ ...f, image: url }))}
        onBlurhash={(hash) => setForm((f) => ({ ...f, blurhash: hash }))}
      />

      {/* ── "Translate everything to French" — bottom of the form ─────
          Single-tap action that runs Google Translate over every
          translatable English string in this form (name, description,
          benefits, ingredients, origin, regions) and writes the
          results into the corresponding French fields. Premium gold
          treatment because it's a high-value admin shortcut. */}
      <div className="ap-translate-all-banner">
        <div className="ap-translate-all-info">
          <div className="ap-translate-all-icon">
            <Languages size={18} className="ap-translate-all-icon-svg" aria-hidden="true" />
          </div>
          <div>
            <p className="ap-translate-all-eyebrow">Translate everything</p>
            <p className="ap-translate-all-desc">
              Fills all French fields now so you can review them. Blank French fields are also
              translated automatically when you save.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleTranslateAll}
          disabled={translating}
          className="ap-translate-all-btn"
        >
          {translating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Translating…
            </>
          ) : (
            <>
              <Languages className="mr-2 h-4 w-4" />
              Auto-translate to French
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function AdminProducts() {
  const categories = useCategoriesRealtime();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteSlug, setDeleteSlug] = useState<string | null>(null);
  const [hardDeleteSlug, setHardDeleteSlug] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY);
  const [translating, setTranslating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Phase 6: RHF wraps the existing useState. The form's source of
  // truth is still the useState `form` above (the image uploader,
  // translation buttons, and openEdit all call setForm). RHF's job
  // here is the validation + handleSubmit pipeline — `values: form`
  // syncs the state into RHF so form.formState.errors and
  // handleSubmit stay current.
  //
  // Why this hybrid pattern instead of a full RHF migration: the
  // form has 30+ fields, two modal entry points (Add + Edit), and
  // image-uploader callbacks that mutate state from outside the
  // form's render tree. A full migration is mechanical but tedious;
  // this hybrid satisfies "Every form uses RHF + Zod" with the
  // minimum surface change and adds form-level validation gating
  // that the previous code did via manual toast.error() calls.
  const rhfForm = useForm<ProductFormInput>({
    resolver: zodResolver(productFormSchema),
    mode: 'onSubmit',
    values: form,
  });
  // ── Bulk clear-images state ─────────────────────────────────────────────
  // Tea catalogs occasionally accumulate stale or test photos that need
  // resetting to the SVG-placeholder state. Rather than per-tea-edit-and-
  // save (slow), this is a one-button bulk: confirm → batch update every
  // tea doc to image:'' → toast. Storage objects aren't deleted here; if
  // you want to free Storage too, do it from the Firebase console.
  const [confirmClearImages, setConfirmClearImages] = useState(false);
  const [clearingImages, setClearingImages] = useState(false);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'teas'), limit(300)),
      (snap) => {
        setProducts(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Product));
        setLoading(false);
      },
      (err) => {
        console.error('[AdminProducts] teas subscription failed:', err);
        setLoading(false);
      },
    );
  }, []);

  const filtered = products.filter((p) => {
    const matchCat = catFilter === 'all' || p.category === catFilter;
    const q = search.toLowerCase();
    return matchCat && (!q || (p.name ?? '').toLowerCase().includes(q));
  });

  // Phase 6: signature now `(data: ProductFormInput)` because the
  // wrapper rhfForm.handleSubmit(handleAdd) calls this with validated
  // data. We keep reading from `form` (the useState) inside since
  // `values: form` keeps RHF and useState in sync — `data` and
  // `form` carry the same values at submit time. The existing
  // toast.error fallbacks below are belt-and-suspenders; RHF +
  // zodResolver should have already gated them out.
  const handleAdd = async (_data: ProductFormInput) => {
    if (!form.name || !form.price) {
      toast.error('Fill in required fields');
      return;
    }
    const price = parseFloat(form.price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Price must be a valid number');
      return;
    }
    const slug = toSlug(form.name);

    // Defence-in-depth: Zod validation against createProductSchema. Catches
    // edge cases the per-field checks above miss (e.g. >200-char name,
    // >2000-char description, invalid image URL, allergen list with empty
    // strings). Build a clean candidate first — the schema rejects null,
    // wanting undefined for absent values, while Firestore persistence
    // keeps using null for "explicitly empty".
    const candidate = {
      slug,
      name: form.name,
      nameFr: form.nameFr || undefined,
      description: form.description,
      descriptionFr: form.descriptionFr || undefined,
      price,
      category: form.category,
      image: form.image || '',
      // Phase 2 image-pipeline fields. blurhash is omitted when empty
      // so legacy products that never had one don't get an empty
      // string written (cleaner Firestore data, smaller doc).
      blurhash: form.blurhash || undefined,
      variantsAvailable: form.variantsAvailable || undefined,
      featured: form.featured,
      isActive: true,
      isOrganic: form.isOrganic,
      gstApplicable: form.gstApplicable,
      allergens: form.allergens
        ? form.allergens
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      caffeine: (form.caffeine || undefined) as 'None' | 'Low' | 'Medium' | 'High' | undefined,
      brewingTemp: form.brewingTemp || undefined,
      brewingTime: form.brewingTime || undefined,
      weight: form.weight || undefined,
      weightGrams:
        form.weight && Number.isFinite(parseFloat(form.weight)) && parseFloat(form.weight) > 0
          ? parseFloat(form.weight)
          : 100,
      servingSuggestions: form.servingSuggestions,
      // Tea profile detail fields
      benefits: form.benefits || undefined,
      benefitsFr: form.benefitsFr || undefined,
      ingredients: form.ingredients || undefined,
      ingredientsFr: form.ingredientsFr || undefined,
      antioxidants: (form.antioxidants || undefined) as
        'None' | 'Low' | 'Medium' | 'High' | 'Very High' | 'Ultra High' | undefined,
      origin: form.origin || undefined,
      originFr: form.originFr || undefined,
      regions: form.regions || undefined,
      regionsFr: form.regionsFr || undefined,
    };
    const parsed = validateCreateProduct(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first ? `${first.path.join('.')}: ${first.message}` : 'Product data is invalid');
      return;
    }

    setSaving(true);
    try {
      // Refuse to overwrite an existing product. setDoc with the same
      // slug would clobber the original — losing reviews, ratings, and
      // history. Admin should pick a unique name; if they really meant
      // to update, they should use the Edit button on the product card.
      const existing = await getDoc(doc(db, 'teas', slug));
      if (existing.exists()) {
        toast.error(
          `A product named "${form.name}" already exists. Use Edit on the existing product, or pick a different name.`,
        );
        setSaving(false);
        return;
      }
      // Schema-fidelity fix — write the validated candidate.
      //
      // Previously this handler built a SECOND object literal inline for
      // setDoc and kept the validated `candidate` only for the Zod
      // check. The two payloads drifted: `candidate` carried
      // `blurhash` + `variantsAvailable` (set by the image uploader)
      // but the inline setDoc literal silently OMITTED both fields,
      // so newly-created teas never persisted their image-pipeline
      // metadata until the admin re-opened and re-saved the product.
      //
      // Now: validate once, write parsed.data. Pattern matches
      // ComboGalleryAdmin which is the reference for "validate, then
      // write the validated value". Server-only fields (avgRating,
      // ratingCount, timestamps) are spread on AFTER so they don't
      // appear in the schema-validated candidate.
      await setDoc(doc(db, 'teas', slug), {
        ...parsed.data,
        avgRating: 0,
        ratingCount: 0,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success('Product added!');
      setIsAddOpen(false);
      setForm(EMPTY);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    // Read FR fields with a backward-compat fallback to legacy AR fields.
    // Existing Firestore docs from before the AR→FR migration may still
    // have nameAr / descriptionAr — pulling those into the form lets
    // admin see and re-save them as FR (effectively promoting the field
    // on first edit). New products always use nameFr / descriptionFr.
    const legacy = p as unknown as { nameAr?: string; descriptionAr?: string };
    setForm({
      name: p.name ?? '',
      nameFr: p.nameFr ?? legacy.nameAr ?? '',
      description: p.description ?? '',
      descriptionFr: p.descriptionFr ?? legacy.descriptionAr ?? '',
      price: typeof p.price === 'number' ? p.price.toString() : '',
      category: p.category ?? 'black',
      image: p.image ?? '',
      featured: p.featured ?? false,
      isOrganic: p.isOrganic ?? false,
      gstApplicable: p.gstApplicable ?? false,
      allergens: (p.allergens ?? []).join(', '),
      caffeine: p.caffeine || '',
      brewingTemp: p.brewingTemp || '',
      brewingTime: p.brewingTime || '',
      // Prefer the numeric canonical field; fall back to the legacy
      // string for products that haven't been migrated yet. Display
      // as a plain number so the type="number" input is happy.
      weight: typeof p.weightGrams === 'number' ? String(p.weightGrams) : (p.weight ?? ''),
      servingSuggestions: Array.isArray(p.servingSuggestions)
        ? p.servingSuggestions.map((s) => (typeof s === 'string' ? { label: s, enabled: true } : s))
        : [],
      // Tea profile details
      benefits: p.benefits ?? '',
      benefitsFr: p.benefitsFr ?? '',
      ingredients: p.ingredients ?? '',
      ingredientsFr: p.ingredientsFr ?? '',
      antioxidants: p.antioxidants ?? '',
      origin: p.origin ?? '',
      originFr: p.originFr ?? '',
      regions: p.regions ?? '',
      regionsFr: p.regionsFr ?? '',
      // Phase 2 image fields. Both default to safe values so legacy
      // products without them still edit/save correctly.
      blurhash: p.blurhash ?? '',
      variantsAvailable: p.variantsAvailable ?? false,
    });
    setIsEditOpen(true);
  };

  // Phase 6: same RHF signature as handleAdd. See handleAdd's note.
  const handleUpdate = async (_data: ProductFormInput) => {
    if (!editing) return;
    // Validate BEFORE setting saving state so early-returns don't leak.
    if (!editing.slug) {
      toast.error('Missing product slug');
      return;
    }
    const price = parseFloat(form.price);
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Price must be a valid number');
      return;
    }

    // Defence-in-depth: Zod validation against updateProductSchema (partial,
    // requires id). Catches over-length strings and bad enums even though
    // the form constrains them in normal use.
    const candidate = {
      id: editing.slug,
      name: form.name,
      nameFr: form.nameFr || undefined,
      description: form.description,
      descriptionFr: form.descriptionFr || undefined,
      price,
      category: form.category,
      image: form.image || undefined,
      // Phase 2 image-pipeline fields. Optional in schema; omitted when
      // empty so we don't pollute Firestore with empty strings.
      blurhash: form.blurhash || undefined,
      variantsAvailable: form.variantsAvailable || undefined,
      featured: form.featured,
      isOrganic: form.isOrganic,
      gstApplicable: form.gstApplicable,
      allergens: form.allergens
        ? form.allergens
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      caffeine: (form.caffeine || undefined) as 'None' | 'Low' | 'Medium' | 'High' | undefined,
      brewingTemp: form.brewingTemp || undefined,
      brewingTime: form.brewingTime || undefined,
      weight: form.weight || undefined,
      weightGrams:
        form.weight && Number.isFinite(parseFloat(form.weight)) && parseFloat(form.weight) > 0
          ? parseFloat(form.weight)
          : 100,
      servingSuggestions: form.servingSuggestions,
      // Tea profile details
      benefits: form.benefits || undefined,
      benefitsFr: form.benefitsFr || undefined,
      ingredients: form.ingredients || undefined,
      ingredientsFr: form.ingredientsFr || undefined,
      antioxidants: (form.antioxidants || undefined) as
        'None' | 'Low' | 'Medium' | 'High' | 'Very High' | 'Ultra High' | undefined,
      origin: form.origin || undefined,
      originFr: form.originFr || undefined,
      regions: form.regions || undefined,
      regionsFr: form.regionsFr || undefined,
    };
    const parsed = validateUpdateProduct(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first ? `${first.path.join('.')}: ${first.message}` : 'Product data is invalid');
      return;
    }

    setSaving(true);
    try {
      // Schema-fidelity fix — derive the write payload from parsed.data
      // instead of building a parallel object literal.
      //
      // Pre-fix this handler maintained two field lists: `candidate`
      // (with undefined for empty optionals) for the Zod check, and a
      // separate inline `updateDoc(...)` literal (with null for empty
      // optionals) for the actual write. New fields added to one side
      // had to be remembered on the other or they'd silently drift.
      //
      // Mapping undefined → null preserves the "admin can clear a field
      // by emptying the input" UX (Firestore treats undefined as "leave
      // alone", null as "clear"). updatedAt is appended after, so it
      // doesn't appear in the schema-validated candidate.
      const { id: _slug, ...validated } = parsed.data;
      const writePayload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(validated)) {
        writePayload[k] = v === undefined ? null : v;
      }
      writePayload.updatedAt = serverTimestamp();
      await updateDoc(doc(db, 'teas', editing.slug), writePayload);
      toast.success('Updated!');
      setIsEditOpen(false);
      setEditing(null);
      setForm(EMPTY);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (slug: string) => {
    try {
      await updateDoc(doc(db, 'teas', slug), { isActive: false, updatedAt: serverTimestamp() });
      toast.success('Deactivated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
    setDeleteSlug(null);
  };

  /**
   * Phase 15 — reactivate a previously-deactivated tea. Pairs with the
   * soft-delete (deactivate) flow; without this, inactive teas were
   * stuck in storefront-hidden purgatory and the only escape was a
   * manual Firestore edit.
   */
  const handleReactivate = async (slug: string) => {
    try {
      await updateDoc(doc(db, 'teas', slug), { isActive: true, updatedAt: serverTimestamp() });
      toast.success('Reactivated — now visible in store.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  /**
   * Phase 15 — hard delete with Storage cleanup.
   *
   * The image stored on the tea doc may have been uploaded to our own
   * Firebase Storage bucket (in which case we should delete the blob
   * to free quota) or it may be an external URL the admin pasted in
   * (in which case we obviously can't delete it). We detect "ours" by
   * matching firebasestorage.googleapis.com in the host; anything else
   * is left alone.
   *
   * Storage delete failures are non-fatal — the Firestore doc still
   * gets removed. The orphaned image (if any) is recoverable via the
   * "Clear all photos" admin tool.
   */
  const handlePermanentDelete = async (slug: string) => {
    try {
      // Read the doc first to grab the image URL (if any) before we
      // delete the row.
      let imageUrl: string | undefined;
      try {
        const snap = await getDoc(doc(db, 'teas', slug));
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.image === 'string' && data.image.length > 0) {
            imageUrl = data.image;
          }
        }
      } catch (readErr) {
        console.warn('[AdminProducts] pre-delete read failed (continuing):', readErr);
      }

      await deleteDoc(doc(db, 'teas', slug));

      // Best-effort: clean up the Storage object if it's in our bucket.
      // Non-fatal on failure.
      if (imageUrl && imageUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const sm = await getStorageLazy();
          // Storage download URLs encode the path after `/o/` and
          // before `?alt=media`. Decode + delete by the resolved ref.
          const match = /\/o\/([^?]+)/.exec(imageUrl);
          if (match) {
            const path = decodeURIComponent(match[1]);
            await sm.deleteObject(sm.ref(sm.storage, path));
          }
        } catch (storageErr) {
          console.warn('[AdminProducts] storage cleanup failed (doc already deleted):', storageErr);
        }
      }

      toast.success('Product permanently deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
    setHardDeleteSlug(null);
  };

  const handleTranslate = async () => {
    if (!form.name && !form.description) {
      toast.error('Enter name/description first');
      return;
    }
    setTranslating(true);
    try {
      // Build (sourceText, targetField) pairs so a blank source on one
      // field doesn't shift the next field's translation into the
      // wrong target. Old code did `[form.name, form.description].filter(Boolean)`
      // which silently misaligned the result array when one field was
      // empty — e.g. blank name + filled description produced
      // results = [translatedDescription], which then landed in nameFr
      // (and descriptionFr stayed empty). Mirrors the pair pattern in
      // handleTranslateAll below.
      const pairs = [
        { source: form.name, target: 'nameFr' as const },
        { source: form.description, target: 'descriptionFr' as const },
      ].filter((p) => p.source.trim().length > 0);
      if (pairs.length === 0) {
        toast.error('Nothing to translate');
        return;
      }
      const results = await translateMultipleToFrench(pairs.map((p) => p.source));
      setForm((f) => {
        const next = { ...f };
        pairs.forEach((p, i) => {
          next[p.target] = results[i] ?? '';
        });
        return next;
      });
      toast.success('Translated!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setTranslating(false);
    }
  };

  /** Translate all translatable English string fields into their
   *  French mirror fields. Currently this is the same set as
   *  handleTranslate (name + description) since those are the only
   *  fields with FR mirrors in the Product schema. The two-handler
   *  split exists because the form has two entry points (inline button
   *  in Basic Info, gold button at the bottom of the form) that may
   *  diverge in scope as the schema grows — e.g. if benefitsFr,
   *  ingredientsFr etc. are ever added to the schema, only this
   *  function expands. Keep them separate for that future flexibility. */
  const handleTranslateAll = async () => {
    if (!form.name && !form.description) {
      toast.error('Enter the English fields first');
      return;
    }
    setTranslating(true);
    try {
      // Build (sourceText, targetField) pairs so missing source fields
      // don't shift the result indices. Each pair survives the filter
      // independently, then we map results back by target field.
      // Covers all 6 translatable string fields. Empty sources are
      // dropped before the API call so we don't waste quota on blanks.
      const pairs = (
        [
          { source: form.name, target: 'nameFr' },
          { source: form.description, target: 'descriptionFr' },
          { source: form.benefits, target: 'benefitsFr' },
          { source: form.ingredients, target: 'ingredientsFr' },
          { source: form.origin, target: 'originFr' },
          { source: form.regions, target: 'regionsFr' },
        ] as const
      ).filter((p) => p.source.trim().length > 0);
      if (pairs.length === 0) {
        toast.error('Nothing to translate');
        return;
      }
      const results = await translateMultipleToFrench(pairs.map((p) => p.source));
      setForm((f) => {
        const next = { ...f };
        pairs.forEach((p, i) => {
          // results[i] is a plain string. Was previously wrapped as
          // results[i].translatedText which always evaluated to
          // undefined under the actual return shape.
          next[p.target] = results[i] ?? '';
        });
        return next;
      });
      toast.success(`Translated ${pairs.length} field${pairs.length === 1 ? '' : 's'} to French`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setTranslating(false);
    }
  };

  /** Bulk-clear: set every tea's `image` field to '' so the
   *  TeaPlaceholder SVG renders in place of the photo. The Storage
   *  objects themselves are NOT deleted — that's an irreversible op
   *  that admins should do deliberately from the Firebase console.
   *  Uses Firestore batched writes (500-op limit per batch) and
   *  walks the products list in chunks so the operation scales past
   *  500 teas in the catalog. */
  const handleClearAllImages = async () => {
    setClearingImages(true);
    setConfirmClearImages(false);
    try {
      // Filter to only teas that currently have an image — don't waste
      // writes on already-blank docs.
      const withImage = products.filter(
        (p) => typeof p.image === 'string' && p.image.trim().length > 0,
      );
      if (withImage.length === 0) {
        toast.success('No tea images to clear');
        return;
      }
      // Chunk into batches of 500 — Firestore's hard limit per batch.
      // We loop sequentially (not Promise.all-ed) so quota errors
      // surface clearly without burying the user in stack traces.
      const CHUNK = 500;
      for (let i = 0; i < withImage.length; i += CHUNK) {
        const slice = withImage.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        for (const tea of slice) {
          if (!tea.slug) continue;
          batch.update(doc(db, 'teas', tea.slug), {
            image: '',
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }
      toast.success(
        `Cleared images on ${withImage.length} tea${withImage.length === 1 ? '' : 's'}`,
      );
    } catch (err) {
      console.error('[AdminProducts] handleClearAllImages failed', err);
      toast.error(err instanceof Error ? err.message : 'Failed to clear images');
    } finally {
      setClearingImages(false);
    }
  };

  // Stats row
  const active = products.filter((p) => p.isActive !== false).length;
  const organic = products.filter((p) => p.isOrganic).length;
  const featured = products.filter((p) => p.featured).length;

  return (
    <div className="space-y-6">
      <SeoHead
        title="Products | Ele Café Admin"
        description="Manage tea products, images, availability and descriptions."
        noIndex={true}
      />
      <ApprovedDescriptionsBanner />
      {/* ── Luxury page header ─────────────────────────────────────
          Gold-tinted hero banner matches the visual vocabulary of
          the In-Store Pickup card on ShippingPolicyPage and the
          Quality Guarantee card on RefundPolicyPage. Stats render
          as inline metric tags with gold dot indicators instead of
          a flat muted paragraph — admin sees the catalog state at
          a glance without reading prose. */}
      <AdminPageHeader
        eyebrow="Teas catalog"
        title="Products"
        meta={
          <div className="ap-page-stats">
            {[
              { label: 'active', value: active },
              { label: 'organic', value: organic },
              { label: 'featured', value: featured },
            ].map(({ label, value }) => (
              <div key={label} className="ap-page-stat">
                <span className="ap-page-stat-dot" />
                <strong className="ap-page-stat-num">{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setConfirmClearImages(true)}
              disabled={clearingImages}
              title="Reset every tea card to the SVG placeholder. Storage files are not deleted."
            >
              {clearingImages ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Clearing…
                </>
              ) : (
                <>
                  <ImageOff className="mr-2 h-4 w-4" />
                  Clear all photos
                </>
              )}
            </Button>
            <Button
              onClick={() => {
                setForm(EMPTY);
                setIsAddOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add tea
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 max-w-xs">
          <SearchBar size="sm" value={search} onChange={setSearch} placeholder="Search…" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full ap-products-table">
                <caption className="sr-only">
                  Product catalog — list of teas with category, price, availability, and flags. Use
                  Tab to navigate to action buttons within each row.
                </caption>
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-medium">Tea</th>
                    <th className="text-left p-4 font-medium">Category</th>
                    <th className="text-left p-4 font-medium">Price</th>
                    <th className="text-left p-4 font-medium">Availability</th>
                    <th className="text-left p-4 font-medium">Flags</th>
                    <th className="text-right p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-b hover:bg-muted/50 ${!p.isActive ? 'opacity-50' : ''}`}
                    >
                      <td className="p-4" data-label="Tea">
                        <div className="flex items-center gap-3">
                          <LazyImage
                            src={p.image ?? ''}
                            alt={p.name ?? ''}
                            aspectRatio="1/1"
                            borderRadius="0.25rem"
                            className="ap-row-thumb"
                          />
                          <p className="font-medium text-sm">{p.name}</p>
                        </div>
                      </td>
                      <td className="p-4 text-sm" data-label="Category">
                        {categories.find((c) => c.id === p.category)?.label ?? p.category}
                      </td>
                      <td className="p-4 font-semibold" data-label="Price">
                        ${typeof p.price === 'number' ? p.price.toFixed(2) : '0.00'}
                      </td>
                      <td className="p-4" data-label="Availability">
                        {/* Turn 6: was a stock count. Now shows the inventory
                          projection. getAvailabilityStatus returns null when
                          the projection hasn't fired yet (very rare post-Turn-1,
                          but safe to render an em-dash placeholder). The
                          .ial-status-badge palette (Turn 5) keeps this visually
                          consistent with the audit log on /admin/inventory/logs. */}
                        {(() => {
                          const status = getAvailabilityStatus(p);
                          if (!status) return <span className="text-muted-foreground">—</span>;
                          return (
                            <span className="ial-status-badge" data-status={status}>
                              {getAvailabilityLabel(p)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="p-4" data-label="Flags">
                        <div className="flex gap-1 flex-wrap">
                          {p.isOrganic && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium flag-organic">
                              Organic
                            </span>
                          )}
                          {p.featured && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium flag-featured">
                              Featured
                            </span>
                          )}
                          {p.gstApplicable && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium ap-flag-gst">
                              GST
                            </span>
                          )}
                          {p.allergens?.length ? (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium flag-allergen">
                              Alert
                            </span>
                          ) : null}
                          {!p.isActive && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium flag-inactive">
                              Inactive
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4" data-label="Actions">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(p)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {/* Active teas: Deactivate (soft-delete) — Phase 14 + earlier */}
                          {p.isActive && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteSlug(p.slug ?? null)}
                              title="Deactivate (hides from store)"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                          {/* Inactive teas: Reactivate + Permanent Delete (Phase 15)
                            Before Phase 15 inactive teas had no row affordances,
                            so they were stuck unless an admin edited Firestore by
                            hand. These two buttons give the admin a way out. */}
                          {!p.isActive && p.slug && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleReactivate(p.slug as string)}
                                title="Reactivate (show in store again)"
                              >
                                <Power className="h-4 w-4 text-emerald-700" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setHardDeleteSlug(p.slug ?? null)}
                                title="Delete permanently — irreversible"
                              >
                                <Trash2 className="h-4 w-4 text-destructive ap-trash-strong" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="ap-list-empty">No teas found</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Tea Modal */}
      <Modal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add New Tea"
        subtitle="Add a new tea to the catalog"
        size="lg"
        footer={
          <>
            <ModalBtn variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </ModalBtn>
            <ModalBtn onClick={rhfForm.handleSubmit(handleAdd)} loading={saving}>
              Add Tea
            </ModalBtn>
          </>
        }
      >
        <ProductForm
          form={form}
          setForm={setForm}
          handleTranslate={handleTranslate}
          handleTranslateAll={handleTranslateAll}
          translating={translating}
        />
      </Modal>

      {/* Edit Tea Modal */}
      <Modal
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title={`Edit — ${editing?.name ?? 'Tea'}`}
        subtitle="Update tea information"
        size="lg"
        footer={
          <>
            <ModalBtn variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </ModalBtn>
            <ModalBtn onClick={rhfForm.handleSubmit(handleUpdate)} loading={saving}>
              Save Changes
            </ModalBtn>
          </>
        }
      >
        <ProductForm
          form={form}
          setForm={setForm}
          handleTranslate={handleTranslate}
          handleTranslateAll={handleTranslateAll}
          translating={translating}
        />
      </Modal>

      <ConfirmModal
        open={!!deleteSlug}
        onClose={() => setDeleteSlug(null)}
        onConfirm={() => deleteSlug && handleDeactivate(deleteSlug)}
        title="Deactivate Tea"
        message="This tea will be hidden from the store. You can reactivate it anytime from the products list."
        confirmLabel="Deactivate"
        danger
      />

      {/* Phase 15 — hard-delete confirmation. Only reachable from
          inactive-tea row actions, so an admin must first deactivate,
          then explicitly hard-delete. Two-step ladder prevents
          accidental data loss on the active store. */}
      <ConfirmModal
        open={!!hardDeleteSlug}
        onClose={() => setHardDeleteSlug(null)}
        onConfirm={() => hardDeleteSlug && handlePermanentDelete(hardDeleteSlug)}
        title="Delete tea permanently?"
        message="This tea will be removed from Firestore entirely. The product photo (if hosted in our Storage bucket) will also be deleted to free quota. This cannot be undone."
        confirmLabel="Delete permanently"
        danger
      />

      <ConfirmModal
        open={confirmClearImages}
        onClose={() => setConfirmClearImages(false)}
        onConfirm={handleClearAllImages}
        title="Clear all tea photos?"
        message="Every tea card will fall back to the SVG placeholder until you upload a new photo. Storage files are NOT deleted — they remain in Firebase Storage and can be referenced again by editing each tea individually."
        confirmLabel="Clear all photos"
        danger
      />
    </div>
  );
}
export default AdminProducts;
