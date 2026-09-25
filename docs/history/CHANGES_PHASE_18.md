# Phase 18 — Discover Removed · Tea Pairings Nav · Gift Builder Gating

Date: 2026-05-20
Scope: Three connected merchant requests handled in one pass.

---

## 1. Removed `/discover` entirely

Per merchant decision the QR-landing page was redundant with the
existing `/pairings` index (Phase 12). Deleted top-to-bottom:

```
src/app/pages/DiscoverPage.tsx              DELETED  (~440 LOC)
src/lib/routes.ts                            -1       ROUTES.DISCOVER removed
src/app/App.tsx                              -7       lazy import + route registration removed
src/lib/rum.ts                               -42      sendDiscoverViewBeacon removed
src/app/components/CommandPalette.tsx        -2       Discover palette item + Compass icon removed
src/styles/design.css                        -494     entire .dsc-* block removed
src/i18n/translations.ts                     -30      every Discover-page EN→FR string removed
functions/src/index.ts                       -6       sitemap entry + DISCOVER_VIEW whitelist removed
```

Zero references survive in the codebase — verified with four targeted
greps (`ROUTES.DISCOVER`, `DiscoverPage`, `sendDiscoverViewBeacon`,
`.dsc-`, `DISCOVER_VIEW`).

**Old `/discover` URL handling:** The route is no longer registered,
so requests resolve to the existing 404 page via React Router's
fallback. If you want a 301 redirect for old QR codes still in the
wild, that's a one-line add to `functions/src/index.ts` — say the
word.

---

## 2. Nav: Discover → "Tea pairings" → /pairings

The label was chosen for brand fit:
- **English:** "Tea pairings" — clear, on-brand serif voice
- **French:** "Accords gourmands" — literally "gourmet pairings",
  matches the boutique register the existing French dictionary uses
  ("Créer un coffret" for Gift Builder)

The entry sits between "Teas" and "Gift Builder" in `getNavLinks`,
exactly where Discover sat — so the visual nav ordering doesn't
change. Desktop nav, mobile drawer, and the Command Palette all
pick up the new label automatically through the factory pattern.

```
src/app/components/Navbar.tsx                +1 entry  Tea pairings → ROUTES.PAIRINGS
src/app/components/CommandPalette.tsx        +1 entry  Tea pairings + Coffee icon + keywords
src/i18n/translations.ts                     +3        Tea pairings, See pairings, See all pairings
```

The Command Palette entry has search keywords `['pair', 'pastry',
'combo', 'food']` so power users typing any of those words still
land on `/pairings`.

---

## 3. Gift Builder gating polish

The existing gate (in `useSettings.giftBuilderEnabled` + admin toggle
at `/admin/settings`) was already plumbed correctly through:

- `GiftsPage` — disables all three CTA buttons when not enabled
- `GiftBuilderModal` — defensive: closes itself if somehow opened
  while disabled
- `AdminSettings` — toggle UI exists
- `useSettings` — `placeholderData: SETTING_DEFAULTS` so the flag is
  always defined from t=0 (no flash-of-enabled-wizard)

What changed in Phase 18:

**Customer-visible notice.** Previously when admins disabled the
gift builder, customers saw a "Coming soon" button with a lock icon
but no broader explanation — and the bundle preview cards below
were still rendered, looking interactive but silently inert. Now
there's an explicit `.gp-unavailable-notice` between the hero copy
and the CTA:

> 🔒 Not available currently

The notice uses the gold-soft brand color (subtle accent, not alarm
red — this is not an error, it's a temporary unavailability). Only
shown to non-admin visitors; admins still get the "Admin preview"
banner so they can QA the wizard with the feature off.

**CTA copy.** Three buttons updated:
- Hero "Build Your Tea Bundle" → "Not available currently"
- Bundle card title attribute "Coming soon" → "Not available currently"
- Bottom "Start Building" → "Not available currently"

All three go through the same `t('Not available currently')` key so
French speakers see "Indisponible pour le moment".

**Verified enable path:** When `giftBuilderEnabled === true`, all
three CTAs reactivate, the notice disappears, and `handleOpen()`
fires `openBuilder()` which mounts the modal. The defensive gate in
`GiftBuilderModal.tsx` (line 78-80) stays as-is — it's there to
catch the edge case where state is stale after a settings flip
mid-session.

```
src/app/pages/GiftsPage.tsx                  +30      notice + useT hook + CTA copy updates
src/styles/design.css                        +20      .gp-unavailable-notice rule
src/i18n/translations.ts                     +1       Not available currently → Indisponible pour le moment
```

---

## Files touched (summary)

```
DELETED:
  src/app/pages/DiscoverPage.tsx                 ~440 LOC

MODIFIED:
  src/lib/routes.ts                              -1
  src/lib/rum.ts                                 -42
  src/app/App.tsx                                -7
  src/app/components/Navbar.tsx                  ±5
  src/app/components/CommandPalette.tsx          ±3
  src/app/pages/GiftsPage.tsx                    +30
  src/styles/design.css                          -494 (.dsc-*) + 20 (.gp-unavailable-notice) = -474
  src/i18n/translations.ts                       -30 + 4
  functions/src/index.ts                         -6
```

---

## Verification

All performed by inspection in the build sandbox (no `pnpm install`):

- ✅ Brace balance ✓ on all 9 modified files
- ✅ Zero references to `ROUTES.DISCOVER`, `DiscoverPage`,
  `sendDiscoverViewBeacon`, `DISCOVER_VIEW`, or `.dsc-` anywhere
  in `src/` or `functions/src/`
- ✅ `/pairings` route still registered (line 19 of routes.ts)
- ✅ `PairingsIndexPage.tsx` untouched (the destination for the
  renamed nav entry)
- ✅ `formatHoursForToday()` in `businessHours.ts` kept — it's a
  generic helper that's now unused but harmless; tree-shaking
  removes it from the bundle
- ✅ `getNavLinks` factory still drives Navbar + mobile drawer +
  Command Palette consistently
- ✅ Gift builder gating chain intact: AdminSettings → Firestore →
  useSettings → GiftsPage gate → GiftBuilderModal defensive gate

## Local pre-deploy

```bash
pnpm install
pnpm typecheck
pnpm lint
cd functions && npm run build && cd ..
firebase deploy --only functions,hosting
```

After deploy:

1. Visit `https://elecafe.ca/discover` → expect 404 (route removed)
2. Open the navbar → confirm "Tea pairings" between "Teas" and
   "Gift Builder", clicking it lands on `/pairings`
3. Open `/admin/settings`, toggle Gift Builder off → visit `/gifts`
   as a non-admin (or log out) → confirm the gold "🔒 Not available
   currently" notice appears and all three CTAs read the same
4. Toggle Gift Builder on → confirm the notice disappears, CTAs
   re-enable, "Build Your Tea Bundle" opens the modal

End of Phase 18.
