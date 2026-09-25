import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility regression — protected (authenticated) customer pages.
 *
 * Phase 0.4 of the UI/UX roadmap. Same axe rule-set as
 * tests/a11y/public-pages.spec.ts; runs in the `user-a11y` project
 * which loads the test-user storageState.
 *
 * Why a separate file: keeping protected and public specs separate
 * means a CI run that's only updating an admin page can be filtered
 * by spec path without false positives from public-only tests.
 */
type Theme = 'light' | 'dark';

const PAGES: Array<{ name: string; path: string }> = [
  { name: 'checkout', path: '/checkout' },
  { name: 'orders',   path: '/orders'   },
  { name: 'account',  path: '/account'  },
];

const THEMES: Theme[] = ['light', 'dark'];

async function setTheme(page: Page, theme: Theme) {
  await page.addInitScript((t) => {
    localStorage.setItem('ele-cafe-theme', t);
  }, theme);
}

async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

for (const theme of THEMES) {
  test.describe(`a11y theme:${theme}`, () => {
    for (const { name, path } of PAGES) {
      test(`${name} — ${path}`, async ({ page }) => {
        await setTheme(page, theme);
        await page.goto(path);
        await settle(page);

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .disableRules(['region'])
          .analyze();

        const blocking = results.violations.filter(
          v => v.impact === 'critical' || v.impact === 'serious' || v.impact === 'moderate'
        );
        const advisory = results.violations.filter(v => v.impact === 'minor');

        if (advisory.length > 0) {
          console.warn(
            `[a11y] ${name} (${theme}) — ${advisory.length} advisory:`,
            advisory.map(v => `${v.id} (${v.impact}): ${v.help}`).join('\n  '),
          );
        }

        expect(
          blocking,
          blocking
            .map(v =>
              `${v.id} [${v.impact}] — ${v.help}\n` +
              `  ${v.helpUrl}\n` +
              v.nodes.slice(0, 3).map(n => `  • ${n.target.join(' ')}`).join('\n')
            )
            .join('\n\n'),
        ).toEqual([]);
      });
    }
  });
}
