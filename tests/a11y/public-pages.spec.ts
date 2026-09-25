import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility regression — public pages.
 *
 * Each public route is loaded in both themes and scanned by axe-core
 * against the WCAG 2.1 A/AA + 2.2 A/AA rulesets. We fail the build on
 * any violation of severity `critical`, `serious`, or `moderate`. Only
 * `minor` (impact-impossible-to-quantify cosmetic issues like heading
 * order on landing pages) is advisory.
 *
 * Phase 5 step 3 of the perf roadmap tightened this gate from
 * "critical + serious" to also include moderate. The previous bar
 * was passing for "color contrast in dark-mode footer (4.3:1 vs
 * the WCAG AA 4.5:1 requirement)" — close, but not legally
 * defensible. With moderate now blocking, those edge cases get
 * fixed instead of accumulating.
 *
 * Why two themes: dark mode commonly regresses colour-contrast checks
 * that pass in light mode, so we scan both.
 *
 * Why no admin / protected routes: those need a seeded auth fixture
 * (out of scope for this suite — same constraint as the visual suite).
 *
 * To extend, add a route to PAGES below. To debug a failure, run
 * `npm run test:a11y:ui` and click the failing test — the trace shows
 * the page snapshot and axe will print the offending DOM nodes.
 *
 * If this test starts failing after a tightening (we just bumped the
 * gate to include `moderate`), the easiest fix is usually:
 *   - color-contrast → check tokens.css, verify foreground/background
 *     pair meets 4.5:1 for normal text, 3:1 for large text or icons.
 *   - link-name → ensure every <a> has either visible text or aria-label.
 *   - aria-required-children → check role usage; misnamed roles are
 *     a common cause.
 *   - landmark-one-main → exactly one <main> per page.
 */

type Theme = 'light' | 'dark';

const PAGES: Array<{ name: string; path: string }> = [
  { name: 'home',            path: '/' },
  { name: 'products',        path: '/products' },
  { name: 'tea-profile',     path: '/tea-profile/black/english-breakfast' },
  { name: 'cart-empty',      path: '/cart' },
  { name: 'login',           path: '/login' },
  { name: 'signup',          path: '/signup' },
  { name: 'gifts',           path: '/gifts' },
  { name: 'about',           path: '/about' },
  { name: 'contact',         path: '/contact' },
  { name: 'shipping-policy', path: '/shipping-policy' },
  { name: 'refund-policy',   path: '/refund-policy' },
  { name: 'privacy-policy',  path: '/privacy-policy' },
  // Phase 5 step 3 — added coverage. /404 catches the not-found page
  // which is a common a11y blind spot (often inherits no <main>).
  { name: 'not-found',       path: '/this-route-does-not-exist' },
];

const THEMES: Theme[] = ['light', 'dark'];

/** Apply the theme via localStorage before any script runs (matches the
 *  preboot script in index.html that sets <html class="dark">). */
async function setTheme(page: Page, theme: Theme) {
  await page.addInitScript((t) => {
    localStorage.setItem('ele-cafe-theme', t);
  }, theme);
}

/** Wait for the page to be visually settled — fonts loaded, images in. */
async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => document.fonts.ready);
  // Brief settle for React Suspense + Firestore initial load.
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
          // WCAG 2.1 A/AA is the legally-cited standard in most
          // jurisdictions (AODA, EAA, Section 508 refresh). 2.2 adds
          // newer rules for focus-visible, dragging movements, and
          // target-size that are good practice even where 2.2 isn't
          // mandated yet.
          .withTags([
            'wcag2a', 'wcag2aa',
            'wcag21a', 'wcag21aa',
            'wcag22aa',
          ])
          // Disable rules that are noisy in this kind of SPA without
          // adding meaningful safety. `region` complains about content
          // not in a landmark; we're inside <main> so it's a false flag
          // on small bits of UI like the toaster portal.
          .disableRules(['region'])
          .analyze();

        // Split by impact. Phase 5 step 3 promoted `moderate` from
        // advisory to blocking — it was the gap responsible for ~80%
        // of the dark-mode contrast issues that customers reported.
        const blocking = results.violations.filter(
          v => v.impact === 'critical' || v.impact === 'serious' || v.impact === 'moderate'
        );
        const advisory = results.violations.filter(
          v => v.impact === 'minor'
        );

        if (advisory.length > 0) {
          // Print but don't fail — these are typographic-hierarchy nits
          // (heading-order on landing pages with intentional design)
          // and similar style-guide-level concerns.
          console.warn(
            `[a11y] ${name} (${theme}) — ${advisory.length} advisory issue(s):`,
            advisory.map(v => `${v.id} (${v.impact}): ${v.help}`).join('\n  '),
          );
        }

        expect(
          blocking,
          // Format the failure message so the CI log shows exactly what
          // to fix without needing the trace viewer.
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
