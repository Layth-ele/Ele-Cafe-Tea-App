/**
 * AdminEmployees.tsx — Manage inventory employees.
 *
 * For each employee:
 *   - Name + status (active/inactive)
 *   - Rotate code → opens the form modal in 'rotate' mode
 *   - Toggle active → direct write to /employees_access (admin rules)
 *   - Delete       → confirmation prompt, then hard delete
 *
 * Plus a top-right "Add employee" button → form modal in 'create' mode.
 *
 * Auth: this page is reachable only via the /admin nested route, which
 * is wrapped in <ProtectedRoute requireAdmin>. So by the time we
 * render, `currentUser?.token?.role === 'admin'` is guaranteed and we
 * don't need to re-check.
 *
 * Live updates: useEmployees subscribes via onSnapshot, so this page
 * reflects changes from concurrent admin sessions immediately (and
 * the in-page action results show up via that same subscription —
 * we don't need to manually refresh).
 */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SeoHead } from '@/app/components/SeoHead';
import { lockBodyScroll } from '@/lib/bodyScrollLock';
import {
  useEmployees,
  type Employee,
} from '@/features/inventory/hooks/useEmployees';
import {
  setActive,
  deleteEmployee,
} from '@/features/inventory/services/employees.service';
import { EmployeeFormModal } from '@/features/inventory/components/EmployeeFormModal';

import type { EmployeeRole } from '@/features/inventory/schemas/inventory.schema';

import { AdminPageHeader } from '@/app/components/admin/AdminPageHeader';
type ModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'rotate'; name: string; role: EmployeeRole };

