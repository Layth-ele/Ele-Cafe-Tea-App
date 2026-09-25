import type { Meta, StoryObj } from '@storybook/react';
import { ShoppingCart, ArrowRight, Loader2, Trash2 } from 'lucide-react';
import { Button } from './button';

/**
 * The Button is the primary call-to-action primitive across the app.
 * It uses class-variance-authority (cva) under the hood with two
 * dimensions of variation: `variant` (visual treatment) and `size`
 * (height + padding).
 *
 * Variants:
 *   - `default`     — primary action (submit, place order, sign in)
 *   - `destructive` — irreversible action (delete, remove, cancel order)
 *   - `outline`     — secondary action (back, reset, "more options")
 *   - `secondary`   — alternative tone, lower emphasis
 *   - `ghost`       — minimal chrome, for toolbar / inline buttons
 *   - `link`        — looks like a link, behaves like a button
 *
 * Sizes:
 *   - `default` (h-9), `sm` (h-8), `lg` (h-10), `icon` (square)
 *
 * Polymorphism:
 *   `asChild` lets the Button forward its styling to a child element —
 *   most commonly a Next.js / React Router `<Link>` — without nesting
 *   `<button><a>...</a></button>`, which is invalid HTML.
 */
const meta = {
  title:     'UI Primitives/Button',
  component: Button,
  argTypes:  {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
    disabled: { control: 'boolean' },
    asChild:  { control: 'boolean' },
  },
  args: {
    children: 'Add to cart',
    variant:  'default',
    size:     'default',
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/* The interactive playground. Use the Controls panel to flip through
 * variants/sizes/disabled state. */
export const Playground: Story = {};

/* All variants side-by-side — the canonical "is the design system
 * coherent?" view. If two variants look indistinguishable here, the
 * design system has a problem. */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Delete">
        <Trash2 />
      </Button>
    </div>
  ),
};

/* Buttons with leading or trailing icons — the most common pattern in
 * the app. The `[&_svg]` selectors in the cva config size every SVG
 * child to 16×16 automatically; you don't need to set width/height. */
export const WithIcons: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Button>
        <ShoppingCart /> Add to cart
      </Button>
      <Button variant="outline">
        Continue <ArrowRight />
      </Button>
      <Button variant="ghost">
        <Loader2 className="icon-spin" /> Loading…
      </Button>
    </div>
  ),
};

/* Icon-only buttons MUST have an aria-label — there's no visible text
 * for screen readers. The `size="icon"` variant gives the button the
 * 36×36 / 44×44 hit-target it needs. */
export const IconOnly: Story = {
  args: {
    size:     'icon',
    children: <Trash2 />,
    'aria-label': 'Delete item',
  },
  parameters: {
    docs: {
      description: {
        story: 'Icon-only buttons require `aria-label` for accessibility — without one, axe will flag a `button-name` violation.',
      },
    },
  },
};

/* Disabled state — pointer-events-none + opacity-50.
 * Tab focus is allowed (so screen readers can read the disabled state)
 * but mouse clicks pass through. */
export const Disabled: Story = {
  args: { disabled: true },
};

/* The `asChild` polymorphic pattern — common for wrapping React Router
 * Links so they get button styling without the invalid `<button><a>`
 * nesting. Demonstrated here with a plain anchor. */
export const AsChild: Story = {
  render: () => (
    <Button asChild>
      <a href="https://example.com" target="_blank" rel="noopener noreferrer">
        I'm an anchor with button styling
      </a>
    </Button>
  ),
};

/* Stack of every variant — useful for visual regression coverage. */
export const VariantsStacked: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, maxWidth: 480 }}>
      {(['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const).map((v) => (
        <Button key={v} variant={v}>{v}</Button>
      ))}
    </div>
  ),
};
