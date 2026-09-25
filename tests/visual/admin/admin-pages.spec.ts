import { test, expect, settleForScreenshot } from '../fixtures';

/**
 * Visual regression — admin pages.
 *
 * Phase 0.4 of the UI/UX roadmap. Runs in playwright.config.ts's
 * `admin-state` project (desktop-only — admin UI isn't mobile-optimized
 * by design and tracking mobile baselines for it would be high churn
 * for low signal).
 *
 * Loads tests/.auth/admin.json — produced by playwright.setup.ts after
 * signing in as `playwright-test-admin` with the `admin: true` custom
 * claim. The Firestore security rules require the user doc to ALSO
 * have role: 'admin'; provision that in the test project's seed.
 *
 * Stability notes:
 *   - Admin tables show real Firestore data. The test project must
 *     have a deterministic, non-empty set of products + orders +
 *     customers so the row counts and table contents match the
 *     baseline.
 *   - Pagination defaults to page 1; if the test data exceeds one
 *     page worth, only the first page is captured. That's fine —
 *     pagination drift on later pages won't break the visual diff.
 */
const PAGES: Array<{ name: string; path: string }> = [
  { name: 'admin-overview',    path: '/admin'             },
  { name: 'admin-products',    path: '/admin/products'    },
  { name: 'admin-orders',      path: '/admin/orders'      },
  { name: 'admin-customers',   path: '/admin/customers'   },
  { name: 'admin-analytics',   path: '/admin/analytics'   },
  { name: 'admin-settings',    path: '/admin/settings'    },
  { name: 'admin-promotions',  path: '/admin/promotions'  },
];

const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) {
  test.describe(`admin theme:${theme}`, () => {
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
