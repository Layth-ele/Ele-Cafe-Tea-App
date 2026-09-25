# Keyboard & Screen Reader Test Checklist

> Phase 7.7 success-gate item: "Manual keyboard nav passes recorded + NVDA + VoiceOver passes recorded for top 5 flows."
>
> This checklist converts the open-ended "test everything" task into a structured execution that takes ~90 minutes to run end-to-end. Each row is a single observable behavior; tick → pass, untick → bug to file.

## Setup (10 min)

Required tools:
- **Keyboard tests**: any browser. Disconnect mouse.
- **NVDA tests**: Windows + NVDA 2024 or later (free: https://www.nvaccess.org/download/)
- **VoiceOver tests**: macOS Sonoma+ (built-in: Cmd+F5 to toggle, Cmd+; for help)
- **iOS VoiceOver tests**: iPhone with iOS 17+ (Settings → Accessibility → VoiceOver)

Browser combo coverage:
- Chrome + NVDA (most common Windows screen reader)
- Safari + VoiceOver (macOS + iOS — VO is tied to Safari, doesn't work in Chrome on Mac)
- Firefox + NVDA (secondary — catches AT-API differences from Chromium)

Pre-test fixtures (deploy + auth setup):
- Test customer account: `playwright-test-user@elecafe.test`
- Test admin account: `playwright-test-admin@elecafe.test` with `role: admin` in Firestore
- Cart pre-populated with 2 items (script: see `scripts/seed-test-cart.mjs`)
- 1 historical order in the test account

If these fixtures don't exist yet, follow `playwright.setup.ts` to create them or seed manually via the admin panel after first signup.

---

## Flow 1 — Browse + add to cart

**Goal**: a screen-reader user can browse the catalog, learn about a tea, and add it to cart.

### Keyboard

- [ ] On `/`, Tab once → focus on skip-nav link, link is visible with gold outline.
- [ ] Enter on skip-nav → focus jumps to `<main>`, content scrolls into view.
- [ ] Tab continues into the page — through hero CTA, featured products.
- [ ] Tab to a featured product card → Enter opens `/tea-profile/...`.
- [ ] On tea profile, Tab through gallery thumbs → buy-box → "Add to Cart" button.
- [ ] Activate "Add to Cart" with Enter or Space → cart drawer opens.
- [ ] Tab in drawer → reaches qty stepper (− / value / +), remove link, "Checkout" CTA.
- [ ] Escape closes drawer → focus returns to "Add to Cart" button.

### NVDA (Chrome on Windows)

- [ ] Page title reads as "Ele Café | Premium Loose Leaf Tea..." on `/` load.
- [ ] Skip link announces as "Skip to main content, link" before any other element.
- [ ] Tea card focus announces: tea name + price + "Add to cart" affordance.
- [ ] Tea profile page reads as "main, [Tea name], heading level 1" when navigating with H key.
- [ ] Add-to-cart button activation says "Added [Tea name] to cart" (toast aria-live=polite).
- [ ] Cart drawer opening reads as "Shopping cart, dialog" (role + aria-label).
- [ ] Cart subtotal updates announce: "Subtotal $X.XX" (subtotals aria-live=polite).

### VoiceOver (Safari on macOS)

- [ ] Page title spoken on landing (Safari speaks title chrome on navigation).
- [ ] VO+Right Arrow steps through DOM in reading order, no jumps.
- [ ] VO+H lists all headings — exactly one h1 per page.
- [ ] VO+L lists all landmarks — header, nav, main, footer present on every page.
- [ ] Rotor (VO+U) shows links list including footer; "Read more" / "Click here" absent.

### VoiceOver (Safari on iOS)

- [ ] Swipe-right cycles through interactive elements in DOM order.
- [ ] Cart drawer open: VO trap holds inside the drawer until Escape (double-tap with two fingers).
- [ ] Cart subtotal change is announced.

---

## Flow 2 — Checkout

**Goal**: a screen-reader user can complete an order with delivery address + payment review.

### Keyboard

- [ ] On `/checkout` (with 1 cart item), Tab cycles through delivery form: name, phone, address, city, province, postal, country.
- [ ] Each input is preceded by its label on Tab focus (i.e. focus lands on input, not label).
- [ ] "Continue to payment" button → activate → step 2 renders.
- [ ] Step 2 (payment) → step 3 (review) → "Place Order" button reachable.
- [ ] Submit with invalid data (leave name empty): focus moves to the first errored field; error message announces.
- [ ] Tab through review step → all summary fields, then "Place Order" CTA.

### NVDA

- [ ] On step 1, field with focus announces "[Label], required, edit" for required fields.
- [ ] Invalid submit: first error announces as alert ("Name is required").
- [ ] Stepper progress reads accessibly — currently uses visual numbering, verify it announces step 1 of 3 etc.
- [ ] Phone field announces "Phone number, edit, telephone" (autocomplete hint surfaces).
- [ ] Postal field announces "Postal code, edit, postal-code" (same — autocomplete hint).

### VoiceOver

- [ ] Step indicator should be navigable: VO+command+H to find next heading "Delivery" / "Payment" / "Review".
- [ ] Each completed step is announced as such (need to verify the current visual treatment maps to ARIA — TODO if it doesn't).

---

## Flow 3 — Sign up + verify email

**Goal**: a new user with a screen reader can complete signup, hit the verification modal, and resend.

### Keyboard

- [ ] `/signup` → Tab through email, password, confirm-password, "Create account" button.
- [ ] Submit with mismatch passwords: error announces, focus moves to the password confirm field.
- [ ] After successful signup, verification modal opens; Tab inside reaches "Resend email" + "I verified — check now" + Close.
- [ ] Escape closes modal; focus returns to wherever it was before modal opened.

### NVDA / VoiceOver

- [ ] Modal opening announces "Email verification required, dialog" or similar.
- [ ] aria-busy on submit triggers a "loading" announcement (toast-driven).

---

## Flow 4 — View past order

**Goal**: a logged-in screen-reader user can find a past order and read line items.

### Keyboard

- [ ] `/orders` → orders list (cards). Tab cycles through each card → "View order".
- [ ] Activate → order detail page or modal opens with line items + status.
- [ ] All line items, prices, and order totals readable in document order.

### NVDA

- [ ] Order status announces as "Status: pending" / "Status: shipped" etc., not just the bare word.
- [ ] Each order card announces order ID + date + total.

---

## Flow 5 — Admin: edit a product

**Goal**: an admin with a screen reader can find a product in the table, edit it, save.

### Keyboard

- [ ] `/admin/products` → admin layout + sidebar nav reachable by Tab.
- [ ] Tab into table; each row's "Edit" button reachable.
- [ ] Activate "Edit" → modal with form fields.
- [ ] Tab through every form field; Save / Cancel both reachable; Escape cancels.

### NVDA

- [ ] Table announces with `<caption>` content: "Product catalog — list of teas with category, price, stock, and flags. Use Tab to navigate to action buttons within each row."
- [ ] H key (header navigation in NVDA) finds "Products" page heading.
- [ ] Each cell's content reads in row-major order; row headers (Tea, Category, Price) precede cell content.

### VoiceOver

- [ ] VO+command+T jumps between tables; the product table is reachable.
- [ ] Inside the table, VO+arrow keys navigate by cell.

---

## Cross-flow checks (after each above)

- [ ] **Forced colors mode** (Windows HCM Black-on-White): every page renders with visible boundaries on cards, modals, buttons, form inputs.
- [ ] **prefers-reduced-motion**: enable in OS settings; every transition collapses to <100ms or 0; no spinning loaders.
- [ ] **200% zoom**: every page at 200% browser zoom — no horizontal scroll on customer-side pages; admin tables get horizontal scroll (expected per WCAG 1.4.10 carve-out).

---

## Findings template

For every unchecked item above, file an issue with:

```
Title: A11y bug — [Flow N] — [short summary]
Tool: [NVDA + Chrome / VoiceOver + Safari / Keyboard only]
URL: [where it broke]
Step: [exact reproduction step]
Expected: [what the success criterion says should happen]
Actual: [what happened, including AT announcement if relevant]
WCAG SC: [e.g. 4.1.3 Status Messages]
Severity: [critical/serious/moderate/minor — match axe-core's grading]
```

---

## Time budget for first full pass

- Setup + fixtures: 15 min
- Flow 1 (browse + add): 12 min keyboard, 10 min NVDA, 10 min VO macOS, 8 min VO iOS = 40 min
- Flow 2 (checkout): 8 min × 3 platforms = 24 min
- Flow 3 (signup): 5 min × 3 = 15 min
- Flow 4 (orders): 5 min × 3 = 15 min
- Flow 5 (admin): 6 min × 2 (NVDA + keyboard, VO secondary) = 12 min
- Cross-flow checks (forced-colors + reduced-motion + zoom): 10 min
- Findings write-up: 15 min

**Total ≈ 2 hours for the full pass.** Subsequent regression passes after a single release: ~45 min (verify only what changed).
