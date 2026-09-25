/**
 * inventory.schema.ts — Zod contracts for the inventory subsystem.
 *
 * This module is the single source of truth for the shape of:
 *   - inventory/{teaId}        — internal tea-container level + status
 *   - employees_access/{id}    — hashed access codes per employee
 *   - inventory_logs/{logId}   — audit trail of every level change
 *   - the public-facing slice  — what storefront pages may read
 *
 * Architecture contract:
 *   - `productId` in the spec maps to `teaId` here — the project's
 *     existing collection is /teas/{teaId}, so we match that path.
 *   - `level` (0..10) is set by employees; `status` is *server-derived*
 *     by the onInventoryWrite trigger (see functions/src/inventory.ts).
 *     Clients never write `status` directly. updateInventorySchema
 *     intentionally omits it.
 *   - `updatedAt` is z.date() at the boundary; on read from Firestore,
 *     convert Timestamp → Date in the service layer.
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/*                                STATUS ENUM                                 */
/* -------------------------------------------------------------------------- */

export const inventoryStatusSchema = z.enum([
  'in_stock',
  'low_stock',
  'out_of_stock',
]);

export type InventoryStatus = z.infer<typeof inventoryStatusSchema>;

/* -------------------------------------------------------------------------- */
/*                            INVENTORY LEVEL RULES                           */
/* -------------------------------------------------------------------------- */

export const teaLevelSchema = z
  .number()
  .int('Tea level must be a whole number')
  .min(0,  'Tea level cannot be below 0')
  .max(10, 'Tea level cannot exceed 10');

/* -------------------------------------------------------------------------- */
/*                        CONTAINER WEIGHT ↔ LEVEL                            */
/* -------------------------------------------------------------------------- */

/** A full tea container holds 2000 g = level 10; each level step is 200 g. */
export const CONTAINER_MAX_GRAMS = 2000;
export const GRAMS_PER_LEVEL = CONTAINER_MAX_GRAMS / 10;

/** Level for a weight in grams. Rounds UP so any tea left (1–200 g)
 *  reads as level 1 (low stock), never 0 (out of stock). */
export const levelFromWeight = (grams: number): number =>
  Math.min(10, Math.max(0, Math.ceil(grams / GRAMS_PER_LEVEL)));

/** Weight in grams represented by a level (slider → weight). */
export const weightFromLevel = (level: number): number =>
  Math.min(10, Math.max(0, Math.round(level))) * GRAMS_PER_LEVEL;

export const teaWeightSchema = z
  .number()
  .min(0, 'Weight cannot be below 0 g')
  .max(CONTAINER_MAX_GRAMS, `Weight cannot exceed ${CONTAINER_MAX_GRAMS} g`);

/* -------------------------------------------------------------------------- */
/*                         AUTO STATUS HELPER FUNCTION                        */
/* -------------------------------------------------------------------------- */

/**
 * Single source of truth for level → status mapping.
 *   4..10 → in_stock
 *   1..3  → low_stock
 *   0     → out_of_stock
 *
 * Used by both the client (optimistic UI) and the server trigger (which
 * does the authoritative write). Keeping it in the schema module means
 * the client preview and the server value can never drift.
 */
export const getInventoryStatus = (level: number): InventoryStatus => {
  if (level >= 4) return 'in_stock';
  if (level >= 1) return 'low_stock';
  return 'out_of_stock';
};

/* -------------------------------------------------------------------------- */
/*                             INVENTORY SCHEMA                               */
/* -------------------------------------------------------------------------- */

/**
 * Authoritative inventory shape — `status` is REQUIRED because every
 * settled doc has it set by the onInventoryWrite trigger. Use this
 * schema for reads where the doc is guaranteed to have been through
 * the trigger at least once (i.e. virtually every read in production).
 *
 * Note: between a client write (level/weight only) and the trigger
 * settling, a doc briefly lacks `status`. For that transient state use
 * `inventoryDocSchema` below, which makes `status` optional.
 */
