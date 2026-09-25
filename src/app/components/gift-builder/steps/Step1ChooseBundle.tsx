/**
 * Step1ChooseBundle.tsx — First step of the gift-builder wizard.
 *
 * Day 16. 2x2 grid of bundle cards on desktop, single column on mobile.
 * Selecting a card auto-advances to Step 2 (per spec line 76: "fewer
 * clicks").
 *
 * If the user is changing their mind on a previously-selected bundle
 * AND has selections that would overflow the new bundle, the
 * BundleDowngradeDialog appears first. Confirmed → applyBundle() trims
 * and advances. Cancelled → no change.
 */

import { useState } from 'react';
import { useGiftBuilderStore } from '@/store/giftBuilderStore';
import { BUNDLES, findBundle, type BundleSlug } from '@/app/components/gift-builder/data/bundles';
import { BundleCard } from '@/app/components/gift-builder/components/BundleCard';
import { BundleDowngradeDialog } from '@/app/components/gift-builder/components/BundleDowngradeDialog';
import type { Product } from '@/types';

import { useT } from '@/i18n/useT';
export function Step1ChooseBundle() {
  const t = useT();
  const bundleSlug          = useGiftBuilderStore(s => s.bundleSlug);
  const previewBundleChange = useGiftBuilderStore(s => s.previewBundleChange);
  const applyBundle         = useGiftBuilderStore(s => s.applyBundle);
  const goToStep            = useGiftBuilderStore(s => s.goToStep);

  // Pending downgrade preview. When non-null, the dialog shows.
  const [pending, setPending] = useState<{
    slug:           BundleSlug;
    droppedTeas:    Product[];
    droppedSamples: Product[];
  } | null>(null);

  function handleSelect(slug: BundleSlug) {
    if (slug === bundleSlug) {
      // Re-clicking the current bundle just advances to step 2 — useful
      // when the user has come back to step 1 only to look at the
      // alternatives and now wants to keep their choice.
      goToStep(2);
      return;
    }

    const preview = previewBundleChange(slug);
    if (preview.droppedTeas.length === 0 && preview.droppedSamples.length === 0) {
      // No collision — apply and advance.
      applyBundle(slug);
      goToStep(2);
      return;
    }

    // Collision — gate behind the confirm dialog.
    setPending({ slug, ...preview });
  }

  function confirmDowngrade() {
    if (!pending) return;
    applyBundle(pending.slug);
    setPending(null);
    goToStep(2);
  }

  return (
    <div>
      {/* Intro paragraph — sets the stage. Spec doesn't mandate this but
         the bare grid feels abrupt; one line gives the modal a sense of
         place. */}
      <p className="step1-intro">
        {t('Pick a bundle size to begin. You\'ll choose the teas yourself in the next step.')}
      </p>

      <div className="grid-auto-220">
        {BUNDLES.map(b => (
          <BundleCard
            key={b.slug}
            bundle={b}
            selected={b.slug === bundleSlug}
            onSelect={() => handleSelect(b.slug)}
          />
        ))}
      </div>

      {pending && (
        <BundleDowngradeDialog
          open
          targetBundle={findBundle(pending.slug)}
          droppedTeas={pending.droppedTeas}
          droppedSamples={pending.droppedSamples}
          onCancel={() => setPending(null)}
          onConfirm={confirmDowngrade}
        />
      )}
    </div>
  );
}
