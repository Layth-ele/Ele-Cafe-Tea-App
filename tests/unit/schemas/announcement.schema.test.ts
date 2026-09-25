/**
 * announcement.schema.test.ts — tests for the rotating announcement bar.
 *
 * The date filtering is the part most likely to silently break — a
 * Canada Day announcement that's a day off would either be visible
 * during the wrong week or invisible during the actual day. These
 * tests pin the date semantics explicitly.
 */
import { describe, test, expect } from 'vitest';
import {
  filterActiveAnnouncements,
  migrateLegacyAnnouncementText,
  createEmptyAnnouncement,
  announcementSchema,
  type Announcement,
} from '@/schemas/announcement.schema';

function ann(partial: Partial<Announcement>): Announcement {
  return {
    id:        partial.id ?? 'a1',
    message:   partial.message ?? 'Free shipping on all orders',
    highlight: partial.highlight ?? '',
    enabled:   partial.enabled ?? true,
    startDate: partial.startDate ?? '',
    endDate:   partial.endDate ?? '',
  };
}

/**
 * Construct a Date in LOCAL time at the start of the given calendar day.
 *
 * Why this exists: `new Date('2026-04-27')` parses as UTC midnight,
 * which becomes April 26 in any timezone west of UTC (Vancouver is
 * UTC-7 in summer, UTC-8 in winter). Tests written that way only
 * passed when run in UTC environments — broken everywhere else,
 * including a Vancouver developer's laptop.
 *
 * The filter under test uses `getFullYear()/getMonth()/getDate()`
 * which return LOCAL date components. So the test injection should
 * also use local-time dates. This helper makes intent explicit and
 * the tests timezone-independent.
 */
function localDate(year: number, monthOneBased: number, day: number): Date {
  // Date constructor with numeric args takes month as 0-indexed.
  return new Date(year, monthOneBased - 1, day);
}

describe('filterActiveAnnouncements', () => {
  test('disabled announcements are skipped', () => {
    const list = [
      ann({ id: '1', enabled: true }),
      ann({ id: '2', enabled: false }),
    ];
    const result = filterActiveAnnouncements(list);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('1');
  });

  test('empty messages are skipped (defensive)', () => {
    const list = [
      ann({ id: '1', message: 'Hello' }),
      ann({ id: '2', message: '   ' }),
      ann({ id: '3', message: '' }),
    ];
    const result = filterActiveAnnouncements(list);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('1');
  });

  test('evergreen (no dates) always shows', () => {
    const list = [ann({ id: '1' })];
    const result = filterActiveAnnouncements(list, new Date('2026-04-27'));
    expect(result).toHaveLength(1);
  });

  test('Canada Day campaign — visible on Jul 1', () => {
    const canadaDay = ann({
      id: 'cd', message: 'Canada Day Sale', highlight: 'JUL 1',
      startDate: '2026-06-28', endDate: '2026-07-02',
    });
    const result = filterActiveAnnouncements([canadaDay], new Date('2026-07-01T15:00:00'));
    expect(result).toHaveLength(1);
  });

  test('Canada Day campaign — hidden before Jun 28', () => {
    const canadaDay = ann({
      id: 'cd', startDate: '2026-06-28', endDate: '2026-07-02',
    });
    const result = filterActiveAnnouncements([canadaDay], new Date('2026-06-27T23:00:00'));
    expect(result).toHaveLength(0);
  });

  test('Canada Day campaign — hidden after Jul 2', () => {
    const canadaDay = ann({
      id: 'cd', startDate: '2026-06-28', endDate: '2026-07-02',
    });
    const result = filterActiveAnnouncements([canadaDay], new Date('2026-07-03T08:00:00'));
    expect(result).toHaveLength(0);
  });

  test('Campaign visible on the start date itself', () => {
    const list = [ann({ id: '1', startDate: '2026-04-27' })];
    const result = filterActiveAnnouncements(list, new Date('2026-04-27T00:01:00'));
    expect(result).toHaveLength(1);
  });

  test('Campaign visible on the end date itself', () => {
    const list = [ann({ id: '1', endDate: '2026-04-27' })];
    const result = filterActiveAnnouncements(list, new Date('2026-04-27T23:50:00'));
    expect(result).toHaveLength(1);
  });

  test('Only startDate set — runs from that day forward indefinitely', () => {
    const list = [ann({ id: '1', startDate: '2026-04-27' })];
    expect(filterActiveAnnouncements(list, localDate(2026, 4, 26))).toHaveLength(0);
    expect(filterActiveAnnouncements(list, localDate(2026, 4, 27))).toHaveLength(1);
    expect(filterActiveAnnouncements(list, localDate(2027, 12, 31))).toHaveLength(1);
  });

  test('Only endDate set — runs until that day, no fixed start', () => {
    const list = [ann({ id: '1', endDate: '2026-04-27' })];
    expect(filterActiveAnnouncements(list, localDate(2024, 1, 1))).toHaveLength(1);
    expect(filterActiveAnnouncements(list, localDate(2026, 4, 27))).toHaveLength(1);
    expect(filterActiveAnnouncements(list, localDate(2026, 4, 28))).toHaveLength(0);
  });

  test('Multiple announcements — each filtered independently', () => {
    const list = [
      ann({ id: 'evergreen', message: 'Free shipping' }),
      ann({ id: 'past', startDate: '2025-01-01', endDate: '2025-01-31' }),
      ann({ id: 'future', startDate: '2027-01-01', endDate: '2027-01-31' }),
      ann({ id: 'now', startDate: '2026-04-01', endDate: '2026-04-30' }),
      ann({ id: 'disabled', enabled: false }),
    ];
    const result = filterActiveAnnouncements(list, new Date('2026-04-15'));
    expect(result.map(r => r.id).sort()).toEqual(['evergreen', 'now']);
  });
});

