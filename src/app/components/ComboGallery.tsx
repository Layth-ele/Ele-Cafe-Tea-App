/**
 * ComboGallery — global "Pairs with our tea" carousel.
 *
 * Customer view, rendered on every tea profile page between the
 * "Enjoy at Ele Café" section and "Reviews". Self-contained — pulls
 * its own data via `useComboGallery`. Hidden when the global feature
 * flag is off OR when there are no enabled items.
 *
 * The admin counterpart is a separate component
 * (`src/app/components/admin/ComboGalleryAdmin.tsx`) used inside the
 * Admin Settings page.
 *
 * Style — "luxury / modern":
 *   • 2.8 s auto-advance (faster than the original 4.5 s — covers
 *     more pairings per visit without feeling rushed)
 *   • cross-fade between images with a subtle Ken-Burns zoom on the
 *     active slide
 *   • frosted-glass overlay panel bottom-left with title + description
 *   • price chip in dark surface w/ white text — flips automatically
 *     in dark mode via the --price-chip-* tokens
 *   • dot pagination + arrow keys + swipe (touch) — pause on hover
 *   • respects `prefers-reduced-motion` → static current image, no
 *     auto-advance, no Ken-Burns
 *   • optional `teaName` prop personalises the section header to
 *     "Try this tea — {teaName}" so customers see context
 *   • optional share-buttons strip below the carousel (was previously
 *     in the "Enjoy at Ele Café" section; consolidated here)
 *
 * Layout: container max-width 800px so this section visually aligns
 * with the "Enjoy at Ele Café" card directly above. Anything wider
 * makes the page rhythm feel broken on tea profiles.
 *
 * Data shape (per item, see /src/schemas/comboGallery.schema.ts):
 *   { imageUrl, storagePath, title, description, price, currency,
 *     order, enabled, ... }
 *
 * Storage: flat collection /comboGalleryItems/{auto-id}, ordered by
 * the `order` integer field. The flat path keeps Firestore rules and
 * queries simple (vs a nested path).
 */
import { DietBadges, caloriesText } from '@/app/components/DietBadges';
import { registerImageVariants } from '@/lib/imageRegistry';
import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Link2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useSettings } from '@/hooks/useSettings';
import { ShareButtons } from './ShareButtons';
import type { ComboItem } from '@/schemas/comboGallery.schema';

import { useT, useTx, tNow, localizeCombo, useLang } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
// ── Public hook ──────────────────────────────────────────────────────────────
/**
 * Live list of combo items + the global feature flag. Subscribes to
 * `/comboGalleryItems` via `onSnapshot` so admin edits show up without
 * a page reload. Filters to enabled items only — the admin uses its
 * own non-filtered query.
 */
