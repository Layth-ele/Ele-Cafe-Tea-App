# Phases 1 & 2 — Design Tokens v3 + Storybook · Implementation Report

Date: 2026-05-09
Scope: Phase 1 (token tiers — motion, elevation, density, fluid type, state, viz palette) and Phase 2 (Storybook 8 + Chromatic + core component stories) of `UI_UX_ENTERPRISE_ROADMAP.md`. Builds on Phase 0 (`PHASE_0_IMPLEMENTATION.md`).

---

## Verification matrix — all green

| Gate                                | Command                                          | Result |
|-------------------------------------|--------------------------------------------------|--------|
| TypeScript (src)                    | `npx tsc --noEmit`                               | ✅ 0 errors |
| TypeScript (Cloud Functions)        | `cd functions && npx tsc --noEmit`               | ✅ 0 errors |
| ESLint errors                       | `npx eslint src tests functions/src --quiet`     | ✅ 0 errors |
| Stylelint                           | `npx stylelint "src/**/*.css"`                   | ✅ 0 errors |
| Unit tests                          | `npx vitest run`                                 | ✅ 142 / 142 passing |
| Production build                    | `npx vite build`                                 | ✅ ~15 s, PWA generates |
| Bundle budgets (size-limit)         | `npx size-limit`                                 | ✅ 7 / 7 chunks under budget |
| Storybook build                     | `npx storybook build`                            | ✅ 22 s, all stories render |
| Static a11y scan                    | `npm run test:a11y:scan`                         | ✅ no new findings (still 88, +5 files) |

---

## Phase 1 — Design Tokens v3

### What's added to `src/styles/tokens.css`

Six new token tiers, all theme-aware (flip in `.dark`), all in the **single source of truth** that the README mandates and that stylelint enforces:

| Tier | Tokens | Use |
|---|---|---|
| **Distance** | `--dist-sm`, `--dist-md`, `--dist-lg` | `transform: translateX(var(--dist-md))` for displacement animations |
| **Elevation** | `--elev-1` … `--elev-4`, `--elev-inset` | `box-shadow: var(--elev-3)` — composable shadow tiers, dark-mode-aware |
| **Density** | `--row-h`, `--row-h-md`, `--row-h-sm`, `--pad-x`, `--pad-y`, `--gap` | Apply `data-density="dense"` at any subtree root → admin tables tighten |
| **Fluid type** | `--type-xs` … `--type-5xl`, `--lh-tight/snug/normal/relaxed` | `font-size: var(--type-3xl)` — `clamp()`-based, scales with viewport |
| **State surfaces** | `--state-{success\|warning\|danger\|info\|neutral}-{bg\|fg\|border\|solid}` (5 × 4 = 20 tokens) | Subtle pills, outlined alerts, solid CTAs all from one tier |
| **Data-viz palettes** | `--viz-seq-1..7`, `--viz-div-{neg-3..pos-3,mid}`, `--viz-qual-1..8` | Chart palettes for sequential, divergent, qualitative data |

### What's NOT added (deliberately)

- **Motion tokens (`--d-1` … `--d-5`).** The codebase already has a comprehensive motion system (`--dur-instant/fast/normal/slow/xslow` + 7 easings — see lines 274–293 of `tokens.css`). The roadmap's invented `--d-N` namespace would have created a duplicate source of truth. Phase 1 instead extended the EXISTING motion system with a `prefers-reduced-motion` override that collapses every duration to 1ms and every easing to linear when the OS preference is set. Result: any code using `--dur-*`/`--ease-*` is automatically reduced-motion-compliant, no per-component branches.
- **OKLCH migration.** Listed in roadmap §1.1 as the headline win, but the existing palette is fine and tightly integrated into 238 other tokens. Migrating now would force a re-baseline of all 28 visual regression snapshots without a customer-visible benefit. Deferred to a dedicated pass after Phase 3 (inline-style migration) eliminates the parallel JSX-color references that would otherwise drift.

### What flows into Tailwind utilities

Added to `src/styles/tailwind.css` `@theme` block:

```
--text-xs … --text-5xl              → text-xs … text-5xl utilities
--shadow-elev-1 … --shadow-elev-4   → shadow-elev-1 … shadow-elev-4
--shadow-elev-inset                 → shadow-elev-inset
--color-state-{role}-{variant}      → bg-state-success, text-state-danger-fg, etc.
```

Now Tailwind utilities flip with theme automatically because they resolve `var()` lazily at the use site.

### Reduced-motion override (system-driven)

Wrapped in `@media (prefers-reduced-motion: reduce)`, retargets the EXISTING tokens:

