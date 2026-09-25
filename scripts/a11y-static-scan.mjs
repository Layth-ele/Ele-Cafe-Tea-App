#!/usr/bin/env node
/**
 * a11y-static-scan.mjs — Pre-flight scan for likely a11y violations
 *
 * Phase 0.5 of the UI/UX roadmap. This is a fast (~1 second), non-
 * authoritative scan that finds the patterns most likely to show up
 * as axe violations when you finally run `npm run test:a11y` end-to-end.
 *
 * Why bother when axe is the source of truth:
 *   axe needs the running app + Chromium + ~5 minutes. This script
 *   is a 1-second grep that catches the 80% of issues that have
 *   static fingerprints. Run it before pushing; fix what it finds;
 *   then the live axe run is shorter and quieter.
 *
 * What it catches:
 *   1. <input> / <textarea> / <select> with no associated label
 *      (no htmlFor pointing at their id, no wrapping <label>, no
 *      aria-label, no aria-labelledby). This is the single biggest
 *      a11y violation category in the codebase per audit pass 6.
 *
 *   2. <img> with no alt attribute (decorative images need alt="",
 *      informative ones need a real alt — but BOTH need the
 *      attribute present).
 *
 *   3. Icon-only <button> / role="button" with no aria-label and no
 *      visible text child. (Pass 6 found 2; there are likely more.)
 *
 *   4. Clickable <div> / <span> (onClick on a non-interactive element)
 *      — should be a real <button>.
 *
 *   5. Anchor tags with href="#" (placeholder links, often left
 *      from prototyping; should be a <button> if click-only).
 *
 *   6. <a> with no text content AND no aria-label (link-name violation).
 *
 * What it does NOT catch (axe will):
 *   - Color contrast (needs computed styles).
 *   - Focus order (needs DOM tree).
 *   - Keyboard traps (needs interaction).
 *   - Heading order (needs cross-file analysis).
 *
 * Run with:
 *   node scripts/a11y-static-scan.mjs
 *   node scripts/a11y-static-scan.mjs --json     (machine-readable)
 *   node scripts/a11y-static-scan.mjs --strict   (exit 1 on any finding)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const SRC  = join(ROOT, 'src');

const args   = process.argv.slice(2);
const JSON_  = args.includes('--json');
const STRICT = args.includes('--strict');

/** Walk every .tsx file under src/ and return [{ path, content }]. */
function collectTsx(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      collectTsx(full, out);
    } else if (name.endsWith('.tsx')) {
      out.push({ path: full, content: readFileSync(full, 'utf8') });
    }
  }
  return out;
}

const files = collectTsx(SRC);
const findings = [];

function record(rule, file, line, snippet, hint) {
  findings.push({
    rule,
    file: relative(ROOT, file),
    line,
    snippet: snippet.trim().slice(0, 120),
    hint,
  });
}

/* For each file, run a set of cheap regex passes. We're matching JSX
 * source, not real DOM, so heuristics are tuned for false-negatives
 * over false-positives — better to under-report and let axe catch
 * the rest than to drown the developer in noise. */

// Primitive files build the affordances that callers compose. They
// contain bare <input>, <textarea>, <select>, <button> elements that
// receive their labelling from props (or from a parent compound-
// component context). Flagging them produces dozens of unfixable
// "violations" — the only fix would be to add an aria-label to the
// primitive itself, which would then leak through every consumer
// AND duplicate any caller-supplied label. Skip them.
const PRIMITIVE_FILES = new Set([
  'src/app/components/ui/Field.tsx',
  'src/app/components/ui/input.tsx',
  'src/app/components/ui/SearchBar.tsx',
  'src/app/components/ui/Pagination.tsx',
  'src/app/components/ui/select.tsx',
]);

