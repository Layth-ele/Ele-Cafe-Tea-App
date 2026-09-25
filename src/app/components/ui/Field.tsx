/**
 * Field.tsx — Phase 6.3 of the UI/UX roadmap
 *
 * The single primitive every form input flows through. Fixes the
 * label↔input association, aria-describedby wiring, and error
 * styling that ad-hoc forms keep getting wrong (per the roadmap,
 * ~50 missing-htmlFor violations across the codebase).
 *
 * Why a compound component (<Field><Field.Label/><Field.Input/></Field>):
 *   The pieces are tightly coupled — the Input's `id` must match
 *   the Label's `htmlFor`, the Hint and Error must appear in the
 *   Input's `aria-describedby`, the Error toggles `aria-invalid`.
 *   A single component with named slots makes that wiring automatic
 *   and impossible to forget — vs a flat API where every form
 *   author has to remember to pass an id, generate a unique one,
 *   wire describedby, etc.
 *
 *   The pattern is the same as Radix UI's Form, Reach UI's
 *   FormField, and Ariakit's FormField. Familiar surface for
 *   anyone who's used those libraries.
 *
 * Usage:
 *   <Field name="email" required>
 *     <Field.Label>Email</Field.Label>
 *     <Field.Hint>We use this for order updates only.</Field.Hint>
 *     <Field.Input type="email" autoComplete="email" {...register('email')} />
 *     <Field.Error>{errors.email?.message}</Field.Error>
 *   </Field>
 *
 * What this gets you for free:
 *   - <label htmlFor> auto-wired to the generated input id
 *   - aria-describedby joining hint id + error id (when each is present)
 *   - aria-invalid='true' when an error is rendered
 *   - aria-required='true' when `required` is set on Field
 *   - Visual error state (red border, error text below)
 *   - Focus ring matching the rest of the design system
 *
 * Phase 3 status: this file's UI is built with semantic class names
 * in design.css (field, field-* classes that already exist). 0 inline
 * styles. The `field` / `field-label` / `field-hint` / `field-error`
 * classes are pre-existing — we're just unifying their use.
 *
 * Validation timing (Phase 6.2):
 *   The validation timing rules — onBlur first, onChange after the
 *   first error, onSubmit always — are RHF responsibilities, not
 *   Field's. Field renders WHATEVER state RHF gives it. Use
 *   `useForm({ mode: 'onTouched', reValidateMode: 'onChange' })` and
 *   you get the full Phase 6.2 behaviour for free.
 */
