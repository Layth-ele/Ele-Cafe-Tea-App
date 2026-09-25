/**
 * inventoryAccessStore.ts — In-memory session for an employee's
 * validated access-code state.
 *
 * Memory-only by design: the 4-digit code is a SECOND factor on top of
 * the shared-account password, so a reload asks for it again. The
 * matching Firebase session (lib/inventorySession.ts) is memory-only
 * too, and firestore.rules enforce it server-side — this store only
 * drives the UI (who is greeted, read-only banner, when to re-prompt).
 *
 *   - survives client-side navigation (Zustand instance is module-scope)
 *   - resets on page reload (memory wiped)
 *   - resets on sign-out and at session expiry (InventorySessionSync)
 */

import { create } from 'zustand';
import type { EmployeeRole } from '@/features/inventory/schemas/inventory.schema';

interface InventoryAccessState {
  /** Name of the validated employee, or null when no session. */
  employeeName: string | null;
  /** Validated employee's role. null mirrors employeeName === null. */
  role:         EmployeeRole | null;
  /** Session expiry (epoch ms), or null when no session. */
  expiresAt:    number | null;

  setSession:   (name: string, role: EmployeeRole, expiresAt: number) => void;
  clear:        () => void;
}

export const useInventoryAccessStore = create<InventoryAccessState>((set) => ({
  employeeName: null,
  role:         null,
  expiresAt:    null,
  setSession:   (name, role, expiresAt) => set({ employeeName: name, role, expiresAt }),
  clear:        () => set({ employeeName: null, role: null, expiresAt: null }),
}));
