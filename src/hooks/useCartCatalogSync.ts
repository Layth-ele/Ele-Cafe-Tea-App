/**
 * useCartCatalogSync — keep saved carts honest after a price change.
 *
 * Carts live in localStorage with the price at the moment each tea was
 * added. When the catalogue changes (e.g. every tea moved to $18 / 90g)
 * an old cart would show stale prices, and checkout would reject it
 * because the server always charges the live price. Once the catalogue
 * is loaded (shared, cached query), tea lines are re-priced and the
 * shopper is told once.
 */
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchTeas, queryKeys } from '@/lib/firebaseQueries';
import { useCartStore } from '@/store/cartStore';
import { tNow } from '@/i18n/useT';

export function useCartCatalogSync(): void {
  const hasTeaLines = useCartStore((s) => s.items.some((i) => !i.bundle));
  const sync = useCartStore((s) => s.syncWithCatalog);
  const { data: teas, isSuccess } = useQuery({
    queryKey: queryKeys.teas(),
    queryFn: fetchTeas,
    enabled: hasTeaLines,
    staleTime: 10 * 60 * 1000,
  });
  const notified = useRef(false);

  useEffect(() => {
    if (!isSuccess || !teas?.length || !hasTeaLines) return;
    // Ignore the offline fallback catalogue (mock teas are marked
    // unavailable) — never re-price a cart from placeholder data.
    if (teas.every((t) => t.available === false)) return;
    const changed = sync(teas);
    if (changed > 0 && !notified.current) {
      notified.current = true;
      toast.info(tNow(changed === 1 ? 'A price in your cart was updated to the current price.' : 'Prices in your cart were updated to the current prices.'));
    }
  }, [isSuccess, teas, hasTeaLines, sync]);
}
