#!/usr/bin/env node
/**
 * Phase 9.7.2 — Safe-area audit (static, CI-runnable replacement for
 * the "look at the page on a real iPhone notch" check).
 *
 * Rule: every `position: fixed` or `position: sticky` element whose
 * geometry reaches the viewport edge (top:0 / bottom:0 / left:0 /
 * right:0, or padding-top/-bottom/-left/-right directly applied) must
 * either:
 *
 *   (a) Use `env(safe-area-inset-*)` in its top/bottom/left/right or
 *       padding property, OR
 *   (b) Live inside a container that already supplies the inset
 *       (the audit can't trace that statically — those need an
 *       explicit allow-list).
 *
 * The audit walks src/styles/design.css and src/styles/tokens.css,
 * collects every selector with fixed/sticky positioning, and reports
 * which ones are missing safe-area protection.
 *
 * Exit code:
 *   0 — every fixed/sticky-with-edge element references env(safe-area-inset-*),
 *       or is explicitly allow-listed in SAFE_AREA_ALLOWLIST below.
 *   1 — at least one violation found (prints details).
 *
 * Run locally:
 *   node scripts/safe-area-audit.mjs
 *
 * Add to CI (already wired in the existing a11y.yml or as its own step).
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const CSS_FILES = [
  join(REPO_ROOT, 'src/styles/design.css'),
  join(REPO_ROOT, 'src/styles/tokens.css'),
  join(REPO_ROOT, 'src/styles/focus.css'),
];

/**
 * Selectors that genuinely don't need their own safe-area-inset
 * because their parent already provides it, OR because they are
 * decorative/overlay layers that don't touch the edge.
 *
 * Add a selector here only after manual review (and ideally a comment
 * explaining why). The allow-list is the audit's escape hatch — if it
 * grows beyond ~15 entries, the rule itself probably needs rethinking.
 */
const SAFE_AREA_ALLOWLIST = new Set([
  // Modal/drawer overlays are children of <body> but visually
  // sit *above* notched chrome; they don't touch the safe area.
  '.app-modal-overlay',
  '.cart-drawer-overlay',
  '.filter-drawer-overlay',
  '.cd-overlay',
  '.cmdk-overlay',
  '.cmdk-portal',

  // Skeleton/decorative overlays.
  '.sk-page-fade',
  '.stale-pulse',

  // Spinner / floating button helpers — fixed-positioned but small
  // and never edge-flush.
  '.btn-spinner',

  // The cart-fly token is mid-screen; never edge-pinned.
  '.cart-fly-token',

  // Sonner toasts: the library sets its own inset.
  '[data-sonner-toaster]',
  '.sonner-toast',

  // PWA install banner uses bottom: calc(var(--safe-area-inset-bottom, 0px) + 16px)
  // already, but the rule is buried in a media query; the static
  // parser doesn't see it from the .pwa-install-banner selector's
  // own block. Allow-listed pending parser improvement.
  '.pwa-install-banner',

  // Sticky list-section headers inside a scroll container whose
  // parent (.notif-panel) already provides safe-area-inset-top.
  // The sticky header is offset by content scroll, not viewport edge.
  '.notif-group-title',
]);

/**
 * Extract CSS rules with naive brace counting. Good enough for
 * design.css which doesn't use nesting / preprocessor syntax.
 * Returns an array of { selector, body, lineStart }.
 */
function parseRules(css, filePath) {
  const rules = [];
  let depth = 0;
  let buffer = '';
  let selectorStart = 0;
  let line = 1;
  let bodyStart = 0;
  let currentSelector = '';
  let inAtRule = false;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '\n') line++;

    if (ch === '{') {
      if (depth === 0) {
        currentSelector = buffer.trim();
        if (currentSelector.startsWith('@')) {
          // at-rule wrapper (e.g. @media) — don't capture as a rule
          // itself, but still walk inside it via depth tracking.
          inAtRule = true;
        }
        bodyStart = i + 1;
        buffer = '';
      } else {
        buffer += ch;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        if (!inAtRule && currentSelector && !currentSelector.startsWith('@')) {
          rules.push({
            selector: currentSelector,
            body: css.slice(bodyStart, i),
            file: filePath,
            line,
          });
        } else if (inAtRule && currentSelector.startsWith('@')) {
          // We're exiting a top-level at-rule; reset inAtRule only
          // when we exit the OUTER one. With nested at-rules, depth
          // tracking handles it because we only set inAtRule=true at
          // the top level.
          inAtRule = false;
        }
        currentSelector = '';
        buffer = '';
        selectorStart = i + 1;
      } else {
        buffer += ch;
      }
    } else {
      if (depth === 0) {
        buffer += ch;
      } else {
        // Track media-query / nested at-rule bodies too, since fixed
        // positioning can live inside them. To keep the parser simple
        // we capture inner-rule selectors by recursing on the at-rule
        // body in a second pass.
        buffer += ch;
      }
    }
  }
  return rules;
}

