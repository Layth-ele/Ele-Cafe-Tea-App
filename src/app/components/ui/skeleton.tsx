/**
 * Skeleton.tsx — Phase 5 of the UI/UX roadmap
 *
 * Shape-matched skeleton primitives. The principle from Phase 5.2:
 *   "A spinner is a shrug. A skeleton is a promise."
 * The skeleton should match the SHAPE of what's coming — a tea card
 * skeleton looks like a tea card, a profile skeleton looks like a
 * profile. Spinners get used for actions that have NO post-state
 * shape (a refresh button, a pending API call mid-page).
 *
 * Why a namespace pattern (Skeleton.Card, Skeleton.Line):
 *   The shape variants are tightly coupled — they share the same
 *   shimmer animation, the same surface tokens, the same reduced-
 *   motion behavior. Putting them under one symbol means a glance
 *   at imports tells you "this file uses skeletons" instead of
 *   four separate import lines for four shapes. Same pattern as
 *   Radix UI primitives.
 *
 * What this REPLACES:
 *   - Bare <div className="skeleton" style={{...}} /> usages
 *     scattered across pages (orders-skeleton-row, products-grid-
 *     skeleton, etc). Phase 3 inline-style targets.
 *   - The thin shadcn-derived `Skeleton` (re-exported below for
 *     backward compatibility — anything still importing the
 *     default shape gets a working component).
 *
 * Reduced motion:
 *   The base `.skeleton` class shimmers via @keyframes shimmer. In
 *   `prefers-reduced-motion: reduce`, design.css's section 23
 *   already kills the animation — so RM users see a static gray
 *   block, which is the right behaviour (still communicates "data
 *   incoming," doesn't make their head hurt).
 *
 * Performance:
 *   Each skeleton is a single <div> + linear-gradient — cheap.
 *   Composite skeletons (Card, Table) are pure markup, no JS. We
 *   avoid the React.memo song-and-dance because skeletons are
 *   inherently throwaway: they render once during a Suspense
 *   fallback, then unmount when real content arrives.
 */
import type { CSSProperties } from 'react';
import { cn } from './utils';

import { useT } from '@/i18n/useT';
/* ─── Base block ────────────────────────────────────────────────── */

interface BaseProps {
  className?: string;
  style?: CSSProperties;
  /** Custom width as CSS length (defaults to 100%). */
  w?: string | number;
  /** Custom height as CSS length. */
  h?: string | number;
}

/** Plain rectangular pulse. Used as the base for everything else and
 * directly when you need a one-off block. Most callers should reach
 * for a higher-level shape (Line, Card, Avatar) instead. */
function Block({ className, style, w, h }: BaseProps) {
  // Use inline width/height when the caller passes them — these are
  // the ONLY two style props the skeleton accepts, and they're for
  // the kind of dynamic sizing CSS classes can't reasonably express
  // (matching a parent's grid cell, a fluid percentage, etc).
  // eslint-disable-next-line react/forbid-dom-props
  return <div className={cn('skeleton', className)} style={{ ...(w !== undefined ? { width: typeof w === 'number' ? `${w}px` : w } : {}), ...(h !== undefined ? { height: typeof h === 'number' ? `${h}px` : h } : {}), ...style }} aria-hidden="true" />;
}

/* ─── Line skeleton ─────────────────────────────────────────────── */

/** A single line of text. Default width 100%, height matches a body
 * line-height (16px tall + radius). Pass `w` to control the width
 * — common values are '60%', '40%', '80%' to suggest variable line
 * lengths in a paragraph. */
function Line({ w = '100%', h = 14, className }: BaseProps) {
  return <Block w={w} h={h} className={cn('sk-line', className)} />;
}

/* ─── Avatar skeleton ───────────────────────────────────────────── */

/** A round 40px avatar placeholder. Used in customer rows, comment
 * authors, etc. Pass `size` to override (in px). */
function Avatar({ size = 40, className }: { size?: number; className?: string }) {
  return <Block w={size} h={size} className={cn('sk-avatar', className)} />;
}

/* ─── Card skeleton ─────────────────────────────────────────────── */

/** A tea-card-shaped skeleton: image area on top, title + price
 * below. Matches the dimensions of the real `.tea-card` so the
 * layout doesn't shift when content arrives. */
function Card({ className }: { className?: string }) {
  return (
    <div className={cn('sk-card', className)} aria-hidden="true">
      <div className="sk-card-img skeleton" />
      <div className="sk-card-body">
        <div className="skeleton sk-card-title" />
        <div className="skeleton sk-card-sub" />
      </div>
    </div>
  );
}

/* ─── Table skeleton ────────────────────────────────────────────── */

/** A repeating-row table placeholder. Renders `rows` rows × `cols`
 * cells. Used in admin pages (orders, customers, products) and any
 * paginated list while the first page loads. */
function Table({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="sk-table" aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="sk-table-row">
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className="skeleton sk-table-cell" />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Page skeleton — Suspense fallback for routes ───────────────── */

/** Generic full-page skeleton used as the default Suspense fallback
 * for lazy routes. Closer to what the user is about to see than the
 * old `null` fallback (which caused a blank flash before the route
 * chunk's own loading state appeared). Centered, takes the full
 * viewport, gentle shimmer. */
function Page() {
  const t = useT();
  return (
    <div className="sk-page" role="status" aria-label={t('Loading page')}>
      <div className="sk-page-pulse" />
      <span className="sr-only">{t('Loading…')}</span>
    </div>
  );
}

/* ─── Public API ─────────────────────────────────────────────────── */

/** Default export kept for backward compatibility with existing
 * `import { Skeleton } from './ui/skeleton'` callers. New code
 * should reach for `Skeleton.Line` / `.Card` / `.Avatar` etc. */
export const Skeleton = Object.assign(Block, {
  Block,
  Line,
  Avatar,
  Card,
  Table,
  Page,
});
