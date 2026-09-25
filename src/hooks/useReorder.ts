/**
 * useReorder.ts — One-click "reorder a previous order" helper
 *
 * Used on /orders and inside the Order History section on /account.
 *
 * Behavior:
 *   • Iterates an order's `items` and pushes each one into the cart
 *     store via `addToCart`. Bundles are skipped — they carry
 *     personalization (recipient, message, etc.) that must be re-built
 *     in the gift builder, not silently re-added.
 *   • Looks up live product data from the teas store so we can
 *     attach the current `stock` cap and `gstApplicable` flag, and
 *     skip products that have been deleted or are sold out.
 *   • Falls back to the snapshotted order data when a tea is missing
 *     from the live catalog (rare — admin-deleted product). In that
 *     case stock is unknown and we let the user proceed; the server
 *     stock check at checkout will reject if needed.
 *   • Reports a structured summary so the caller can toast the user
 *     accurately ("Added 3 of 4 items — 1 sold out").
 *   • Opens the cart drawer on success so the customer immediately
 *     sees what was added and can adjust quantities before checkout.
 *
 * Pure data layer — no JSX. Returns a callable.
 */
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useCartStore } from '@/store/cartStore';
import { useCartDrawer } from '@/store/cartDrawerStore';
import { useTeasRealtime } from './useTeasRealtime';
import { isProductAvailable } from '@/lib/availability';
import type { OrderItem } from '@/schemas/order.schema';

import { tNow } from '@/i18n/useT';
export interface ReorderSummary {
  /** Number of distinct items successfully added (or incremented) in the cart. */
  added:       number;
  /** Items that couldn't be added because they're out of stock. */
  soldOut:     string[];
  /** Items where the cart already had the maximum allowed quantity. */
  capReached:  string[];
  /** Items that no longer exist in the catalog (admin-deleted). */
  missing:     string[];
  /** Bundle line items — skipped intentionally, see hook docblock. */
  bundles:     number;
  /** Total non-bundle items considered. */
  total:       number;
}

export function useReorder() {
  const addToCart = useCartStore(s => s.addToCart);
  const openCartDrawer = useCartDrawer(s => s.open);
  // The teas hook gives us live catalog data so we can look up current
  // stock + gst flag for each historical order item. If teas haven't
  // loaded yet, we fall back to the snapshot in the order doc itself.
  const { data: teas } = useTeasRealtime();

  const reorder = useCallback((items: OrderItem[] | undefined): ReorderSummary => {
    const summary: ReorderSummary = {
      added: 0, soldOut: [], capReached: [], missing: [], bundles: 0, total: 0,
    };
    if (!items || items.length === 0) {
      toast.info(tNow('This order has no items to reorder.'));
      return summary;
    }

    for (const it of items) {
      // Bundles carry recipient / message / sample selection — re-adding
      // them blindly would create a stale gift with last time's recipient
      // info. Surface them so the caller can prompt the user to rebuild.
      if (it.bundle) {
        summary.bundles += 1;
        continue;
      }
      summary.total += 1;

      // Look up live catalog entry. The teas hook stores docs by id.
      const live = teas.find(t => t.id === it.productId);

      if (!live) {
        // Product no longer exists. Skip — telling the user via toast is
        // less confusing than silently adding a phantom line item the
        // server will reject at checkout. (Could add fallback logic that
        // pushes the snapshot in anyway, but the order would just fail
        // server-side stock validation.)
        summary.missing.push(it.productName);
        continue;
      }

      // Turn 6: live availability check via the inventory projection.
      // Was a `liveStock <= 0` test on the legacy `stock` field; now
      // reads `available` (with a fail-closed semantic — see
      // availability.ts). Same UX outcome: tea no longer available
      // shows up in the "sold out" bucket of the reorder summary.
      if (!isProductAvailable(live)) {
        summary.soldOut.push(live.name ?? it.productName);
        continue;
      }

      // Push into cart. addToCart auto-increments if the item already
      // exists, and respects the stock cap. We translate its result
      // into our summary buckets.
      // We prefer live data but fall back to the order snapshot for
      // anything optional on Product (id, name, price, image), since
      // CartItem requires those fields to be definite.
      const result = addToCart({
        id:            live.id ?? it.productId,
        name:          live.name ?? it.productName,
        nameFr:        live.nameFr ?? undefined,
        // Use live price — historical orders may pre-date a price change
        // and we don't want to re-charge customers at last quarter's price.
        price:         typeof live.price === 'number' ? live.price : it.price,
        image:         live.image ?? it.image ?? '',
        category:      live.category,
        gstApplicable: !!live.gstApplicable,
      });

      if (result.added) {
        summary.added += 1;
      } else if (result.reason === 'sold-out') {
        summary.soldOut.push(live.name ?? it.productName);
      } else if (result.reason === 'cap-reached') {
        summary.capReached.push(live.name ?? it.productName);
      }
    }

    // Surface a single, accurate toast — the cart store already toasts
    // per-item failures (info "Only N available", error "sold out") so
    // we keep this one summary toast positive and avoid double-noise.
    if (summary.added > 0) {
      const skipped = summary.soldOut.length + summary.missing.length + summary.capReached.length;
      if (skipped > 0 || summary.bundles > 0) {
        const bits: string[] = [];
        if (summary.missing.length)    bits.push(tNow('{count} no longer available', { count: summary.missing.length }));
        if (summary.soldOut.length)    bits.push(tNow('{count} sold out', { count: summary.soldOut.length }));
        if (summary.capReached.length) bits.push(tNow('{count} at stock limit', { count: summary.capReached.length }));
        if (summary.bundles > 0)       bits.push(tNow(summary.bundles > 1 ? '{count} gift bundles skipped' : '{count} gift bundle skipped', { count: summary.bundles }));
        toast.success(tNow(summary.added > 1 ? 'Added {count} items to your cart — {details}.' : 'Added {count} item to your cart — {details}.', { count: summary.added, details: bits.join(', ') }));
      } else {
        toast.success(tNow(summary.added > 1 ? 'Added {count} items to your cart.' : 'Added {count} item to your cart.', { count: summary.added }));
      }
      // Open the drawer so the customer can immediately see / adjust.
      openCartDrawer();
    } else {
      // Nothing landed — give a single explanatory toast rather than
      // letting the cart store's per-item toasts fire silently.
      if (summary.bundles > 0 && summary.total === 0) {
        toast.info(tNow('Gift bundles need to be rebuilt in the gift builder — they include personal messages.'));
      } else if (summary.missing.length > 0 && summary.soldOut.length === 0) {
        toast.error(tNow('None of the items in this order are available anymore.'));
      } else if (summary.soldOut.length > 0) {
        toast.error(tNow('Everything in this order is currently sold out — please try again later.'));
      } else {
        toast.error(tNow('Couldn\'t reorder — please try again.'));
      }
    }

    return summary;
  }, [addToCart, openCartDrawer, teas]);

  return reorder;
}
