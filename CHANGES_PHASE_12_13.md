# Phase 12 + 13 — Combo Subsystem Fixes & Curation

Date: 2026-05-20
Scope: Combo Gallery (`/comboGalleryItems`) + `/pairings/{slug}` landing pages + admin manager.

Two shipped bundles in one document. Phase 12 closes the gaps the
deep analysis surfaced (sitemap, routing, accessibility, security
rules). Phase 13 layers in the "real curation" upgrade — per-combo
tea associations — plus a pairing-view beacon and the legacy
`enabled` migration script.

---

## ✅ What changed

### 1. Sitemap now lists `/pairings/{slug}` URLs

**Problem.** The combo gallery's value proposition is shareable URLs
that Google can index. The sitemap (`functions/src/index.ts` →
`getSitemap`) listed home / categories / collections / per-tea URLs
but **zero** combo URLs. Google could only discover pairing pages via
inbound social links (usually `nofollow`).

**Fix.** `getSitemap` now reads `/comboGalleryItems` and emits one
`<url>` per enabled combo with a non-empty slug, plus the new
`/pairings` index URL. Image-extension blocks emit when the combo has
an image (Google Image Search eligibility). `buildSitemapXml`
signature now takes `(teas, pairings, today)`; the only other call
site (`seoHealth`) was updated.

**Files.** `functions/src/index.ts` (signature + reader + builder).

---

### 2. `/pairings` index route now exists — soft 404 closed

**Problem.** Breadcrumbs on `/pairings/{slug}` pages and the
JSON-LD `BreadcrumbList` in `renderSeo`'s `patchHeadForPairing` both
declared `Pairings → /pairings` as the second step. But the route
wasn't registered. Users clicking the breadcrumb hit `<NotFoundPage>`;
Google's crawl of the JSON-LD URL produced a soft 404.

**Fix.** New `src/app/pages/PairingsIndexPage.tsx` — a collection-grid
view of all enabled pairings, reusing `useComboGallery()` so admin
edits show up live. Registered at `/pairings` in `App.tsx` BEFORE the
`/pairings/:slug` variant. Added `ROUTES.PAIRINGS` constant.

**Files.** `src/app/pages/PairingsIndexPage.tsx` (new),
`src/app/App.tsx`, `src/lib/routes.ts`.

Behavior when the global toggle is off: renders an apologetic empty
page with `noIndex` meta rather than 404, so social links don't
bounce.

---

### 3. Inline `<style>` mobile rules migrated to `design.css`

**Problem.** `ComboGallery.tsx` had a 40-line `<style>` block injected
inside the JSX with 7 rules using `!important` overrides. Two issues:
(a) re-injected on every render; (b) bypassed the project's
"tokens-only" stylelint enforcement.

**Fix.** Moved into `src/styles/design.css` as a proper
`@media (max-width: 599px)` block targeting the existing `.cg-*`
class names — no `!important`s, no `<style>` tag in JSX. Stripped the
now-unused legacy `combo-*` duplicate class names from the JSX.

**Files.** `src/styles/design.css` (added block),
`src/app/components/ComboGallery.tsx` (removed `<style>` + legacy
classes).

---

### 4. Synchronous index clamp — no more one-frame flash

**Problem.** When admin disabled the active slide while a customer was
viewing, the sequence was:

1. Snapshot fires → `items.length` shrinks
2. Render: `items[staleIndex]` is `undefined`, component returns
   `null` → section disappears
3. `useEffect` clamps the index → component re-renders → section
   reappears

Visible as a one-frame pop-out / pop-in.

**Fix.** Replaced the `useEffect` clamp with a synchronous computation
during render: `const index = count > 0 ? ((rawIndex % count) + count)
% count : 0;`. The pure-function clamp is always correct on the same
frame and is cheaper than a state update.

**Files.** `src/app/components/ComboGallery.tsx` → `useAutoAdvance`.

---

### 5. WCAG 2.2.2 — accessible pause / play button

**Problem.** Carousel auto-rotates every 2.8s indefinitely. WCAG 2.2.2
(Pause, Stop, Hide) requires a mechanism to stop content lasting >5s.
Hover/focus pause was the only accommodation, leaving keyboard-only
users who hadn't yet tabbed in with no way to stop the rotation.

