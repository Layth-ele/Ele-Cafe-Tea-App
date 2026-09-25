/**
 * Empty State pattern stories — Phase 2.3
 *
 * Three canonical variants of the empty state, used wherever a list,
 * grid, search, or filter resolves to zero items. Each variant carries
 * a different intent:
 *
 *   1. Empty with CTA       — first-run / zero-state ("you haven't done X yet")
 *   2. Empty with help link — search yielded nothing; offer guidance
 *   3. Empty with illustration — high-stakes empty, more visual emphasis
 *
 * The components are local to this story — Storybook is the contract.
 * Real pages duplicate the structure inline (CartPage's empty basket,
 * AdminProducts' "No teas found") rather than importing a shared
 * primitive, because each empty state ships with copy and a CTA tuned
 * to its context.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { ShoppingBag, Search, Inbox } from 'lucide-react';

const meta = {
  title: 'Patterns/Empty State',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Empty-state recipes used across the app. Spec source: ' +
          '`STATES_GUIDE.md`. Each variant is a copy-paste structure ' +
          'for empty list/grid/search/filter results.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyWithCTA: Story = {
  name: '1 — With CTA (first-run)',
  render: () => (
    <div className="cp-empty">
      <div className="cp-empty-inner">
        <div className="empty-state-icon cp-empty-icon">
          <ShoppingBag size={24} />
        </div>
        <h2 className="cp-empty-title">Your basket is empty</h2>
        <p className="cp-empty-msg">
          Discover our collection of premium teas sourced from the world's finest gardens.
        </p>
        <button type="button" className="btn btn-dark btn-lg">Browse Teas</button>
      </div>
    </div>
  ),
};

export const EmptyWithHelp: Story = {
  name: '2 — With help (search yielded nothing)',
  render: () => (
    <div className="cp-empty">
      <div className="cp-empty-inner">
        <div className="empty-state-icon cp-empty-icon">
          <Search size={24} />
        </div>
        <h2 className="cp-empty-title">No teas match "yokocha"</h2>
        <p className="cp-empty-msg">
          Try a broader term, or browse by category from the sidebar. Spell-checked tea names from the catalog will surface here.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button type="button" className="btn btn-outline">Clear search</button>
          <button type="button" className="btn btn-ghost">Browse all</button>
        </div>
      </div>
    </div>
  ),
};

export const EmptyWithIllustration: Story = {
  name: '3 — With illustration (high-stakes)',
  render: () => (
    <div className="cp-empty">
      <div className="cp-empty-inner">
        <div className="empty-state-icon cp-empty-icon" style={{ width: 72, height: 72 }}>
          <Inbox size={32} />
        </div>
        <h2 className="cp-empty-title">No orders yet</h2>
        <p className="cp-empty-msg">
          When you place an order, it'll show up here with its status. You'll get an email at every step.
        </p>
        <button type="button" className="btn btn-dark btn-lg">Start shopping</button>
      </div>
    </div>
  ),
};
