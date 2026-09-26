/**
 * CheckoutPage — Ele Café
 *
 * Pricing: subtotal − credit applied. No GST (tea is zero-rated in Canada).
 * Shipping is the flat-rate / free-threshold rule from settings, shown before paying.
 *
 * Flow:
 *   1. User fills delivery details, applies promo / credit, enters a card
 *      (Clover hosted fields → single-use token)
 *   2. placeOrder recomputes the total server-side and places a HOLD on the
 *      card for it — never more than the total shown here (expectedTotal)
 *   3. Admin confirms stock and approves → card is charged (approveOrder);
 *      reject / cancel / expiry releases the hold
 */
import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { ROUTES, loginWithReturn } from '@/lib/routes';
import { calcShippingFee } from '@/lib/shipping';

import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, getFunctionsLazy } from '@/lib/firebase';
// firebase/functions stays a TYPE-only import — `HttpsCallableResult` is
// erased at compile time, so this doesn't put the chunk on the eager graph.
// The runtime value (httpsCallable, functions) loads via getFunctionsLazy()
// at the moment placeOrder fires, not on initial page render.
import type { HttpsCallableResult } from 'firebase/functions';
import { useCartStore as useCart } from '@/store/cartStore';
import type { CartItem } from '@/store/cartStore';
import { GST_RATE } from '@/store/cartStore';
import { useAuth, ensureAuth } from '@/contexts/AuthContext';
import { useCredit } from '@/contexts/CreditContext';
import { useCreditConfig } from '@/hooks/useCreditConfig';
import { CreditSelector } from '@/app/components/CreditWidget';
import { CartSummary } from '@/app/components/CartSummary';
import {
  CardPaymentForm,
  type CardPaymentFormHandle,
  type CardToken,
} from '@/app/components/CardPaymentForm';
import { usePromoCode } from '@/hooks/usePromoCode';
import { generateOrderId } from '@/schemas/notification.schema';
import {
  checkoutFormSchema,
  type CheckoutFormInput,
  DELIVERY_STEP_FIELDS_DELIVERY,
  DELIVERY_STEP_FIELDS_PICKUP,
} from '@/schemas/checkout.schema';
import { toast } from 'sonner';
import { useSettings } from '@/hooks/useSettings';
import { SeoHead } from '@/app/components/SeoHead';
import { Field } from '@/app/components/ui/Field';
import { EmailVerificationModal } from '@/app/components/modals/EmailVerificationModal';

import { useT, useTx, tNow } from '@/i18n/useT';
import { useLanguageStore } from '@/store/languageStore';
import { formatMoney } from '@/lib/money';
// ── Step indicator ─────────────────────────────────────────────────────────────
// Phase 6.5: multi-step refactor. Was a 2-step (`'details' | 'placed'`)
// indicator on top of a single-page form; now a true 3-step flow
// (delivery → payment → review) plus the post-submit 'placed' state.
//
// Why 3 steps and not 4 or 5:
//   - Delivery (where + who): one decision unit. Pickup vs delivery
//     plus the contact/address fields belong together because the
//     address fields are conditional on the choice.
//   - Payment (promo + credit): both are discount mechanisms,
//     applied in the same cognitive context.
//   - Review (place order): the last-look + submit. Separating it
//     keeps "place order" from being clickable while the user is
//     still filling in fields above.
//
//   Adding a 4th step (e.g. splitting "name & phone" from "address")
//   would feel artificial — they're answered in the same breath.
type Step = 'delivery' | 'payment' | 'review' | 'placed';

const STEP_ORDER: Step[] = ['delivery', 'payment', 'review', 'placed'];

function Steps({ current }: { current: Step }) {
  const t = useT();
  const steps = [
    { id: 'delivery' as Step, label: 'Delivery' },
    { id: 'payment' as Step, label: 'Payment' },
    { id: 'review' as Step, label: 'Review' },
    { id: 'placed' as Step, label: 'Placed' },
  ];
  const idx = steps.findIndex((s) => s.id === current);

  return (
    <div className="steps co-steps">
      {steps.map((s, i) => (
        <div key={s.id} className="step">
          <div className={`step-dot${i < idx ? ' done' : i === idx ? ' active' : ''}`}>
            {i < idx ? '✓' : i + 1}
          </div>
          <span className={`step-label${i === idx ? ' active' : ''}`}>{t(s.label)}</span>
          {i < steps.length - 1 && <div className={`step-line${i < idx ? ' done' : ''}`} />}
        </div>
      ))}
    </div>
  );
}

// Field wrapper used in this page is the shared `<Field>` compound
// component imported from `../components/ui/Field`. Phase 6 of the
// UI/UX roadmap retired the file-local cloneElement-based wrapper in
// favour of the design-system primitive so every form in the app
// shares one accessible API (auto-wired htmlFor/aria-describedby/
// aria-invalid/aria-required + inline error rendering via
// <Field.Error>).

