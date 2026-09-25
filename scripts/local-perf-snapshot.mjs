/**
 * scripts/local-perf-snapshot.mjs
 *
 * Minimal performance snapshot. Spins up Chrome via puppeteer-core,
 * navigates to each public route, collects Performance API + Web Vitals
 * measurements via the page's runtime.
 *
 * What this is NOT: a full Lighthouse run. There's no scoring rubric
 * here, no opportunities analysis, no accessibility scan. This is a
 * spot-check: are the core web vitals in range for the local preview
 * build, and do all routes render without throwing?
 *
 * When the deployed CI environment runs `lhci autorun` against the
 * production URL, it gets the real scores. This script is the bridge
 * for verifying locally that the build doesn't regress LCP/FCP/CLS
 * before you push.
 *
 * Usage:
 *   1. npm run build
 *   2. npm run preview &       (or: npx vite preview --port 4173 &)
 *   3. node scripts/local-perf-snapshot.mjs
 */

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME_PATH = process.env.CHROME_PATH
  || '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome';
const PREVIEW_URL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';

const ROUTES = [
  { name: 'home',          path: '/' },
  { name: 'products',      path: '/products' },
  { name: 'tea-profile',   path: '/tea-profile/black/english-breakfast' },
  { name: 'cart',          path: '/cart' },
  { name: 'gifts',         path: '/gifts' },
  { name: 'about',         path: '/about' },
  { name: 'contact',       path: '/contact' },
  { name: 'login',         path: '/login' },
  { name: 'signup',        path: '/signup' },
];

// Web Vitals collection script — injected into the page. Listens for
// the standard PerformanceObserver entries and resolves once we have
// LCP, FCP, and an accumulated CLS value.
function getMetricsScript() {
  return `(() => new Promise(resolve => {
    const metrics = { fcp: null, lcp: null, cls: 0 };

    // FCP — fires once on first paint.
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.name === 'first-contentful-paint') metrics.fcp = e.startTime;
      }
    }).observe({ type: 'paint', buffered: true });

    // LCP — keep updating until idle.
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length) metrics.lcp = entries[entries.length - 1].startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    // CLS — sum unexpected layout shifts in 1s windows.
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) metrics.cls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });

    // Give the page 4 seconds of quiet time before reporting. LCP
    // candidates can move late if a hero image lazy-loads.
    setTimeout(() => resolve(metrics), 4000);
  }))()`;
}

async function main() {
  console.log(`Chrome:  ${CHROME_PATH}`);
  console.log(`Preview: ${PREVIEW_URL}`);
  console.log();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-features=HttpsOnlyMode,HttpsUpgrades',
    ],
  });

  const results = [];
  let hadError = false;

  for (const { name, path } of ROUTES) {
    const url = `${PREVIEW_URL}${path}`;
    const t0 = Date.now();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      const metrics = await page.evaluate(getMetricsScript());
      const elapsed = Date.now() - t0;
      const status = metrics.lcp != null && metrics.lcp < 2000 ? '✓' : metrics.lcp != null ? '⚠' : '?';
      console.log(`${status} ${name.padEnd(15)} FCP=${Math.round(metrics.fcp || 0)}ms  LCP=${Math.round(metrics.lcp || 0)}ms  CLS=${(metrics.cls || 0).toFixed(3)}  (${elapsed}ms)`);
      results.push({ name, path, ...metrics, ok: true });
      await page.close();
    } catch (err) {
      console.log(`✗ ${name.padEnd(15)} ERROR: ${err.message}`);
      results.push({ name, path, ok: false, error: err.message });
      hadError = true;
    }
  }

  await browser.close();

  // Write report.
  fs.writeFileSync('/tmp/perf-snapshot.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    chromeVersion: '131.0.6778.204',
    previewUrl: PREVIEW_URL,
    results,
  }, null, 2));
  console.log('\nReport: /tmp/perf-snapshot.json');

  // Summary gate — roadmap calls for LCP < 2000ms on /, /products, /tea-profile.
  const critical = results.filter(r => r.ok && ['home', 'products', 'tea-profile'].includes(r.name));
  const failingLcp = critical.filter(r => (r.lcp || 9999) >= 2000);
  if (failingLcp.length === 0 && critical.length > 0) {
    console.log('Gate: LCP < 2000ms on critical routes — PASS');
  } else if (failingLcp.length > 0) {
    console.log(`Gate: LCP < 2000ms — ${failingLcp.length} route(s) over budget:`);
    for (const r of failingLcp) {
      console.log(`  ${r.name}: LCP=${Math.round(r.lcp)}ms`);
    }
  }

  process.exit(hadError ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(2);
});
