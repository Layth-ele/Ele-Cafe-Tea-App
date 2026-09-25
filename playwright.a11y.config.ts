import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — accessibility checks (axe-core).
 *
 * Scope: every public, protected, and admin route is loaded and scanned
 * by axe for WCAG 2.1/2.2 A/AA violations of severity 'serious' or
 * 'critical' (and 'moderate' too — see public-pages.spec.ts). Distinct
 * from the visual regression suite (./playwright.config.ts) — this one
 * is functional, fast, and runs both themes through one chromium project.
 *
 * Phase 0.4 of the UI/UX roadmap added auth-bearing projects:
 *   user-a11y  → /checkout, /orders, /account
 *   admin-a11y → /admin/*
 *
 * Run with:
 *   npm run test:a11y
 *   npm run test:a11y:ui     # interactive
 */
export default defineConfig({
  testDir: './tests/a11y',

  /* Phase 0.4 — same auth fixture as the visual suite. The setup module
   * is idempotent: if state files already exist and are <30 min old it
   * skips the mint step. */
  globalSetup: './playwright.setup.ts',

  forbidOnly: !!process.env.CI,
  retries:    process.env.CI ? 1 : 0,
  workers:    process.env.CI ? 1 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-a11y' }]]
    : [['list'],   ['html', { open: 'never', outputFolder: 'playwright-report-a11y' }]],

  use: {
    baseURL: 'http://localhost:5173',
    trace:   'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    /* Phase 0.4 — auth-bearing a11y projects. Test files filtered by
     * directory so the same spec file isn't picked up by the public
     * project AND an auth project. */
    {
      name: 'user-a11y',
      testMatch: /protected\/.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: 'tests/.auth/user.json',
      },
    },
    {
      name: 'admin-a11y',
      testMatch: /admin\/.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: 'tests/.auth/admin.json',
      },
    },
  ],

  webServer: {
    command:             'npm run dev',
    url:                 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout:             120_000,
  },
});
