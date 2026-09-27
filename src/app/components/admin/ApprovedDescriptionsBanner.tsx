/**
 * One-time banner (Admin → Products): applies the 75 longer tea
 * descriptions the owner approved, through the admin-only
 * applyApprovedTeaDescriptions function. Remove once applied.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { getFunctionsLazy } from '@/lib/firebase';

const DONE_KEY = 'ele:approvedDescriptionsApplied:v2';

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
      const run = httpsCallable<unknown, { updated: number; already: number; skipped: string[] }>(
        functions,
        'applyApprovedTeaDescriptions',
      );
      const { data } = await run({});
      toast.success(
        `Descriptions updated: ${data.updated} changed${data.already ? `, ${data.already} already up to date` : ''}. French versions update in a minute.`,
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
        <strong>Update ready: remove the origin line from tea descriptions.</strong>
        <p>
          Removes “Grown in… / Sourced from…” from 26 descriptions (origin and region already show
          in Tea Details).
        </p>
      </div>
      <button type="button" className="btn btn-dark" onClick={apply} disabled={busy}>
        {busy ? 'Updating…' : 'Apply update'}
      </button>
    </div>
  );
}
