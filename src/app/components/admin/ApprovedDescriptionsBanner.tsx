/**
 * One-time banner (Admin → Products): applies the 75 longer tea
 * descriptions the owner approved, through the admin-only
 * applyApprovedTeaDescriptions function. Remove once applied.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { getFunctionsLazy } from '@/lib/firebase';

const DONE_KEY = 'ele:approvedDescriptionsApplied:v3';

export function ApprovedDescriptionsBanner() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(() => {
    try {
      return localStorage.getItem(DONE_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (done) return null;

  const apply = async () => {
    setBusy(true);
    try {
      const { functions, httpsCallable } = await getFunctionsLazy();
      const run = httpsCallable<
        unknown,
        { updated: number; already: number; skipped: string[]; frCleared: number }
      >(functions, 'applyApprovedTeaDescriptions');
      const { data } = await run({});
      const pairings = httpsCallable<unknown, { changed: string[] }>(
        functions,
        'applyPairingUpdates',
      );
      const { data: p } = await pairings({});
      if (p.changed.length) toast.success(`Pairings updated: ${p.changed.length}`);
      toast.success(
        `Descriptions updated: ${data.updated} changed${data.already ? `, ${data.already} already up to date` : ''}${data.frCleared ? `, ${data.frCleared} French versions being retranslated` : ''}. French updates in a minute or two.`,
      );
      if (data.skipped.length) {
        toast.message(`Left unchanged (edited since the draft): ${data.skipped.join(', ')}`);
      }
      try {
        localStorage.setItem(DONE_KEY, '1');
      } catch {
        /* storage blocked */
      }
      setDone(true);
    } catch (err) {
      console.error('[ApprovedDescriptionsBanner]', err);
      toast.error('Could not publish the descriptions — please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adb-banner" role="region" aria-label="Approved tea descriptions">
      <div>
        <strong>Updates ready for teas and café pairings.</strong>
        <p>
          Teas: removes the origin line and refreshes the French. Pairings: adds the 4 missing
          descriptions, calories for 12 pastries (typical values — replace with your supplier’s
          where you have them), fixes 3 typos and the Spiral Croissant / strudel links.
        </p>
      </div>
      <button type="button" className="btn btn-dark" onClick={apply} disabled={busy}>
        {busy ? 'Updating…' : 'Apply update'}
      </button>
    </div>
  );
}
