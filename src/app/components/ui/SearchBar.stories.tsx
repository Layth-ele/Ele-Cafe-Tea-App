/**
 * SearchBar stories — Phase 2 / Phase 6
 *
 * Covers every prop combination: size, loading, maxWidth, globalShortcut.
 * The keyboard-shortcut variant ('/' to focus) renders a live demo so
 * designers can verify the keypress feels right without leaving Storybook.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SearchBar } from './SearchBar';

const meta = {
  title:     'UI Primitives/SearchBar',
  component: SearchBar,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Single search input used across the storefront and admin. ' +
          'Controlled — parent owns `value` + `onChange`. Two visual ' +
          'sizes (md for storefront, sm for admin), an optional loading ' +
          'spinner, an optional global keyboard shortcut to focus, and ' +
          'an optional max-width cap.',
      },
    },
  },
  tags: ['autodocs'],
  // Default args satisfy the Story type. Each story below overrides
  // via `render`, so these placeholders never render in practice.
  args: { value: '', onChange: () => undefined },
} satisfies Meta<typeof SearchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

// Wrapper so each story has its own local state — SearchBar is controlled.
function Demo(props: Omit<React.ComponentProps<typeof SearchBar>, 'value' | 'onChange'>) {
  const [value, setValue] = useState('');
  return <SearchBar {...props} value={value} onChange={setValue} />;
}

export const Default: Story = {
  render: () => <Demo placeholder="Search 79 teas…" />,
};

export const Small: Story = {
  name: 'Size — small (admin)',
  render: () => <Demo size="sm" placeholder="Search orders…" />,
};

export const Loading: Story = {
  name: 'Loading spinner',
  render: () => <Demo loading placeholder="Filtering…" />,
};

export const WithMaxWidth: Story = {
  name: 'Constrained width',
  render: () => <Demo maxWidth="280px" placeholder="Narrow toolbar…" />,
};

export const WithKeyboardShortcut: Story = {
  name: 'Global shortcut ("/")',
  parameters: {
    docs: {
      description: {
        story:
          'Press the **/** key anywhere on this story (outside another input) ' +
          'and focus jumps to the search bar. Common pattern from GitHub / Algolia / Notion.',
      },
    },
  },
  render: () => <Demo globalShortcut="/" placeholder="Press / to focus" />,
};

export const SizeMatrix: Story = {
  name: 'Size comparison',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 320 }}>
      <div>
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 6px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Medium (storefront default)
        </p>
        <Demo size="md" placeholder="Search teas…" />
      </div>
      <div>
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 6px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Small (admin tables)
        </p>
        <Demo size="sm" placeholder="Filter rows…" />
      </div>
    </div>
  ),
};
