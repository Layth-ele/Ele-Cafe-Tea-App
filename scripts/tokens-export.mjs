#!/usr/bin/env node
/**
 * tokens-export.mjs — Phase 1.8 of the UI/UX roadmap
 *
 * Generates `design/tokens.json` from `src/styles/tokens.css` so
 * designers can import the same token set into Figma via the
 * Tokens Studio plugin (https://tokens.studio).
 *
 * Why a one-way export (CSS → Figma) and not bidirectional sync:
 *   The CSS file is the source of truth — every engineering change
 *   already flows through it (via PR review + stylelint). A two-way
 *   sync risks designers' Figma edits silently overriding what the
 *   code expects, which is the opposite of what we want. One-way
 *   means: code wins, Figma is a read-only mirror, designers
 *   propose changes via PR-reviewable JSON diffs.
 *
 * Output shape (Tokens Studio compatible):
 *   {
 *     "color": {
 *       "midnight":   { "value": "#0f1c26", "type": "color" },
 *       "gold-deep":  { "value": "#8c6830", "type": "color" },
 *       …
 *     },
 *     "spacing": { "1": { "value": "4px", "type": "spacing" }, … },
 *     "radius":  { … },
 *     "duration":{ … },
 *     "shadow":  { … }
 *   }
 *
 *   Tokens Studio reads this JSON and creates Figma styles that
 *   designers can apply directly in their files. When the JSON
 *   updates (via this script), they re-import and Figma updates.
 *
 * Limitations:
 *   - Resolves `var(--other)` one hop deep (matches our actual usage).
 *   - Skips alpha-only tokens (rgba()) — Tokens Studio handles those
 *     fine but we'd want to declare them as separate `opacity`
 *     tokens if we cared. Today they're inline-composed in CSS.
 *   - Theme variants (.dark) export as a separate file/section in
 *     a future iteration; today we emit only the light theme.
 *
 * Usage:
 *   node scripts/tokens-export.mjs                output to design/tokens.json
 *   node scripts/tokens-export.mjs --stdout       print to stdout
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC  = join(ROOT, 'src/styles/tokens.css');
const OUT  = join(ROOT, 'design/tokens.json');

const args = process.argv.slice(2);
const STDOUT = args.includes('--stdout');

const css = readFileSync(SRC, 'utf8');

/** Pull only the FIRST `:root { … }` block (light theme). */
function lightThemeBlock(text) {
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const m = noComments.match(/:root\s*\{([\s\S]*?)^\}/m);
  return m ? m[1] : noComments;
}

/** Map of token name (no leading --) → raw value string. */
function parseTokens(block) {
  const map = new Map();
  const re = /(--[a-zA-Z0-9_-]+):\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    // Last-write-wins matches CSS cascade — the OKLCH override
    // takes priority over the hex fallback for tokens that have
    // both. We want the OKLCH value in tokens.json so designers
    // see the perceptually-uniform values their engineers do.
    map.set(m[1].slice(2), m[2].trim());
  }
  return map;
}

/** Resolve `var(--ref)` references one hop deep. */
function resolveOneHop(map) {
  const out = new Map();
  for (const [name, value] of map) {
    let v = value;
    let hops = 0;
    while (v.startsWith('var(') && hops < 5) {
      const ref = v.match(/var\(\s*--([^,)]+?)\s*[,)]/)?.[1];
      if (!ref) break;
      const next = map.get(ref);
      if (!next) break;
      v = next;
      hops++;
    }
    out.set(name, v);
  }
  return out;
}

/** Categorize a token by name pattern. Used to bucket into
 * Tokens Studio's `type` field. */
function categorize(name) {
  // Skip private tokens — they're an implementation detail of the
  // ladder, not something designers should reference directly.
  if (name.startsWith('_')) return null;

  if (/^(sp|gap|pad-|row-h|dist-)/.test(name))                    return 'spacing';
  if (/^(radius|rad-)/.test(name))                                return 'borderRadius';
  if (/^(dur-|ease-)/.test(name))                                 return 'other';   // Tokens Studio has no native duration
  if (/^(elev|shadow)/.test(name))                                return 'boxShadow';
  if (/^(z-|z_)/.test(name))                                      return 'other';   // z-index → other
  if (/^(font-|type-)/.test(name))                                return 'fontSize'; // approximation
  if (/^(viz-|state-)/.test(name))                                return 'color';
  if (/(bg|surface|text|border|midnight|gold|cream|ink|on-dark|muted|success|warning|danger|info|tea-)/i.test(name))
    return 'color';

  return 'other';
}

const lightBlock = lightThemeBlock(css);
const raw = parseTokens(lightBlock);
const resolved = resolveOneHop(raw);

/* Build the Tokens Studio JSON. The top-level keys are categories
 * (color, spacing, …); each value is an object of { name → { value, type } }. */
const out = {};
let total = 0, skipped = 0;

for (const [name, value] of resolved) {
  const type = categorize(name);
  if (type === null) { skipped++; continue; }

  const bucket =
    type === 'color'        ? 'color' :
    type === 'spacing'      ? 'spacing' :
    type === 'borderRadius' ? 'radius' :
    type === 'boxShadow'    ? 'shadow' :
    type === 'fontSize'     ? 'typography' :
                              'other';

  out[bucket] ??= {};
  out[bucket][name] = {
    value: value,
    type:  type,
  };
  total++;
}

/* Stable key ordering — Object.keys is insertion-order and tokens.css
 * is itself well-ordered, so we sort each bucket alphabetically for
 * predictable diffs. */
for (const bucket of Object.keys(out)) {
  const sorted = {};
  for (const k of Object.keys(out[bucket]).sort()) {
    sorted[k] = out[bucket][k];
  }
  out[bucket] = sorted;
}

const json = JSON.stringify(out, null, 2);

if (STDOUT) {
  process.stdout.write(json + '\n');
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json + '\n', 'utf8');
  console.log(`Wrote ${OUT}`);
  console.log(`  ${total} tokens exported across ${Object.keys(out).length} buckets`);
  console.log(`  ${skipped} tokens skipped (private/unrouted)`);
  for (const [b, items] of Object.entries(out)) {
    console.log(`  - ${b.padEnd(12)} ${Object.keys(items).length}`);
  }
}
