# Visual regression tests

Pixel-diff the rendered layout of public pages against committed baselines. Catches unintended visual changes on every PR.

## Running locally

```bash
# One-time: install Playwright's browser binaries (~300 MB, downloaded once per machine)
pnpm exec playwright install chromium

# First run on a fresh clone: generate baselines
pnpm test:visual:update

# Thereafter: compare against baselines, fail if anything diffs
pnpm test:visual

# Interactive UI for debugging a failing test
pnpm test:visual:ui
```

The first `test:visual:update` creates PNGs in `tests/visual/__screenshots__/`. **Commit those files to git** — they're the source of truth for "the app looks correct."

## What's tested

- 7 public pages: home, products, tea profile, cart empty, about, contact, login
- 2 themes: light + dark
- 2 viewports: desktop (1440×900), mobile iPhone 14 Pro (390×844)

Total: **28 snapshots per run**.

See `public-pages.spec.ts` for the list. Each page:

1. Opens with its theme preset via `localStorage` (no flash-of-unstyled-content)
2. Waits for network idle, fonts loaded, animations killed
3. Takes a full-page screenshot

## Updating baselines after an intentional change

```bash
# 1. make your CSS change
# 2. confirm it looks right locally
# 3. regenerate baselines
pnpm test:visual:update
# 4. eyeball the updated PNGs in tests/visual/__screenshots__/
# 5. commit
git add tests/visual/__screenshots__
git commit -m "visual: updated baselines for new hero padding"
```

## Interpreting CI failures

When CI fails:

1. Open the workflow run → Artifacts → `playwright-report` → download
2. Open `playwright-report/index.html` in a browser
3. Each failing test shows: expected (committed), actual (from this CI run), diff (red pixels where they differ)

If the diff is **intentional** (you changed the layout on purpose), run `pnpm test:visual:update` locally and commit the new PNGs.

If the diff is **unintended**, fix the code until the test passes.

## Thresholds

See `playwright.config.ts`:

- `maxDiffPixelRatio: 0.002` — up to 0.2% of pixels may differ (handles anti-aliasing on different platforms)
- `threshold: 0.15` — a pixel counts as different if its RGB delta exceeds this

If you see flaky-but-small diffs on CI (font hinting, GPU anti-alias drift), bump `maxDiffPixelRatio` to `0.005` — but first check whether CI runs on a different OS than your dev machine (common source of drift).

## Extending to protected / admin pages

The current suite skips any page requiring auth. To add them:

1. **Create a setup fixture** that logs in a test user and seeds a cart. Either:
   - Programmatic: call your auth API directly in a `test.beforeEach` and set localStorage/cookies
   - UI: click through the login flow on first test and reuse `storageState` across subsequent tests (Playwright's `storageState` fixture)
2. **Seed deterministic data.** If you test `/checkout`, the cart needs the same items every run — use a Firebase emulator + fixed seed, or mock API responses with `page.route('**/api/**', ...)`.
3. **Add pages to the PAGES array** in `public-pages.spec.ts` (or create a new `admin-pages.spec.ts` with its own auth fixture).

The hard part is determinism — not Playwright itself. Start small (one admin page) before wiring the full admin suite.

## CI

See `.github/workflows/visual-regression.yml`. Runs on every PR. Uploads an HTML report artifact when tests fail, downloadable from the workflow run.
