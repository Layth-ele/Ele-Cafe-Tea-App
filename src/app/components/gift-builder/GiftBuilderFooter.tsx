/**
 * GiftBuilderFooter.tsx — Sticky footer with Back / Continue buttons.
 *
 * Step 6 (Review) swaps "Continue" for "Add to Cart" (gold, full-width
 * on mobile). The "Back" button is hidden on Step 1 since there's
 * nowhere to go back to. Step indices reflect the 6-step modal split
 * (UI_UX_ROADMAP_PHASE_0_6 §6-step modal flow).
 *
 * Reuses ModalBtn for the visual contract.
 */

import { ChevronLeft } from 'lucide-react';
import { ModalBtn } from '@/app/components/modals/Modal';
import type { WizardStep } from '@/store/giftBuilderStore';

import { useT } from '@/i18n/useT';
interface GiftBuilderFooterProps {
  step:           WizardStep;
  /** Whether the current step's "Continue" CTA is enabled. */
  canContinue:    boolean;
  onBack:         () => void;
  onContinue:     () => void;
  onAddToCart:    () => void;
  /** True while the cart write is in flight (Step 6 only). */
  submitting?:    boolean;
}

export function GiftBuilderFooter({
  step, canContinue, onBack, onContinue, onAddToCart, submitting,
}: GiftBuilderFooterProps) {
  const t = useT();
  const isFirst = step === 1;
  // Last step is now Step 6 (Review) after the 6-step split. See
  // UI_UX_ROADMAP_PHASE_0_6 §6-step modal flow — splitting the old
  // Step 2 (teas+samples) and Step 3 (occasion+names+message) bumped
  // the review from index 4 to 6.
  const isLast  = step === 6;

  return (
    <div className={`gbf-row ${isFirst ? 'gbf-row-first' : ''}`}>
      {!isFirst && (
        <button
          type="button"
          onClick={onBack}
          className="gbf-back-btn"
        >
          <ChevronLeft size={14} />
          {t('Back')}
        </button>
      )}

      {isLast ? (
        <ModalBtn
          variant="primary"
          onClick={onAddToCart}
          loading={submitting}
          disabled={!canContinue}
        >
          {t('Add to Cart')}
        </ModalBtn>
      ) : (
        <ModalBtn
          variant="primary"
          onClick={onContinue}
          disabled={!canContinue}
        >
          {t('Continue')}
        </ModalBtn>
      )}
    </div>
  );
}