describe('migrateLegacyAnnouncementText', () => {
  test('null/empty input returns null', () => {
    expect(migrateLegacyAnnouncementText(undefined)).toBeNull();
    expect(migrateLegacyAnnouncementText('')).toBeNull();
    expect(migrateLegacyAnnouncementText('   ')).toBeNull();
  });

  test('splits on the same separators the legacy renderer used', () => {
    // Middle dot was the canonical separator.
    const result = migrateLegacyAnnouncementText('Free shipping · Free sample · 10% off');
    expect(result).toHaveLength(3);
    expect(result?.map(r => r.message)).toEqual([
      'Free shipping', 'Free sample', '10% off',
    ]);
  });

  test('em-dash, en-dash, and hyphen all split', () => {
    expect(migrateLegacyAnnouncementText('A — B — C')).toHaveLength(3);
    expect(migrateLegacyAnnouncementText('A – B – C')).toHaveLength(3);
    expect(migrateLegacyAnnouncementText('A - B - C')).toHaveLength(3);
  });

  test('migrated entries are enabled with empty highlights', () => {
    const result = migrateLegacyAnnouncementText('Free shipping');
    expect(result?.[0]!.enabled).toBe(true);
    expect(result?.[0]!.highlight).toBe('');
    expect(result?.[0]!.startDate).toBe('');
    expect(result?.[0]!.endDate).toBe('');
  });

  test('each migrated entry gets a unique id', () => {
    const result = migrateLegacyAnnouncementText('A · B · C');
    const ids = new Set(result?.map(r => r.id));
    expect(ids.size).toBe(3);
  });
});

describe('createEmptyAnnouncement', () => {
  test('returns enabled by default', () => {
    expect(createEmptyAnnouncement().enabled).toBe(true);
  });

  test('returns unique id each call', () => {
    const ids = new Set();
    for (let i = 0; i < 10; i++) ids.add(createEmptyAnnouncement().id);
    expect(ids.size).toBe(10);
  });

  test('passes schema validation', () => {
    const result = announcementSchema.safeParse(createEmptyAnnouncement());
    // The empty default has message: '' — fails the .min(1) check.
    // That's intentional — admin must fill it before save makes sense.
    expect(result.success).toBe(false);
  });
});
