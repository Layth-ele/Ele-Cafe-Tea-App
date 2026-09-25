import { test, expect, settleForScreenshot } from './fixtures';

/**
 * Public-pages visual regression.
 *
 * Each page is snapshot in both themes. Combined with the two
 * projects configured in `playwright.config.ts` (desktop + mobile),
 * the total count is:
 *
 *   PAGES (7) × THEMES (2) × PROJECTS (2) = 28 snapshots
 *
 * All pages here are reachable without authentication. Protected and
 * admin pages are deferred — they need a seeded user + cart fixture.
 * See tests/visual/README.md for the pattern.
 */

const PAGES: Array<{ name: string; path: string; /* optional setup before snapshot */ setup?: (p: any) => Promise<void> }> = [
  { name: 'home',         path: '/' },
  { name: 'products',     path: '/products' },
  { name: 'tea-profile',  path: '/tea-profile/black/english-breakfast' },
  { name: 'cart-empty',   path: '/cart' },
  { name: 'about',        path: '/about' },
  { name: 'contact',      path: '/contact' },
  { name: 'login',        path: '/login' },
];

const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) {
  test.describe(`theme:${theme}`, () => {
    for (const { name, path, setup } of PAGES) {
      test(`${name} — ${path}`, async ({ pageInTheme }) => {
        const page = await pageInTheme(theme);
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        if (setup) await setup(page);
        await settleForScreenshot(page);

        /* Snapshot the full page — catches header, hero, and footer
           in one go. fullPage:true scrolls internally. */
        await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
          fullPage: true,
        });
      });
    }
  });
}
