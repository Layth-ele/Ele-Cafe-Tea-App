#!/usr/bin/env node
/**
 * inline-style-analyzer.mjs — Phase 3 worklist generator
 *
 * Reads every `style={{}}` in the codebase, categorizes each by
 * complexity (static / mixed / dynamic), suggests an existing utility
 * class when the static one matches a known recipe, and prints a
 * prioritized worklist for the migration playbook.
 *
 * Why a static analyzer is the right tool here (and a codemod is NOT):
 *   - The playbook (PHASE_3_PLAYBOOK.md) is methodical and hand-driven
 *     because the visual-regression suite is the safety net. A codemod
 *     that auto-rewrites would force a wholesale baseline reset.
 *   - The hard part of migration isn't the typing — it's the JUDGMENT:
 *     "is this an existing utility class? is it a one-off? is the
 *     dynamic part actually unavoidable?" An analyzer that surfaces
 *     the answer to those questions per-instance lets a developer
 *     migrate at 10× the speed without sacrificing the safety the
 *     visual regression suite provides.
 *
 * Buckets:
 *   - utility-match   — static; matches an existing utility class
 *                       from design.css (.stack-N, .row-N, .mb-N, etc).
 *                       Highest-leverage wins, no new CSS needed.
 *   - static-token    — every property is literal or var(--token).
 *                       Move to a new component-specific class.
 *   - mixed-static    — most properties are static, 1–2 are dynamic
 *                       (often a width %, a color toggle, an opacity).
 *                       Migrate static parts to a class; keep dynamic
 *                       inline OR convert to a CSS custom property.
 *   - truly-dynamic   — a single inline value computed per-render.
 *                       Suppress with a documented reason.
 *
 * Run:
 *   node scripts/inline-style-analyzer.mjs                     pretty report
 *   node scripts/inline-style-analyzer.mjs --json              machine-readable
 *   node scripts/inline-style-analyzer.mjs --file <path>       single file deep-dive
 *   node scripts/inline-style-analyzer.mjs --top N             top N files only
 *   node scripts/inline-style-analyzer.mjs --bucket <bucket>   filter by bucket
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const SRC  = join(ROOT, 'src');

/* CLI args */
const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const val  = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const JSON_     = flag('--json');
const TOP_N     = parseInt(val('--top') ?? '15', 10);
const FILE_FOCUS= val('--file');
const BUCKET    = val('--bucket');

/* ── Utility class recipes ───────────────────────────────────────────
 * Recipes are matched against the set of CSS properties on a given
 * inline style. If the property set + values match exactly, the recipe
 * is the suggested replacement. We deliberately keep recipes
 * conservative — if there's any doubt the suggestion would be visually
 * identical, we don't suggest. False positives waste a developer's
 * confidence; false negatives are just "not a hit" and the developer
 * makes a per-file class. */
