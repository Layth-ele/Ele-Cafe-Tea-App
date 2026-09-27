/**
 * main.tsx — Vite + React 19 entry point
 *
 * Pure client-side SPA running on Firebase Hosting.
 * SEO is handled via React 19's native <title>/<meta>/<link>/<script> hoisting
 * (no more react-helmet-async) and the JSON-LD schemas embedded in index.html.
 *
 * Theme bootstrap: initTheme() runs ONCE before React mounts so the
 * correct theme attributes (data-theme + .dark class) are applied
 * during the initial paint — preventing the brief light-then-dark
 * flash a deferred init would cause. The Zustand themeStore handles
 * all subsequent state; no React Context wrapper needed.
 *
 * The previous version wrapped <App /> in <ThemeProvider> from
 * src/contexts/ThemeContext.tsx — that file was vestigial after the
 * migration to Zustand (no component ever called its useTheme hook,
 * they all used useThemeStore directly). The wrapper added no value
 * but did create a cross-import (ThemeContext → lib/theme) that
 * broke the build on environments where the file got out of sync.
 * Removed for clarity AND robustness.
 */
// Self-hosted fonts. Use latin + latin-ext subsets only — the unicode-range
// declarations in the bundled CSS prevent the browser from downloading subsets
// it doesn't need, but parsing the @font-face rules still costs CPU. The
// non-subsetted entry points (e.g. '@fontsource/cormorant-garamond/400.css')
// pull cyrillic, cyrillic-ext, and vietnamese subsets that this site never
// renders. latin covers English; latin-ext covers French (é, à, ç, ô, etc.)
// which is the only other language on this site.
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-ext-400.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/cormorant-garamond/latin-ext-400-italic.css';
import '@fontsource/cormorant-garamond/latin-300.css';
import '@fontsource/cormorant-garamond/latin-ext-300.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-ext-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cormorant-garamond/latin-ext-600.css';
import '@fontsource/cormorant-garamond/latin-300-italic.css';
import '@fontsource/cormorant-garamond/latin-ext-300-italic.css';
import '@fontsource/jost/latin-400.css';
import '@fontsource/jost/latin-ext-400.css';
import '@fontsource/jost/latin-300.css';
import '@fontsource/jost/latin-ext-300.css';
import '@fontsource/jost/latin-500.css';
import '@fontsource/jost/latin-ext-500.css';
import '@fontsource/jost/latin-600.css';
import '@fontsource/jost/latin-ext-600.css';

// Phase 8.2 — Preload the two above-fold font files (Jost 400 body
// + Cormorant Garamond 300 display heading) so the browser starts
// fetching them in parallel with the JS bundle instead of waiting
// for the CSS parser to encounter the @font-face url() declarations
// (a 200-400ms savings on slow connections).
//
// Why ?url: fontsource ships hashed file paths via Vite's asset
// pipeline. A static <link rel="preload" href="/fonts/jost.woff2">
// in index.html would 404. The ?url suffix tells Vite to emit the
// asset and resolve the import to its final hashed URL at build time.
//
// Why two files, not all of them: the rest of the weights load fine
// via the normal @font-face mechanism (they're not above-fold). The
// browser de-dupes preload + @font-face fetches when the URL matches,
// so there's no double-download risk.
import jost400 from '@fontsource/jost/files/jost-latin-400-normal.woff2?url';
import cormorant300 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-300-normal.woff2?url';

import { createRoot } from 'react-dom/client';
import App from './app/App.tsx';
import { initTheme } from './lib/theme';
import { initRUM } from './lib/rum';
import { initSentry } from './lib/sentry';
import { reportTelemetryWiring } from './lib/telemetryGuard';
import './styles/index.css';
import { isChunkLoadError, recoverFromStaleBundle } from '@/lib/chunkRecovery';
import { useLanguageStore } from '@/store/languageStore';
import { loadFrench } from '@/i18n/useT';
import { isFrPath, syncUrlToLang } from '@/i18n/langUrl';

