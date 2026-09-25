import { test, expect, settleForScreenshot } from '../fixtures';

/**
 * Visual regression — authenticated customer pages.
 *
 * Phase 0.4 of the UI/UX roadmap. Runs in playwright.config.ts's
 * `user-state` and `user-state-mobile` projects, which load
 * tests/.auth/user.json — the storageState produced by
 * playwright.setup.ts after signing in as `playwright-test-user`.
 *
 * For these baselines to be stable, the test Firebase project must
 * have:
 *   • At least one order in /orders for the test UID.
 *   • At least one credit transaction (so /account renders the credit
 *     widget in its non-empty state).
 *   • A non-empty cart in their /carts/{uid} doc OR an empty cart —
 *     either is a valid baseline as long as it's stable across runs.
 *
 * If the seed differs between CI and local, you'll see baseline
 * mismatches. Document the test-project seed in your team's runbook.
 */
const PAGES: Array<{ name: string; path: string }> = [
  { name: 'checkout', path: '/checkout' },
  { name: 'orders',   path: '/orders'   },
  { name: 'account',  path: '/account'  },
];

const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) {
  test.describe(`auth-user theme:${theme}`, () => {
    for (const { name, path } of PAGES) {
      test(`${name} — ${path}`, async ({ pageInTheme }) => {
        const page = await pageInTheme(theme);
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        await settleForScreenshot(page);

        await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
          fullPage: true,
        });
      });
    }
  });
}