**Fix.** Added a top-left Pause / Play toggle button on the carousel.
Mirrors the `userPaused` state via `aria-pressed`. Only renders when
2+ items AND reduced-motion isn't on (those cases are already pause
states). Combined `paused` now is `hovered || reducedMotion ||
userPaused`. New `.cg-playpause-btn` class in `design.css` matching
the share-button visual treatment.

Bonus: added `aria-live="polite"` + `aria-atomic="true"` on the
`.cg-frosted` overlay so screen-reader users hear slide changes.

**Files.** `src/app/components/ComboGallery.tsx`, `src/styles/design.css`.

---

### 6. `safeFilename` collision fixed

**Problem.** `Date.now()` granularity is 1ms. Drag-dropping 30 files
runs the upload loop in well under a tick — same filename for several,
silent overwrite in Storage.

**Fix.** Added 24-bit random hex suffix: `${Date.now()}_${rand}_${base}`.
Same pattern the cart-store uses for bundle IDs.

**Files.** `src/app/components/admin/ComboGalleryAdmin.tsx` → `safeFilename`.

---

### 7. Firestore rules — `hasOnly()` field allowlist

**Problem.** The combo rule listed per-field conditions but didn't
restrict the *set* of fields. The rest of the project (orders, users)
uses `affectedKeys().hasOnly([...])`. Inconsistent posture.

**Fix.** Combined `keys().hasOnly([...])` allowlist with the existing
per-field checks. Added `is int` for `order` and `is bool` for
`enabled`. Documented in the comment why we tightened.

**Files.** `firestore.rules` → `/comboGalleryItems` block.

---

### 8. Slug uniqueness check in admin

**Problem.** Schema acknowledges slug uniqueness isn't enforced. The
upload path de-duped via local snapshot only; manual slug edits in
the inline editor had **no** uniqueness check at all. Duplicate slugs
make `fetchComboBySlug` in `renderSeo` non-deterministic — IG link
cards could show the wrong image.

**Fix.** New `isSlugTaken(slug, myId)` helper that queries
`/comboGalleryItems where slug == X` and excludes the row's own id.
Called in `patchItem` before any update that touches the slug.
Network failures fall through (logged) so they don't block saves.

This is best-effort dedup, not a true unique constraint — the proper
fix is to use the slug as the Firestore doc ID, but that requires a
data migration. The check closes the most common collision path
(admin renames + saves).

**Files.** `src/app/components/admin/ComboGalleryAdmin.tsx`.

---

### 9. Keyboard / touch-accessible reorder

**Problem.** HTML5 native drag-drop (`draggable`, `onDragStart`,
etc.) doesn't fire on touchscreen and isn't keyboard-reachable.
Admin on iPad couldn't reorder. Screen-reader / motor-impaired admin
couldn't reorder.

