export const INVENTORY_EMAIL = 'inventory@elecafe.ca';

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function isInventoryEmail(value: string | null | undefined): boolean {
  return normalizeEmail(value) === INVENTORY_EMAIL;
}

/**
 * Per-employee inventory session (issued by validateInventoryAccessCode
 * after the shared-account password + 4-digit code both pass).
 *
 * The function mints a Firebase custom token for uid `inv-{employeeId}`
 * with the claims below; the client signs in with it on a separate,
 * memory-only Firebase app used only for inventory data. firestore.rules
 * require these claims (and an unexpired `invExp`) for every employee
 * read/write, so the code is enforced by the database — not just the UI —
 * and `updatedBy` / `loggedBy` can be checked against `invEmp`.
 */
export const INVENTORY_SESSION_UID_PREFIX = 'inv-';
/** One shift. After this the rules reject the session and the code is asked again. */
export const INVENTORY_SESSION_HOURS = 12;

export interface InventorySessionClaims {
  inv:      true;
  invEmp:   string;
  invEmpId: string;
  invRole:  'edit' | 'readonly';
  /** Expiry, epoch milliseconds. */
  invExp:   number;
}

export function isInventorySessionUid(uid: string | null | undefined): boolean {
  return typeof uid === 'string' && uid.startsWith(INVENTORY_SESSION_UID_PREFIX);
}

/** Category slugs the admin can't create: system tabs + /admin/inventory/logs. */
export const RESERVED_INVENTORY_CATEGORY_IDS = ['tea', 'cooler-log', 'logs', 'uncategorized'] as const;
