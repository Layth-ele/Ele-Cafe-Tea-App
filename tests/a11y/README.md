# Accessibility Tests

Automated WCAG 2.1 A/AA checks via [axe-core](https://github.com/dequelabs/axe-core)
running in Playwright. Distinct from the visual regression suite in
`tests/visual/`.

## Run

```bash
npm run test:a11y           # one-shot, headless
npm run test:a11y:ui        # interactive picker (Playwright UI)
```

Both commands auto-start the dev server on `:5173` if one isn't already
running.

## What's covered

- Every public route in `tests/a11y/public-pages.spec.ts`
- Both `light` and `dark` themes (12 routes × 2 themes = 24 tests)
- Tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`

## What fails the build

- Any `critical` or `serious` violation (missing alt text, contrast
  below threshold, missing form labels, inaccessible names on
  interactive elements, etc.)

## What's reported but doesn't fail

- `moderate` and `minor` violations (printed via `console.warn` in the
  test output) — usually advisory rules like `heading-order` that
  often clash with intentional typographic hierarchy. Address them
  when convenient.

## What's deliberately excluded

- The `region` rule. axe flags content outside a landmark, which
  triggers false positives on small portal-mounted UI (toaster, modal
  shells) even when the main content sits inside `<main>`. Re-enable
  if you change the page shell.

## What's NOT covered (deferred)

- Admin pages — need a seeded auth fixture, same constraint as the
  visual suite. See `tests/visual/README.md`.
- Authenticated user flows (cart with items, checkout, account, orders,
  gifts builder past step 1) — same auth-fixture gap.
- Keyboard-only journey tests — axe checks the static rendered DOM but
  doesn't simulate Tab/Enter/Esc through a flow. Add a separate
  Playwright suite if you want this coverage.

## Triage workflow

When a test fails, the CI log prints the rule ID, impact, help text,
help URL, and the first three offending DOM selectors. Example:

```
button-name [critical] — Buttons must have discernible text
  https://dequeuniversity.com/rules/axe/4.10/button-name
  • header > div > button:nth-child(2)
  • nav > div > button[aria-expanded="false"]
```

Open the help URL for the canonical fix. For local repro:

```bash
npm run test:a11y:ui
# click the failing test → the trace viewer shows the page snapshot
```
