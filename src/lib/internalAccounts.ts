/**
 * Owner / staff accounts whose browsing is left out of the Visits report
 * (AdminVisitsAnalytics), so it shows real customers only.
 *
 * Any admin account is excluded too (checked via the admin claim); this
 * list adds the owner's personal Google account and the shared staff
 * account. Once one of them signs in, the device is remembered, so the
 * owner browsing signed-out on their own phone isn't counted either.
 */
import { INVENTORY_EMAIL, normalizeEmail } from './inventoryAccount';

export const INTERNAL_EMAILS: readonly string[] = [
  'info@elecafe.ca',
  'layth.ele@gmail.com',
  INVENTORY_EMAIL,
];

export function isInternalEmail(email: string | null | undefined): boolean {
  return INTERNAL_EMAILS.includes(normalizeEmail(email));
}

const INTERNAL_DEVICE_KEY = 'ele:internalDevice';

export function markInternalDevice(): void {
  try {
    localStorage.setItem(INTERNAL_DEVICE_KEY, '1');
  } catch {
    /* storage blocked */
  }
}

export function isInternalDevice(): boolean {
  try {
    return localStorage.getItem(INTERNAL_DEVICE_KEY) === '1';
  } catch {
    return false;
  }
}
