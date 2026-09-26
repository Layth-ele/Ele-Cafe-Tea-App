/**
 * French completeness — every literal key passed to t()/tr()/tx()/tNow()/k()
 * in customer-facing code must have a French entry whose {placeholders}
 * match the English, so switching to FR never silently falls back to
 * English (or drops a number / name).
 */
import { describe, test, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { STRINGS } from '@/i18n/translations';
import { translate, loadFrench } from '@/i18n/useT';

beforeAll(() => loadFrench());

const ROOT = path.resolve(__dirname, '../../../src');
const FNS = new Set(['t', 'tr', 'tx', 'tNow', 'k']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (!/admin/.test(f)) sourceFiles(p, out);
    } else if (/\.tsx?$/.test(f) && !/\.stories\.|\.test\./.test(f) && !/Admin/.test(f))
      out.push(p);
  }
  return out;
}

function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of sourceFiles(ROOT)) {
    const src = fs.readFileSync(file, 'utf8');
    if (!/\b(t|tr|tx|tNow|k)\(/.test(src)) continue;
    const sf = ts.createSourceFile(
      file,
      src,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const add = (n: ts.Node) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
        keys.set(n.text, path.relative(ROOT, file));
      else if (ts.isConditionalExpression(n)) {
        add(n.whenTrue);
        add(n.whenFalse);
      }
    };
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        FNS.has(n.expression.text) &&
        n.arguments[0]
      )
        add(n.arguments[0]);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return keys;
}

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('French dictionary', () => {
  const keys = usedKeys();

  test('scans a real amount of UI text', () => {
    expect(keys.size).toBeGreaterThan(500);
  });

  test('every translated string has a French entry', () => {
    const missing = [...keys].filter(([k]) => !STRINGS[k]?.fr).map(([k, f]) => `${f}: ${k}`);
    expect(missing).toEqual([]);
  });

  test('French keeps the same {placeholders} as the English', () => {
    const bad = Object.entries(STRINGS)
      .filter(([k, v]) => placeholders(k) !== placeholders(v.fr))
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });
});

describe('translate()', () => {
  test('fills placeholders in both languages', () => {
    expect(translate('{count} items', 'en', { count: 3 })).toBe('3 items');
    expect(translate('{count} items', 'fr', { count: 3 })).toBe('3 articles');
  });
  test('unknown keys fall back to the English text', () => {
    expect(translate('Some new sentence', 'fr')).toBe('Some new sentence');
  });
});
