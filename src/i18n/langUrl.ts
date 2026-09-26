/**
 * langUrl.ts — French pages live under /fr (/fr/products, /fr/tea-profile/…).
 *
 * The URL and the language always agree: /fr/… shows French, everything
 * else English. Switching language rewrites the address in place (no
 * reload) and the router remounts under the new base (see LangRouter in
 * App.tsx). renderSeo serves the same /fr URLs server-rendered in French,
 * with hreflang links between the two versions.
 */
import type { Lang } from './translations';

export const FR_BASE = '/fr';

export const isFrPath = (pathname: string): boolean =>
  pathname === FR_BASE || pathname.startsWith(`${FR_BASE}/`);

/** The same page's path in `lang` ("/products" ⇄ "/fr/products"). */
export function localizedPath(pathname: string, lang: Lang): string {
  const bare = isFrPath(pathname) ? pathname.slice(FR_BASE.length) || '/' : pathname;
  if (lang !== 'fr') return bare;
  return bare === '/' ? FR_BASE : `${FR_BASE}${bare}`;
}

/** Absolute URL of `url` in `lang` (for canonical / hreflang). */
export function localizedUrl(url: string, lang: Lang): string {
  try {
    const u = new URL(url);
    u.pathname = localizedPath(u.pathname, lang);
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

/** Rewrite the address bar to `lang`'s version of the current page. */
export function syncUrlToLang(lang: Lang): void {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  const next = localizedPath(pathname, lang);
  if (next !== pathname)
    window.history.replaceState(window.history.state, '', next + search + hash);
}
