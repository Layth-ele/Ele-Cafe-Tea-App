/**
 * useInventoryAccess.ts — Hook for the inventory access-code session.
 *
 * Wraps the Zustand session store + the validateInventoryAccessCode
 * Cloud Function. Maps Firebase HttpsError codes to a discriminated
 * result type so the modal can render the right feedback for each
 * failure mode (mismatch vs. rate-limit vs. unauthenticated etc.)
 * without re-deriving them from raw error strings.
 *
 * v2: validate() returns the validated employee's role alongside
 * their name. commit() takes both and writes the full session.
 */

import { useInventoryAccessStore } from '@/features/inventory/store/inventoryAccessStore';
import type { EmployeeRole } from '@/features/inventory/schemas/inventory.schema';
// The session module (firebase/auth + app-check for the second app) is
// loaded on demand, so it never joins the storefront's first-load bundle.
const loadSession = () => import('@/features/inventory/lib/inventorySession');

/**
 * Result of a validate attempt. Discriminated union — TypeScript narrows
 * `employeeName` correctly inside the `ok: true` branch.
 *
 *   ok: true   — code matched; session can be committed with the
 *                returned employeeName + role
 *   ok: false  — code didn't match (or couldn't be validated); reason
 *                tells the UI what to show
 */
export type ValidateResult =
  | { ok: true;  employeeName: string; role: EmployeeRole; expiresAt: number }
  | { ok: false; reason: 'mismatch' | 'locked' | 'auth' | 'invalid' | 'unknown' | 'session'; detail?: string };

export function useInventoryAccess() {
  const employeeName = useInventoryAccessStore(s => s.employeeName);
  const role         = useInventoryAccessStore(s => s.role);
  const setSession   = useInventoryAccessStore(s => s.setSession);
  const clearStore   = useInventoryAccessStore(s => s.clear);

  /**
   * Run the validate callable and, on a match, sign in to the employee's
   * inventory session. Does NOT touch the store — the caller commits the
   * UI session by calling `commit(name, role, expiresAt)` when ready.
   */
  async function validate(code: string): Promise<ValidateResult> {
    try {
      const { validateInventoryAccessCode } = await import('@/features/inventory/services/inventory.service');
      const result = await validateInventoryAccessCode(code);
      if (result.matched && result.employeeName) {
        if (!result.sessionToken || !result.expiresAt) {
          console.error('useInventoryAccess: matched without a session token');
          return { ok: false, reason: 'session', detail: 'NO_TOKEN' };
        }
        // Sign in to the employee's own inventory session. The rules
        // require it for every inventory read/write.
        // The rules require this session for all inventory access, so a
        // failure is reported (with its code) instead of letting them in.
        try {
          await (await loadSession()).startInventorySession(result.sessionToken);
        } catch (err) {
          const code = (err as { code?: string } | null)?.code ?? 'UNKNOWN';
          console.error('useInventoryAccess: session sign-in failed', err);
          return { ok: false, reason: 'session', detail: code };
        }
        const r: EmployeeRole = result.role === 'readonly' ? 'readonly' : 'edit';
        return { ok: true, employeeName: result.employeeName, role: r, expiresAt: result.expiresAt };
      }
      return { ok: false, reason: 'mismatch' };
    } catch (err: unknown) {
      const errCode = (err as { code?: string } | null)?.code ?? '';
      if (errCode.endsWith('resource-exhausted')) return { ok: false, reason: 'locked' };
      if (errCode.endsWith('unauthenticated'))    return { ok: false, reason: 'auth' };
      if (errCode.endsWith('invalid-argument'))   return { ok: false, reason: 'invalid' };
      console.error('useInventoryAccess: unknown validate failure', err);
      return { ok: false, reason: 'unknown', detail: errCode || (err instanceof Error ? err.name : 'UNKNOWN') };
    }
  }

  return {
    employeeName,
    role,
    isValidated: employeeName !== null,
    isReadOnly:  role === 'readonly',
    validate,
    /** Commit a validated session (name + role) to the store. Triggers
     *  the guard to re-render and unmount any active access modal. */
    commit: setSession,
    /** End the session: UI store and the employee's Firebase session. */
    clear: () => { clearStore(); void loadSession().then((m) => m.endInventorySession()); },
  };
}
