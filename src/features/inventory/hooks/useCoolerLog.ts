/**
 * useCoolerLog.ts — live coolers + temperature-log entries, and the
 * write paths (reading, correction, admin cooler management).
 *
 * Entries are append-only (firestore.rules): a reading is written with
 * its slot id `{date}_{coolerId}_{AM|PM}`, so the database refuses a
 * second one; a correction is a new auto-id doc linked by correctsId.
 */
import { useEffect, useState } from 'react';
import {
  addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { inventoryDb } from '@/features/inventory/lib/inventorySession';
import {
  isOutOfRange, missingCount, readingId, todaySlots, vancouverDate, vancouverHour,
  type Cooler, type CoolerLogEntry, type CoolerPeriod, type EquipmentKind,
} from '@/features/inventory/lib/coolerLog';

export function useCoolers(): { coolers: Cooler[]; loading: boolean; error: string | null } {
  const [coolers, setCoolers] = useState<Cooler[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => onSnapshot(
    collection(inventoryDb(), 'inventory_coolers'),
    (snap) => {
      setCoolers(snap.docs.map((d) => {
        const r = d.data();
        return {
          id: d.id, name: String(r.name ?? d.id),
          kind: r.kind === 'dishwasher' ? 'dishwasher' as const : 'cooler' as const,
          isActive: r.isActive !== false, sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : 100,
        };
      }).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setError(null);
    },
    (err) => { console.error('useCoolers:', err); setError('Could not load coolers.'); setCoolers([]); },
  ), []);
  return { coolers: coolers ?? [], loading: coolers === null, error };
}

function toEntry(id: string, r: Record<string, unknown>): CoolerLogEntry {
  return {
    id,
    kind:        r.kind === 'correction' ? 'correction' : 'reading',
    coolerId:    String(r.coolerId ?? ''),
    coolerName:  String(r.coolerName ?? ''),
    date:        String(r.date ?? ''),
    period:      r.period === 'PM' ? 'PM' : r.period === 'DAY' ? 'DAY' : 'AM',
    tempF:       Number(r.tempF ?? 0),
    sanitizerOk: typeof r.sanitizerOk === 'boolean' ? r.sanitizerOk : undefined,
    outOfRange:  r.outOfRange === true,
    note:        typeof r.note === 'string' ? r.note : undefined,
    loggedBy:    String(r.loggedBy ?? ''),
    createdAt:   r.createdAt instanceof Timestamp ? r.createdAt.toDate() : new Date(),
    correctsId:  typeof r.correctsId === 'string' ? r.correctsId : undefined,
  };
}

/** Entries with `from <= date <= to` (YYYY-MM-DD, inclusive), newest day first. */
export function useCoolerLogs(from: string, to: string): { entries: CoolerLogEntry[]; loading: boolean; error: string | null } {
  const [entries, setEntries] = useState<CoolerLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setEntries(null);
    const q = query(
      collection(inventoryDb(), 'cooler_temp_logs'),
      where('date', '>=', from), where('date', '<=', to), orderBy('date', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => { setEntries(snap.docs.map((d) => toEntry(d.id, d.data()))); setError(null); },
      (err) => { console.error('useCoolerLogs:', err); setError('Could not load the temperature log.'); setEntries([]); },
    );
  }, [from, to]);
  return { entries: entries ?? [], loading: entries === null, error };
}

export interface NewReading {
  cooler:      Cooler;
  date:        string;
  period:      CoolerPeriod;
  tempF:       number;
  /** Dishwasher only. */
  sanitizerOk?: boolean;
  note?:       string;
  loggedBy:    string;
  loggedByUid: string;
}

function payload(r: NewReading) {
  const note = r.note?.trim();
  return {
    coolerId:    r.cooler.id,
    coolerName:  r.cooler.name,
    date:        r.date,
    period:      r.period,
    tempF:       r.tempF,
    ...(r.cooler.kind === 'dishwasher' ? { sanitizerOk: r.sanitizerOk === true } : {}),
    outOfRange:  isOutOfRange(r.cooler.kind, r.tempF, r.sanitizerOk),
    ...(note ? { note } : {}),
    loggedBy:    r.loggedBy,
    loggedByUid: r.loggedByUid,
    createdAt:   serverTimestamp(),
  };
}

/** Log the AM/PM reading for a slot. Fails if that slot is already logged. */
export async function logCoolerReading(r: NewReading): Promise<void> {
  await setDoc(doc(inventoryDb(), 'cooler_temp_logs', readingId(r.date, r.cooler.id, r.period)), { kind: 'reading', ...payload(r) });
}

/** Add a correction linked to an existing entry (the original stays untouched). */
export async function logCoolerCorrection(original: CoolerLogEntry, r: NewReading): Promise<void> {
  await addDoc(collection(inventoryDb(), 'cooler_temp_logs'), {
    kind: 'correction',
    ...payload({ ...r, date: original.date, period: original.period }),
    correctsId: original.kind === 'correction' && original.correctsId ? original.correctsId : original.id,
  });
}

/** Admin: add or rename a piece of equipment (kind is set when it's added). */
export async function saveCooler(id: string, name: string, sortOrder: number, kind?: EquipmentKind): Promise<void> {
  await setDoc(doc(inventoryDb(), 'inventory_coolers', id), { name: name.trim(), isActive: true, sortOrder, ...(kind ? { kind } : {}) }, { merge: true });
}

/** Admin: retire a cooler (its history stays). */
export async function setCoolerActive(id: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(inventoryDb(), 'inventory_coolers', id), { isActive });
}

/** Number of cooler checks due today and not yet logged (nav badge). */
export function useCoolerDueCount(enabled: boolean): number {
  const today = vancouverDate();
  const { coolers } = useCoolers();
  const { entries } = useCoolerLogs(today, today);
  if (!enabled) return 0;
  return missingCount(todaySlots(coolers, entries, today, vancouverHour()));
}
