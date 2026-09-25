/**
 * InventorySessionSync.tsx — App-level effect that ends the inventory
 * access session when it should no longer exist:
 *
 *   1. Firebase Auth signs out on the main app (any page — the guard
 *      isn't mounted outside /inventory, so this lives at app root).
 *   2. The main app is signed in as someone who isn't the inventory
 *      account (e.g. an admin signs in on the counter device).
 *   3. The session reaches its expiry (end of shift). firestore.rules
 *      already reject it by then; clearing here makes the guard show
 *      the code prompt instead of permission errors.
 *
 * Clearing ends both the UI store and the employee's Firebase session
 * (lib/inventorySession.ts). Renders nothing.
 */

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useInventoryAccessStore } from '@/features/inventory/store/inventoryAccessStore';
import { isInventoryEmail } from '@/lib/inventoryAccount';
import { clearStaffDevice, markStaffDevice } from '@/features/inventory/lib/staffDevice';

// Loaded on demand — keeps firebase/auth out of the storefront bundle.
const endInventorySession = () =>
  import('@/features/inventory/lib/inventorySession').then((m) => m.endInventorySession());

export function InventorySessionSync() {
  const { currentUser } = useAuth();
  const expiresAt = useInventoryAccessStore(s => s.expiresAt);
  const clearStore = useInventoryAccessStore(s => s.clear);

  // Remember staff devices (see lib/staffDevice.ts): inventory@ marks the
  // device, any other account un-marks it; signing out keeps the mark.
  useEffect(() => {
    if (!currentUser) return;
    if (isInventoryEmail(currentUser.email)) markStaffDevice();
    else clearStaffDevice();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !isInventoryEmail(currentUser.email)) {
      clearStore();
      void endInventorySession();
    }
  }, [currentUser, clearStore]);

  useEffect(() => {
    if (!expiresAt) return;
    const end = () => { clearStore(); void endInventorySession(); };
    const ms = expiresAt - Date.now();
    if (ms <= 0) { end(); return; }
    const timer = setTimeout(end, Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [expiresAt, clearStore]);

  return null;
}
