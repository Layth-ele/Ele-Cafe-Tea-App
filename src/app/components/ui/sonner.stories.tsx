import type { Meta, StoryObj } from '@storybook/react';
import { toast } from 'sonner';
import { Toaster } from './sonner';
import { Button } from './button';

/**
 * Toast notifications via Sonner, skinned to brand. The Toaster is
 * mounted once at app root (`App.tsx`); these stories mount it inside
 * a story so toasts render in the canvas.
 *
 * Every story includes a `<Toaster />` plus one or more buttons that
 * fire toasts. Click to demo. Toasts auto-dismiss after 3 seconds.
 *
 * Notes:
 *   - Skinned via `.ele-toast*` classes in design.css — light/dark
 *     mode flip via tokens.
 *   - Position is bottom-center on desktop, top-center on mobile (the
 *     bottom-center spot collides with the home indicator + thumb
 *     reach on phones).
 *   - `richColors={false}` so brand tokens win; we map green/red/etc.
 *     ourselves through `.ele-toast-success` / `.ele-toast-error`.
 */
const meta = {
  title:     'UI Primitives/Toaster (Sonner)',
  component: Toaster,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

/* All toast types side-by-side. Click each to see it; up to 3 visible
 * at once, then they queue. */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <Toaster />
      <Button onClick={() => toast('Default toast')}>Default</Button>
      <Button onClick={() => toast.success('Order placed successfully')} variant="outline">
        Success
      </Button>
      <Button onClick={() => toast.error("Couldn't save changes")} variant="destructive">
        Error
      </Button>
      <Button onClick={() => toast.warning('Stock running low')} variant="outline">
        Warning
      </Button>
      <Button onClick={() => toast.info('Your order is on its way')} variant="outline">
        Info
      </Button>
    </div>
  ),
};

/** With a description — title + secondary line. The most common
 *  pattern for actionable success / failure messages. */
export const WithDescription: Story = {
  render: () => (
    <div>
      <Toaster />
      <Button onClick={() => toast.success('Order placed', {
        description: 'Order #4719 confirmed. We sent a receipt to your email.',
      })}>
        With description
      </Button>
    </div>
  ),
};

/** With an action button — undo flow. The right-hand side gets a
 *  small button that, when clicked, undoes the operation. The toast
 *  auto-dismisses after 6 seconds (longer than default to give the
 *  user time to react). */
export const WithUndo: Story = {
  render: () => (
    <div>
      <Toaster />
      <Button onClick={() => toast('Item removed from cart', {
        action: {
          label: 'Undo',
          onClick: () => toast.success('Restored'),
        },
        duration: 6000,
      })} variant="destructive">
        Remove with undo
      </Button>
    </div>
  ),
};

/** Promise-based toast — automatically swaps from loading to success
 *  or error when the promise resolves. The right pattern for any
 *  user-initiated network action (place order, sign in, etc). */
export const PromiseFlow: Story = {
  render: () => (
    <div>
      <Toaster />
      <Button onClick={() => {
        const p = new Promise<{ orderId: string }>((resolve, reject) => {
          setTimeout(() => {
            Math.random() > 0.3
              ? resolve({ orderId: '#4720' })
              : reject(new Error('Card declined'));
          }, 1500);
        });
        toast.promise(p, {
          loading: 'Placing your order…',
          success: (data) => `Order ${data.orderId} placed`,
          error:   (err: Error) => err.message,
        });
      }}>
        Place order (~1.5s, 70% success)
      </Button>
    </div>
  ),
};

/** Stacked — toasts queue when more than 3 are visible. Click rapidly
 *  to see the stacking + auto-dismiss behaviour. */
export const Stacked: Story = {
  render: () => (
    <div>
      <Toaster />
      <Button onClick={() => {
        toast.success('First');
        setTimeout(() => toast.success('Second'),  300);
        setTimeout(() => toast.warning('Third'),   600);
        setTimeout(() => toast.info('Fourth'),     900);
        setTimeout(() => toast.error('Fifth'),    1200);
      }}>
        Fire 5 toasts
      </Button>
    </div>
  ),
};
