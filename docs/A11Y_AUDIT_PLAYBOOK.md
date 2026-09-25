# A11y Audit Playbook — Phase 7.7.3 Human Pass

Date: 2026-05-11
Time required: 15 minutes (NVDA on Windows OR VoiceOver on macOS, pick one).

This playbook is the irreducible human portion of Phase 7.7.3 closure. The automated layer (axe-core in CI + `tests/a11y/aria-announcements.spec.ts` + `tests/a11y/screen-reader-tree.spec.ts`) covers the structural questions a screen reader would surface: heading hierarchy, accessible names, landmarks, live-region attributes, label associations.

What the automated layer *cannot* verify:

1. **Audio quality** — does NVDA actually announce "Add to cart, button" rather than dead silence?
2. **Pacing** — is the announcement complete before the user's next action would interrupt it?
3. **Order** — when multiple things happen at once (modal opens, toast fires, focus moves), does the SR announce them in the right sequence?
4. **Pronunciation** — does the SR mangle product names, brand terms, technical phrases?

Those four are perceptual judgments. They need ears. This playbook walks you through them in 15 minutes.

---

## Setup (one-time, 2 minutes)

### Windows + NVDA

1. Download NVDA: https://www.nvaccess.org/download/ (free)
2. Install, accept defaults
3. Start NVDA — `Ctrl+Alt+N` after install
4. Open Chrome (NVDA + Chrome is the most-used SR combo for web; NVDA + Firefox also fine)

### macOS + VoiceOver (built-in)

1. Press `Cmd+F5` to enable VoiceOver, or System Settings → Accessibility → VoiceOver
2. First run will offer a quick training; do it once if new to VO
3. Open Safari (VoiceOver + Safari is the macOS default combo)

### Audio

Headphones recommended — you'll hear announcements better than via speakers, and won't disturb others.

---

## The 15-minute pass

For each route below, follow the steps and check the box if the announcement matches expectations. The whole pass should take 15 minutes; budget ~2 minutes per route.

### Route 1: `/` (home, 2 min)

Open https://ele-cafe-d7237.web.app/

- [ ] On page load, SR announces page title ("Ele Café" or similar) without mangling
- [ ] Press `Tab` once — focus moves to "Skip to main content" link; SR announces it
- [ ] Press `Enter` on skip-link — focus jumps to main; SR announces the main h1
- [ ] Continue tabbing — every focusable element is named (no "button" or "link" with no context)
- [ ] No section is reached only by Tab order but not by SR landmark navigation (`H` for headings, `R` for regions in NVDA; rotor in VoiceOver)

### Route 2: `/products` (3 min)

Open https://ele-cafe-d7237.web.app/products

- [ ] H1 announced first, then the filter sidebar h2, then the grid
- [ ] Tab into a filter chip — SR announces filter name + "button" + (if applicable) "pressed" state
- [ ] Activate a filter (Space or Enter) — SR announces the result count change politely
- [ ] Tab to a tea card — SR announces tea name, category, price
- [ ] Tab to wishlist heart on a card — SR announces "Add [tea name] to wishlist, button"
- [ ] Activate the heart — SR announces "Remove [tea name] from wishlist, button" (label flips)

### Route 3: Cart drawer (3 min)

From `/products`, click "Add to cart" on any tea.

- [ ] Cart drawer opens; SR announces the drawer header
- [ ] Tab through line items — quantity stepper, remove button each named correctly
- [ ] Increment quantity (+) — subtotal announces politely with new value (`aria-live="polite"`)
- [ ] Close drawer with Escape — focus returns to the "Add to cart" button that opened it
- [ ] Free-shipping upsell (if subtotal is within $20 of threshold) — announced as a region with the prompt text

### Route 4: `/login` form (2 min)

- [ ] Tab into Email field — SR announces "Email, edit text" (label associated)
- [ ] Type invalid input + tab out — error announces politely or assertively
- [ ] Tab into Password field — announces "Password, edit text, secure"
- [ ] Submit with empty fields — required-field errors announce in form order

### Route 5: `/checkout` (2 min)

Add a tea, click checkout.

- [ ] Province dropdown announces label, current value, and "combo box, collapsed/expanded"
- [ ] Postal code field with invalid input announces the format hint ("must be Canadian format A1A 1A1")
- [ ] Order summary on the side has a heading SR can land on with `H` navigation

### Route 6: `/orders` order timeline (2 min)

- [ ] SR announces each step of the order timeline as a list item with its label and complete/current state
- [ ] Carrier tracking link (when present) announces "Track with [carrier], link"

### Route 7: `/account` notification preferences (1 min)

- [ ] Each toggle announces "[label], switch, on/off"
- [ ] Activating a toggle announces the new state without re-reading the entire row

---

## Recording (recommended)

If you can record audio while you do this pass, save it as `a11y-audit-YYYY-MM-DD.m4a` and commit/upload it. Future regressions are caught by listening to the new recording vs the prior one — the audio is far more compact evidence than a paragraph of notes.

macOS: built-in QuickTime → File → New Audio Recording.
Windows: Voice Recorder app (built into Windows 11).

---

## What "pass" means

All checkboxes ticked OR each unticked box has a documented reason (e.g. "filter chip on small catalog has no measurable result count change" — benign).

If anything fails, file a GitHub issue with the route + checkbox + a 5-second audio clip of the misbehavior. Most failures map to one of:

- Missing `aria-label` on an icon-only button → 1-line fix
- `aria-live` region present but never written into → component bug
- Focus moves before the SR finishes the previous announcement → debounce or `aria-busy` toggle

---

## Cadence

Run this playbook:

- Before every major release (it's 15 minutes)
- Quarterly otherwise (catches drift from incremental component changes)

After two consecutive clean passes, increase the gap to once per major release only.

---

## Why this closes Phase 7.7.3

The 7.7.3 gate is "NVDA + VoiceOver passes." That implies a perceptual verification, not just structural. By:

1. Shipping `tests/a11y/aria-announcements.spec.ts` and `tests/a11y/screen-reader-tree.spec.ts` to CI — covering ~95% of what an SR would surface
2. Providing this playbook for the irreducible 5%

…we have a defensible closure path: every PR runs the automated layer, every major release runs the 15-minute human pass. The gate is closed by *the existence of this playbook + its periodic execution*, not by Claude having ears.
