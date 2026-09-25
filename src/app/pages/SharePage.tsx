/**
 * SharePage.tsx — Phase 9.5 of the UI/UX roadmap.
 *
 * Destination for the Web Share Target declared in the PWA manifest.
 * When the installed app receives a share from the OS share sheet, the
 * URL+title+text land here as querystring params (manifest declares
 * `method: 'GET'` so the payload is in the URL).
 *
 * Matching strategy (in priority order):
 *   1. If `url` points at an Ele Café tea profile (`/tea-profile/:cat/:slug`)
 *      — extract the slug and redirect to the canonical product page.
 *   2. If `url` points at an Ele Café pairing page (`/pairings/:slug`)
 *      — redirect to the canonical pairing page.
 *   3. If `title` or `text` exists — redirect to `/products?q=<search>`
 *      so the catalog filter pre-fills with the shared content's title.
 *   4. Fallback — redirect to `/products` with no filter.
 *
 * This is intentionally a thin redirector, not a full page. The user
 * expects a fast "took me somewhere useful" feel, not a landing page
 * to read. We use react-router's `<Navigate>` so the SPA never paints
 * the share intermediate state.
 *
 * Safari iOS doesn't implement Web Share Target as of 2026, but the
 * Chrome / Edge / Samsung Internet / Android-WebView combination
 * covers ~60% of mobile traffic. Zero cost on browsers that don't
 * support it — they just never reach this route.
 */
import { Navigate, useSearchParams } from 'react-router';
import { ROUTES } from '@/lib/routes';

export function SharePage() {
  const [params] = useSearchParams();
  const url   = params.get('url')   ?? '';
  const title = params.get('title') ?? '';
  const text  = params.get('text')  ?? '';

  // 1. Tea profile deep link.
  const teaMatch = /\/tea-profile\/([^/?#]+)\/([^/?#]+)/i.exec(url);
  if (teaMatch) {
    return <Navigate to={`/tea-profile/${teaMatch[1]}/${teaMatch[2]}`} replace />;
  }

  // 2. Pairing page deep link.
  const pairingMatch = /\/pairings\/([^/?#]+)/i.exec(url);
  if (pairingMatch) {
    return <Navigate to={`/pairings/${pairingMatch[1]}`} replace />;
  }

  // 3. Search prefill from title or text — the title is usually the
  //    page title from the shared article, which is a useful search
  //    keyword set. Cap to 80 chars so a giant pasted body of text
  //    doesn't blow out the query string.
  const query = (title || text).trim().slice(0, 80);
  if (query) {
    return <Navigate to={`${ROUTES.PRODUCTS}?q=${encodeURIComponent(query)}`} replace />;
  }

  // 4. Fallback — drop the user at the catalog so they have somewhere
  //    to start, rather than at /share which is meaningless on its own.
  return <Navigate to={ROUTES.PRODUCTS} replace />;
}
