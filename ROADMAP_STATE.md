# Ele Café — Roadmap state: **ALL 10 DAYS APPLIED** 🎉

This bundle = your original app + every day of the roadmap. The 10-day style-system rehabilitation is complete.

## ⚠️ Required actions after unzipping

```bash
# 1. Install dependencies — lockfile is stale (Days 7+8+10 changed deps)
pnpm install
# This also wires husky pre-commit (via `prepare: husky` script) —
# stylelint now runs on every commit that touches .css files.

# 2. First-time Playwright setup (only needed once per machine)
pnpm exec playwright install chromium

# 3. Generate your first set of visual-regression baselines
pnpm test:visual:update
# This runs the app and captures 28 screenshots
# (7 pages × 2 themes × 2 viewports). Commit the resulting
# PNGs in tests/visual/__screenshots__/ — they are your
# "this is how the app should look" reference.
```

After that, every future change is guarded by two independent layers:

1. **Stylelint pre-commit** — catches new hex literals, `transition: all`, and color properties that don't use tokens.
2. **Playwright CI** — catches visual drift; failures upload an HTML report showing pixel-level diffs.

## What Day 10 changed

Pure infrastructure — no source code touched.

### New files

| File | Purpose |
|---|---|
| `playwright.config.ts` | Playwright config. Chromium-only, 2 viewports (desktop 1440×900, iPhone 14 Pro mobile), auto-starts dev server, snapshot thresholds tuned for CSS (not content) diffs. |
| `tests/visual/fixtures.ts` | Playwright test fixture `pageInTheme(theme)`. Seeds `localStorage.ele-cafe-theme` via `addInitScript` BEFORE page load so the pre-React theme script applies the right theme without flicker. Also exports `settleForScreenshot()` — waits for network idle, fonts loaded, kills animations. |
| `tests/visual/public-pages.spec.ts` | The snapshot suite. 7 public pages × 2 themes = 14 tests per project × 2 projects (desktop + mobile) = **28 snapshots**. |
| `tests/visual/README.md` | How to run locally, interpret CI failures, update baselines, extend to admin pages. |
| `.github/workflows/visual-regression.yml` | CI workflow. Triggers on PR only when `src/**/*.{tsx,ts,css}` or `src/styles/**` change. Caches Playwright browsers between runs. Uploads failure reports as artifacts. |

### Modified files

| File | Change |
|---|---|
| `package.json` | +1 devDep (`@playwright/test@^1.48.0`), +3 scripts (`test:visual`, `test:visual:update`, `test:visual:ui`) |
| `.gitignore` | Added Playwright artifact directories (reports + caches — NOT the baselines, which ARE committed) |
| `src/styles/README.md` | New "Visual regression" section explaining local + CI usage |

### Pages covered by the snapshot suite

```
  /                                       (home)
  /products                               (products grid)
  /tea-profile/black/english-breakfast    (product detail — Day 5 fix page)
  /cart                                   (empty cart state)
  /about                                  (info page)
  /contact                                (info page)
  /login                                  (auth page)
```

Protected pages (`/checkout`, `/orders`, `/account`) and admin pages are deliberately deferred — they need a seeded-user auth fixture that's out of Day 10's scope. `tests/visual/README.md` documents the extension pattern.

## The full 10-day recap

| Day | Focus | User-visible effect |
|---|---|---|
| 1 | Mechanical CSS fixes | Focus rings render, FOUC eliminated, ~600 lines of dead CSS removed |
| 2 | Navbar scroll race | Re-renders during scroll: ~120/sec → 0-2 total |
| 3 | Body scroll lock | Modal-over-drawer no longer unlocks body on close |
| 4 | Admin sticky positioning | Sidebar/topbar now sit below the fixed navbar, not behind it |
| 5 | Inline hex purge | Tea profile page, cart, checkout, notifications all flip correctly in dark mode |
| 6 | Token consolidation | `tokens.css` is sole source; silent `--shadow-md` bug fixed so hover elevations render |
| 7 | shadcn decision | 40 unused files + 30 npm deps deleted; `@theme` wired so admin Buttons/Inputs finally render styled |
| 8 | Stylelint + husky | Pre-commit enforcement; no new hex / `transition: all` / raw colors can land |
| 9 | Documentation cleanup | 10 stale docs (~110 KB) deleted; one authoritative `src/styles/README.md` replaces them |
| 10 | Visual regression + CI | Playwright snapshot suite catches unintended visual drift on every PR |

**Net effect:** the style system works correctly in both themes, enforces itself against regressions at commit time, documents itself in one place, and proves itself visually on every PR.

## The cumulative changes to your app

- **Deleted:** 50 files (40 unused shadcn + 10 stale docs) + 30 npm packages
- **Added:** 5 new files (`bodyScrollLock.ts`, `.stylelintrc.json`, `.husky/pre-commit`, Playwright config + 4 test files + CI workflow)
- **Modified:** ~20 files across CSS, TSX, JSON
- **Net CSS:** `design.css` down 207 lines (consolidation); `tokens.css` up 60 lines (absorbed unique tokens)
- **Net bundle:** ~46 KB smaller (no more recharts, no more 24 Radix packages nobody imported)
- **Token integrity:** 238 tokens, single source, zero duplicates, every `var()` reference resolves
- **Dark mode:** works on every page
- **Admin Products page:** finally styled (it wasn't, before Day 7)
- **Pre-existing bugs found & fixed as side effects:** the `--shadow-md` invalid value that silently disabled every hover shadow in the app; the React duplicate-key warning on pagination; 5 `transition: all` performance foot-guns

## What's NOT in the 10 days

I want to be honest about what the roadmap didn't address, in case you want to pick these up next:

- **TSX inline-style lint coverage.** Stylelint doesn't lint CSS-in-JS. An ESLint custom rule could catch `style={{ color: '#fff' }}` regressions but that's a 1-2 day project of its own.
- **Admin page visual regression.** Needs a seeded-user auth fixture. The pattern is documented in `tests/visual/README.md`; implementing it is a ~half-day task.
- **Stale non-CSS docs** (`README_LATEST_FEATURES.md`, `SYSTEM_ARCHITECTURE.md`, `WHATS_NEW.md`, plus ~10 translation-related `.md` files). Not style-related, so Day 9 left them alone.
- **Bundle analysis.** Day 7 removed 30 packages; I estimated ~46 KB savings but didn't measure the full `pnpm build` output. Worth running `pnpm build && ls -la dist/assets/` once to confirm.
- **Tailwind v4 migration correctness.** The `@theme` wiring I added in Day 7 assumes Tailwind v4 semantics (var() in @theme resolves lazily at the point of use). This is correct as of Tailwind 4.0+, but if you upgrade further, re-check.

## How to verify everything

```bash
pnpm install                  # 1. Lockfile rebuilds, husky wires hook
pnpm lint:css                 # 2. CSS lint — expect silent exit 0
pnpm typecheck                # 3. TypeScript check — expect clean
pnpm build                    # 4. Production build — expect success

pnpm exec playwright install chromium   # 5. One-time browser install
pnpm test:visual:update       # 6. Generate baselines
# Commit the new tests/visual/__screenshots__/ directory
pnpm test:visual              # 7. Re-run; should pass (0 drift from just-generated baselines)
```

If step 7 fails on a fresh baseline, that indicates flake. Increase `maxDiffPixelRatio` in `playwright.config.ts` slightly (0.002 → 0.005) and regenerate.

---

That's the whole roadmap. Thanks for being patient with the 10 installments. If you hit any snags after the `pnpm install`, paste the error and I'll help unblock.