export const inventorySchema = z.object({
  /** Matches /teas/{teaId} in Firestore — the project's existing
   *  collection name. The roadmap called this productId; renamed to
   *  align with the codebase convention. */
  teaId: z.string().min(1, 'Tea ID is required'),

  level:  teaLevelSchema,
  status: inventoryStatusSchema,

  weight: teaWeightSchema.nullable().optional(),

  updatedBy: z.string().min(1, 'Updated by is required'),
  updatedAt: z.date(),
});

export type Inventory = z.infer<typeof inventorySchema>;

/**
 * Permissive variant — `status` is optional. Use when validating a
 * raw Firestore snapshot that MAY have been read between the client
 * write and the trigger settling. Service-layer `fromDoc` already
 * defensively derives status from level, but having a schema that
 * matches the at-rest contract documents the in-flight reality.
 */
export const inventoryDocSchema = inventorySchema.extend({
  status: inventoryStatusSchema.optional(),
});

export type InventoryDoc = z.infer<typeof inventoryDocSchema>;

/* -------------------------------------------------------------------------- */
/*                        CREATE INVENTORY SCHEMA                             */
/* -------------------------------------------------------------------------- */

export const createInventorySchema = inventorySchema.omit({ updatedAt: true });
export type CreateInventoryInput = z.infer<typeof createInventorySchema>;

/* -------------------------------------------------------------------------- */
/*                        UPDATE INVENTORY SCHEMA                             */
/* -------------------------------------------------------------------------- */

/**
 * What the client is allowed to send when editing an inventory record.
 * Note the deliberate omissions:
 *   - `status` is computed server-side from `level`. If a client tried
 *     to send it, the trigger overwrites with the canonical value
 *     anyway; we don't accept it at this boundary so the contract is
 *     unambiguous.
 *   - `updatedAt` is set by the server via serverTimestamp().
 *   - `teaId` is the path segment, not a body field.
 */
export const updateInventorySchema = z.object({
  level:     teaLevelSchema.optional(),
  weight:    teaWeightSchema.nullable().optional(),
  updatedBy: z.string(),
});

export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;

/* -------------------------------------------------------------------------- */
/*                             EMPLOYEE ROLE                                  */
/* -------------------------------------------------------------------------- */

/**
 * Per-employee role.
 *   - 'edit'     can change levels (tea) and quantities (items).
 *   - 'readonly' can view the dashboard but every editable control is
 *                disabled. Role is enforced at the UI layer — see
 *                INVENTORY_V2_ROADMAP.md §2.3 for why hard rule-level
 *                enforcement isn't possible under the shared-account model.
 *
 * Default for legacy docs that lack the field: 'edit' (preserve existing
 * behavior). The Zod schema below uses .default('edit') at the parse layer;
 * direct Firestore reads in hook code fall back via `raw.role ?? 'edit'`.
 */
export const employeeRoleSchema = z.enum(['edit', 'readonly']);
export type EmployeeRole = z.infer<typeof employeeRoleSchema>;

/* -------------------------------------------------------------------------- */
/*                             EMPLOYEE SCHEMA                                */
/* -------------------------------------------------------------------------- */

/**
 * /employees_access/{id} — one record per employee. The hash is
 * computed server-side with Node's built-in crypto.scrypt; clients
 * never see the plaintext after submission. See functions/src/inventory.ts
 * `setEmployeeAccessCode` for the write path.
 */
export const employeeSchema = z.object({
  id:        z.string(),
  name:      z.string().min(2, 'Employee name is required'),

  /** scrypt hash + salt, encoded as `${saltHex}:${derivedKeyHex}`. */
  codeHash:  z.string(),
  active:    z.boolean(),
  /** Edit vs read-only. Legacy docs lacking this field read as 'edit'. */
  role:      employeeRoleSchema.default('edit'),

  createdAt: z.date(),
  updatedAt: z.date().optional(),
});

export type Employee = z.infer<typeof employeeSchema>;

/* -------------------------------------------------------------------------- */
/*                        CREATE EMPLOYEE SCHEMA                              */
/* -------------------------------------------------------------------------- */