const UTILITY_RECIPES = [
  /* row-N — horizontal flex with center align + sp-N gap */
  { class: 'row-1', match: { display: 'flex', alignItems: 'center', gap: '4px'  } },
  { class: 'row-2', match: { display: 'flex', alignItems: 'center', gap: '8px'  } },
  { class: 'row-3', match: { display: 'flex', alignItems: 'center', gap: '12px' } },
  { class: 'row-4', match: { display: 'flex', alignItems: 'center', gap: '16px' } },
  { class: 'row-5', match: { display: 'flex', alignItems: 'center', gap: '20px' } },
  { class: 'row-6', match: { display: 'flex', alignItems: 'center', gap: '24px' } },

  /* row-between */
  { class: 'row-between',   match: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
  { class: 'row-between-3', match: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } },
  { class: 'row-between-4', match: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' } },

  /* stack-N — vertical flex with sp-N gap */
  { class: 'stack-1', match: { display: 'flex', flexDirection: 'column', gap: '4px'  } },
  { class: 'stack-2', match: { display: 'flex', flexDirection: 'column', gap: '8px'  } },
  { class: 'stack-3', match: { display: 'flex', flexDirection: 'column', gap: '12px' } },
  { class: 'stack-4', match: { display: 'flex', flexDirection: 'column', gap: '16px' } },
  { class: 'stack-5', match: { display: 'flex', flexDirection: 'column', gap: '20px' } },
  { class: 'stack-6', match: { display: 'flex', flexDirection: 'column', gap: '24px' } },

  /* cluster-N — wrappable horizontal */
  { class: 'cluster-2', match: { display: 'flex', flexWrap: 'wrap', gap: '8px'  } },
  { class: 'cluster-3', match: { display: 'flex', flexWrap: 'wrap', gap: '12px' } },

  /* margin utilities */
  { class: 'mb-1', match: { marginBottom: '4px'  } },
  { class: 'mb-2', match: { marginBottom: '8px'  } },
  { class: 'mb-3', match: { marginBottom: '12px' } },
  { class: 'mb-4', match: { marginBottom: '16px' } },
  { class: 'mb-5', match: { marginBottom: '20px' } },
  { class: 'mb-6', match: { marginBottom: '24px' } },
  { class: 'mt-2', match: { marginTop: '8px'  } },
  { class: 'mt-3', match: { marginTop: '12px' } },
  { class: 'mt-4', match: { marginTop: '16px' } },

  /* text utilities */
  { class: 'text-center',    match: { textAlign: 'center' } },
  { class: 'text-muted-sm',  match: { color: 'var(--muted)', fontSize: '12px' } },
  { class: 'text-muted-xs',  match: { color: 'var(--muted)', fontSize: '11px' } },
  { class: 'text-text2-sm',  match: { color: 'var(--text-2)', fontSize: '13px', lineHeight: 1.6 } },
];

/* ── File discovery ─────────────────────────────────────────────── */
function collectTsx(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      collectTsx(full, out);
    } else if (name.endsWith('.tsx')) {
      // Stories are fixtures — excluded by the eslint override too.
      if (name.endsWith('.stories.tsx')) continue;
      out.push(full);
    }
  }
  return out;
}

/* ── Style-block extractor ──────────────────────────────────────────
 * Walk the file source character-by-character. When we hit `style={{`
 * track brace depth until we close. This handles multiline, nested
 * objects, conditionals — the whole zoo. We don't try to parse JS
 * inside; we extract the raw text between the outer braces and let
 * the heuristic categorizer below figure out what kind of value it is.
 */
function extractStyleBlocks(source) {
  const blocks = [];
  const re = /style=\{\{/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const start = match.index + match[0].length; // just past `{{`
    let depth = 2; // the two opening braces
    let i = start;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      // skip strings to avoid counting braces inside them
      else if (ch === "'" || ch === '"' || ch === '`') {
        const quote = ch;
        i++;
        while (i < source.length && source[i] !== quote) {
          if (source[i] === '\\') i++;
          i++;
        }
      }
      i++;
    }
    if (depth === 0) {
      const inner = source.slice(start, i - 2); // strip `}}`
      // line number of `style={{`
      const lineNo = source.slice(0, match.index).split('\n').length;
      blocks.push({ inner, lineNo, raw: source.slice(match.index, i) });
    }
  }
  return blocks;
}

/* ── Property parser ────────────────────────────────────────────────
 * Best-effort split of an object body into { key: value } pairs. Not
 * a real JS parser — pragmatic enough that 95% of real style blocks
 * fall through cleanly. The 5% that don't get bucketed `mixed` or
 * `truly-dynamic` and a developer reviews them by hand.
 */
