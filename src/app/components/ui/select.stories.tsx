import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';

/**
 * Select — Radix-based listbox primitive.
 *
 * The component is a thin wrapper around @radix-ui/react-select that
 * supplies our token-driven styling, our keyboard semantics, and our
 * focus-ring treatment. The Radix primitive does the heavy lifting:
 *   - Native-like keyboard nav (Up/Down/Home/End/typeahead)
 *   - Portal-rendered menu (no parent overflow / z-index battles)
 *   - aria-expanded, aria-controls, aria-haspopup wired correctly
 *   - Click-outside-to-close, ESC-to-close, focus-restore on close
 *
 * What the wrapper adds:
 *   - Two trigger sizes (default = 36px tall, sm = 32px) via data-size
 *     so admin tables can use the dense variant.
 *   - aria-invalid styling that matches our form error states.
 *   - The same focus-ring treatment as Input + Button.
 *
 * Composition contract:
 *   <Select value=... onValueChange=...>
 *     <SelectTrigger size="default" | "sm"><SelectValue /></SelectTrigger>
 *     <SelectContent>
 *       <SelectGroup>
 *         <SelectLabel>...</SelectLabel>
 *         <SelectItem value="..." />
 *       </SelectGroup>
 *       <SelectSeparator />
 *       <SelectItem value="..." />
 *     </SelectContent>
 *   </Select>
 *
 * Storybook caveats:
 *   The Select menu is portal-rendered to document.body. In Storybook's
 *   iframe that means the popper appears at the iframe root. The
 *   `Open` story below forces `defaultOpen` so reviewers can see the
 *   open state without a click — useful for visual review, irrelevant
 *   for production.
 */
const meta = {
  title: 'UI/Select',
  component: Select,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Token-styled wrapper around @radix-ui/react-select. Two sizes ' +
          '(default / sm), full keyboard nav, portal-rendered menu, error states.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ── Tea-categories option set used across most stories ──────────────────── */
const TEAS = [
  { value: 'black',  label: 'Black tea' },
  { value: 'green',  label: 'Green tea' },
  { value: 'white',  label: 'White tea' },
  { value: 'oolong', label: 'Oolong tea' },
  { value: 'pu-erh', label: 'Pu-erh tea' },
  { value: 'herbal', label: 'Herbal infusion' },
] as const;

/* ── Demo components — broken out so stories can call them via JSX,
   keeping `useState` inside a named React component (eslint
   rules-of-hooks requires PascalCase or `use*` for hook calls). ────── */

function ControlledSelectDemo({
  size = 'default',
  placeholder = 'Pick a tea',
  defaultOpen = false,
}: {
  size?: 'default' | 'sm';
  placeholder?: string;
  defaultOpen?: boolean;
}) {
  const [value, setValue] = useState<string>('');
  return (
    <div style={{ width: 240 }}>
      <Select value={value} onValueChange={setValue} defaultOpen={defaultOpen}>
        <SelectTrigger size={size}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {TEAS.map(t => (
            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function GroupedSelectDemo() {
  const [value, setValue] = useState<string>('');
  return (
    <div style={{ width: 260 }}>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a tea" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Caffeinated</SelectLabel>
            <SelectItem value="black">Black tea</SelectItem>
            <SelectItem value="green">Green tea</SelectItem>
            <SelectItem value="white">White tea</SelectItem>
            <SelectItem value="oolong">Oolong tea</SelectItem>
            <SelectItem value="pu-erh">Pu-erh tea</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Herbal</SelectLabel>
            <SelectItem value="chamomile">Chamomile</SelectItem>
            <SelectItem value="rooibos">Rooibos</SelectItem>
            <SelectItem value="mint">Peppermint</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function DisabledSelectDemo() {
  const [value, setValue] = useState<string>('');
  return (
    <div style={{ width: 240 }}>
      <Select value={value} onValueChange={setValue} disabled>
        <SelectTrigger>
          <SelectValue placeholder="Disabled" />
        </SelectTrigger>
        <SelectContent>
          {TEAS.map(t => (
            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DisabledItemSelectDemo() {
  const [value, setValue] = useState<string>('');
  return (
    <div style={{ width: 240 }}>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a tea" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="black">Black tea</SelectItem>
          <SelectItem value="green">Green tea</SelectItem>
          <SelectItem value="white" disabled>
            White tea (out of stock)
          </SelectItem>
          <SelectItem value="oolong">Oolong tea</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function InvalidSelectDemo() {
  const [value, setValue] = useState<string>('');
  return (
    <div style={{ width: 240 }}>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger aria-invalid="true">
          <SelectValue placeholder="Required field" />
        </SelectTrigger>
        <SelectContent>
          {TEAS.map(t => (
            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p style={{ color: 'var(--state-danger-fg)', fontSize: 12, marginTop: 6 }}>
        Please select a tea category.
      </p>
    </div>
  );
}

function ManyItemsSelectDemo() {
  const [value, setValue] = useState<string>('');
  const items = Array.from({ length: 40 }, (_, i) => ({
    value: `item-${i + 1}`,
    label: `Option ${i + 1}`,
  }));
  return (
    <div style={{ width: 240 }}>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger>
          <SelectValue placeholder="40 options" />
        </SelectTrigger>
        <SelectContent>
          {items.map(it => (
            <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SizesDemo() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 6px' }}>
          Default (36px)
        </p>
        <ControlledSelectDemo size="default" />
      </div>
      <div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 6px' }}>
          Small (32px) — admin tables
        </p>
        <ControlledSelectDemo size="sm" />
      </div>
    </div>
  );
}

/* ── Stories ──────────────────────────────────────────────────────────── */

export const Playground: Story = {
  render: () => <ControlledSelectDemo />,
};

export const Sizes: Story = {
  render: () => <SizesDemo />,
};

/**
 * Open-by-default — useful for visual-regression review of the menu
 * itself (size, padding, separator color, hover state). Production
 * code should not pass `defaultOpen`; the user opens the menu.
 */
export const Open: Story = {
  render: () => <ControlledSelectDemo defaultOpen placeholder="Pick a tea" />,
};

/**
 * Grouped + labelled options. The `<SelectLabel>` is non-interactive
 * (Radix renders it as a section heading inside the listbox).
 */
export const Grouped: Story = {
  render: () => <GroupedSelectDemo />,
};

/**
 * Disabled trigger — keyboard cannot focus, click does not open.
 * The cursor-not-allowed and 50% opacity treatment comes from the
 * shared `disabled:` utilities applied to every form primitive.
 */
export const Disabled: Story = {
  render: () => <DisabledSelectDemo />,
};

/**
 * Disabled item inside an otherwise enabled list. Useful for
 * out-of-stock options — visible but unselectable.
 */
export const DisabledItem: Story = {
  render: () => <DisabledItemSelectDemo />,
};

/**
 * Error state — `aria-invalid` toggles the danger ring and border.
 * Forms wired to react-hook-form set this prop based on the field's
 * touched + error flags so the visual matches the validation state.
 */
export const Invalid: Story = {
  render: () => <InvalidSelectDemo />,
};

/**
 * Many items — verifies the menu's max-height behaviour. Radix caps
 * the menu at the available viewport height and adds inner scroll
 * with up/down chevron scroll buttons.
 */
export const ManyItems: Story = {
  render: () => <ManyItemsSelectDemo />,
};
