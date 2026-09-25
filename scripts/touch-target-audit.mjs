#!/usr/bin/env node
/**
 * Phase 9 improvement — touch target audit.
 *
 * WCAG 2.5.5 (Target Size, Enhanced, AAA) requires 44×44 CSS pixels.
 * WCAG 2.5.8 (Target Size, Minimum, AA, added in WCAG 2.2) requires
 * 24×24 CSS pixels with sufficient spacing.
 *
 * This script statically scans design.css for interactive-element
 * selectors (.btn, [role=button], a, .toggle, .stepper, etc.) and
 * extracts their width/height. Selectors smaller than 24×24 (AA fail)
 * are reported as errors. Selectors between 24-44 (below AAA, passes
 * AA) are reported as warnings. ≥44×44 passes both.
 *
 * Limitations:
 *   - Doesn't see runtime sizing (Tailwind utilities, inline styles,
 *     content-driven). A 24×24 icon-button can still be padded into
 *     a 48×48 hit area at runtime.
 *   - Heuristic: matches selector patterns that look interactive.
 *     False negatives possible for unconventionally named selectors.
 *
 * Treat output as a starting list for manual review, not a perfect
 * audit. The runtime check via Playwright (boundingBox of every
 * interactive role) is the precise companion — added separately as
 * tests/a11y/touch-targets.spec.ts.
 *
 * Exit 0 on no AA failures. Warnings (AA pass, AAA fail) don't fail
 * the build.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const CSS_FILE  = join(REPO_ROOT, 'src/styles/design.css');

const WCAG_AA_MIN  = 24;
const WCAG_AAA_MIN = 44;

const INTERACTIVE_PATTERNS = [
  /\.btn[\w-]*\b/,                // .btn, .btn-primary, .btn-add, .tc-add-btn
  /\.icon-btn[\w-]*\b/,            // dedicated icon buttons
  /\bbutton\b/,                   // raw <button>
  /\[role=["']?button["']?\]/,     // role="button"
  /\.cd-stepper-btn\b/,            // cart drawer stepper
  /\.toggle\b/,                    // Phase 10 Toggle primitive
  /\.wl-heart-btn\b/,              // Phase 11 wishlist heart
  /\.nav-cart-btn\b/,              // nav cart icon
  /\.nav-icon\b/,                  // top-nav icons
];

const SIZE_OVERRIDE_ALLOWLIST = new Set([
  // Selectors that legitimately render smaller than 24×24 because their
  // hit area is supplied by a wrapping element (CSS pseudo-element,
  // padding, parent button) OR they aren't real touch targets.
  // Add only after manual review.
  '.nav-icon svg',     // SVG sized 19×19; parent .nav-icon-btn provides the 44+ hit area
  '.icon-md',          // generic icon-only size class
  '.icon-sm',
  '.icon-lg',
  '.icon-xs',
  '.btn-spinner',      // loading-state pseudo-element inside a parent .btn
  '.sr-only',          // screen-reader-only utility class (1×1px is the spec)
  '.toggle .toggle-thumb', // decorative; parent .toggle is the click target
  '.toggle[data-size="sm"] .toggle-thumb',
]);

function parseRules(css) {
  // Phase 9 touch-target audit improvement: strip /* ... */ comments
  // before parsing. Otherwise commentary like "/* Button styles */"
  // gets captured as a selector ending in "Button" and matches the
  // /button/ pattern.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let depth = 0;
  let buffer = '';
  let line = 1;
  let bodyStart = 0;
  let currentSelector = '';
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '\n') line++;
    if (ch === '{') {
      if (depth === 0) {
        currentSelector = buffer.trim();
        bodyStart = i + 1;
        buffer = '';
      } else {
        buffer += ch;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        if (currentSelector && !currentSelector.startsWith('@')) {
          rules.push({ selector: currentSelector, body: stripped.slice(bodyStart, i), line });
        }
        currentSelector = '';
        buffer = '';
      } else {
        buffer += ch;
      }
    } else {
      buffer += ch;
    }
  }
  return rules;
}

function isInteractiveSelector(sel) {
  return INTERACTIVE_PATTERNS.some((p) => p.test(sel));
}

function extractSize(body) {
  // Extract numeric values for width / height / min-width / min-height.
  // Returns { w, h } in px, or null if no explicit sizing.
  const w = body.match(/(?:^|[\s;{])(?:min-)?width\s*:\s*(\d+(?:\.\d+)?)px/);
  const h = body.match(/(?:^|[\s;{])(?:min-)?height\s*:\s*(\d+(?:\.\d+)?)px/);
  const pad = body.match(/(?:^|[\s;{])padding\s*:\s*(\d+(?:\.\d+)?)px/);
  // Heuristic: if width OR height present, also fold padding into the
  // effective hit area (the user's finger lands on padding too).
  const padPx = pad ? parseFloat(pad[1]) : 0;
  return {
    w: w ? parseFloat(w[1]) + padPx * 2 : null,
    h: h ? parseFloat(h[1]) + padPx * 2 : null,
  };
}

function audit() {
  if (!existsSync(CSS_FILE)) {
    console.error(`Cannot find ${CSS_FILE}`);
    process.exit(2);
  }
  const css = readFileSync(CSS_FILE, 'utf8');
  const rules = parseRules(css);

  const fails = []; // < AA
  const warns = []; // AA pass, AAA fail
  let scanned = 0;

  for (const rule of rules) {
    const sel = rule.selector.split(',')[0].trim();
    if (!isInteractiveSelector(sel)) continue;
    if (SIZE_OVERRIDE_ALLOWLIST.has(sel)) continue;
    const { w, h } = extractSize(rule.body);
    if (w === null && h === null) continue;     // no explicit size — assume content-driven
    scanned++;

    const minDim = Math.min(w ?? Infinity, h ?? Infinity);
    if (minDim < WCAG_AA_MIN) {
      fails.push({ selector: sel, w, h, line: rule.line });
    } else if (minDim < WCAG_AAA_MIN) {
      warns.push({ selector: sel, w, h, line: rule.line });
    }
  }

  return { fails, warns, scanned };
}

const { fails, warns, scanned } = audit();
console.log('Phase 9 — Touch target audit');
console.log('─────────────────────────────');
console.log(`Sized interactive selectors scanned: ${scanned}`);
console.log(`WCAG 2.5.8 AA failures (<24px):       ${fails.length}`);
console.log(`WCAG 2.5.5 AAA warnings (<44px):      ${warns.length}`);
console.log();

if (warns.length > 0) {
  console.log('Warnings (AA pass, AAA fail — consider enlarging or allow-listing):');
  for (const w of warns) {
    console.log(`  ${w.selector} (${w.w}×${w.h}px) — design.css:${w.line}`);
  }
  console.log();
}
if (fails.length > 0) {
  console.log('✗ AA FAILURES:');
  for (const f of fails) {
    console.log(`  ${f.selector} (${f.w}×${f.h}px) — design.css:${f.line}`);
  }
  console.log();
  console.log('Fix: enlarge to ≥24×24px (AA) or ≥44×44px (AAA preferred),');
  console.log('     OR allow-list with manual-review comment in scripts/touch-target-audit.mjs.');
  process.exit(1);
}
console.log('✓ No WCAG 2.5.8 AA touch target failures.');
process.exit(0);
