/**
 * inventoryNav.ts — category navigation helpers shared by the employee
 * (/inventory/:category) and admin (/admin/inventory/:category) pages.
 */
import type { InventoryStatus } from '@/features/inventory/schemas/inventory.schema';

/** The system cooler-log category (model 'temperature'). */
export const COOLER_CATEGORY_ID = 'cooler-log';
export const TEA_CATEGORY_ID = 'tea';

const LAST_KEY = 'ele-inventory-last-category';

/** Last-opened category on this device (per-viewer convenience only). */
export function readLastCategory(surface: 'staff' | 'admin'): string | null {
  try { return localStorage.getItem(`${LAST_KEY}:${surface}`); } catch { return null; }
}
export function writeLastCategory(surface: 'staff' | 'admin', id: string): void {
  try { localStorage.setItem(`${LAST_KEY}:${surface}`, id); } catch { /* storage unavailable */ }
}

/** Items that need restocking: low or out of stock. */
export function needsRestock(status: InventoryStatus): boolean {
  return status === 'low_stock' || status === 'out_of_stock';
}

/** Per-category count of items needing restock. */
export function lowCountsByCategory(items: ReadonlyArray<{ categoryId: string; status: InventoryStatus }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) if (needsRestock(i.status)) out[i.categoryId] = (out[i.categoryId] ?? 0) + 1;
  return out;
}

/** Pick the category to open: URL → last opened → first. */
export function resolveCategory(ids: readonly string[], urlId: string | undefined, last: string | null): string | null {
  if (urlId && ids.includes(urlId)) return urlId;
  if (last && ids.includes(last)) return last;
  return ids[0] ?? null;
}
