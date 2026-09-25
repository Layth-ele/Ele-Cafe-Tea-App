/**
 * Toggle — accessible binary on/off switch primitive.
 *
 * Why this exists (Phase 10 polish + Phase 11 prep):
 * - The `.toggle-thumb` and `[role="switch"] [data-thumb]` spring
 *   transitions already ship in `design.css` (Phase 10 §"State
 *   micro-animations"). This component is the canonical consumer.
 * - Phase 11 (Personalization) will need toggles for: notification
 *   preferences, wishlist heart, low-stock alerts. Shipping the
 *   primitive now means those features inherit motion + a11y for free.
 *
 * Accessibility:
 * - `role="switch"` + `aria-checked` is the WAI-ARIA pattern for
 *   binary state. Distinct from `<input type="checkbox">` for
 *   screen-reader announcement ("switch, on/off" vs "checkbox,
 *   checked/unchecked").
 * - Space and Enter both toggle (handled natively by the underlying
 *   button element + onClick).
 * - Focus ring inherited from the existing `:focus-visible` rules.
 * - `aria-disabled` is set in addition to disabled to ensure
 *   screen readers announce disabled state consistently across
 *   browsers.
 *
 * Reduced motion: the thumb still slides, but at 1ms (via the
 * `var(--dur-fast)` token override in tokens.css §line 860).
 */
import * as React from 'react';

export type ToggleSize = 'sm' | 'md';

export interface ToggleProps {
  /** Current state. */
  checked: boolean;
  /** Called with the next state when the user toggles. */
  onCheckedChange: (next: boolean) => void;
  /** Accessible label for screen readers. Required. */
  'aria-label'?: string;
  /** Alternative: reference a visible label element by id. */
  'aria-labelledby'?: string;
  /** Optional descriptive text for screen readers. */
  'aria-describedby'?: string;
  /** Disable the toggle. */
  disabled?: boolean;
  /** Visual size. md is default (40×24); sm is for dense lists (32×20). */
  size?: ToggleSize;
  /** Extra class names merged onto the root button. */
  className?: string;
  /** Optional id (forwarded to the underlying button). */
  id?: string;
  /** Optional name attribute for form integration (rarely useful since
   * the value is communicated via onCheckedChange, but allowed). */
  name?: string;
}

const baseClass = 'toggle';

export const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  function Toggle(
    {
      checked,
      onCheckedChange,
      disabled = false,
      size = 'md',
      className,
      ...rest
    },
    ref,
  ) {
    // Either aria-label or aria-labelledby must be provided. In dev,
    // log a warning if both are missing; in prod, the screen reader
    // will say "switch" with no context, which is the worse outcome.
    if (
      process.env.NODE_ENV !== 'production' &&
      !rest['aria-label'] &&
      !rest['aria-labelledby']
    ) {
      console.warn(
        '<Toggle>: missing aria-label or aria-labelledby. Screen readers will ' +
          'announce only "switch" with no context. Provide one.',
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        data-state={checked ? 'checked' : 'unchecked'}
        data-size={size}
        className={[baseClass, className].filter(Boolean).join(' ')}
        onClick={() => {
          if (disabled) return;
          onCheckedChange(!checked);
        }}
        {...rest}
      >
        {/* The thumb is a child element so the spring transition
            (from design.css §"Toggle / Switch thumb spring") binds
            via the `[role="switch"] [data-thumb]` selector. The
            translateX is driven by data-state via CSS. */}
        <span className="toggle-thumb" data-thumb aria-hidden="true" />
      </button>
    );
  },
);
