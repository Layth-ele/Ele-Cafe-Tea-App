/**
 * viewTransition.ts — Phase 4.5 of the UI/UX roadmap
 *
 * Thin wrapper around the View Transitions API that gives us native
 * crossfades on route changes for the cost of one capability check.
 * Browsers that ship the API (Chromium 111+, Safari 18+; ~94%
 * globally as of 2026) get a smooth fade; everyone else gets the
 * instant navigation they had before. Zero deps, zero JS animation
 * loops, zero risk on un-supporting browsers — the feature
 * gracefully no-ops.
 *
 * Companion CSS is in design.css under the
 * "VIEW TRANSITIONS — Phase 4.5" header. That file declares the
 * keyframes for ::view-transition-old(root) and
 * ::view-transition-new(root) that this helper triggers.
 *
 * Reduced motion:
 *   The CSS layer is wrapped in @media (prefers-reduced-motion:
 *   reduce) → animation: none. So the API still fires, but the
 *   crossfade duration drops to ~0 — visually instant, which is
 *   exactly what RM users want.
 *
 * Why not use react-router's `unstable_viewTransition`:
 *   That feature exists but at the time of writing requires
 *   opting in route-by-route on every <Link>. Our solution wraps
 *   the imperative navigate() call and applies to ALL transitions
 *   automatically. Less code, no per-link bookkeeping.
 */
import { useNavigate } from 'react-router';

type DocWithVT = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => unknown;
};

/** Invoke a navigate callback inside a View Transition if the
 *  browser supports it; fall through to direct invocation otherwise.
 *
 *  Usage:
 *    const navigate = useNavigate();
 *    navigateWithTransition(() => navigate('/products'));
 */
export function navigateWithTransition(navigateFn: () => void): void {
  if (typeof document === 'undefined') {
    // SSR / non-browser path. Run the callback directly.
    navigateFn();
    return;
  }

  // Respect prefers-reduced-motion: we still trigger the View
  // Transition (the CSS layer disables the animation anyway), but
  // tasks like a screen-reader's announce-on-route-change happen
  // synchronously rather than waiting for the (now-zero-length)
  // transition to finish.
  const doc = document as DocWithVT;
  if (typeof doc.startViewTransition !== 'function') {
    navigateFn();
    return;
  }

  try {
    doc.startViewTransition(navigateFn);
  } catch (err) {
    // Defensive: if the API throws (e.g. an active concurrent
    // transition), fall back to plain navigate. Better to lose the
    // crossfade than to drop the navigation.
    console.warn('[viewTransition] startViewTransition failed:', err);
    navigateFn();
  }
}

/**
 * React-friendly hook wrapper. Returns a function with the same
 * signature as react-router's `navigate`, but routed through
 * navigateWithTransition.
 *
 * Example:
 *   const navigate = useTransitionNavigate();
 *   navigate('/products/black');
 *
 * Note: this only wraps imperative navigations. <Link> clicks still
 * use react-router's default behavior — and that's fine, because
 * react-router 7.x auto-applies View Transitions to clicks in
 * supported browsers. Use this hook for `onSelect` callbacks,
 * post-mutation redirects, and other code-driven jumps.
 */
export function useTransitionNavigate() {
  const navigate = useNavigate();
  return (to: string) => navigateWithTransition(() => navigate(to));
}
