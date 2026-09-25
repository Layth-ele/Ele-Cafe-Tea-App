/**
 * notificationFormatters.test.ts — pin time + grouping helpers.
 *
 * These are pure functions used in the bell to render relative
 * timestamps and group notifications by date. Pinning the boundary
 * conditions (just-now → minutes, hours → days) catches subtle bugs
 * that would otherwise only surface as user-reported "the time is wrong".
 */
import { describe, test, expect } from 'vitest';
import {
  fmtRelative,
  fmtFull,
  groupKeyFor,
  NOTIFICATION_GROUP_LABEL,
  type NotificationGroupKey,
} from '@/lib/notificationFormatters';

const NOW = new Date('2026-04-30T17:00:00Z').getTime();

describe('fmtRelative', () => {
  test('just-now under 60 seconds', () => {
    expect(fmtRelative(new Date(NOW - 30_000), NOW)).toBe('Just now');
    expect(fmtRelative(new Date(NOW - 59_999), NOW)).toBe('Just now');
  });

  test('minutes between 1m and 59m', () => {
    expect(fmtRelative(new Date(NOW - 60_000),     NOW)).toBe('1m ago');
    expect(fmtRelative(new Date(NOW - 5 * 60_000), NOW)).toBe('5m ago');
    expect(fmtRelative(new Date(NOW - 59 * 60_000), NOW)).toBe('59m ago');
  });

  test('hours between 1h and 23h', () => {
    expect(fmtRelative(new Date(NOW - 60 * 60_000),     NOW)).toBe('1h ago');
    expect(fmtRelative(new Date(NOW - 5 * 60 * 60_000), NOW)).toBe('5h ago');
    expect(fmtRelative(new Date(NOW - 23 * 60 * 60_000), NOW)).toBe('23h ago');
  });

  test('days from 1d onwards', () => {
    expect(fmtRelative(new Date(NOW - 24 * 60 * 60_000),  NOW)).toBe('1d ago');
    expect(fmtRelative(new Date(NOW - 30 * 24 * 60 * 60_000), NOW)).toBe('30d ago');
  });

  test('null input returns empty string (no crash)', () => {
    expect(fmtRelative(null, NOW)).toBe('');
  });
});

describe('fmtFull', () => {
  test('formats a Date in en-CA long form', () => {
    const d = new Date('2026-04-30T17:30:00Z');
    const result = fmtFull(d);
    // Don't pin exact timezone behavior (depends on test environment),
    // but check the format includes month name + year + time.
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/April/i);
  });

  test('null input returns empty string', () => {
    expect(fmtFull(null)).toBe('');
  });
});

describe('groupKeyFor', () => {
  test('today: less than 24h ago', () => {
    expect(groupKeyFor(new Date(NOW - 1000),                NOW)).toBe<NotificationGroupKey>('today');
    expect(groupKeyFor(new Date(NOW - 12 * 60 * 60_000),    NOW)).toBe<NotificationGroupKey>('today');
    expect(groupKeyFor(new Date(NOW - 23 * 60 * 60_000),    NOW)).toBe<NotificationGroupKey>('today');
  });

  test('yesterday: 1d-2d range', () => {
    expect(groupKeyFor(new Date(NOW - 24 * 60 * 60_000),    NOW)).toBe<NotificationGroupKey>('yesterday');
    expect(groupKeyFor(new Date(NOW - 47 * 60 * 60_000),    NOW)).toBe<NotificationGroupKey>('yesterday');
  });

  test('this-week: 2d-7d range', () => {
    expect(groupKeyFor(new Date(NOW - 48 * 60 * 60_000),    NOW)).toBe<NotificationGroupKey>('this-week');
    expect(groupKeyFor(new Date(NOW - 6 * 24 * 60 * 60_000), NOW)).toBe<NotificationGroupKey>('this-week');
  });

  test('older: more than 7 days', () => {
    expect(groupKeyFor(new Date(NOW - 7 * 24 * 60 * 60_000), NOW)).toBe<NotificationGroupKey>('older');
    expect(groupKeyFor(new Date(NOW - 30 * 24 * 60 * 60_000), NOW)).toBe<NotificationGroupKey>('older');
  });

  test('null sorts to older — keeps list stable', () => {
    expect(groupKeyFor(null, NOW)).toBe<NotificationGroupKey>('older');
  });
});

describe('NOTIFICATION_GROUP_LABEL', () => {
  test('has a label for every group key', () => {
    const keys: NotificationGroupKey[] = ['today', 'yesterday', 'this-week', 'older'];
    for (const k of keys) {
      expect(NOTIFICATION_GROUP_LABEL[k]).toBeTruthy();
    }
  });
});
