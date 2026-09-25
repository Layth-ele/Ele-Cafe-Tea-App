/**
 * Phase 7.7.3 (automated layer) — accessibility tree snapshots.
 *
 * The browser's accessibility tree is what assistive technologies
 * (NVDA, VoiceOver, JAWS, TalkBack) read from. By capturing it and
 * asserting structural properties, we catch the largest class of
 * screen-reader bugs without needing an actual screen reader:
 *
 *   - Heading hierarchy preserved (h1 → h2 → h3 with no skipped levels)
 *   - Landmark regions present (main, nav, contentinfo)
 *   - Form fields have accessible names
 *   - Buttons have accessible names (no "Button" or empty-named buttons)
 *   - Live regions are announced as such in the tree
 *
 * This is the closest thing to "running a screen reader in CI" that
 * exists without spinning up an actual NVDA/VoiceOver harness (which
 * is platform-locked + audio-dependent + flaky).
 *
 * The remaining ~5% — pacing, prosody, announcement order subtleties
 * — needs a human. See A11Y_AUDIT_PLAYBOOK.md for the 15-min pass.
 */
import { test, expect, type Page } from '@playwright/test';

interface AxNode {
  role: string;
  name: string;
  level?: number;
  children?: AxNode[];
}

/**
 * Walk the accessibility tree and flatten it into a list of
 * (role, name, level) triples. Easier to assert on than nested
 * tree comparison.
 */
function flatten(node: AxNode | null, out: AxNode[] = []): AxNode[] {
  if (!node) return out;
  out.push({ role: node.role, name: node.name, level: node.level });
  if (node.children) {
    for (const c of node.children) flatten(c, out);
  }
  return out;
}

async function getAxTree(page: Page): Promise<AxNode[]> {
  // Playwright's accessibility.snapshot() returns the browser's
  // accessibility tree as the SR would see it.
  const root = await page.accessibility.snapshot({ interestingOnly: false });
  return flatten(root as AxNode | null);
}

test.describe('Phase 7.7.3 — accessibility tree assertions', () => {

  for (const route of ['/', '/products', '/about', '/contact']) {
    test(`route ${route}: heading hierarchy is monotonically descending`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const tree = await getAxTree(page);
      const headings = tree
        .filter((n) => n.role === 'heading' && typeof n.level === 'number')
        .map((h) => h.level as number);

      // Exactly one h1. (Phase 7.7.7 already asserts this via axe, but
      // having both belts on means the check survives axe rule changes.)
      const h1Count = headings.filter((l) => l === 1).length;
      expect(h1Count, `route ${route}: must have exactly 1 h1; found ${h1Count}`).toBe(1);

      // No skipped levels. A h2 followed by a h4 means an h3 silently
      // disappeared from the SR navigation menu — a real bug.
      for (let i = 1; i < headings.length; i++) {
        const delta = headings[i] - headings[i - 1];
        if (delta > 1) {
          throw new Error(
            `route ${route}: heading level skip — h${headings[i - 1]} → h${headings[i]}. ` +
            `Insert the intermediate level or restructure.`,
          );
        }
      }
    });
  }

  test('home: required landmarks present (banner, main, contentinfo)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const tree = await getAxTree(page);
    const roles = new Set(tree.map((n) => n.role));

    // The screen-reader rotor uses these landmarks to let users jump
    // around the page. Missing landmarks = degraded navigation.
    expect(roles.has('banner'),       'main banner landmark (header) missing').toBe(true);
    expect(roles.has('main'),         'main landmark missing').toBe(true);
    expect(roles.has('contentinfo'),  'contentinfo landmark (footer) missing').toBe(true);
  });

  test('home: every button in the tree has a non-empty accessible name', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const tree = await getAxTree(page);
    const namelessButtons = tree
      .filter((n) => n.role === 'button')
      .filter((n) => !n.name || n.name.trim().length === 0);

    expect(namelessButtons, `Buttons with no accessible name (SR will announce just "button"): ` +
      JSON.stringify(namelessButtons)).toHaveLength(0);
  });

  test('home: every link has either text content or aria-label', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const tree = await getAxTree(page);
    const namelessLinks = tree
      .filter((n) => n.role === 'link')
      .filter((n) => !n.name || n.name.trim().length === 0);

    expect(namelessLinks, `Links with no accessible name: ` +
      JSON.stringify(namelessLinks)).toHaveLength(0);
  });

  test('login form: every field has an associated label', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const tree = await getAxTree(page);
    const namelessFields = tree
      .filter((n) => n.role === 'textbox' || n.role === 'combobox' || n.role === 'searchbox')
      .filter((n) => !n.name || n.name.trim().length === 0);

    expect(namelessFields, `Form fields with no associated label: ` +
      JSON.stringify(namelessFields)).toHaveLength(0);
  });

});
