/**
 * Single source of truth for store facts. Each fact has one home:
 *   • founding year  → FOUNDING_YEAR (functions/src/lib/storeContent.ts)
 *   • opening hours  → Admin → Settings (formatted by hoursText)
 *   • number of teas → counted live from /teas
 * These checks fail CI if any of them gets hard-coded somewhere else.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FOUNDING_YEAR } from '../../../functions/src/lib/storeContent';

function files(dir: string, exts: RegExp): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory())
      return /node_modules|__snapshots__/.test(p) ? [] : files(p, exts);
    return exts.test(p) && !/\.(stories|test)\.tsx?$/.test(p) ? [p] : [];
  });
}
const SOURCE = [
  ...files('src', /\.(ts|tsx|css)$/),
  ...files('functions/src', /\.ts$/),
  'index.html',
];
const code = (p: string) =>
  readFileSync(p, 'utf8')
    // ignore comments — they may describe formats ("Monday – Friday 8 am – 9 pm")
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('store facts have a single source', () => {
  test('share image year matches FOUNDING_YEAR', () => {
    expect(readFileSync('public/og-default.svg', 'utf8')).toContain(`SINCE ${FOUNDING_YEAR}`);
  });

  test('no hard-coded tea counts ("79 teas")', () => {
    const offenders = SOURCE.filter((p) =>
      /\b\d{2,3}\s+(handcrafted\s+|premium\s+|loose[- ]leaf\s+)?teas\b/i.test(code(p)),
    );
    expect(offenders).toEqual([]);
  });

  test('no hard-coded founding years ("since 2018")', () => {
    const offenders = SOURCE.filter((p) =>
      /\b(since|depuis|established|founded)\s+(in\s+)?(19|20)\d{2}\b/i.test(code(p)),
    );
    expect(offenders).toEqual([]);
  });

  test('no hard-coded opening hours outside Admin → Settings', () => {
    const offenders = SOURCE.filter((p) => !/admin\//i.test(p)).filter((p) =>
      /\b\d{1,2}(:\d{2})?\s?(am|pm)\s*[–-]\s*\d{1,2}(:\d{2})?\s?(am|pm)\b/i.test(code(p)),
    );
    expect(offenders).toEqual([]);
  });
});
