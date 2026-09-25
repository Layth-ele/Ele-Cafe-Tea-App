export function formatFreeShippingSubline(
  threshold: number | undefined,
  /** Optional translator (useT()) so the line follows the site language. */
  t: (key: string, vars?: Record<string, string | number>) => string = (k, v) =>
    v ? k.replace(/\{(\w+)\}/g, (m, n: string) => String(v[n] ?? m)) : k,
  /** Price formatter for the site language (formatMoneyShort). */
  money: (n: number) => string = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`,
): string {
  const v = Number(threshold) || 0;
  if (v <= 0) return t('On all orders');
  return t('On orders over {amount}', { amount: money(v) });
}

export function calcShippingFee(
  subtotal: number,
  s: { freeShippingThreshold?: number; defaultShippingFee?: number } | undefined,
): number {
  const threshold = Number(s?.freeShippingThreshold) || 0;
  if (threshold <= 0) return 0;
  if (subtotal >= threshold) return 0;
  return Math.max(0, Number(s?.defaultShippingFee) || 0);
}
