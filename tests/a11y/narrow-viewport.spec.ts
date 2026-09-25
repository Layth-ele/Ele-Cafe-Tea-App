/**
 * Phase 9 improvement — narrow-viewport coverage.
 *
 * The existing `tablet-viewport.spec.ts` covers iPad portrait/landscape.
 * This sister spec covers the OTHER end of the spectrum: the narrowest
 * phones in active use.
 *
 *   320 × 568  — Galaxy Z Fold (inner display when folded), 1st-gen iPhone SE
 *                still in use, oldest Android devices in service. 320 is the
 *                hard floor: anything narrower isn't real.
 *   360 × 800  — Galaxy S, Pixel base — the most-common Android width.
 *   375 × 667  — iPhone SE 2/3, iPhone 12 mini, iPhone 13 mini. ~15% of
 *                North-American iOS traffic.
 *
 * For each viewport × public route, we assert:
 *   - No horizontal scroll (content doesn't overflow the viewport width)
 *   - The h1 is visible (the page actually rendered, not blank)
 *   - The nav cart button is reachable (within viewport, not clipped)
 *   - No text content overflows its container with horizontal scroll
 *
 * Skipped: forms (LoginPage / SignupPage rendering quirks at narrow
 * widths are well-covered in the existing tests/a11y/keyboard-nav.spec.ts).
 */
import { test, expect, type Page } from '@playwright/test';

const VIEWPORTS = [
  { name: '320 — fold/old',   width: 320, height: 568 },
  { name: '360 — Android',    width: 360, height: 800 },
  { name: '375 — iPhone SE',  width: 375, height: 667 },
];

const ROUTES = [
  { name: 'home',        path: '/' },
  { name: 'products',    path: '/products' },
  { name: 'tea-profile', path: '/tea-profile/black/english-breakfast' },
  { name: 'cart-empty',  path: '/cart' },
  { name: 'about',       path: '/about' },
  { name: 'contact',     path: '/contact' },
];

async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    // Allow 1px tolerance for sub-pixel rounding.
    return doc.scrollWidth - doc.clientWidth > 1;
  });
}

async function getOverflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const overflowing: string[] = [];
    const viewport = window.innerWidth;
    const elements = document.querySelectorAll('body *');
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      // An element extending past the right edge by >2px is a real
      // overflow (the 2px floor allows for sub-pixel + 1px borders).
      if (rect.right > viewport + 2 && rect.width > 0 && rect.height > 0) {
        // Skip elements with explicit overflow:hidden parents — those
        // are intentional clipped layouts (e.g. carousels).
        const styles = getComputedStyle(el);
        if (styles.overflow === 'hidden' || styles.overflowX === 'hidden') continue;
        // Skip absolutely-positioned elements (often off-screen by design,
        // e.g. portal targets, sr-only mirrors).
        if (styles.position === 'absolute' || styles.position === 'fixed') continue;
        // Skip empty text nodes' parents (no visible content to overflow).
        if ((el as HTMLElement).innerText?.trim() === '' &&
            !(el instanceof HTMLImageElement)) continue;
        const id = el.tagName.toLowerCase() +
                   (el.id ? `#${el.id}` : '') +
                   (el.className ? `.${(el.className+'').split(' ').filter(Boolean).slice(0, 2).join('.')}` : '');
        overflowing.push(`${id} (rect.right=${rect.right.toFixed(0)}, vw=${viewport})`);
      }
    }
    return overflowing.slice(0, 5); // cap to 5 for readable failure messages
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`Phase 9 narrow viewport — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of ROUTES) {
      test(`${route.name}: no horizontal scroll`, async ({ page }) => {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        const overflowed = await hasHorizontalScroll(page);
        if (overflowed) {
          const offenders = await getOverflowingElements(page);
          throw new Error(
            `Horizontal scroll on ${route.path} at ${vp.width}px. ` +
            `Top offenders: ${JSON.stringify(offenders, null, 2)}`,
          );
        }
      });

      test(`${route.name}: h1 visible (page rendered)`, async ({ page }) => {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        const h1 = page.locator('h1').first();
        await expect(h1).toBeVisible({ timeout: 5000 });

        const box = await h1.boundingBox();
        expect(box, 'h1 must have non-zero bounding box').not.toBeNull();
        if (box) {
          expect(box.width, 'h1 must fit within viewport').toBeLessThanOrEqual(vp.width);
          // Top of h1 must be within first 3 screens of vertical space
          // (otherwise the user has to scroll a long way to see the
          // page identifier — bad mobile UX).
          expect(box.y, 'h1 must be near the top of the page').toBeLessThan(vp.height * 3);
        }
      });

      test(`${route.name}: nav cart button reachable`, async ({ page }) => {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        // The cart button is data-cart-icon now (Phase 10 wiring).
        const cartBtn = page.locator('[data-cart-icon]').first();
        await expect(cartBtn).toBeVisible({ timeout: 5000 });

        const box = await cartBtn.boundingBox();
        expect(box, 'cart button must have non-zero bounding box').not.toBeNull();
        if (box) {
          // Right edge within viewport (not clipped).
          expect(box.x + box.width, 'cart button right edge inside viewport').toBeLessThanOrEqual(vp.width);
        }
      });
    }
  });
}
