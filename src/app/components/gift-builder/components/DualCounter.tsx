
import { useT } from '@/i18n/useT';/**
 * DualCounter.tsx — "Teas: 2 of 3 ●●○ · Samples: 0 of 2 ○○" indicator
 * for Step 2 of the gift-builder wizard.
 *
 * Day 16. Renders both counters side-by-side on desktop, stacked on
 * narrow viewports. Filled dots = selected, hollow dots = remaining.
 */


interface DualCounterProps {
  teasSelected:    number;
  teasMax:         number;
  samplesSelected: number;
  samplesMax:      number;
}

function Dots({ filled, total }: { filled: number; total: number }) {
  // Capped at 7 dots — Signature Bundle is the largest tier; if a future
  // bundle exceeds this, swap to a numeric "n/m" with no dots.
  return (
    <span className="dc-dots">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className="dc-dot" data-filled={i < filled ? 'true' : 'false'}/>
      ))}
    </span>
  );
}

export function DualCounter({
  teasSelected, teasMax, samplesSelected, samplesMax,
}: DualCounterProps) {
  const t = useT();
  // Symmetric show-flags so each step can show exactly the counter
  // that's relevant to it: Step 2 passes samplesMax=0 to hide samples,
  // Step 3 passes teasMax=0 to hide teas. The roadmap §6-step modal
  // flow specifies "DualCounter shows single counter" — this is how.
  const showTeas    = teasMax > 0;
  const showSamples = samplesMax > 0;

  return (
    <div className="dc-pill-group">
      {showTeas && (
        <CounterPill
          label={t('Teas')}
          selected={teasSelected}
          max={teasMax}
        />
      )}
      {showSamples && (
        <CounterPill
          label={t('Samples')}
          selected={samplesSelected}
          max={samplesMax}
        />
      )}
    </div>
  );
}

function CounterPill({ label, selected, max }: { label: string; selected: number; max: number }) {
  const t = useT();
  const complete = selected >= max;
  return (
    <span className="dc-pill" data-complete={complete ? 'true' : 'false'}>
      <span className="dc-label">
        {label}:
      </span>
      <span className="dc-counter">
        {selected} <span className="dc-of">{t('of')}</span> {max}
      </span>
      <Dots filled={selected} total={max} />
    </span>
  );
}
