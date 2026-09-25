/**
 * GiftBuilderStepper.tsx — Progress indicator at the top of the modal.
 *
 * Roadmap §6-step modal flow. Six numbered dots with labels:
 *   Bundle / Teas / Samples / Occasion / Personalize / Review
 *
 * Smart-skip: when the active bundle has `sampleCount === 0` (the Taster),
 * the Samples dot is hidden and the line + remaining dots reflow as a
 * 5-dot stepper. The user never sees an empty "pick your samples"
 * screen and never sees the dot that would lead them there.
 *
 * Inline-style fix: the progress-line width used to be
 * `style={{ width: \`calc(...)\` }}` on the fill element. It's now a CSS
 * custom property `--gbp-progress` set on the root and consumed by
 * `.gbs-line-fill` in design.css. The container's inline style is the
 * documented escape hatch for dynamic CSS values (eslint.config.js §137
 * "CSS custom properties — pass a token via inline style") — different
 * from setting `width` directly because the layout property still lives
 * in CSS where it can be themed, transitioned, and respect
 * `prefers-reduced-motion`.
 */

import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { WizardStep } from '@/store/giftBuilderStore';
import { useGiftBuilderStore } from '@/store/giftBuilderStore';
import { findBundle } from './data/bundles';

import { useT } from '@/i18n/useT';
interface GiftBuilderStepperProps {
  current:    WizardStep;
  /** Furthest step reached. Steps beyond this are disabled. */
  furthest:   WizardStep;
  onJumpTo:   (step: WizardStep) => void;
}

const ALL_STEPS: ReadonlyArray<{ n: WizardStep; label: string }> = [
  { n: 1, label: 'Bundle' },
  { n: 2, label: 'Teas' },
  { n: 3, label: 'Samples' },
  { n: 4, label: 'Occasion' },
  { n: 5, label: 'Personalize' },
  { n: 6, label: 'Review' },
];

export function GiftBuilderStepper({
  current, furthest, onJumpTo,
}: GiftBuilderStepperProps) {
  const t = useT();
  const bundleSlug = useGiftBuilderStore(s => s.bundleSlug);

  // Hide the Samples dot when the active bundle has no samples to pick.
  // Until a bundle is selected, show all six dots (the user hasn't yet
  // narrowed which flow they're on).
  const skipSamples = bundleSlug ? findBundle(bundleSlug).sampleCount === 0 : false;
  const visibleSteps = useMemo(
    () => ALL_STEPS.filter(s => !(skipSamples && s.n === 3)),
    [skipSamples],
  );

  // Progress is a unit-interval ratio (0..1). The fill width is
  // `(100% - 24%) * var(--gbp-progress)` in CSS so the line ends
  // exactly under the last dot regardless of how many are visible.
  //
  // Note: when skipSamples is true the user can never *be* on step 3,
  // so `currentVisibleIdx` is always defined.
  const currentVisibleIdx = Math.max(0, visibleSteps.findIndex(s => s.n === current));
  const progress = visibleSteps.length <= 1
    ? 0
    : currentVisibleIdx / (visibleSteps.length - 1);
  const currentLabel = visibleSteps[currentVisibleIdx]?.label ?? '';

  return (
    <div
      className="gbs-root"
      // eslint-disable-next-line react/forbid-dom-props -- CSS custom property; dynamic per step. Width is computed in CSS via `var(--gbp-progress)` on .gbs-line-fill. See eslint.config.js §137 ("CSS custom properties — pass a token via inline style").
      style={{ '--gbp-progress': progress } as React.CSSProperties}
    >
      {/* Phase 16 — mobile-only header. Replaces the cramped row of
          6 sub-10px labels below the dots with a single elegant
          "Step X of Y · Bundle" line above them. Hidden on tablet+ where
          per-dot labels have room to breathe. aria-live so screen-reader
          users hear the new step name on each jump. */}
      <div className="gbs-current-step" aria-live="polite">
        <span className="gbs-current-step-meta">
          {t('Step {n} of {total}', { n: currentVisibleIdx + 1, total: visibleSteps.length })}
        </span>
        <span className="gbs-current-step-sep" aria-hidden="true">·</span>
        <span className="gbs-current-step-label">{t(currentLabel)}</span>
      </div>

      <div className="gbs-dots-row">
        {/* Connecting line — sits behind the dots */}
        <div className="gbs-line"/>
        <div className="gbs-line-fill"/>

        {visibleSteps.map(({ n, label }) => {
          const isComplete  = n < current;
          const isCurrent   = n === current;
          const isClickable = n <= furthest && !isCurrent;
          const state: 'complete' | 'current' | 'future' | 'available' =
            isComplete ? 'complete' : isCurrent ? 'current' : (n > furthest ? 'future' : 'available');

          return (
            <button
              key={n}
              type="button"
              onClick={isClickable ? () => onJumpTo(n) : undefined}
              disabled={!isClickable}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={t('Step {n}: {label}', { n, label: t(label) }) + (isComplete ? ` ${t('(completed)')}` : isCurrent ? ` ${t('(current)')}` : '')}
              className="gbs-step"
              data-state={state}
            >
              <span className="gbs-dot" data-state={state}>
                {isComplete ? <Check size={14} strokeWidth={3} /> : n}
              </span>
              <span className="gbs-label" data-state={state}>
                {t(label)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
