import { test as base, expect, Page } from '@playwright/test';

/**
 * A `page` fixture that applies a theme before any script runs.
 *
 * The app's `index.html` contains a pre-React script that reads
 * `localStorage.getItem('ele-cafe-theme')` and adds the `.dark` class to
 * `<html>` before React mounts. That means we must seed localStorage
 * BEFORE the first `page.goto()` — otherwise the page loads in the user's
 * default theme, flashes, and only then flips.
 *
 * Playwright's `addInitScript` runs before every navigation, perfect for this.
 *
 * Usage:
 *   test('home in dark', async ({ pageInTheme }) => {
 *     const page = await pageInTheme('dark');
 *     await page.goto('/');
 *     await expect(page).toHaveScreenshot('home-dark.png');
 *   });
 */

type Theme = 'light' | 'dark';

type Fixtures = {
  pageInTheme: (theme: Theme) => Promise<Page>;
};

export const test = base.extend<Fixtures>({
  pageInTheme: async ({ page }, use) => {
    await use(async (theme: Theme) => {
      await page.addInitScript((t) => {
        localStorage.setItem('ele-cafe-theme', t);
      }, theme);
      return page;
    });
  },
});

export { expect };

/**
 * After `page.goto()` completes, wait for the page to be visually stable:
 * fonts loaded, network settled, animations off. Call this right before
 * every `toHaveScreenshot()` to eliminate timing-related flakes.
 */
export async function settleForScreenshot(page: Page) {
  // 1. Wait for the DOM + initial resources. Do NOT use 'networkidle' —
  //    Firebase Firestore keeps a websocket open for real-time updates.
  await page.waitForLoadState('load');

  // 2. Wait for web fonts.
  await page.evaluate(() => document.fonts.ready);

  // 3. Kill animations AND hide dev-only / animated elements that cause
  //    layout instability between consecutive screenshot attempts.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
      /* TanStack Query devtools FAB — dev-only, not app UI */
      [data-rq-toolbar], [data-testid="rqd-status"] { display: none !important; }
      /* Marquee scrolls continuously via CSS animation on <marquee> or
         a scrolling container — hiding it eliminates the moving content
         that prevents consecutive screenshots from being identical.     */
      marquee, [role="marquee"], .announce, .announcement-bar,
      [class*="marquee"], [class*="Marquee"] { visibility: hidden !important; }
      /* Force all lazy-loaded images to load immediately (by disabling the
         loading='lazy' attribute's effect). Prevents height shifts when
         Playwright scrolls the page for fullPage screenshots. */
      img { content-visibility: visible !important; }
    `,
  });

  // 4. Wait for every <img> in the DOM to actually finish loading. Without
  //    this, images further down the page are still loading when Playwright
  //    scrolls to them during full-page capture — causing height shifts.
  await page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.all(
      images.map(img =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.addEventListener('load',  resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
              // Safety timeout — don't hang forever on a truly broken image
              setTimeout(resolve, 3000);
            })
      )
    );
  });

  // 5. One more paint frame for the stylesheet injection + image load to
  //    take effect on final layout.
  await page.waitForTimeout(150);
}
