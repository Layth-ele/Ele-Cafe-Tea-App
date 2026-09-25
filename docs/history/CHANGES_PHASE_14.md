# Phase 14 — Discover Page (QR-code landing)

Date: 2026-05-20
Scope: New customer-facing route `/discover` designed as the
landing surface for QR codes printed on in-café posters.

This implements the spec in `DISCOVER_PAGE_ROADMAP.md`. All 14
implementation steps from §13 of the roadmap are complete.

---

## What's new

A single rich landing page that turns a poster scan into a curated
discovery experience. Customer scans the poster, the page loads in
under a second, and they see:

1. A warm welcome with "Welcome from the poster" eyebrow
2. Today's six trending teas (reuses the homepage's query cache)
3. The combo carousel ("Pairs with our tea")
4. Eight tea categories as visual quick-pick cards
5. A full-bleed bridge to `/pairings` for deeper exploration
6. Visit info — address, phone, today's hours, get-directions
7. Share strip — pre-loaded with the page URL
8. Three back-to-home affordances (top link, mobile floating pill, bottom CTA)

The page is **additive** — zero existing behavior changed.

---

## Files touched

### New (3)
```
src/app/pages/DiscoverPage.tsx                   (~440 LOC)
CHANGES_PHASE_14.md                              (this doc)
DISCOVER_PAGE_ROADMAP.md                         (the spec — already shipped)
```

### Modified (9)
```
src/lib/routes.ts                                +1   (ROUTES.DISCOVER)
src/lib/rum.ts                                   +43  (sendDiscoverViewBeacon)
src/lib/businessHours.ts                         +22  (formatHoursForToday)
src/i18n/translations.ts                         +30  (EN→FR strings)
src/styles/design.css                            +400 (.dsc-* block)
src/app/App.tsx                                  +7   (lazy import + route)
src/app/components/Navbar.tsx                    +5   (NAV_LINKS entry)
src/app/components/CommandPalette.tsx            +2   (palette item + Compass icon)
functions/src/index.ts                           +11  (sitemap + DISCOVER_VIEW whitelist)
```

**Zero deletions. Zero schema changes. Zero Firestore rule changes.**

---

## Section-by-section implementation notes

### 14.1 Routes + lazy loading
`ROUTES.DISCOVER = '/discover'` added to `src/lib/routes.ts`.
Lazy-imported in `App.tsx` with `lazy_(() => import('./pages/DiscoverPage'))`
and registered immediately after the home route so the resolver
hits it on its second comparison — fastest possible match for the
QR-traffic path.

### 14.2 Navigation integration
**Navbar.** New "Discover" entry between Teas and Gift Builder in
the `getNavLinks` factory. Because both the desktop top nav and the
mobile drawer share this factory, the entry automatically appears
in both surfaces without further changes.

**Command Palette.** Added with `Compass` icon and search keywords
`['menu', 'combo', 'qr', 'poster']` — power users typing "menu" or
"qr" land on Discover even though those words aren't the label.

**Footer.** NOT added. Per roadmap §4.2: the footer is for
policy/info pages; discovery belongs in primary nav.

### 14.3 CSS — `.dsc-*` block
~400 lines added to `src/styles/design.css`. Conventions enforced:

- All selectors prefixed `.dsc-*` — no global rules
- Tokenized colors only (`--bg`, `--surface`, `--midnight`, `--gold-deep`,
  `--text`, `--text-2`, `--border`, etc.)
- Two `stylelint-disable-next-line` exceptions on the bridge-card
  veil and the floating-home pill — both intentionally use literal
  white/midnight RGBA for legibility on the photographic background
  (theme-invariant; same convention as `.cg-img-veil` from Phase 12)
- Three responsive breakpoints: `< 600px` (phone, 2-col), `600–1023px`
  (tablet, 3-col / 4-col), `≥ 1024px` (desktop, 6-col / 4-col)
- `prefers-reduced-motion` block disables transitions + hover-lift
  on cards and CTAs
- iOS `env(safe-area-inset-bottom)` on `.dsc-bg` padding and
  `.dsc-floating-home` bottom offset

### 14.4 DiscoverPage.tsx
Single self-contained 440-line component with private helpers:

- **`categoryIcon(id)`** — maps tea category ids to lucide icons
- **JSON-LD `ItemList`** — synthesized from the trending teas;
  embeds via `<SeoHead extraJsonLd={[...]} />`
- **IntersectionObserver** — flips `data-hidden` on the floating
  Home pill when the bottom CTA enters the viewport, avoiding
  duplicate "back to home" affordances
- **Hours display** — uses the new `formatHoursForToday()` helper
  with a try/catch fallback to "Hours updating soon"

The component reuses `useQuery(queryKeys.featured())` — the same
cache key HomePage uses — so visitors arriving from `/` pay zero
extra Firestore reads.

