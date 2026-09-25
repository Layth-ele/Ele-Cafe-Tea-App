/**
 * coolerLog.ts — pure helpers for the equipment log (Vancouver Coastal
 * Health checks). No Firebase imports, so the rules for what's due, what
 * passes and the inspector export are unit-tested
 * (tests/unit/inventory/coolerLog.test.ts).
 *
 * Equipment (/inventory_coolers) is one of two kinds:
 *   cooler      — AM + PM temperature check; pass at 40°F or below
 *   dishwasher  — one check a day (DAY): final-rinse temperature of at
 *                 least 180°F AND the sanitizer checked
 *
 * Entries (/cooler_temp_logs) are append-only (see firestore.rules): an
 * original reading's id is `{date}_{equipmentId}_{AM|PM|DAY}`; a
 * correction is a separate entry with `correctsId` pointing at it.
 */

/** Coolers: above this (°F) is out of range. */
export const COOLER_MAX_F = 40;
/** High-temperature dishwasher: final rinse must reach at least this (°F) — 82°C. */
export const DISHWASHER_MIN_F = 180;
/** The PM cooler check is "due" from this Vancouver hour; before it only AM is expected. */
export const PM_DUE_HOUR = 12;

export type EquipmentKind = 'cooler' | 'dishwasher';
export type CoolerPeriod = 'AM' | 'PM' | 'DAY';

export interface Cooler {
  id:        string;
  name:      string;
  kind:      EquipmentKind;
  isActive:  boolean;
  sortOrder: number;
}

export interface CoolerLogEntry {
  id:           string;
  kind:         'reading' | 'correction';
  coolerId:     string;
  coolerName:   string;
  /** Vancouver calendar day, YYYY-MM-DD. */
  date:         string;
  period:       CoolerPeriod;
  tempF:        number;
  /** Dishwasher only: the sanitizer was checked. */
  sanitizerOk?: boolean;
  outOfRange:   boolean;
  note?:        string;
  loggedBy:     string;
  createdAt:    Date;
  correctsId?:  string;
}

const TZ = 'America/Vancouver';

/** Vancouver calendar day for an instant, as YYYY-MM-DD. */
export function vancouverDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Vancouver hour of day (0–23). */
export function vancouverHour(d: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(d);
  return Number(h) % 24;
}

/** The cooler check an employee is most likely logging right now. */
export function currentPeriod(d: Date = new Date()): 'AM' | 'PM' {
  return vancouverHour(d) < PM_DUE_HOUR ? 'AM' : 'PM';
}

export function periodsFor(kind: EquipmentKind): CoolerPeriod[] {
  return kind === 'dishwasher' ? ['DAY'] : ['AM', 'PM'];
}

/** Does this reading fail the check (needs a corrective-action note)? */
export function isOutOfRange(kind: EquipmentKind, tempF: number, sanitizerOk?: boolean): boolean {
  return kind === 'dishwasher' ? tempF < DISHWASHER_MIN_F || sanitizerOk !== true : tempF > COOLER_MAX_F;
}

export function readingId(date: string, coolerId: string, period: CoolerPeriod): string {
  return `${date}_${coolerId}_${period}`;
}

/** Latest value for each slot: the newest correction wins over the original. */
export function effectiveEntries(entries: readonly CoolerLogEntry[]): Map<string, CoolerLogEntry> {
  const out = new Map<string, CoolerLogEntry>();
  const sorted = [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const e of sorted) out.set(readingId(e.date, e.coolerId, e.period), e);
  return out;
}

export interface SlotStatus {
  period:  CoolerPeriod;
  entry:   CoolerLogEntry | null;
  /** True when the check is expected by now and has no entry. */
  missing: boolean;
}

export interface EquipmentDay {
  equipment: Cooler;
  slots:     SlotStatus[];
}

/** Every active piece of equipment for `date`, with its checks — logged, missing or not yet due. */
export function todaySlots(
  equipment: readonly Cooler[],
  entries: readonly CoolerLogEntry[],
  date: string,
  hour: number,
): EquipmentDay[] {
  const eff = effectiveEntries(entries.filter((e) => e.date === date));
  return equipment
    .filter((c) => c.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((c) => ({
      equipment: c,
      slots: periodsFor(c.kind).map((period) => {
        const entry = eff.get(readingId(date, c.id, period)) ?? null;
        const due = period !== 'PM' || hour >= PM_DUE_HOUR;
        return { period, entry, missing: !entry && due };
      }),
    }));
}

export function missingCount(days: readonly EquipmentDay[]): number {
  return days.reduce((n, d) => n + d.slots.filter((s) => s.missing).length, 0);
}

/** Every check for the day (AM and PM included) is logged. */
export function allChecksDone(days: readonly EquipmentDay[]): boolean {
  return days.length > 0 && days.every((d) => d.slots.every((s) => s.entry));
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Full audit export — every entry (originals and corrections), oldest first. */
export function coolerLogCsv(entries: readonly CoolerLogEntry[]): string {
  const header = ['Date', 'Check', 'Equipment', 'Temperature (°F)', 'Sanitizer', 'Result', 'Entry type', 'Corrects entry', 'Note / corrective action', 'Logged by', 'Logged at (Vancouver)'];
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.coolerName.localeCompare(b.coolerName) || a.period.localeCompare(b.period) || a.createdAt.getTime() - b.createdAt.getTime())
    .map((e) => [
      e.date, e.period === 'DAY' ? 'Daily' : e.period, e.coolerName, e.tempF,
      e.sanitizerOk === undefined ? '' : e.sanitizerOk ? 'Checked' : 'NOT checked',
      e.outOfRange ? 'FAIL' : 'Pass',
      e.kind === 'correction' ? 'Correction' : 'Reading', e.correctsId ?? '', e.note ?? '', e.loggedBy,
      e.createdAt.toLocaleString('en-CA', { timeZone: TZ }),
    ].map(csvCell).join(','));
  // BOM so Excel opens the °F / accents correctly.
  return '﻿' + [header.map(csvCell).join(','), ...rows].join('\r\n');
}

export interface DailyLogRow {
  date:      string;
  equipment: string;
  kind:      EquipmentKind;
  /** Keyed by period; the corrected value when a correction exists. */
  readings:  Partial<Record<CoolerPeriod, CoolerLogEntry>>;
}

/** One row per equipment per day (for the inspector PDF), newest correction applied. */
export function dailyLogRows(entries: readonly CoolerLogEntry[], equipment: readonly Cooler[]): DailyLogRow[] {
  const kindOf = new Map(equipment.map((c) => [c.id, c.kind]));
  const rows = new Map<string, DailyLogRow>();
  for (const e of effectiveEntries(entries).values()) {
    const key = `${e.date}|${e.coolerId}`;
    const kind = kindOf.get(e.coolerId) ?? (e.period === 'DAY' ? 'dishwasher' : 'cooler');
    const row = rows.get(key) ?? { date: e.date, equipment: e.coolerName, kind, readings: {} };
    row.readings[e.period] = e;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) =>
    a.date.localeCompare(b.date) || Number(a.kind === 'dishwasher') - Number(b.kind === 'dishwasher') || a.equipment.localeCompare(b.equipment));
}