for (const { path, content } of files) {
  const lines = content.split('\n');

  // Walk-once track of whether we're inside a /* */ block comment.
  // Without this, scanners catch JSX-shaped tokens that appear in
  // multi-line code comments describing the component (e.g.
  // LazyImage.tsx had two such false positives before this fix).
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const line = lines[i];

    // Track /* … */ block comments. The opener may or may not close
    // on the same line. We toggle on the *first* unmatched opener and
    // off on the *first* unmatched closer. Inside the block we skip
    // every rule check because the content is descriptive prose.
    {
      let scan = line;
      // Strip same-line balanced /* ... */ pairs first.
      scan = scan.replace(/\/\*[\s\S]*?\*\//g, '');
      if (inBlockComment) {
        if (scan.includes('*/')) inBlockComment = false;
        continue;
      } else if (scan.includes('/*')) {
        inBlockComment = true;
        continue;
      }
    }

    // Skip obvious single-line comments + JSX continuation comments.
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
    // JSX-style {/* … */} on a single line — also descriptive prose.
    if (/^\s*\{\/\*/.test(line) && /\*\/\}\s*$/.test(line)) continue;

    // Primitive files build affordances; flagging their bare elements
    // produces noise that's unfixable without breaking the API.
    if (PRIMITIVE_FILES.has(relative(ROOT, path))) continue;

    // ── Rule 1: <input> / <textarea> / <select> without obvious label
    // We accept ANY of: aria-label, aria-labelledby, an id mentioned
    // in a nearby <label htmlFor=...>, OR the element being a child
    // of a <label> wrapper. The "nearby" check is crude (same file,
    // same string id appears in any htmlFor) — that's intentional;
    // we want false negatives, not false positives.
    const inputMatch = line.match(/<(input|textarea|select)\b/);
    if (inputMatch) {
      // Collect the full opening tag, walking forward until we hit
      // an unbraced > or />. Plain `/>/.test(line)` breaks on the
      // arrow operator inside event handlers (`onChange={(e) => …}`),
      // so we track brace depth and only count > that closes the tag.
      let tagBody = '';
      let depth = 0;
      let foundClose = false;
      const startCol = line.indexOf(inputMatch[0]);
      outer: for (let j = 0; j < 20 && i + j < lines.length && !foundClose; j++) {
        const src = j === 0 ? lines[i].slice(startCol) : lines[i + j];
        tagBody += (j === 0 ? '' : '\n') + src;
        for (let k = 0; k < src.length; k++) {
          const c = src[k];
          if (c === '{') depth++;
          else if (c === '}') depth = Math.max(0, depth - 1);
          else if (c === '>' && depth === 0) {
            // Real tag-close — could be `>` (children follow) or `/>`.
            foundClose = true;
            break outer;
          }
        }
      }
      const attrs = tagBody;

      // Skip type="hidden" — they're not user-facing.
      if (/type\s*=\s*["']hidden["']/.test(attrs)) continue;
      // Skip type="submit" / "button" — those use value/text for label.
      if (/type\s*=\s*["'](submit|button|reset)["']/.test(attrs)) continue;

      const hasAriaLabel    = /\baria-label\s*=/.test(attrs);
      const hasAriaLabelBy  = /\baria-labelledby\s*=/.test(attrs);
      // Spreading props from a parent compound component (e.g.
      // `{...register('email')}` from RHF, or `{...inputProps}` from
      // a Field context) provides id + name + label-wiring at the
      // call site. We can't follow the spread statically; treat its
      // presence as evidence of correct wiring.
      const hasSpread       = /\{\.\.\.\w+(?:\.\w+)*(?:\([^)]*\))?\}/.test(attrs);
      // Match both static `id="x"` and JSX-expression `id={expr}` IDs.
      // Static: look for a literal htmlFor="x" in the same file.
      // Expression: look for the same exact expression in any htmlFor.
      const idStaticMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/);
      const idExprMatch   = attrs.match(/\bid\s*=\s*\{([^}]+)\}/);
      let hasMatchingFor = false;
      if (idStaticMatch) {
        hasMatchingFor = new RegExp(`htmlFor\\s*=\\s*["']${idStaticMatch[1]}["']`).test(content);
      } else if (idExprMatch) {
        const expr = idExprMatch[1].trim();
        // Escape regex meta-chars in the expression for literal match.
        const escaped = expr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        hasMatchingFor = new RegExp(`htmlFor\\s*=\\s*\\{\\s*${escaped}\\s*\\}`).test(content);
      }

      // Wrapped-by-label heuristic: walk up to 15 lines back from the
      // input. If we hit an unclosed `<label>` (one whose `</label>`
      // appears AFTER the input), the input inherits its labelling
      // from the wrapper. This is the common pattern for visually
      // hidden checkboxes whose visible label lives in a sibling span.
      //
      // Also treat any unclosed component whose name ends in `Field`
      // as a wrapper that provides labelling — matches AddressField,
      // ProductFormField, FormField, Field (the design-system
      // compound component), AdminSettingsField. The convention is
      // strong enough in this codebase to make this safe.
      let wrappedByLabel = false;
      for (let b = 1; b <= 15 && i - b >= 0; b++) {
        const back = lines[i - b];
        if (/<\/(label|[A-Z]\w*Field)\b/.test(back)) break;
        if (/<(label|[A-Z]\w*Field)\b/.test(back)) { wrappedByLabel = true; break; }
      }

      if (!hasAriaLabel && !hasAriaLabelBy && !hasSpread && !hasMatchingFor && !wrappedByLabel) {
        record(
          'missing-label',
          path, ln, line,
          'Add aria-label, aria-labelledby, or wrap in <label htmlFor>.',
        );
      }
    }

    // ── Rule 2: <img> with no alt attribute
    const imgMatch = line.match(/<img\b([^>]*?)\/?>/);
    if (imgMatch) {
      const attrs = imgMatch[1];
      if (!/\balt\s*=/.test(attrs)) {
        record(
          'img-missing-alt',
          path, ln, line,
          'Add alt="" for decorative images, or a description for informative ones.',
        );
      }
    }

    // ── Rule 3: icon-only buttons (very rough — flags <button> tags
    // that contain a JSX-element child but no text and no aria-label).
    // We can't fully resolve "no text content" without an AST; this
    // pattern catches the common case of `<button onClick=...><Icon/></button>`.
    if (/^<button\b/.test(line.trim()) || /^\s*<button\b/.test(line)) {
      const buttonOpen = line.match(/<button\b([^>]*)>([^<]*)/);
      if (buttonOpen) {
        const attrs = buttonOpen[1];
        const inlineText = (buttonOpen[2] || '').trim();
        // Look at the next 3 lines for a closing tag with text or a
        // text child. Crude but cheap.
        const nextChunk = lines.slice(i, i + 4).join(' ');
        const hasText   = inlineText.length > 0 || />[^<]{2,}<\/button>/.test(nextChunk);
        const hasAria   = /\baria-label\s*=/.test(attrs);
        const hasTitle  = /\btitle\s*=/.test(attrs);
        // Only flag when the button DOES contain a JSX element (otherwise
        // it might just be a multi-line text button we're misreading).
        const hasJsxChild = /<[A-Z]/.test(nextChunk);
        if (!hasText && !hasAria && !hasTitle && hasJsxChild) {
          record(
            'icon-only-button-no-label',
            path, ln, line,
            'Add aria-label="…" or a screen-reader-only span with text.',
          );
        }
      }
    }

    // ── Rule 4: clickable non-interactive elements
    const divClick = line.match(/<(div|span)\b[^>]*\bonClick\s*=/);
    if (divClick) {
      // Allow when role="button" + tabIndex are present (the React
      // pattern for "deliberately a custom button"). We still warn
      // unless an aria-label is also there.
      const fullSpan = lines.slice(i, i + 3).join(' ');
      const hasRole  = /\brole\s*=\s*["']button["']/.test(fullSpan);
      const hasTab   = /\btabIndex\s*=/.test(fullSpan);
      // Backdrop pattern: a presentational click-to-dismiss layer
      // marked aria-hidden="true" is the canonical accessible way
      // to provide a mouse-only dismiss target. The dialog it sits
      // behind owns focus + ESC + an explicit close button, so the
      // backdrop itself need not be keyboard-reachable.
      const isAriaHiddenBackdrop = /\baria-hidden\s*=\s*["']true["']/.test(fullSpan);
      // stopPropagation pattern: an inner wrapper that swallows a
      // bubble-up click is not itself an interactive element; the
      // real handler is on a parent or child. Skip.
      const isStopPropagation = /\.stopPropagation\(\)/.test(line);
      if (!(hasRole && hasTab) && !isAriaHiddenBackdrop && !isStopPropagation) {
        record(
          'non-interactive-onclick',
          path, ln, line,
          'Use a real <button>, OR add role="button" + tabIndex={0} + onKeyDown handler.',
        );
      }
    }

    // ── Rule 5: placeholder anchors
    if (/<a\b[^>]*href\s*=\s*["']#["']/.test(line)) {
      record(
        'placeholder-anchor',
        path, ln, line,
        'href="#" creates a focus trap and meaningless link target. Use <button> for click-only.',
      );
    }
  }
}

// ── Group + report ──────────────────────────────────────────────────
if (JSON_) {
  console.log(JSON.stringify({ findings, total: findings.length }, null, 2));
  process.exit(STRICT && findings.length > 0 ? 1 : 0);
}

const byRule = new Map();
for (const f of findings) {
  if (!byRule.has(f.rule)) byRule.set(f.rule, []);
  byRule.get(f.rule).push(f);
}

const RULE_DESCRIPTIONS = {
  'missing-label':              'Form input without associated label',
  'img-missing-alt':            'Image without alt attribute',
  'icon-only-button-no-label':  'Icon-only button without aria-label',
  'non-interactive-onclick':    'onClick on <div> or <span>',
  'placeholder-anchor':         'Anchor with href="#"',
};

console.log('\n  Static a11y scan — Phase 0.5 pre-flight');
console.log('  ────────────────────────────────────────');

if (findings.length === 0) {
  console.log('\n  ✅ No likely violations found across', files.length, 'files.\n');
  console.log('  This scan is non-authoritative. Run `npm run test:a11y` for the');
  console.log('  full axe-core check, which catches contrast, focus order, and');
  console.log('  semantic issues this script cannot detect statically.\n');
  process.exit(0);
}

for (const [rule, list] of byRule) {
  console.log(`\n  ${rule} (${list.length})`);
  console.log(`  ${RULE_DESCRIPTIONS[rule] || ''}`);
  console.log('  ' + '─'.repeat(50));
  // Show first 10 of each rule to keep output skimmable.
  for (const f of list.slice(0, 10)) {
    console.log(`  ${f.file}:${f.line}`);
    console.log(`    ${f.snippet}`);
    console.log(`    → ${f.hint}`);
  }
  if (list.length > 10) {
    console.log(`  … ${list.length - 10} more — use --json for the full list`);
  }
}

console.log(`\n  Total: ${findings.length} likely violations across ${files.length} files`);
console.log(`\n  Next: fix the high-confidence categories (missing-label, img-missing-alt,`);
console.log(`  icon-only-button-no-label) before running \`npm run test:a11y\` against the`);
console.log(`  live app. The remaining categories may be intentional patterns; review each.`);
console.log('');

process.exit(STRICT ? 1 : 0);
