# Styles

This folder is the single source of truth for the app's visual design system.

Everything a developer needs to know about adding, editing, or extending styles is here. If this document says one thing and a standalone `.md` file at the repo root says another, this document wins.

## File inventory

```
src/styles/
├── tokens.css      ← every CSS custom property lives here
├── design.css      ← component styles that consume the tokens
├── focus.css       ← focus-visible + forced-colors a11y layer
├── tailwind.css    ← Tailwind v4 @theme, maps shadcn names to our tokens
├── fonts.css       ← @font-face declarations
└── index.css       ← imports the above in order
```

Load order (from `index.css`): fonts → tailwind → focus → design. Later files can reference tokens defined earlier.

## The one rule

> Every CSS custom property (`--foo`) is declared **exactly once** — in `tokens.css`.

That means:

- `design.css` consumes tokens via `var(--…)`. It never declares tokens in its own `:root` or `.dark` blocks.
- `tailwind.css` `@theme` maps shadcn's semantic vocabulary (`--color-primary`, `--color-foreground`, etc.) to tokens via `var()`, so Tailwind utilities flip with theme automatically.
- Focus.css can declare tokens inside `@media (prefers-contrast: more)` — that's a scoped override, not a parallel source of truth.

If you find yourself about to declare `--something: #whatever` outside `tokens.css`, stop — it belongs in `tokens.css`.

## The token hierarchy

```
┌─────────────────────────────────────────────┐
│  private palette           (--_ink-900,      │
│  (the raw hex)              --_cream-50…)    │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  semantic tokens            (--midnight,     │
│  (what you actually use)     --text, --gold, │
│                              --border, …)    │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  shadcn bridge              (--color-primary,│
│  (tailwind.css @theme only)  --color-ring, …)│
└─────────────────────────────────────────────┘
```

- **Private palette** (`--_ink-900`, `--_cream-50`, `--_gold-500`…). These are raw hex values. Leading underscore means "implementation detail — don't use directly." Changing them ripples through everything, so think twice.
- **Semantic tokens** (`--midnight`, `--bg`, `--text`, `--text-2`, `--gold`, `--border`, `--surface`, `--focus-color`…). These are what you use everywhere else. Most map to private-palette values (`--midnight: var(--_ink-800)`), some are concrete hexes, some are rgba alphas.
- **Shadcn bridge** (`--color-primary`, `--color-foreground`, `--color-ring`…). Lives only in `tailwind.css` `@theme`. Maps shadcn's generic names to our semantic tokens via `var()`. If you're writing regular CSS or `style={{}}` props, ignore this layer.

## Dark mode

Dark mode flips by adding the `.dark` class to `<html>` (done by `ThemeContext`). The `:root { … }` block in `tokens.css` defines light values. The `.dark { … }` block defines dark overrides for every token that needs to flip.

**Key flips worth knowing:**

| Token | Light | Dark | Why |
|---|---|---|---|
| `--bg` | `#fdfaf5` cream | `#111820` ink | page bg |
| `--text` | `#1a2530` dark | `#eee8dc` cream | body text |
| `--midnight` | `#0f1c26` dark | `#e8e0d4` cream | the flip that makes `.btn-dark` visible in both modes |
| `--on-dark` | `#f0e8d8` cream | `#111820` dark | text on a `.btn-dark` / midnight surface |
| `--gold-text` | `#7a5828` deep | `#e4bc78` bright | contrast |
| status colors | muted | brighter | legibility on dark surface |

The `--midnight` flip is the non-obvious one. In dark mode the word "midnight" stops meaning "dark" — it means "the dark button's surface color" — so it flips to cream. `--on-dark` flips the opposite way so text on that surface stays readable. Together they keep `.btn-dark` visually distinct without special-casing it per theme.

Transparent tokens flip too: `--on-dark-2` is `rgba(240,232,216,0.65)` in light but `rgba(17,24,32,0.65)` in dark. Never assume an `rgba()` token is theme-invariant.

## How to add a new token

1. Pick a semantic name. `--new-cta-bg`, not `--orange-red`.
2. Add it to `tokens.css` `:root { … }` with a light-mode value.
3. If it needs to differ in dark mode, add the override to the same file's `.dark { … }` block.
4. If it's a color used in a TSX `style={{}}` prop or a `design.css` rule, you're done — just reference `var(--new-cta-bg)`.
5. If it should also be available as a Tailwind utility class (e.g. `bg-new-cta`), map it in `tailwind.css` `@theme`:
   ```css
   @theme {
     --color-new-cta: var(--new-cta-bg);
   }
   ```
   Now `bg-new-cta` exists as a Tailwind class and flips with theme.

