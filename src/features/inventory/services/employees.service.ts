/**
 * employees.service.ts — Admin-side wrappers for managing inventory
 * employees.
 *
 * Three operations exposed:
 *   - setAccessCode(name, code)   — create or rotate code
 *   - setActive(empId, active)    — soft enable/disable
 *   - deleteEmployee(empId)       — hard delete
 *
 * Code-setting goes through the existing `setEmployeeAccessCode`
 * callable (Turn 1) because scrypt hashing must happen server-side.
 * The other two are plain Firestore updates because admin Firestore
 * rules permit direct writes on `/employees_access/*` (see Turn 1's
 * `firestore.rules`). Skipping the callable for these saves a cold-
 * start round-trip + a function deploy when we just want to flip a
 * boolean.
 *
 * Soft-disable vs hard-delete:
 *   - `active: false` keeps the doc + hash around so the audit trail
 *     (which references `updatedBy` employee names) still resolves
 *     for past entries. Recommended for "Sarah is on leave" or
 *     "we're not sure if we're keeping this person".
 *   - `delete` removes the record entirely. Use when the employee
 *     has left for good and you want their hash gone (defense if
 *     the hash list ever leaks). Audit-log strings stay intact
 *     because they're just historical name copies — no FK.
 *
 * The admin UI surfaces soft-disable prominently and hides hard-delete
 * behind a confirmation step — undeletable mistakes are worse than
 * a row that lingers as inactive.
 */

import { doc, deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { inventoryDb } from '@/features/inventory/lib/inventorySession';

// Re-export Turn 1's callable wrapper. Single source of truth for the
// callable lives in inventory.service.ts; this module just gathers
// every employee-management op behind one import surface for the
// admin page.
export { setEmployeeAccessCode as setAccessCode } from './inventory.service';

/** Toggle the `active` flag on an existing employee doc. Admin rules
 *  permit direct writes — no callable needed for this state change. */
export async function setActive(empId: string, active: boolean): Promise<void> {
  await updateDoc(doc(inventoryDb(), 'employees_access', empId), {
    active,
    updatedAt: serverTimestamp(),
  });
}

/** Hard-delete an employee. Audit-log entries that referenced this
 *  employee by name are NOT cascaded — they retain the historical
 *  name string, which preserves trail integrity. */
export async function deleteEmployee(empId: string): Promise<void> {
  await deleteDoc(doc(inventoryDb(), 'employees_access', empId));
}
