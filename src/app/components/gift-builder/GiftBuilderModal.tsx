/**
 * GiftBuilderModal.tsx — The top-level wizard shell.
 *
 * Roadmap §6-step modal flow. Wires six steps, the stepper, and the
 * footer into a single Modal (size="xxl"). Owns:
 *
 *   - canContinue gating per step (rules below)
 *   - Smart-skip routing: Step 3 (samples) is silently jumped over
 *     when bundle.sampleCount === 0 (Taster). The store's
 *     getNextStep/getPrevStep helpers encode the rule once; we just
 *     compose them with goToStep here so Back and Continue both
 *     honour it.
 *   - "Add to Cart" handler that builds an AddBundleInput and calls
 *     cartStore.addBundle(), then resets the wizard and opens the
 *     cart drawer (feeds into the existing checkout flow)
 *   - ESC / backdrop / X intercept on steps 2-6 → save-or-discard
 *     prompt (preserves state in localStorage either way)
 *   - Sign-out auto-close: when the user signs out mid-wizard, the
 *     modal closes silently. State stays in localStorage so a fresh
 *     login picks up where they left off.
 *
 * canContinue rules:
 *   - Step 1: bundleSlug !== null  (auto-advances on card click, so
 *             this is mostly defensive)
 *   - Step 2: selectedTeas.length === bundle.teaCount
 *   - Step 3: selectedSamples.length === bundle.sampleCount  (or
 *             skipped entirely if sampleCount === 0)
 *   - Step 4: always true — occasion is optional
 *   - Step 5: recipientName && senderName both non-empty
 *   - Step 6: always true (button switches to "Add to Cart")
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/app/components/modals/Modal';
import { useGiftBuilderStore, type WizardStep } from '@/store/giftBuilderStore';
import { useCartStore } from '@/store/cartStore';
import { useCartDrawer } from '@/store/cartDrawerStore';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/hooks/useSettings';
import { findBundle } from './data/bundles';
import { GiftBuilderStepper } from './GiftBuilderStepper';
import { GiftBuilderFooter }  from './GiftBuilderFooter';
import { Step1ChooseBundle }  from './steps/Step1ChooseBundle';
import { Step2PickTeas }      from './steps/Step2PickTeas';
import { Step3PickSamples }   from './steps/Step3PickSamples';
import { Step4Occasion }      from './steps/Step4Occasion';
import { Step5PersonalInfo }  from './steps/Step5PersonalInfo';
import { Step6Review }        from './steps/Step6Review';
import { toast } from 'sonner';
import { logGiftBuilderEvent } from '@/lib/giftBuilderEvents';

import { useT, tNow } from '@/i18n/useT';
const CART_DRAWER_OPEN_DELAY_MS = 240;
const CLOSE_CONFIRM_MESSAGE =
  'Close the gift builder? Your progress is saved — you can pick up where you left off when you come back.';

export function GiftBuilderModal() {
  const tr = useT();
  const isOpen          = useGiftBuilderStore(s => s.isOpen);
  const close           = useGiftBuilderStore(s => s.close);
  const reset           = useGiftBuilderStore(s => s.reset);
  const step            = useGiftBuilderStore(s => s.step);
  const goToStep        = useGiftBuilderStore(s => s.goToStep);
  const getNextStep     = useGiftBuilderStore(s => s.getNextStep);
  const getPrevStep     = useGiftBuilderStore(s => s.getPrevStep);
  const bundleSlug      = useGiftBuilderStore(s => s.bundleSlug);
  const selectedTeas    = useGiftBuilderStore(s => s.selectedTeas);
  const selectedSamples = useGiftBuilderStore(s => s.selectedSamples);
  const personalization = useGiftBuilderStore(s => s.personalization);

  const addBundle      = useCartStore(s => s.addBundle);
  const openCartDrawer = useCartDrawer(s => s.open);
  const { currentUser, isAdmin } = useAuth();

  // Defensive feature-flag gate. GiftsPage CTAs already disable themselves
  // when settings.giftBuilderEnabled is false and the user isn't an admin,
  // but if the wizard somehow opens (e.g. a cached call from a stale DOM
  // node), close it here too.
  const settings = useSettings();
  const featureEnabled = settings.giftBuilderEnabled || isAdmin;
  useEffect(() => {
    if (isOpen && !featureEnabled) close();
  }, [isOpen, featureEnabled, close]);

  const [submitting, setSubmitting] = useState(false);
  const lastStepLoggedRef = useRef<WizardStep | null>(null);
  const wasOpenRef = useRef(false);

  const track = React.useCallback(
    (event: Parameters<typeof logGiftBuilderEvent>[0], data: Record<string, unknown> = {}) => {
      void logGiftBuilderEvent(
        event,
        {
          step,
          bundleSlug,
          teasSelected: selectedTeas.length,
          samplesSelected: selectedSamples.length,
          ...data,
        },
        currentUser?.uid ?? null,
      );
    },
    [step, bundleSlug, selectedTeas.length, selectedSamples.length, currentUser?.uid],
  );

  useEffect(() => {
    if (!isOpen) {
      lastStepLoggedRef.current = null;
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    track('modal_opened');
  }, [isOpen, track]);

  useEffect(() => {
    if (!isOpen) return;
    if (lastStepLoggedRef.current === step) return;
    lastStepLoggedRef.current = step;
    track('step_viewed');
  }, [isOpen, step, track]);

  // ── canContinue per step ───────────────────────────────────────────────────
  const bundle = bundleSlug ? findBundle(bundleSlug) : null;
  const canContinue = useMemo<boolean>(() => {
    if (step === 1) return bundleSlug !== null;
    if (step === 2) {
      if (!bundle) return false;
      return selectedTeas.length === bundle.teaCount;
    }
    if (step === 3) {
      if (!bundle) return false;
      // Defensive: if we land here with no samples to pick (Taster), the
      // gate is trivially satisfied so Continue stays enabled.
      return selectedSamples.length === bundle.sampleCount;
    }
    if (step === 4) return true; // occasion optional — Skip button in body
    if (step === 5) {
      return personalization.recipientName.trim().length > 0 &&
             personalization.senderName.trim().length > 0;
    }
    return true; // step 6 — Add to Cart is the action
  }, [step, bundleSlug, bundle, selectedTeas.length, selectedSamples.length,
      personalization.recipientName, personalization.senderName]);

  // ── Furthest step the user can jump to via stepper clicks ─────────────────
  // Goes only as far as the canContinue chain holds. Auto-skip rule
  // applies: when sampleCount === 0, "passed Step 2" promotes the user
  // straight to Step 4-eligible (no Step 3 gate exists for them).
  const furthest = useMemo<WizardStep>(() => {
    if (!bundleSlug || !bundle) return 1;
    const teasFull = selectedTeas.length === bundle.teaCount;
    if (!teasFull) return 2;

    // Skip the samples gate entirely for Taster.
    if (bundle.sampleCount > 0 && selectedSamples.length !== bundle.sampleCount) {
      return 3;
    }
    // Step 4 (occasion) is optional — always passable. The next gate is
    // Step 5's required names.
    const namesFull =
      personalization.recipientName.trim().length > 0 &&
      personalization.senderName.trim().length    > 0;
    if (!namesFull) return 5;
    return 6;
  }, [bundleSlug, bundle, selectedTeas.length, selectedSamples.length,
      personalization.recipientName, personalization.senderName]);

  // ── Auto-close on sign-OUT (not "never signed in") ────────────────────────
  // Phase 19 — the previous version closed the modal whenever
  // `!currentUser`, which also fired on the *initial* open for guests
  // — so an unauthenticated visitor clicking "Build Your Tea Bundle"
  // saw the modal flicker and disappear with no explanation ("nothing
  // happened" UX). The sign-in prompt lives upstream in GiftsPage now;
  // this effect only handles the genuine mid-wizard sign-OUT case
  // (user was authenticated, then logged out in another tab / via
  // expiry). A ref tracks the previous auth state so we can detect
  // the true → false transition.
  const wasSignedInRef = useRef(false);
  useEffect(() => {
    if (currentUser) {
      wasSignedInRef.current = true;
      return;
    }
    // currentUser is null/undefined here. Only close if we previously
    // saw them signed in — otherwise this is just the initial guest
    // state and the upstream sign-in prompt is handling it.
    if (isOpen && wasSignedInRef.current) close();
  }, [currentUser, isOpen, close]);

  // ── Close intercept ───────────────────────────────────────────────────────
  // Steps 2-6 = real progress; warn before closing. Step 1 = nothing yet.
  function handleClose() {
    if (step === 1) {
      track('modal_closed', { source: 'step1_close' });
      close();
      return;
    }
    const ok = window.confirm(CLOSE_CONFIRM_MESSAGE);
    if (ok) {
      track('modal_closed', { source: 'confirm_close' });
      close();
    }
  }

  // ── Continue / Back ───────────────────────────────────────────────────────
  // Both delegate to the store's smart-skip helpers so the navigation
  // contract (skip Step 3 for sample-less bundles) lives in one place.
  function handleContinue() {
    if (step >= 6) return;
    const next = getNextStep(step);
    if (next === step) return;
    track('step_next_clicked');
    goToStep(next);
  }
  function handleBack() {
    if (step <= 1) return;
    const prev = getPrevStep(step);
    if (prev === step) return;
    track('step_back_clicked');
    goToStep(prev);
  }

  // ── Add to Cart ───────────────────────────────────────────────────────────
  async function handleAddToCart() {
    if (!bundle) return;
    setSubmitting(true);
    try {
      const heroImage = selectedTeas[0]?.image ?? '';

      addBundle({
        slug:           bundle.slug,
        name:           bundle.name,
        price:          bundle.price,
        image:          heroImage,
        hasFrenchPress: bundle.hasFrenchPress,
        teas: selectedTeas.map(t => ({
          id:     t.id ?? '',
          name:   t.name ?? '',
          image:  t.image ?? '',
          origin: t.origin,
        })),
        samples: selectedSamples.map(t => ({
          id:     t.id ?? '',
          name:   t.name ?? '',
          image:  t.image ?? '',
          origin: t.origin,
        })),
        personalization: {
          recipientName:  personalization.recipientName.trim(),
          senderName:     personalization.senderName.trim(),
          occasion:       personalization.occasion || '',
          customOccasion: personalization.customOccasion.trim(),
          message:        personalization.message.trim(),
          deliveryDate:   personalization.deliveryDate,
        },
      });

      toast.success(tNow('{name} added to cart', { name: tNow(bundle.name) }));
      track('add_to_cart_succeeded', { source: 'step6_add_to_cart', bundleSlug: bundle.slug });

      // Wipe the wizard and pop the cart drawer (existing checkout entry).
      // Order: reset BEFORE close so the modal doesn't briefly flash with
      // cleared state.
      reset();
      close();
      setTimeout(() => openCartDrawer(), CART_DRAWER_OPEN_DELAY_MS);
    } catch (err) {
      console.error('Add bundle to cart failed:', err);
      toast.error(tNow('Could not add to cart. Please try again.'));
      track('add_to_cart_failed', { source: 'step6_add_to_cart', bundleSlug: bundle.slug });
    } finally {
      setSubmitting(false);
    }
  }

  const stepBody = useMemo(() => {
    if (step === 1) return <Step1ChooseBundle />;
    if (step === 2) return <Step2PickTeas />;
    if (step === 3) return <Step3PickSamples />;
    if (step === 4) return <Step4Occasion />;
    if (step === 5) return <Step5PersonalInfo />;
    return <Step6Review />;
  }, [step]);

  if (!isOpen) return null;

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      size="xxl"
      title={tr('Build Your Bundle')}
      subtitle={bundle ? `${bundle.name} · $${bundle.price}` : 'Choose a bundle to begin'}
      footer={
        <GiftBuilderFooter
          step={step}
          canContinue={canContinue}
          onBack={handleBack}
          onContinue={handleContinue}
          onAddToCart={handleAddToCart}
          submitting={submitting}
        />
      }
    >
      <div className="stack-6">
        <div className="gbm-stepper-pad">
          <GiftBuilderStepper
            current={step}
            furthest={furthest}
            onJumpTo={goToStep}
          />
        </div>

        <div>{stepBody}</div>
      </div>
    </Modal>
  );
}
