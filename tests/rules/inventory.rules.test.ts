/**
 * Firestore rules — inventory access and the cooler temperature log.
 *
 * Access model: the shared inventory@ password + a 4-digit code. The code
 * check issues a per-employee session (custom-token claims inv/invEmp/
 * invRole/invExp); these tests pin that the RULES — not just the UI —
 * require that session, honour the read-only role, stamp the real
 * employee name, and keep the cooler log append-only.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

let env: RulesTestEnvironment;

const HOUR = 3_600_000;
const employee = (name: string, role: 'edit' | 'readonly' = 'edit', exp = Date.now() + 8 * HOUR) =>
  env.authenticatedContext(`inv-${name.toLowerCase()}`, { inv: true, invEmp: name, invEmpId: name.toLowerCase(), invRole: role, invExp: exp }).firestore();
const sharedAccount = () => env.authenticatedContext('shared', { email: 'inventory@elecafe.ca' }).firestore();
const admin = () => env.authenticatedContext('admin', { role: 'admin', email: 'owner@elecafe.ca' }).firestore();
const customer = () => env.authenticatedContext('cust', { email: 'someone@gmail.com' }).firestore();

/** Vancouver-agnostic "today" as the rules see it (UTC). */
const today = () => new Date().toISOString().slice(0, 10);
const reading = (over: Record<string, unknown> = {}) => ({
  kind: 'reading', coolerId: 'cooler-1', coolerName: 'Cooler 1', date: today(), period: 'AM',
  tempF: 37, outOfRange: false, loggedBy: 'Heejin', loggedByUid: 'inv-heejin', createdAt: serverTimestamp(), ...over,
});
const readingId = (period = 'AM', date = today()) => `${date}_cooler-1_${period}`;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ele-cafe',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'inventory/assam'), { level: 8, weight: 1600, status: 'in_stock', updatedBy: 'x', updatedAt: Timestamp.now() });
    await setDoc(doc(db, 'inventory_items/tart-1'), { categoryId: 'vegan-tarts', name: 'Mango', quantity: 4, status: 'in_stock', isActive: true, updatedBy: 'x', updatedAt: Timestamp.now() });
    await setDoc(doc(db, 'inventory_categories/vegan-tarts'), { name: 'Vegan Tarts', model: 'quantity', lowThreshold: 3 });
    await setDoc(doc(db, 'inventory_coolers/cooler-1'), { name: 'Cooler 1', isActive: true, sortOrder: 1 });
    await setDoc(doc(db, 'inventory_coolers/dishwasher'), { name: 'High-temp dishwasher', kind: 'dishwasher', isActive: true, sortOrder: 9 });
  });
});

describe('inventory access', () => {
  test('employee with a live session reads inventory', async () => {
    await assertSucceeds(getDoc(doc(employee('Heejin'), 'inventory/assam')));
    await assertSucceeds(getDoc(doc(employee('Leia', 'readonly'), 'inventory_items/tart-1')));
  });

  test('shared account alone (no code) can neither read nor write — the code is enforced by rules', async () => {
    await assertFails(getDoc(doc(sharedAccount(), 'inventory/assam')));
    await assertFails(getDoc(doc(sharedAccount(), 'inventory_items/tart-1')));
    await assertFails(updateDoc(doc(sharedAccount(), 'inventory_items/tart-1'), { quantity: 3, updatedBy: 'Heejin', updatedAt: serverTimestamp() }));
    await assertFails(getDoc(doc(sharedAccount(), 'cooler_temp_logs/x')));
    await assertFails(getDoc(doc(sharedAccount(), 'inventory_coolers/cooler-1')));
    await assertFails(setDoc(doc(sharedAccount(), 'cooler_temp_logs', readingId()), reading({ loggedByUid: 'shared' })));
  });

  test('expired session and customers are denied', async () => {
    await assertFails(getDoc(doc(employee('Heejin', 'edit', Date.now() - 1000), 'inventory/assam')));
    await assertFails(getDoc(doc(customer(), 'inventory/assam')));
  });

  test('editor updates stock only as themselves', async () => {
    const db = employee('Heejin');
    await assertSucceeds(updateDoc(doc(db, 'inventory_items/tart-1'), { quantity: 2, updatedBy: 'Heejin', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'inventory_items/tart-1'), { quantity: 1, updatedBy: 'Parsa', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, 'inventory/assam'), { level: 6, updatedBy: 'Heejin', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'inventory/assam'), { level: 6, status: 'low_stock', updatedBy: 'Heejin' }));
  });

  test('read-only role cannot write', async () => {
    const db = employee('Leia', 'readonly');
    await assertFails(updateDoc(doc(db, 'inventory_items/tart-1'), { quantity: 2, updatedBy: 'Leia', updatedAt: serverTimestamp() }));
  });

  test('employees cannot manage categories or coolers; admins can', async () => {
    await assertFails(setDoc(doc(employee('Heejin'), 'inventory_categories/x'), { name: 'X' }));
    await assertFails(setDoc(doc(employee('Heejin'), 'inventory_coolers/cooler-9'), { name: 'Hack' }));
    await assertSucceeds(setDoc(doc(admin(), 'inventory_coolers/cooler-2'), { name: 'Cooler 2', isActive: true, sortOrder: 2 }));
  });
});

