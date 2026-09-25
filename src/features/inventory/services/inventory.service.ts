/**
 * inventory.service.ts — Client-side data layer for the inventory subsystem.
 *
 * Two responsibilities:
 *   1. Firestore CRUD for inventory/{teaId} — read all, read one, update.
 *      Status is *not* sent on writes (server trigger derives it from
 *      level); the schema enforces this via updateInventorySchema.
 *   2. Thin wrappers around the inventory Cloud Functions
 *      (setEmployeeAccessCode, validateInventoryAccessCode).
 *
 * Why callables and not direct Firestore writes for access codes:
 *   - The plaintext 4-digit code must be scrypt-hashed before storage.
 *     Doing that on the client would leak the algorithm and let a
 *     malicious client write arbitrary hashes. The Function is the
 *     only path that can write to employees_access (security rules
 *     enforce admin-only writes; the Function uses Admin SDK).
 *   - Validate-code also runs server-side so the rate-limit bucket
 *     can't be bypassed by faking a different client identity.
 *
 * No UI imports yet — Turn 2 builds the access modal and table on top
 * of this layer.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { getFunctionsLazy } from '@/lib/firebase';
import { inventoryDb } from '@/features/inventory/lib/inventorySession';
import {
  type Inventory,
  type InventoryStatus,
  type UpdateInventoryInput,
  getInventoryStatus,
  updateInventorySchema,
} from '@/features/inventory/schemas/inventory.schema';

/* -------------------------------------------------------------------------- */
/*                          FIRESTORE READ / WRITE                            */
/* -------------------------------------------------------------------------- */

const COL = 'inventory';

/**
 * Firestore docs use Timestamp; the Inventory type uses Date. This
 * keeps the rest of the app working in Date and contains the
 * conversion to one place.
 */
function fromDoc(id: string, raw: Record<string, unknown>): Inventory {
  return {
    teaId:     id,
    level:     Number(raw.level ?? 0),
    status:    (raw.status as InventoryStatus | undefined) ?? getInventoryStatus(Number(raw.level ?? 0)),
    weight:    raw.weight === null || raw.weight === undefined
                 ? null
                 : Number(raw.weight),
    updatedBy: String(raw.updatedBy ?? ''),
    updatedAt: raw.updatedAt instanceof Timestamp
                 ? raw.updatedAt.toDate()
                 : (raw.updatedAt as Date | undefined) ?? new Date(0),
  };
}

/** Fetch every inventory doc. Use for the admin/employee dashboard. */
export async function getAllInventory(): Promise<Inventory[]> {
  const snap = await getDocs(collection(inventoryDb(), COL));
  return snap.docs.map((d) => fromDoc(d.id, d.data()));
}

/**
 * Fetch a filtered slice by status. Used by admin filters
 * ("Low stock", "Out of stock"). Requires the
 * inventory[status,updatedAt] composite index — see firestore.indexes.json.
 */
export async function getInventoryByStatus(status: InventoryStatus): Promise<Inventory[]> {
  const q = query(
    collection(inventoryDb(), COL),
    where('status', '==', status),
    orderBy('updatedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromDoc(d.id, d.data()));
}

/** Fetch one record. Returns null if the tea has no inventory doc yet
 *  (the onTeaCreate trigger should prevent this in practice). */
export async function getInventoryByTeaId(teaId: string): Promise<Inventory | null> {
  const snap = await getDoc(doc(inventoryDb(), COL, teaId));
  if (!snap.exists()) return null;
  return fromDoc(snap.id, snap.data());
}

/**
 * Apply a level/weight update. The client only sends the safe field set
 * (updateInventorySchema enforces this); the server trigger derives
 * `status` from `level` and writes it back, and also creates the audit
 * log entry. We do NOT compute status client-side beyond the optimistic
 * UI hint — the canonical write happens in onInventoryWrite.
 */
export async function updateInventory(
  teaId: string,
  patch: UpdateInventoryInput,
): Promise<void> {
  // Parse-then-write. Throws if the client passed an out-of-range level
  // or a malformed weight. We want errors to surface here, not silently
  // round-trip to the server.
  const parsed = updateInventorySchema.parse(patch);

  await updateDoc(doc(inventoryDb(), COL, teaId), {
    ...(parsed.level   !== undefined ? { level:  parsed.level  } : {}),
    ...(parsed.weight  !== undefined ? { weight: parsed.weight } : {}),
    updatedBy: parsed.updatedBy,
    updatedAt: serverTimestamp(),
  });
}

/* -------------------------------------------------------------------------- */
/*                      ACCESS-CODE CALLABLE WRAPPERS                         */
/* -------------------------------------------------------------------------- */

/**
 * Admin creates or rotates an employee's access code. The 4-digit code
 * is scrypt-hashed inside the Function and never lands in Firestore in
 * plaintext.
 *
 * Throws on:
 *   - permission-denied  (caller not admin)
 *   - invalid-argument   (bad name or code)
 */
export async function setEmployeeAccessCode(args: {
  name: string;
  /** Optional on update (rotate-modal role-only changes). Required
   *  on create — the callable rejects role-without-code creates. */
  accessCode?: string;
  /** Optional. Omit to preserve the existing role on update or
   *  default to 'edit' on create. */
  role?: 'edit' | 'readonly';
}): Promise<{ id: string }> {
  const { functions, httpsCallable } = await getFunctionsLazy();
  const call = httpsCallable<typeof args, { id: string }>(
    functions,
    'setEmployeeAccessCode',
  );
  const result = await call(args);
  return result.data;
}

/**
 * Employee submits the 4-digit code at the access modal. The Function
 * tries scrypt.compare against each active employee, returning the
 * matched name (or matched: false) and bumping a rate-limit bucket on
 * miss.
 *
 * Throws on:
 *   - resource-exhausted  (rate-limit lock)
 *   - invalid-argument    (bad code format)
 */
/** validateInventoryAccessCode response. On a match the server also issues
 *  the per-employee session token (see lib/inventorySession.ts). */
export interface ValidateAccessResponse {
  matched:       boolean;
  employeeName?: string;
  role?:         'edit' | 'readonly';
  sessionToken?: string;
  /** Session expiry, epoch ms. */
  expiresAt?:    number;
}

export async function validateInventoryAccessCode(
  accessCode: string,
): Promise<ValidateAccessResponse> {
  const { functions, httpsCallable } = await getFunctionsLazy();
  const call = httpsCallable<
    { accessCode: string },
    ValidateAccessResponse
  >(
    functions,
    'validateInventoryAccessCode',
  );
  const result = await call({ accessCode });
  return result.data;
}