export function useComboGallery(): {
  enabled: boolean;
  items: ComboItem[];
  loading: boolean;
} {
  const settings = useSettings();
  const [items, setItems] = useState<ComboItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Skip the subscription entirely when the feature is off — saves a
    // Firestore read on every page load for stores that aren't using
    // it.
    if (!settings.comboGalleryEnabled) {
      setLoading(false);
      setItems([]);
      return;
    }
    const q = query(collection(db, 'comboGalleryItems'), orderBy('order', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs
          .map((d) => {
            const raw = d.data();
            registerImageVariants(raw.imageUrl, raw.imageVariants);
            return { id: d.id, ...raw } as ComboItem;
          })
          // Only render items that are enabled AND have a real uploaded
          // image. Combo items without an imageUrl (shouldn't happen —
          // schema requires it — but defense in depth) are skipped
          // rather than showing a broken image to customers.
          .filter(
            (i) =>
              i.enabled !== false && typeof i.imageUrl === 'string' && i.imageUrl.trim().length > 0,
          );
        setItems(next);
        setLoading(false);
      },
      (err) => {
        console.error('[ComboGallery] subscription failed:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [settings.comboGalleryEnabled]);

  return { enabled: settings.comboGalleryEnabled, items, loading };
}

// ── Reduced-motion hook ──────────────────────────────────────────────────────
function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefers(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefers(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return prefers;
}

// ── Auto-advance hook ────────────────────────────────────────────────────────
/**
 * Advances the index every `intervalMs`. Pauses while `paused` is
 * true (e.g. on hover, while a manual interaction is happening).
 * Resets the timer whenever `manualJumpSignal` changes — so dot/arrow
 * nav doesn't leave a half-second of leftover timer.
 *
 * The returned `index` is always clamped to `count` synchronously
 * during render — so when an item is removed in real time (admin
 * disables a combo while the customer is viewing it), the customer
 * doesn't see a single frame of `items[stale-index] === undefined`
 * which would unmount and remount the section. Phase 12 fix.
 */
function useAutoAdvance(
  count: number,
  intervalMs: number,
  paused: boolean,
  manualJumpSignal: number,
): { index: number; jumpTo: (i: number) => void } {
  const [rawIndex, setRawIndex] = useState(0);

  // Synchronous clamp during render. Always in `[0, count)` (or 0 if count==0).
  const index = count > 0 ? ((rawIndex % count) + count) % count : 0;

  const jumpTo = useCallback(
    (i: number) => {
      if (count === 0) return;
      setRawIndex(((i % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (count < 2 || paused) return;
    const id = setInterval(() => {
      setRawIndex((prev) => (prev + 1) % count);
    }, intervalMs);
    return () => clearInterval(id);
  }, [count, intervalMs, paused, manualJumpSignal]);

  return { index, jumpTo };
}

// ── Price formatter (CAD default) ────────────────────────────────────────────
// Prices are CAD: the site's own format ("$9.25" / "9,25 $"), not
// Intl's "CA$9.25".
function formatPrice(price: number, _currency = 'CAD'): string {
  return formatMoney(price);
}

// ── Component ────────────────────────────────────────────────────────────────
const AUTO_ADVANCE_MS = 2800;

export function ComboGallery({
  title = 'Pairs with our tea',
  teaName,
  shareUrl,
}: {
  title?: string;
  /** When set, renders a personalised "Try this tea — {teaName}" overline
   *  and a friendlier subhead ("Pair it with one of our premium baking
   *  goods"). When omitted, falls back to the generic header. */
  teaName?: string;
  /** When set, the share strip at the bottom uses this URL (typically
   *  the current page). Pass `window.location.href` from the parent
   *  page on mount. Omitting hides the share strip. */
  shareUrl?: string;
} = {}) {
  const tr = useT();
  const lang = useLang();
  const tx = useTx();
  const { enabled, items, loading } = useComboGallery();
  const reducedMotion = usePrefersReducedMotion();
  const [hovered, setHovered] = useState(false);
  // WCAG 2.2.2 — user-controlled pause. Keyboard-only users who haven't
  // tabbed into the carousel yet need a visible pause control; the
  // hover/focus auto-pause alone doesn't satisfy 2.2.2. Defaults to
  // playing because the carousel is decorative cross-sell, not primary
  // content — but the user can stop it at any time.
  const [userPaused, setUserPaused] = useState(false);
  const [manualSignal, setManualSignal] = useState(0);

  const paused = hovered || reducedMotion || userPaused;
  const { index, jumpTo } = useAutoAdvance(items.length, AUTO_ADVANCE_MS, paused, manualSignal);

  const goTo = useCallback(
    (i: number) => {
      jumpTo(i);
      setManualSignal((s) => s + 1);
    },
    [jumpTo],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (items.length < 2) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(index + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(index - 1);
      }
    },
    [goTo, index, items.length],
  );

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goTo(index + 1);
      else goTo(index - 1);
    }
  };

  if (!enabled || loading || items.length === 0) return null;

  const current = items[index];
  if (!current) return null;

  return (
    <section className="cg-section" aria-label={title}>
      <div className="cg-inner">
        {/* ── Section header ───────────────────────────────────────────── */}
        <div className="cg-header">
          <p className="cg-eyebrow">{tr('Curated pairings')}</p>
          <h2 className="cg-h2">
            {teaName
              ? tx('Try this tea — {tea}', { tea: <em className="cg-tea-em">{teaName}</em> })
              : title}
          </h2>
          {teaName && (
            <p className="cg-sub">
              {tr('Pair it with one of our premium baking goods — browse the gallery below.')}
            </p>
          )}
          <div className="cg-rule" />
        </div>

        {/* ── Carousel ─────────────────────────────────────────────────── */}
        {/* Mobile layout (stacked image-over-text) is handled by the
            @media (max-width: 599px) block in src/styles/design.css.
            See the "cg-* mobile" section there. */}
        <div
          className="cg-carousel"
          tabIndex={0}
          role="group"
          aria-roledescription="carousel"
          aria-label={tr('{title} — slide {n} of {total}', {
            title,
            n: index + 1,
            total: items.length,
          })}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          onKeyDown={onKeyDown}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Image stack — desktop: positioned absolutely; mobile: flex item */}
          <div className="cg-img-stack">
            {/* Cross-fade slide stack */}
            {items.map((item, i) => {
              const isActive = i === index;
              return (
                <div
                  key={item.id ?? i}
                  aria-hidden={!isActive}
                  className="cg-slide"
                  data-active={isActive ? 'true' : 'false'}
                  data-reduced={reducedMotion ? 'true' : 'false'}
                >
                  <img
                    src={item.imageUrl}
                    alt={localizeCombo(item, lang).title}
                    loading={isActive ? 'eager' : 'lazy'}
                    decoding="async"
                    className="cg-slide-img"
                    data-active={isActive ? 'true' : 'false'}
                    data-reduced={reducedMotion ? 'true' : 'false'}
                  />
                  {/* Gentle gradient veil for text legibility */}
                  <div className="cg-img-veil" />
                </div>
              );
            })}
          </div>

          {/* Pause / Play toggle — WCAG 2.2.2 satisfaction.
              Only rendered when 2+ items (single-slide has nothing to
              rotate) AND when reduced-motion isn't on (in which case
              auto-rotate is already disabled). The button mirrors the
              user-paused state so the label stays in sync. */}
          {items.length > 1 && !reducedMotion && (
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused ? tr('Resume auto-rotation') : tr('Pause auto-rotation')}
              aria-pressed={userPaused}
              className="cg-playpause-btn"
            >
              {userPaused ? (
                <>
                  <Play size={13} aria-hidden /> {tr('Play')}
                </>
              ) : (
                <>
                  <Pause size={13} aria-hidden /> {tr('Pause')}
                </>
              )}
            </button>
          )}

          {/* Per-slide share-link button — top-right corner, only when
              the current combo has a slug (i.e. has a /pairings/{slug}
              landing page). Quick path for customers to share a
              specific pairing to IG/friends without leaving the carousel. */}
          {current.slug && (
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/pairings/${current.slug}`;
                navigator.clipboard.writeText(url).then(
                  () => toast.success(tNow('Pairing link copied!')),
                  () => toast.error(tNow('Could not copy link')),
                );
              }}
              aria-label={tr('Copy share link for {name}', {
                name: localizeCombo(current, lang).title,
              })}
              className="cg-share-btn"
            >
              <Link2 size={13} aria-hidden /> {tr('Share')}
            </button>
          )}

          {/* Frosted overlay — title / description / price */}
          <div className="cg-frosted" aria-live="polite" aria-atomic="true">
            <div className="cg-frosted-text">
              <DietBadges item={current} variant="onDark" />
              <h3 className="cg-frosted-title">{localizeCombo(current, lang).title}</h3>
              <p className="cg-frosted-desc">{localizeCombo(current, lang).description}</p>
            </div>
            <div className="price-stack">
              <span className="price-combo">{tr('Combo · with tea or Americano')}</span>
              <div className="price-group">
                <div className="cg-price-chip">
                  {formatPrice(current.price, current.currency || 'CAD')}
                </div>
                {caloriesText(current) && (
                  <span className="price-cal">{caloriesText(current)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Prev / Next — visible on hover, always reachable by keyboard */}
          {items.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                aria-label={tr('Previous slide')}
                className="cg-arrow-btn cg-arrow-btn-left"
                data-hovered={hovered ? 'true' : 'false'}
              >
                <ArrowSvg dir="left" />
              </button>
              <button
                type="button"
                onClick={() => goTo(index + 1)}
                aria-label={tr('Next slide')}
                className="cg-arrow-btn cg-arrow-btn-right"
                data-hovered={hovered ? 'true' : 'false'}
              >
                <ArrowSvg dir="right" />
              </button>
            </>
          )}
        </div>

        {/* ── Dot pagination ───────────────────────────────────────────── */}
        {items.length > 1 && (
          <div role="tablist" aria-label={tr('{title} pagination', { title })} className="cg-dots">
            {items.map((it, i) => {
              const active = i === index;
              return (
                <button
                  key={it.id ?? i}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={tr('Go to slide {n}: {name}', {
                    n: i + 1,
                    name: localizeCombo(it, lang).title,
                  })}
                  onClick={() => goTo(i)}
                  className="cg-dot"
                  data-active={active ? 'true' : 'false'}
                />
              );
            })}
          </div>
        )}

        {/* ── Share strip ──────────────────────────────────────────────────
            Moved here from the "Enjoy at Ele Café" card so the share
            action sits at the bottom of the page rhythm, after the
            customer has seen both serving suggestions and pairings.
            Only renders when both teaName + shareUrl are set (i.e.,
            from a tea profile page that opted in). */}
        {teaName && shareUrl && <ShareStrip teaName={teaName} url={shareUrl} />}
      </div>
    </section>
  );
}

// ── ShareStrip ───────────────────────────────────────────────────────────────
function ShareStrip({ teaName, url }: { teaName: string; url: string }) {
  const t = useT();
  return (
    <div className="cg-share-strip">
      <p className="cg-share-strip-eyebrow">{t('Share this pairing')}</p>
      <ShareButtons title={teaName} url={url} size="sm" />
    </div>
  );
}

function ArrowSvg({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d={dir === 'left' ? 'M10 12 6 8l4-4' : 'M6 4l4 4-4 4'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Re-export the shape so consumers don't need to drill into the schema.
export type { ComboItem } from '@/schemas/comboGallery.schema';