## Stylelint rules

Enforced on every commit via `.stylelintrc.json` + husky pre-commit. Three rule families:

### 1. `color-no-hex`

Hex literals are rejected in every `.css` file except `tokens.css` and `tailwind.css` (via `overrides`). If you need hex, use a token.

### 2. Transition-all ban

`transition: all` and `transition-property: all` are rejected. Animating every property is a performance foot-gun (layout thrash on inadvertent width/padding transitions). List the properties explicitly:

```css
/* ✗ */  transition: all 150ms ease;
/* ✓ */  transition: background-color 150ms ease,
                    color 150ms ease,
                    border-color 150ms ease;
```

### 3. Strict color values

`color`, `background-color`, `border-color`, `outline-color`, `fill`, `stroke` must use a `var(--…)` reference or a documented keyword. Hex, rgb, hsl, named CSS colors are rejected.

**Allowed non-var keywords:** `transparent`, `currentColor`, `inherit`, `initial`, `unset`, `none`, plus the CSS system colors used by `@media (forced-colors: active)` (`Highlight`, `HighlightText`, `ButtonText`, `Canvas`, etc.).

### Rare legitimate exceptions

When a hex really is correct (decorative gradient stop, always-white text on always-colored button, semantic icon color), add an inline disable with a justification:

```css
/* stylelint-disable-next-line color-no-hex, scale-unlimited/declaration-strict-value -- why */
.foo { color: #abcdef; }
```

The text after `--` is a team convention, not enforced by stylelint, but code review should reject disables without it.

## Scripts

```bash
npm run lint:css       # report violations
npm run lint:css:fix   # auto-fix what's fixable
```

The pre-commit hook (`.husky/pre-commit`) runs `npx lint-staged`, which auto-fixes staged `.css` files and aborts the commit if anything remains.

Emergency bypass (not for real regressions — for legitimate merge-in-progress cases): `git commit --no-verify`.

## What NOT to do

**Don't declare tokens outside tokens.css.**
Breaks the single-source-of-truth rule. The cascade will silently override one declaration with another, and dev-tools round-trips will mislead you about which value is live.

**Don't use inline hex in TSX `style={{}}` props for theme-dependent colors.**
Stylelint doesn't lint TSX, but the principle is the same: `style={{ color: 'var(--text)' }}`, not `'#1a2530'`. Inline `style={{ color: '#fff' }}` is OK only if the background is always colored (success/danger button) and the white text is always readable.

**Don't use Tailwind's raw color utilities (`bg-red-500`, `text-gray-900`) on app UI.**
Use `bg-destructive` / `text-foreground` (shadcn bridge) or write a rule in `design.css` that uses `var(--danger)` / `var(--text)`. Raw palette utilities don't flip with theme and bypass the design system.

**Don't reintroduce a second `:root` or `.dark` block.**
There's exactly one of each in `tokens.css`. If you need a contextual override, wrap it in a real selector (`.contact-form`, `.brew-guide`, etc.) or a media query (`@media (prefers-contrast: more)`).

## Visual regression

A Playwright snapshot suite at `tests/visual/` pixel-diffs 7 public pages against committed baselines in both themes and both viewports (desktop + mobile). CI runs it on every PR that touches `src/**/*.{tsx,ts,css}` or `src/styles/**`.

Local usage:

```bash
npm run test:visual           # compare against committed baselines
npm run test:visual:update    # regenerate baselines after an intentional change
npm run test:visual:ui        # interactive debugger for a failing test
```

Full workflow, including how to extend to admin/protected pages, is in `tests/visual/README.md`.

The point of this suite isn't to catch every possible change — it's to make "I tweaked a margin and something else broke" impossible to merge without review.

## History

This document reflects the system as of **Day 8** of the style-system roadmap. The previous `CSS_MIGRATION_GUIDE.md`, `GLOBAL_STYLES_OVERVIEW.md`, `STYLE_USAGE_EXAMPLES.md`, `THEME_SYSTEM.md`, `PHASE_2_CHECKLIST.md` and their seven cousins documented incremental snapshots of a partial migration. They were all deleted in Day 9 because they conflicted with each other and with the actual code. If you find a surviving reference to any of them, it's outdated — trust this file and the code.