### 14.5 SEO
- `<SeoHead>` with title, description, canonical URL, breadcrumbs
- `ItemList` JSON-LD listing the trending teas (rich-result eligibility)
- Indexable (NOT `noIndex`) — searches for "elecafe menu" /
  "elecafe combo" / "elecafe discover" should land here
- Sitemap entry at priority `0.7`, weekly changefreq
- No custom `renderSeo` patching — the page's content is admin-curated
  but doesn't have permalink-style critical-path SEO needs like
  tea-profile or pairing pages do (per roadmap §7.4)

### 14.6 Telemetry — `DISCOVER_VIEW` beacon
New `sendDiscoverViewBeacon(query)` helper in `src/lib/rum.ts`,
mirrors the Phase 13 `sendPairingViewBeacon` pattern.

Called from `DiscoverPage` on mount with `window.location.search`
so UTM params from the poster (e.g. `?utm_source=poster&utm_medium=qr`)
get preserved through to the beacon's route field. The admin
dashboard can then split poster scans from organic discovery.

Server-side, the `ALLOWED` set in `recordRum` is extended with
`DISCOVER_VIEW`. Missing whitelist entries would silently 204 the
request — the client never knows, which is the right behavior for
non-blocking telemetry.

### 14.7 i18n
30 new EN→FR translation keys added to `src/i18n/translations.ts`,
covering every user-visible string on the page including the
section eyebrows, headings, subheads, button labels, and the
back-to-home variants.

"Discover" → "Découvrir". "Back to home" → "Retour à l'accueil".
Tone matches the existing Quebec-French boutique register from
the dictionary's header note.

---

## QR-code URL recommendation

Encode this URL in the QR code on the poster:

```
https://elecafe.ca/discover?utm_source=poster&utm_medium=qr&utm_campaign=instore
```

The UTM params survive into the `DISCOVER_VIEW` beacon, so the
dashboard can answer "how much traffic came from the poster vs
organic search vs sidebar nav."

Generate the QR:
```bash
npx qrcode --output discover-qr.png --error-correction-level H \
  "https://elecafe.ca/discover?utm_source=poster&utm_medium=qr&utm_campaign=instore"
```

- ECC level H = 30% error correction, survives smudges + creases
- Default size is fine; bump to `--small false` for posters > letter size
- Black on white, no embedded logo (printer-friendly)

---

## Verification

Manually inspected; not compiler-verified (no `node_modules` in
the build sandbox).

### What I checked by inspection
- [x] Zero inline `style={...}` props on DOM elements
  (`grep -c "style={" src/app/pages/DiscoverPage.tsx` = 0)
- [x] Zero `!important` in new CSS
- [x] All 61 `.dsc-*` selectors live inside the new block
- [x] Brace balance on all 6 modified files
- [x] Imports map to known exports (`@/types`, `@/lib/rum`,
  `@/lib/businessHours`, etc.) verified by grep
- [x] Button classes match codebase convention (`btn btn-dark btn-lg`
  / `btn btn-outline btn-lg` — NOT the removed `btn-primary`)
- [x] `ComboGallery` shareUrl-only invocation works (its embedded
  share strip is gated on `teaName && shareUrl`; without teaName
  the inner strip stays hidden, deferring to DiscoverPage's own
  `<ShareButtons>` in §7)
- [x] `useQuery(queryKeys.featured())` reuses HomePage's cache key —
  no duplicate Firestore reads for the trending grid

### What still requires environment-level verification
- [ ] `pnpm typecheck` — not runnable in the sandbox; verify locally
- [ ] `pnpm lint` — same
- [ ] `pnpm test:visual:update` — new screenshots need baselining
- [ ] `npm run test:a11y` — add `/discover` to the route list
- [ ] Lighthouse mobile — confirm LCP ≤ 1.5s budget
- [ ] Live test: scan a printed QR and verify the URL renders + the
      beacon fires (`tail -f` Cloud Functions log for `DISCOVER_VIEW`)

---

## What's NOT included (out of scope per roadmap §15)

- Custom OG image at `public/og-discover.png` (uses the default
  fallback; recommended to add later for polished social cards)
- Per-customer personalization
- A/B test of hero copy
- Reviews/ratings inline on the trending cards (extra query cost)
- "Order at counter" QR-to-staff workflow (separate scope)

---

## Pre-deploy

In order:

```bash
pnpm install                                     # if not already done
pnpm typecheck                                   # confirm TS green
pnpm lint                                        # confirm zero new warnings
cd functions && npm run build && cd ..           # rebuild Cloud Functions
firebase deploy --only firestore:rules,functions,hosting
```

After deploy:

1. Visit `https://elecafe.ca/discover` — confirm renders
2. View Source — confirm the canonical URL is set + ItemList JSON-LD present
3. Open Cloud Functions logs — confirm `DISCOVER_VIEW` beacons arriving
4. Generate the QR for the poster (URL above), print, scan, confirm flow
5. Add `/discover` to the visual-regression baseline set on next PR

---

End of Phase 14.
