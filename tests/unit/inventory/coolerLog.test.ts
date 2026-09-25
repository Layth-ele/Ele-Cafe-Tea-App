import { describe, test, expect } from 'vitest';
import {
  COOLER_MAX_F, DISHWASHER_MIN_F, allChecksDone, coolerLogCsv, currentPeriod, dailyLogRows, effectiveEntries,
  isOutOfRange, missingCount, readingId, todaySlots, vancouverDate, vancouverHour,
  type Cooler, type CoolerLogEntry,
} from '@/features/inventory/lib/coolerLog';
import { lowCountsByCategory, resolveCategory } from '@/features/inventory/lib/inventoryNav';

const equipment: Cooler[] = [
  { id: 'cooler-2', name: 'Cooler 2', kind: 'cooler', isActive: true, sortOrder: 2 },
  { id: 'cooler-1', name: 'Cooler 1', kind: 'cooler', isActive: true, sortOrder: 1 },
  { id: 'dish', name: 'Dishwasher', kind: 'dishwasher', isActive: true, sortOrder: 3 },
  { id: 'old', name: 'Old', kind: 'cooler', isActive: false, sortOrder: 4 },
];
const entry = (o: Partial<CoolerLogEntry>): CoolerLogEntry => ({
  id: 'x', kind: 'reading', coolerId: 'cooler-1', coolerName: 'Cooler 1', date: '2026-09-24', period: 'AM',
  tempF: 37, outOfRange: false, loggedBy: 'Heejin', createdAt: new Date('2026-09-24T15:00:00Z'), ...o,
});

describe('Vancouver time', () => {
  test('date and hour follow America/Vancouver, not UTC', () => {
    const t = new Date('2026-09-25T03:30:00Z'); // 2026-09-24 20:30 PDT
    expect(vancouverDate(t)).toBe('2026-09-24');
    expect(vancouverHour(t)).toBe(20);
    expect(currentPeriod(t)).toBe('PM');
    expect(currentPeriod(new Date('2026-09-24T16:00:00Z'))).toBe('AM');
  });
});

describe('pass / fail', () => {
  test('coolers fail above 40°F', () => {
    expect(COOLER_MAX_F).toBe(40);
    expect(isOutOfRange('cooler', 40)).toBe(false);
    expect(isOutOfRange('cooler', 40.1)).toBe(true);
  });
  test('dishwasher needs 180°F+ AND sanitizer checked', () => {
    expect(DISHWASHER_MIN_F).toBe(180);
    expect(isOutOfRange('dishwasher', 182, true)).toBe(false);
    expect(isOutOfRange('dishwasher', 179, true)).toBe(true);
    expect(isOutOfRange('dishwasher', 190, false)).toBe(true);
  });
});

describe('todaySlots', () => {
  test('coolers get AM + PM, the dishwasher one daily check; inactive ignored', () => {
    const days = todaySlots(equipment, [], '2026-09-24', 9);
    expect(days.map((d) => `${d.equipment.id}:${d.slots.map((s) => s.period).join('+')}`))
      .toEqual(['cooler-1:AM+PM', 'cooler-2:AM+PM', 'dish:DAY']);
    // before noon: 2 AM checks + the dishwasher are due
    expect(missingCount(days)).toBe(3);
  });

  test('after noon PM is due too; logged checks are not missing', () => {
    const days = todaySlots(equipment, [entry({}), entry({ coolerId: 'cooler-2', date: '2026-09-23' })], '2026-09-24', 15);
    expect(missingCount(days)).toBe(4);
    expect(days[0].slots[0].entry?.tempF).toBe(37);
  });

  test('allChecksDone only when every AM, PM and daily check is logged', () => {
    const all = [
      entry({ coolerId: 'cooler-1', period: 'AM' }), entry({ coolerId: 'cooler-1', period: 'PM' }),
      entry({ coolerId: 'cooler-2', period: 'AM' }),
      entry({ coolerId: 'dish', period: 'DAY', tempF: 182, sanitizerOk: true }),
    ];
    expect(allChecksDone(todaySlots(equipment, all, '2026-09-24', 20))).toBe(false);
    all.push(entry({ coolerId: 'cooler-2', period: 'PM' }));
    expect(allChecksDone(todaySlots(equipment, all, '2026-09-24', 20))).toBe(true);
  });

  test('a correction replaces the original value for its slot', () => {
    const orig = entry({ id: readingId('2026-09-24', 'cooler-1', 'AM'), tempF: 34 });
    const fix = entry({ id: 'c1', kind: 'correction', correctsId: orig.id, tempF: 37, createdAt: new Date('2026-09-24T16:00:00Z') });
    expect(effectiveEntries([fix, orig]).get(orig.id)?.tempF).toBe(37);
  });
});

describe('exports', () => {
  test('CSV has a header, escapes notes, marks FAIL and sanitizer', () => {
    const csv = coolerLogCsv([
      entry({ tempF: 43, outOfRange: true, note: 'Door left open, moved stock, "rechecked"' }),
      entry({ coolerId: 'dish', coolerName: 'Dishwasher', period: 'DAY', tempF: 182, sanitizerOk: true }),
    ]);
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toContain('Temperature (°F)');
    expect(lines.find((l) => l.includes('Cooler 1'))).toContain('FAIL');
    expect(lines.find((l) => l.includes('Cooler 1'))).toContain('"Door left open, moved stock, ""rechecked"""');
    expect(lines.find((l) => l.includes('Dishwasher'))).toContain('Daily');
    expect(lines.find((l) => l.includes('Dishwasher'))).toContain('Checked');
  });

  test('daily PDF rows: one per equipment per day, AM/PM together, corrections applied', () => {
    const rows = dailyLogRows([
      entry({ id: '2026-09-24_cooler-1_AM', period: 'AM', tempF: 34 }),
      entry({ period: 'PM', tempF: 38 }),
      entry({ id: 'c', kind: 'correction', period: 'AM', tempF: 36, createdAt: new Date('2026-09-24T17:00:00Z') }),
      entry({ coolerId: 'dish', coolerName: 'Dishwasher', period: 'DAY', tempF: 182, sanitizerOk: true }),
    ], equipment);
    expect(rows).toHaveLength(2);
    expect(rows[0].equipment).toBe('Cooler 1');
    expect(rows[0].readings.AM?.tempF).toBe(36);
    expect(rows[0].readings.PM?.tempF).toBe(38);
    expect(rows[1].kind).toBe('dishwasher');
  });
});

describe('inventory nav', () => {
  test('low counts include low and out of stock', () => {
    expect(lowCountsByCategory([
      { categoryId: 'pastries', status: 'low_stock' }, { categoryId: 'pastries', status: 'out_of_stock' },
      { categoryId: 'pastries', status: 'in_stock' }, { categoryId: 'milk', status: 'low_stock' },
    ])).toEqual({ pastries: 2, milk: 1 });
  });
  test('URL wins, then last opened, then first', () => {
    expect(resolveCategory(['tea', 'milk'], 'milk', 'tea')).toBe('milk');
    expect(resolveCategory(['tea', 'milk'], 'nope', 'milk')).toBe('milk');
    expect(resolveCategory(['tea', 'milk'], undefined, null)).toBe('tea');
  });
});
