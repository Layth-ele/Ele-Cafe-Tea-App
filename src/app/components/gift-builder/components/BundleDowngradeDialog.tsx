/**
 * BundleDowngradeDialog.tsx — Confirmation when switching to a smaller bundle.
 *
 * Day 16. Spec lines 207–222: when the customer has 5 teas selected and
 * switches from Connoisseur's (5) to Curator's (3), warn before silently
 * dropping their selections. LIFO removal — last 2 added are removed.
 *
 * Reuses the shared ConfirmModal pattern from Modal.tsx but with custom
 * body content that lists the affected items.
 */

import { Modal, ModalBtn } from '@/app/components/modals/Modal';
import type { Product } from '@/types';
import type { Bundle } from '@/app/components/gift-builder/data/bundles';

import { useT, useTx } from '@/i18n/useT';
interface BundleDowngradeDialogProps {
  open:           boolean;
  onCancel:       () => void;
  onConfirm:      () => void;
  /** The bundle the user is switching TO — the smaller one. */
  targetBundle:   Bundle;
  droppedTeas:    Product[];
  droppedSamples: Product[];
}

export function BundleDowngradeDialog({
  open, onCancel, onConfirm, targetBundle, droppedTeas, droppedSamples,
}: BundleDowngradeDialogProps) {
  const tr = useT();
  const tx = useTx();
  const dropTeasCount    = droppedTeas.length;
  const dropSamplesCount = droppedSamples.length;
  const teaNames    = droppedTeas.map(t => t.name).join(', ');
  const sampleNames = droppedSamples.map(t => t.name).join(', ');

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={tr('Switch to {name}?', { name: tr(targetBundle.name) })}
      size="sm"
      footer={
        <>
          <ModalBtn variant="outline" onClick={onCancel}>{tr('Cancel')}</ModalBtn>
          <ModalBtn variant="primary" onClick={onConfirm}>
            {tr('Switch bundle')}
          </ModalBtn>
        </>
      }
    >
      <div className="bdd-body">
        <p className="bdd-p">
          {targetBundle.sampleCount > 0
            ? tr('The {bundle} includes {teas} and {samples}.', {
                bundle: tr(targetBundle.name),
                teas: tr(targetBundle.teaCount === 1 ? '{count} tea' : '{count} teas', { count: targetBundle.teaCount }),
                samples: tr(targetBundle.sampleCount === 1 ? '{count} sample' : '{count} samples', { count: targetBundle.sampleCount }),
              })
            : tr('The {bundle} includes {teas}.', {
                bundle: tr(targetBundle.name),
                teas: tr(targetBundle.teaCount === 1 ? '{count} tea' : '{count} teas', { count: targetBundle.teaCount }),
              })}
        </p>

        {dropTeasCount > 0 && (
          <p className="bdd-p-tight">
            {tx(dropTeasCount === 1 ? 'Your last tea selection {names} will be removed.' : 'Your last {count} tea selections {names} will be removed.', { count: dropTeasCount, names: <span className="bdd-em">({teaNames})</span> })}
          </p>
        )}
        {dropSamplesCount > 0 && (
          <p className="bdd-p-tight">
            {tx(dropSamplesCount === 1 ? 'Your last sample selection {names} will be removed.' : 'Your last {count} sample selections {names} will be removed.', { count: dropSamplesCount, names: <span className="bdd-em">({sampleNames})</span> })}
          </p>
        )}
        <p className="bdd-foot">
          {tr('Earlier selections are kept.')}
        </p>
      </div>
    </Modal>
  );
}
