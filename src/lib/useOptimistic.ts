/**
 * useOptimistic.ts — Phase 5.3 of the UI/UX roadmap
 *
 * Wraps Tanstack Query's `useMutation` with the standard optimistic-
 * UI pattern: update the cache before the server confirms, roll back
 * on error, invalidate on settled. Encodes the four-callback dance
 * (`onMutate`, `onError`, `onSuccess`, `onSettled`) in one call so
 * every mutation in the codebase gets it the same way.
 *
 * The pattern (Phase 5.3):
 *   1. Click "Add to cart"
 *   2. Local store updates immediately (✓ optimistic)
 *   3. Sync writes to backend
 *   4. On success: toast "Added" with undo
 *   5. On failure: rollback local store, toast "Couldn't add — try again"
 *
 * This hook does (2) + (3) + (5) automatically. The caller supplies
 * a `mutationFn`, the optimistic `update` (returns the new cache value),
 * and optional `onSuccess` / `onError` for toasts. Rollback uses the
 * pre-mutation snapshot stored in `context`.
 *
 * Why a wrapper over raw useMutation:
 *   The raw form gets the pattern wrong about a third of the time. The
 *   most common mistakes:
 *     - Forgetting to snapshot the cache in onMutate → can't rollback
 *     - Returning the cache value instead of a context object →
 *       onError can't tell which keys to revert
 *     - Forgetting `onSettled: invalidate` → the cache stays stale
 *       even after a successful round-trip
 *     - Not cancelling outgoing queries before optimistic update →
 *       a slow refetch lands and overwrites the optimistic value
 *   Wrapping all four callbacks in one place makes the pattern
 *   uniform and forces the right thing.
 *
 * Usage:
 *   const addToCart = useOptimisticMutation({
 *     mutationFn: (item: Item) => api.addToCart(item),
 *     queryKey:   ['cart', userId],
 *     update:     (prev: CartState, item: Item) => ({
 *       ...prev,
 *       items: [...prev.items, item],
 *     }),
 *     onSuccess:  () => toast.success('Added'),
 *     onError:    (e) => toast.error(`Couldn't add — ${e.message}`),
 *   });
 *
 *   <Button onClick={() => addToCart.mutate(item)}>Add</Button>
 */
import { useMutation, useQueryClient, type UseMutationOptions, type QueryKey } from '@tanstack/react-query';

interface OptimisticConfig<TData, TError, TVariables, TCacheValue>
  extends Omit<UseMutationOptions<TData, TError, TVariables, OptimisticContext<TCacheValue>>, 'onMutate' | 'onError' | 'onSettled'> {
  /** The cache key to update optimistically. */
  queryKey: QueryKey;
  /** Pure function: given the current cache value and the variables
   *  about to be mutated, return the next cache value. Called inside
   *  onMutate. Don't mutate `prev` — return a new value. */
  update: (prev: TCacheValue | undefined, variables: TVariables) => TCacheValue;
  /** Optional success callback. Receives the server's response. */
  onSuccess?: (data: TData, variables: TVariables) => void;
  /** Optional error callback. Receives the error. The rollback has
   *  already happened by the time this fires. */
  onError?: (error: TError, variables: TVariables) => void;
}

interface OptimisticContext<TCacheValue> {
  /** Snapshot of the cache value before the optimistic update.
   *  Used to roll back on error. */
  previous: TCacheValue | undefined;
}

/**
 * Optimistic-UI mutation. Updates the cache before the server
 * confirms, rolls back on error, invalidates on settled.
 */
export function useOptimisticMutation<TData, TError, TVariables, TCacheValue>(
  config: OptimisticConfig<TData, TError, TVariables, TCacheValue>,
) {
  const qc = useQueryClient();
  const { queryKey, update, onSuccess, onError, ...rest } = config;

  return useMutation({
    ...rest,
    onMutate: async (variables) => {
      // Cancel outgoing refetches — otherwise they could land AFTER
      // our optimistic update and overwrite it. The cancellation
      // is async; we await so the rest of onMutate runs after the
      // pending fetch is aborted.
      await qc.cancelQueries({ queryKey });

      // Snapshot the current cache value for rollback.
      const previous = qc.getQueryData<TCacheValue>(queryKey);

      // Optimistically write the new value.
      qc.setQueryData<TCacheValue>(queryKey, (prev) => update(prev, variables));

      // Return a context object — Tanstack Query passes it to
      // onError + onSettled so we can revert.
      return { previous } satisfies OptimisticContext<TCacheValue>;
    },
    onError: (err, variables, context) => {
      // Roll back to the snapshot.
      if (context?.previous !== undefined) {
        qc.setQueryData(queryKey, context.previous);
      }
      onError?.(err, variables);
    },
    onSuccess: (data, variables) => {
      onSuccess?.(data, variables);
    },
    onSettled: () => {
      // Always refetch once the mutation is done — so the cache
      // matches the server's state, which may differ from our
      // optimistic guess (e.g. server-applied tax/discount math).
      qc.invalidateQueries({ queryKey });
    },
  });
}