export const createEmployeeSchema = z.object({
  name:       z.string().min(2, 'Employee name is required'),
  /** Plaintext 4 digits — only crosses the wire to the Cloud Function,
   *  never lands in Firestore. The function scrypts and discards. */
  accessCode: z.string().regex(/^\d{4}$/, 'Access code must be 4 digits'),
  /** Optional. When creating: defaults to 'edit'. When rotating an
   *  existing employee: omitting preserves their current role. */
  role:       employeeRoleSchema.optional(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

/* -------------------------------------------------------------------------- */
/*                         ACCESS CODE VALIDATION                             */
/* -------------------------------------------------------------------------- */

export const accessCodeSchema = z.object({
  accessCode: z.string().regex(/^\d{4}$/, 'Access code must be exactly 4 digits'),
});

export type AccessCodeInput = z.infer<typeof accessCodeSchema>;

/* -------------------------------------------------------------------------- */
/*                           PUBLIC PRODUCT SCHEMA                            */
/* -------------------------------------------------------------------------- */

/**
 * The slice of inventory data the storefront is allowed to see. Mirrored
 * onto /teas/{teaId} by the onInventoryWrite trigger so public pages
 * read from one place (the existing tea doc) without ever touching the
 * private inventory collection.
 *
 *   available         — boolean, derived (true unless status === 'out_of_stock')
 *   availabilityLabel — same three-state enum, for the UI badge
 *
 * The raw `level`, `weight`, `updatedBy`, and `updatedAt` fields are
 * NEVER projected here. SEO and storefront responses see only this.
 */
export const publicAvailabilitySchema = z.enum([
  'in_stock',
  'low_stock',
  'out_of_stock',
]);

export const publicProductSchema = z.object({
  available:         z.boolean(),
  availabilityLabel: publicAvailabilitySchema,
});

export type PublicProductInventory = z.infer<typeof publicProductSchema>;

/* -------------------------------------------------------------------------- */
/*                           INVENTORY LOG SCHEMA                             */
/* -------------------------------------------------------------------------- */

/**
 * Discriminates "tea level change" from "non-tea item quantity change"
 * audit rows. Defaults to 'tea' at parse time so existing rows continue
 * to render correctly without backfill.
 */
export const inventoryLogKindSchema = z.enum(['tea', 'item']);
export type InventoryLogKind = z.infer<typeof inventoryLogKindSchema>;

/**
 * Audit trail. The onInventoryWrite trigger writes one of these per
 * level change for teas; the onInventoryItemWrite trigger writes one
 * per quantity change for items. Read by admins only (see
 * firestore.rules). Useful for:
 *   - "who emptied the matcha container yesterday"
 *   - "how often do we refill whole milk"
 *   - supplier-order reconciliation
 *   - future analytics on refill cadence
 */
export const inventoryLogSchema = z.object({
  /** Tea (level) vs item (quantity). Read-default 'tea' for legacy rows. */
  kind:           inventoryLogKindSchema.default('tea'),

  /** Generalized identifier of the changed thing. For tea: matches
   *  /teas/{id}. For item: matches /inventory_items/{id}. New writes
   *  populate this in addition to the legacy `teaId`. */
  targetId:       z.string().optional(),

  /** Legacy: kept for backward compat with rows written before v2.
   *  On NEW tea writes we mirror targetId into teaId so the viewer's
   *  existing teaName resolver keeps working. */
  teaId:          z.string(),

  /** For item logs only: parent category id (matches
   *  /inventory_categories/{id}). Null/undefined on tea logs. */
  categoryId:     z.string().nullable().optional(),

  employeeName:   z.string(),

  /** Generalized "before / after". For tea: 0-10 level. For item:
   *  non-negative quantity. New writes populate both these and the
   *  legacy previousLevel/newLevel fields for one release cycle. */
  previousValue:  z.number().optional(),
  newValue:       z.number().optional(),

  /** Legacy fields. Always present on tea-kind rows (new + old);
   *  absent on new item-kind rows (use previousValue/newValue there). */
  previousLevel:  z.number().optional(),
  newLevel:       z.number().optional(),

  previousStatus: inventoryStatusSchema,
  newStatus:      inventoryStatusSchema,

  updatedAt:      z.date(),
});

export type InventoryLog = z.infer<typeof inventoryLogSchema>;
