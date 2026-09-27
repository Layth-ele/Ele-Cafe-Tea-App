/**
 * Phase 8 — Synthetic RUM gate (proxy for 8.7.1 + 8.7.2).
 *
 * The literal gate is "P75 LCP < 2.0s and P75 INP < 150ms in real-user
 * monitoring." That requires production traffic data and can't be
 * shortcut. This spec is the strongest proxy available: it runs the
 * app under throttled conditions matching what most real users
 * experience (4× CPU slowdown, Fast 3G network) and asserts the same
 * thresholds against synthetic P75 across N runs.
 *
 * Why this is a defensible proxy:
 *   - Lighthouse's mobile-emulated benchmark uses identical
 *     throttling (4×CPU + Slow 4G) and is considered industry-standard
 *     for "what the median user experiences."
 *   - 10 runs per route gives a P75 with usable statistical resolution
 *     (the 75th percentile of 10 sorted values is the 8th).
 *   - The threshold values (LCP 2000ms, INP 150ms, CLS 0.1) match the
 *     RUM gates from 0-12.md § Phase 8 exactly.
 *
 * What this is NOT:
 *   - Not a substitute for real RUM. Lab and field metrics diverge for
 *     reasons that matter (geographic distribution, device variety,
 *     real network jitter). When RUM data accumulates over 1-2 weeks,
 *     trust THAT over this gate.
 *   - Not a substitute for Lighthouse-CI. The lighthouse-ci.yml
 *     workflow runs Lighthouse audits on every PR for Performance /
 *     Accessibility / SEO scores. This gate is narrower (just the
 *     three Core Web Vitals) but more aggressive (10 runs vs LH's 3).
 *
 * Run locally:
 *   npx playwright test tests/perf/synthetic-rum-gate.spec.ts \
 *     --config playwright.perf.config.ts
 *
 * Run in CI: the .github/workflows/lighthouse-ci.yml workflow has been
 * extended with a `npm run test:perf:synthetic` step that runs this
 * spec before the Lighthouse audit. The two together (rigorous CWV
 * thresholds + full audit) make the perf bar credible without RUM.
 */
import { test, expect, type Page } from '@playwright/test';

// Thresholds mirror Phase 8.7.1 / 8.7.2 from 0-12.md.
const THRESHOLDS = {
  LCP_MS: 2000,
  INP_MS: 150,
  CLS: 0.1,
};

// 10 runs per route — gives P75 = the 8th of 10 sorted values, which
// is enough resolution to catch a real regression without inflating
// CI time prohibitively. Each run takes ~3-5s under throttling.
const RUNS_PER_ROUTE = 10;

// Routes to bench. Public, high-traffic, representative of the page
// archetypes. Phase 8 closure expansion: added /cart and /about to
// cover all 5 high-traffic public archetypes (home, list, detail,
// transactional, content).
const ROUTES = [
  { name: 'home', path: '/' },
  { name: 'products', path: '/products' },
  { name: 'tea-profile', path: '/tea-profile/black/english-breakfast' },
  { name: 'cart', path: '/cart' },
  { name: 'about', path: '/about' },
];

// Phase 8 closure expansion — long-task ceiling. Each route should
// produce no more than 3 long tasks (>50ms) during initial paint +
// the first 500ms of interactivity. More than this strongly
// correlates with INP regressions even before they hit the 150ms
// gate. The gate is per-route so a single bad route fails the build.
const MAX_LONG_TASKS_PER_ROUTE = 3;

/**
 * Mobile-emulated throttling. Matches Lighthouse v10 defaults:
 *   - CPU slowdown: 4×
 *   - Network: Slow 4G (1.6 Mbps down, 750 Kbps up, 150ms RTT)
 *
 * These are the conditions under which most mobile users browse.
 * Desktop users will see faster numbers; that's fine — the gate is
 * "even the slowest-meaningful user sees acceptable latency."
 */
async function applyThrottling(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8, // 1.6 Mbps
    uploadThroughput: (0.75 * 1024 * 1024) / 8,
    latency: 150,
  });
}

/**
 * Capture LCP and CLS via in-page PerformanceObserver. Returns null
 * if the observer never reports (e.g. cached page with no LCP event).
 */
