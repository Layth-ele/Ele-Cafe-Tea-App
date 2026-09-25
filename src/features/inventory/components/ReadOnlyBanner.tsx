/**
 * ReadOnlyBanner.tsx — Persistent info card shown on the employee
 * inventory dashboard when the validated session has role='readonly'.
 *
 * `role="status"` (not `alert`) — this is a persistent condition,
 * not a transient notification, so screen readers should announce
 * it politely on initial render, not interrupt.
 */

import { Info } from 'lucide-react';

export function ReadOnlyBanner() {
  return (
    <div className="irb" role="status">
      <Info size={18} aria-hidden="true" className="irb-icon" />
      <div className="irb-body">
        <p className="irb-title">View-only access</p>
        <p className="irb-text">
          You can see inventory but can't change levels or quantities.
          Ask your manager to upgrade your role to "Edit" if you need
          to update stock.
        </p>
      </div>
    </div>
  );
}
