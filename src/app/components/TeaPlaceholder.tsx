/**
 * TeaPlaceholder
 *
 * Pure-SVG fallback rendered anywhere a tea / product / bundle image
 * would normally appear but no upload exists yet OR the network fetch
 * failed. Displays the tea name (passed as `label`) prominently, with
 * a softly-blurred gold cup motif behind it — so the placeholder
 * communicates context ("this is the Assam tea card, it just doesn't
 * have a photo yet") instead of looking like a generic broken image.
 *
 * Used by:
 *   • LazyImage  — when src is empty or fails to load
 *   • ComboGallery — when a combo item's imageUrl is empty
 *
 * Renders absolute-positioned to fill the parent. The parent must be
 * `position: relative` (LazyImage already provides this).
 *
 * Design notes:
 *   • Background: a 135deg cream → surface gradient — keeps it warm
 *     and on-brand vs a flat grey hole.
 *   • Behind the text: the same cup motif as before, but scaled big
 *     (90% of the container), low opacity (~0.22), and blurred via
 *     CSS filter — reads as a wash, not a pictogram.
 *   • Foreground: the tea name in the brand serif, gold-text colour
 *     so it contrasts against the cream. Auto-shrinks font for long
 *     names so "Margaret's Hope Darjeeling" doesn't break the layout.
 *   • `subtle` prop — for very small thumbnails (≤80px square)
 *     where text would be unreadable, we skip the text and just
 *     show the blurred cup at higher opacity.
 *   • Fully theme-aware: every colour goes through CSS variables
 *     so dark mode flips automatically.
 */
import { memo } from 'react';

import { useT } from '@/i18n/useT';
interface TeaPlaceholderProps {
  /** Display name shown over the blurred motif. Falls back to "Tea". */
  label?: string;
  /** When true, suppresses the text + uses a denser pictogram —
   *  intended for thumbnails too small for type. */
  subtle?: boolean;
}

function TeaPlaceholderImpl({ label = 'Tea', subtle = false }: TeaPlaceholderProps) {
  const t = useT();
  // Adjust font size to fit long names. Threshold values picked by
  // hand: at the smallest (≤10 chars) we go big, at the longest
  // (≥28 chars) we go small. Linear interp in between.
  const len = label.length;
  const fontPct = len <= 10
    ? 16
    : len >= 28
      ? 8
      : 16 - ((len - 10) * (16 - 8)) / (28 - 10);

  return (
    <div
      role="img"
      aria-label={label === 'Tea' ? t('Tea image placeholder') : `${label} — image coming soon`}
      className="tea-placeholder"
    >
      {/* ── Blurred decorative cup — sits behind the text ──────────────── */}
      <svg
        viewBox="0 0 120 120"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={`tea-placeholder-svg ${subtle ? 'is-subtle' : ''}`}
      >
        {/* Steam wisps — soft gold curves */}
        <g stroke="var(--gold, #b8924a)" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7">
          <path d="M 48 28 Q 44 22 48 16 Q 52 10 48 4" />
          <path d="M 60 26 Q 56 20 60 14 Q 64 8 60 2" />
          <path d="M 72 28 Q 68 22 72 16 Q 76 10 72 4" />
        </g>
        {/* Cup body — gold-tinted shape so the wash reads warm */}
        <g>
          <ellipse cx="60" cy="98" rx="38" ry="7" fill="var(--gold, #b8924a)" opacity="0.45" />
          <path
            d="M 86 64 Q 102 64 102 76 Q 102 90 86 90"
            stroke="var(--gold, #b8924a)"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            opacity="0.85"
          />
          <path
            d="M 28 56 Q 28 92 60 95 Q 92 92 92 56 Z"
            fill="var(--gold, #b8924a)"
            opacity="0.55"
          />
          <ellipse cx="60" cy="58" rx="30" ry="5" fill="var(--midnight, #0f1c26)" opacity="0.28" />
        </g>
      </svg>

      {/* ── Foreground: tea name ──────────────────────────────────────────
          Hidden when subtle=true (thumbnails too small for text).
          Otherwise, font sizes via cqmin so it scales with the smaller
          dimension of the placeholder. The cqmin coefficient is dynamic
          (calculated from name length) so it flows in via a CSS custom
          property. clamp() floor/ceiling stays in the class. */}
      {!subtle && (
        <div
          className="tea-placeholder-label"
          /* eslint-disable-next-line react/forbid-dom-props -- font-size coefficient is per-instance dynamic */
          style={{ '--tea-placeholder-fs': `${fontPct}cqmin` } as React.CSSProperties}
        >
          {label}
        </div>
      )}
    </div>
  );
}

export const TeaPlaceholder = memo(TeaPlaceholderImpl);