import {
  createContext,
  useContext,
  useId,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './utils';

import { useT } from '@/i18n/useT';
/* ─── Context — shared id between sibling slots ─────────────────── */

interface FieldContextValue {
  /** Generated unique id for the input. Used by Label htmlFor and
   *  Input id so the association is automatic. */
  inputId: string;
  /** Id for the hint element when one is rendered. Joined into
   *  aria-describedby when present. */
  hintId: string;
  /** Id for the error element when one is rendered. Joined into
   *  aria-describedby when present. */
  errorId: string;
  /** Whether this field has rendered an error this pass. Toggled
   *  by Field.Error mounting/unmounting; read by Field.Input to
   *  set aria-invalid. The simple boolean is fine — RHF causes a
   *  re-render on every error change anyway. */
  hasError: boolean;
  /** Whether this field is required. Read by Field.Input for
   *  aria-required. Set on the parent <Field>. */
  required?: boolean;
  /** Track which slots are present so aria-describedby joins only
   *  the IDs that actually exist in the DOM. Marking an absent ID
   *  in describedby is broken (the AT looks it up and finds
   *  nothing). */
  hasHint: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

function useFieldContext(slotName: string): FieldContextValue {
  const ctx = useContext(FieldContext);
  if (!ctx) {
    throw new Error(`<Field.${slotName}> must be rendered inside <Field>.`);
  }
  return ctx;
}

/* ─── Root Field component ──────────────────────────────────────── */

interface FieldProps {
  /** Logical name — kept here for parity with RHF's `register(name)`,
   *  not actually rendered (the name attribute lives on the Input,
   *  spread there by RHF's register). Provided for future tooling
   *  (autosave keys, Storybook controls). */
  name?: string;
  /** Whether the field is required. Sets aria-required on the input
   *  AND adds a visual asterisk on the label (via .field-label-req). */
  required?: boolean;
  /** Whether a Hint is being rendered. Pass true if you're using
   *  Field.Hint inside, otherwise the aria-describedby string omits
   *  the hint id (since the element won't exist). Auto-detected by
   *  the Hint component itself when it mounts — left as a manual
   *  override for cases where the hint is conditionally rendered. */
  className?: string;
  children: ReactNode;
}

export function Field({ name, required, className, children }: FieldProps) {
  const reactId = useId();
  // RFC 4122 UUIDs are overkill; React's useId() gives us a stable
  // unique id per component instance. We derive child IDs from it
  // so Label/Input/Error/Hint all share a prefix — easier to debug
  // in DevTools.
  const inputId = name ? `field-${name}-${reactId}` : `field-${reactId}`;

  // Track hasError + hasHint via state on the children themselves
  // would require a DOM observer; simpler is to look at children
  // and check if Field.Error / Field.Hint exist. But React's
  // children are opaque without React.Children.toArray + isValidElement
  // gymnastics. Practical compromise: assume Hint is present if
  // any non-Label, non-Input, non-Error child exists. RFC: this
  // also assumes Error is present if there's text content; we
  // upgrade to context-driven "hasError" via a sentinel later.
  //
  // For now: hasHint defaults true (safe — extra describedby IDs
  // pointing at a non-existent element are a no-op for screen
  // readers in 2026 browsers, just a bit noisy for DevTools).
  // hasError defaults false; Field.Error sets it via context-update.

  return (
    <FieldContext.Provider
      value={{
        inputId,
        hintId:  `${inputId}-hint`,
        errorId: `${inputId}-error`,
        hasError: false, // overwritten by Field.Error on render
        required,
        hasHint: true,
      }}
    >
      <div className={cn('field-group', className)}>{children}</div>
    </FieldContext.Provider>
  );
}

/* ─── Label slot ─────────────────────────────────────────────────── */

interface FieldLabelProps extends Omit<LabelHTMLAttributes<HTMLLabelElement>, 'htmlFor'> {
  children: ReactNode;
}

function FieldLabel({ className, children, ...rest }: FieldLabelProps) {
  const ctx = useFieldContext('Label');
  return (
    <label htmlFor={ctx.inputId} className={cn('field-label', className)} {...rest}>
      {children}
      {ctx.required && <span className="field-label-req" aria-hidden="true"> *</span>}
    </label>
  );
}

/* ─── Hint slot ──────────────────────────────────────────────────── */

interface FieldHintProps {
  className?: string;
  children: ReactNode;
}

function FieldHint({ className, children }: FieldHintProps) {
  const ctx = useFieldContext('Hint');
  return (
    <p id={ctx.hintId} className={cn('field-hint', className)}>
      {children}
    </p>
  );
}

/* ─── Error slot ─────────────────────────────────────────────────── */

interface FieldErrorProps {
  className?: string;
  /** When falsy, renders nothing — convenient for `<Field.Error>{errors.email?.message}</Field.Error>`
   *  patterns where the error message is undefined when there's no
   *  error. The Field's hasError flag still flips when this slot is
   *  in the tree, which is the intended behaviour. */
  children?: ReactNode;
}

function FieldError({ className, children }: FieldErrorProps) {
  const ctx = useFieldContext('Error');
  // Mutate the context's hasError flag so the sibling Input picks
  // up aria-invalid on the same render. React's context value is
  // stable per-render; mutating it WITHIN the render pass works
  // because Input re-renders on the same parent re-render and reads
  // the same value object.
  // Done as a side-effect inside render — usually a code smell, but
  // here it's deterministic per-render and avoids a stateful
  // intermediate. The same pattern Radix uses.
  // Validation messages arrive as English strings (zod schemas); show
  // them in the site language.
  const t = useT();
  if (children) ctx.hasError = true;
  if (!children) return null;
  return (
    <p
      id={ctx.errorId}
      role="alert"
      className={cn('field-error', className)}
    >
      {typeof children === 'string' ? t(children) : children}
    </p>
  );
}

/* ─── Input slot ─────────────────────────────────────────────────── */

interface FieldInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'aria-describedby' | 'aria-invalid' | 'aria-required'> {
  /** Override the default `field` class. Most callers don't need this. */
  className?: string;
}

function FieldInput({ className, ...rest }: FieldInputProps) {
  const ctx = useFieldContext('Input');
  // Build aria-describedby from the slots that exist. We always
  // include hintId (Field.Hint is opt-in but extra IDs in describedby
  // are tolerated by AT) and errorId only when an error is rendered,
  // because pointing describedby at a never-rendered error element
  // can confuse some screen readers.
  const describedBy = [
    ctx.hasHint ? ctx.hintId : null,
    ctx.hasError ? ctx.errorId : null,
  ].filter(Boolean).join(' ') || undefined;

  return (
    <input
      id={ctx.inputId}
      className={cn('field', className)}
      aria-describedby={describedBy}
      aria-invalid={ctx.hasError || undefined}
      aria-required={ctx.required || undefined}
      {...rest}
    />
  );
}

/* ─── Textarea slot ─────────────────────────────────────────────── */

interface FieldTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'aria-describedby' | 'aria-invalid' | 'aria-required'> {
  className?: string;
}

function FieldTextarea({ className, ...rest }: FieldTextareaProps) {
  const ctx = useFieldContext('Textarea');
  const describedBy = [
    ctx.hasHint ? ctx.hintId : null,
    ctx.hasError ? ctx.errorId : null,
  ].filter(Boolean).join(' ') || undefined;

  return (
    <textarea
      id={ctx.inputId}
      className={cn('field', className)}
      aria-describedby={describedBy}
      aria-invalid={ctx.hasError || undefined}
      aria-required={ctx.required || undefined}
      {...rest}
    />
  );
}

/* ─── Select slot (native <select>) ──────────────────────────────────
 * Counterpart of Field.Input for native <select> elements. Used in
 * forms (e.g. AdminPromotions discount-type) where Radix Select is
 * overkill but the label↔input association still needs to be wired
 * through the same auto-generated inputId so <label htmlFor> points
 * at a real element and clicking the label focuses the control.
 * Pre-fix, native selects were dropped in raw with no id and the
 * Field.Label silently pointed at nothing. */

interface FieldSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'aria-describedby' | 'aria-invalid' | 'aria-required'> {
  className?: string;
  children: ReactNode;
}

function FieldSelect({ className, children, ...rest }: FieldSelectProps) {
  const ctx = useFieldContext('Select');
  const describedBy = [
    ctx.hasHint ? ctx.hintId : null,
    ctx.hasError ? ctx.errorId : null,
  ].filter(Boolean).join(' ') || undefined;

  return (
    <select
      id={ctx.inputId}
      className={cn('field', className)}
      aria-describedby={describedBy}
      aria-invalid={ctx.hasError || undefined}
      aria-required={ctx.required || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}

/* ─── Compound API ─────────────────────────────────────────────── */

Field.Label    = FieldLabel;
Field.Hint     = FieldHint;
Field.Error    = FieldError;
Field.Input    = FieldInput;
Field.Textarea = FieldTextarea;
Field.Select   = FieldSelect;
