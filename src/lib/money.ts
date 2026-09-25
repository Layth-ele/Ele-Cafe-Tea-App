/**
 * money.ts — prices in the site language.
 *   English: $18.00      French (Canada): 18,00 $
 * Reads the current language at call time; components re-render on a
 * language switch because they subscribe via useT()/useLang().
 */
import { currentLang } from '@/i18n/useT';
import type { Lang } from '@/i18n/translations';

const NBSP = ' ';

export function formatMoney(n: number | string | null | undefined, lang: Lang = currentLang()): string {
  const v = Number(n ?? 0);
  const fixed = (Number.isFinite(v) ? v : 0).toFixed(2);
  return lang === 'fr' ? `${fixed.replace('.', ',')}${NBSP}$` : `$${fixed}`;
}

/** Whole dollars without cents ("$100" / "100 $"); cents only when needed. */
export function formatMoneyShort(n: number | string | null | undefined, lang: Lang = currentLang()): string {
  const v = Number(n ?? 0);
  if (!Number.isInteger(v)) return formatMoney(v, lang);
  return lang === 'fr' ? `${v}${NBSP}$` : `$${v}`;
}