function AdminEmployees() {
  const { employees, loading, error } = useEmployees();
  const [modal,       setModal]       = useState<ModalState>({ kind: 'closed' });
  const [confirmId,   setConfirmId]   = useState<string | null>(null);
  const [busyId,      setBusyId]      = useState<string | null>(null);

  // If the target of a pending confirm-delete has vanished from the
  // live list — likely because another admin deleted them first — auto-
  // close the dialog so we never render the confusing "Delete this
  // employee?" fallback. We do NOT toast here: the snapshot already
  // updated the row out of existence, so the local admin's screen
  // accurately shows the new state; a "was already removed" toast
  // would just be noise about a benign race.
  useEffect(() => {
    if (confirmId !== null && !employees.some((e) => e.id === confirmId)) {
      setConfirmId(null);
    }
  }, [employees, confirmId]);

  async function handleToggleActive(emp: Employee) {
    if (busyId) return;
    setBusyId(emp.id);
    try {
      await setActive(emp.id, !emp.active);
      toast.success(`${emp.name} ${emp.active ? 'deactivated' : 'reactivated'}.`);
    } catch (err: unknown) {
      console.error('AdminEmployees: toggle failed', err);
      toast.error(`Could not update ${emp.name}.`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(empId: string) {
    if (busyId) return;
    setBusyId(empId);
    try {
      await deleteEmployee(empId);
      toast.success('Employee deleted.');
      setConfirmId(null);
    } catch (err: unknown) {
      console.error('AdminEmployees: delete failed', err);
      toast.error('Could not delete employee.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <SeoHead title="Employees | Ele Café Admin" description="Manage inventory employee access codes." noIndex />

      <AdminPageHeader
        eyebrow="Inventory access"
        title="Employees"
        description="Each staff member gets a personal 4-digit code for the inventory app. Read-only codes can view but not change stock."
        actions={<button type="button" onClick={() => setModal({ kind: 'create' })} className="btn btn-dark">+ Add employee</button>}
      />

      {error && (
        <div className="emp-error" role="alert">{error}</div>
      )}

      {loading ? (
        <div className="emp-loading" aria-live="polite">Loading employees…</div>
      ) : employees.length === 0 ? (
        <div className="emp-empty">
          <p>No employees yet.</p>
          <p className="emp-empty-sub">
            Add the first one with the button above. They'll be able to sign into
            inventory@elecafe.ca and enter their code to access the inventory page.
          </p>
        </div>
      ) : (
        <div className="emp-list-wrap">
          <table className="emp-list">
            <caption className="sr-only">
              List of inventory employees. Each row shows the name, status, and actions to rotate the code, deactivate, or delete.
            </caption>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} data-active={emp.active ? 'true' : 'false'}>
                  <td className="emp-cell-name" data-label="Employee">
                    <span className="emp-name">{emp.name}</span>
                    <span className="emp-role-badge" data-role={emp.role}>
                      {emp.role === 'readonly' ? 'Read-only' : 'Edit'}
                    </span>
                  </td>
                  <td className="emp-cell-status" data-label="Status">
                    <span className="emp-status-badge" data-active={emp.active ? 'true' : 'false'}>
                      {emp.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="emp-cell-actions" data-label="Actions">
                    {/* All row action buttons disable when ANY row's
                        operation is in flight (busyId !== null). The
                        previous per-row gate (disabled={busyId === emp.id})
                        let users click OTHER rows' buttons mid-op; the
                        handlers' `if (busyId) return` guards then
                        silently no-op'd the click. Visual + behavior
                        now agree: busy = nothing clickable. */}
                    <button
                      type="button"
                      onClick={() => setModal({ kind: 'rotate', name: emp.name, role: emp.role })}
                      disabled={busyId !== null}
                      className="emp-action"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(emp)}
                      disabled={busyId !== null}
                      className="emp-action"
                    >
                      {emp.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(emp.id)}
                      disabled={busyId !== null}
                      className="emp-action emp-action-danger"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal.kind !== 'closed' && (
        <EmployeeFormModal
          mode={modal.kind}
          name={modal.kind === 'rotate' ? modal.name : undefined}
          initialRole={modal.kind === 'rotate' ? modal.role : undefined}
          onClose={() => setModal({ kind: 'closed' })}
          onSaved={() => {
            toast.success(modal.kind === 'create' ? 'Employee added.' : 'Employee updated.');
          }}
        />
      )}

      {confirmId !== null && (
        <ConfirmDelete
          employeeName={employees.find((e) => e.id === confirmId)?.name ?? 'this employee'}
          onCancel={() => setConfirmId(null)}
          onConfirm={() => void handleDelete(confirmId)}
          busy={busyId === confirmId}
        />
      )}
    </div>
  );
}

/** Inline confirmation dialog for hard-delete. Shorter than spinning
 *  up the form modal — just a yes/no with a warning.
 *
 *  Mirrors the EmployeeFormModal conventions:
 *    - body scroll lock while open (mobile rubber-band)
 *    - ESC closes (cancel)
 *    - initial focus on the SAFE default (Cancel, not Delete) — Enter
 *      on a destructive dialog shouldn't delete by accident
 */
function ConfirmDelete({
  employeeName,
  onCancel,
  onConfirm,
  busy,
}: {
  employeeName: string;
  onCancel:    () => void;
  onConfirm:   () => void;
  busy:        boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // Focus the safer button on mount. Enter accidentally pressed during
  // dialog entry should cancel, never delete.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Body scroll lock while open. Uses the ref-counted shared helper —
  // if this dialog ever opens while another modal is mounted (rare,
  // but the patterns shouldn't lie), the outer modal's lock survives.
  useEffect(() => {
    return lockBodyScroll();
  }, []);

  // ESC cancels, unless mid-delete (don't lose the in-flight indicator).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="emp-overlay" role="dialog" aria-modal="true" aria-label="Confirm delete employee">
      <div className="emp-panel">
        <h2 className="emp-title">Delete {employeeName}?</h2>
        <p className="emp-sub">
          This permanently removes their record. Past audit-log entries that
          reference their name stay intact. If you're not sure, deactivate them
          instead — that's reversible.
        </p>

        <div className="emp-actions">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="emp-btn emp-btn-ghost"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="emp-btn emp-btn-danger"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminEmployees;
