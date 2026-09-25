/**
 * Modal pattern stories — Phase 2.3
 *
 * Four modal shapes the app uses, all via the shared `<Modal>`
 * primitive. The shape is structural, not stylistic:
 *
 *   - Confirm     — yes/no decision. Footer Cancel + Primary CTA.
 *   - Form        — multi-field input. Footer Cancel + Save/Submit.
 *   - Info        — read-only acknowledgement. Footer single button.
 *   - Drawer      — slides from edge (cart drawer, mobile filters).
 *                   Same component family, different chrome.
 *
 * Each Story uses real `Modal` + `ModalBtn` so the visual contract
 * tracks production. `open` is forced true so the dialog is visible
 * inside the Storybook frame without an opening interaction.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { Modal, ModalBtn } from '@/app/components/modals/Modal';
import { Field } from '@/app/components/ui/Field';

const meta = {
  title: 'Patterns/Modals',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Four modal shapes — confirm, form, info, drawer. Every story ' +
          'uses the real `<Modal>` primitive so the visual + a11y ' +
          'surface (focus trap, esc-to-close, aria-modal) tracks ' +
          'production.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Confirm: Story = {
  name: '1 — Confirm (decision)',
  render: () => (
    <Modal
      open
      onClose={() => undefined}
      title="Delete this product?"
      size="sm"
      footer={
        <>
          <ModalBtn variant="outline">Cancel</ModalBtn>
          <ModalBtn variant="danger">Delete</ModalBtn>
        </>
      }
    >
      <p className="md-confirm-msg">
        This will permanently delete <strong className="cp2-strong-text">Royal Green Premium</strong> from the catalogue. Existing orders are preserved.
      </p>
    </Modal>
  ),
};

export const Form: Story = {
  name: '2 — Form (multi-field input)',
  render: () => (
    <Modal
      open
      onClose={() => undefined}
      title="Add tea"
      subtitle="Required fields marked *"
      size="md"
      footer={
        <>
          <ModalBtn variant="outline">Cancel</ModalBtn>
          <ModalBtn variant="primary">Save tea</ModalBtn>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field name="name" required>
          <Field.Label>Name</Field.Label>
          <Field.Input placeholder="Royal Green" />
        </Field>
        <Field name="price" required>
          <Field.Label>Price (CAD)</Field.Label>
          <Field.Input type="number" min={0} step="0.01" placeholder="12.50" />
        </Field>
        <Field name="description">
          <Field.Label>Description</Field.Label>
          <Field.Textarea rows={3} placeholder="Tasting notes, origin, brewing guidance…" />
        </Field>
      </div>
    </Modal>
  ),
};

export const Info: Story = {
  name: '3 — Info (acknowledgement)',
  render: () => (
    <Modal
      open
      onClose={() => undefined}
      title="Order placed"
      subtitle="Order ELE-1024"
      size="sm"
      footer={<ModalBtn variant="primary" fullWidth>View my orders</ModalBtn>}
    >
      <p className="md-confirm-msg">
        Thanks — your order is now under admin review. You'll receive an email with payment instructions once it's approved (typically within an hour during business hours).
      </p>
    </Modal>
  ),
};

export const DangerHeader: Story = {
  name: '4 — Danger header (destructive)',
  render: () => (
    <Modal
      open
      onClose={() => undefined}
      title="Cancel this order?"
      subtitle="Order ELE-1024 · $42.50"
      dangerHeader
      size="sm"
      footer={
        <>
          <ModalBtn variant="outline">Keep order</ModalBtn>
          <ModalBtn variant="danger">Cancel order</ModalBtn>
        </>
      }
    >
      <p className="md-confirm-msg">
        The customer will receive a refund within 3-5 business days. Any card charge is refunded automatically.
      </p>
    </Modal>
  ),
};

export const DrawerNote: Story = {
  name: '5 — Drawer (note)',
  parameters: {
    docs: {
      description: {
        story:
          'Drawers (cart drawer, mobile filter drawer, admin nav) share the same ' +
          'focus-trap and esc-to-close mechanics as Modal but slide from the side ' +
          'instead of centering. See `gb-step2-drawer-panel`, cart drawer in ' +
          '`Navbar.tsx`, and the filter drawer in `ProductsPage.tsx` for ' +
          'production examples. They\'re structurally drawer-shaped — Storybook ' +
          'isolation can\'t reasonably show side-of-viewport positioning, so the ' +
          'real-app screenshots are the contract.',
      },
    },
  },
  render: () => (
    <div style={{ padding: 40, background: 'var(--bg)' }}>
      <p style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 480 }}>
        Drawer chrome lives in the running app — see <code>ProductsPage</code> mobile
        filter drawer or the cart drawer launched from the navbar cart icon. The same
        focus-trap and esc-to-close mechanics as Modal, slide-from-edge layout
        instead of centered.
      </p>
    </div>
  ),
};
