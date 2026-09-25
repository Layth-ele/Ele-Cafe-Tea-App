/**
 * ItemFormModal.tsx — Admin modal for creating or editing an inventory
 * item.
 *
 * Modes:
 *   - 'create' → category fixed (passed in), name + image + unit
 *     override + initial quantity + threshold override editable.
 *   - 'edit'   → category locked; name, image, unit override, threshold
 *     override editable. Quantity is editable here too as a bulk-set
 *     convenience (the stepper in the row is for incremental tweaks).
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import { setInventoryItem } from '@/features/inventory/services/inventoryItems.service';
import type {
  InventoryCategory,
} from '@/features/inventory/schemas/inventoryCategory.schema';
import type { InventoryItemRowData } from '@/features/inventory/hooks/useInventoryItems';
import { lockBodyScroll } from '@/lib/bodyScrollLock';

type Mode = 'create' | 'edit';

interface ItemFormModalProps {
  mode:     Mode;
  category: InventoryCategory;
  /** Required for 'edit' mode. */
  item?:    InventoryItemRowData;
  onClose:  () => void;
  onSaved?: () => void;
}

export function ItemFormModal({ mode, category, item, onClose, onSaved }: ItemFormModalProps) {
  const [name, setName] = useState<string>(item?.name ?? '');
  const [image, setImage] = useState<string>(item?.image ?? '');
  const [unit, setUnit] = useState<string>(item?.unit ?? '');
  const [quantity, setQuantity] = useState<string>(item ? String(item.quantity) : '0');
  const [lowThreshold, setLowThreshold] = useState<string>(
    item?.lowThreshold !== null && item?.lowThreshold !== undefined ? String(item.lowThreshold) : ''
  );
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

  const qtyNum = Number(quantity);
  const lowNum = lowThreshold.trim() === '' ? null : Number(lowThreshold);
  const isValid =
    name.trim().length >= 2 &&
    name.trim().length <= 60 &&
    Number.isFinite(qtyNum) &&
    qtyNum >= 0 &&
    (lowNum === null || (Number.isFinite(lowNum) && lowNum >= 0));

  async function handleSubmit() {
    if (!isValid || busy) return;
    setBusy(true);
    setErrorMsg('');
    try {
      await setInventoryItem({
        id:           mode === 'edit' ? item?.id : undefined,
        categoryId:   category.id,
        name:         name.trim(),
        image:        image.trim() ? image.trim() : null,
        unit:         unit.trim() ? unit.trim() : null,
        quantity:     qtyNum,
        lowThreshold: lowNum,
      });
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      console.error('ItemFormModal: save failed', err);
      const errCode = (err as { code?: string } | null)?.code ?? '';
      const message = (err as { message?: string } | null)?.message ?? '';
      const msg =
        errCode.endsWith('permission-denied')   ? 'Admins only.' :
        errCode.endsWith('invalid-argument')    ? (message || 'Some field is invalid.') :
        errCode.endsWith('not-found')           ? 'Category or item not found.' :
        errCode.endsWith('failed-precondition') ? (message || "Can't save right now.") :
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

  const title = mode === 'create'
    ? `Add item to ${category.name}`
    : `Edit ${item?.name ?? 'item'}`;
  const defaultUnitText = category.unit ? ` (default: ${category.unit})` : '';
  const defaultLowText  = category.lowThreshold !== null && category.lowThreshold !== undefined
    ? ` (default: ${category.lowThreshold})`
    : '';

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
            ? `Add a new item to ${category.name}. Quantity and threshold can be tweaked later.`
            : 'Adjust the item details. To remove the item entirely, use Archive.'}
        </p>

        <label className="ifm-field">
          <span className="ifm-label">Name</span>
          <input
            ref={firstFieldRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            maxLength={60}
            autoComplete="off"
            className="ifm-input"
            aria-required="true"
          />
        </label>

        <label className="ifm-field">
          <span className="ifm-label">Image URL <span className="ifm-label-hint">(optional)</span></span>
          <input
            type="url"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            disabled={busy}
            placeholder="https://…"
            autoComplete="off"
            className="ifm-input"
          />
        </label>

        <div className="ifm-row">
          <label className="ifm-field ifm-field--grow">
            <span className="ifm-label">
              Unit override <span className="ifm-label-hint">{defaultUnitText}</span>
            </span>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              disabled={busy}
              maxLength={20}
              autoComplete="off"
              className="ifm-input"
              placeholder={category.unit ?? ''}
            />
            <span className="ifm-help">Leave blank to use the category's default unit.</span>
          </label>
          <label className="ifm-field ifm-field--narrow">
            <span className="ifm-label">Quantity</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={busy}
              className="ifm-input"
              aria-required="true"
            />
          </label>
        </div>

        <label className="ifm-field">
          <span className="ifm-label">
            Low-stock threshold override <span className="ifm-label-hint">{defaultLowText}</span>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={lowThreshold}
            onChange={(e) => setLowThreshold(e.target.value)}
            disabled={busy}
            className="ifm-input"
            placeholder={category.lowThreshold !== null && category.lowThreshold !== undefined ? String(category.lowThreshold) : ''}
          />
          <span className="ifm-help">Leave blank to use the category's default. An item can only set a higher threshold — never lower than the category's.</span>
        </label>

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
            {busy ? 'Saving…' : (mode === 'create' ? 'Add item' : 'Save changes')}
          </button>
        </div>
      </form>
    </div>
  );
}
