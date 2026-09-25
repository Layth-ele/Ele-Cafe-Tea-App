/**
 * ComboGalleryAdmin
 *
 * Admin-side UI for managing the global "Pairs with our tea" gallery.
 * Lives inside the Combo Gallery section of AdminSettings.
 *
 * What it does:
 *   • Bulk image upload (drag-drop or click-to-choose, multi-file).
 *     Each file → Firebase Storage at /comboGallery/{filename} →
 *     Firestore doc at /comboGalleryItems/{auto-id}.
 *   • Per-item: edit title, description, price; toggle enabled/disabled;
 *     delete (also removes the Storage object).
 *   • Drag-to-reorder updates the `order` integer on each item (used
 *     by the customer carousel).
 *   • Live subscription — admin sees their changes immediately.
 *
 * Validation:
 *   New uploads are committed with default title/description/price so
 *   the admin lands on an editable card and can fill in real content.
 *   The Zod schema (`createComboItemSchema`) is enforced on every save.
 *
 * Notes:
 *   • No artificial cap on the number of items — Firestore handles
 *     thousands of docs fine, and the customer carousel shows one at
 *     a time, so adding more is purely an admin-UX concern.
 *   • Storage rules cap each file at 5 MB, image MIME only.
 */
import { useEffect, useRef, useState } from 'react';
import {
  collection, onSnapshot, query, orderBy, where,
  addDoc, updateDoc, deleteDoc, doc, getDocs,
  serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { toast } from 'sonner';
import {
  GripVertical, ImagePlus, Loader2, Save, Trash2,
  Eye, EyeOff, Upload, Link2, Wand2, ArrowUp, ArrowDown, X,
} from 'lucide-react';

import { db, getStorageLazy } from '@/lib/firebase';
import {
  validateCreateComboItem, validateUpdateComboItem,
  type ComboItem, COMBO_PRICE_MAX, comboSlugFromTitle,
} from '@/schemas/comboGallery.schema';
import { LazyImage } from '@/app/components/LazyImage';

// ── Helpers ──────────────────────────────────────────────────────────────────
const MAX_FILE_BYTES = 5 * 1024 * 1024; // matches storage.rules
const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function safeFilename(name: string): string {
  // Firebase Storage tolerates a lot, but stripping noise keeps URLs clean.
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  // Date.now() granularity is 1ms — drag-dropping 30 files runs the
  // upload loop in well under a single tick. Without the random
  // suffix, two files in the same millisecond produce the same
  // Storage path and the second silently overwrites the first. The
  // random hex (24 bits) makes a same-tick collision ~2^-24.
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}_${rand}_${base}`;
}

/** Lightweight tea record for the pairedTeaIds picker. We don't need
 *  the full Product shape here — just enough to render the dropdown
 *  options and the selected chips. id is the Firestore doc id. */
interface TeaOption {
  id:    string;
  name:  string;
  category: string;
}

// ── Public component ─────────────────────────────────────────────────────────
export function ComboGalleryAdmin() {
  const [items, setItems] = useState<ComboItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  // Phase 13 — tea catalog for the pairedTeaIds picker. One-shot
  // fetch on mount; the catalog is admin-curated and changes rarely,
  // and a stale list just means the admin needs a refresh after they
  // add a new tea, which is acceptable. Sorted by name for the
  // dropdown's UX. Failures fall through silently — the picker
  // simply renders an empty list, which is recoverable.
  const [teas, setTeas] = useState<TeaOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'teas'), orderBy('name', 'asc')));
        if (cancelled) return;
        const list: TeaOption[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          if (data.isActive === false) continue;
          if (typeof data.name !== 'string') continue;
          list.push({
            id: d.id,
            name: data.name,
            category: typeof data.category === 'string' ? data.category : '',
          });
        }
        setTeas(list);
      } catch (err) {
        console.warn('[ComboGalleryAdmin] tea catalog fetch failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Drag-and-drop reorder state
  const dragId = useRef<string | null>(null);
  const dragOverId = useRef<string | null>(null);

  // Bulk file input
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dropActive, setDropActive] = useState(false);

  // Live items
  useEffect(() => {
    const q = query(collection(db, 'comboGalleryItems'), orderBy('order', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map(d => ({ id: d.id, ...d.data() } as ComboItem));
        setItems(next);
        setLoading(false);
      },
      (err) => {
        console.error('[ComboGalleryAdmin] subscription error', err);
        toast.error('Could not load combo gallery');
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  // ── Upload one or many files ───────────────────────────────────────────────
  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;

    // Validate up-front so the admin doesn't see N partial uploads
    const invalid: string[] = [];
    const accepted: File[] = [];
    for (const f of list) {
      if (!ACCEPTED_MIME.includes(f.type)) {
        invalid.push(`${f.name}: not an image`);
      } else if (f.size > MAX_FILE_BYTES) {
        invalid.push(`${f.name}: over 5 MB`);
      } else {
        accepted.push(f);
      }
    }
    if (invalid.length) {
      toast.error(`Skipped ${invalid.length} file${invalid.length === 1 ? '' : 's'}: ${invalid[0]}${invalid.length > 1 ? ' …' : ''}`);
    }
    if (accepted.length === 0) return;

    setUploading(true);
    setUploadProgress({ done: 0, total: accepted.length });

    // Lazy-load Storage on first upload. One module load is shared
    // across the entire batch — even if the admin drops 30 photos
    // at once, we await the import once.
    const sm = await getStorageLazy();

    // Find the next order index (after the highest existing one)
    let nextOrder = items.reduce((max, i) => Math.max(max, i.order ?? 0), -1) + 1;

    let successes = 0;
    let failures = 0;

    for (const file of accepted) {
      try {
        const filename = safeFilename(file.name);
        const path = `comboGallery/${filename}`;
        const ref = sm.ref(sm.storage, path);
        await new Promise<void>((resolve, reject) => {
          const task = sm.uploadBytesResumable(ref, file, { contentType: file.type });
          task.on('state_changed', undefined, reject, () => resolve());
        });
        const url = await sm.getDownloadURL(ref);

        // Auto-slug from the placeholder title; the admin renames the
        // title later, at which point they can also adjust the slug.
        // We dedupe against existing slugs in `items` (already loaded
        // by the snapshot listener above) by appending -2, -3, … until
        // it's unique. Race with concurrent creates is acceptable —
        // Firestore enforces nothing on slug uniqueness; if two items
        // collide, the second one's /pairings/{slug} link will resolve
        // to whichever the gallery hook returns first. Admins can fix
        // by renaming. Worth flagging as a known limitation.
        const baseSlug = comboSlugFromTitle('new-pairing');
        const existingSlugs = new Set(items.map(i => i.slug).filter(Boolean));
        let slug = baseSlug;
        let n = 2;
        while (existingSlugs.has(slug)) {
          slug = `${baseSlug}-${n++}`;
        }

        const candidate = {
          imageUrl:    url,
          storagePath: path,
          title:       'New pairing',
          description: 'Add a description for this pairing.',
          price:       0,
          currency:    'CAD',
          order:       nextOrder++,
          enabled:     true,
          slug,
        };
        const parsed = validateCreateComboItem(candidate);
        if (!parsed.success) {
          throw new Error(parsed.error.issues.map(i => i.message).join('; '));
        }

        await addDoc(collection(db, 'comboGalleryItems'), {
          ...parsed.data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        successes += 1;
      } catch (err) {
        failures += 1;
        console.error('[ComboGalleryAdmin] upload failed', err);
      }
      setUploadProgress(p => ({ ...p, done: p.done + 1 }));
    }

    setUploading(false);
    setUploadProgress({ done: 0, total: 0 });

    if (successes > 0) {
      toast.success(
        successes === 1
          ? '1 image added — fill in the details below'
          : `${successes} images added — fill in the details below`,
      );
    }
    if (failures > 0) {
      toast.error(`${failures} upload${failures === 1 ? '' : 's'} failed`);
    }
  }

  // ── Drag-and-drop file zone ────────────────────────────────────────────────
  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDropActive(true);
  }
  function onDragLeave() { setDropActive(false); }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDropActive(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  // ── Per-item edit / delete / toggle ────────────────────────────────────────
  /**
   * Check whether a slug is already in use by another combo (i.e. any
   * doc whose id != myId). Returns true if the slug is taken.
   * Empty/null slug is always allowed (legacy / unset).
   *
   * Phase 12 — closes the slug-collision gap. The previous code only
   * deduped on upload via the local items snapshot; manual slug edits
   * had no uniqueness check at all. Two combos sharing a slug make
   * `fetchComboBySlug` in `renderSeo` non-deterministic, so the IG
   * link card for one combo can show the other's image.
   */
  async function isSlugTaken(slug: string, myId: string): Promise<boolean> {
    const trimmed = slug.trim();
    if (!trimmed) return false;
    try {
      const snap = await getDocs(
        query(collection(db, 'comboGalleryItems'), where('slug', '==', trimmed))
      );
      for (const d of snap.docs) {
        if (d.id !== myId) return true;
      }
      return false;
    } catch (err) {
      // Network blip — don't block the save. A duplicate would be
      // caught by the next page load's listener delta, and admin
      // can rename. Logged for observability.
      console.warn('[ComboGalleryAdmin] slug uniqueness check failed:', err);
      return false;
    }
  }

  async function patchItem(id: string, patch: Partial<ComboItem>) {
    const parsed = validateUpdateComboItem({ id, ...patch });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    // Slug uniqueness — only when slug is in the patch and non-empty.
    if (typeof patch.slug === 'string' && patch.slug.trim().length > 0) {
      if (await isSlugTaken(patch.slug, id)) {
        toast.error(`Slug "${patch.slug.trim()}" is already in use by another pairing.`);
        return;
      }
    }
    try {
      const { id: _, ...rest } = parsed.data;
      await updateDoc(doc(db, 'comboGalleryItems', id), {
        ...rest,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[ComboGalleryAdmin] patch failed', err);
      toast.error('Save failed');
    }
  }

  async function deleteItem(item: ComboItem) {
    if (!item.id) return;
    if (!confirm(`Delete "${item.title}"? This also removes the image from Storage.`)) return;
    try {
      await deleteDoc(doc(db, 'comboGalleryItems', item.id));
      // Storage delete is best-effort — the Firestore doc is the source of truth
      try {
        const sm = await getStorageLazy();
        await sm.deleteObject(sm.ref(sm.storage, item.storagePath));
      } catch (err) {
        console.warn('[ComboGalleryAdmin] Storage delete skipped:', err);
      }
      toast.success('Deleted');
    } catch (err) {
      console.error('[ComboGalleryAdmin] delete failed', err);
      toast.error('Delete failed');
    }
  }

  // ── Reorder via drag-and-drop ──────────────────────────────────────────────
  function handleDragStart(id: string) { dragId.current = id; }
  function handleDragEnter(id: string) { dragOverId.current = id; }

  /**
   * Persist the new ordering to Firestore as a single batched write,
   * with optimistic local state update. Shared by drag-drop (mouse)
   * and the keyboard/touch-accessible Move Up / Move Down buttons.
   *
   * Phase 12 — pulled out of handleDragEnd so the keyboard reorder
   * path goes through the exact same persistence logic. Without this
   * refactor each entry point would have its own batch-write loop
   * and they'd inevitably drift.
   */
  async function persistOrder(reordered: ComboItem[]) {
    setItems(reordered);
    try {
      const batch = writeBatch(db);
      reordered.forEach((it, i) => {
        if (!it.id) return;
        batch.update(doc(db, 'comboGalleryItems', it.id), { order: i, updatedAt: serverTimestamp() });
      });
      await batch.commit();
    } catch (err) {
      console.error('[ComboGalleryAdmin] reorder failed', err);
      toast.error('Reorder failed — refresh to see the saved order');
    }
  }

  async function handleDragEnd() {
    const from = dragId.current;
    const to = dragOverId.current;
    dragId.current = null;
    dragOverId.current = null;
    if (!from || !to || from === to) return;

    const fromIdx = items.findIndex(i => i.id === from);
    const toIdx = items.findIndex(i => i.id === to);
    if (fromIdx < 0 || toIdx < 0) return;

    const reordered = [...items];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    await persistOrder(reordered);
  }

  /**
   * Keyboard/touch-accessible reorder. HTML5 drag-and-drop doesn't
   * fire on touchscreens and is unusable with a keyboard alone, so
   * every row carries Move Up / Move Down buttons too. They no-op at
   * the array boundaries (first row's up, last row's down) — the
   * buttons themselves disable in those positions.
   */
  async function moveItem(id: string, direction: 'up' | 'down') {
    const idx = items.findIndex(i => i.id === id);
    if (idx < 0) return;
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= items.length) return;
    const reordered = [...items];
    [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]];
    await persistOrder(reordered);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const visibleCount = items.filter(i => i.enabled !== false).length;

  return (
    <div className="cga-root">
      {/* Drop zone + count */}
      <div className="cga-summary-row">
        <div className="cga-count">
          <strong className="cga-count-strong">{items.length}</strong> total
          {' · '}
          <strong className="cga-count-strong">{visibleCount}</strong> visible to customers
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="cga-upload-btn"
          data-disabled={uploading ? 'true' : 'false'}
        >
          {uploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
          {uploading
            ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
            : 'Upload Images'}
        </button>
      </div>

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className="cga-dropzone"
        data-active={dropActive ? 'true' : 'false'}
        role="button"
        aria-label="Drop images here or click to upload"
      >
        <ImagePlus size={26} className="cga-dropzone-icon" aria-hidden />
        <p className="cga-dropzone-msg">
          Drop images here or click to upload
        </p>
        <p className="cga-dropzone-hint">
          JPG, PNG, WebP — multiple allowed, 5 MB max each
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="cga-file-input"
        aria-label="Upload combo gallery images"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';  // allow re-selecting the same files
        }}
      />

      {/* Items grid */}
      {loading ? (
        <p className="cga-list-msg">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="cga-list-msg">
          No items yet. Upload images above to get started.
        </p>
      ) : (
        <ul className="cga-list">
          {items.map((item, idx) => (
            <ComboItemRow
              key={item.id}
              item={item}
              teas={teas}
              isFirst={idx === 0}
              isLast={idx === items.length - 1}
              onPatch={(patch) => item.id && patchItem(item.id, patch)}
              onDelete={() => deleteItem(item)}
              onMoveUp={() => item.id && moveItem(item.id, 'up')}
              onMoveDown={() => item.id && moveItem(item.id, 'down')}
              onDragStart={() => item.id && handleDragStart(item.id)}
              onDragEnter={() => item.id && handleDragEnter(item.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Per-item row ─────────────────────────────────────────────────────────────
function ComboItemRow({
  item, teas, isFirst, isLast,
  onPatch, onDelete,
  onMoveUp, onMoveDown,
  onDragStart, onDragEnter, onDragEnd,
}: {
  item: ComboItem;
  teas: TeaOption[];
  isFirst: boolean;
  isLast: boolean;
  onPatch: (patch: Partial<ComboItem>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
}) {
  // Local mirrors so typing is responsive; commit on blur or Enter.
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [titleFr, setTitleFr] = useState(item.titleFr ?? '');
  const [descriptionFr, setDescriptionFr] = useState(item.descriptionFr ?? '');
  const [price, setPrice] = useState(String(item.price ?? 0));
  const [slug, setSlug] = useState(item.slug ?? '');
  const [dirty, setDirty] = useState(false);

  // Resync if the doc changes externally (e.g. another tab) and we haven't
  // started editing locally.
  useEffect(() => {
    if (!dirty) {
      setTitle(item.title);
      setDescription(item.description);
      setTitleFr(item.titleFr ?? '');
      setDescriptionFr(item.descriptionFr ?? '');
      setPrice(String(item.price ?? 0));
      setSlug(item.slug ?? '');
    }
  }, [dirty, item.title, item.description, item.titleFr, item.descriptionFr, item.price, item.slug]);

  function commit() {
    if (!dirty) return;
    const priceNum = Number(price);
    if (Number.isNaN(priceNum) || priceNum < 0 || priceNum > COMBO_PRICE_MAX) {
      toast.error('Price must be between 0 and ' + COMBO_PRICE_MAX);
      setPrice(String(item.price ?? 0));
      setDirty(false);
      return;
    }
    // Validate slug format if non-empty. Empty slug is allowed (legacy
    // docs); the customer share UI hides itself when missing.
    const slugTrim = slug.trim();
    if (slugTrim && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugTrim)) {
      toast.error('Slug must be lowercase letters, numbers, and hyphens only');
      setSlug(item.slug ?? '');
      setDirty(false);
      return;
    }
    onPatch({
      title: title.trim() || item.title,
      description: description.trim() || item.description,
      titleFr: titleFr.trim(),
      descriptionFr: descriptionFr.trim(),
      price: priceNum,
      slug: slugTrim,
    });
    setDirty(false);
  }

  function handleAutoSlug() {
    const generated = comboSlugFromTitle(title.trim() || item.title);
    if (!generated) {
      toast.error('Add a title first to generate a slug');
      return;
    }
    setSlug(generated);
    setDirty(true);
  }

  async function handleCopyLink() {
    const useSlug = (slug.trim() || item.slug || '').trim();
    if (!useSlug) {
      toast.error('Add a slug first — click the wand to auto-fill');
      return;
    }
    const url = `${window.location.origin}/pairings/${useSlug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Share link copied!');
    } catch (err) {
      console.warn('[ComboGalleryAdmin] Clipboard copy failed:', err);
      toast.error('Could not copy — copy manually: ' + url);
    }
  }

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className="cga-row"
    >
      <div className="cga-row-handle-col">
        <div
          title="Drag to reorder"
          aria-label="Drag handle"
          className="cga-row-handle"
        >
          <GripVertical size={16} aria-hidden />
        </div>
        {/* Keyboard/touch-accessible reorder. HTML5 drag-and-drop
            doesn't fire on touchscreens and is invisible to keyboards.
            These two buttons reach feature parity for those input modes. */}
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label={`Move ${item.title} up`}
          title="Move up"
          className="cga-row-move-btn"
        >
          <ArrowUp size={14} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label={`Move ${item.title} down`}
          title="Move down"
          className="cga-row-move-btn"
        >
          <ArrowDown size={14} aria-hidden />
        </button>
      </div>

      <LazyImage
        src={item.imageUrl}
        alt={item.title}
        aspectRatio="1/1"
        borderRadius="10px"
        className="cga-row-thumb"
      />

      <div className="cga-row-fields">
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          aria-label="Title"
          maxLength={100}
          placeholder="Title"
          className={inputClass('title')}
        />
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
          onBlur={commit}
          aria-label="Description"
          maxLength={500}
          rows={2}
          placeholder="Description"
          className={inputClass('description')}
        />
        <input
          type="text"
          value={titleFr}
          onChange={(e) => { setTitleFr(e.target.value); setDirty(true); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          aria-label="Title (French)"
          maxLength={100}
          placeholder="French title (auto-translated if blank)"
          className={inputClass('title')}
        />
        <textarea
          value={descriptionFr}
          onChange={(e) => { setDescriptionFr(e.target.value); setDirty(true); }}
          onBlur={commit}
          aria-label="Description (French)"
          maxLength={500}
          rows={2}
          placeholder="French description (auto-translated if blank)"
          className={inputClass('description')}
        />
        <div className="cga-row-line">
          <label
            htmlFor={`price-${item.id}`}
            className="cga-row-line-label"
          >
            Price
          </label>
          <span className="cga-row-currency">$</span>
          <input
            id={`price-${item.id}`}
            type="number"
            inputMode="decimal"
            min={0}
            max={COMBO_PRICE_MAX}
            step={0.01}
            value={price}
            onChange={(e) => { setPrice(e.target.value); setDirty(true); }}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            aria-label="Price"
            className={`${inputClass('price')} cga-field-price`}
          />
          {dirty && (
            <button
              type="button"
              onClick={commit}
              aria-label="Save changes"
              className="cga-save-btn"
            >
              <Save size={12} /> Save
            </button>
          )}
        </div>

        {/* ── Slug + share link ───────────────────────────────────────────
            The slug becomes the share URL: /pairings/{slug}. Auto-fill
            wand derives one from the current title; admins can override.
            Copy-link button puts the full URL on the clipboard. */}
        <div className="cga-row-line cga-row-line-wrap">
          <label
            htmlFor={`slug-${item.id}`}
            className="cga-row-line-label"
          >
            URL
          </label>
          <span className="cga-row-slug-prefix">
            /pairings/
          </span>
          <input
            id={`slug-${item.id}`}
            type="text"
            value={slug}
            onChange={(e) => { setSlug(e.target.value.toLowerCase()); setDirty(true); }}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            aria-label="URL slug"
            placeholder="lemon-tart"
            maxLength={80}
            className={`${inputClass('slug')} cga-field-slug`}
          />
          <button
            type="button"
            onClick={handleAutoSlug}
            aria-label="Auto-fill slug from title"
            title="Auto-fill from title"
            className="cga-icon-btn"
          >
            <Wand2 size={13} />
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            aria-label="Copy share link"
            title="Copy share link"
            className="cga-icon-btn cga-icon-btn-dark"
          >
            <Link2 size={13} /> Copy link
          </button>
        </div>

        {/* ── Paired teas (Phase 13) ──────────────────────────────────────
            Per-combo curated tea associations. When set and non-empty,
            ComboPairingPage shows ONLY these teas in its "favorites"
            grid instead of the generic 4-featured fallback — which
            turns "Pair lemon tart with one of our teas" into a real
            curated recommendation rather than ambient cross-sell.

            Persisted directly via onPatch (no dirty/commit cycle) so
            adding/removing a tea feels instant. Capped at 8 to match
            Firestore's IN-query limit (and keep the picker UI small).
            Removed teas (deleted from /teas) are filtered out of the
            chip render so the admin sees only valid associations. */}
        <PairedTeasPicker
          itemId={item.id ?? ''}
          selectedIds={item.pairedTeaIds ?? []}
          allTeas={teas}
          onChange={(ids) => onPatch({ pairedTeaIds: ids })}
        />
      </div>

      <div className="cga-row-actions">
        <button
          type="button"
          onClick={() => item.id && onPatch({ enabled: !item.enabled })}
          aria-label={item.enabled ? 'Hide from customers' : 'Show to customers'}
          className="cga-pill-btn"
          data-visible={item.enabled !== false ? 'true' : 'false'}
        >
          {item.enabled !== false ? <Eye size={12} /> : <EyeOff size={12} />}
          {item.enabled !== false ? 'Visible' : 'Hidden'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete item"
          className="cga-danger-btn"
        >
          <Trash2 size={12} /> Delete
        </button>
      </div>
    </li>
  );
}

// ── Paired-teas picker ───────────────────────────────────────────────────────
/**
 * Compact picker for the `pairedTeaIds` field on a combo. Renders the
 * already-selected teas as removable chips and a dropdown that lists
 * un-selected teas alphabetically. Capped at 8 selections — past the
 * cap, the dropdown disables and the help text changes.
 *
 * Persistence: every change calls onChange synchronously, which goes
 * straight to onPatch in the parent and writes Firestore. No "save"
 * step — the chips reflect committed state.
 *
 * Resilience to deleted teas: if pairedTeaIds references a tea that
 * has been removed from /teas (or never existed), it's silently
 * filtered out of the chip render. Admin can re-add a real tea or
 * leave the now-shorter list; either is correct.
 */
function PairedTeasPicker({
  itemId, selectedIds, allTeas, onChange,
}: {
  itemId: string;
  selectedIds: string[];
  allTeas: TeaOption[];
  onChange: (next: string[]) => void;
}) {
  const MAX = 8;
  const byId = new Map(allTeas.map(t => [t.id, t]));

  // Render only the chips we can resolve. We DON'T strip unknown IDs
  // from selectedIds on render — that would cause writes via the
  // useEffect→onChange path; instead the parent just sees a shorter
  // chip list and any subsequent re-save naturally cleans the field.
  const chips = selectedIds
    .map(id => byId.get(id))
    .filter((t): t is TeaOption => Boolean(t));

  const remainingTeas = allTeas.filter(t => !selectedIds.includes(t.id));
  const atCap = selectedIds.length >= MAX;

  function handleAdd(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    e.target.value = ''; // reset the select so the same option can be re-picked after removal
    if (!id || atCap) return;
    if (selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
  }

  function handleRemove(id: string) {
    onChange(selectedIds.filter(x => x !== id));
  }

  return (
    <div className="cga-row-line cga-row-line-wrap">
      <label
        htmlFor={`paired-${itemId}`}
        className="cga-row-line-label"
      >
        Pairs with
      </label>
      <div className="cga-paired-chips">
        {chips.length === 0 && (
          <span className="cga-paired-empty">
            No teas paired yet — customers see the default featured grid.
          </span>
        )}
        {chips.map(tea => (
          <span key={tea.id} className="cga-paired-chip">
            <span className="cga-paired-chip-name">{tea.name}</span>
            <button
              type="button"
              onClick={() => handleRemove(tea.id)}
              aria-label={`Remove ${tea.name} from this pairing`}
              className="cga-paired-chip-x"
            >
              <X size={11} aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <select
        id={`paired-${itemId}`}
        onChange={handleAdd}
        disabled={atCap || remainingTeas.length === 0}
        aria-label="Add a tea to this pairing"
        className="cga-paired-select"
        defaultValue=""
      >
        <option value="" disabled>
          {atCap
            ? `Max ${MAX} reached`
            : remainingTeas.length === 0
              ? 'Loading teas…'
              : '+ Add tea'}
        </option>
        {remainingTeas.map(tea => (
          <option key={tea.id} value={tea.id}>
            {tea.name}{tea.category ? ` — ${tea.category}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Style helpers ───────────────────────────────────────────────────────────
// Phase 3: previously these were inline-style factories. Migrated to
// `cga-*` CSS classes in design.css. The helper functions remain here
// only as thin wrappers returning the right class name + data-attr
// combo so the JSX call sites read the same as before.

function inputClass(_kind: 'title' | 'description' | 'price' | 'slug'): string {
  return 'cga-field';
}
