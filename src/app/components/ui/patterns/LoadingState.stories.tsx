/**
 * Loading State pattern stories — Phase 2.3
 *
 * Captures the "skeleton vs spinner" decision STATES_GUIDE.md
 * documents. The choice is structural, not stylistic:
 *
 *   - Skeleton: when the layout is known. Lists, cards, profile pages.
 *               Reserves real estate so content drops into the right
 *               place — eliminates layout shift (CLS) when data lands.
 *
 *   - Spinner: when the layout is unknown OR the loading is in
 *              response to an explicit action (button click, form
 *              submit). Spinners say "your action is being processed";
 *              skeletons say "your content is being fetched."
 */
import type { Meta, StoryObj } from '@storybook/react';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/app/components/ui/skeleton';

const meta = {
  title: 'Patterns/Loading State',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Skeleton vs spinner — when to use each. Skeleton when the ' +
          'layout is known (list, card, profile); spinner when the ' +
          'action is in flight (button submit, save).',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SkeletonCardList: Story = {
  name: 'Skeleton — card list (known layout)',
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 720 }}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Skeleton.Card key={i} />
      ))}
    </div>
  ),
};

export const SkeletonProfileRow: Story = {
  name: 'Skeleton — profile row',
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, maxWidth: 400 }}>
      <Skeleton.Avatar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton.Line w="65%" />
        <Skeleton.Line w="40%" />
      </div>
    </div>
  ),
};

export const SkeletonTextBlock: Story = {
  name: 'Skeleton — text block',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
      <Skeleton.Line />
      <Skeleton.Line />
      <Skeleton.Line w="92%" />
      <Skeleton.Line w="78%" />
    </div>
  ),
};

export const SpinnerButton: Story = {
  name: 'Spinner — button submit (action in flight)',
  render: () => (
    <button
      type="button"
      className="btn btn-dark btn-lg"
      disabled
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
    >
      <Loader2 size={14} className="icon-spin" />
      Placing order…
    </button>
  ),
};

export const SpinnerInline: Story = {
  name: 'Spinner — inline (search filtering)',
  render: () => (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: 'var(--muted)',
      }}
    >
      <Loader2 size={12} className="icon-spin" />
      Filtering teas…
    </div>
  ),
};
