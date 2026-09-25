/**
 * scripts/local-a11y-snapshot.mjs
 *
 * Run axe-core against every public route on the local preview build.
 * Replicates what tests/a11y/public-pages.spec.ts does but via
 * puppeteer-core directly so it works in environments where Playwright
 * can't download its Chromium (firewalled CDN, etc.).
 *
 * Loads axe-core's bundled JavaScript from node_modules, injects it
 * into each page, runs axe.run() with the same rule tags as the
 * Playwright spec, and reports violations.
 *
 * Usage:
 *   1. npm run build
 *   2. npx vite preview --port 4173 --host 127.0.0.1 &
 *   3. node scripts/local-a11y-snapshot.mjs
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const CHROME_PATH = process.env.CHROME_PATH
  || '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome';
const PREVIEW_URL = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';

const ROUTES = [
  { name: 'home',            path: '/' },
  { name: 'products',        path: '/products' },
  { name: 'tea-profile',     path: '/tea-profile/black/english-breakfast' },
  { name: 'cart-empty',      path: '/cart' },
  { name: 'login',           path: '/login' },
  { name: 'signup',          path: '/signup' },
  { name: 'gifts',           path: '/gifts' },
  { name: 'about',           path: '/about' },
  { name: 'contact',         path: '/contact' },
  { name: 'shipping-policy', path: '/shipping-policy' },
  { name: 'refund-policy',   path: '/refund-policy' },
  { name: 'privacy-policy',  path: '/privacy-policy' },
  { name: 'not-found',       path: '/this-route-does-not-exist' },
];

const THEMES = ['light', 'dark'];

// Read axe-core's bundled JS once
const axeSource = fs.readFileSync(path.join(PROJECT_ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

async function main() {
  console.log(`Chrome:  ${CHROME_PATH}`);
  console.log(`Preview: ${PREVIEW_URL}`);
  console.log(`Routes:  ${ROUTES.length} × themes: ${THEMES.length} = ${ROUTES.length * THEMES.length} baselines`);
  console.log();

  let browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  let totalViolations = 0;
  let totalCritical = 0;
  let totalSerious = 0;
  let totalModerate = 0;
  let totalBaselines = 0;
  const summary = [];

  for (const theme of THEMES) {
    for (const { name, path } of ROUTES) {
      // Re-launch browser if it crashed last iteration
      try {
        const pages = await browser.pages();
        if (pages.length === 0 || !browser.isConnected()) throw new Error('disconnected');
      } catch {
        console.log('  (re-launching browser after crash)');
        try { await browser.close(); } catch {}
        browser = await puppeteer.launch({
          executablePath: CHROME_PATH,
          headless: 'new',
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        });
      }

      let page;
      try {
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        // Set theme via localStorage before any script runs
        await page.evaluateOnNewDocument((t) => {
          localStorage.setItem('ele-cafe-theme', t);
        }, theme);
        await page.goto(`${PREVIEW_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.evaluate(() => document.fonts.ready);
        await new Promise(r => setTimeout(r, 600)); // Suspense + first-render settle

        // Inject axe-core into the page
        await page.evaluate(axeSource);
        const results = await page.evaluate(() => {
          return window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22a', 'wcag22aa'] },
          });
        });

        // Diagnostic — for any meta-viewport violation, also capture the
        // page's ACTUAL viewport meta tag content + a SHA of the full head.
        // That tells us whether axe is hallucinating or seeing real content.
        const metaVp = results.violations.find(v => v.id === 'meta-viewport');
        if (metaVp) {
          const realViewport = await page.evaluate(() => ({
            allViewports: Array.from(document.querySelectorAll('meta[name="viewport"]')).map(m => m.outerHTML),
            allMetas:     document.querySelectorAll('meta').length,
            headLen:      document.head.innerHTML.length,
            // Any user-scalable substring anywhere
            usSearch:     document.documentElement.outerHTML.match(/.{30}user-scalable.{50}/s)?.[0] ?? null,
          }));
          console.log(`  diag ${theme}/${name}: real viewport = ${JSON.stringify(realViewport.allViewports)}`);
          console.log(`  diag ${theme}/${name}: axe-reported  = ${JSON.stringify(metaVp.nodes[0].html.slice(0,150))}`);
          if (realViewport.usSearch) console.log(`  diag ${theme}/${name}: us-search    = ${realViewport.usSearch}`);
        }

        const blocking = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
        const moderate = results.violations.filter(v => v.impact === 'moderate');
        totalViolations += results.violations.length;
        for (const v of results.violations) {
          if (v.impact === 'critical') totalCritical++;
          else if (v.impact === 'serious') totalSerious++;
          else if (v.impact === 'moderate') totalModerate++;
        }
        totalBaselines++;

        const status = blocking.length === 0 ? '✓' : '✗';
        const moderateNote = moderate.length > 0 ? `  +${moderate.length} moderate` : '';
        console.log(`${status} ${theme}/${name.padEnd(17)} ${blocking.length === 0 ? 'clean' : blocking.length + ' blocking'}${moderateNote}`);

        if (blocking.length > 0) {
          for (const v of blocking) {
            console.log(`    [${v.impact}] ${v.id}: ${v.help}`);
            for (const node of v.nodes) {
              console.log(`      target: ${JSON.stringify(node.target)}`);
              console.log(`      html:   ${node.html.slice(0, 200)}`);
              // axe's `any` array has the actual color values for color-contrast checks
              for (const c of node.any) {
                if (c.data && typeof c.data === 'object') {
                  console.log(`      data:   ${JSON.stringify(c.data).slice(0, 300)}`);
                }
              }
            }
          }
        }

        // Persist full violation data (including computed colors, target selectors, HTML)
        summary.push({
          theme, name, path,
          blocking: blocking.length,
          moderate: moderate.length,
          violations: results.violations.map(v => ({
            id:     v.id,
            impact: v.impact,
            help:   v.help,
            nodes:  v.nodes.map(n => ({
              target: n.target,
              html:   n.html.slice(0, 300),
              data:   n.any?.find(c => c.data)?.data ?? null,
            })),
          })),
        });
      } catch (err) {
        console.log(`✗ ${theme}/${name.padEnd(17)} ERROR: ${err.message.slice(0, 80)}`);
        summary.push({ theme, name, path, error: err.message });
      } finally {
        if (page) try { await page.close(); } catch {}
      }
    }
  }

  try { await browser.close(); } catch {}

  fs.writeFileSync('/tmp/a11y-snapshot.json', JSON.stringify({
    timestamp:     new Date().toISOString(),
    chromeVersion: '131.0.6778.204',
    previewUrl:    PREVIEW_URL,
    baselinesRun:  totalBaselines,
    totalCritical, totalSerious, totalModerate,
    summary,
  }, null, 2));

  console.log();
  console.log(`Baselines run:   ${totalBaselines}`);
  console.log(`Critical:        ${totalCritical}`);
  console.log(`Serious:         ${totalSerious}`);
  console.log(`Moderate:        ${totalModerate}`);
  console.log(`Gate (critical+serious = 0): ${totalCritical + totalSerious === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Report:          /tmp/a11y-snapshot.json`);

  process.exit(totalCritical + totalSerious === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(2);
});
