#!/usr/bin/env node
/**
 * Phase 8 improvement — local Lighthouse snapshot.
 *
 * Runs Lighthouse against the local preview server (or a deployed URL
 * if PREVIEW_URL is set) and emits per-route scores for Performance,
 * Accessibility, Best Practices, SEO. Companion to the existing
 * scripts/local-perf-snapshot.mjs (which captures FCP/LCP/CLS via
 * puppeteer-core directly) — this one runs the full Lighthouse
 * audit so you can spot regressions in the same metrics the
 * lighthouse-ci.yml workflow gates on, without waiting for CI.
 *
 * Dependencies: lighthouse + chrome-launcher (or reuse the existing
 * puppeteer-core Chrome path). This script uses dynamic imports so
 * the project doesn't need to declare them in package.json — they're
 * imported only when the script runs. Install ad-hoc:
 *
 *   npm install --no-save lighthouse chrome-launcher
 *
 * Usage:
 *   node scripts/local-lighthouse.mjs                       # all 5 routes
 *   node scripts/local-lighthouse.mjs /                     # just home
 *   PREVIEW_URL=https://ele-cafe-d7237.web.app node scripts/local-lighthouse.mjs
 *
 * Output: a JSON summary plus a human-readable per-route table. The
 * JSON file lands at /tmp/lighthouse-snapshot.json so the CI workflow
 * (or you) can pick it up and compare to prior runs.
 */
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const PREVIEW_URL = process.env.PREVIEW_URL ?? 'http://localhost:4173';
const CHROME_PATH = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const DEFAULT_ROUTES = ['/', '/products', '/about', '/contact', '/login'];
const cliRoutes = process.argv.slice(2).filter((a) => a.startsWith('/'));
const ROUTES = cliRoutes.length > 0 ? cliRoutes : DEFAULT_ROUTES;

// Thresholds — match lighthouserc.json so this script flags the same
// regressions CI would.
const THRESHOLDS = {
  performance:   0.92,
  accessibility: 0.95,
  bestPractices: 0.90,
  seo:           0.90,
};

async function loadLighthouse() {
  try {
    const lighthouse = (await import('lighthouse')).default;
    const chromeLauncher = await import('chrome-launcher');
    return { lighthouse, chromeLauncher };
  } catch (err) {
    console.error('lighthouse + chrome-launcher not installed.');
    console.error('Install ad-hoc:  npm install --no-save lighthouse chrome-launcher');
    console.error('');
    console.error(err);
    process.exit(2);
  }
}

async function maybeStartPreview() {
  // If PREVIEW_URL points to localhost:4173, we own the preview server.
  // Otherwise, assume an external URL and skip.
  if (!PREVIEW_URL.includes('localhost')) return null;
  // eslint-disable-next-line no-console
  console.log('Starting vite preview server…');
  const child = spawn('npx', ['vite', 'preview', '--port=4173'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  // Give the preview server time to bind. Could probe but a short
  // sleep is robust enough for a manual perf tool.
  await wait(3000);
  return child;
}

function rateScore(score, threshold) {
  if (score >= threshold) return '✓';
  if (score >= threshold - 0.05) return '⚠';
  return '✗';
}

async function main() {
  const { lighthouse, chromeLauncher } = await loadLighthouse();
  const previewServer = await maybeStartPreview();

  const chrome = await chromeLauncher.launch({
    chromePath: CHROME_PATH,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  const results = [];
  let anyFail = false;

  try {
    for (const route of ROUTES) {
      const url = `${PREVIEW_URL.replace(/\/$/, '')}${route}`;
      // eslint-disable-next-line no-console
      console.log(`\nAuditing ${url}…`);

      const lhr = await lighthouse(url, {
        port:         chrome.port,
        output:       'json',
        logLevel:     'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      });

      const cats = lhr.lhr.categories;
      const row = {
        route,
        performance:    cats.performance.score,
        accessibility:  cats.accessibility.score,
        bestPractices:  cats['best-practices'].score,
        seo:            cats.seo.score,
        lcp:            lhr.lhr.audits['largest-contentful-paint']?.numericValue,
        cls:            lhr.lhr.audits['cumulative-layout-shift']?.numericValue,
        tbt:            lhr.lhr.audits['total-blocking-time']?.numericValue,
      };
      results.push(row);

      if (row.performance   < THRESHOLDS.performance ||
          row.accessibility < THRESHOLDS.accessibility ||
          row.bestPractices < THRESHOLDS.bestPractices ||
          row.seo           < THRESHOLDS.seo) {
        anyFail = true;
      }
    }
  } finally {
    await chrome.kill();
    if (previewServer) {
      try { previewServer.kill(); } catch { /* ignore */ }
    }
  }

  // Table output
  console.log('');
  console.log('Phase 8 — Lighthouse local snapshot');
  console.log('────────────────────────────────────────────────────────────────');
  console.log('Route                         Perf  A11y  BP    SEO   LCP    CLS    TBT');
  for (const r of results) {
    const perf  = (r.performance   * 100).toFixed(0).padStart(3);
    const a11y  = (r.accessibility * 100).toFixed(0).padStart(3);
    const bp    = (r.bestPractices * 100).toFixed(0).padStart(3);
    const seo   = (r.seo           * 100).toFixed(0).padStart(3);
    const lcp   = r.lcp !== undefined ? `${(r.lcp/1000).toFixed(2)}s`.padStart(6) : '   —';
    const cls   = r.cls !== undefined ? r.cls.toFixed(3).padStart(6) : '   —';
    const tbt   = r.tbt !== undefined ? `${r.tbt.toFixed(0)}ms`.padStart(6) : '    —';
    const route = r.route.padEnd(28);
    const perfMark = rateScore(r.performance,   THRESHOLDS.performance);
    const a11yMark = rateScore(r.accessibility, THRESHOLDS.accessibility);
    const bpMark   = rateScore(r.bestPractices, THRESHOLDS.bestPractices);
    const seoMark  = rateScore(r.seo,           THRESHOLDS.seo);
    console.log(`${route} ${perf}${perfMark} ${a11y}${a11yMark} ${bp}${bpMark} ${seo}${seoMark} ${lcp} ${cls} ${tbt}`);
  }

  writeFileSync('/tmp/lighthouse-snapshot.json',
                JSON.stringify({ when: new Date().toISOString(), results }, null, 2));
  console.log('\nFull report:  /tmp/lighthouse-snapshot.json');

  if (anyFail) {
    console.log('\n✗ At least one route fell below threshold. See PHASE_8_PROGRESS.md for tuning tips.');
    process.exit(1);
  }
  console.log('\n✓ All routes meet Lighthouse thresholds.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
