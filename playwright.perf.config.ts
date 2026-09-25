/**
 * Playwright config for the synthetic perf gate (Phase 8).
 *
 * Distinct from playwright.a11y.config.ts because perf tests run
 * SERIAL (consistency in measurement) and need a much longer
 * per-test timeout (10 throttled runs × ~5s each = 50s+).
 *
 * Boots its own preview server unless BASE_URL is set externally
 * (CI sets BASE_URL to the deployed preview URL).
 */
import { defineConfig, devices } from '@playwright/test';

const PREVIEW_PORT = 4174;
const BASE_URL    = process.env.BASE_URL ?? `http://localhost:${PREVIEW_PORT}`;

export default defineConfig({
  testDir: './tests/perf',
  timeout: 180_000,           // 3 minutes — 10 runs × 3s LCP wait + nav + setup
  fullyParallel: false,       // serial — consistency for perf measurement
  workers: 1,
  retries: 1,                 // one retry for flake; threshold violations should still fail
  reporter: [
    ['list'],
    ['json', { outputFile: '/tmp/synthetic-perf-results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    // CDP needs Chromium; ignore other browser projects for perf.
    browserName: 'chromium',
    // Don't trace by default — keeps run time down.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium-throttled',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.BASE_URL ? undefined : {
    command: `vite preview --port=${PREVIEW_PORT}`,
    url: `http://localhost:${PREVIEW_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
