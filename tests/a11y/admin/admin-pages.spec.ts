import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility regression — admin pages.
 *
 * Phase 0.4 of the UI/UX roadmap. Single theme (light) only — admin
 * UI doesn't have a separate dark-mode visual treatment that needs
 * separate verification, and the dark-mode token system from
 * tokens.css applies uniformly across all surfaces.
 *
 * Why we still axe-scan admin even though customers never see it:
 *   1. Internal users (your own staff) have a11y needs too —
 *      keyboard-only operators, screen-reader users, low-vision users
 *      may staff the admin UI. They get the same standard.
 *   2. Many WCAG violations in admin tables (large tables without
 *      headers, sortable columns without ARIA, action buttons
 *      without labels) are common patterns developers cargo-cult
 *      into customer-facing tables. Catching them in admin first
 *      stops the cargo cult.
 *   3. Many jurisdictions (US Section 508 refresh, EU EN 301 549)
 *      require workforce a11y too, not just consumer-facing.
 */
type Theme = 'light' | 'dark';

const PAGES: Array<{ name: string; path: string }> = [
  { name: 'admin-overview',    path: '/admin'            },
  { name: 'admin-products',    path: '/admin/products'   },
  { name: 'admin-orders',      path: '/admin/orders'     },
  { name: 'admin-customers',   path: '/admin/customers'  },
  { name: 'admin-analytics',   path: '/admin/analytics'  },
  { name: 'admin-settings',    path: '/admin/settings'   },
  { name: 'admin-promotions',  path: '/admin/promotions' },
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
  /* Admin pages often run a Firestore query on mount that needs
   * longer to complete than customer pages — bumped to 1500ms. */
  await page.waitForTimeout(1500);
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
