# Icons & Branding Assets

This folder contains all the iconography for browser tabs, PWA install
prompts, social media link previews, and email branding.

## Files at the root of `public/`

| File | Purpose | Referenced by |
|---|---|---|
| `favicon.ico` | Browser tab icon, fallback for older browsers | `index.html` `<link rel="icon" type="image/x-icon">` |
| `favicon.svg` | Browser tab icon, modern browsers | `index.html` `<link rel="icon" type="image/svg+xml">` |
| `apple-touch-icon.png` | iOS Safari "Add to Home Screen" | iOS auto-discovers at `/apple-touch-icon.png` |
| `og-default.png` | Default social link preview (Facebook, Twitter, etc.) | `<meta property="og:image">` in `index.html` or `SeoHead.tsx` |
| `og-default.svg` | Source SVG for the social preview | (kept for re-rendering if design changes) |
| `manifest.webmanifest` | PWA manifest defining install behavior | `<link rel="manifest">` in `index.html` |
| `Color logo with background.svg` | Master brand SVG (source of truth) | (used to generate all PNG variants) |

## Files under `public/icons/`

| File | Purpose |
|---|---|
| `icon.svg` | Vector PWA icon (manifest references) |
| `icon-192.png` | Android PWA install icon (192×192) |
| `icon-512.png` | Android PWA splash + larger contexts (512×512) |

## Files under `public/email-assets/`

| File | Purpose |
|---|---|
| `logo.png` | Email header logo (Hosting-served, App-Check-immune) |
| `README.md` | Detailed docs on why this is separate from Storage |

## To regenerate icons

If you update the master `Color logo with background.svg`, regenerate
the PNG variants:

```bash
# Master 512×512 PNG (square, padded to brand cream)
rsvg-convert -w 512 -h 512 -a -b "#fdfaf5" \
  "Color logo with background.svg" -o /tmp/raw-512.png
convert /tmp/raw-512.png -background "#fdfaf5" \
  -gravity center -extent 512x512 /tmp/master-512.png

# All variants
convert /tmp/master-512.png -resize 192x192 icons/icon-192.png
cp /tmp/master-512.png icons/icon-512.png
convert /tmp/master-512.png -resize 180x180 apple-touch-icon.png
convert /tmp/master-512.png \
  \( -clone 0 -resize 48x48 \) \
  \( -clone 0 -resize 32x32 \) \
  \( -clone 0 -resize 16x16 \) \
  -delete 0 -colors 256 favicon.ico

# Social preview
rsvg-convert -w 1200 -h 630 -a og-default.svg -o og-default.png
```

Tools needed: `librsvg2-bin` (rsvg-convert) and `imagemagick` (convert).

## index.html `<head>` references

After deploying this folder, your `index.html` should have:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0f1c26">

<!-- Social previews (in SeoHead.tsx or index.html) -->
<meta property="og:image" content="https://elecafe.ca/og-default.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://elecafe.ca/og-default.png">
```

If any of these are missing in your `index.html`, your icons will deploy
correctly but won't be picked up by browsers/social platforms. Check
`index.html` after deploying this folder.
