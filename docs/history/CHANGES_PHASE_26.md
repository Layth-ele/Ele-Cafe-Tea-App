# Phase 26 — Pairing Card Now Matches `.cg-frosted` from Tea Profile

Date: 2026-05-21
One-line summary: redesigned the standalone pairing card to be a
1:1 visual match of the inline carousel pairing card on the tea
profile page (`.cg-frosted`).

---

## Why this exists

Phase 25 made the card smaller and centered, but the visual language
was different from the existing pairing card on the tea profile
page (`/tea-profile/{cat}/{slug}` → `ComboGallery` → `.cg-frosted`).
A curated pairing should look identical wherever it appears —
inline in a carousel OR as the standalone hero on its own page.

Phase 26 unifies them.

---

## What changed

### JSX restructure (`ComboPairingPage.tsx`)

Wrapped eyebrow + title + desc in a `.cpp-hero-text` div so the
markup mirrors `.cg-frosted`'s text-block + price-chip horizontal
flex. Order is now:

```tsx
<div className="cpp-hero-overlay">    {/* matches .cg-frosted shell      */}
  <ShareButton className="cpp-hero-share-corner" /> {/* abs top-right    */}
  <div className="cpp-hero-text">                   {/* matches .cg-frosted-text */}
    <p className="cpp-hero-eyebrow">Curated Pairing</p>
    <h1 className="cpp-hero-title">{combo.title}</h1>
    <p className="cpp-hero-desc">{combo.description}</p>
  </div>
  <div className="cpp-price-chip">{priceText}</div>  {/* matches .cg-price-chip */}
  <ShareButton className="cpp-hero-share" />         {/* mobile pill, hidden ≥721px */}
</div>
```

### CSS rewrite (`design.css`)

Match `.cg-frosted` 1:1 for every visual property:

| Property | Phase 25 (centered-luxe) | Phase 26 (matches cg-frosted) |
|---|---|---|
| Layout | flex column, vertical stack | **flex row, space-between** |
| Max-width | 520px | **720px** (cg-frosted is full-width-of-carousel, ~720px in practice) |
| Border-radius | 18px | **14px** (matches `.cg-frosted`) |
| Backdrop blur | blur(24px) sat(150%) | **blur(18px) sat(140%)** (matches) |
| Border | rgba(255,255,255,0.28) | **rgba(255,255,255,0.25)** (matches) |
| Padding | 22px 28px 24px (fixed) | **clamp(10px,1.6vw,14px) clamp(14px,2.2vw,22px)** (matches) |
| Box shadow | 0 12px 40px | (none — matches cg-frosted, no shadow) |
| **Title** | clamp(1.4rem, 2vw, 1.7rem) | **clamp(1.05rem, 1.7vw, 1.3rem)** (matches `.cg-frosted-title`) |
| Title margin | 0 | **0 0 2px** (matches) |
| Eyebrow margin | 0 | **0 0 4px** (gives breathing room above title) |
| **Desc** | 14px flat | **clamp(11px, 1.1vw, 12.5px)** (matches `.cg-frosted-desc`) |
| Desc line-height | 1.55 | **1.4** (matches) |
| Desc color | rgba(255,255,255,0.84) | **rgba(255,255,255,0.85)** (matches) |
| **Price chip** | hairline outlined frosted | **midnight pill** (`var(--price-chip-*)` — matches `.cg-price-chip` exactly) |
| Price chip font-size | 1.05rem | **clamp(1rem, 1.6vw, 1.3rem)** (matches) |
| Price chip padding | 5px 14px | **5px 13px** (matches) |
| Price chip shadow | none | **0 4px 14px rgba(0,0,0,0.28)** (matches) |
| Price chip letter-spacing | none | **0.01em** (matches) |

The only deliberate deviations from a pure 1:1 copy:

- **Eyebrow stays.** `.cg-frosted` doesn't need an eyebrow because
  the section header above the carousel ("CURATED PAIRINGS") already
  labels it. The standalone `/pairings/{slug}` page has no such
  section header, so the "CURATED PAIRING" eyebrow earns its place
  inside the card. Same typography as Phase 25 (10px, 0.22em tracking,
  78% white).
- **Text-block has 48px right-padding on desktop.** Reserves space
  for the absolute-positioned share-corner icon so long titles never
  collide with it. Below 720px the corner-icon is hidden and the
  padding is reset to 0.

### Mobile (`≤720px`) override updated

The mobile card stacks vertically (since the image is above, not
behind, the card on mobile). Updates:

- Reset `transform: none` (was inheriting `translateX(-50%)` from
  desktop, would have offset the negative-margin centering)
- Reset `width: auto; max-width: none` so the negative margins
  control width
- Switch `flex-direction` to column, gap 10px
- `cpp-hero-text` padding-right back to 0 (no corner-icon to dodge)
- Bump title to 1.5rem on mobile (the 1.05–1.3rem desktop scale
  feels too small as the page's main heading)
- Desc to 13.5px on mobile (slight bump for readability on small screens)
- Price chip aligns left (`align-self: flex-start`) instead of center

---

## Files touched (2)

```
src/app/pages/ComboPairingPage.tsx     +9 lines  (wrap text in .cpp-hero-text)
src/styles/design.css                  ~90 lines updated
```

## Pre-deploy

```bash
pnpm typecheck
pnpm build
firebase deploy --only hosting
```

## After deploy — verify visual parity

1. ☐ Open `/pairings/spinach-and-feta-strudal` on desktop. Card
   centered, ~720px wide, horizontal layout: text left, price right.
2. ☐ Open any `/tea-profile/{cat}/{slug}` that has a curated pairing
   (e.g. one with `comboGalleryEnabled` and matching pairings).
3. ☐ Confirm the two cards look **visually identical** in terms of:
   blur, border, radius, title size, description size, price chip
   style, padding scale.
4. ☐ On mobile (≤720px) both cards stack vertically; the standalone
   page card has a slightly larger title (1.5rem) since it's the
   page's main heading.

End of Phase 26. Curated-pairing cards now look the same wherever
they appear.
