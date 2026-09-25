#!/usr/bin/env node
/**
 * scripts/layout-audit.mjs — runtime readability + responsive audit.
 *
 * Loads every public page at phone / tablet / desktop widths in real
 * Chrome and reports, per page:
 *   overflow  — the page scrolls sideways (always a bug)
 *   tiny      — visible text below 11px, or lowercase text below 12px
 *   minPx     — the smallest visible text size
 *   targets   — tappable controls smaller than 24×24px (WCAG 2.2 AA)
 *
 * Usage:
 *   npm run dev                      # or any running build
 *   node scripts/layout-audit.mjs [baseUrl] [--json out.json] [--shots dir]
 *
 * Complements the static scans (touch-target-audit, contrast-check):
 * this one measures what the browser actually renders.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const BASE = args.find((a) => /^https?:/.test(a)) ?? 'http://localhost:5173';
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const shotDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;

const PAGES = [
  '/', '/products', '/products/black', '/tea-profile/black/assam', '/collections/caffeine-free',
  '/cafe', '/pairings', '/pairings/pear-danish', '/gifts', '/about', '/contact',
  '/shipping-policy', '/refund-policy', '/privacy-policy', '/terms', '/login', '/signup', '/cart', '/wishlist',
];
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

function measure() {
  const vw = document.documentElement.clientWidth;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  let tiny = 0, minPx = 99;
  const tinySamples = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!['SCRIPT', 'STYLE', 'SVG', 'PATH', 'NOSCRIPT'].includes(el.tagName.toUpperCase())
        && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
        && visible(el) && !el.closest('[aria-hidden="true"], .sr-only, .live-region')) {
      const cs = getComputedStyle(el);
      const px = parseFloat(cs.fontSize);
      if (px < minPx) minPx = px;
      // Readability rule: nothing below 11px; lowercase text needs 12px+
      // (11px is fine for letter-spaced UPPERCASE labels and tags).
      if (px < 11 || (px < 12 && cs.textTransform !== 'uppercase')) {
        tiny++;
        if (tinySamples.length < 6) tinySamples.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')} ${px}px "${el.textContent.trim().slice(0, 24)}"`);
      }
    }
  }
  let targets = 0;
  const targetSamples = [];
  for (const el of document.querySelectorAll('a[href], button, [role="button"], input:not([type="hidden"]), select, textarea')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    // Visually-hidden inputs behind custom controls (1×1 sr-only) aren't targets.
    if (r.width <= 2 || r.height <= 2) continue;
    if (r.width < 24 || r.height < 24) {
      // Inline text links inside a sentence are exempt (WCAG 2.5.8).
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
      targets++;
      if (targetSamples.length < 4) targetSamples.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
  }
  return { overflow: document.documentElement.scrollWidth > vw + 1, tiny, minPx, targets, tinySamples, targetSamples };
}

const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  for (const p of PAGES) {
    try {
      await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      const m = await page.evaluate(measure);
      results.push({ page: p, viewport: vp.name, ...m });
      if (shotDir) {
        mkdirSync(shotDir, { recursive: true });
        await page.screenshot({ path: path.join(shotDir, `${vp.name}${p.replace(/\//g, '_') || '_home'}.png`) });
      }
    } catch (err) {
      results.push({ page: p, viewport: vp.name, error: String(err.message ?? err).slice(0, 120) });
    }
  }
  await page.close();
}
await browser.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('page', 28) + pad('viewport', 9) + pad('overflow', 9) + pad('tiny', 6) + pad('minPx', 7) + 'targets');
for (const r of results) {
  if (r.error) { console.log(pad(r.page, 28) + pad(r.viewport, 9) + 'ERROR ' + r.error); continue; }
  console.log(pad(r.page, 28) + pad(r.viewport, 9) + pad(r.overflow ? 'YES' : '-', 9) + pad(r.tiny, 6) + pad(r.minPx, 7) + r.targets);
}
const totals = results.reduce((a, r) => ({ overflow: a.overflow + (r.overflow ? 1 : 0), tiny: a.tiny + (r.tiny ?? 0), targets: a.targets + (r.targets ?? 0) }), { overflow: 0, tiny: 0, targets: 0 });
console.log(`\nTOTAL  pages with overflow: ${totals.overflow}  ·  tiny-text elements: ${totals.tiny}  ·  small targets: ${totals.targets}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