// ── CheckoutPage ───────────────────────────────────────────────────────────────
export function CheckoutPage() {
  const t = useT();
  const tx = useTx();
  const { items, totalPrice, clearCart } = useCart();
  const { currentUser, guestUser, startGuestSession } = useAuth();
  const { redeemCredit } = useCredit();
  const cc = useCreditConfig();
  const navigate = useNavigate();
  const settings = useSettings();

  // Phase 6.5: multi-step. Step state is persisted to the URL hash
  // (`#delivery`, `#payment`, `#review`) so the browser back/forward
  // buttons work as users expect within the checkout flow. The hash
  // is also cheap session continuity — refreshing the page keeps
  // the user on the step they were on.
  const initialStep: Step = (() => {
    const hash = (typeof window !== 'undefined' ? window.location.hash.slice(1) : '') as Step;
    return STEP_ORDER.includes(hash) && hash !== 'placed' ? hash : 'delivery';
  })();
  const [step, setStep] = useState<Step>(initialStep);
  // Sync the URL hash whenever the step changes — without this, the
  // initial step is set from the hash but subsequent step changes
  // wouldn't update it. Browser back/forward listeners catch the
  // hashchange event and re-sync local state below.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const want = `#${step}`;
    if (window.location.hash !== want) {
      // Use replaceState (not pushState) when going step-by-step so
      // back-button takes the user out of checkout entirely rather
      // than walking through every step backward. Submit success
      // (the 'placed' transition) is the one case where pushState
      // would arguably be nicer — but our happy path navigates away
      // to the order success page so it's moot.
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}${want}`,
      );
    }
  }, [step]);
  // Browser back/forward — sync state from the new hash.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHash = () => {
      const hash = window.location.hash.slice(1) as Step;
      if (STEP_ORDER.includes(hash) && hash !== step && hash !== 'placed') {
        setStep(hash);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [step]);
  const [orderId, setOrderId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  // Verification modal state — opens when an unverified user clicks
  // "Place Order". Replaces the previous (uninformative) toast.
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyModalReason, setVerifyModalReason] = useState<string>('');

  /** Stable order ID generated once per checkout session.
   *
   *  Why a ref + lazy init: if we generated this on every submit, a
   *  user double-clicking Place Order — or refreshing the page during
   *  a slow network call — would create two distinct order docs. By
   *  fixing the ID at the start of the checkout session and using
   *  `setDoc(doc(db, 'orders', id))` instead of `addDoc(...)`, a
   *  second submit upserts the same document — Firestore's last-write-
   *  wins semantics make it idempotent. The button is also disabled
   *  while submitting, so the realistic exposure is a network-stall +
   *  retry scenario.
   *
   *  The ref is captured once (lazy init via the function form) and
   *  intentionally NOT reset between submits within the same session.
   *  After successful confirmation we navigate away, which unmounts
   *  CheckoutPage — the next visit gets a fresh ID. */
  const stableOrderIdRef = useRef<string>('');
  if (!stableOrderIdRef.current) {
    stableOrderIdRef.current = generateOrderId();
  }
  // Hardened retry counter for the stale-token recovery path. Pre-fix
  // this was a `useRef<boolean>(false)` flag — single retry per attempt,
  // boolean, no backoff. The hardened version:
  //   - Caps retries at MAX_AUTO_RETRIES (2). A user with a genuinely
  //     stuck token can't get into an infinite recovery loop.
  //   - Backs off between attempts (200ms → 600ms). Firebase Auth's
  //     verification-flip propagation can take ~300ms in the worst case;
  //     150ms wasn't always enough.
  //   - Reset when:
  //       (a) the order succeeds (line ~677),
  //       (b) the user closes the verification modal,
  //       (c) RHF validates a fresh submit (treated as a new attempt).
  //   - Counter, not boolean, so the cap is visible: a future tweak to
  //     allow 3 retries is one constant change, not a rewrite.
  const orderRetryCountRef = useRef<number>(0);
  const MAX_AUTO_RETRIES = 2;

  // Card entered on the payment step, tokenized when the customer
  // continues to review. The token is single-use; a decline sends the
  // customer back to re-enter a card.
  const cardFormRef = useRef<CardPaymentFormHandle>(null);
  const [card, setCard] = useState<CardToken | null>(null);
  const [tokenizing, setTokenizing] = useState(false);
  // What was held, captured before the cart is cleared (the confirmation
  // modal renders after clearCart, when orderTotal is back to 0).
  const [placedHold, setPlacedHold] = useState<{ amount: number; last4?: string } | null>(null);
  // Returning to the payment step remounts the card fields, so any
  // earlier token is discarded.
  useEffect(() => {
    if (step === 'payment') setCard(null);
  }, [step]);

  // Auth + empty-cart guards — in useEffect to respect hooks rules (must not return early before hooks)
  useEffect(() => {
    if (items.length === 0 && step !== 'placed') navigate(ROUTES.CART, { replace: true });
  }, [items.length, step, navigate]);

  // ── Form (Phase 6 — RHF + Zod) ─────────────────────────────────────────────
  // The full delivery form lives in `checkoutForm`. `fulfillmentMethod`
  // is a form field too (not a separate useState) so the Zod schema's
  // `superRefine` can flip address-field requirements on/off based on
  // it. Pickup vs delivery toggles call `setValue('fulfillmentMethod',
  // …, { shouldValidate: true })` so the conditional refinements
  // re-evaluate.
  //
  // mode: 'onTouched' + reValidateMode: 'onChange' implements the
  // Phase 6.2 validation timing rules: don't yell while the user is
  // typing, but as soon as they leave a field invalid OR have already
  // erred once, re-validate on every keystroke until clean.
  const checkoutForm = useForm<CheckoutFormInput>({
    resolver: zodResolver(checkoutFormSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: {
      fulfillmentMethod: 'delivery',
      name: '',
      phone: '',
      address: '',
      city: '',
      province: '',
      postalCode: '',
      country: 'Canada',
    },
  });
  const { register, handleSubmit, watch, setValue, trigger, getValues, formState } = checkoutForm;
  const { errors, isSubmitting } = formState;

  /** Pickup vs delivery selection. Drives the conditional schema. The
   *  watch() subscription is the single source of truth — the JSX
   *  reads from this for "show address fields" gating. */
  const fulfillmentMethod = watch('fulfillmentMethod');

  const [creditApplied, setCreditApplied] = useState(0);
  const [creditPoints, setCreditPoints] = useState(0);
  // Guest checkout — chosen on the "How would you like to check out?"
  // screen; remembered for this browser tab.
  const [guestMode, setGuestMode] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('ele:guestCheckout') === '1';
    } catch {
      return false;
    }
  });
  const [guestEmail, setGuestEmail] = useState('');
  const guestEmailValid = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(guestEmail.trim());
  const isGuest = !currentUser;
  const chooseGuest = () => {
    setGuestMode(true);
    try {
      sessionStorage.setItem('ele:guestCheckout', '1');
    } catch {
      /* storage blocked */
    }
  };
  const {
    applyCode,
    clearPromo,
    promo: appliedPromo,
    applying: promoApplying,
    error: promoError,
  } = usePromoCode();
  const [promoInput, setPromoInput] = useState('');

  // Auth guard — using useEffect to avoid calling hooks conditionally
  // The hooks above have already been called; we defer the redirect to avoid rules violation

  // ── Derived totals ─────────────────────────────────────────────────────────
  const subtotal = totalPrice;
  const promoDiscount = appliedPromo?.discountAmount ?? 0;
  const afterPromo = Math.max(0, subtotal - promoDiscount);
  // creditCapped is still computed defensively, but the CreditSelector now
  // filters tiers to only those whose dollar value is ≤ afterPromo, so this
  // floor is rarely the active constraint. The `useEffect` below catches
  // the post-application case where promo/cart changes lower afterPromo
  // beneath an already-applied credit — there we MUST clear both
  // creditApplied AND creditPoints together (silently capping `creditApplied`
  // while leaving creditPoints at its original value let the customer pay
  // 50,000 pts for a $25 discount they intended to be $50).
  const creditCapped = Math.min(creditApplied, afterPromo);
  const afterCredit = Math.max(0, afterPromo - creditCapped);

  // Drift guard: if the user applies credit and then changes the cart
  // (or applies/clears a promo) such that their applied credit dollar
  // value now exceeds the maximum allowed, clear it together with the
  // points so the two stay in lockstep. The toast tells the user
  // explicitly so they can re-pick the right tier.
  useEffect(() => {
    if (creditApplied > 0 && creditApplied > afterPromo) {
      setCreditApplied(0);
      setCreditPoints(0);
      toast.info(tNow('Cart total changed — please reapply your credits.'));
    }
  }, [afterPromo, creditApplied]);

  // Shipping fee — pickup is always free; delivery uses the existing
  // calcShippingFee helper which applies the free-over-threshold rule.
  //
  // Computed from `subtotal` (raw goods value) so it matches the cart
  // drawer's free-shipping progress bar exactly. Trade-off acknowledged:
  // a customer at $80 subtotal who applies a $50 promo would pay
  // "$30 of goods + shipping" — i.e. they don't ALSO get free shipping
  // by virtue of the promo dropping them below the threshold. That's
  // intentional: shipping cost reflects what's being shipped (the
  // goods), and applying a discount to the goods doesn't change what
  // the courier charges. More importantly, this prevents the inverse
  // bait-and-switch where the drawer says "free shipping unlocked" at
  // $105, customer applies a $20 promo at checkout, and watches
  // shipping reappear because afterPromo dropped below threshold.
  // Drawer-says-X, checkout-says-X consistency wins.
  const shippingFee = fulfillmentMethod === 'pickup' ? 0 : calcShippingFee(subtotal, settings);

  // GST — computed per-item on taxable lines (same logic as CartSummary / cartStore)
  const totalGst = items.reduce(
    (sum, i: CartItem) => sum + (i.gstApplicable ? i.price * i.quantity * GST_RATE : 0),
    0,
  );
  // The amount held on the card. placeOrder recomputes it server-side and
  // refuses to hold more than this (expectedTotal).
  const orderTotal = Math.round((afterCredit + shippingFee + totalGst) * 100) / 100;
  const needsCard = orderTotal > 0;

  // Points earned on amount actually paid (after credit, before shipping, excl. GST).
  // Uses useCreditConfig.calcPointsEarned, which is the same validated source
  // the rest of the system reads — `settings.pointsPerDollar` directly bypassed
  // pickPositive's NaN/negative guard, so a dirty settings doc could surface
  // "you'll earn NaN points" in the UI while the server-side earn (functions/
  // src/index.ts:1015) silently fell back to 100.
  const ptsWillEarn = cc.calcPointsEarned(afterCredit);

  // ── Step navigation (Phase 6.5) ────────────────────────────────────────────
  // Each step has its own "ready to advance" check. Step 1 (delivery)
  // gates on the delivery fields via RHF's `trigger(...fields)` which
  // runs the Zod schema against the named fields and pushes errors
  // into formState. Step 2 (payment) is always advance-able since
  // promo + credit are optional; step 3 (review) is the final submit
  // and goes through handlePlaceOrder's RHF handleSubmit wrapper.
  const goNextStep = async () => {
    if (step === 'delivery') {
      // Validate only the fields visible on this step. For pickup,
      // only name + phone need to clear. For delivery, the whole
      // address block does too — superRefine in the schema sees
      // fulfillmentMethod and gates the address rules accordingly.
      const fields =
        fulfillmentMethod === 'delivery'
          ? DELIVERY_STEP_FIELDS_DELIVERY
          : DELIVERY_STEP_FIELDS_PICKUP;
      const ok = await trigger(fields as unknown as (keyof CheckoutFormInput)[]);
      if (isGuest && !guestEmailValid) {
        toast.error(tNow('Please enter a valid email address.'));
        requestAnimationFrame(() => document.getElementById('guest-email')?.focus());
        return;
      }
      if (!ok) {
        // RHF will set aria-invalid on each errored Field.Input. Find
        // the first one and scroll/focus it for users on a long form.
        requestAnimationFrame(() => {
          const firstInvalid = document.querySelector(
            'input[aria-invalid="true"]',
          ) as HTMLElement | null;
          if (firstInvalid) {
            firstInvalid.focus();
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
        return;
      }
      setStep('payment');
    } else if (step === 'payment') {
      if (needsCard) {
        setTokenizing(true);
        try {
          const token = await cardFormRef.current?.tokenize();
          if (!token) throw new Error('Please enter your card details.');
          setCard(token);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : tNow('Please check your card details.'));
          return;
        } finally {
          setTokenizing(false);
        }
      }
      setStep('review');
    }
    // 'review' → 'placed' is handled by handlePlaceOrder's setStep
    // on success; no explicit next-step button on review (the Place
    // Order submit IS the advance).
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const goPrevStep = () => {
    if (step === 'payment') setStep('delivery');
    else if (step === 'review') setStep('payment');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Place order ────────────────────────────────────────────────────────────
  async function handlePlaceOrder(data: CheckoutFormInput) {
    // RHF + zodResolver already validated everything in `data` before
    // we got here (handleSubmit wraps onValid + onInvalid; we're in
    // onValid). No need to re-run isValidPhone/isValidPostal or to
    // toast about missing fields — invalid submits go through the
    // onInvalid branch wired below, and inline <Field.Error> rendering
    // surfaces each issue next to its input.
    const isDelivery = data.fulfillmentMethod === 'delivery';

    // Build the shipping address only for delivery orders. Pickup
    // orders don't have an address — the order doc carries
    // fulfillmentMethod = 'pickup' and admin sees that in the order
    // list. The shape mirrors the previous schemas/address.schema
    // shippingAddressSchema (which had province/postalCode optional);
    // we collapse empty strings to undefined to keep the wire shape.
    const shipParsedData = isDelivery
      ? {
          name: data.name,
          phone: data.phone,
          address: data.address,
          city: data.city,
          province: data.province || undefined,
          postalCode: data.postalCode || undefined,
          country: data.country,
        }
      : undefined;

    // Guests: start (or reuse) an anonymous session for this order.
    let buyer = currentUser;
    if (!buyer) {
      if (!guestEmailValid) {
        toast.error(tNow('Please enter a valid email address.'));
        setStep('delivery');
        return;
      }
      try {
        buyer = guestUser ?? (await startGuestSession());
      } catch (guestErr) {
        console.warn('[CheckoutPage] guest session failed:', guestErr);
        toast.error(
          tNow('Guest checkout is unavailable right now — please sign in to place your order.'),
        );
        return;
      }
    }

    // Email verification gate: if the user has a password provider AND
    // their email is unverified, block the order. Pass-through for
    // Google-only users (OAuth pre-verifies email) and for users whose
    // emailVerified flag is true (e.g. they verified earlier or linked
    // a verified Google account).
    //
    // Why block at order-submission specifically:
    // - We need a reliable channel to reach the customer with order
    //   updates (approval, payment confirmation, shipped, delivered).
    //   Sending to an unverified address risks bouncing and the
    //   customer never knowing their order state.
    // - Customer might verify in another tab between visiting and
    //   submitting — re-checking here covers that.
    //
    // Token refresh: `currentUser.emailVerified` reads the cached User
    // object, which can be up to an hour stale even after the user
    // clicked the verification link. We force a `reload()` (refreshes
    // user state from server) followed by `getIdToken(true)` (refreshes
    // the ID token so Firestore rules see the new emailVerified=true)
    // BEFORE checking the flag. Without this, a freshly-verified user
    // is still blocked here AND by the firestore rule — both reading
    // the stale token's email_verified=false. The rule check is the
    // security boundary; this client check is UX, but they have to
    // agree, otherwise the user sees a confusing "verify your email"
    // toast even though they just did.
    // Verification gate — open modal for any unverified user, regardless
    // of provider. Previously gated on `hasPasswordProvider`, but Google
    // sign-in users can ALSO have email_verified=false in some edge
    // cases (Google account itself unverified, or password account that
    // was later linked to Google preserving the original false claim).
    // Treating Google as always-verified made the order rule reject
    // these users with a generic "couldn't process" toast and no path
    // forward. Now they get the verify modal with resend + check-now.
    if (currentUser && !currentUser.emailVerified) {
      // Cheap optimistic refresh — reload + token refresh.
      // Total round-trip is ~150-300ms; acceptable inline at submit.
      try {
        const { mod } = await ensureAuth();
        await mod.reload(currentUser);
        // Force-refresh ID token so Firestore rules see updated claims.
        // currentUser.emailVerified is now updated in-place by reload().
        await currentUser.getIdToken(true);
      } catch (refreshErr) {
        // Network failure during refresh — proceed with stale state
        // and let the rule fail with a clear message if needed.
        console.warn('[CheckoutPage] Email verification refresh failed:', refreshErr);
      }
      // Re-check after refresh — may have flipped to true.
      if (!currentUser.emailVerified) {
        // Replace the previous toast with a dedicated modal. Toast
        // was easy to dismiss without reading; modal carries the
        // resend button and an "I've verified — check now" action
        // right where the user is, with explicit copy explaining
        // why we're gating.
        setVerifyModalReason('checkout-blocked');
        setVerifyModalOpen(true);
        return;
      }
      // Verification just transitioned to TRUE on this attempt.
      // Sync to /users/{uid} so the welcome-bonus grant trigger fires.
      // Best-effort — if it fails, the bonus may simply not be granted
      // (the trigger can also fire via the modal's check-now path).
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          emailVerified: true,
          updatedAt: serverTimestamp(),
        });
      } catch (syncErr) {
        console.warn('[CheckoutPage] /users emailVerified sync failed:', syncErr);
      }
    }

    if (needsCard && !card) {
      toast.info(tNow('Please enter your card details.'));
      setStep('payment');
      return;
    }

    setSubmitting(true);
    try {
      // Use the stable per-session ID (see useRef above). A double-
      // submit, refresh-during-network-stall, or back-button retry all
      // upsert the same Firestore doc — no duplicate orders.
      const newOrderId = stableOrderIdRef.current;

      // Day 16: when the cart contains a gift bundle, mirror its
      // personalization fields to the top-level order document. This
      // preserves the same `isGift` / `recipientName` / `giftMessage`
      // signal the previous direct-to-Firestore GiftsPage wrote, so a
      // future admin "Gifts" tab can filter on `isGift === true` without
      // a data migration. The line item itself still carries the full
      // bundle blob under items[].bundle for fine-grained access.
      //
      // We use the FIRST bundle's personalization. The cart UI doesn't
      // currently allow combining bundle + non-bundle in a single
      // checkout flow in any normal way (bundles are typically the
      // single line item), so this is correct in practice. If a user
      // ever adds two bundles, the second bundle's personalization is
      // still preserved inside its own line item — the top-level mirror
      // only covers the first.
      const firstBundleItem = items.find((i: CartItem) => i.bundle);
      const giftFields = firstBundleItem?.bundle
        ? {
            isGift: true,
            recipientName: firstBundleItem.bundle.personalization.recipientName,
            senderName: firstBundleItem.bundle.personalization.senderName,
            giftMessage: firstBundleItem.bundle.personalization.message,
            occasion: firstBundleItem.bundle.personalization.occasion,
            customOccasion: firstBundleItem.bundle.personalization.customOccasion,
          }
        : {};

      // Idempotency / retry handling is delegated to the placeOrder
      // callable below — its Admin SDK getDoc bypasses rules and
      // returns { alreadyExisted: true } when the orderId is already
      // present (handled at line ~503 via the `result.data.alreadyExisted`
      // branch, which routes the user to /orders without re-writing).
      //
      // We previously did a client-side getDoc(doc(db, 'orders', newOrderId))
      // here as a "pre-check existence" guard. That was the source of a
      // hard-to-diagnose customer-only `permission-denied` bug:
      //
      //   The /orders read rule is `isOwner(resource.data.userId) || isAdmin()`.
      //   For a freshly generated orderId, the document does NOT yet
      //   exist, so `resource` is null. In Firestore CEL,
      //   `resource.data.userId` then evaluates to null, so
      //   `isOwner(null)` is false. For admins, `isAdmin()` short-
      //   circuits the OR to true and the read is allowed. For
      //   customers, both clauses are false and the read is rejected
      //   with permission-denied — BEFORE the callable below is ever
      //   invoked. That's why simplifying the create rule, refactoring
      //   to a callable, clearing caches, etc. all failed to fix it:
      //   the failure was on the read, not the create.
      //
      // The fix is to remove the redundant pre-check entirely. The
      // callable already handles the retry/idempotency case server-
      // side, and the read rule is now also patched to short-circuit
      // safely on non-existent docs (defense in depth).
      // Filter line items defensively. Zero/negative quantity slipped
      // through would still have its `price` contribute to subtotal
      // validation (the rule sums items into subtotal indirectly via
      // the totalAmount RHS), letting a malicious client game promo
      // minPurchase. The Zustand cart store doesn't permit qty < 1,
      // but localStorage is user-editable — this is the boundary.
      // Also dedupe by id (cart store enforces but storage is mutable).
      const seenIds = new Set<string>();
      const cleanItems = items.filter((i: CartItem) => {
        if (!i.id || seenIds.has(i.id)) return false;
        if (typeof i.quantity !== 'number' || i.quantity < 1) return false;
        if (typeof i.price !== 'number' || i.price < 0) return false;
        seenIds.add(i.id);
        return true;
      });
      if (cleanItems.length === 0) {
        toast.error(tNow('Your cart looks empty or invalid. Please refresh and try again.'));
        setSubmitting(false);
        return;
      }
      if (cleanItems.length > 100) {
        toast.error(
          tNow('Order has too many line items (max 100). Please split into smaller orders.'),
        );
        setSubmitting(false);
        return;
      }
      // Place the order via the placeOrder callable Cloud Function.
      //
      // We previously called setDoc(orderRef, {...}) directly from the
      // client. Firestore rules consistently rejected non-admin writes
      // with permission-denied even when the rule was simplified to
      // pure ownership checks. The contradiction was unsolvable from
      // outside the Firebase project. Routing through a callable
      // bypasses Firestore rules entirely (Admin SDK is unconstrained)
      // AND moves field validation server-side where it belongs.
      //
      // The callable returns { ok, orderId, alreadyExisted }. On
      // alreadyExisted=true, this was a retry — show the existing
      // order to the user instead of pretending success.
      //
      // Lazy-load firebase/functions here so the chunk only fetches
      // when the user actually clicks "Place order" — first-paint of
      // the checkout page doesn't need it. Same pattern as auth and
      // storage in src/lib/firebase.ts.
      const { functions, httpsCallable } = await getFunctionsLazy();
      const placeOrderFn = httpsCallable<
        unknown,
        {
          ok: boolean;
          orderId: string;
          alreadyExisted: boolean;
        }
      >(functions, 'placeOrder');
      let result: HttpsCallableResult<{ ok: boolean; orderId: string; alreadyExisted: boolean }>;
      // Pricing is recomputed server-side from canonical prices, the
      // promotion doc and settings — shipping / GST / promo amounts are
      // not sent. expectedTotal caps the card hold at what the customer
      // saw on this page.
      // Callable errors propagate up to the surrounding catch block
      // (line ~660), which translates them to the right toast/modal
      // based on the HttpsError code prefix.
      result = await placeOrderFn({
        orderId: newOrderId,
        userId: buyer.uid,
        ...(currentUser ? {} : { guestEmail: guestEmail.trim() }),
        items: cleanItems.map((i: CartItem) => ({
          productId: i.id,
          productName: i.name,
          quantity: i.quantity,
          price: i.price,
          image: i.image,
          ...(i.bundle ? { bundle: i.bundle } : {}),
        })),
        // R2 Bug #1 + #2: send `creditCapped` (the value the customer
        // saw on the right-hand summary) and a points count rounded
        // to that capped dollar amount. The previous workaround
        // (`creditApplied === creditCapped ? … : 0`) zeroed the
        // submission whenever floating-point rounding made `afterPromo`
        // diverge from `creditApplied` by even a hundredth of a cent
        // — silently stealing the customer's redemption while the UI
        // still showed the discount applied.
        //
        // The placeOrder callable performs the server-side rate
        // validation (creditApplied ≤ creditPointsRedeemed × rate +
        // 0.01 tolerance), so sending the capped pair is safe: if
        // the customer's claimed pair was malformed, the cloud
        // function rejects with `failed-precondition` and the catch
        // block surfaces a real error — far better than silent loss.
        creditApplied: creditCapped,
        promoCode: appliedPromo?.code ?? null,
        promotionId: appliedPromo?.id ?? null,
        creditPointsRedeemed:
          creditCapped > 0
            ? // Scale points proportionally to what's actually being
              // redeemed after the cap. Rounding down avoids the rare
              // case where rate-validation flags a 1-pt overage.
              Math.floor(creditPoints * (creditCapped / Math.max(creditApplied, 1e-9)))
            : 0,
        fulfillmentMethod,
        expectedTotal: orderTotal,
        ...(needsCard && card ? { cardToken: card.token } : {}),
        ...(shipParsedData ? { shippingAddress: shipParsedData } : {}),
        ...giftFields,
        // Order emails go out in the language the customer checked out in.
        lang: useLanguageStore.getState().language,
      });
      if (result.data.alreadyExisted) {
        // R2 Bug #7: previously this routed to the generic /orders
        // list with no signal of WHICH order is the one they just
        // tried to submit, AND the orderId in this component's local
        // state was already stale (we mutated the ref above). Now we
        // surface the orderId the server reported as the duplicate
        // and rotate the ref AFTER, so the toast still names the
        // right order. Routing still goes to /orders (no per-order
        // page yet) but the toast tells the customer what to look for.
        const existingId = result.data.orderId || newOrderId;
        toast.info(
          tNow('This order ({id}) was already submitted. Showing your orders now…', {
            id: existingId,
          }),
          { duration: 6000 },
        );
        stableOrderIdRef.current = generateOrderId();
        navigate(ROUTES.ORDERS);
        setSubmitting(false);
        return;
      }

      // Promo usage tracking is now handled server-side by the
      // onOrderWrite cloud function (same pending-branch as stock and
      // credit deduction). Was previously a client-side runTransaction
      // here that raced with the order setDoc above — if it failed
      // (silently caught), the order existed with the discount but
      // usageCount never incremented. The server-side path is atomic
      // with order creation (Firestore at-least-once delivery + an
      // idempotency check inside the function).

      // Stock decrement is now handled server-side by `onOrderWrite` —
      // it runs a Firestore transaction that validates each item's stock
      // and either decrements atomically or rejects the entire order
      // (status -> 'rejected', rejectionReason set, customer notified).
      // This was previously done here via a non-transactional writeBatch
      // which could drive stock negative on race conditions.

      // Validate credit redemption client-side before showing success.
      // The actual balance deduction happens server-side in onOrderWrite
      // (Admin SDK can write to /credits, the client cannot — that's by
      // design to prevent self-grant exploits). This call only checks
      // the validation guards (multiples of 10k, sufficient balance)
      // and returns the dollar value for UI consistency.
      if (creditPoints > 0) {
        try {
          await redeemCredit(creditPoints);
        } catch (creditErr) {
          // R2 Bug #4: previously this was a console.error and nothing
          // else — the customer saw a green "order placed" modal even
          // when their points balance had moved out from under them
          // (e.g., another tab redeemed during checkout). The order
          // doc was already written with the claimed creditApplied;
          // onOrderWrite will clamp deduction to the actual balance,
          // but the customer needs to know the math may have shifted.
          //
          // We don't roll back the order — it's already written, and
          // the server-side clamp will adjust the deduction. Instead
          // we surface a non-blocking warning so the customer can
          // verify the final email matches what they expected.
          console.error('Credit validation failed after order placed:', creditErr);
          const msg = creditErr instanceof Error ? creditErr.message : 'Credit validation issue';
          toast.warning(
            tNow(
              "Heads up: {msg}. Your order is placed; we'll confirm the final credit deduction by email.",
              { msg },
            ),
            { duration: 8000 },
          );
        }
      }

      setOrderId(newOrderId);
      setPlacedHold({ amount: needsCard ? orderTotal : 0, last4: card?.last4 });
      // IMPORTANT: flip step to 'placed' BEFORE clearing the cart. The empty-cart
      // guard effect watches `items.length` and navigates to /cart when it hits 0
      // in the 'details' step, so without this flip the user would be redirected
      // away and never see the confirmation modal.
      setStep('placed');
      clearCart();
      setShowConfirm(true);
      // Reset retry counter so a future attempt (e.g. user navigates
      // away then back) starts fresh.
      orderRetryCountRef.current = 0;
    } catch (err: unknown) {
      // Surface diagnostic info to the console so a permission-denied
      // failure is debuggable. Firebase SDK doesn't tell us WHICH rule
      // clause failed, but the user can compare the logged payload
      // against firestore.rules to spot the mismatch.
      // Production users only see the friendly toast below.
      console.error('[Place Order] Failed:', err);
      const fbErr = err as { code?: string; message?: string };
      console.error('[Place Order] Firestore error code:', fbErr?.code ?? '(none)');
      console.error('[Place Order] Auth uid:', currentUser?.uid ?? '(not signed in)');

      // Friendlier copy when we recognize the permission case. The
      // raw Firebase string ("Missing or insufficient permissions") is
      // confusing to end users who didn't do anything wrong.
      //
      // Special case: a permission-denied rejection on order CREATE
      // is most often the firestore rule's email_verified gate failing
      // — and the user's local emailVerified state may already say
      // true (if they verified after signing in). In that case the
      // ID token cached on this device still has the OLD
      // email_verified=false claim (Firebase tokens are valid for ~60
      // min and only carry whatever claims existed at issue time).
      //
      // Auto-recovery: when we detect this exact state (token says
      // unverified, server-side User says verified), force a
      // sign-out → sign-in cycle is technically required to mint a
      // new token with email_verified=true. We can't do that
      // transparently for password users (no stored credentials),
      // but `getIdToken(true)` followed by `reload()` should be
      // enough in most cases. Direct the user clearly if not.
      let userMsg: string | null = null;
      // Callable Cloud Function errors come back with code prefixes
      // like 'functions/permission-denied', 'functions/failed-precondition'.
      // Direct Firestore writes use bare 'permission-denied'. Match
      // both paths so the error UX is consistent.
      const code = fbErr?.code ?? '';
      const isPermissionDenied =
        code === 'permission-denied' || code === 'functions/permission-denied';
      const errMessage = fbErr?.message ?? '';
      // failed-precondition is also used for card declines, sold-out teas
      // and total changes — only the email gate mentions verification.
      const isVerificationGate =
        (code === 'functions/failed-precondition' || code === 'failed-precondition') &&
        /verify your email/i.test(errMessage);
      const isCardProblem =
        /card/i.test(errMessage) &&
        (code.endsWith('failed-precondition') || code.endsWith('invalid-argument'));
      // Transient / token-stale codes that benefit from the same
      // reload+retry recovery, distinct from a hard permission denial.
      // `unauthenticated` from a callable means the ID token wasn't
      // accepted by the function's auth gate — usually a token-too-old
      // for the server's clock skew or a stale token immediately after
      // verification flip. `unavailable` and `deadline-exceeded` are
      // transient infra blips that one retry usually clears.
      const isStaleTokenError = code === 'functions/unauthenticated' || code === 'unauthenticated';
      const isTransientInfra =
        code === 'unavailable' ||
        code === 'functions/unavailable' ||
        code === 'deadline-exceeded' ||
        code === 'functions/deadline-exceeded';
      // The set of codes we'll auto-retry. permission-denied is the
      // classic stale-token case; the others are infra/auth flap.
      const isRetryable = isPermissionDenied || isStaleTokenError || isTransientInfra;

      if (isCardProblem) {
        // Declined / missing card: the token is spent — re-enter a card.
        userMsg = errMessage;
        setCard(null);
        setStep('payment');
      } else if (isVerificationGate) {
        // Server-side rejection because email_verified !== true on the
        // ID token. Open the verification modal — that's the right
        // affordance for this case (resend + check-now).
        setVerifyModalReason('checkout-permission-denied');
        setVerifyModalOpen(true);
      } else if (isRetryable) {
        // Stale token / transient infra recovery path. Pre-fix this
        // had a single-shot boolean retry with a fixed 150ms wait —
        // a token flip that took 300ms+ to propagate would fail twice
        // and surface as a generic "couldn't process your order" toast.
        // The hardened version:
        //   1. Caps retries at MAX_AUTO_RETRIES so a genuinely-broken
        //      token can't loop forever.
        //   2. Backs off proportionally to the attempt index (200ms,
        //      then 600ms) — long enough that a verification flip can
        //      land on the server side before we re-submit.
        //   3. Distinguishes "still permission-denied AFTER retries
        //      were exhausted" → recommends sign-out/sign-in, which is
        //      the only known recovery for a JWT cache that never
        //      updates. Pre-fix the user just saw "contact support."
        //   4. Splits the email-verified branch out cleanly so the
        //      modal opens for the genuinely-unverified case (not for
        //      transient-token-but-already-verified, which auto-retries).
        const currentRetry = orderRetryCountRef.current;
        const canRetry = currentRetry < MAX_AUTO_RETRIES;

        let tokenRefreshed = false;
        if (!currentUser) throw err;
        let tokenSaysVerified = currentUser.emailVerified;
        try {
          const { mod } = await ensureAuth();
          await mod.reload(currentUser);
          await currentUser.getIdToken(true);
          // Backoff proportional to attempt — gives Firebase time to
          // propagate any verification flip server-side before the
          // re-submit reads `email_verified` from the new token.
          const backoffMs = 200 + currentRetry * 400;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          tokenRefreshed = true;
          tokenSaysVerified = currentUser.emailVerified;
        } catch (refreshErr) {
          // Network or auth failure during refresh. Fall through to
          // the recovery-recommendation branch below — without a
          // fresh token we can't safely retry.
          console.warn('[Place Order] Token refresh failed during retry:', refreshErr);
        }

        if (canRetry && tokenRefreshed && tokenSaysVerified) {
          orderRetryCountRef.current = currentRetry + 1;
          try {
            await updateDoc(doc(db, 'users', currentUser.uid), {
              emailVerified: true,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            console.warn('[Place Order] Failed to sync verified flag back to Firestore:', err);
          }
          setSubmitting(false);
          // Re-submit the order with the current (validated) form
          // values. getValues() returns the latest RHF state; the
          // schema already accepted it (we got here from
          // handleSubmit's onValid path).
          await handlePlaceOrder(getValues());
          return;
        }

        if (!canRetry) {
          // Retries exhausted. The user's token is stuck — neither
          // reload() nor getIdToken(true) is producing one the server
          // accepts. The only known recovery is a full sign-out / sign-in
          // cycle, which re-mints the token from scratch. Tell the user
          // that explicitly instead of a generic "contact support".
          userMsg =
            "We couldn't process your order after retrying. Please sign out, sign back in, and try once more. If it still fails, contact support and we'll place the order manually.";
        } else if (!tokenSaysVerified) {
          // Genuinely unverified per the refreshed token — modal is
          // the right affordance (resend button + "I've verified —
          // check now"). The "I've verified" path triggers another
          // token refresh, which will reset this branch.
          //
          // This branch handles email/password AND Google users
          // whose Google account itself is unverified (rare, but
          // real — when a user signs up via email/password first
          // and later links Google, Firebase keeps the original
          // email_verified=false claim).
          setVerifyModalReason('checkout-permission-denied');
          setVerifyModalOpen(true);
          // userMsg stays null so we don't double-surface (toast +
          // modal); modal is the primary signal here.
        } else {
          // Refresh failed (no fresh token) but we haven't burned all
          // retries yet. Most likely a transient network blip. Tell
          // the user to retry manually — auto-retry would have no
          // fresh token to work with.
          userMsg =
            "We couldn't reach our servers to place your order. Please check your connection and try again.";
        }
      } else {
        userMsg = err instanceof Error ? err.message : 'Failed to place order';
      }
      if (userMsg) {
        toast.error(userMsg, { duration: 10000 });
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Confirmation modal ────────────────────────────────────────────────────
  // Pulled the ad-hoc inline styles into class-based markup (see
  // .confirm-modal-* in design.css) so the modal can use proper media
  // queries and safe-area insets — the previous version was visibly
  // loose on small phones (oversized icon + serif title + 28px padding
  // ate ~70% of a 360-wide viewport).
  const ConfirmationModal = () => {
    return (
      <div
        className="confirm-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div className="confirm-modal-panel">
          {/* Dark header */}
          <div className="confirm-modal-header">
            <div className="confirm-modal-checkmark">
              <CheckCircle2 size={32} className="cp2-checkmark-icon icon-bounce-in" />
            </div>
            <p className="confirm-modal-overline">{t('Order Received')}</p>
            <h2 id="confirm-modal-title" className="confirm-modal-title">
              {t('Thank you for your order!')}
            </h2>
            <p className="confirm-modal-orderline">
              {tx('Order {id}', { id: <span className="confirm-modal-orderid">{orderId}</span> })}
            </p>
          </div>

          {/* Body */}
          <div className="confirm-modal-body">
            <p className="confirm-modal-lead">
              {placedHold && placedHold.amount > 0 ? (
                <>
                  {placedHold.last4
                    ? t("We've placed a temporary hold of {amount} on your card ending {last4}.", {
                        amount: formatMoney(placedHold.amount),
                        last4: placedHold.last4,
                      })
                    : t("We've placed a temporary hold of {amount} on your card.", {
                        amount: formatMoney(placedHold.amount),
                      })}
                  <strong className="cp2-strong-text">
                    {' '}
                    {t("You won't be charged until we confirm your teas are in stock.")}
                  </strong>
                </>
              ) : (
                <>{t("We're confirming your teas are in stock — your credit covers this order.")}</>
              )}
            </p>

            {/* Steps */}
            <div className="confirm-modal-steps">
              {[
                {
                  n: '1',
                  title: 'Checking stock',
                  desc: 'Our team confirms every tea is in stock — usually within a few hours.',
                  color: 'var(--warning)',
                },
                {
                  n: '2',
                  title: 'Card charged',
                  desc: "Your card is charged only once the order is confirmed. If we can't fill it, the hold is released.",
                  color: 'var(--info)',
                },
                {
                  n: '3',
                  title: fulfillmentMethod === 'pickup' ? 'Ready for pickup' : 'We ship',
                  desc:
                    fulfillmentMethod === 'pickup'
                      ? "We'll email you when it's at the counter."
                      : "We'll email you tracking as soon as it ships.",
                  color: 'var(--success)',
                },
              ].map(({ n, title, desc, color }) => (
                <div key={`modal-${n}`} className="confirm-modal-step">
                  <div
                    className="confirm-modal-step-num"
                    // eslint-disable-next-line react/forbid-dom-props -- per-step accent (warning/info/gold/success) varies at runtime; encoded as CSS vars so the same class can render any of the four palettes
                    style={{ ['--cp2-step-color' as string]: color }}
                  >
                    {n}
                  </div>
                  <div>
                    <p className="confirm-modal-step-title">{t(title)}</p>
                    <p className="confirm-modal-step-desc">{t(desc)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Info note */}
            <div className="confirm-modal-note">
              <span className="confirm-modal-note-icon" aria-hidden="true">
                ✉️
              </span>
              <p>
                {tx("We'll email updates to {email}.", {
                  email: (
                    <strong className="cp2-strong-text">{currentUser?.email ?? guestEmail}</strong>
                  ),
                })}
              </p>
            </div>

            {/* CTA */}
            {isGuest ? (
              <>
                <button
                  onClick={() => {
                    setShowConfirm(false);
                    navigate(ROUTES.PRODUCTS);
                  }}
                  className="btn btn-dark btn-full btn-lg cp2-confirm-btn"
                >
                  {t('Continue shopping')} <ChevronRight size={16} />
                </button>
                <p className="cp2-guest-signup">
                  {t('Want to earn points and track orders?')}{' '}
                  <Link to={ROUTES.SIGNUP}>{t('Create a free account')}</Link>
                </p>
              </>
            ) : (
              <button
                onClick={() => {
                  setShowConfirm(false);
                  navigate(ROUTES.ORDERS);
                }}
                className="btn btn-dark btn-full btn-lg cp2-confirm-btn"
              >
                {t('View My Orders')} <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Not signed in and hasn't chosen guest checkout yet: ask how to continue.
  if (isGuest && !guestMode && !showConfirm) {
    return (
      <div className="cp2-gate">
        <SeoHead title="Checkout | Ele Café" description="Checkout" noIndex={true} />
        <h1 className="cp2-gate-title">{t('How would you like to check out?')}</h1>
        <div className="cp2-gate-grid">
          <div className="card card-body cp2-gate-card">
            <h2 className="cp2-gate-h2">{t('Continue as guest')}</h2>
            <p className="cp2-gate-p">{t('No account needed. We’ll email your order updates.')}</p>
            <button type="button" className="btn btn-dark btn-full btn-lg" onClick={chooseGuest}>
              {t('Continue as guest')}
            </button>
          </div>
          <div className="card card-body cp2-gate-card">
            <h2 className="cp2-gate-h2">{t('Sign in or create an account')}</h2>
            <p className="cp2-gate-p">
              {t('Earn points on this order, use your credits and track every order.')}
            </p>
            <Link to={loginWithReturn(ROUTES.CHECKOUT)} className="btn btn-outline btn-full btn-lg">
              {t('Sign in')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {showConfirm && <ConfirmationModal />}

      {/* Email-verification modal. Opens when the gate fires (either
          up-front check before order create, or permission-denied
          fallback in the catch). onVerified just toasts the user to
          retry — we don't auto-resubmit to keep double-submit safety
          obvious. */}
      <EmailVerificationModal
        open={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        variant="blocked"
        reason={verifyModalReason}
        onVerified={() => {
          toast.info(tNow('Email verified — you can place your order now.'));
        }}
      />

      <div className="cp2-page">
        <SeoHead
          title="Secure Checkout | Ele Café"
          description="Complete your Ele Café order securely by card."
          noIndex={true}
        />
        <div className="container co-container">
          <div className="co-header">
            <span className="overline co-overline">{t('Secure Checkout')}</span>
            {/* Phase 6.5: heading reflects the current step. The
                user always knows where they are without reading the
                Steps indicator. */}
            <h1>
              {step === 'delivery'
                ? t('Delivery details')
                : step === 'payment'
                  ? t('Payment options')
                  : step === 'review'
                    ? t('Review & place order')
                    : t('Order placed')}
            </h1>
          </div>
          <Steps current={step} />

          <form
            onSubmit={handleSubmit(handlePlaceOrder, () => {
              // onInvalid branch — RHF aggregates errors. Render them
              // inline next to fields; also toast a high-level hint so
              // a user who's scrolled past the form knows what to do.
              toast.error(tNow('Please fix the highlighted fields and try again'));
              requestAnimationFrame(() => {
                const firstInvalid = document.querySelector(
                  'input[aria-invalid="true"]',
                ) as HTMLElement | null;
                if (firstInvalid) {
                  firstInvalid.focus();
                  firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              });
            })}
            aria-busy={isSubmitting || undefined}
            noValidate
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* ── Left: shipping + credit ─────────────────────────── */}
              <div className="lg:col-span-2 co-left">
                {/* Step 1 — Delivery (pickup vs delivery + name + phone + address) */}
                {step === 'delivery' && (
                  <>
                    {/* ── Pickup vs Delivery selection ─────────────────────
                    Before this card: the address section assumed every
                    order was a delivery. Now the customer chooses up-
                    front, and the cost summary on the right reflects
                    the choice immediately. Pickup is always free;
                    delivery is the flat-rate fee from settings (or
                    free over the threshold). */}
                    <div className="card card-body">
                      <h2 className="cp2-section-h2">
                        {t('How would you like to receive your order?')}
                      </h2>
                      <div className="cp2-fulfillment-grid">
                        {[
                          {
                            id: 'pickup' as const,
                            title: 'Pickup',
                            sub: 'In-store · Free',
                            icon: '📦',
                          },
                          {
                            id: 'delivery' as const,
                            title: 'Delivery',
                            sub:
                              shippingFee === 0
                                ? 'Free · Order qualifies'
                                : t('{amount} flat', {
                                    amount: formatMoney(settings?.defaultShippingFee ?? 12.99),
                                  }),
                            icon: '🏠',
                          },
                        ].map((opt) => {
                          const selected = fulfillmentMethod === opt.id;
                          const isFree = opt.sub.startsWith('Free') || opt.sub.includes('Free');
                          return (
                            <button
                              type="button"
                              key={opt.id}
                              onClick={() =>
                                setValue('fulfillmentMethod', opt.id, {
                                  shouldValidate: true,
                                  shouldDirty: true,
                                })
                              }
                              className="cp2-fulfillment-tile"
                              data-selected={selected ? 'true' : 'false'}
                            >
                              <span className="cp2-fulfillment-icon" aria-hidden="true">
                                {opt.icon}
                              </span>
                              <span className="cp2-fulfillment-title">{t(opt.title)}</span>
                              <span
                                className="cp2-fulfillment-sub"
                                data-free={isFree ? 'true' : 'false'}
                              >
                                {t(opt.sub)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {/* Free-delivery threshold nudge — encourages upsell
                      when the customer is close to qualifying for free
                      shipping. Hidden for pickup (irrelevant) and when
                      already qualified. */}
                      {fulfillmentMethod === 'delivery' &&
                        shippingFee > 0 &&
                        (() => {
                          const threshold = Number(settings?.freeShippingThreshold) || 0;
                          const remaining = Math.max(0, threshold - afterCredit);
                          if (remaining <= 0 || threshold <= 0) return null;
                          return (
                            <p className="cp2-threshold-nudge">
                              {tx('Add {amount} more for free delivery 🎁', {
                                amount: (
                                  <strong className="cp2-threshold-amt">
                                    {formatMoney(remaining)}
                                  </strong>
                                ),
                              })}
                            </p>
                          );
                        })()}
                    </div>

                    <div className="card card-body">
                      <h2 className="cp2-section-h2 cp2-section-h2-lg">
                        {fulfillmentMethod === 'pickup'
                          ? t('Contact details')
                          : t('Shipping address')}
                      </h2>
                      {fulfillmentMethod === 'pickup' && (
                        <p className="cp2-pickup-hint">
                          {t(
                            'We’ll call you at the number below when your order is ready for pickup at our café.',
                          )}
                        </p>
                      )}
                      {isGuest && (
                        <div className="cp2-guest-email">
                          <label htmlFor="guest-email" className="cp2-guest-email-label">
                            {t('Email for your order updates')}
                          </label>
                          <input
                            id="guest-email"
                            type="email"
                            autoComplete="email"
                            inputMode="email"
                            className="field"
                            value={guestEmail}
                            onChange={(e) => setGuestEmail(e.target.value)}
                            aria-invalid={guestEmail.length > 0 && !guestEmailValid}
                            placeholder="you@example.com"
                            required
                          />
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field name="name" required>
                          <Field.Label>{t('Full name')}</Field.Label>
                          <Field.Input
                            {...register('name')}
                            autoComplete="name"
                            placeholder={t('Jane Smith')}
                          />
                          <Field.Error>{errors.name?.message}</Field.Error>
                        </Field>
                        <Field name="phone" required>
                          <Field.Label>{t('Phone')}</Field.Label>
                          <Field.Input
                            type="tel"
                            {...register('phone')}
                            autoComplete="tel"
                            placeholder="+1 604 555 0100"
                          />
                          <Field.Error>{errors.phone?.message}</Field.Error>
                        </Field>
                      </div>
                      {/* Address fields — shown only for delivery orders.
                      Pickup orders skip the form entirely so customer
                      doesn't need to type their address for an order
                      they're picking up in person. The Zod schema's
                      superRefine gates address-field requirements on
                      fulfillmentMethod, so RHF won't report errors
                      against fields the user never sees. */}
                      {fulfillmentMethod === 'delivery' && (
                        <>
                          <div className="cp2-addr-row">
                            <Field name="address" required>
                              <Field.Label>{t('Street address')}</Field.Label>
                              <Field.Input
                                {...register('address')}
                                autoComplete="street-address"
                                placeholder={t('123 Main Street')}
                              />
                              <Field.Error>{errors.address?.message}</Field.Error>
                            </Field>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 cp2-addr-row">
                            <Field name="city" required>
                              <Field.Label>{t('City')}</Field.Label>
                              <Field.Input
                                {...register('city')}
                                autoComplete="address-level2"
                                placeholder={t('Vancouver')}
                              />
                              <Field.Error>{errors.city?.message}</Field.Error>
                            </Field>
                            <Field name="province" required>
                              <Field.Label>{t('Province')}</Field.Label>
                              <Field.Input
                                {...register('province')}
                                autoComplete="address-level1"
                                placeholder={t('BC')}
                              />
                              <Field.Error>{errors.province?.message}</Field.Error>
                            </Field>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 cp2-addr-row">
                            <Field name="postalCode" required>
                              <Field.Label>{t('Postal code')}</Field.Label>
                              <Field.Input
                                {...register('postalCode')}
                                autoComplete="postal-code"
                                placeholder="V5K 0A1"
                              />
                              <Field.Error>{errors.postalCode?.message}</Field.Error>
                            </Field>
                            <Field name="country" required>
                              <Field.Label>{t('Country')}</Field.Label>
                              <Field.Input
                                {...register('country')}
                                autoComplete="country-name"
                                placeholder={t('Canada')}
                              />
                              <Field.Error>{errors.country?.message}</Field.Error>
                            </Field>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Step 1 → 2 navigation */}
                    <div className="co-step-nav">
                      <button
                        type="button"
                        onClick={goNextStep}
                        className="btn btn-dark btn-lg co-nav-next"
                      >
                        {t('Continue to Payment')} <ChevronRight size={16} />
                      </button>
                    </div>
                  </>
                )}

                {/* Step 2 — Payment (promo + credit) */}
                {step === 'payment' && (
                  <>
                    {/* Promo code */}
                    <div className="card card-body">
                      <h3 className="cp2-h3">{t('Promo Code')}</h3>
                      {appliedPromo ? (
                        <div className="cp2-promo-applied">
                          <div>
                            <span className="cp2-promo-code">{appliedPromo.code}</span>
                            <span className="cp2-promo-saving">
                              {t('−{amount} off', {
                                amount: formatMoney(appliedPromo.discountAmount),
                              })}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              clearPromo();
                              setPromoInput('');
                            }}
                            className="cp2-promo-remove"
                          >
                            {t('Remove')}
                          </button>
                        </div>
                      ) : (
                        <div className="cp2-promo-input-row">
                          <input
                            className="field cp2-promo-input"
                            value={promoInput}
                            // R2 Bug #3: previously force-uppercased the input,
                            // which silently rewrote case-sensitive promo codes
                            // (e.g. "Summer25" → "SUMMER25" → "code not found").
                            // Now we preserve the customer's casing and let the
                            // promo lookup decide whether the code is valid.
                            onChange={(e) => setPromoInput(e.target.value)}
                            placeholder={t('Enter code')}
                            aria-label={t('Promo code')}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                applyCode(
                                  promoInput,
                                  subtotal,
                                  (currentUser ?? guestUser)?.uid ?? '',
                                );
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              applyCode(promoInput, subtotal, (currentUser ?? guestUser)?.uid ?? '')
                            }
                            disabled={promoApplying || !promoInput.trim()}
                            className="btn btn-outline cp2-promo-apply"
                          >
                            {promoApplying ? '…' : t('Apply')}
                          </button>
                        </div>
                      )}
                      {promoError && <p className="cp2-promo-err">{promoError}</p>}
                    </div>

                    {/* Credit selector — signed-in customers only */}
                    {!isGuest && (
                      <CreditSelector
                        maxApplicable={afterPromo}
                        creditApplied={creditCapped}
                        onApply={(v, p) => {
                          setCreditApplied(v);
                          setCreditPoints(p);
                        }}
                        onRemove={() => {
                          setCreditApplied(0);
                          setCreditPoints(0);
                        }}
                      />
                    )}

                    {/* Card — Clover hosted fields. Skipped when credit / promo
                    covers the whole order. */}
                    <div className="card card-body">
                      <h3 className="cp2-h3">{t('Payment')}</h3>
                      {needsCard ? (
                        <CardPaymentForm ref={cardFormRef} amount={orderTotal} />
                      ) : (
                        <p className="cp2-howit-desc">
                          {t('Your credit covers this order — no card needed.')}
                        </p>
                      )}
                    </div>

                    {/* Step 2 → 3 navigation */}
                    <div className="co-step-nav">
                      <button
                        type="button"
                        onClick={goPrevStep}
                        className="btn btn-outline co-nav-back"
                      >
                        {t('← Back')}
                      </button>
                      <button
                        type="button"
                        onClick={goNextStep}
                        disabled={tokenizing}
                        className="btn btn-dark btn-lg co-nav-next"
                      >
                        {tokenizing ? (
                          t('Checking card…')
                        ) : (
                          <>
                            {t('Continue to Review')} <ChevronRight size={16} />
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}

                {/* Step 3 — Review (how it works + Place Order) */}
                {step === 'review' && (
                  <>
                    {/* Payment method */}
                    {needsCard && card && (
                      <div className="card card-body">
                        <h3 className="cp2-h3">{t('Paying with')}</h3>
                        <p className="cp2-howit-desc">
                          {card.brand ?? t('Card')}
                          {card.last4 ? ` ending ${card.last4}` : ''} —{' '}
                          <button
                            type="button"
                            className="cp2-promo-remove"
                            onClick={() => setStep('payment')}
                          >
                            {t('Change')}
                          </button>
                        </p>
                      </div>
                    )}

                    {/* How it works */}
                    <div className="card card-body co-howitworks">
                      <h3 className="cp2-h3 cp2-h3-howit">{t('How ordering works')}</h3>
                      <div className="cp2-howit-list">
                        {[
                          {
                            n: '1',
                            title: 'Place your order',
                            desc: t(
                              'We place a temporary hold of {amount} on your card. You are not charged yet.',
                              { amount: formatMoney(orderTotal) },
                            ),
                          },
                          {
                            n: '2',
                            title: 'We confirm stock',
                            desc: 'Our team checks every tea is in stock — usually within a few hours.',
                          },
                          {
                            n: '3',
                            title: 'Charged on confirmation',
                            desc: "Only then is your card charged. If we can't fill the order, the hold is released.",
                          },
                          {
                            n: '4',
                            title: fulfillmentMethod === 'pickup' ? 'Ready for pickup' : 'We ship',
                            desc:
                              fulfillmentMethod === 'pickup'
                                ? "We'll let you know when it's at the counter."
                                : "You'll get tracking as soon as it ships.",
                          },
                        ].map(({ n, title, desc }) => (
                          <div key={`step-${n}`} className="cp2-howit-row">
                            <div className="cp2-howit-num">{n}</div>
                            <div>
                              <p className="cp2-howit-title">{t(title)}</p>
                              <p className="cp2-howit-desc">{t(desc)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Step 3 → submit navigation */}
                    <div className="co-step-nav">
                      <button
                        type="button"
                        onClick={goPrevStep}
                        className="btn btn-outline co-nav-back"
                      >
                        {t('← Back')}
                      </button>
                      {/* The Place Order button on the right column does
                      the actual submit. Showing a hint here so review-
                      step users know where the action lives — visible
                      on mobile where the right column has wrapped
                      below the left column. */}
                      <span className="co-review-hint">
                        {tx('Review the summary on the right and click {action} when ready.', {
                          action: <strong>{t('Place Order')}</strong>,
                        })}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* ── Right: summary + CTA ────────────────────────────── */}
              <div className="lg:col-span-1">
                <div className="cp2-sticky-summary">
                  <CartSummary
                    items={items}
                    subtotal={subtotal}
                    promoDiscount={promoDiscount}
                    creditApplied={creditCapped}
                    ptsWillEarn={ptsWillEarn}
                    showItems={true}
                    showEarnBadge={true}
                    totalLabel="Total"
                    actualShippingFee={shippingFee}
                    fulfillmentMethod={fulfillmentMethod}
                  />
                  {/* Place Order is only enabled on the review step.
                      On earlier steps the button is hidden — the user
                      hasn't seen the final summary yet, and clicking
                      Place Order would skip the review check (per
                      Phase 6.5 — "can't advance without [validation
                      passing on each step]"). */}
                  {step === 'review' && (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn btn-dark btn-full btn-lg co-place-order"
                    >
                      {submitting
                        ? t('Placing order…')
                        : needsCard
                          ? t('Place Order — hold {amount}', { amount: formatMoney(orderTotal) })
                          : t('Place Order')}
                      {!submitting && <ChevronRight size={16} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
export default CheckoutPage;
