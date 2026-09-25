import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook configuration — Phase 2 of the UI/UX roadmap.
 *
 * Why this stack:
 *   - @storybook/react-vite reuses your existing vite.config.ts (so
 *     Tailwind v4, the design-token CSS layer, and PWA all "just work"
 *     inside Storybook with zero duplicated config).
 *   - @storybook/addon-a11y runs axe-core on every story render — the
 *     a11y panel turns red the moment a component accumulates a
 *     contrast or label issue, before the live Playwright a11y suite
 *     would catch it on a real page.
 *   - @storybook/addon-themes/decorator handles light/dark switching
 *     via the same .dark class your ThemeContext uses.
 *
 * Story file convention:
 *   <ComponentName>.stories.tsx co-located with the component (i.e.
 *   src/app/components/ui/button.stories.tsx).
 */
const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.@(ts|tsx)',
    '../src/**/*.mdx',
  ],

  addons: [
    '@storybook/addon-essentials',  // Controls + Actions + Backgrounds + Viewport + Docs
    '@storybook/addon-a11y',        // axe-core panel
    '@storybook/addon-themes',      // light/dark switcher
    '@storybook/addon-interactions',// play() functions for interaction tests
  ],

  framework: {
    name: '@storybook/react-vite',
    options: {},
  },

  /* Use the project's existing TypeScript settings — Storybook
   * defaults to its own tsconfig which loses the @ path aliases
   * and React 19 / Vite 6 specifics. */
  typescript: {
    check: false,                   // tsc runs in CI separately
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) => (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true),
    },
  },

  docs: {
    autodocs: 'tag',                // Stories tagged 'autodocs' get a docs page generated
  },

  staticDirs: ['../public'],
};

export default config;
