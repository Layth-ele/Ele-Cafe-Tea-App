// ESLint 9 flat config — replaces the old .eslintrc.json.
//
// Why flat config: ESLint 9 deprecated the eslintrc format. The old config
// file was silently doing nothing (every `npx eslint` call failed with
// "couldn't find an eslint.config.(js|mjs|cjs) file"), which meant the
// husky pre-commit hook + lint-staged pipeline weren't actually running
// the lint rules they thought they were.
//
// Scope of the rules below is intentionally narrow — keep it close to the
// previous setup (eslint:recommended + react + typescript + prettier),
// plus the two `eslint-plugin-import` rules that prevent the
// "export default at the top of the file" hoisting landmine from
// regressing (audit pass 7, item 4).
//
// Notable concessions to a real-world TypeScript codebase:
//   * `@typescript-eslint`'s no-explicit-any and no-unused-vars are off —
//     the codebase uses `any` deliberately at Firestore-data boundaries
//     where Zod isn't yet wired in, and unused-vars conflicts with the
//     "underscore prefix means intentionally unused" convention.
//   * `import/no-unresolved` is off because Vite's `@/*` alias and
//     `firebase/storage` etc. don't always resolve through the
//     plugin-import resolver. tsc + Vite catch real broken imports.

import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
  // 1. Globally ignored paths
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'functions/lib/**',
      'functions/node_modules/**',
      'playwright-report/**',
      'playwright-report-a11y/**',
      'test-results/**',
      'public/**',
      '.firebase/**',
    ],
  },

  // 2. Base recommended rules from ESLint
  js.configs.recommended,

  // 3. Project-wide config for source files
  {
    files: ['src/**/*.{ts,tsx,js,jsx}', 'tests/**/*.{ts,tsx}', 'scripts/**/*.{js,ts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      import: importPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React baseline (matches plugin:react/recommended, minus rules that
      // conflict with React 19's automatic JSX runtime).
      ...reactPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      // React-hooks rules — hooks-of-hooks and exhaustive deps. The
      // codebase already has an inline `eslint-disable-next-line
      // react-hooks/exhaustive-deps` in Step3Personalize, which means it
      // expected the plugin to be configured but it wasn't installed.
      ...reactHooksPlugin.configs.recommended.rules,

      // TypeScript baseline (matches plugin:@typescript-eslint/recommended,
      // minus the two rules that fight a real-world codebase — see header).
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',

      // Imports must be at the top — applied everywhere because the failure
      // mode (statement before imports) is always a footgun.
      'import/first': 'error',

      // ESLint's default no-undef also fights with TS — TS already checks
      // every identifier; double-checking via ESLint just produces noise on
      // TS-specific globals like `JSX` and `React`.
      'no-undef': 'off',

      // Allow ternaries as statements (e.g. `cond ? doA() : doB();`) — a
      // common React pattern for terse side-effect dispatch. The rule still
      // catches genuinely-pointless expressions.
      '@typescript-eslint/no-unused-expressions': [
        'error',
        {
          allowTernary: true,
          allowShortCircuit: true,
        },
      ],

      // Disable the apostrophe-in-JSX rule. It fires on every `'` in
      // ordinary copy ("you'll", "we're", etc.) and offers nothing in
      // exchange — the unescaped apostrophes render fine.
      'react/no-unescaped-entities': 'off',

      // Allow `catch {}` for intentional silent-swallow (logout best-effort,
      // optional cleanup). The default no-empty rule still fires on empty
      // function bodies, conditionals, etc.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // ── Phase 3 guard rail ────────────────────────────────────────
      // Flag inline `style={{}}` on DOM elements as a warning. Set to
      // `warn` (not `error`) because the codebase still has ~1,610
      // grandfathered instances pending migration to component / utility
      // classes — full sweep is multi-day work and we don't want to
      // freeze the codebase mid-refactor.
      //
      // Two valid escape hatches for cases where inline styles are the
      // only correct answer:
      //   1. Truly dynamic values driven by state/props/calculations
      //      (a progress bar's width, a confetti piece's random color,
      //      a list item's calculated index-derived offset). Add an
      //      `// eslint-disable-next-line react/forbid-dom-props`
      //      with a one-line reason.
      //   2. CSS custom properties — pass a token via inline style
      //      (`style={{ '--shipping-color': dynamicColor }}`) so the
      //      class can read it. The rule still fires; suppress with
      //      a comment.
      //
      // When this rule reaches zero warnings, flip to `error` and
      // remove the disable comments that no longer apply. Until then,
      // it's a slow-burn nudge — every file someone touches is a
      // migration opportunity surfaced inline.
      //
      // Why dom-props specifically (not component-props): custom React
      // components can legitimately accept a `style` prop and forward
      // it to a DOM child (e.g. <Card style={...} /> for parent layout
      // overrides). The guard targets bare DOM elements where the prop
      // could always be a class instead.
      'react/forbid-dom-props': [
        'error',
        {
          forbid: [
            {
              propName: 'style',
              message:
                'Use a class from design.css instead. See docs/PHASE_3_PLAYBOOK.md for the migration pattern. Suppress with `// eslint-disable-next-line react/forbid-dom-props` + reason for genuinely dynamic values.',
            },
          ],
        },
      ],
    },
  },

  // Storybook stories — fixtures, not shippable code. Inline styles in
  // stories are the right tool: stories often need ad-hoc layout
  // (centering, side-by-side comparisons, swatch grids) that exists for
  // documentation, not the app. Adding those layouts to design.css
  // would pollute it with classes nothing in the app uses. Disable the
  // forbid rule here so the playbook tracker isn't dragged down by
  // documentation files. The stylelint single-source-of-truth rule
  // still applies (no hex values), so brand consistency is preserved.
  {
    files: ['**/*.stories.{ts,tsx}', '.storybook/**/*.{ts,tsx}'],
    rules: {
      'react/forbid-dom-props': 'off',
    },
  },

  // 4. The actual regression guard for the export-default-at-top hoisting
  // landmine — applied to page files specifically. Schemas, stores, and
  // hooks legitimately interleave many small named exports throughout
  // (the multi-export module pattern is fine; the pattern that bit us
  // was `export default Page` at the top of a page component, before the
  // function declaration).
  {
    files: ['src/app/pages/**/*.{ts,tsx}'],
    plugins: { import: importPlugin },
    rules: {
      'import/exports-last': 'error',
    },
  },

  // 5. Playwright test files — its fixtures use a callback named `use` that's
  // unrelated to React's `use` hook. The react-hooks plugin can't tell the
  // difference and falsely flags every fixture as a misnamed component.
  // Rules-of-hooks and exhaustive-deps are also irrelevant in tests.
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },

  // 6. Functions code (Node only, ES2022)
  {
    files: ['functions/src/**/*.{ts,js}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: { ...globals.node, ...globals.es2022 },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'import/first': 'error',
      'no-undef': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // 5. Config files at repo root — no project rules, just JS
  {
    files: ['*.{js,mjs,cjs}', 'vite.config.ts', 'playwright*.config.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      'no-undef': 'off',
    },
  },
];
