/**
 * SubmitButton stories — Phase 6
 *
 * Demonstrates auto-disabled, auto-aria-busy, auto-spinner, and
 * label-swap behavior. Each story shows a different state or
 * variant.
 *
 * In real forms, the loading state is auto-detected via RHF's
 * formState.isSubmitting (when inside a FormProvider) or passed
 * via `loading` (for non-RHF mutations). These stories use the
 * explicit `loading` prop so the visual surface is testable
 * without wiring a full form.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { SubmitButton } from './SubmitButton';

const meta = {
  title: 'UI Primitives/SubmitButton',
  component: SubmitButton,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { children: 'Save' },
} satisfies Meta<typeof SubmitButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Idle state — clickable, normal label. */
export const Idle: Story = {};

/** Loading — disabled, aria-busy=true, spinner visible, label
 *  swapped to "Saving…" automatically (Save → Saving…). */
export const Loading: Story = {
  args: { loading: true },
};

/** Custom loading label for non-default verbs. */
export const CustomLoadingLabel: Story = {
  args: { loading: true, loadingLabel: 'Processing payment…', children: 'Pay $12.50' },
};

/** Variants — gold (primary CTA), dark, outline, success, danger. */
export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <SubmitButton variant="gold">Save</SubmitButton>
      <SubmitButton variant="dark">Sign In</SubmitButton>
      <SubmitButton variant="outline">Cancel</SubmitButton>
      <SubmitButton variant="success">Approve</SubmitButton>
      <SubmitButton variant="danger">Delete</SubmitButton>
    </div>
  ),
};

/** Sizes — sm, md (default), lg. */
export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <SubmitButton size="sm">Save</SubmitButton>
      <SubmitButton size="md">Save</SubmitButton>
      <SubmitButton size="lg">Save</SubmitButton>
    </div>
  ),
};

/** Disabled — visual disabled state distinct from loading. Loading
 *  implies disabled but adds the spinner; plain disabled is just
 *  greyed out. */
export const Disabled: Story = {
  args: { disabled: true },
};
