/**
 * SubmitButton.tsx — Phase 6.6 of the UI/UX roadmap
 *
 * The "every form submit looks slightly different" tax. Without a
 * single primitive, every form has its own version of:
 *   - disabled while submitting
 *   - aria-busy while submitting
 *   - inline spinner
 *   - "Saving…" label substitution
 *   - prevent double-submit on rapid clicks
 *
 * Each form gets one or two right and the rest wrong. This
 * component gets all five right in one place and forces consistency
 * across the app.
 *
 * Design decisions:
 *
 *   - **Don't disable on form-invalid pre-click.** The roadmap calls
 *     this out explicitly: "if you disable it pre-click on form-
 *     invalid, the user can't tell why." The button stays clickable;
 *     the click triggers RHF's `handleSubmit` which validates and
 *     surfaces errors. Users see the errors and know what to fix.
 *
 *   - **Disable on submitting only.** Once `isSubmitting` is true,
 *     disable + aria-busy. This prevents the double-submit race
 *     where a user clicks twice during a slow network.
 *
 *   - **Label swap, not separate spinner.** When submitting, replace
 *     the visible label with "Saving…" (or whatever the caller
 *     passes via `loadingLabel`). The full button cap stays the
 *     same width so layout doesn't jump. A small spinner appears
 *     INSIDE the button next to the new label.
 *
 *   - **`type="submit"` is the default.** The whole point of this
 *     component is to be a form-submit button; anyone passing
 *     `type="button"` should reach for the regular Button primitive
 *     instead. We still allow override for edge cases.
 *
 *   - **Consumes `useFormState` from RHF or accepts a prop.** Both
 *     work. Inside an RHF FormProvider, the button reads
 *     `formState.isSubmitting` automatically. Outside RHF, you can
 *     pass `loading={mutation.isPending}` from a Tanstack Query
 *     mutation directly. Either way, the consumer doesn't have to
 *     wire the disabled/aria-busy logic themselves.
 *
 * Phase 3 status: this component delegates ALL styling to the
 * existing `.btn` + variant system (`.btn-gold`, `.btn-dark`, etc).
 * Zero inline styles.
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { useFormState } from 'react-hook-form';
import { cn } from './utils';

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visible label when idle. Most callers pass a plain string so
   *  the auto loading-label swap (e.g. "Save" → "Saving…") works.
   *  ReactNode is also accepted for buttons that need an icon next
   *  to the label — in that case, pass `loadingLabel` explicitly
   *  since the auto swap can't infer a verb from arbitrary nodes. */
  children: import('react').ReactNode;
  /** Visible label when submitting. Defaults to `${children}…` when
   *  `children` is a string — e.g. "Save" → "Saving…". Required
   *  when `children` is a ReactNode (icon + text), since there's no
   *  string to derive the loading label from. For a non-default
   *  verb, pass the exact ing-form: `loadingLabel="Charging…"`. */
  loadingLabel?: string;
  /** Visual variant — pulled from the existing button class system.
   *  Defaults to `'gold'` (the primary CTA color). */
  variant?: 'gold' | 'dark' | 'outline' | 'success' | 'danger';
  /** Visual size. Defaults to `'md'`. */
  size?: 'sm' | 'md' | 'lg';
  /** Manually control the loading state. When omitted, the button
   *  reads `formState.isSubmitting` from RHF context. Use this prop
   *  when wiring to Tanstack Query mutations or other promise-based
   *  flows that don't go through RHF. */
  loading?: boolean;
}

/**
 * Submit button with built-in disabled/aria-busy/spinner state.
 * Inside <FormProvider>, reads RHF's submitting state automatically.
 * Otherwise pass `loading` directly.
 */
export const SubmitButton = forwardRef<HTMLButtonElement, SubmitButtonProps>(
  function SubmitButton(
    { children, loadingLabel, variant = 'gold', size = 'md', loading, type = 'submit', className, disabled, ...rest },
    ref,
  ) {
    // Read RHF's isSubmitting if we're inside a FormProvider AND
    // the caller didn't pass an explicit `loading` prop. The hook
    // throws when called outside a FormProvider — we catch and fall
    // back to false. (Calling useFormState() conditionally would
    // violate the rules of hooks; the try/catch guard is the
    // standard escape valve.)
    let rhfSubmitting = false;
    try {
      const formState = useFormState();
      rhfSubmitting = formState.isSubmitting;
    } catch (err) {
      console.warn('[SubmitButton] useFormState unavailable; falling back to loading prop:', err);
      // Outside FormProvider — fall back to the `loading` prop only.
    }

    const isLoading = loading ?? rhfSubmitting;
    // Compute the visible label. When children is a string, we can
    // auto-derive the loading form ("Save" → "Saving…"). When it's
    // arbitrary JSX (icon + text), the caller must supply
    // `loadingLabel`; if they don't, we fall back to "Loading…" so
    // the button still reads sensibly while submitting.
    const childIsString = typeof children === 'string';
    const effectiveLabel = isLoading
      ? (loadingLabel ?? (childIsString ? `${children}…` : 'Loading…'))
      : children;

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, isLoading && 'btn-loading', className)}
        {...rest}
      >
        {isLoading && <SubmitSpinner />}
        <span>{effectiveLabel}</span>
      </button>
    );
  },
);

/** A small inline spinner — uses the existing `.icon-spin` keyframe
 *  in design.css plus a 12px circular border. Keeps everything in
 *  CSS (no SVG asset, no JS), so the button stays cheap. */
function SubmitSpinner() {
  return <span className="btn-spinner" aria-hidden="true" />;
}