function parseProperties(inner) {
  const props = {};
  let valueIsLiteral = true;
  let parseFailed = false;

  // Top-level split — comma-separated, but commas inside strings or
  // nested parens (var(...), rgba(...)) don't count.
  const segments = [];
  let buf = '';
  let pDepth = 0;
  let inStr = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      buf += ch;
      if (ch === '\\') { buf += inner[++i] ?? ''; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; buf += ch; continue; }
    if (ch === '(' || ch === '{' || ch === '[') { pDepth++; buf += ch; continue; }
    if (ch === ')' || ch === '}' || ch === ']') { pDepth--; buf += ch; continue; }
    if (ch === ',' && pDepth === 0) {
      if (buf.trim()) segments.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) segments.push(buf.trim());

  // For each segment, split into key + value at the first top-level colon.
  for (const seg of segments) {
    // Skip spread, comments, etc. — anything we can't trivially parse.
    if (seg.startsWith('...') || seg.startsWith('//') || seg.startsWith('/*')) {
      parseFailed = true;
      continue;
    }
    let colonIdx = -1;
    let pd = 0; let inS = null;
    for (let i = 0; i < seg.length; i++) {
      const ch = seg[i];
      if (inS) { if (ch === inS) inS = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { inS = ch; continue; }
      if (ch === '(' || ch === '{' || ch === '[') { pd++; continue; }
      if (ch === ')' || ch === '}' || ch === ']') { pd--; continue; }
      if (ch === ':' && pd === 0) { colonIdx = i; break; }
    }
    if (colonIdx < 0) { parseFailed = true; continue; }
    let key = seg.slice(0, colonIdx).trim();
    let value = seg.slice(colonIdx + 1).trim();

    // Unquote keys ('display' → display)
    if ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"'))) {
      key = key.slice(1, -1);
    }

    // Normalize literal values
    let literal = null;
    if ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))) {
      literal = value.slice(1, -1);
    } else if (/^[\d.]+$/.test(value)) {
      literal = parseFloat(value);
    } else if (value.startsWith('var(') && value.endsWith(')')) {
      literal = value;            // var(--x) is a "literal" for our purposes
    } else if (value.startsWith('`') && value.endsWith('`') && !value.includes('${')) {
      literal = value.slice(1, -1); // a backtick string with no interpolation
    } else {
      // Anything else — ternary, JS expression, function call, template
      // literal with ${}, etc. — counts as dynamic.
      literal = null;
      valueIsLiteral = false;
    }

    props[key] = { raw: value, literal };
  }

  return { props, valueIsLiteral, parseFailed };
}

/* ── Bucket the style block ────────────────────────────────────── */
function bucket(parsed) {
  const keys = Object.keys(parsed.props);
  if (parsed.parseFailed || keys.length === 0) {
    return { bucket: 'parse-failed' };
  }

  const literals = keys.filter(k => parsed.props[k].literal !== null);
  const dynamics = keys.filter(k => parsed.props[k].literal === null);
  const allLiteral = dynamics.length === 0;

  if (allLiteral) {
    /* Try to match an existing utility class. The match is on
     * EXACT property set + EXACT values — if the inline style has
     * an extra property the recipe doesn't, no match. */
    for (const recipe of UTILITY_RECIPES) {
      const recipeKeys = Object.keys(recipe.match);
      if (keys.length !== recipeKeys.length) continue;
      const allMatch = recipeKeys.every(k => parsed.props[k]?.literal === recipe.match[k]);
      if (allMatch) {
        return { bucket: 'utility-match', utility: recipe.class };
      }
    }
    return { bucket: 'static-token' };
  }

  if (dynamics.length === 1 && literals.length >= 1) {
    return { bucket: 'mixed-static', dynamicKey: dynamics[0] };
  }

  if (dynamics.length === keys.length && keys.length === 1) {
    return { bucket: 'truly-dynamic', dynamicKey: dynamics[0] };
  }

  return { bucket: 'mixed-static', dynamicKeys: dynamics };
}

/* ── Main ─────────────────────────────────────────────────────────── */
const files = FILE_FOCUS
  ? [FILE_FOCUS.startsWith('/') ? FILE_FOCUS : join(ROOT, FILE_FOCUS)]
  : collectTsx(SRC);

const perFile = [];
const bucketTotals = {
  'utility-match':  0,
  'static-token':   0,
  'mixed-static':   0,
  'truly-dynamic':  0,
  'parse-failed':   0,
};

