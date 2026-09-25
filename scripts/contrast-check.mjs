#!/usr/bin/env node
/**
 * contrast-check.mjs — Phase 1 WCAG contrast gate
 *
 * Reads the project's resolved color tokens and asserts WCAG 2.1
 * contrast ratios on every foreground/background pair that appears
 * in real UI. Fails the build if any pair drops below the AA bar.
 *
 * Why a CI gate, not a one-off script:
 *   The OKLCH migration is mathematically lossless on supporting
 *   browsers, but every future palette tweak (dark-mode adjustment,
 *   accent rebalance, designer iteration) risks crossing the WCAG
 *   line. Catching that in a PR comment is cheap. Catching it in
 *   production after a rebrand is expensive — accessibility lawsuits
 *   start at five figures.
 *
 * Bars (WCAG 2.1):
 *   AA, normal text:       4.5 : 1   (default for body, captions, links)
 *   AA, large text:        3.0 : 1   (>= 18pt or >= 14pt bold)
 *   AA, UI components:     3.0 : 1   (icon buttons, focus rings, borders
 *                                     that convey state)
 *   AAA, normal text:      7.0 : 1   (we aim for this on critical flows
 *                                     — checkout body, error messages)
 *
 * What this script CANNOT catch:
 *   - Contrast against arbitrary user-uploaded product images.
 *   - Contrast on dynamic gradient overlays (the cpp-hero veil etc).
 *   - Contrast at tiny font weights (a 100-weight Cormorant might fail
 *     where 400-weight passes; we test against the actual weights).
 *   For those we still rely on axe-core in the Playwright a11y suite.
 *
 * Usage:
 *   node scripts/contrast-check.mjs              run all pairs
 *   node scripts/contrast-check.mjs --json       machine-readable
 *   node scripts/contrast-check.mjs --aaa        also enforce AAA
 *
 * Exits 0 on pass, 1 on any AA failure (or AAA when --aaa).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { wcagContrast, parse, formatHex } from 'culori';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const AAA      = args.includes('--aaa');

/* ─── 1. Read tokens.css and build a name → hex map ──────────────
 * The hex line is always the line BEFORE the OKLCH override, so
 * we read all `--name: <value>;` declarations and use the resolved
 * sRGB value (because culori parses OKLCH cleanly anyway).
 *
 * Theme scoping: tokens are redeclared inside `.dark { … }` and
 * other theme blocks. We only want the LIGHT theme tokens (the
 * default `:root { … }` block) so the contrast check covers the
 * default render. A separate run with `--theme=dark` could check
 * dark mode; for now we keep it simple and require both themes
 * use the same token NAMES (which they do).
 *
 * Alpha compositing: state-bg tokens are semi-transparent
 * (rgba(...,0.12)) and visually render over their parent surface.
 * For contrast computation we composite each transparent value
 * over `--surface` (#ffffff), which is the surface the badges sit
 * on in practice. */
const tokensCss = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');

/** Composite a foreground color (possibly with alpha) over a solid
 * background. Returns a fully-opaque sRGB hex. Used to resolve
 * semi-transparent token values into the color a user actually sees. */
