/**
 * Custom Zod schema for Firestore Timestamps.
 *
 * Firestore's `Timestamp` type is not a JavaScript Date — it's an
 * object with `.toDate()`, `.seconds`, `.nanoseconds`. When data is
 * fetched via `onSnapshot()` it comes through as a Timestamp; when
 * fetched via REST or test fixtures it might be a Date, an ISO string,
 * or a Unix-ms number.
 *
 * This schema accepts all three shapes and normalizes to a Date (or
 * null when input is unparseable). It's used at the read boundary so
 * downstream code only ever sees `Date | null` — no scattered
 * `tsToDate()` helpers, no `.toDate()` ducktyping in components.
 *
 * Why a Zod schema and not a plain function:
 *   1. Composes with other schemas (e.g. notificationSchema) so the
 *      whole doc validates in one parse() call.
 *   2. Type inference: `z.infer<typeof firestoreTimestampSchema>` is
 *      `Date | null`, automatically picked up by consumers.
 *   3. safeParse() returns structured errors usable in tests + admin
 *      tooling.
 */
import { z } from 'zod';

/** Duck-type guard for the Firestore Timestamp object. */
function hasToDate(v: unknown): v is { toDate: () => Date } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'toDate' in v &&
    typeof (v as { toDate: unknown }).toDate === 'function'
  );
}

export const firestoreTimestampSchema = z
  .unknown()
  .transform((v): Date | null => {
    if (v == null) return null;
    if (v instanceof Date) {
      return isNaN(v.getTime()) ? null : v;
    }
    if (typeof v === 'string' || typeof v === 'number') {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    if (hasToDate(v)) {
      try {
        const d = v.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
      } catch (err) {
        console.warn('[firestoreTimestamp] toDate() failed:', err);
        return null;
      }
    }
    return null;
  });

export type FirestoreTimestamp = z.infer<typeof firestoreTimestampSchema>;

/**
 * Optional date field on a Firestore document. Converts a Timestamp to a
 * Date before validating, so `z.infer` stays `Date | undefined` for
 * schemas whose consumers expect a plain optional Date.
 */
export const firestoreDateOptional = z.preprocess(
  (v) => (hasToDate(v) ? v.toDate() : v === null ? undefined : v),
  z.date().optional(),
);
