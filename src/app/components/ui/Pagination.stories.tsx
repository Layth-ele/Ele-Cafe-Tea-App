import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Pagination } from './Pagination';

/**
 * GCP / Material-style pagination control. Computes its own display
 * range (`1–10 of 47`) so callers don't have to.
 *
 * Stateful behavior is the parent's job — `onPageChange` and
 * `onPageSizeChange` flow back to the parent which controls `page`
 * and `pageSize` via state. The wrapper component below provides
 * that state for the stories.
 *
 * Edge cases worth knowing:
 *   - `totalItems = 0` still renders a "page 1" with both chevrons
 *     disabled — looks empty but never breaks layout.
 *   - If `page` exceeds totalPages (e.g. a filter dropped items
 *     out from under the active page), display is clamped — but
 *     `onPageChange` is NOT called. Callers reset to page 1 when
 *     filters change.
 */

function PaginationDemo({
  initialPage = 1,
  initialSize = 10,
  totalItems = 137,
  withSizeSelector = false,
}: {
  initialPage?: number;
  initialSize?: number;
  totalItems?: number;
  withSizeSelector?: boolean;
}) {
  const [page, setPage] = useState(initialPage);
  const [size, setSize] = useState(initialSize);
  return (
    <Pagination
      page={page}
      pageSize={size}
      totalItems={totalItems}
      onPageChange={setPage}
      onPageSizeChange={withSizeSelector ? setSize : undefined}
    />
  );
}

const meta = {
  title:     'UI Primitives/Pagination',
  component: Pagination,
  parameters: { layout: 'padded' },
  /* These args are placeholders required by the component's prop
   * types. Every story below uses `render` with its own
   * stateful wrapper, so these defaults are never actually consumed —
   * but Storybook's type system needs them at the meta level when
   * the component has required props. */
  args: {
    page:         1,
    pageSize:     10,
    totalItems:   137,
    onPageChange: () => {},
  },
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Standard usage — chevrons only, no page-size selector. */
export const Basic: Story = {
  render: () => <PaginationDemo totalItems={137} initialSize={10} />,
};

/** With the page-size dropdown — admin-table flavour. */
export const WithSizeSelector: Story = {
  render: () => <PaginationDemo totalItems={137} initialSize={25} withSizeSelector />,
};

/** First page — "previous" disabled. */
export const FirstPage: Story = {
  render: () => <PaginationDemo totalItems={137} initialPage={1} />,
};

/** Last page — "next" disabled. */
export const LastPage: Story = {
  render: () => <PaginationDemo totalItems={137} initialPage={14} />,
};

/** Single page — both chevrons disabled. */
export const SinglePage: Story = {
  render: () => <PaginationDemo totalItems={5} initialSize={10} />,
};

/** Empty — totalItems = 0; renders defensively without breaking. */
export const Empty: Story = {
  render: () => <PaginationDemo totalItems={0} />,
};

/** Large dataset — admin tables. */
export const LargeDataset: Story = {
  render: () => <PaginationDemo totalItems={2_500} initialSize={50} withSizeSelector />,
};
