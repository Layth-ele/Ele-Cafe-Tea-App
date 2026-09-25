/**
 * OrderStatusTimeline — Phase 11.7.
 *
 * Renders a 4-step horizontal progress indicator showing where the
 * order is in its fulfillment lifecycle. Maps the OrderStatus values
 * onto 4 visible steps:
 *
 *   placed       → pending (card hold placed) and everything after
 *   confirmed    → in_progress+ (stock confirmed, card charged)
 *   shipped      → shipped
 *   delivered    → delivered
 *
 * Cancelled / rejected / expired orders skip the timeline and render
 * a status pill instead — these are terminal non-happy paths and a
 * progress bar would mislead.
 *
 * Carrier link: when status >= shipped AND trackingNumber + carrier
 * are present, append a "Track with {carrier}" link. The carrier
 * field is a known code (canada-post, ups, fedex, purolator); we map
 * to a tracking URL template.
 */
// Phase-12 schema-fidelity round 2: the parallel `src/types/firestore.ts`
// type system has been removed in favour of importing from the canonical
// schemas barrel. `Order as OrderDoc` preserves the local name while
// sourcing the type from order.schema.ts — which means the OrderStatus
// enum now correctly includes `'ready_for_pickup'` (the firestore.ts
// version had been silently incomplete since pickup orders were added).
import type { Order as OrderDoc, OrderStatus } from '@/types';

import { useT } from '@/i18n/useT';
interface Step {
  id:     'placed' | 'confirmed' | 'shipped' | 'delivered';
  label:  string;
  /** OrderStatus values that mean this step has been REACHED.
   *  A step is "complete" if any of these (or a later step's
   *  statuses) match the order. */
  reachedBy: OrderStatus[];
}

const STEPS: Step[] = [
  { id: 'placed',    label: 'Placed',    reachedBy: ['pending', 'in_progress', 'ready_for_pickup', 'shipped', 'delivered'] },
  { id: 'confirmed', label: 'Confirmed', reachedBy: ['in_progress', 'ready_for_pickup', 'shipped', 'delivered'] },
  // Schema-fidelity round 2: 'ready_for_pickup' was previously missing
  // from this step's reachedBy list. For pickup orders the label is
  // dynamically rewritten to "Ready" further down — without
  // 'ready_for_pickup' in this list, an order at that status would
  // render with neither "Ready" nor "Picked up" reached, leaving the
  // customer's timeline silently stuck at "Confirmed" even though the
  // café is holding their order at the counter.
  { id: 'shipped',   label: 'Shipped',   reachedBy: ['ready_for_pickup', 'shipped', 'delivered'] },
  { id: 'delivered', label: 'Delivered', reachedBy: ['delivered'] },
];

const TERMINAL_NON_HAPPY: OrderStatus[] = ['cancelled', 'rejected', 'expired'];

const CARRIER_TRACKING_URLS: Record<string, (n: string) => string> = {
  'canada-post': (n) => `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${encodeURIComponent(n)}`,
  'canadapost':  (n) => `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${encodeURIComponent(n)}`,
  'ups':         (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  'fedex':       (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  'purolator':   (n) => `https://www.purolator.com/en/shipping/tracker?pin=${encodeURIComponent(n)}`,
  'dhl':         (n) => `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${encodeURIComponent(n)}`,
};

function carrierLabel(carrier: string): string {
  const map: Record<string, string> = {
    'canada-post': 'Canada Post',
    'canadapost':  'Canada Post',
    'ups':         'UPS',
    'fedex':       'FedEx',
    'purolator':   'Purolator',
    'dhl':         'DHL',
  };
  return map[carrier.toLowerCase()] ?? carrier;
}

interface Props {
  order: Pick<OrderDoc, 'status' | 'trackingNumber' | 'carrier' | 'fulfillmentMethod'>;
}

export function OrderStatusTimeline({ order }: Props) {
  const t = useT();
  const { status, trackingNumber, carrier, fulfillmentMethod } = order;

  // Terminal non-happy paths: status pill, no timeline.
  if (TERMINAL_NON_HAPPY.includes(status)) {
    return (
      <div className="ost-terminal" data-status={status} role="status">
        <span className="ost-terminal-label">
          {status === 'cancelled' && 'Cancelled'}
          {status === 'rejected'  && 'Rejected'}
          {status === 'expired'   && 'Expired'}
        </span>
      </div>
    );
  }

  // Pickup orders: collapse "shipped" + "delivered" labels to
  // "ready" + "picked up" since they don't ship.
  const isPickup = fulfillmentMethod === 'pickup';
  const steps = isPickup
    ? STEPS.map((s) =>
        s.id === 'shipped'   ? { ...s, label: 'Ready' } :
        s.id === 'delivered' ? { ...s, label: 'Picked up' } : s,
      )
    : STEPS;

  const trackingUrlBuilder = carrier ? CARRIER_TRACKING_URLS[carrier.toLowerCase()] : undefined;
  const trackingUrl = trackingUrlBuilder && trackingNumber ? trackingUrlBuilder(trackingNumber) : null;

  const currentIndex = steps.reduce((acc, s, i) => (s.reachedBy.includes(status) ? i : acc), 0);

  return (
    <div className="ost-timeline" role="group" aria-label={t('Order status')}>
      <ol className="ost-steps" role="list">
        {steps.map((s, i) => {
          const isComplete = i <= currentIndex;
          const isCurrent  = i === currentIndex;
          return (
            <li
              key={s.id}
              className="ost-step"
              data-complete={isComplete ? 'true' : 'false'}
              data-current={isCurrent ? 'true' : 'false'}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="ost-dot" aria-hidden="true">
                {isComplete ? '✓' : i + 1}
              </span>
              <span className="ost-label">{t(s.label)}</span>
            </li>
          );
        })}
      </ol>

      {/* Carrier tracking link — only when shipped AND we have a
          carrier + tracking number AND the carrier code maps to a
          known URL template. */}
      {!isPickup && trackingUrl && currentIndex >= 2 && (
        <p className="ost-tracking">
          <span className="ost-tracking-num">{t('Tracking: {number}', { number: trackingNumber ?? '' })}</span>
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ost-tracking-link"
          >
            {t('Track with {carrier} ↗', { carrier: carrier ? carrierLabel(carrier) : t('carrier') })}
          </a>
        </p>
      )}
      {!isPickup && trackingNumber && !trackingUrl && currentIndex >= 2 && (
        <p className="ost-tracking">
          <span className="ost-tracking-num">{t('Tracking: {number}', { number: trackingNumber ?? '' })}</span>
          {carrier && <span className="ost-tracking-carrier"> {t('via {carrier}', { carrier: carrierLabel(carrier) })}</span>}
        </p>
      )}
    </div>
  );
}
