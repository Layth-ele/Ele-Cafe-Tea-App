# Phase 19 — Skip-nav · Inventory Mobile · Gift Builder Sign-in Gate

Date: 2026-05-20
Three independent fixes in one pass.

---

## Fix 1 — Skip-nav: smaller, subtler styling (Option A)

The "Skip to main content" link is a WCAG 2.1 SC 2.4.1 requirement
for keyboard / screen-reader users. The previous style was a big
gold CTA with a white outline — visually loud when it appeared on
keyboard focus. Restyled to a discreet system pill while keeping
the function identical (hidden off-screen by `transform:
translateY(-200%)` until `:focus-visible`).

```
src/styles/focus.css                +30 / -16 lines
```

**Before:** 12px+ padding, bold weight, gold fill, white outline
**After:** 5px×11px padding, medium weight, cream surface with hairline
border, soft drop shadow, gold focus ring

Functional behaviour unchanged — still:
- First Tab keystroke focuses it
- Hidden until focused
- Navigates to `#main-content` on Enter
- Required for AODA compliance and the axe-core tests in CI

---

## Fix 2 — Inventory item card: clean mobile flexbox

Reported screenshot showed cramped, awkward spacing on the
admin inventory page: the QUANTITY label far left, the stepper
floating in the middle, the unit suffix ("Qunit") stranded on the
far right, and the action buttons squished into the bottom-right
corner.

**Root cause:** the `≤768px` mobile-card transform used
`flex-direction: row; justify-content: space-between` on each cell.
With the label as a `::before` pseudo on the left and the content
on the right, large viewports were fine but the ~380px column on
mobile created huge intra-row gaps.

**Fix:** changed the card cells to `flex-direction: column`,
stacking label-on-top, value-below. Each pair now reads as a
labelled field. The stepper centers naturally; the unit suffix
stays beside it where it belongs; the action buttons share the
full card width with `flex: 1` so each is a comfortable tap target.

```
src/styles/design.css     ~80 lines restructured in the ≤768px block,
                          ~15 lines tidied in the ≤480px block
```

Specific changes:
- `.iit-table td` → `flex-direction: column; align-items: stretch`
  (was `justify-content: space-between` with row)
- `.iit-table td::before` → label appears above the value, not in
  a far-left fixed column
- `.iir-cell-name` → kept as row (it's the card header — name +
  thumbnail are visually paired)
- `.iir-cell-qty .ist-wrap` → `justify-content: center` so the
  stepper anchors in the middle, not the right edge
- `.iir-cell-status .inv-status-badge` → `align-self: flex-start`
  so the badge doesn't stretch to fill the row
- `.iir-cell-actions .iir-actions` → `width: 100%`; each action
  button is `flex: 1` for even distribution and 40px min-height
- Inter-cell separators are bottom borders on each cell (instead
  of an `iir-cell-actions` top border) so the dividers feel like
  field separators, not afterthoughts

---

## Fix 3 — Gift Builder sign-in gate for guests

**Reported bug:** "for gift builder for accounts not signed in
when they click nothing happens"

**Root cause** — line 170 of `GiftBuilderModal.tsx`:

```ts
useEffect(() => {
  if (isOpen && !currentUser) close();
}, [currentUser, isOpen, close]);
```

The author's intent was "auto-close on sign-OUT mid-wizard" (the
docstring says so), but the actual condition `!currentUser` ALSO
fires when an unauthenticated user opens the wizard for the
*first* time. So the flow was:

1. Guest clicks "Build Your Tea Bundle"
2. `openBuilder()` sets `isOpen = true`
3. Effect runs → `!currentUser === true` → `close()` fires
4. Modal disappears within a single tick

From the user's perspective: clicking does nothing.

**Two-part fix:**

### a) Differentiate "signed out mid-wizard" from "never signed in"

In `GiftBuilderModal.tsx`, a `wasSignedInRef` tracks whether we've
ever seen the user authenticated during this session. The
auto-close now only fires on the genuine `true → false` transition.
Initial-guest state no longer triggers it.

```
src/app/components/gift-builder/GiftBuilderModal.tsx   ±15 lines
```

### b) Friendly sign-in prompt in `GiftsPage`

When a guest clicks any of the three CTA paths (hero, bundle card,
bottom CTA), `handleOpen` now checks `currentUser` first. If
absent, it opens a small two-CTA prompt instead of `openBuilder()`:

- **Sign in** → navigates to `/login?returnUrl=/gifts`
- **Create account** → navigates to `/signup?returnUrl=/gifts`
- **Maybe later** → closes the prompt

`returnUrl=/gifts` makes the user land right back at the gifts page
after authenticating, where they can immediately click the CTA
again and now successfully enter the wizard. The login page
already reads `returnUrl` via `safeReturnUrlOr()` from
`src/lib/safeReturnUrl.ts`, so no auth-flow changes were needed.

```
src/app/pages/GiftsPage.tsx                            +60 lines (state + prompt JSX)
src/styles/design.css                                  +85 lines (.gp-signin-* block)
```

The prompt is styled as a centered card with:
- A gold-soft circle icon (Gift icon)
- A serif title ("Sign in to build your bundle")
- A short body explaining why (selections get saved to the account)
- Stacked CTAs on narrow phones, side-by-side on ≥540px
- Subtle text button for "Maybe later"
- Click-outside-to-dismiss + ESC-to-close (via overlay onClick)

---

## Verification

- ✅ Brace balance: all 4 modified files balanced
  - `focus.css`: { 32 } 32
  - `design.css`: { 3407 } 3407
  - `GiftsPage.tsx`: { 116 } 116
  - `GiftBuilderModal.tsx`: { 70 } 70
- ✅ `useRef` already imported in `GiftBuilderModal.tsx`
- ✅ `useNavigate`, `useState`, `ROUTES`, `LogIn`, `UserPlus`
  imports added to `GiftsPage.tsx`
- ✅ Existing gating chain still intact:
  `AdminSettings → giftBuilderEnabled → useSettings → GiftsPage
  → handleOpen` — now with an additional auth check before
  `openBuilder()` is called
- ✅ Existing sign-out mid-wizard behaviour preserved via the
  `wasSignedInRef` transition guard

## How to verify after deploy

1. **Skip-nav:** Click in the address bar, then press Tab. The
   discreet cream pill appears at top-left. Press Tab again to
   move focus past it.
2. **Inventory mobile:** Sign in as admin, go to `/admin/inventory`
   on a phone (or DevTools at 380px). Each item card should show
   the label above each value, the stepper centered, and the three
   action buttons evenly spread across the bottom.
3. **Gift Builder gate:** Sign out, go to `/gifts`, click "Build
   Your Tea Bundle". The new sign-in prompt should appear instead
   of nothing. Click "Sign in" → land on `/login?returnUrl=/gifts`,
   sign in, get redirected back to `/gifts`, click the CTA again
   → wizard opens.

End of Phase 19.