describe('cooler temperature log', () => {
  test('editor logs an in-range AM reading', async () => {
    await assertSucceeds(setDoc(doc(employee('Heejin'), 'cooler_temp_logs', readingId()), reading()));
  });

  test('second reading for the same cooler/day/period is refused', async () => {
    const db = employee('Heejin');
    await assertSucceeds(setDoc(doc(db, 'cooler_temp_logs', readingId()), reading()));
    await assertFails(setDoc(doc(db, 'cooler_temp_logs', readingId()), reading({ tempF: 36 })));
  });

  test('entries can never be edited or deleted', async () => {
    const db = employee('Heejin');
    await assertSucceeds(setDoc(doc(db, 'cooler_temp_logs', readingId()), reading()));
    await assertFails(updateDoc(doc(db, 'cooler_temp_logs', readingId()), { tempF: 35 }));
    await assertFails(deleteDoc(doc(db, 'cooler_temp_logs', readingId())));
    await assertFails(deleteDoc(doc(admin(), 'cooler_temp_logs', readingId())));
  });

  test('above 40°F requires the out-of-range flag and a corrective-action note', async () => {
    const db = employee('Heejin');
    await assertFails(setDoc(doc(db, 'cooler_temp_logs', readingId()), reading({ tempF: 43, outOfRange: true })));
    await assertFails(setDoc(doc(db, 'cooler_temp_logs', readingId()), reading({ tempF: 43, outOfRange: false, note: 'Moved stock to cooler 2' })));
    await assertSucceeds(setDoc(doc(db, 'cooler_temp_logs', readingId()), reading({ tempF: 43, outOfRange: true, note: 'Moved stock to cooler 2' })));
  });

  test('cannot log as someone else, as read-only, or backdate', async () => {
    await assertFails(setDoc(doc(employee('Heejin'), 'cooler_temp_logs', readingId()), reading({ loggedBy: 'Parsa' })));
    await assertFails(setDoc(doc(employee('Leia', 'readonly'), 'cooler_temp_logs', readingId()), reading({ loggedBy: 'Leia', loggedByUid: 'inv-leia' })));
    const old = '2026-01-01';
    await assertFails(setDoc(doc(employee('Heejin'), 'cooler_temp_logs', readingId('AM', old)), reading({ date: old })));
  });

  test('ID must match the slot, cooler must exist', async () => {
    await assertFails(setDoc(doc(employee('Heejin'), 'cooler_temp_logs', readingId('PM')), reading({ period: 'AM' })));
    await assertFails(setDoc(doc(employee('Heejin'), 'cooler_temp_logs', `${today()}_cooler-9_AM`), reading({ coolerId: 'cooler-9' })));
  });

  test('corrections are new entries linked to the original, with a note', async () => {
    const db = employee('Heejin');
    await assertSucceeds(setDoc(doc(db, 'cooler_temp_logs', readingId()), reading({ tempF: 34 })));
    const fix = { ...reading({ tempF: 37 }), kind: 'correction', correctsId: readingId() };
    await assertFails(setDoc(doc(db, 'cooler_temp_logs', 'corr-1'), fix));
    await assertSucceeds(setDoc(doc(db, 'cooler_temp_logs', 'corr-2'), { ...fix, note: 'Typo: thermometer read 37' }));
    await assertFails(setDoc(doc(db, 'cooler_temp_logs', 'corr-3'), { ...fix, note: 'Wrong slot', period: 'PM' }));
  });

  test('dishwasher: one daily check, passes at 180°F+ with sanitizer checked', async () => {
    const db = employee('Heejin');
    const dish = (over: Record<string, unknown> = {}) => reading({ coolerId: 'dishwasher', coolerName: 'High-temp dishwasher', period: 'DAY', tempF: 182, sanitizerOk: true, outOfRange: false, ...over });
    const id = `${today()}_dishwasher_DAY`;
    // cooler-style AM check and missing sanitizer field are refused
    await assertFails(setDoc(doc(db, 'cooler_temp_logs', `${today()}_dishwasher_AM`), dish({ period: 'AM' })));
    const { sanitizerOk: _omit, ...noSanitizer } = dish();
    void _omit;
    await assertFails(setDoc(doc(db, 'cooler_temp_logs', id), noSanitizer));
    // fail result must be flagged and explained
    await assertFails(setDoc(doc(db, 'cooler_temp_logs', id), dish({ tempF: 170 })));
    await assertFails(setDoc(doc(db, 'cooler_temp_logs', id), dish({ sanitizerOk: false, outOfRange: true })));
    await assertSucceeds(setDoc(doc(db, 'cooler_temp_logs', id), dish()));
    // once a day only
    await assertFails(setDoc(doc(db, 'cooler_temp_logs', id), dish({ tempF: 185 })));
  });

  test('dishwasher failure with a corrective note is accepted', async () => {
    await assertSucceeds(setDoc(doc(employee('Heejin'), 'cooler_temp_logs', `${today()}_dishwasher_DAY`),
      reading({ coolerId: 'dishwasher', coolerName: 'High-temp dishwasher', period: 'DAY', tempF: 184, sanitizerOk: false, outOfRange: true, note: 'Refilled sanitizer, re-ran cycle' })));
  });

  test('coolers cannot log a daily check or a sanitizer field', async () => {
    await assertFails(setDoc(doc(employee('Heejin'), 'cooler_temp_logs', `${today()}_cooler-1_DAY`), reading({ period: 'DAY' })));
    await assertFails(setDoc(doc(employee('Heejin'), 'cooler_temp_logs', readingId()), reading({ sanitizerOk: true })));
  });

  test('admin can log as themselves', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'cooler_temp_logs', readingId('PM')),
      reading({ period: 'PM', loggedBy: 'owner@elecafe.ca', loggedByUid: 'admin' })));
  });

  test('sanity: helper date format', () => {
    expect(readingId('AM', '2026-09-24')).toBe('2026-09-24_cooler-1_AM');
  });
});
