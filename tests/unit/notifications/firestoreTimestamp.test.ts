/**
 * firestoreTimestamp.schema.test.ts — pin the timestamp normalizer.
 *
 * Firestore returns Timestamp objects with .toDate(). Tests / fixtures
 * may pass Dates, ISO strings, or Unix-ms numbers. The schema accepts
 * all four shapes and returns Date | null. If this normalizer breaks,
 * the entire bell breaks (no createdAt → no time labels → no grouping).
 */
import { describe, test, expect } from 'vitest';
import { firestoreTimestampSchema } from '@/schemas/firestoreTimestamp.schema';

describe('firestoreTimestampSchema', () => {
  test('passes a Date through unchanged', () => {
    const d = new Date('2026-04-30T17:00:00Z');
    const result = firestoreTimestampSchema.parse(d);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(d.getTime());
  });

  test('parses an ISO string', () => {
    const result = firestoreTimestampSchema.parse('2026-04-30T17:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2026-04-30T17:00:00.000Z');
  });

  test('parses a Unix-ms number', () => {
    const ms = new Date('2026-04-30T17:00:00Z').getTime();
    const result = firestoreTimestampSchema.parse(ms);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(ms);
  });

  test('parses a Firestore Timestamp duck-type', () => {
    const expected = new Date('2026-04-30T17:00:00Z');
    const fakeTimestamp = {
      toDate: () => expected,
      seconds: Math.floor(expected.getTime() / 1000),
      nanoseconds: 0,
    };
    const result = firestoreTimestampSchema.parse(fakeTimestamp);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(expected.getTime());
  });

  test('returns null for null / undefined', () => {
    expect(firestoreTimestampSchema.parse(null)).toBe(null);
    expect(firestoreTimestampSchema.parse(undefined)).toBe(null);
  });

  test('returns null for invalid string', () => {
    expect(firestoreTimestampSchema.parse('not-a-date')).toBe(null);
  });

  test('returns null for object without toDate', () => {
    expect(firestoreTimestampSchema.parse({ foo: 'bar' })).toBe(null);
  });

  test('returns null when toDate throws', () => {
    const broken = {
      toDate: () => { throw new Error('boom'); },
    };
    expect(firestoreTimestampSchema.parse(broken)).toBe(null);
  });

  test('returns null when toDate returns non-Date', () => {
    const broken = { toDate: () => 'not a date' as unknown as Date };
    expect(firestoreTimestampSchema.parse(broken)).toBe(null);
  });

  test('returns null for an invalid Date instance', () => {
    expect(firestoreTimestampSchema.parse(new Date('garbage'))).toBe(null);
  });
});
