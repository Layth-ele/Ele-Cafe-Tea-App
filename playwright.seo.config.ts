import { defineConfig } from '@playwright/test';

/**
 * Playwright config — SEO smoke tests.
 *
 * Scope: verify the SEO contract on a deployed URL. These tests fetch
 * raw HTML and validate JSON-LD, canonicals, sitemap, and robots.txt.
 * They do NOT execute JavaScript — that's the point: catch regressions
 * in the prerendered head where most non-JS crawlers see them.
 *
 * --- Target URL logic ---
 *
 * TEST_BASE_URL not set (default):
 *   → Hits https://elecafe.ca (production).
 *   → No local server is started. Use this for a quick production smoke.
 *
 * TEST_BASE_URL=http://localhost:4173 (or any localhost/127.0.0.1 URL):
 *   → Starts `vite preview` automatically before the tests run.
 *   → Requires dist/ to exist. Build first: `npm run build`.
 *   → This is what the seo.yml CI workflow does on every PR.
 *
 * TEST_BASE_URL=https://elecafe-preview-foo.web.app:
 *   → Hits the Firebase preview channel directly; no local server.
 *
 * --- Why a separate config ---
 *   - Different testDir (tests/seo, not tests/visual)
 *   - gifts-hydrated.spec.ts needs a real browser (JS execution);
 *     smoke.spec.ts uses raw HTTP via `request`. Both live here.
 *   - Different reporter expectations (these are external probes,
 *     can fail for network reasons unrelated to code)
 */

const LOCAL_PORT = 4173;

// Boot a local preview server when TEST_BASE_URL is localhost, or when
// it is not set but CI is asking for a local run (seo.yml sets the var).
// When TEST_BASE_URL points at a remote host we leave it alone.
const testUrl  = process.env.TEST_BASE_URL ?? `https://elecafe.ca`;
const isLocal  = testUrl.includes('localhost') || testUrl.includes('127.0.0.1');

export default defineConfig({
  testDir: './tests/seo',

  forbidOnly: !!process.env.CI,
  retries:    process.env.CI ? 1 : 0,
  workers:    process.env.CI ? 2 : undefined,
  timeout:    30_000,

  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'playwright-report-seo' }]]
    : [['list']],

  use: {
    baseURL: testUrl,
    extraHTTPHeaders: {
      // Identify ourselves so site logs can correlate test traffic.
      'User-Agent': 'ElecafeSeoSmoke/1.0',
    },
  },

  projects: [
    { name: 'seo', testMatch: /.*\.spec\.ts/ },
  ],

  // Only start a preview server when the target is localhost.
  // Mirrors the pattern in playwright.perf.config.ts.
  // dist/ must exist before this runs — the seo.yml CI workflow
  // runs `npm run build` as its preceding step.
  webServer: isLocal ? {
    command:            `vite preview --port ${LOCAL_PORT}`,
    url:                `http://localhost:${LOCAL_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout:            60_000,
  } : undefined,
});
