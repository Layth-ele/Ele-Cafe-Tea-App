/**
 * TransitionLink — drop-in <Link> that wraps navigation in the
 * View Transitions API (Phase 4.5).
 *
 * Why: react-router's `<Link>` calls `navigate(to)` directly, which
 * triggers an immediate route swap. To get a smooth crossfade, the
 * swap needs to happen *inside* a `document.startViewTransition()`
 * callback so the browser can snapshot the outgoing DOM before
 * applying the new one.
 *
 * Drop-in replacement: same props as react-router's <Link>, just
 * intercepts the click. Modifier keys (cmd/ctrl/shift/alt) and
 * middle-click bypass the wrapper so opening in a new tab still
 * works correctly.
 *
 * Browsers without View Transitions support fall through to a
 * normal navigation — no error, no flash.
 *
 * Used by Navbar primary links + Footer links to satisfy the
 * Phase 4 success gate: "View Transitions on route changes;
 * reduced-motion respects."
 */

import { forwardRef } from 'react';
import { Link, type LinkProps, useNavigate } from 'react-router';
import { navigateWithTransition } from '@/lib/viewTransition';

type TransitionLinkProps = LinkProps & {
  /** Optional click handler. Runs BEFORE the navigation. Useful for
   *  closing drawers, recording analytics, etc. */
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

export const TransitionLink = forwardRef<HTMLAnchorElement, TransitionLinkProps>(
  function TransitionLink({ to, onClick, ...rest }, ref) {
    const navigate = useNavigate();

    return (
      <Link
        ref={ref}
        to={to}
        onClick={e => {
          onClick?.(e);
          if (e.defaultPrevented) return;
          // Bypass for new-tab / new-window intents.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          // Only handle string `to` (most call sites). For path objects
          // fall through to default <Link> behaviour.
          if (typeof to !== 'string') return;

          e.preventDefault();
          navigateWithTransition(() => navigate(to));
        }}
        {...rest}
      />
    );
  }
);
