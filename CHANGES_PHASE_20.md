# Phase 20 — Modal Centering · Share Buttons · Hero Cleanup · Category Picker · Qunit Migration

Date: 2026-05-20
Six fixes from a batch of screenshots.

---

## Fix 1 — Sign-in modal overflow on mobile (CRITICAL)

**Symptom (screenshot 1):** the sign-in prompt rendered with its left
edge ~50% off the viewport. Title showed `uild your bundle` (the B
clipped), CTAs read `SIGN IN` (S clipped) and `TE ACCOUNT` (CREA
clipped).

**Root cause:** I reused the existing `app-modal-panel-in` animation
on the new sign-in modal. That keyframe targets `position: absolute`
modals — it bakes `transform: translate(-50%, -50%)` into its keyframes
to center via transform. My panel uses flex centering, so the
animation translated the panel 50% of its own width to the left,
pushing it off-screen.

**Fix:** new `gp-signin-panel-in` keyframe that uses translateY +
scale only (no horizontal transform), letting flex own the centering.

```
src/styles/design.css   +10 lines (keyframe + prefers-reduced-motion gate)
                        -1  line  (animation reference)
```

---

## Fix 2 — ShareButton on the Pairings index page

**Request:** "add share icon so user can share it with friends"

**Implementation:** new `<ShareButton>` component
(`src/app/components/ShareButton.tsx`), used in pill variant centered
in the page header above the gold rule.

- Mobile: native Web Share API → user picks Messages / Mail /
  WhatsApp / etc.
- Desktop: falls back to copying URL to clipboard + showing a toast

```
src/app/components/ShareButton.tsx                     NEW (~115 lines)
src/app/pages/PairingsIndexPage.tsx                    +12 lines (import + JSX)
src/styles/design.css                                  +10 lines (.pix-share-row)
```

---

## Fix 3 — Pairing detail page: mobile hero void + share button

**Symptom (screenshot 3):** on mobile, the hero rendered the pastry
image (~214px tall at aspect 16/9) inside a `min-height: 78vh` (~546px)
midnight container — leaving a gigantic dark void between image and
overlay card.

**Fix:** at `≤720px`, the hero drops `min-height`, lays out as a flex
column, and the overlay is repositioned from `position: absolute` to
the normal flow (with a `-28px` negative top margin so it visually
overlaps the bottom of the image). Veil hidden because there's no
longer a tall dark image to gradient over.

**Share button added** in two responsive variants:
- Mobile (≤720px): labelled pill (`cpp-hero-share`) inside the
  overlay, dark-glass styled to read against the midnight card
- Desktop (≥721px): circular icon (`cpp-hero-share-corner`) absolutely
  positioned in the top-right of the frosted overlay

CSS toggles which variant is visible per breakpoint; JSX renders
both unconditionally so the React tree is identical at both sizes.

```
src/app/pages/ComboPairingPage.tsx                     +25 lines
src/styles/design.css                                  ~75 lines added
```

---

## Fix 4 — Long-title overflow guard

**Symptom (screenshot 4):** the H2 `Pair spinach and feta strudal with
one of our premium teas` had its first letter `P` clipped on the left
edge of the viewport on mobile.

**Investigation:** this should already be fixed by Phase 17's
`overflow-x: clip` on html — once that's deployed, horizontal page
overflow is impossible. Belt-and-braces: added `overflow-wrap:
anywhere` to `.cpp-section-h2` so even if a parent has horizontal
overflow elsewhere, the heading itself wraps cleanly instead of
extending past the viewport.

```
src/styles/design.css       +5 lines
```

---

## Fix 5 — Inventory category dropdown styling

**Symptom (screenshot 5):** the `<select className="ict-mobile-select">`
on `/admin/inventory` rendered as a near-default native select —
8px radius, hairline border, no chevron, no visual weight. Looked
like a browser default control pasted into a polished page.

**Fix:** `appearance: none` + an inline SVG chevron painted as
`background-image`, with proper padding, a stronger border, focus
ring with brand gold shadow, hover state, and active scale. The
OS-controlled dropdown overlay (the picker that opens on tap) is
unchanged — that's the right UI on mobile and it's not stylable
anyway; only the FIELD is restyled.

```
src/styles/design.css       ~50 lines (replaces the ~12 lines that were there)
```

---

## Fix 6 — Qunit → Qty migration script

**Request:** "change Qunit to quantity or Qty"

`Qunit` isn't a string in the codebase — it's user-entered data in
the `inventoryCategories` Firestore collection (whoever created the
category typed it as the unit field value, probably a typo for
"Unit").

**Two options to fix it:**

A. **Edit the category in the admin UI** — open
   `/admin/inventory`, hit the edit icon on the "Tea" category, change
   the unit field from `Qunit` to `Qty` (or `Quantity` or whatever),
   save. Done. Fastest if it's only one or two categories.

B. **Run the migration script** — one-off Node script that walks
   `inventoryCategories` + their `items` subcollections and rewrites
   any document whose `unit` field equals `"Qunit"`:

   ```bash
   # Dry-run (shows what would change, writes nothing):
   node scripts/migrate-qunit-to-qty.mjs

   # Actually apply:
   node scripts/migrate-qunit-to-qty.mjs --yes

   # Or use a different target value:
   node scripts/migrate-qunit-to-qty.mjs --to=Quantity --yes
   ```

   Requires `GOOGLE_APPLICATION_CREDENTIALS` pointing at an admin
   service-account JSON, or a `gcloud auth application-default login`
   session. Idempotent: safe to re-run.

```
scripts/migrate-qunit-to-qty.mjs     NEW (~95 lines)
```

---

## Verification

- ✅ All 7 modified/new files have balanced braces (comments stripped)
- ✅ `ShareButton` imported and placed in both pairing pages
- ✅ `gp-signin-panel-in` keyframe references match the only
  `animation:` reference in `.gp-signin-panel`
- ✅ Mobile/desktop share variants are mutually exclusive via
  display:none gates — no double-rendering risk

## Post-deploy checks

1. **Modal centering:** sign out, visit `/gifts`, tap "Build Your
   Tea Bundle" on a phone-width browser. Modal centers properly,
   "Build your bundle" visible in full.
2. **Pairings share:** visit `/pairings` on mobile, scroll to the
   header, tap "Share" → native share sheet opens with the page URL.
3. **Pairing detail mobile hero:** visit
   `/pairings/spinach-and-feta-strudal` on mobile. Image + card stack
   cleanly, no dark void. Share pill visible at bottom of dark card.
4. **Heading wraps:** scroll past the hero on a 320px-wide viewport
   simulator. "Pair … with our premium teas" never clips left.
5. **Category dropdown:** `/admin/inventory` on a phone. Tap the
   category field. Field has chevron icon and gold focus ring.
6. **Qunit rename:** option A (admin UI) or option B (migration
   script). Verify by reloading `/admin/inventory` — units should
   now read "Qty" (or whatever target was chosen).

End of Phase 20.
