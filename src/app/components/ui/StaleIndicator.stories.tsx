/**
 * StaleIndicator stories — Phase 5
 *
 * The "data is being refetched in the background" signal. Wired to
 * Tanstack Query's `isStale && isFetching` in real consumers.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { StaleIndicator } from './StaleIndicator';

const meta = {
  title: 'UI Primitives/StaleIndicator',
  component: StaleIndicator,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof StaleIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visible: Story = {
  args: { visible: true },
};

export const CustomLabel: Story = {
  args: { visible: true, label: 'Refreshing prices…' },
};

export const Hidden: Story = {
  args: { visible: false },
};

/** In context — sits next to a heading, signalling that the data
 *  below is from cache while a background refetch is in flight. */
export const InContext: Story = {
  args: { visible: true },
  render: (args) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <h3 style={{ margin: 0 }}>Recent Orders</h3>
      <StaleIndicator {...args} />
    </div>
  ),
};