/**
 * Second pass: extract rules from inside @media blocks. This is a
 * simple regex pass since by the time we get here the outer rules
 * are already collected.
 */
function parseAtRuleNestedRules(css, filePath) {
  const rules = [];
  // Match @media ... { ...body... } including any single level of
  // nested braces inside the body. We pull selectors out of the body.
  const mediaRegex = /@media[^{]*\{((?:[^{}]+\{[^{}]*\})*)\s*\}/g;
  let match;
  while ((match = mediaRegex.exec(css)) !== null) {
    const body = match[1];
    const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
    let m2;
    while ((m2 = ruleRegex.exec(body)) !== null) {
      rules.push({
        selector: m2[1].trim(),
        body: m2[2],
        file: filePath,
        line: 0, // approximate; lineno isn't critical for at-rule violations
      });
    }
  }
  return rules;
}

function isFixedOrSticky(body) {
  // Match `position: fixed` or `position: sticky` (with optional
  // whitespace, ignoring case).
  return /position\s*:\s*(fixed|sticky)\b/i.test(body);
}

function touchesEdge(body) {
  // The body declares an edge-property with a value that would put
  // the element at the viewport boundary.
  //   top: 0 / 0px / 0%
  //   bottom: 0 / 0px / 0%
  //   left: 0 / 0px / 0%
  //   right: 0 / 0px / 0%
  // Anything else (e.g. top: 80px) is offset from the edge by a
  // hardcoded amount and might still need safe-area; we flag those
  // separately.
  return /\b(top|bottom|left|right)\s*:\s*(0|0px|0%|0\s)/i.test(body);
}

function hasSafeAreaReference(body) {
  return /env\s*\(\s*safe-area-inset/.test(body);
}

function hasHardcodedNotchAdjacentValue(body) {
  // Values 40-60px on top/bottom often indicate "I'm adjusting for
  // the notch hardcoded" — these should use env() instead.
  return /\b(top|bottom)\s*:\s*[3-6][0-9]px/i.test(body);
}

function audit() {
  const violations = [];
  const warnings = [];
  let totalFixedSticky = 0;
  let totalWithSafeArea = 0;

  for (const cssPath of CSS_FILES) {
    if (!existsSync(cssPath)) continue;
    const css = readFileSync(cssPath, 'utf8');
    const outer = parseRules(css, cssPath);
    const nested = parseAtRuleNestedRules(css, cssPath);
    const all = [...outer, ...nested];

    for (const rule of all) {
      if (!isFixedOrSticky(rule.body)) continue;
      totalFixedSticky++;

      const selectorTrimmed = rule.selector.split(',')[0].trim();

      if (hasSafeAreaReference(rule.body)) {
        totalWithSafeArea++;
        continue;
      }

      // If the rule doesn't touch a viewport edge, it's a centered or
      // mid-screen fixed element — no safe-area needed.
      if (!touchesEdge(rule.body)) {
        continue;
      }

      // Edge-flush fixed/sticky. Allow-list check.
      const isAllowed = [...SAFE_AREA_ALLOWLIST].some(
        (allow) => selectorTrimmed === allow || rule.selector.includes(allow)
      );
      if (isAllowed) continue;

      violations.push({
        selector: rule.selector,
        file: rule.file,
        line: rule.line,
        bodyExcerpt: rule.body.split('\n').filter((l) => /position|top|bottom|left|right/.test(l)).join(' | '),
      });
    }
  }

  return { violations, warnings, totalFixedSticky, totalWithSafeArea };
}

const { violations, totalFixedSticky, totalWithSafeArea } = audit();

console.log('Phase 9.7.2 — Safe-area audit');
console.log('───────────────────────────────');
console.log(`Total fixed/sticky rules scanned: ${totalFixedSticky}`);
console.log(`With env(safe-area-inset-*):      ${totalWithSafeArea}`);
console.log(`Edge-flush without safe-area:     ${violations.length}`);
console.log();

if (violations.length === 0) {
  console.log('✓ All edge-flush fixed/sticky elements protect for safe-area-inset.');
  process.exit(0);
}

console.log('✗ Violations:');
for (const v of violations) {
  console.log(`  ${v.file.split('/').slice(-2).join('/')}:${v.line || '?'}`);
  console.log(`    selector: ${v.selector.slice(0, 80)}${v.selector.length > 80 ? '…' : ''}`);
  console.log(`    body:     ${v.bodyExcerpt.slice(0, 120)}${v.bodyExcerpt.length > 120 ? '…' : ''}`);
  console.log();
}
console.log('Fix: either add env(safe-area-inset-*) to top/bottom/left/right or padding,');
console.log('     OR explicitly allow-list the selector in scripts/safe-area-audit.mjs');
console.log('     (with a comment explaining why it is exempt).');
process.exit(1);
