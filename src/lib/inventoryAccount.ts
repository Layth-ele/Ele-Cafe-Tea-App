export const INVENTORY_EMAIL = 'inventory@elecafe.ca';

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function isInventoryEmail(value: string | null | undefined): boolean {
  return normalizeEmail(value) === INVENTORY_EMAIL;
}
