import type { Meta, StoryObj } from '@storybook/react';
import { ArrowRight } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from './card';
import { Button } from './button';

/**
 * Card primitive plus its sub-components: `CardHeader`, `CardTitle`,
 * `CardDescription`, `CardAction`, `CardContent`, `CardFooter`.
 *
 * Composition rule — pick the parts you need, leave the rest:
 *   <Card>
 *     <CardHeader>
 *       <CardTitle>...</CardTitle>
 *       <CardDescription>...</CardDescription>
 *       <CardAction>...</CardAction>     ← optional (right-aligned)
 *     </CardHeader>
 *     <CardContent>...</CardContent>
 *     <CardFooter>...</CardFooter>
 *   </Card>
 *
 * The Header uses CSS Grid with auto-rows to handle a variable
 * combination of title + description + action without flex juggling.
 */
const meta = {
  title:     'UI Primitives/Card',
  component: Card,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Card style={{ width: 360 }}>
      <CardHeader>
        <CardTitle>English Breakfast</CardTitle>
        <CardDescription>A robust black tea with malty notes and a brisk finish.</CardDescription>
      </CardHeader>
      <CardContent>
        Origin: Sri Lanka · Caffeine: high · Brew time: 4–5 min
      </CardContent>
      <CardFooter>
        <Button>Add to cart</Button>
      </CardFooter>
    </Card>
  ),
};

/* Card with a CardAction in the header — the Action slot lives in
 * its own grid column, right-aligned, spanning both header rows.
 * Common pattern: a "more" menu, a close button, or a quick-action
 * link. */
export const WithAction: Story = {
  render: () => (
    <Card style={{ width: 360 }}>
      <CardHeader>
        <CardTitle>Order #4719</CardTitle>
        <CardDescription>Placed Tuesday at 2:14 pm</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            View <ArrowRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>3 items · $42.10 · Shipped</CardContent>
    </Card>
  ),
};

/* Compact variant — Header only, no Footer. Useful for list rows
 * where the card is itself the action. */
export const HeaderOnly: Story = {
  render: () => (
    <Card style={{ width: 360 }}>
      <CardHeader>
        <CardTitle>Saved address</CardTitle>
        <CardDescription>123 Granville St, Vancouver BC</CardDescription>
      </CardHeader>
    </Card>
  ),
};

/* Grid of cards — common for product listings. Container queries on
 * the Card content (`@container/card-header`) make each card respond
 * to its own width, not the page width. */
export const Grid: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 1100 }}>
      {['English Breakfast', 'Earl Grey', 'Darjeeling First Flush'].map((name) => (
        <Card key={name}>
          <CardHeader>
            <CardTitle>{name}</CardTitle>
            <CardDescription>Black tea · Sri Lanka</CardDescription>
          </CardHeader>
          <CardContent>
            From <strong>$12.50</strong> · 50g loose-leaf
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm">
              View details
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  ),
};
