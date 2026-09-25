import type { Preview } from '@storybook/react';
import { withThemeByClassName } from '@storybook/addon-themes';

/* Global stylesheet load order matches src/main.tsx so stories render
 * with the same visual baseline as the running app:
 *   fonts → tailwind/tokens → focus → design.
 *
 * The single index.css import re-exports all four in the same order. */
import '../src/styles/index.css';

/* Phase 2 — also load the brand fonts so heading typography renders
 * accurately in stories (otherwise we get system-font fallback and the
 * design-token clamp() type scale looks wrong). Subsetted to latin +
 * latin-ext to match main.tsx. */
import '@fontsource/cormorant-garamond/latin-300.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/jost/latin-300.css';
import '@fontsource/jost/latin-400.css';
import '@fontsource/jost/latin-500.css';
import '@fontsource/jost/latin-600.css';

const preview: Preview = {
  parameters: {
    /* Controls — auto-detect from prop types where possible */
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date:  /Date$/,
      },
    },

    /* Layout — center small components, full-screen for layouts */
    layout: 'centered',

    /* Backgrounds — disabled because the theme decorator handles
     * light/dark via the .dark class on <html>, which uses our
     * tokenized --bg color. The default Storybook backgrounds would
     * fight with that. */
    backgrounds: { disable: true },

    /* Viewports for responsive testing — same set as
     * playwright.config.ts so visual context matches across tools. */
    viewport: {
      viewports: {
        iphoneSE:    { name: 'iPhone SE',    styles: { width: '375px', height: '667px' } },
        iphone14:    { name: 'iPhone 14',    styles: { width: '390px', height: '844px' } },
        ipadMini:    { name: 'iPad Mini',    styles: { width: '768px', height: '1024px' } },
        desktop:     { name: 'Desktop',      styles: { width: '1440px', height: '900px' } },
        desktopWide: { name: 'Desktop wide', styles: { width: '1920px', height: '1080px' } },
      },
    },

    /* a11y — runs axe-core on every story. Same WCAG tags as the
     * Playwright a11y suite so signal is consistent across tools. */
    a11y: {
      config: {
        rules: [
          /* Re-enable color-contrast in case a story disables it via
           * default (some Storybook versions do). */
          { id: 'color-contrast', enabled: true },
        ],
      },
      options: {
        runOnly: {
          type:   'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
        },
      },
    },

    docs: {
      toc: true,                  // Table of contents on docs pages
    },
  },

  /* Phase 2 — theme switcher.
   *
   * Toggle in the Storybook toolbar flips the `.dark` class on
   * <html>, which is exactly how src/lib/theme.ts switches at
   * runtime. The token system in tokens.css then re-resolves every
   * `var(--…)` against the dark-mode block.
   *
   * defaultTheme: 'light' matches the user-default in the running app
   * (the theme bootstrap in index.html only adds .dark when explicitly
   * requested by localStorage). */
  decorators: [
    withThemeByClassName({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'light',
    }),
  ],

  /* Tag every story autodocs by default — turn off explicitly per
   * story if a docs page isn't appropriate (rare). */
  tags: ['autodocs'],
};

export default preview;