(function injectFontPreloads() {
  const fonts: Array<{ href: string }> = [{ href: jost400 }, { href: cormorant300 }];
  for (const f of fonts) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'font';
    link.type = 'font/woff2';
    link.href = f.href;
    // Required for self-hosted fonts to be re-usable from CSS.
    // Without crossorigin, the preload completes but the @font-face
    // fetch fires a SECOND time (because the cache entry isn't
    // considered re-usable for CORS-tainted resources).
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
})();

// Apply theme attributes to <html> BEFORE React mounts. Reading from
// localStorage and setting data-theme + .dark synchronously eliminates
// the FOUC (flash of unstyled content) that a useEffect-based init
// would cause on first paint.
initTheme();

// ── Global stale-bundle recovery ─────────────────────────────────────────────
// Catches chunk-load errors that fall OUTSIDE a React render path
// (e.g. prefetched chunks, lazy imports during effects, async data
// flows). The ErrorBoundary handles in-render cases; this handles
// everything else. Same auto-reload + cache-purge logic as
// ErrorBoundary, gated by a sessionStorage flag so we don't loop
// infinitely if the new bundle ALSO has a real error.
//
// Why this matters in production: a long-lived tab (user left it
// open overnight) with the OLD index.html still references the OLD
// chunk filenames. When react-router prefetches a route or Suspense
// triggers a lazy load, it asks for a chunk that no longer exists.
// Without this handler the user sees a cryptic console error and a
// blank page. With it, the page reloads fresh and Just Works.
(function installChunkErrorRecovery() {
  if (typeof window === 'undefined') return;
  // Vite's own signal for a failed lazy JS/CSS chunk — handle it before
  // it surfaces as an error.
  window.addEventListener('vite:preloadError', (event) => {
    if (recoverFromStaleBundle()) event.preventDefault();
  });
  window.addEventListener('error', (event) => {
    const msg = event.message || (event.error?.message ?? '');
    if (isChunkLoadError(msg)) {
      console.warn('[ChunkErrorRecovery] window error → reloading:', msg);
      recoverFromStaleBundle();
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      console.warn('[ChunkErrorRecovery] unhandled rejection → reloading:', event.reason);
      recoverFromStaleBundle();
    }
  });
})();

// The URL decides the language: /fr/… is French (what Google indexes);
// a visitor who chose French lands on the /fr version of any English URL.
if (isFrPath(window.location.pathname)) {
  if (useLanguageStore.getState().language !== 'fr') useLanguageStore.setState({ language: 'fr' });
  document.documentElement.lang = 'fr';
} else if (useLanguageStore.getState().language === 'fr') {
  syncUrlToLang('fr');
}

// French visitors: fetch the dictionary first so the page never paints in
// English and then flips. Everyone else renders immediately.
// Server-painted content in #root (the home hero — renderSeo): keep a copy
// for the signed-in auth wait (AuthContext shows it instead of a blank
// screen), and skip the entrance animations on this first page so React
// swapping in identical DOM doesn't flicker.
const rootEl = document.getElementById('root')!;
if (rootEl.firstElementChild) {
  (window as { __ELE_SSR_ROOT__?: string }).__ELE_SSR_ROOT__ = rootEl.innerHTML;
  document.documentElement.classList.add('ssr-painted');
  setTimeout(() => document.documentElement.classList.remove('ssr-painted'), 4000);
}
const render = () => createRoot(rootEl).render(<App />);
if (useLanguageStore.getState().language === 'fr') loadFrench().then(render, render);
else render();

// ── Telemetry ────────────────────────────────────────────────────────────────
// Phase 0 of the UI/UX roadmap. Order matters: do these AFTER React mounts
// so they don't compete with the initial render for the main thread.
//
//   • initRUM()    — Web Vitals beacons to /api/rum (recordRum function).
//                    No-ops in dev unless VITE_RUM_ENDPOINT is set.
//   • initSentry() — Error tracking + session replay. Skips itself when
//                    VITE_SENTRY_DSN is missing, so dev installs without
//                    a Sentry account just work.
initRUM();
initSentry();

// Dev-only one-shot check: warn if telemetry env vars are missing so
// staging/local sessions don't silently drop errors+vitals. Tree-
// shaken in production builds.
reportTelemetryWiring();
