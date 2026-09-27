# Ele Café

The website and online shop for **Ele Café**, a loose leaf tea shop and tea café at 895 West Broadway, Vancouver — live at **[elecafe.ca](https://elecafe.ca)**.

Customers browse and buy loose leaf teas (shipped across Canada or picked up in store), see the café menu and tea & pastry pairings, and manage orders and rewards. Staff run everything — products, orders, inventory, promotions, pairings, settings — from the admin dashboard at `/admin`. The whole site is bilingual (English, and French under `/fr/…`).

## Features

**Shop**
- Tea catalogue with categories, collections, filters and search; tea pages with brewing guide, reviews (verified-purchase badges) and related teas
- Cart, checkout with card authorisation (Clover) captured when staff approve the order, guest checkout, promo codes, loyalty credit
- Gift builder, wishlist, back-in-stock alerts, order tracking

**Café**
- Café menu (coffee, matcha, hojicha, tea drinks)
- Tea & pastry pairings with dietary tags (dairy free, gluten free, vegan, vegetarian) and calories

**Customers**
- Accounts, order history, notifications (in-app, push and email) with per-category preferences and one-click unsubscribe
- Marketing emails: promotions, new arrivals, cart and refill reminders

**Search & performance**
- Server-rendered pages for Google (`renderSeo`), product/FAQ/business structured data, bilingual sitemap with `hreflang`
- Free Tea Caffeine Calculator (`/tea-caffeine-calculator`)
- Home page hero rendered on the server with inlined critical CSS (mobile Lighthouse 96–98)

**Operations**
- Admin dashboard: products, orders, inventory, promotions, pairings, customers, analytics, settings
- Automatic French translation of new content, WebP image variants, an hourly site health check that emails the store when something breaks

## Tech stack

| Area | Tools |
|---|---|
| Front end | React 19, TypeScript, Vite 6, Tailwind CSS 4, Zustand, TanStack Query, React Router |
| Back end | Firebase — Firestore, Auth, Cloud Functions (Node 22), Hosting, Storage, App Check (reCAPTCHA) |
| Services | Clover (payments), Resend (email), Google Cloud Translation, Sentry (errors) |
| Testing | Vitest (unit), Firestore rules tests (emulator), Playwright (visual, a11y, SEO, performance), Lighthouse CI |

## Project structure

```
src/                     React app
  app/pages/             Routes (tea pages, checkout, admin, …)
  app/components/        UI components
  i18n/                  English → French dictionary and helpers (useT)
  lib/, hooks/, store/   Firebase access, data hooks, Zustand stores
  styles/                Design tokens and CSS (see src/styles/README.md)
functions/src/           Cloud Functions
  index.ts               Orders, emails, renderSeo (server-rendered pages), sitemap, …
  lib/                   Shared with the app: store facts, SEO copy, café menu, …
  marketing.ts, translate.ts, imageVariants.ts, watchdog.ts, …
public/                  Static assets (icons, share image, robots.txt)
tests/                   Unit, rules, visual, a11y, SEO and perf tests
scripts/                 Build and maintenance scripts
docs/                    Guides (architecture, emails, forms, schemas, …)
```

Content that both the website and the server need — store facts, SEO copy, the café menu, the home hero — lives once in `functions/src/lib/` and is imported by both, so Google and customers always see the same text.

## Getting started

**Requirements:** Node 22, npm, and the Firebase CLI (`npm install -g firebase-tools`, then `firebase login`).

```sh
git clone <repo-url>
cd Ele_Cafe
npm install
cd functions && npm install && cd ..
cp .env.example .env.local      # then fill in the values
npm run dev                     # http://localhost:5173
```

`.env.local` holds the public web-app keys (`VITE_FIREBASE_*`, `VITE_RECAPTCHA_SITE_KEY`, `VITE_CLOVER_*`, `VITE_SENTRY_DSN`). Server secrets are stored in Firebase, never in the repo:

```sh
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set CLOVER_PRIVATE_TOKEN
firebase functions:secrets:set RECAPTCHA_SECRET_KEY
```

To load example data into a fresh project: `npx tsx src/scripts/seedEverything.tsx`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm run build` | Production build (also generates the home page's critical CSS) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` / `npm run lint:css` | ESLint / Stylelint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:rules` | Firestore security-rules tests (starts the emulator) |
| `npm run test:visual` · `test:seo` · `test:lighthouse` | Playwright visual and SEO tests, Lighthouse CI |
| `npm run size` | Bundle-size budget check |

A pre-commit hook (Husky + lint-staged) runs ESLint and Prettier on staged files.

## Deploying

```sh
firebase deploy --only hosting                 # website
firebase deploy --only functions:renderSeo     # one function
firebase deploy --only firestore:rules         # security rules
firebase deploy                                # everything
```

Hosting runs `npm run build` automatically, and Functions compile on deploy. The full first-time setup (project, App Check, secrets, domains) is in **[DEPLOY.md](DEPLOY.md)**.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — key design decisions and the rules for changing them
- [DEPLOY.md](DEPLOY.md) and [OPS_SETUP.md](OPS_SETUP.md) — deployment and operations setup
- [ADMIN_GUIDE.md](ADMIN_GUIDE.md) and [docs/ADMIN_QUICK_START.md](docs/ADMIN_QUICK_START.md) — using the admin dashboard
- [docs/](docs/) — emails, forms, schemas, App Check, accessibility, motion and more
- [src/styles/README.md](src/styles/README.md) — the CSS and design-token system

## License

Private project © Ele Café, Vancouver. All rights reserved. Third-party credits are in [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
