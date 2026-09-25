/**
 * Field stories — Phase 6
 *
 * Demonstrates the compound Field primitive. Every story is a
 * realistic copy-paste recipe for forms using RHF + zodResolver.
 *
 * The compound API auto-wires:
 *   - <Field.Label htmlFor> → <Field.Input id>
 *   - <Field.Hint id> joined into the Input's aria-describedby
 *   - <Field.Error id> joined into aria-describedby + sets aria-invalid
 *   - <Field required> sets aria-required + renders an asterisk
 *
 * In live forms, RHF supplies value/onChange via {...register('name')}
 * which spreads onto Field.Input. These stories use uncontrolled
 * inputs (no register) so the primitives stand on their own —
 * Storybook docs is for the visual + accessibility surface.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { Field } from './Field';

const meta = {
  title: 'UI Primitives/Field',
  component: Field,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  // Default args so each story can omit them — every story below
  // overrides via `render` rather than props, so these placeholders
  // are never actually rendered. Their job is to satisfy the typed
  // Story shape (children is required on the component).
  args: { children: null, name: 'demo' },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bare field — label + input, no hint, no error. */
export const Basic: Story = {
  render: () => (
    <Field name="email">
      <Field.Label>Email address</Field.Label>
      <Field.Input type="email" autoComplete="email" placeholder="you@example.com" />
    </Field>
  ),
};

/** With hint text — describes what the field is for or how to fill it. */
export const WithHint: Story = {
  render: () => (
    <Field name="email">
      <Field.Label>Email address</Field.Label>
      <Field.Hint>We use this for order updates only — never spam.</Field.Hint>
      <Field.Input type="email" autoComplete="email" placeholder="you@example.com" />
    </Field>
  ),
};

/** Required — asterisk on label, aria-required on input. */
export const Required: Story = {
  render: () => (
    <Field name="email" required>
      <Field.Label>Email address</Field.Label>
      <Field.Input type="email" autoComplete="email" placeholder="you@example.com" />
    </Field>
  ),
};

/** With error — red border, error text below, role="alert" on error. */
export const WithError: Story = {
  render: () => (
    <Field name="email" required>
      <Field.Label>Email address</Field.Label>
      <Field.Input type="email" autoComplete="email" defaultValue="not-an-email" />
      <Field.Error>Enter a valid email address</Field.Error>
    </Field>
  ),
};

/** Hint AND error — both join aria-describedby. The hint explains
 *  the field's purpose; the error tells what's wrong. They're not
 *  redundant — each plays a different role. */
export const WithHintAndError: Story = {
  render: () => (
    <Field name="password" required>
      <Field.Label>New password</Field.Label>
      <Field.Hint>Min 8 characters, one uppercase, one number.</Field.Hint>
      <Field.Input type="password" autoComplete="new-password" defaultValue="abc" />
      <Field.Error>Password must be at least 8 characters</Field.Error>
    </Field>
  ),
};

/** Textarea variant for multi-line input. Same compound API; same
 *  aria wiring. */
export const Textarea: Story = {
  render: () => (
    <Field name="note">
      <Field.Label>Reason</Field.Label>
      <Field.Hint>Why are you adjusting this account's credit?</Field.Hint>
      <Field.Textarea rows={3} placeholder="e.g. Loyalty reward, compensation…" />
    </Field>
  ),
};

/** Stack of fields — typical login form shape. Demonstrates spacing
 *  via the parent's `.stack-4` utility. */
export const FormStack: Story = {
  render: () => (
    <div className="stack-4" style={{ width: 360 }}>
      <Field name="email" required>
        <Field.Label>Email address</Field.Label>
        <Field.Input type="email" autoComplete="email" placeholder="you@example.com" />
      </Field>
      <Field name="password" required>
        <Field.Label>Password</Field.Label>
        <Field.Input type="password" autoComplete="current-password" placeholder="••••••••" />
      </Field>
    </div>
  ),
};
