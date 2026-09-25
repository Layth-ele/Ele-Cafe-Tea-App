/**
 * Skeleton stories — Phase 5
 *
 * Demonstrates each shape variant of the namespaced Skeleton primitive.
 * The principle the roadmap codifies: "a spinner is a shrug, a
 * skeleton is a promise" — so each variant matches the SHAPE of
 * the content it stands in for.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from './skeleton';

const meta = {
  title:     'UI Primitives/Skeleton',
  component: Skeleton,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Plain Block — the lowest-level primitive. Sized via w/h. */
export const Block: Story = {
  render: () => <Skeleton w={200} h={16} />,
};

/** Single line of text. Default 100% width × 14px tall. Pass `w`
 *  for variable line lengths in a paragraph. */
export const Line: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 360 }}>
      <Skeleton.Line />
      <Skeleton.Line w="85%" />
      <Skeleton.Line w="60%" />
    </div>
  ),
};

/** Round avatar placeholder. Default 40px; pass `size` to override. */
export const Avatar: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Skeleton.Avatar />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton.Line w={120} h={14} />
        <Skeleton.Line w={80} h={12} />
      </div>
    </div>
  ),
};

/** Tea-card-shaped placeholder — image area on top, title + price
 *  below. Matches `.tea-card` geometry exactly so the layout
 *  doesn't shift when real content arrives. */
export const Card: Story = {
  render: () => (
    <div style={{ width: 280 }}>
      <Skeleton.Card />
    </div>
  ),
};

/** Card grid — the `/products` page loading state. */
export const ProductsGrid: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 960 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton.Card key={i} />)}
    </div>
  ),
};

/** Repeating-row table placeholder for paginated lists. */
export const Table: Story = {
  render: () => (
    <div style={{ width: 720 }}>
      <Skeleton.Table rows={5} cols={4} />
    </div>
  ),
};

/** Full-viewport route-transition fallback. Used as the Suspense
 *  fallback in App.tsx for lazy routes. */
export const Page: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <Skeleton.Page />,
};
