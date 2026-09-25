/**
 * Step4Occasion.tsx — Pick an occasion (Step 4 of 6).
 *
 * Roadmap §6-step modal flow. The old Step 3 mixed occasion + names +
 * message in one form. Splitting them lets each step feel intentional
 * instead of "long form".
 *
 * Optional, with a prominent Skip:
 *   - canContinue is always true for this step (the modal enforces
 *     this; see GiftBuilderModal).
 *   - A large secondary "Skip — this gift doesn't need an occasion"
 *     button lives in the body, NOT a small "skip" link. The intent
 *     is that someone gifting "just because" feels permission to
 *     proceed without choosing.
 *   - Skip clears any previously-set occasion + customOccasion before
 *     advancing, so a user who picked one, changed their mind, and
 *     hit Skip doesn't carry a stale value into the cart.
 *
 * Larger icons: a `.gb-step4-occ` wrapper bumps the shared OccasionPicker
 * tiles (used elsewhere at default size) to dedicated-step proportions.
 * No prop changes on OccasionPicker — the visual change is pure CSS.
 */

import { ChevronRight } from 'lucide-react';
import { useGiftBuilderStore } from '@/store/giftBuilderStore';
import { OccasionPicker } from '@/app/components/gift-builder/components/OccasionPicker';

import { useT } from '@/i18n/useT';
export function Step4Occasion() {
  const t = useT();
  const personalization    = useGiftBuilderStore(s => s.personalization);
  const setPersonalization = useGiftBuilderStore(s => s.setPersonalization);
  const goToStep           = useGiftBuilderStore(s => s.goToStep);

  function handleSkip() {
    // Clear any previously-set occasion so an explicit Skip means
    // "no occasion at all" — not "leftover from before I changed my mind".
    setPersonalization({ occasion: '', customOccasion: '' });
    // Step 4 → 5 is always +1 (no skip rule applies between them), so
    // we don't need to ask the store's getNextStep helper here.
    goToStep(5);
  }

  return (
    <div className="gb-step4-stack">
      <div className="gb-step4-intro">
        <h3 className="gb-step4-h">
          {t('What\'s the occasion?')}
        </h3>
        <p className="gb-step4-sub">
          {t('Pick one — or skip if this gift is just because.')}
        </p>
      </div>

      <div className="gb-step4-occ">
        <OccasionPicker
          value={personalization.occasion}
          customValue={personalization.customOccasion}
          onChange={id => setPersonalization({ occasion: id })}
          onCustomChange={text => setPersonalization({ customOccasion: text })}
        />
      </div>

      {/* Prominent Skip — full-width secondary action below the grid.
          The footer's Continue is still the primary CTA; this is the
          equally-discoverable opt-out path. */}
      <button
        type="button"
        onClick={handleSkip}
        className="gb-step4-skip"
      >
        <span>{t('Skip — this gift doesn\'t need an occasion')}</span>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
