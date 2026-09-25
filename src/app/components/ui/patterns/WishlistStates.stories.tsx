import type { Meta, StoryObj } from '@storybook/react';
import { Heart, Share2 } from 'lucide-react';

const meta = {
  title: 'Patterns/Wishlist States',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Wishlist UI/UX state patterns aligned with `WishlistPage`: empty, populated, and shared-list states.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyWishlist: Story = {
  render: () => (
    <main className="wl-page">
      <h1 className="wl-page-title">Your wishlist</h1>
      <div className="wl-empty">
        <div className="empty-state-icon cp-empty-icon" aria-hidden="true">
          <Heart size={24} />
        </div>
        <p>You haven’t saved any teas yet.</p>
        <button type="button" className="btn btn-dark">Browse teas</button>
      </div>
    </main>
  ),
};

export const SharedWishlist: Story = {
  render: () => (
    <main className="wl-page">
      <h1 className="wl-page-title">Shared wishlist</h1>
      <p className="wl-shared-sub">A friend shared 3 teas with you.</p>
      <div className="wl-empty" style={{ marginTop: 12 }}>
        <div className="empty-state-icon cp-empty-icon" aria-hidden="true">
          <Share2 size={24} />
        </div>
        <p>Use “Add to my wishlist” on each tea card to save items locally.</p>
        <button type="button" className="btn btn-outline">View shared items</button>
      </div>
    </main>
  ),
};
