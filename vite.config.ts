import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Required Firebase env vars. Must be present before a production build,
// or the deployed bundle will throw "auth/invalid-api-key" the first time
// a customer tries to sign in. See src/lib/firebase.ts for the runtime
// check that catches missing vars in dev — this build-time check is the
// deploy-boundary safety net.
const REQUIRED_FIREBASE_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export default defineConfig(({ command }) => {
  // Load .env files via Vite's loader (respects priority order:
  // .env.local > .env.<mode> > .env). Using process.env directly
  // misses values in dotfiles that haven't been exported to the shell.
  // Use 'production' as the mode hint — loadEnv reads .env regardless.
  const env = loadEnv('production', process.cwd(), '');

  // Build-time guard — only enforced when running `vite build`. Dev
  // mode (`vite` / `vite dev`) can boot with a partial .env so a fresh
  // clone of the repo doesn't hard-fail before the developer has set
  // up their config — they get the runtime warning from firebase.ts
  // instead, which is recoverable.
  if (command === 'build') {
    const missing = REQUIRED_FIREBASE_ENV.filter(k => !env[k]);
    if (missing.length > 0) {
      throw new Error(
        `\n\n` +
        `╔═══════════════════════════════════════════════════════════════╗\n` +
        `║  Build aborted — missing required Firebase env vars:          ║\n` +
        `║                                                               ║\n` +
        missing.map(k => `║    • ${k.padEnd(57)}║\n`).join('') +
        `║                                                               ║\n` +
        `║  Create a .env file at the project root with these values     ║\n` +
        `║  from Firebase Console → Project Settings → Your Apps →       ║\n` +
        `║  Web app → SDK setup → Config.                                ║\n` +
        `║                                                               ║\n` +
        `║  Without these, the deployed bundle will throw                ║\n` +
        `║  auth/invalid-api-key the moment a customer tries to sign in. ║\n` +
        `╚═══════════════════════════════════════════════════════════════╝\n\n`
      );
    }
  }

  return {
  plugins: [
    react(),
    tailwindcss(),

    // ── Async-load the main stylesheet ───────────────────────────────────
    // Phase 5 step 2 of the perf roadmap. Vite injects the bundled
    // <link rel="stylesheet"> into <head> at build time, which is render-
    // blocking — the browser won't paint until the CSS arrives. Critical
    // CSS lives inline in index.html (~3 KB), so the main stylesheet can
    // load asynchronously without flashing unstyled content.
    //
    // Pattern (browser-supported since Chrome 73 / Firefox 56 / Safari 12.1):
    //   <link rel="preload" as="style" href="..." onload="this.rel='stylesheet'">
    //   <noscript><link rel="stylesheet" href="..."></noscript>
    //
    // What this saves: ~50-200ms on slow connections (the round-trip to
    // fetch a render-blocking CSS file). FCP improvement is the headline
    // metric. The trade-off: a brief moment where text appears in the
    // system fallback font before the brand fonts swap in (already true
    // because of font-display: swap, so no perceptible regression).
    {
      name: 'async-css',
      enforce: 'post',
      transformIndexHtml(html) {
        // Match <link rel="stylesheet" crossorigin href="/assets/index-XYZ.css">
        // and rewrite to the preload+onload pattern. The crossorigin and
        // any other attributes are preserved.
        return html.replace(
          /<link rel="stylesheet"([^>]*?)href="([^"]+\.css)"([^>]*?)>/g,
          (_match, before, href, after) => {
            // The combined attrs (everything except rel and href). Vite
            // emits them in different orders across versions, so we
            // capture pre+post and concat.
            const attrs = `${before}${after}`.trim();
            return [
              // Preload kicks the request off immediately, but doesn't
              // apply the styles. The onload swap flips it to a real
              // stylesheet at the moment it's parsed.
              `<link rel="preload" as="style" ${attrs} href="${href}" onload="this.onload=null;this.rel='stylesheet'">`,
              // Fallback for users with JS disabled. Render-blocking,
              // but that's the right behavior here — without JS, the
              // app shows the noscript content anyway, which still
              // benefits from full styling.
              `<noscript><link rel="stylesheet" ${attrs} href="${href}"></noscript>`,
            ].join('');
          }
        );
      },
    },

    // ── Progressive Web App ─────────────────────────────────────────────
    // Service worker: caches JS/CSS/fonts on first visit.
    // Repeat visitors load instantly from cache — no network request.
    //
    // STALE-BUNDLE PROTECTION ("Failed to fetch dynamically imported module" fix):
    //   1. cleanupOutdatedCaches — deletes stale precache entries on SW activation.
    //   2. registerType: 'prompt' — new SWs wait; only activate when the user
    //      clicks "Update now" in SwUpdateBanner. Using 'autoUpdate' would call
    //      skipWaiting immediately, silently killing in-flight checkout flows.
    //   3. clientsClaim: true — first-ever SW activation claims all open tabs
    //      immediately (initial install only — subsequent updates wait for user).
    //   4. navigateFallbackDenylist — prevents asset/API/crawler 404s from being
    //      rewritten to index.html (the source of the "MIME type text/html" error).
    VitePWA({
      // 'prompt': new SWs enter WAITING state. SwUpdateBanner (via useRegisterSW)
      // detects needRefresh and shows a Sonner toast with an "Update now" action
      // that calls updateServiceWorker(true). This is the correct pattern for any
      // injectManifest builds src/sw.ts through Vite — enabling npm imports
      // (workbox-*, firebase/messaging/sw), import.meta.env for Firebase config,
      // SKIP_WAITING handler, FCM onBackgroundMessage, and notificationclick.
      // generateSW cannot do any of these: it only generates Workbox caching.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: 'inline',
      injectManifest: {
        // Assets included in __WB_MANIFEST (used by precacheAndRoute in sw.ts).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Exclude admin chunks — customers never visit /admin and shouldn't
        // carry ~30 KB of admin UI in their offline cache.
        globIgnores: [
          '**/Admin*-*.js',
          '**/admin-*-*.js',
          '**/AdminOrders-*.js',
          '**/AdminProducts-*.js',
          '**/AdminCustomers-*.js',
          '**/AdminAnalytics-*.js',
          '**/AdminSettings-*.js',
          '**/AdminPromotions-*.js',
          '**/AdminOverview-*.js',
        ],
      },
      manifest: {
        // Explicit id gives the browser a stable PWA identity.
        // Without it the browser uses start_url — any URL change creates
        // a duplicate install entry for the same app.
        id: '/',
        name: 'Ele Café',
        short_name: 'Ele Café',
        description: 'Premium loose-leaf tea, ceremonial matcha & fresh coffee at 895 West Broadway, Vancouver. Order online for delivery or pickup.',
        // lang + dir are required by WAI-ARIA for accessible PWA manifests.
        lang: 'en',
        dir: 'ltr',
        theme_color: '#0f1c26',
        background_color: '#fdfaf5',
        display: 'standalone',
        // display_override gives an ordered preference list. window-controls-overlay
        // lets the installed Chromium desktop app paint into the title bar.
        // Falls back through standalone → minimal-ui → browser.
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        start_url: '/',
        scope: '/',
        orientation: 'portrait-primary',
        icons: [
          // purpose: 'any maskable' (combined) is deprecated — Lighthouse flags it.
          // Use two separate entries so each resolves independently.
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'      },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'      },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon.svg',     sizes: 'any',     type: 'image/svg+xml', purpose: 'any'  },
        ],
        share_target: {
          action: '/share',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        categories: ['food', 'shopping', 'lifestyle'],
        // Screenshots — Chrome on Android renders these in the enhanced install prompt.
        // To enable: add 1280x800 (desktop) + 750x1334 (mobile) PNGs to public/screenshots/
        // then un-comment:
        // screenshots: [
        //   { src: '/screenshots/home-desktop.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide',   label: 'Ele Café homepage — desktop' },
        //   { src: '/screenshots/home-mobile.png',  sizes: '750x1334', type: 'image/png', form_factor: 'narrow', label: 'Ele Café homepage — mobile'  },
        //   { src: '/screenshots/products-mobile.png', sizes: '750x1334', type: 'image/png', form_factor: 'narrow', label: 'Browse teas — mobile' },
        // ],
      },
    })
  ],

  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },

  // ── Build optimisations ─────────────────────────────────────────────────
  build: {
    // Raise warning limit to 800 kB (default 500 is too strict for Firebase)
    chunkSizeWarningLimit: 800,

    rollupOptions: {
      output: {
        // ── Manual chunk splitting ───────────────────────────────────────
        // Each group loads independently — user only downloads what they visit.
        manualChunks(id) {
          // React core — always needed
          if (id.includes('node_modules/react-dom')) return 'react-core';
          if (id.includes('node_modules/react/')   || id.endsWith('node_modules/react')) return 'react-core';
          // scheduler is a runtime dep of react-dom — keep it with react-core
          // to avoid a `vendor -> react-core -> vendor` circular chunk warning.
          if (id.includes('node_modules/scheduler')) return 'react-core';
          // react-router — used everywhere
          if (id.includes('node_modules/react-router')) return 'react-core';

          // Firebase — split by sub-package so unused modules are tree-shaken.
          // Note: the thin `firebase/*` entry barrels re-export from `@firebase/*`;
          // we must match BOTH namespaces to catch the actual bundled code.
          if (id.includes('node_modules/@firebase/auth') ||
              id.includes('node_modules/firebase/auth')) return 'firebase-auth';
          if (id.includes('node_modules/@firebase/firestore') ||
              id.includes('node_modules/firebase/firestore')) return 'firebase-firestore';
          if (id.includes('node_modules/@firebase/storage') ||
              id.includes('node_modules/firebase/storage')) return 'firebase-storage';
          if (id.includes('node_modules/@firebase/functions') ||
              id.includes('node_modules/firebase/functions')) return 'firebase-functions';
          if (id.includes('node_modules/@firebase/messaging') ||
              id.includes('node_modules/firebase/messaging')) return 'firebase-messaging';
          if (id.includes('node_modules/@firebase/analytics') ||
              id.includes('node_modules/firebase/analytics')) return 'firebase-analytics';
          if (id.includes('node_modules/@firebase') ||
              id.includes('node_modules/firebase')) return 'firebase-core';

          // Radix UI — all shadcn primitives
          if (id.includes('node_modules/@radix-ui')) return 'radix-ui';

          // Phase 10 — FLIP animations library. Only ProductsPage imports
          // it, and ProductsPage is already a lazy route. Isolating
          // react-flip-toolkit (and its rematrix transitive dep) into its
          // own chunk keeps the vendor budget tight: the chunk only
          // loads when /products is visited, not on first paint.
          if (id.includes('node_modules/react-flip-toolkit') ||
              id.includes('node_modules/rematrix')) return 'flip';

          // Charts — only admin analytics page needs this
          if (id.includes('node_modules/recharts') ||
              id.includes('node_modules/d3-') ||
              id.includes('node_modules/victory-vendor')) {
            return 'charts';
          }

          // Date utilities — used by several pages
          if (id.includes('node_modules/date-fns')) return 'date-fns';

          // Form / validation — schemas chunk groups zod + react-hook-form
          // + the resolver. Zod loads from every Firestore read path
          // (src/schemas/*.schema.ts barrel); react-hook-form is used on
          // 8 pages (Login, Signup, AccountPage, all 5 admin pages with
          // create/edit forms). Grouping them keeps the index chunk small
          // and lets the browser cache the form layer separately.
          if (id.includes('node_modules/zod'))                   return 'schemas';
          if (id.includes('node_modules/react-hook-form'))       return 'schemas';
          if (id.includes('node_modules/@hookform'))             return 'schemas';

          // PDF export (admin inventory reports + the equipment log) —
          // jsPDF and its optional renderers are ~1.3 MB unminified. Only
          // the export buttons import them (dynamically), so they get
          // their own chunk instead of riding in `vendor` on every page.
          if (/node_modules\/(jspdf|jspdf-autotable|html2canvas|canvg|pako|fflate|dompurify|core-js|fast-png|iobuffer|rgbcolor|stackblur-canvas|svg-pathdata|performance-now|raf)\//.test(id)) return 'pdf';

          // State / data layer
          if (id.includes('node_modules/@tanstack/query-core'))  return 'data-layer';
          if (id.includes('node_modules/@tanstack/react-query')) return 'data-layer';
          if (id.includes('node_modules/zustand'))               return 'data-layer';
          if (id.includes('node_modules/immer'))                 return 'data-layer';

          // Icons — only lucide-react. The previous build also chunked
          // @phosphor-icons/react here, but a 0-result grep across src/
          // confirmed it had zero imports anywhere in the app. Dropped
          // in Phase 0 of the UI/UX roadmap; saves ~5 kB gzipped.
          if (id.includes('node_modules/lucide-react')) return 'icons';

          // Fonts (self-hosted CSS)
          if (id.includes('node_modules/@fontsource')) return 'fonts';

          // Everything else from node_modules → vendor chunk
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },

    // Enable CSS code splitting — only load CSS for the current page
    cssCodeSplit: true,

    // Minify with esbuild (default, faster than terser)
    minify: 'esbuild',

    // Source maps only in development
    sourcemap: false,

    // Target modern browsers — smaller output (no legacy polyfills)
    target: 'es2020',
  },

  // ── esbuild config (applies to both transform and minify) ───────────────
  // Strip license/JSDoc comment blocks. Firebase ships ~116 @license blocks
  // per chunk (~70 KB / 27% of firebase-firestore.js, ~similar for auth /
  // core). Without this, Lighthouse's `unminified-javascript` audit scores
  // 0 even though esbuild's identifier-mangling and whitespace-stripping
  // ran fine — the audit detects the comment whitespace as "unminified".
  //
  // 'none' is the strongest setting — fully removes legal comments. Apache
  // 2.0 (Firebase's license) requires preserving the LICENSE somewhere in
  // the distribution, which we already do via package.json deps + the
  // public attribution page (ATTRIBUTIONS.md / /about). So removing the
  // inline @license blocks is compliant.
  //
  // If your team prefers preserving them in a separate file instead of
  // removing entirely, change to 'external' which writes them to a sibling
  // .LEGAL.txt file. We chose 'none' for the smaller transfer.
  esbuild: {
    legalComments: 'none',
  },

  // ── Dev server ────────────────────────────────────────────────────────────
  server: {
    port: 5173,
    // Warm up critical modules on start
    warmup: { clientFiles: ['./src/main.tsx', './src/app/App.tsx', './src/lib/firebase.ts'] },
  },

  // ── Dependency pre-bundling ───────────────────────────────────────────────
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router', 'firebase/app', 'firebase/auth', 'firebase/firestore'],
    exclude: ['firebase-admin'],  // server-only — never bundle in browser
  },
  };
});
