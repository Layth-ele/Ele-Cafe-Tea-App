/**
 * EmployeeFormModal.tsx — Modal for creating an employee or rotating
 * their access code.
 *
 * Two modes:
 *   - mode='create' — name input + 4-digit code input. The callable
 *                     creates a new doc (or rotates an existing one
 *                     with the same name, since the callable upserts
 *                     by name in a Firestore transaction).
 *   - mode='rotate' — name is shown read-only, only the 4-digit code
 *                     is editable. Calls the same upsert callable;
 *                     existing doc gets a new codeHash.
 *
 * Why combined: both flows hit the same callable with the same shape;
 * splitting them into separate modals would just duplicate the input
 * layout. The differences are cosmetic (title, button label, name
 * editability) and handled inline.
 *
 * Form is dismissable. Validation happens client-side (4-digit code,
 * min-2-char name); the server validates again (defense in depth).
 *
 * Important: the modal does NOT touch employees_access directly. All
 * code-setting goes through the callable so scrypt happens server-side
 * (see employees.service.ts comments).
 */

import React, { useEffect, useRef, useState } from 'react';
import { setAccessCode } from '@/features/inventory/services/employees.service';
import { lockBodyScroll } from '@/lib/bodyScrollLock';
import { RoleSelector } from './RoleSelector';
import type { EmployeeRole } from '@/features/inventory/schemas/inventory.schema';

type Mode = 'create' | 'rotate';

interface EmployeeFormModalProps {
  mode:     Mode;
  /** Required in 'rotate' mode (shown read-only). Ignored in 'create'. */
  name?:    string;
  /** Required in 'rotate' mode: the employee's current role, so the
   *  selector renders pre-selected. Defaults to 'edit' if omitted. */
  initialRole?: EmployeeRole;
  onClose:  () => void;
  /** Fired on a successful save so the parent can show a toast / refresh.
   *  The hook+snapshot will already update the list automatically. */
  onSaved?: () => void;
}

export function EmployeeFormModal({ mode, name, initialRole, onClose, onSaved }: EmployeeFormModalProps) {
  const [nameInput, setNameInput] = useState<string>(name ?? '');
  const [code,      setCode]      = useState<string>('');
  const [role,      setRole]      = useState<EmployeeRole>(initialRole ?? 'edit');
  const [busy,      setBusy]      = useState<boolean>(false);
  const [errorMsg,  setErrorMsg]  = useState<string>('');

  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const overlayRef    = useRef<HTMLDivElement  | null>(null);

  // Focus the first field on mount. In 'rotate' mode the name is read-
  // only so focus jumps to the code input instead.
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  // Lock body scroll while the modal is open. Uses the ref-counted
  // shared helper so stacked modals don't trample each other's locks
  // (the previous "capture prev overflow" trick restored '' from the
  // outermost modal and left an inner one with no scroll lock).
  useEffect(() => {
    return lockBodyScroll();
  }, []);

  // ESC closes — but only when not mid-save, so the user doesn't lose
  // their work to a stray keypress while waiting on the server.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  function onCodeChange(raw: string) {
    // Strip non-digits + cap at 4 chars. Matches the Turn 2 access-code
    // modal's filter logic so admin and employee see the same input
    // constraints.
    setCode(raw.replace(/\D/g, '').slice(0, 4));
  }

  // Validation rules:
  //   create  → name + 4-digit code both required
  //   rotate  → name fixed; code OPTIONAL (admin can change just the
  //             role). When provided, must be 4 digits.
  const codeOk = mode === 'create'
    ? /^\d{4}$/.test(code)
    : (code.length === 0 || /^\d{4}$/.test(code));
  const isValid = nameInput.trim().length >= 2 && codeOk;

  async function handleSubmit() {
    if (!isValid || busy) return;
    setBusy(true);
    setErrorMsg('');
    try {
      await setAccessCode({
        name:       nameInput.trim(),
        accessCode: code.length === 4 ? code : undefined,
        role,
      });
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      console.error('EmployeeFormModal: save failed', err);
      const errCode = (err as { code?: string } | null)?.code ?? '';
      // Map Firebase Functions errors to UI-readable messages. Match
      // the convention from useInventoryAccess (Turn 2).
      const msg =
        errCode.endsWith('permission-denied') ? 'Only admins can do this. Sign in as an admin and retry.'    :
        errCode.endsWith('invalid-argument')  ? 'Name needs to be at least 2 letters, and the code must be 4 digits.' :
                                                'Something went wrong. Please try again.';
      setErrorMsg(msg);
      setBusy(false);
    }
  }

  function onOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    // Click outside the panel closes — but only if not mid-save. If we
    // closed mid-save the user would lose the saving indicator while
    // the call was still in flight.
    if (e.target === overlayRef.current && !busy) onClose();
  }

  function onFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Wrapping the inputs in a <form> + onSubmit gives us free Enter-
    // key submission from any field, which keyboard users expect.
    // preventDefault stops the default GET navigation since we don't
    // want a real form post.
    e.preventDefault();
    void handleSubmit();
  }

  const title  = mode === 'create' ? 'Add employee' : `Edit ${name}`;
  const button = mode === 'create' ? 'Add employee' : 'Save changes';

  return (
    <div
      ref={overlayRef}
      onClick={onOverlayClick}
      className="emp-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <form className="emp-panel" onSubmit={onFormSubmit}>
        <h2 className="emp-title">{title}</h2>

        {mode === 'create' ? (
          <p className="emp-sub">
            They'll use this code to access the inventory page when signed in
            as <code>inventory@elecafe.ca</code>.
          </p>
        ) : (
          <p className="emp-sub">
            Change the role, rotate the code, or both. Leave the code field
            empty to keep the current code.
          </p>
        )}

        <label className="emp-field">
          <span className="emp-label">Name</span>
          <input
            ref={mode === 'create' ? firstFieldRef : null}
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            /* readOnly (not disabled) for rotate mode — keeps the field
               focusable + screen-reader-visible so admins can confirm
               the right employee. `disabled` would gray the field and
               hide it from the tab order, which reads as "broken" for
               an intentional show-and-lock. */
            readOnly={mode === 'rotate'}
            disabled={busy}
            maxLength={50}
            autoComplete="off"
            spellCheck={false}
            className="emp-input"
            aria-required="true"
          />
        </label>

        <label className="emp-field">
          <span className="emp-label">
            {mode === 'rotate' ? 'New 4-digit code' : '4-digit code'}
            {mode === 'rotate' && (
              <span className="ifm-label-hint"> (optional — leave empty to keep current code)</span>
            )}
          </span>
          <input
            ref={mode === 'rotate' ? firstFieldRef : null}
            type="text"
            inputMode="numeric"
            pattern="\d*"
            autoComplete="off"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            disabled={busy}
            maxLength={4}
            placeholder="••••"
            className="emp-input emp-input-code"
            aria-required={mode === 'create'}
          />
        </label>

        <RoleSelector value={role} onChange={setRole} disabled={busy} />

        {errorMsg && (
          <div className="emp-error" role="alert">
            {errorMsg}
          </div>
        )}

        <div className="emp-actions">
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
            {busy ? 'Saving…' : button}
          </button>
        </div>
      </form>
    </div>
  );
}
