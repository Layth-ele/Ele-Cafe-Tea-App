/**
 * useT.ts — EN/FR translation for the customer-facing site.
 *
 * Keys are the English source strings; src/i18n/translations.ts maps each
 * to French. Placeholders use {name}:
 *
 *   const t = useT();
 *   <h1>{t('Our Teas')}</h1>
 *   <input placeholder={t('Search {count} teas…', { count: 75 })} />
 *
 * Outside React (toasts fired from callbacks, stores, helpers) use tNow(),
 * which reads the current language from the store at call time.
 *
 * Every literal key passed to t()/tNow() must have a French entry — the
 * unit test tests/unit/i18n/translations.test.ts scans the source and
 * fails on any missing one, so the French site can't silently fall back
 * to English.
 *
 * Tea content (name, description, benefits…) is NOT in the dictionary:
 * each /teas doc carries its own French fields (nameFr, descriptionFr, …)
 * — use localizeTea().
 *
 * SEO data (JSON-LD, meta tags) stays English regardless of language:
 * don't pass t() output into SeoHead.
 */
import { Fragment, createElement, useCallback, type ReactNode } from 'react';
import { useLanguageStore } from '@/store/languageStore';
import { STRINGS, type Lang } from './translations';

export type { Lang };

export type TVars = Record<string, string | number>;
export type TFunc = (key: string, vars?: TVars) => string;

const fill = (s: string, vars?: TVars) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;

/** Translate one key for a given language. */
export function translate(key: string, lang: Lang, vars?: TVars): string {
  return fill(lang === 'fr' ? (STRINGS[key]?.fr ?? key) : key, vars);
}

/** Back-compat alias used by languageStore.t. */
export function translateStatic(key: string, lang: Lang): string {
  return translate(key, lang);
}

/** A category's display name in `lang`: the French name saved on the
 *  category (dynamic — set in Admin) wins; otherwise the built-in
 *  dictionary; otherwise the English name. */
export function categoryName(c: { label: string; labelFr?: string }, lang: Lang): string {
  if (lang !== 'fr') return c.label;
  return c.labelFr || translate(c.label, 'fr');
}

/** Current language (re-renders on change). */
export function useLang(): Lang {
  return useLanguageStore((s) => s.language) as Lang;
}

/** Translation function bound to the current language. */
export function useT(): TFunc {
  const lang = useLang();
  return useCallback((key: string, vars?: TVars) => translate(key, lang, vars), [lang]);
}

/** Rich translation: placeholders can be React nodes (bold text, links,
 *  formatted prices), so a whole sentence is translated as one unit and
 *  French word order still works:
 *    tx('Your order {id} has been received.', { id: <code>{orderId}</code> })
 */
export type TxVars = Record<string, ReactNode>;
export function translateRich(key: string, lang: Lang, vars: TxVars): ReactNode {
  const s = lang === 'fr' ? (STRINGS[key]?.fr ?? key) : key;
  return createElement(Fragment, null, ...s.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return createElement(Fragment, { key: i }, m && m[1] in vars ? vars[m[1]] : part);
  }));
}
export function useTx(): (key: string, vars: TxVars) => ReactNode {
  const lang = useLang();
  return useCallback((key: string, vars: TxVars) => translateRich(key, lang, vars), [lang]);
}

/** Translate at call time outside React (toasts in callbacks, stores). */
export function tNow(key: string, vars?: TVars): string {
  return translate(key, useLanguageStore.getState().language as Lang, vars);
}

/** Marks a string in data (menus, options, step names…) as a translation
 *  key without translating it yet — render it with t(item.label). The
 *  completeness test picks these up like t('…') calls. */
export const k = (s: string): string => s;

/** Current language outside React. */
export const currentLang = (): Lang => useLanguageStore.getState().language as Lang;

/** Locale for dates / numbers in the current language. */
export const localeFor = (lang: Lang) => (lang === 'fr' ? 'fr-CA' : 'en-CA');

// ── Tea content ─────────────────────────────────────────────────────────────

type TeaText = {
  name?: string; nameFr?: string | null;
  description?: string; descriptionFr?: string | null;
  benefits?: string; benefitsFr?: string | null;
  ingredients?: string; ingredientsFr?: string | null;
  origin?: string; originFr?: string | null;
  regions?: string; regionsFr?: string | null;
};

const pick = (en: string | undefined, fr: string | null | undefined, lang: Lang) =>
  (lang === 'fr' && typeof fr === 'string' && fr.trim() ? fr : en) ?? '';

/** The tea's own text in the current language (French fields from the
 *  /teas doc, falling back to English when a field hasn't been translated). */
export function localizeTea(p: TeaText | null | undefined, lang: Lang) {
  return {
    name:        pick(p?.name,        p?.nameFr,        lang),
    description: pick(p?.description, p?.descriptionFr, lang),
    benefits:    pick(p?.benefits,    p?.benefitsFr,    lang),
    ingredients: pick(p?.ingredients, p?.ingredientsFr, lang),
    origin:      pick(p?.origin,      p?.originFr,      lang),
    regions:     pick(p?.regions,     p?.regionsFr,     lang),
  };
}

/** A pairing's (combo's) title/description in the current language. */
export function localizeCombo(c: { title?: string; titleFr?: string | null; description?: string; descriptionFr?: string | null } | null | undefined, lang: Lang) {
  return { title: pick(c?.title, c?.titleFr, lang), description: pick(c?.description, c?.descriptionFr, lang) };
}

/** Hook form of localizeTea. */
export function useLocalizedTea(p: TeaText | null | undefined) {
  return localizeTea(p, useLang());
}
