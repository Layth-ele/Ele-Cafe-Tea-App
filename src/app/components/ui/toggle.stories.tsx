import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Toggle } from './toggle';

/**
 * Toggle — accessible binary on/off switch primitive.
 *
 * Use this anywhere a setting flips between two states (notification
 * prefs, dark-mode override, wishlist heart, low-stock alerts). The
 * `role="switch"` + `aria-checked` ARIA pattern gives screen readers
 * the right vocabulary — "switch, on/off" — instead of the more
 * verbose checkbox phrasing.
 *
 * Motion: the thumb uses the spring transition from
 * `design.css` §"Toggle / Switch thumb spring", which collapses to
 * 1ms under `prefers-reduced-motion: reduce` automatically (token-
 * level override in `tokens.css`).
 *
 * **Accessibility contract:** every consumer must provide either
 * `aria-label` or `aria-labelledby`. Without one, the screen reader
 * announces "switch" with no context. The component logs a dev
 * warning if both are missing.
 */
const meta: Meta<typeof Toggle> = {
  title: 'UI / Toggle',
  component: Toggle,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Binary on/off switch. role="switch" + aria-checked. Thumb spring inherited from the Phase 10 motion system.',
      },
    },
  },
  argTypes: {
    onCheckedChange: { action: 'changed' },
    size: { control: { type: 'inline-radio' }, options: ['sm', 'md'] },
    disabled: { control: 'boolean' },
    checked: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Toggle>;

// Wrapper that gives the story local state so the toggle is actually
// interactive in the Storybook canvas.
function ControlledToggle(props: React.ComponentProps<typeof Toggle>) {
  const [checked, setChecked] = useState(props.checked ?? false);
  return (
    <Toggle
      {...props}
      checked={checked}
      onCheckedChange={(next) => {
        setChecked(next);
        props.onCheckedChange?.(next);
      }}
    />
  );
}

export const Default: Story = {
  render: (args) => <ControlledToggle {...args} aria-label="Enable notifications" />,
  args: { checked: false, size: 'md', disabled: false },
};

export const Checked: Story = {
  render: (args) => <ControlledToggle {...args} aria-label="Auto-renew subscription" />,
  args: { checked: true, size: 'md', disabled: false },
};

export const Small: Story = {
  render: (args) => <ControlledToggle {...args} aria-label="Low-stock alerts" />,
  args: { checked: false, size: 'sm', disabled: false },
};

export const Disabled: Story = {
  render: (args) => <ControlledToggle {...args} aria-label="Premium feature (disabled)" />,
  args: { checked: false, size: 'md', disabled: true },
};

export const WithLabel: Story = {
  render: (args) => (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        color: 'var(--ink)',
      }}
    >
      <span id="t-pref-promos">Email me about promotions</span>
      <ControlledToggle {...args} aria-labelledby="t-pref-promos" />
    </label>
  ),
  args: { checked: false, size: 'md', disabled: false },
};

function SettingsListDemo() {
  const [order, setOrder] = useState(true);
  const [promos, setPromos] = useState(false);
  const [stock, setStock] = useState(true);
  const [newArrivals, setNewArrivals] = useState(false);
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 0',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
    color: 'var(--ink)',
    minWidth: 320,
  };

  return (
    <div style={{ display: 'grid', gap: 0, padding: 20 }}>
      <div style={rowStyle}>
        <span id="s-order">Order updates</span>
        <ControlledToggle aria-labelledby="s-order" checked={order} onCheckedChange={setOrder} />
      </div>
      <div style={rowStyle}>
        <span id="s-promos">Promotions</span>
        <ControlledToggle aria-labelledby="s-promos" checked={promos} onCheckedChange={setPromos} />
      </div>
      <div style={rowStyle}>
        <span id="s-stock">Low-stock alerts</span>
        <ControlledToggle aria-labelledby="s-stock" checked={stock} onCheckedChange={setStock} size="sm" />
      </div>
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span id="s-new">New arrivals</span>
        <ControlledToggle aria-labelledby="s-new" checked={newArrivals} onCheckedChange={setNewArrivals} size="sm" />
      </div>
    </div>
  );
}

export const SettingsList: Story = {
  render: () => <SettingsListDemo />,
};