for (const f of files) {
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { continue; }
  const blocks = extractStyleBlocks(src);
  if (blocks.length === 0) continue;

  const findings = [];
  for (const b of blocks) {
    const parsed = parseProperties(b.inner);
    const result = bucket(parsed);
    findings.push({
      line: b.lineNo,
      bucket: result.bucket,
      utility: result.utility,
      dynamicKey: result.dynamicKey,
      dynamicKeys: result.dynamicKeys,
      preview: b.inner.replace(/\s+/g, ' ').slice(0, 80),
    });
    bucketTotals[result.bucket] = (bucketTotals[result.bucket] || 0) + 1;
  }

  perFile.push({ file: relative(ROOT, f), count: blocks.length, findings });
}

perFile.sort((a, b) => b.count - a.count);

if (JSON_) {
  console.log(JSON.stringify({ bucketTotals, totalFiles: perFile.length, perFile }, null, 2));
  process.exit(0);
}

/* ── Pretty report ─────────────────────────────────────────────── */
const total = Object.values(bucketTotals).reduce((a, b) => a + b, 0);

console.log('\n  Inline-style analyzer — Phase 3 worklist');
console.log('  ' + '═'.repeat(58));
console.log(`  Files scanned:    ${perFile.length}`);
console.log(`  Inline styles:    ${total}`);
console.log('');
console.log('  Distribution by bucket:');
for (const [k, v] of Object.entries(bucketTotals)) {
  if (v > 0) {
    const pct = ((v / total) * 100).toFixed(1).padStart(5);
    console.log(`    ${k.padEnd(16)}  ${String(v).padStart(5)}  ${pct}%`);
  }
}

if (FILE_FOCUS) {
  /* Single-file deep-dive */
  const file = perFile[0];
  if (!file) { console.log('\n  No inline styles in that file.'); process.exit(0); }
  console.log(`\n  ${file.file} — ${file.count} inline styles`);
  console.log('  ' + '─'.repeat(58));
  for (const f of file.findings) {
    if (BUCKET && f.bucket !== BUCKET) continue;
    const icon = ({
      'utility-match': '🎯',
      'static-token':  '✏️',
      'mixed-static':  '🔀',
      'truly-dynamic': '⚡',
      'parse-failed':  '❓',
    })[f.bucket] || '·';
    console.log(`  ${icon} L${String(f.line).padEnd(4)} ${f.bucket.padEnd(15)} ${f.utility ? '→ '+f.utility+'  ' : ''}${f.preview}`);
  }
  process.exit(0);
}

console.log('\n  Top files (by inline-style count):');
console.log('  ' + '─'.repeat(58));
console.log('  count  utility  static  mixed  dynamic  file');

for (const file of perFile.slice(0, TOP_N)) {
  const counts = { 'utility-match': 0, 'static-token': 0, 'mixed-static': 0, 'truly-dynamic': 0, 'parse-failed': 0 };
  for (const f of file.findings) counts[f.bucket]++;
  console.log(
    `  ${String(file.count).padStart(5)}  ${String(counts['utility-match']).padStart(7)}  ${String(counts['static-token']).padStart(6)}  ${String(counts['mixed-static']).padStart(5)}  ${String(counts['truly-dynamic']).padStart(7)}  ${file.file}`
  );
}

if (perFile.length > TOP_N) {
  const rest = perFile.slice(TOP_N).reduce((a, b) => a + b.count, 0);
  console.log(`  … ${perFile.length - TOP_N} more files, ${rest} more inline styles`);
}

console.log('');
console.log('  How to use this:');
console.log('    1. Pick a file from the top of the list — biggest absolute wins.');
console.log('    2. Run with --file <path> to see the per-instance breakdown.');
console.log('    3. utility-match wins are the easiest — replace each with the');
console.log('       suggested class. Zero new CSS, immediate progress.');
console.log('    4. static-token next — extract a per-component class to');
console.log('       design.css, drop the inline.');
console.log('    5. mixed-static — migrate static parts; keep the dynamic key inline');
console.log('       (or convert to a CSS custom property).');
console.log('    6. truly-dynamic — suppress with a one-line reason (see playbook).');
console.log('');