function compositeOver(fgValue, bgHex) {
  const fg = parse(fgValue);
  const bg = parse(bgHex);
  if (!fg || !bg) return null;
  const a = fg.alpha ?? 1;
  if (a >= 0.999) return formatHex(fg);
  // Linear sRGB compositing; culori `parse` returns linearized
  // channels in 0-1 range already, so a straight lerp is fine.
  const out = {
    mode: 'rgb',
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
  return formatHex(out);
}

/** Map of token name → resolved sRGB hex (#rrggbb), light-theme only. */
const tokenMap = (() => {
  // Scope: pull only the FIRST `:root { … }` block — that's the light
  // theme. The dark / data-theme blocks come later and we ignore them.
  // The split-on-`}` approach is naive but works because tokens.css
  // doesn't have nested rules inside :root.
  const noComments = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const m = noComments.match(/:root\s*\{([\s\S]*?)^\}/m);
  const lightBlock = m ? m[1] : noComments;

  const raw = new Map();
  const decl = /(--[a-zA-Z0-9_-]+):\s*([^;]+);/g;
  let d;
  while ((d = decl.exec(lightBlock)) !== null) {
    raw.set(d[1].trim(), d[2].trim());
  }

  // First pass: resolve `var(...)` references one-hop deep, get raw values.
  const halfResolved = new Map();
  for (const [name, value] of raw) {
    let v = value;
    let hops = 0;
    while (v.startsWith('var(') && hops < 5) {
      const ref = v.match(/var\(\s*(--[^,)]+?)\s*[,)]/)?.[1];
      if (!ref) break;
      const next = raw.get(ref);
      if (!next) break;
      v = next;
      hops++;
    }
    halfResolved.set(name, v);
  }

  // Second pass: convert each resolved value to canonical hex,
  // compositing transparent values over --surface (the most common
  // background for state badges).
  const surfaceHex = (() => {
    const v = halfResolved.get('--surface') ?? '#ffffff';
    try { return formatHex(parse(v)) ?? '#ffffff'; } catch { return '#ffffff'; }
  })();

  const resolved = new Map();
  for (const [name, value] of halfResolved) {
    try {
      const c = parse(value);
      if (!c) continue;
      const a = c.alpha ?? 1;
      if (a < 0.999) {
        // Composite over surface — the badge backgrounds are designed
        // to sit on the surface tier.
        const composited = compositeOver(value, surfaceHex);
        if (composited) resolved.set(name, composited);
      } else {
        resolved.set(name, formatHex(c));
      }
    } catch {
      // Skip values that aren't colors (durations, sizes, etc).
    }
  }
  return resolved;
})();

/* ─── 2. The pairs we test ──────────────────────────────────────────
 * Each pair: { fg, bg, level, label }
 * - level: 'AA-normal' | 'AA-large' | 'AA-ui' | 'AAA-normal'
 * - These pairs reflect what actually appears in the UI. Pure-white
 *   backgrounds (`--surface`) get tested against every text token; dark
 *   surfaces get tested against `--on-dark` and friends.
 *
 * To extend: add a pair here when you introduce a new color combo
 * in production code. The cost of forgetting is failing the lint at
 * the first PR that crosses the WCAG line, which is the right time. */
const PAIRS = [
  // Body text on the default cream background.
  { fg: '--text',       bg: '--bg',         level: 'AA-normal', label: 'body text on bg' },
  { fg: '--text-2',     bg: '--bg',         level: 'AA-normal', label: 'secondary text on bg' },
  { fg: '--text-3',     bg: '--bg',         level: 'AA-large',  label: 'tertiary text on bg' },
  { fg: '--muted',      bg: '--bg',         level: 'AA-large',  label: 'muted text on bg' },
  { fg: '--midnight',   bg: '--bg',         level: 'AA-normal', label: 'midnight on bg' },

  // Text on white surface (cards, modals).
  { fg: '--text',       bg: '--surface',    level: 'AA-normal', label: 'body on surface' },
  { fg: '--text-2',     bg: '--surface',    level: 'AA-normal', label: 'secondary on surface' },
  { fg: '--muted',      bg: '--surface',    level: 'AA-large',  label: 'muted on surface' },
  { fg: '--gold-deep',  bg: '--surface',    level: 'AA-normal', label: 'gold link on surface' },

  // Text on surface-2 (slightly tinted cream).
  { fg: '--text',       bg: '--surface-2',  level: 'AA-normal', label: 'body on surface-2' },
  { fg: '--muted',      bg: '--surface-2',  level: 'AA-large',  label: 'muted on surface-2' },

  // Cream-on-midnight (dark CTAs, footers, hero overlays).
  { fg: '--on-dark',    bg: '--midnight',   level: 'AA-normal', label: 'cream on midnight (CTA)' },
  { fg: '--on-dark-9',  bg: '--midnight',   level: 'AA-normal', label: 'cream-90 on midnight' },
  { fg: '--on-dark-85', bg: '--midnight',   level: 'AA-normal', label: 'cream-85 on midnight' },
  { fg: '--on-dark-7',  bg: '--midnight',   level: 'AA-large',  label: 'cream-70 on midnight (footer secondary)' },

  // State surface combos.
  { fg: '--state-success-fg',  bg: '--state-success-bg',  level: 'AA-normal', label: 'success badge text' },
  { fg: '--state-warning-fg',  bg: '--state-warning-bg',  level: 'AA-normal', label: 'warning badge text' },
  { fg: '--state-danger-fg',   bg: '--state-danger-bg',   level: 'AA-normal', label: 'danger badge text' },
  { fg: '--state-info-fg',     bg: '--state-info-bg',     level: 'AA-normal', label: 'info badge text' },

  // Solid state CTAs.
  { fg: '--surface',           bg: '--state-success-solid', level: 'AA-normal', label: 'on success solid' },
  { fg: '--surface',           bg: '--state-danger-solid',  level: 'AA-normal', label: 'on danger solid' },
];

