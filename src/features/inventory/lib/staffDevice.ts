/**
 * staffDevice.ts — remembers that this device is used for the shared
 * inventory account, so the app can send it straight to /inventory on
 * load — before Firebase Auth has even restored the session — instead of
 * flashing the storefront home page first.
 *
 * Set when inventory@ signs in; cleared when anyone else signs in on the
 * device. Kept through sign-out so the counter iPad stays a staff device
 * (the inventory page then asks for the password). Per-device convenience
 * only — access is still decided by Auth + firestore.rules.
 */
const KEY = 'ele-staff-device';

export function isStaffDevice(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function markStaffDevice(): void {
  try { localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
}
export function clearStaffDevice(): void {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