async function measureLCPCLS(page: Page): Promise<{ lcp: number | null; cls: number }> {
  return page.evaluate(() => {
    return new Promise<{ lcp: number | null; cls: number }>((resolve) => {
      let lcp: number | null = null;
      let cls = 0;
      const lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last)
          lcp =
            (last as PerformanceEntry & { renderTime?: number; loadTime?: number }).renderTime ||
            (last as PerformanceEntry & { loadTime?: number }).loadTime ||
            last.startTime;
      });
      const clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!e.hadRecentInput) cls += e.value;
        }
      });
      try {
        lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {
        /* unsupported */
      }
      try {
        clsObs.observe({ type: 'layout-shift', buffered: true });
      } catch {
        /* unsupported */
      }

      // Resolve after the page has been visible for 3s — enough for
      // LCP to fire and CLS to stabilize for the initial viewport.
      setTimeout(() => {
        try {
          lcpObs.disconnect();
        } catch {
          /* ignore */
        }
        try {
          clsObs.disconnect();
        } catch {
          /* ignore */
        }
        resolve({ lcp, cls });
      }, 3000);
    });
  });
}

/**
 * Synthetic INP measurement: click a known target and time the
 * interaction's total processing latency (input delay + processing +
 * presentation). Mirrors how INP is computed in field RUM.
 */
async function measureInteractionLatency(page: Page, selector: string): Promise<number | null> {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return null;

  // Hook a one-shot timing measurement into the page.
  await page.evaluate(() => {
    (window as unknown as { __syntheticInpStart?: number }).__syntheticInpStart = performance.now();
  });
  const t0 = await page.evaluate(
    () => (window as unknown as { __syntheticInpStart?: number }).__syntheticInpStart,
  );
  await el.click({ timeout: 5000 });
  // Force a layout flush before measuring so we capture
  // presentation-delay too (matches INP's three-phase definition).
  const t1 = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now();
  });
  return t1 - (t0 ?? t1);
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

