/**
 * InventoryRow.tsx — One tea, one row, with the level slider + weight
 * input + status badge.
 *
 * State model:
 *   - Authoritative state lives in the parent's row data (from
 *     useInventoryList, which subscribes to Firestore).
 *   - This row keeps a LOCAL draft of level/weight that the user is
 *     editing. The draft commits to Firestore on a debounced delay
 *     (500ms after last change) — gives the user time to drag the
 *     slider through multiple values without spamming writes.
 *   - When a write succeeds, the snapshot listener in useInventoryList
 *     fires and reconciles. We don't need to manually sync.
 *   - When a write fails, we revert the draft to the authoritative
 *     value and surface an inline error.
 *
 * Status (in_stock / low_stock / out_of_stock) is derived from the
 * draft level via the shared helper so the badge updates instantly as
 * the slider moves — no waiting for the server round-trip to see the
 * status change.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type InventoryRow as InventoryRowData,
} from '@/features/inventory/hooks/useInventoryList';
import {
  CONTAINER_MAX_GRAMS,
  getInventoryStatus,
  levelFromWeight,
  weightFromLevel,
  type InventoryStatus,
  type UpdateInventoryInput,
} from '@/features/inventory/schemas/inventory.schema';

const DEBOUNCE_MS = 500;

interface InventoryRowProps {
  data:        InventoryRowData;
  /** Who's making the edit. Employee name for the /inventory route,
   *  admin email for /admin/inventory. Server stamps `updatedBy`. */
  updatedBy:   string;
  /** Async writer from useInventoryList. Throws on failure; the row
   *  catches and rolls back. */
  onSave:      (teaId: string, patch: UpdateInventoryInput) => Promise<void>;
  /** When false (employee role), the weight field is editable but the
   *  row stays read-and-write-by-level. We don't currently restrict
   *  weight separately, but the prop is here for future use. */
  readOnly?:   boolean;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function InventoryRow({ data, updatedBy, onSave, readOnly }: InventoryRowProps) {
  // Local drafts — initialized from props, updated by user input.
  const [draftLevel,  setDraftLevel]  = useState<number>(data.level);
  const [draftWeight, setDraftWeight] = useState<string>(
    data.weight !== null ? String(data.weight) : String(weightFromLevel(data.level)),
  );
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMsg,  setErrorMsg]  = useState<string>('');

  // Debounced save. The timer ref lets us cancel a pending save when
  // a newer change arrives (rapid slider drags should only commit
  // once at the end of the drag, not at every step).
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reconcile drafts when authoritative data changes — but ONLY when
  // we're not in the middle of a user edit AND no debounced save is
  // queued. Without the timer check, the following sequence overwrites
  // the user's draft (roadmap G7 repro):
  //   1. User edits → schedules save. Timer fires → save in flight.
  //   2. User edits AGAIN while the save is awaiting.
  //   3. First save succeeds → saveState transitions to 'saved'.
  //   4. Snapshot echoes the OLD value; the previous gate (saving-only)
  //      no longer blocks reconcile → draft is reset to the old value.
  //   5. 500 ms later the second save fires for whichever value we last
  //      have in state — but the user briefly saw their input jump back.
  // Including saveTimerRef closes the window: a pending timer means
  // there's fresh user intent we shouldn't clobber.
  useEffect(() => {
    if (saveState === 'saving' || saveTimerRef.current !== null) return;
    setDraftLevel(data.level);
  }, [data.level, saveState]);

  useEffect(() => {
    if (saveState === 'saving' || saveTimerRef.current !== null) return;
    setDraftWeight(data.weight !== null ? String(data.weight) : String(weightFromLevel(data.level)));
  }, [data.weight, saveState]);

  const flushSave = useCallback(
    async (patch: UpdateInventoryInput) => {
      // Cancel any pending "saved → idle" flash timer from a previous
      // successful save. Without this, the old flash timer can fire
      // while we're mid-save and reset saveState to 'idle', overwriting
      // the 'saving' indicator the user should be seeing.
      if (savedFlashTimerRef.current) {
        clearTimeout(savedFlashTimerRef.current);
        savedFlashTimerRef.current = null;
      }
      setSaveState('saving');
      setErrorMsg('');
      try {
        await onSave(data.teaId, patch);
        setSaveState('saved');
        // Auto-clear the "saved" indicator after 1.5s so the row
        // doesn't permanently show success state for an old edit.
        savedFlashTimerRef.current = setTimeout(() => setSaveState('idle'), 1500);
      } catch (err: unknown) {
        console.error('InventoryRow: save failed', err);
        setSaveState('error');
        setErrorMsg('Save failed. Will retry on next change.');
        // Roll back drafts to the authoritative values — BUT only if
        // there's no newer save already scheduled. If the user has
        // edited again since this save started, their current draft
        // represents fresh intent we shouldn't clobber. saveTimerRef
        // is null both before any save AND after the timer fires (we
        // clear it in scheduleSave's setTimeout callback); a non-null
        // value here means a NEW scheduleSave ran while we were
        // awaiting Firestore. Skip the rollback in that case — the
        // pending save will deliver whichever value the user wants.
        if (saveTimerRef.current === null) {
          setDraftLevel(data.level);
          setDraftWeight(data.weight !== null ? String(data.weight) : String(weightFromLevel(data.level)));
        }
      }
    },
    [data.level, data.weight, data.teaId, onSave],
  );

  const scheduleSave = useCallback(
    (patch: UpdateInventoryInput) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        // Mark the timer as fired so flushSave's catch-branch knows
        // there's no pending newer save (yet). If the user edits again
        // during the await, scheduleSave will assign a new timer here.
        saveTimerRef.current = null;
        void flushSave(patch);
      }, DEBOUNCE_MS);
    },
    [flushSave],
  );

  // Cancel any pending save when the row unmounts.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current)       clearTimeout(saveTimerRef.current);
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
    };
  }, []);

  // Level and weight are one measurement on the container scale:
  // 2000 g = 10/10, 200 g per step (see levelFromWeight). Changing
  // either updates the other, and both are saved together.
  const [weightError, setWeightError] = useState('');

  function handleLevelChange(next: number) {
    const grams = weightFromLevel(next);
    setDraftLevel(next);
    setDraftWeight(String(grams));
    setWeightError('');
    scheduleSave({ level: next, weight: grams, updatedBy });
  }

  function handleWeightChange(rawText: string) {
    // Digits only (whole grams).
    const cleaned = rawText.replace(/[^\d]/g, '');
    setDraftWeight(cleaned);
    if (cleaned === '') { setWeightError(''); return; }
    const grams = Number(cleaned);
    if (grams > CONTAINER_MAX_GRAMS) {
      // Don't save an impossible value — the container holds 2000 g max.
      setWeightError(`Max ${CONTAINER_MAX_GRAMS} g`);
      return;
    }
    setWeightError('');
    const level = levelFromWeight(grams);
    setDraftLevel(level);
    scheduleSave({ level, weight: grams, updatedBy });
  }

  // Leaving the field empty or over the max snaps back to the value
  // that matches the current level.
  function handleWeightBlur() {
    const grams = Number(draftWeight);
    if (draftWeight === '' || !Number.isFinite(grams) || grams > CONTAINER_MAX_GRAMS) {
      setDraftWeight(String(weightFromLevel(draftLevel)));
      setWeightError('');
    }
  }

  // Status reflects the DRAFT level — instant visual feedback as the
  // user moves the slider, even before the server round-trip.
  const draftStatus: InventoryStatus = getInventoryStatus(draftLevel);

  return (
    <tr className="inv-row" data-status={draftStatus} data-saving={saveState === 'saving' ? 'true' : undefined}>
      <td className="inv-cell-name" data-label="Tea">
        <div className="inv-name-wrap">
          {data.image && (
            <img
              src={data.image}
              alt=""
              className="inv-name-thumb"
              loading="lazy"
              decoding="async"
            />
          )}
          <div>
            <div className="inv-name">{data.name}</div>
            {data.category && (
              <div className="inv-cat">{data.category}</div>
            )}
          </div>
        </div>
      </td>

      <td className="inv-cell-level" data-label="Level">
        <div className="inv-level-wrap">
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={draftLevel}
            onChange={(e) => handleLevelChange(Number(e.target.value))}
            disabled={readOnly}
            aria-label={`Level for ${data.name}`}
            className="inv-level-slider"
          />
          <span className="inv-level-num" aria-hidden="true">{draftLevel}</span>
        </div>
      </td>

      <td className="inv-cell-status" data-label="Status">
        <StatusBadge status={draftStatus} />
      </td>

      <td className="inv-cell-weight" data-label="Weight">
        <div className="inv-weight-wrap">
          <input
            type="text"
            inputMode="numeric"
            value={draftWeight}
            onChange={(e) => handleWeightChange(e.target.value)}
            onBlur={handleWeightBlur}
            disabled={readOnly}
            placeholder={String(weightFromLevel(draftLevel))}
            aria-label={`Weight in grams for ${data.name} (0–${CONTAINER_MAX_GRAMS} g)`}
            aria-invalid={weightError ? true : undefined}
            className="inv-weight-input"
          />
          <span className="inv-weight-unit" aria-hidden="true">g</span>
        </div>
        {weightError && <p className="inv-weight-error" role="alert">{weightError}</p>}
      </td>

      <td className="inv-cell-state" data-label="Save state" aria-live="polite">
        {readOnly ? (
          <span className="inv-save inv-save--idle" aria-hidden="true">&nbsp;</span>
        ) : (
          <SaveIndicator state={saveState} errorMsg={errorMsg} />
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: InventoryStatus }) {
  const label =
    status === 'in_stock'     ? 'In stock'     :
    status === 'low_stock'    ? 'Low stock'    :
                                'Out of stock';
  return <span className="inv-status-badge" data-status={status}>{label}</span>;
}

function SaveIndicator({ state, errorMsg }: { state: SaveState; errorMsg: string }) {
  switch (state) {
    case 'saving': return <span className="inv-save inv-save--saving">Saving…</span>;
    case 'saved':  return <span className="inv-save inv-save--saved">Saved ✓</span>;
    case 'error':  return <span className="inv-save inv-save--error" title={errorMsg}>Error</span>;
    case 'idle':
    default:       return <span className="inv-save inv-save--idle" aria-hidden="true">&nbsp;</span>;
  }
}
