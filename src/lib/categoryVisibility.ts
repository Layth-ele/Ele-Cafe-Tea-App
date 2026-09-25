/**
 * categoryVisibility — pure rule behind useVisibleCategoryIds (kept free of
 * Firebase imports so it is unit-testable).
 */

/** Ungated ids always show; gated ids only when stocked. */
export function resolveVisibleCategoryIds(
  allIds: readonly string[],
  gated: readonly string[],
  stocked: readonly string[] | null | undefined,
): Set<string> {
  const have = new Set(stocked ?? []);
  return new Set(allIds.filter((id) => !gated.includes(id) || have.has(id)));
}