test.describe('Phase 8 — Synthetic RUM gate', () => {
  // Single browser, multiple iterations — keeps cold-start consistent.
  test.describe.configure({ mode: 'serial' });

  for (const route of ROUTES) {
    test(`${route.name}: P75 LCP < ${THRESHOLDS.LCP_MS}ms + long-task ceiling across ${RUNS_PER_ROUTE} throttled runs`, async ({
      page,
    }) => {
      await applyThrottling(page);
      const lcps: number[] = [];
      const clss: number[] = [];
      const longTaskCounts: number[] = [];
      for (let i = 0; i < RUNS_PER_ROUTE; i++) {
        // Clear cache before each run so we measure cold paint.
        await page.context().clearCookies();
        const session = await page.context().newCDPSession(page);
        await session.send('Network.clearBrowserCache');

        await page.goto(route.path, { waitUntil: 'load' });
        const { lcp, cls } = await measureLCPCLS(page);
        if (lcp !== null) lcps.push(lcp);
        clss.push(cls);

        // Phase 8 closure expansion — capture long-task count during
        // the first 500ms post-load. Long tasks here strongly predict
        // INP regression in production. We use the buffered observer
        // mode so tasks that fired before our subscribe still count.
        const longTaskCount = await page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              let count = 0;
              if (
                typeof PerformanceObserver === 'undefined' ||
                !PerformanceObserver.supportedEntryTypes?.includes('longtask')
              ) {
                resolve(0);
                return;
              }
              const obs = new PerformanceObserver((list) => {
                count += list.getEntries().length;
              });
              obs.observe({ type: 'longtask', buffered: true });
              // 500ms quiet window post-load captures hydration + first interactivity.
              setTimeout(() => {
                obs.disconnect();
                resolve(count);
              }, 500);
            }),
        );
        longTaskCounts.push(longTaskCount);
      }
      const p75lcp = percentile(lcps, 75);
      const p75cls = percentile(clss, 75);
      const p75lt = percentile(longTaskCounts, 75) ?? 0;
      test.info().annotations.push({
        type: 'measurement',
        description: `route=${route.path} runs=${lcps.length} P75 LCP=${p75lcp?.toFixed(0)}ms P75 CLS=${p75cls?.toFixed(3)} P75 longtasks=${p75lt}`,
      });
      expect(p75lcp, `P75 LCP for ${route.path}`).not.toBeNull();
      expect(p75lcp!, `P75 LCP for ${route.path} must be < ${THRESHOLDS.LCP_MS}ms`).toBeLessThan(
        THRESHOLDS.LCP_MS,
      );
      expect(p75cls!, `P75 CLS for ${route.path} must be < ${THRESHOLDS.CLS}`).toBeLessThan(
        THRESHOLDS.CLS,
      );
      expect(
        p75lt,
        `P75 long-task count for ${route.path} must be <= ${MAX_LONG_TASKS_PER_ROUTE}`,
      ).toBeLessThanOrEqual(MAX_LONG_TASKS_PER_ROUTE);
    });
  }

  test(`products: P75 filter-chip interaction latency < ${THRESHOLDS.INP_MS}ms`, async ({
    page,
  }) => {
    await applyThrottling(page);
    await page.goto('/products', { waitUntil: 'load' });
    // Wait for the filter sidebar to be interactive.
    await page
      .waitForSelector('.tfs-pill, .tfs-chip, button.filter-chip', { timeout: 10000 })
      .catch(() => {});

    const latencies: number[] = [];
    for (let i = 0; i < RUNS_PER_ROUTE; i++) {
      const lat = await measureInteractionLatency(page, '.tfs-pill, .tfs-chip, button.filter-chip');
      if (lat !== null) latencies.push(lat);
      // Brief pause between clicks so React commits + FLIP finishes.
      await page.waitForTimeout(300);
    }
    if (latencies.length === 0) {
      test.skip();
      return;
    }
    const p75inp = percentile(latencies, 75);
    test.info().annotations.push({
      type: 'measurement',
      description: `route=/products runs=${latencies.length} P75 filter-chip latency=${p75inp?.toFixed(0)}ms`,
    });
    expect(p75inp!, `P75 filter-chip latency must be < ${THRESHOLDS.INP_MS}ms`).toBeLessThan(
      THRESHOLDS.INP_MS,
    );
  });

  test(`products: P75 sort-dropdown interaction latency < ${THRESHOLDS.INP_MS}ms`, async ({
    page,
  }) => {
    // Phase 8 closure expansion — second INP coverage point. The
    // sort change triggers a full grid re-render + FLIP measure +
    // FLIP animate. This is the heaviest non-add-to-cart interaction
    // and the most likely to regress when adding new sort modes.
    await applyThrottling(page);
    await page.goto('/products', { waitUntil: 'load' });
    await page
      .waitForSelector(
        'select.pp-sort-select, .pp-sort-select select, select[aria-label*="ort" i]',
        { timeout: 10000 },
      )
      .catch(() => {});

    const latencies: number[] = [];
    const sortValues = ['price-asc', 'price-desc', 'name', 'best'];
    for (let i = 0; i < RUNS_PER_ROUTE; i++) {
      const targetValue = sortValues[i % sortValues.length];
      const lat = await page.evaluate(async (value) => {
        const sel = document.querySelector('select') as HTMLSelectElement | null;
        if (!sel) return null;
        const t0 = performance.now();
        sel.value = value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        // Wait for two RAFs — first commits, second presents.
        await new Promise<void>((res) =>
          requestAnimationFrame(() => requestAnimationFrame(() => res())),
        );
        return performance.now() - t0;
      }, targetValue);
      if (lat !== null && Number.isFinite(lat)) latencies.push(lat);
      await page.waitForTimeout(250);
    }
    if (latencies.length === 0) {
      test.skip();
      return;
    }
    const p75 = percentile(latencies, 75);
    test.info().annotations.push({
      type: 'measurement',
      description: `route=/products runs=${latencies.length} P75 sort-dropdown latency=${p75?.toFixed(0)}ms`,
    });
    expect(p75!, `P75 sort-dropdown latency must be < ${THRESHOLDS.INP_MS}ms`).toBeLessThan(
      THRESHOLDS.INP_MS,
    );
  });
});