/* ─── 3. Bar lookup ────────────────────────────────────────────── */
const BARS = {
  'AA-normal':  4.5,
  'AA-large':   3.0,
  'AA-ui':      3.0,
  'AAA-normal': 7.0,
  'AAA-large':  4.5,
};

/* ─── 4. Run the checks ─────────────────────────────────────────── */
const results = [];
for (const pair of PAIRS) {
  const fgHex = tokenMap.get(pair.fg);
  const bgHex = tokenMap.get(pair.bg);

  if (!fgHex || !bgHex) {
    results.push({
      ...pair,
      fgHex: fgHex ?? null,
      bgHex: bgHex ?? null,
      ratio: null,
      pass:  false,
      err:   `Missing token (fg=${!!fgHex} bg=${!!bgHex})`,
    });
    continue;
  }

  const ratio = wcagContrast(fgHex, bgHex);
  const bar   = BARS[pair.level];
  const aaaBar = pair.level.startsWith('AA-') ? BARS['AAA-normal'] : null;

  results.push({
    ...pair,
    fgHex,
    bgHex,
    ratio:    Number(ratio.toFixed(2)),
    bar,
    aaaBar,
    pass:     ratio >= bar,
    aaaPass:  aaaBar ? ratio >= aaaBar : null,
  });
}

/* ─── 5. Output ─────────────────────────────────────────────────── */
if (JSON_OUT) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const reset = '\x1b[0m';
  const red   = '\x1b[31m';
  const grn   = '\x1b[32m';
  const dim   = '\x1b[2m';
  const yel   = '\x1b[33m';

  console.log('\n  WCAG contrast check (Phase 1 gate)');
  console.log('  ' + '─'.repeat(70));
  console.log(`  ${'pair'.padEnd(38)} ${'ratio'.padEnd(8)} ${'bar'.padEnd(6)} status`);
  console.log('  ' + '─'.repeat(70));

  for (const r of results) {
    const status = r.err
      ? `${red}ERR${reset}  ${r.err}`
      : r.pass
        ? `${grn}AA✓${reset}${r.aaaPass ? ` ${grn}AAA✓${reset}` : (r.aaaBar ? ` ${dim}AAA✗${reset}` : '')}`
        : `${red}AA✗${reset}`;
    const ratioStr = r.ratio !== null ? `${r.ratio.toFixed(2)}:1`.padEnd(8) : '       —';
    const barStr   = r.bar   !== undefined ? `${r.bar}:1`.padEnd(6) : '      ';
    console.log(`  ${r.label.padEnd(38)} ${ratioStr} ${barStr} ${status}`);
  }

  const aaFails = results.filter(r => !r.pass);
  const aaaFails = results.filter(r => !r.err && r.aaaBar && !r.aaaPass);

  console.log('  ' + '─'.repeat(70));
  if (aaFails.length === 0) {
    console.log(`  ${grn}✓${reset} All ${results.length} pairs pass WCAG AA.`);
    if (aaaFails.length > 0) {
      console.log(`  ${yel}!${reset} ${aaaFails.length} pair(s) below AAA — informational, not gating.`);
    } else {
      console.log(`  ${grn}✓${reset} All eligible pairs also pass AAA.`);
    }
  } else {
    console.log(`  ${red}✗ ${aaFails.length} of ${results.length} pairs FAIL WCAG AA${reset}`);
  }
  console.log();
}

/* ─── 6. Exit code ──────────────────────────────────────────────── */
const failed = results.filter(r => !r.pass);
const aaaFailed = AAA ? results.filter(r => !r.err && r.aaaBar && !r.aaaPass) : [];
process.exit(failed.length + aaaFailed.length > 0 ? 1 : 0);
