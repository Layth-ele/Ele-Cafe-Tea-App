/**
 * StaleIndicator.tsx — Phase 5 stale-data signal
 *
 * Subtle indicator shown when Tanstack Query reports cached data is
 * being refetched in the background. Per the Phase 5 taxonomy:
 *
 *   Stale | Data is N seconds old (Tanstack Query gives you this)
 *         | Subtle — gray dot, "updating…" text
 *
 * Use when:
 *   - A Tanstack Query result has `isStale: true` AND `isFetching: true`
 *     (i.e. cache is showing while we re-fetch in the background).
 *   - The user is looking at meaningful displayed data and we don't
 *     want to interrupt with a loading state, but we do want to be
 *     honest that what they're seeing might be slightly out of date.
 *
 * Usage:
 *   const { data, isStale, isFetching } = useQuery({...});
 *   <StaleIndicator visible={isStale && isFetching} />
 *
 * Why a separate component (not inline JSX in every consumer):
 *   The visual treatment must be uniform — same color, same dot
 *   size, same animation, same accessibility wiring. Inlining the
 *   markup leads to inconsistent execution across pages. One
 *   component = one canonical look.
 *
 * Accessibility:
 *   - role="status" + aria-live="polite" so screen readers
 *     announce the change without interrupting reading.
 *   - The dot is decorative (aria-hidden); the text "Updating…" is
 *     the announceable content.
 *   - When `visible={false}`, the component returns null — no
 *     hidden node lurking in the DOM.
 *
 * Reduced motion:
 *   The dot pulses gently; in prefers-reduced-motion the pulse
 *   becomes a static dot.
 */
import { cn } from './utils';

interface StaleIndicatorProps {
  /** Whether the indicator is visible. Wire to
   *  `isStale && isFetching` from Tanstack Query, or any equivalent
   *  background-refresh signal. */
  visible: boolean;
  /** Optional override label. Defaults to "Updating…" — the
   *  industry-standard phrasing for this state. */
  label?: string;
  /** Optional className for layout (margin, position). */
  className?: string;
}

/**
 * Stale-data background-refresh indicator. Renders a small pulsing
 * dot + "Updating…" text. Returns null when not visible.
 */
export function StaleIndicator({ visible, label = 'Updating…', className }: StaleIndicatorProps) {
  if (!visible) return null;
  return (
    <span
      className={cn('stale-ind', className)}
      role="status"
      aria-live="polite"
    >
      <span className="stale-ind-dot" aria-hidden="true" />
      <span className="stale-ind-label">{label}</span>
    </span>
  );
}
