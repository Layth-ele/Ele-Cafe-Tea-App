# Phase 25 — Pairing Card: Compact, Centered, Luxe Redesign

Date: 2026-05-21
One-line summary: the pairing detail page's hero overlay card spanned
the full viewport width on desktop because both `left` and `right`
were pinned, overriding `max-width`. Redesigned to a 520px centered
card with refined typography.

---

## Symptom

User reported (paraphrased): "Card so large and ugly — make it
smaller, in the centre, not full width, more luxury and modern,
clean, not so complicated."

Visible on `https://elecafe.ca/pairings/spinach-and-feta-strudal`
at desktop width: the frosted glass card ran nearly edge-to-edge of
the hero image, with a giant ~50px serif title and chunky midnight
price chip — read as a banner, not a refined card.

---

## Root cause

```css
.cpp-hero-overlay {
  position: absolute;
  left: clamp(16px, 4vw, 64px);
  right: clamp(16px, 4vw, 64px);   /* ← both pinned */
  max-width: 900px; margin: 0 auto;  /* ← inert */
}
```

With absolute positioning, setting **both** `left` and `right`
forces the element to span the distance between them. The
`max-width: 900px` is silently inert because the width is already
determined by the two edges. On a 1440px viewport that's
`1440 - 128 = 1312px` wide.

---

## Fix

Centered the card properly, narrowed to 520px, refined the typography
to match the new compact scale, and replaced the heavy midnight
price chip with a hairline outlined tag.

### Before → After

| Property | Before | After |
|---|---|---|
| Positioning | `left: clamp(16px,4vw,64px); right: clamp(16px,4vw,64px); margin: 0 auto` (max-width inert) | `left: 50%; transform: translateX(-50%)` (true centering) |
| Width | viewport − 32px to 128px | `min(520px, calc(100% - 32px))` — fixed cap |
| Padding | clamp(20px, 3vw, 32px) — up to 32px | `22px 28px 24px` — tighter |
| Gap between items | 14px | 10px |
| Background | rgba(255,255,255,0.14) | rgba(255,255,255,0.16) — slightly more opaque for legibility |
| Backdrop blur | blur(20px) saturate(140%) | blur(24px) saturate(150%) — stronger frost |
| Border radius | 20px | 18px — slightly tighter |
| Box shadow | none | `0 12px 40px rgba(9,14,18,0.28)` — grounds the card |
| **Title size** | clamp(1.8rem, 4vw, 3.2rem) — hit 51px on desktop | clamp(1.4rem, 2vw, 1.7rem) — caps at 27px |
| Title weight | 300 (too thin at small sizes) | 400 |
| Title letter-spacing | -0.025em | -0.015em — less aggressive |
| Eyebrow size | 11px / 0.18em tracking | 10px / 0.22em tracking — more refined |
| Description | clamp(14px, 1.6vw, 16px) | 14px flat |
| **Price chip** | midnight pill, 1.25-1.6rem, 8px×18px padding, shadow | hairline outline, 1.05rem, 5px×14px padding, no shadow |
| Price chip bg | `var(--price-chip-bg)` (midnight dark) | rgba(255,255,255,0.1) — matches frosted glass |
| Share corner | top/right clamp(20px, 3vw, 32px), 40×40 | top: 14px / right: 14px, 36×36 — sits more discreetly |

### Mobile unaffected

The mobile (≤720px) override is unchanged — the card still stacks
naturally below the image with the dark-glass pill share button.
The Phase 25 changes only affect desktop (>720px) where the card
overlays the image.

---

## Files touched (1)

```
src/styles/design.css     ~50 lines updated (cpp-hero-overlay + descendants + share-corner)
```

No React-side changes. Pure CSS refinement.

## Pre-deploy

```bash
pnpm typecheck
pnpm build
firebase deploy --only hosting
```

## After deploy — verify

Open `/pairings/spinach-and-feta-strudal` on a desktop browser:

- ☐ Card sits centered in the hero, ~520px wide (not full-width)
- ☐ Title reads at ~27px max, not 51px
- ☐ Price chip looks like a hairline tag, not a heavy dark button
- ☐ Share icon sits discreetly in the top-right corner of the card
- ☐ Mobile (≤720px) view unchanged — still stacks card below image
- ☐ All pairing pages (not just spinach-and-feta-strudal) follow the
  same pattern — the change is class-level, applies to every combo

End of Phase 25. Card is now compact, centered, and on-brand.
