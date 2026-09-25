/**
 * Error State pattern stories — Phase 2.3
 *
 * Four classes of error, four different UX shapes. STATES_GUIDE.md
 * documents which goes where:
 *
 *   - Network          — transient, retryable. Banner + retry button.
 *   - Validation       — user-correctable. Inline next to the field.
 *   - Permission       — non-retryable. Explain + offer escape route.
 *   - Not found (404)  — wrong URL. Offer the nearest valid route.
 *
 * The component shapes shown here mirror real production callsites
 * (ErrorBoundary, AccountPage `ap-orders-error`, the route-level
 * NotFoundPage). Stories are visual contracts — designers can review
 * the language and CTA placement without touching the running app.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { AlertTriangle, AlertCircle, Lock, FileQuestion, RefreshCw } from 'lucide-react';

const meta = {
  title: 'Patterns/Error State',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Four error states cover ~99% of failure paths: network (retry), ' +
          'validation (inline correction), permission (no retry), ' +
          'not-found (route recovery). Copy and CTA placement are ' +
          'tuned per class.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const NetworkError: Story = {
  name: '1 — Network (retryable)',
  render: () => (
    <div className="ap-orders-error" style={{ maxWidth: 480 }}>
      <p className="ap-orders-error-msg">
        We couldn't load your recent orders right now. Check your connection and try again.
      </p>
      <button type="button" className="btn btn-outline btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <RefreshCw size={13} /> Retry
      </button>
    </div>
  ),
};

export const ValidationError: Story = {
  name: '2 — Validation (inline)',
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <label htmlFor="email-bad" className="field-label" style={{ display: 'block', marginBottom: 4 }}>Email *</label>
      <input
        id="email-bad"
        type="email"
        defaultValue="not-an-email"
        aria-invalid="true"
        aria-describedby="email-bad-err"
        className="field invalid"
        style={{ width: '100%' }}
      />
      <p id="email-bad-err" role="alert" style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <AlertCircle size={12} />
        Please enter a valid email address.
      </p>
    </div>
  ),
};

export const PermissionError: Story = {
  name: '3 — Permission (no retry)',
  render: () => (
    <div className="cp-empty">
      <div className="cp-empty-inner">
        <div className="empty-state-icon cp-empty-icon">
          <Lock size={24} />
        </div>
        <h2 className="cp-empty-title">Not authorised</h2>
        <p className="cp-empty-msg">
          You need an admin account to view this page. Sign in with an admin email, or head back to the storefront.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button type="button" className="btn btn-outline">Sign in as admin</button>
          <button type="button" className="btn btn-ghost">Back to home</button>
        </div>
      </div>
    </div>
  ),
};

export const NotFoundError: Story = {
  name: '4 — Not found (404)',
  render: () => (
    <div className="cp-empty">
      <div className="cp-empty-inner">
        <div className="empty-state-icon cp-empty-icon">
          <FileQuestion size={24} />
        </div>
        <h2 className="cp-empty-title">Page not found</h2>
        <p className="cp-empty-msg">
          The page you're looking for doesn't exist anymore — or it never did. Try our tea catalog, or head back home.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button type="button" className="btn btn-dark">Browse teas</button>
          <button type="button" className="btn btn-ghost">Back to home</button>
        </div>
      </div>
    </div>
  ),
};

export const FatalError: Story = {
  name: '5 — Fatal (ErrorBoundary)',
  render: () => (
    <div className="eb-wrap">
      <div className="eb-inner">
        <div className="eb-icon-circle eb-icon-circle-danger">
          <AlertTriangle size={28} className="eb-icon-danger" />
        </div>
        <h2 className="eb-h2">Something went wrong</h2>
        <p className="eb-msg">
          An unexpected error occurred. Please reload to try again.
        </p>
        <button type="button" className="btn btn-dark eb-btn">
          <RefreshCw size={14} /> Reload page
        </button>
      </div>
    </div>
  ),
};
