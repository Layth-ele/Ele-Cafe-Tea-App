/**
 * CategoryFormModal.tsx — Admin modal for creating or editing an
 * inventory category.
 *
 * Two modes:
 *   - mode='create' → all fields editable, slug auto-derived from
 *     name (admin can override before save). Model is editable on
 *     create only (default 'quantity'; tea-model categories are
 *     reserved for the system 'tea').
 *   - mode='edit'   → name + unit + lowThreshold + color editable.
 *     Slug and model are locked (changing slug breaks the doc id;
 *     changing model would orphan existing items).
 *
 * Validation mirrors the server-side callable so the user sees the
 * problem before the round-trip.
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import { setInventoryCategory } from '@/features/inventory/services/inventoryCategories.service';
import {
  type InventoryCategory,
  type InventoryCategoryColor,
  deriveCategorySlug,
} from '@/features/inventory/schemas/inventoryCategory.schema';
import { lockBodyScroll } from '@/lib/bodyScrollLock';

type Mode = 'create' | 'edit';

interface CategoryFormModalProps {
  mode:     Mode;
  /** Required for edit mode — supplies the initial form state. */
  category?: InventoryCategory;
  onClose:  () => void;
  onSaved?: () => void;
}

const COLOR_CHOICES: InventoryCategoryColor[] = [
  'color-1','color-2','color-3','color-4',
  'color-5','color-6','color-7','color-8',
];

const COMMON_UNITS = [
  'bottle', 'bag', 'box', 'can', 'jar',
  'kg', 'g', 'L', 'ml', 'unit',
];

export function CategoryFormModal({ mode, category, onClose, onSaved }: CategoryFormModalProps) {
  const [name, setName] = useState<string>(category?.name ?? '');
  const [slug, setSlug] = useState<string>(category?.id ?? '');
  const [unit, setUnit] = useState<string>(category?.unit ?? 'unit');
  const [lowThreshold, setLowThreshold] = useState<string>(
    category?.lowThreshold !== null && category?.lowThreshold !== undefined ? String(category.lowThreshold) : '3'
  );
  const [color, setColor] = useState<InventoryCategoryColor>(
    (category?.color && category.color !== 'color-tea' ? category.color : 'color-1')
  );
  const [slugDirty, setSlugDirty] = useState<boolean>(mode === 'edit');
  const [busy, setBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const overlayRef    = useRef<HTMLDivElement  | null>(null);
  const labelId       = useId();

  useEffect(() => { firstFieldRef.current?.focus(); }, []);
  useEffect(() => lockBodyScroll(), []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // Auto-derive the slug from the name unless the admin has typed
  // into the slug field manually.
  useEffect(() => {
    if (mode !== 'create' || slugDirty) return;
    setSlug(deriveCategorySlug(name));
  }, [name, slugDirty, mode]);

  const isValid =
    name.trim().length >= 2 &&
    name.trim().length <= 40 &&
    /^[a-z0-9-]+$/.test(slug) &&
    slug.length >= 1 &&
    slug.length <= 40 &&
    slug !== 'tea' &&
    unit.trim().length > 0 &&
    Number(lowThreshold) >= 0;

  async function handleSubmit() {
    if (!isValid || busy) return;
    setBusy(true);
    setErrorMsg('');
    try {
      await setInventoryCategory({
        id:           mode === 'create' ? slug : category?.id,
        name:         name.trim(),
        model:        mode === 'create' ? 'quantity' : undefined,
        unit:         unit.trim() || null,
        lowThreshold: Number(lowThreshold),
        color,
      });
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      console.error('CategoryFormModal: save failed', err);
      const errCode = (err as { code?: string } | null)?.code ?? '';
      const message = (err as { message?: string } | null)?.message ?? '';
      const msg =
        errCode.endsWith('permission-denied') ? 'Admins only.' :
        errCode.endsWith('invalid-argument')  ? (message || 'Some field is invalid.') :
        errCode.endsWith('failed-precondition') ? (message || "That category can't be edited.") :
        'Something went wrong. Please try again.';
      setErrorMsg(msg);
      setBusy(false);
    }
  }

  function onOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current && !busy) onClose();
  }

  function onFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void handleSubmit();
  }

  const title = mode === 'create' ? 'Add inventory category' : `Edit ${category?.name ?? 'category'}`;

  return (
    <div
      ref={overlayRef}
      onClick={onOverlayClick}
      className="ifm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
    >
      <form className="ifm-panel" onSubmit={onFormSubmit}>
        <h2 id={labelId} className="ifm-title">{title}</h2>
        <p className="ifm-sub">
          {mode === 'create'
            ? 'Categories group back-of-house inventory items (milk, beans, syrups, cups, …).'
            : 'Change the display name, unit, threshold, or color. Slug is locked once a category exists.'}
        </p>

        <label className="ifm-field">
          <span className="ifm-label">Name</span>
          <input
            ref={firstFieldRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            className="ifm-input"
            aria-required="true"
          />
        </label>

        <label className="ifm-field">
          <span className="ifm-label">
            Slug
            {mode === 'edit' && <span className="ifm-label-hint"> (locked)</span>}
          </span>
          <input
            type="text"
            value={slug}
            onChange={(e) => { setSlug(deriveCategorySlug(e.target.value)); setSlugDirty(true); }}
            disabled={busy || mode === 'edit'}
            readOnly={mode === 'edit'}
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            className="ifm-input ifm-input-mono"
            aria-required="true"
            pattern="[a-z0-9-]+"
          />
          {mode === 'create' && (
            <span className="ifm-help">
              Used in the URL and in Firestore. Auto-filled from the name; edit only if needed.
            </span>
          )}
        </label>

        <div className="ifm-row">
          <label className="ifm-field ifm-field--grow">
            <span className="ifm-label">Unit</span>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              disabled={busy}
              maxLength={20}
              list="ifm-units"
              autoComplete="off"
              className="ifm-input"
            />
            <datalist id="ifm-units">
              {COMMON_UNITS.map((u) => <option key={u} value={u} />)}
            </datalist>
            <span className="ifm-help">e.g. bottle, bag, kg, L</span>
          </label>

          <label className="ifm-field ifm-field--narrow">
            <span className="ifm-label">Low threshold</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={lowThreshold}
              onChange={(e) => setLowThreshold(e.target.value)}
              disabled={busy}
              className="ifm-input"
            />
            <span className="ifm-help">Items below this read as low stock.</span>
          </label>
        </div>

        <fieldset className="ifm-field">
          <legend className="ifm-label">Color</legend>
          <div className="ifm-color-grid" role="radiogroup" aria-label="Category color">
            {COLOR_CHOICES.map((c) => (
              <label key={c} className="ifm-color-cell">
                <input
                  type="radio"
                  name="ifm-color"
                  value={c}
                  checked={color === c}
                  onChange={() => setColor(c)}
                  disabled={busy}
                  className="ifm-color-radio"
                />
                <span className="ifm-color-swatch" data-color={c} aria-hidden="true" />
                <span className="sr-only">{c}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {errorMsg && (
          <div className="ifm-error" role="alert">{errorMsg}</div>
        )}

        <div className="ifm-actions">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="emp-btn emp-btn-ghost"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid || busy}
            aria-busy={busy}
            className="emp-btn emp-btn-primary"
          >
            {busy ? 'Saving…' : (mode === 'create' ? 'Add category' : 'Save changes')}
          </button>
        </div>
      </form>
    </div>
  );
}