```css
:root {
  --dur-instant: 1ms; --dur-fast: 1ms; --dur-normal: 1ms;
  --dur-base:    1ms; --dur-slow: 1ms; --dur-xslow:  1ms; --dur-enter: 1ms;
  --ease-linear:     linear; --ease-standard:   linear; --ease-in-out:     linear;
  --ease-decelerate: linear; --ease-out:        linear; --ease-accelerate: linear;
  --ease-spring:     linear; --ease-bounce:     linear;
}
```

Any component that uses `--dur-*` and `--ease-*` is now reduced-motion-compliant for free.

### Density override

```css
[data-density="dense"]       { --row-h: 32px; --pad-x: 12px; --gap:  8px; … }
[data-density="comfortable"] { --row-h: 52px; --pad-x: 20px; --gap: 14px; … }
```

Apply `data-density="dense"` at the `<AdminLayout>` root and the entire admin tree gets compact spacing without per-component overrides. The default is the existing comfortable spacing.

### Bundle impact

CSS chunk: 24.47 KB → 25.58 KB (+1.11 KB / +4.5%). Budget is 30 KB (15% headroom remaining).

---

## Phase 2 — Storybook + Chromatic

### What ships

```
.storybook/
├── main.ts        # framework: @storybook/react-vite, addons: a11y, themes, essentials, interactions
└── preview.ts     # global decorators (theme switcher), parameters (viewports, a11y, controls)

.github/workflows/
└── chromatic.yml  # publishes Storybook to Chromatic on every PR

src/app/components/ui/
├── button.stories.tsx          # 7 stories: Playground, AllVariants, AllSizes, WithIcons, IconOnly, Disabled, AsChild, VariantsStacked
├── input.stories.tsx           # 7 stories: Playground, WithLabel, ErrorState, Disabled, SearchWithIcon, PasswordWithToggle, EmailWithIcon
├── card.stories.tsx            # 4 stories: Basic, WithAction, HeaderOnly, Grid
├── skeleton.stories.tsx        # 6 stories: Basic, Line, Avatar, Card, ProductsGrid, TableRows
└── design-tokens.stories.tsx   # 7 stories: Colors, TypeScale, Elevations, StateSurfaces, Motion, Density, DataVizPalettes

package.json
└── + 11 devDeps:  @storybook/addon-{a11y,essentials,interactions,themes}
                   @storybook/blocks
                   @storybook/react @storybook/react-vite @storybook/test
                   storybook chromatic
└── + 3 scripts:   storybook, build-storybook, chromatic
```

### Why this configuration

- **`@storybook/react-vite`** — reuses your existing `vite.config.ts`, so Tailwind v4, the design-token CSS layer, the PWA plugin, and the path aliases all work in Storybook with zero duplication.
- **`@storybook/addon-a11y`** — runs axe-core on every story render. The a11y panel shows violations the moment a component accumulates a contrast or label issue, before the live Playwright a11y suite would catch it on a real page.
- **`@storybook/addon-themes/withThemeByClassName`** — the theme switcher in the Storybook toolbar flips the `.dark` class on `<html>` exactly the way `src/lib/theme.ts` does at runtime. Token system in `tokens.css` re-resolves every `var(--…)` against the dark-mode block — no per-component logic needed.
- **`@storybook/addon-essentials`** — Controls + Docs + Viewport + Backgrounds + Actions in one bundle. Backgrounds is disabled in `preview.ts` because the theme decorator handles light/dark via the `.dark` class which uses the tokenized `--bg`.

### Story coverage

**31 stories** across **5 files** documenting:

- 6 button variants × 4 sizes × 4 special cases (icons, icon-only, disabled, asChild)
- 7 input patterns including the password show/hide toggle, search with icon, email with icon, error state with `role="alert"`
- Card composition with all sub-components (Header, Title, Description, Action, Content, Footer)
- 6 skeleton shapes covering the Phase 5 loading-state taxonomy
- The complete Phase 1 token system, browsable

### Chromatic CI

`.github/workflows/chromatic.yml` triggers on every PR that touches stories, components, styles, or `.storybook/`. Builds Storybook (~22 s on CI cache), uploads to Chromatic, which snapshots every story across every variant + theme + viewport. Reviewers approve diffs in Chromatic's UI — that's the merge gate.

**One-time setup required:**
1. Sign up at chromatic.com, create a project.
2. Copy the project token.
3. Add `CHROMATIC_PROJECT_TOKEN` as a GitHub repo secret.