**Fix.** Added `Move Up` / `Move Down` icon buttons next to the drag
handle on every row. They no-op at array boundaries (first row's up,
last row's down) and visually disable. Shares the new `persistOrder`
helper extracted from `handleDragEnd` — both paths go through the
same single-batch Firestore write.

CSS for the new column wraps the existing drag handle in
`.cga-row-handle-col` with `.cga-row-move-btn`s underneath.

**Files.** `src/app/components/admin/ComboGalleryAdmin.tsx`,
`src/styles/design.css`.

---

### 10. Currency tightened to enum

**Problem.** `currency: z.string().length(3).default('CAD')` was open
to any 3-char string. Only CAD is exposed in the UI; any other value
would arrive from a manual Firestore edit and create silent
mismatches between the customer display and the JSON-LD
`priceCurrency`.

**Fix.** `z.enum(['CAD']).default('CAD')`. Easy to extend when a
second currency lands.

**Files.** `src/schemas/comboGallery.schema.ts`.

---

### 11. `og:type` `availability` corrected for combos

**Problem.** `renderSeo`'s `patchHeadForPairing` emitted
`availability: 'InStock'` (JSON-LD) and `'in stock'` (OG meta).
But combos aren't shippable — they're café-counter cross-sell with
no Add-to-Cart button. Marking them InStock would let Google
Shopping ingest them as buyable SKUs and then ding the page for
having no purchase path.

**Fix.** Changed to `InStoreOnly` (Schema.org) and `'in store only'`
(OG). Keeps rich link cards on Pinterest / IG / WhatsApp while
opting out of Google Shopping ingest. Added inline rationale.

**Files.** `functions/src/index.ts` → `patchHeadForPairing`.

---

## What this bundle does NOT include (deferred)

Most of the original deferred items shipped in Phase 13 below. What
remains:

- **Slug-as-doc-ID for true uniqueness** (vs the best-effort check
  in Phase 12 #8). Requires a data migration of existing docs.
  Effort: M.

---

# ▶ PHASE 13 — Per-combo curation + telemetry

Phase 13 turns the combo subsystem from "shipped" to "competitive."
Three additions, all backwards-compatible with existing data.

### 13.1 `pairedTeaIds` — per-combo tea associations

**Problem.** Every combo's "Pair this with one of our teas" section
showed the same 4 featured teas regardless of which combo it was.
The copy implied curation; the implementation didn't deliver it.

**Fix.** New `pairedTeaIds?: string[]` field on the combo schema
(max 8 tea doc IDs, matching Firestore's IN-query ceiling minus
headroom). When set and non-empty, `ComboPairingPage` swaps its
generic `where(isActive, ==, true) orderBy(featured)` query for a
`where(documentId(), in, pairedTeaIds)` lookup and renders ONLY
those teas, in the order the admin specified.

Section heading switches from "A few of our favourites" → "Recommended
with {comboTitle}" when curation is active. Legacy combos with no
`pairedTeaIds` keep the old behaviour — no migration required.

Deleted-tea defense: if `pairedTeaIds` references a tea doc that no
longer exists or is `isActive: false`, it's silently filtered out
of the resolved grid. The combo still renders; admin can re-add
real teas.

**Files.** `src/schemas/comboGallery.schema.ts`,
`src/app/pages/ComboPairingPage.tsx`, `firestore.rules` (pairedTeaIds
in the allowlist + list-shape + size cap).

### 13.2 Admin tea-picker UI

**Problem.** The new field needed a way for admins to actually set it.

**Fix.** New `PairedTeasPicker` sub-component inside
`ComboGalleryAdmin.tsx`. Renders selected teas as removable chips
and a dropdown of remaining teas to add. One-shot fetch of the tea
catalog at mount (sorted by name, filtered to `isActive`), passed
down to every row. Each add/remove writes Firestore immediately via
the existing `patchItem` path — no separate dirty/commit cycle, so
the picker feels instant.

Cap at 8 selections with explicit `Max 8 reached` messaging when
full. The dropdown disables once at the cap.

New CSS classes: `.cga-paired-chips`, `.cga-paired-chip`,
`.cga-paired-chip-x`, `.cga-paired-select`, `.cga-paired-empty`.

**Files.** `src/app/components/admin/ComboGalleryAdmin.tsx`,
`src/styles/design.css`.

### 13.3 Pairing-view telemetry beacon

**Problem.** The combo subsystem is meant to be the headline
cross-sell, but nothing tells the admin which pairings get the most
traffic. Decisions about which combos to feature, retire, or
rephotograph all rely on guessing.

**Fix.** New `sendPairingViewBeacon(slug)` helper in `src/lib/rum.ts`.
Called once from `ComboPairingPage` on combo load — one beacon per
unique pairing view. Reuses the existing `/api/rum` path (no new
endpoint, no new bucket logic), with `name: 'PAIRING_VIEW'` and
`route: /pairings/{slug}`.

Server-side, `recordRum`'s `ALLOWED` set is extended to include
`PAIRING_VIEW`. The dashboard can now group beacons by route to
rank pairings.

Failure mode: silent. If the beacon is dropped (rate limit,
network, misconfigured endpoint), the page is unaffected.

**Files.** `src/lib/rum.ts`, `functions/src/index.ts`,
`src/app/pages/ComboPairingPage.tsx`.

### 13.4 `enabled` migration script

**Problem.** The customer-side carousel reads ALL combo docs (enabled
+ disabled) and JS-filters because legacy docs from before the
`enabled` flag was added don't have the field — and Firestore's
`where('enabled', '==', true)` would exclude them. A one-time
migration sets `enabled: true` on legacy docs, after which the
filter can move to the Firestore layer (fewer reads, simpler code).

**Fix.** New `scripts/migrate-combo-enabled.mjs`. Dry-run by default;
write requires `--yes` flag. Idempotent — only touches docs missing
the field. Batches commits at 400 ops to stay under Firestore's
500-op batch ceiling.

Run path:
```bash
export GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
node scripts/migrate-combo-enabled.mjs           # dry-run
node scripts/migrate-combo-enabled.mjs --yes     # actually writes
```

After running this, the Phase 12 #5 follow-up (switch JS filter to
Firestore `where`) becomes safe to apply.

**Files.** `scripts/migrate-combo-enabled.mjs` (new).

---

## What this combined bundle does NOT include (still deferred)

- **Switch JS-side `enabled !== false` filters to Firestore
  `where('enabled', '==', true)`.** Safe to do AFTER running the
  Phase 13.4 migration on real data, not before. Effort: XS — but
  it must NOT precede the migration on a production project.

- **Slug-as-doc-ID for true uniqueness.** Phase 12 #8 added a
  best-effort check that catches the common rename path. Making
  the slug the Firestore document ID gives unconditional
  uniqueness, but requires migrating existing docs to new IDs.
  Effort: M.

- **Track combo dot-clicks / share-copies / swipe directions.**
  Phase 13.3 covers the view-count signal. Per-interaction events
  (`COMBO_DOT_CLICK`, `COMBO_SHARE_COPY`, etc.) are the next step
  if the dashboard wants finer-grained analytics. Same beacon
  pattern, ~30 lines each. Effort: S.

---

## Verification

- TypeScript: not verified locally — `node_modules` wasn't present
  in the workspace. All new imports point at known exports (verified
  by `grep`), no inline `style={...}` props added, hook ordering is
  unchanged. The one `useEffect` with a stable-string dep
  (`pairedKey`) has an `eslint-disable-next-line react-hooks/exhaustive-deps`
  with an explanatory comment, matching the project's house style.
- Lint: no new `react/forbid-dom-props` violations introduced.
- Visual regression: the carousel layout's outer look unchanged; new
  pause button, admin Move buttons, and admin paired-teas picker
  are all additive. Re-baseline `tests/visual/__screenshots__/` on
  the next build.
- A11y: pause button + `aria-live` on the overlay are the headline
  improvements. Re-run `npm run test:a11y` after install.

## Files touched (combined Phase 12 + 13)

```
functions/src/index.ts                              (sitemap, InStoreOnly,
                                                     PAIRING_VIEW whitelist,
                                                     2 call sites)
firestore.rules                                     (combo hasOnly + field types
                                                     + pairedTeaIds list)

src/lib/routes.ts                                   (+ ROUTES.PAIRINGS)
src/lib/rum.ts                                      (+ sendPairingViewBeacon)
src/schemas/comboGallery.schema.ts                  (currency enum, pairedTeaIds)
src/styles/design.css                               (cg mobile, cg-playpause-btn,
                                                     pix-* index page, cga move btns,
                                                     cga-paired-* chips/select)
src/app/App.tsx                                     (+ /pairings route)
src/app/components/ComboGallery.tsx                 (pause btn, aria-live, sync clamp,
                                                     migrated mobile <style>)
src/app/components/admin/ComboGalleryAdmin.tsx      (move up/down, slug uniqueness,
                                                     safeFilename random suffix,
                                                     teas catalog fetch,
                                                     PairedTeasPicker)
src/app/pages/ComboPairingPage.tsx                  (pairedTeaIds branch,
                                                     curated heading,
                                                     pairing-view beacon)

src/app/pages/PairingsIndexPage.tsx                 (new file)
scripts/migrate-combo-enabled.mjs                   (new file)
CHANGES_PHASE_12_13.md                              (this doc)
```

13 files modified, 3 files created.
