/**
 * InventoryItemRow.tsx — One inventory item, with the +/− stepper
 * for quantity adjustment.
 *
 * State model mirrors InventoryRow (tea slider):
 *   - Authoritative state from useInventoryItems → Firestore.
 *   - Local draft state for the in-flight user edit.
 *   - 500 ms debounced save.
 *   - Reconciler gated by saveState !== 'saving' AND saveTimerRef
 *     === null (the H1 fix pattern from the previous review).
 *
 * readOnly prop disables the +/-/input controls and hides save-state
 * feedback. Admin-only `onEdit` and `onArchive` callbacks add the
 * row-action buttons; pass undefined to hide them.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { InventoryItemRowData } from '@/features/inventory/hooks/useInventoryItems';
import {
  getItemStatus,
  effectiveLowThreshold,
  type UpdateInventoryItemInput,
} from '@/features/inventory/schemas/inventoryItem.schema';
import type { InventoryStatus } from '@/features/inventory/schemas/inventory.schema';

const DEBOUNCE_MS = 500;

interface InventoryItemRowProps {
  data:           InventoryItemRowData;
  /** Default low-stock threshold from the parent category. Used when
   *  the item itself has no override. */
  categoryThreshold: number | null;
  /** Default unit from the parent category. */
  categoryUnit:   string | null;
  updatedBy:      string;
  onSave:         (id: string, patch: UpdateInventoryItemInput) => Promise<void>;
  /** Admin-only — opens the edit modal for this row. */
  onEdit?:        (item: InventoryItemRowData) => void;
  /** Admin-only — archives (soft-deletes) this row. */
  onArchive?:     (item: InventoryItemRowData) => void;
  /** Admin-only — hard-deletes this row from Firestore entirely.
   *  Distinct from archive so the admin makes an explicit choice and
   *  the audit log can record which path was taken. */
  onDelete?:      (item: InventoryItemRowData) => void;
  /** When true, all editable controls disable. */
  readOnly?:      boolean;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function InventoryItemRow({
  data,
  categoryThreshold,
  categoryUnit,
  updatedBy,
  onSave,
  onEdit,
  onArchive,
  onDelete,
  readOnly,
}: InventoryItemRowProps) {
  const [draftQty, setDraftQty] = useState<number>(data.quantity);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const saveTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reconciler — same H1 guard pattern as the tea row.
  useEffect(() => {
    if (saveState === 'saving' || saveTimerRef.current !== null) return;
    setDraftQty(data.quantity);
  }, [data.quantity, saveState]);

  const flushSave = useCallback(
    async (next: number) => {
      if (savedFlashTimerRef.current) {
        clearTimeout(savedFlashTimerRef.current);
        savedFlashTimerRef.current = null;
      }
      setSaveState('saving');
      setErrorMsg('');
      try {
        await onSave(data.id, { quantity: next, updatedBy });
        setSaveState('saved');
        savedFlashTimerRef.current = setTimeout(() => setSaveState('idle'), 1500);
      } catch (err: unknown) {
        console.error('InventoryItemRow: save failed', err);
        setSaveState('error');
        setErrorMsg('Save failed. Will retry on next change.');
        if (saveTimerRef.current === null) {
          setDraftQty(data.quantity);
        }
      }
    },
    [data.id, data.quantity, onSave, updatedBy],
  );

  const scheduleSave = useCallback(
    (next: number) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void flushSave(next);
      }, DEBOUNCE_MS);
    },
    [flushSave],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current)       clearTimeout(saveTimerRef.current);
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
    };
  }, []);

  const effectiveThreshold = effectiveLowThreshold(data.lowThreshold, categoryThreshold);
  const draftStatus: InventoryStatus = getItemStatus(draftQty, effectiveThreshold);
  const effectiveUnit = data.unit ?? categoryUnit ?? '';

  function commit(next: number) {
    const clean = Math.max(0, Number.isFinite(next) ? next : 0);
    setDraftQty(clean);
    scheduleSave(clean);
  }

  return (
    <tr className="iir-row" data-status={draftStatus} data-saving={saveState === 'saving' ? 'true' : undefined}>
      <td className="iir-cell-name" data-label="Item">
        <div className="iir-name-wrap">
          {data.image && (
            <img
              src={data.image}
              alt=""
              className="iir-name-thumb"
              loading="lazy"
              decoding="async"
            />
          )}
          <div>
            <div className="iir-name">{data.name}</div>
            {effectiveUnit && (
              <div className="iir-meta">per {effectiveUnit}</div>
            )}
          </div>
        </div>
      </td>

      <td className="iir-cell-qty" data-label="Quantity">
        <div className="ist-wrap">
          <button
            type="button"
            className="ist-btn"
            onClick={() => commit(draftQty - 1)}
            disabled={readOnly || draftQty <= 0}
            aria-label={`Decrease ${data.name}`}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={draftQty}
            onChange={(e) => commit(Number(e.target.value))}
            disabled={readOnly}
            className="ist-input"
            aria-label={`Quantity for ${data.name}`}
          />
          <button
            type="button"
            className="ist-btn"
            onClick={() => commit(draftQty + 1)}
            disabled={readOnly}
            aria-label={`Increase ${data.name}`}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
          {effectiveUnit && (
            <span className="ist-unit" aria-hidden="true">{effectiveUnit}</span>
          )}
        </div>
      </td>

      <td className="iir-cell-status" data-label="Status">
        <span className="inv-status-badge" data-status={draftStatus}>
          {draftStatus === 'in_stock' ? 'In stock' :
           draftStatus === 'low_stock' ? 'Low stock' :
                                         'Out of stock'}
        </span>
      </td>

      <td className="iir-cell-state" data-label="Save state" aria-live="polite">
        {!readOnly && saveState === 'saving' && <span className="inv-save inv-save--saving">Saving…</span>}
        {!readOnly && saveState === 'saved'  && <span className="inv-save inv-save--saved">Saved ✓</span>}
        {!readOnly && saveState === 'error'  && <span className="inv-save inv-save--error" title={errorMsg}>Error</span>}
        {(readOnly || saveState === 'idle')  && <span className="inv-save inv-save--idle" aria-hidden="true">&nbsp;</span>}
      </td>

      {(onEdit || onArchive || onDelete) && (
        <td className="iir-cell-actions" data-label="Actions">
          <div className="iir-actions">
            {onEdit && (
              <button
                type="button"
                className="iir-action"
                onClick={() => onEdit(data)}
              >
                Edit
              </button>
            )}
            {onArchive && (
              <button
                type="button"
                className="iir-action iir-action--danger"
                onClick={() => onArchive(data)}
                title="Archive — keeps audit log entries readable; reversible"
              >
                Archive
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="iir-action iir-action--danger iir-action--delete"
                onClick={() => onDelete(data)}
                title="Delete permanently — irreversible; audit log entry is preserved"
              >
                Delete
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}