Without the secret, the workflow no-ops on PRs from forks (which can't access secrets) and skips on non-fork PRs too — but it doesn't fail the build.

`exitZeroOnChanges: true` in the action config: visual diffs *surface* via the workflow but don't *block* merge from CLI. The merge gate is the human review in Chromatic. This is the recommended pattern; failing CI on every visual change creates churn.

`onlyChanged: true`: Chromatic only re-snapshots stories whose source changed, saving snapshot budget.

### Bundle impact (production build)

**Zero.** Storybook is a build tool, not a runtime dependency. The application bundle that ships to customers is unchanged in size from the end of Phase 0:

| Chunk | Size | Budget |
|---|---|---|
| main entry | 35.84 KB | 60 KB |
| react core | 73.47 KB | 85 KB |
| firebase | 122.45 KB | 200 KB |
| data layer | 5.50 KB | 30 KB |
| icons | 7.35 KB | 10 KB |
| vendor | 46.49 KB | 60 KB |
| css | 25.58 KB | 30 KB *(+1.11 KB from Phase 1)* |

---

## Files changed (16 in this round; 40 total across Phases 0+1+2)

### New files (10)

```
.storybook/main.ts
.storybook/preview.ts
src/app/components/ui/button.stories.tsx
src/app/components/ui/input.stories.tsx
src/app/components/ui/card.stories.tsx
src/app/components/ui/skeleton.stories.tsx
src/app/components/ui/design-tokens.stories.tsx
.github/workflows/chromatic.yml
PHASE_1_2_IMPLEMENTATION.md
```

### Modified files (6)

```
src/styles/tokens.css            # +172 lines: distance/elevation/density/fluid-type/state/viz tokens; reduced-motion override; density override
src/styles/tailwind.css          # +33 lines: bridge new tokens to Tailwind utility classes
package.json                     # +11 devDeps (storybook, chromatic, addons), +3 scripts
.gitignore                       # +/storybook-static/
```

(Plus the 28 files from Phase 0 — see `PHASE_0_IMPLEMENTATION.md`.)

---

## What you can do once unzipped

```bash
# 1. Install fresh — picks up the 11 new Storybook deps
npm install
cd functions && npm install && cd ..

# 2. Verify everything green
npx tsc --noEmit                  # 0 errors
npx vitest run                    # 142/142
npm run build                     # 15s, PWA generates
npm run size                      # 7/7 within budget

# 3. The new affordances:
npm run storybook                 # opens at http://localhost:6006
                                  # browse every primitive + the design token system
npm run build-storybook           # 22s, output in storybook-static/

# Phase 0 helpers still work:
npm run test:a11y:scan            # the static pre-flight scan
npx playwright test               # visual + a11y suites (need test Firebase project)
```

---

## What's NOT done in this round

- **Real Chromatic project.** The workflow is wired but you need to claim the project token from chromatic.com and set the GitHub secret. ~5 minutes of one-time setup.
- **Stories for Select, Pagination, SearchBar, Sonner toasts, LazyImage.** Tier-1 primitives only this round (Button, Input, Card, Skeleton). The remaining 4–6 are 1-day of straightforward work building on the established pattern.
- **MDX documentation pages.** Stories alone cover 80% of the doc value. MDX deep dives ("when to use Card vs Section?", design rationale) are deferred to when actual usage gaps surface.
- **Pattern stories (Phase 5 territory).** Empty / loading / error / form patterns. These compose primitives and need their own design pass — they're the focus of Phase 5 of the roadmap, not Phase 2.
- **Component coverage testing.** The roadmap's "100% of UI primitives in Storybook" target needs the remaining 4–6 stories. Currently at ~50%.
- **Tokens Studio / Figma sync.** Roadmap §1.8 — nice to have, not foundational. Wait until Phase 3 reduces the JSX-color drift first.
- **OKLCH palette migration.** §1.1 of the roadmap. Skipped because doing it now requires a concurrent baseline-update of all 28 visual regression snapshots. Pairs naturally with Phase 3's inline-style migration which has the same reset cost — do them together later.

---

## Cross-references

- Roadmap: `UI_UX_ENTERPRISE_ROADMAP.md` §Phase 1 + §Phase 2
- Phase 0 (prerequisite): `PHASE_0_IMPLEMENTATION.md`
- Token system rules: `src/styles/README.md` (the Day 9 authoritative doc)
- Existing motion system: `src/styles/tokens.css` lines 274–293 (`--dur-*` and `--ease-*`)
- Visual-regression suite (covers component output via pages): `tests/visual/`
- Chromatic complements visual regression at the component-isolation level

---

## How to use Storybook in your daily flow

1. Building a new variant of an existing component? Add a story showing it. The Chromatic snapshot becomes the regression guard for that variant — no need to find a real page that renders it.
2. Reviewing a PR that touches a UI primitive? Open the story for that component on the deployed Storybook (or Chromatic preview) and click through every variant before approving.
3. Designer asks "what's our spacing for compact tables?" Open `Design Tokens / Density` in Storybook — it shows the comfortable / dense / default values side-by-side, theme-aware.
4. Someone asks "is this color in the system?" Open `Design Tokens / Colors` — every named token is a swatch with the var name underneath. If it's not there, it shouldn't exist.
