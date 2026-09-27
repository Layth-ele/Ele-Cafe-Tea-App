/**
 * critical-home.mjs — post-build: the CSS the server-rendered home hero
 * needs, inlined so it paints correctly before the async main stylesheet.
 *
 * renderSeo writes the hero (functions/src/lib/homeHero.ts) into "/" and
 * "/fr". Beasties renders that markup against the built stylesheet, keeps
 * only the rules that match, and we store them in dist/app.html inside
 * <script type="text/plain" id="critical-home-css"> (inert on every page);
 * renderSeo turns it into a <style> placed BEFORE the main stylesheet on
 * the home page, so the full CSS still wins every tie once it loads.
 *
 * Run after `vite build` (package.json "build").
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import Beasties from 'beasties';

const DIST = 'dist';
const shell = readFileSync(`${DIST}/index.html`, 'utf8');

// homeHero.ts is TypeScript shared with functions/ — bundle it on the fly.
const out = await build({
  entryPoints: ['functions/src/lib/homeHero.ts'],
  bundle: true, format: 'esm', write: false, platform: 'node',
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);

const hero = (lang) => mod.homeHeroHtml({
  lang, teaCount: 77, giftOn: true, street: '895 West Broadway',
  mapsUrl: 'https://maps.google.com/', base: lang === 'fr' ? '/fr' : '',
});
const root = `<div id="root"><div class="min-h-screen flex flex-col"><main id="main-content" class="flex-1"><div class="hp-page">${hero('en')}${hero('fr')}</div></main></div></div>`;

// Probe page: the shell with the hero in #root and the main stylesheet as a
// normal <link> (Beasties only reads real stylesheets). Drop the noscript
// fallback so its generic tags don't pull in unrelated rules.
const cssHref = shell.match(/href="(\/assets\/index-[^"]+\.css)"/)?.[1];
if (!cssHref) throw new Error('critical-home: main stylesheet link not found');
const probe = shell
  .replace(/<!-- seo-noscript:start -->[\s\S]*?<!-- seo-noscript:end -->/, '')
  .replace('<div id="root"></div>', root)
  .replace(/<link rel="preload" as="style"[^>]*>/g, '')
  .replace(/<noscript><link rel="stylesheet"[^>]*><\/noscript>/g, '')
  .replace('</head>', `<link rel="stylesheet" href="${cssHref}"></head>`);

const beasties = new Beasties({
  path: DIST, publicPath: '/', preload: false, inlineFonts: false,
  pruneSource: false, reduceInlineStyles: false, logLevel: 'warn',
  // Keep the responsive rules — the hero is resized by media queries.
  keyframes: 'none',
});
const processed = await beasties.process(probe);
// Beasties inserts its <style> right before the stylesheet link it read.
const linkAt = processed.indexOf(`<link rel="stylesheet" href="${cssHref}"`);
const styleAt = processed.lastIndexOf('<style>', linkAt);
const css =
  linkAt > 0 && styleAt > 0 && /^\s*$/.test(processed.slice(processed.indexOf('</style>', styleAt) + 8, linkAt))
    ? processed.slice(styleAt + 7, processed.indexOf('</style>', styleAt))
    : '';
if (!css || css.length < 500) throw new Error('critical-home: no critical CSS extracted');

const tag = `<script type="text/plain" id="critical-home-css">${css.replace(/<\//g, '<\\/')}</script>`;
const app = readFileSync(`${DIST}/app.html`, 'utf8').replace('</head>', `  ${tag}\n  </head>`);
writeFileSync(`${DIST}/app.html`, app);
console.log(`critical-home: ${(css.length / 1024).toFixed(1)} KB of hero CSS → dist/app.html`);
