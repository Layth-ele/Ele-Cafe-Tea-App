/**
 * Breadcrumbs.tsx — Phase 4.2 of the UI/UX roadmap
 *
 * Renders a horizontal breadcrumb trail PLUS the matching schema.org
 * BreadcrumbList JSON-LD. Two outputs from one call site keeps SEO
 * and UX in lockstep — when you change the trail in one place, both
 * Google's rich snippets and the visible nav update together.
 *
 * Why JSON-LD too:
 *   Google rewards BreadcrumbList markup with breadcrumb-style search
 *   results (the "elecafe.ca › Teas › Black › English Breakfast"
 *   chip under the result). Without it, the SERP shows the bare URL.
 *   The markup costs ~200 bytes inline in the head and is one of the
 *   highest-leverage SEO wins per byte.
 *
 * Where to use:
 *   - /products/:cat                 [Home, Teas, {category}]
 *   - /tea-profile/:cat/:slug        [Home, Teas, {category}, {tea name}]
 *   - /pairings/:slug                [Home, Pairings, {pairing title}]
 *   - /orders/:id                    [Home, Account, Orders, #{id}]
 *   - /account/*                     [Home, Account, …]
 *   - /admin/*                       [Admin, {section}, …]
 *
 * Where NOT to use:
 *   - /                              (top-level, redundant)
 *   - /products                      (single-segment nav, redundant)
 *   - /login, /signup                (auth flows; breadcrumbs read as noise)
 *   - /checkout                      (focus-stealing on a conversion page)
 *
 * Accessibility:
 *   - Wrapping <nav aria-label="Breadcrumb"> per WCAG technique G63.
 *   - Last item uses aria-current="page" so screen readers
 *     announce "current page" alongside the label.
 *   - Separators use aria-hidden so SR users hear "Home, Teas,
 *     Black" not "Home › Teas › Black".
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { SITE_BASE } from '@/lib/routes';

import { useT } from '@/i18n/useT';
export interface BreadcrumbItem {
  /** Visible label. Truncated by CSS at narrow widths if needed. */
  name: string;
  /** Path. The LAST item's path is used only for JSON-LD; it
   *  doesn't render as a link (it's the current page). */
  url: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Separator character. Defaults to a chevron; '·' or '/' work too. */
  separator?: ReactNode;
  /** Skip emitting the JSON-LD even if items are present. Useful in
   *  Storybook / tests where we don't want script tags polluting the
   *  document head. Defaults to false (always emits in production). */
  withoutSchema?: boolean;
}

export function Breadcrumbs({
  items,
  separator = '›',
  withoutSchema = false,
}: BreadcrumbsProps) {
  const t = useT();
  // Render nothing for empty / single-item breadcrumbs — a one-step
  // trail is ambient noise. Keep the JSX minimal in those cases so
  // the parent layout doesn't end up with a stray <nav> in the DOM.
  if (items.length < 2) return null;

  const last = items.length - 1;

  return (
    <>
      <nav aria-label={t('Breadcrumb')} className="bc-nav">
        <ol className="bc-list">
          {items.map((item, idx) => {
            const isLast = idx === last;
            return (
              <li key={`${idx}-${item.url}`} className="bc-item">
                {isLast ? (
                  <span className="bc-current" aria-current="page">{t(item.name)}</span>
                ) : (
                  <Link to={item.url} className="bc-link">{t(item.name)}</Link>
                )}
                {!isLast && (
                  <span className="bc-sep" aria-hidden="true">{separator}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {!withoutSchema && <BreadcrumbJsonLd items={items} />}
    </>
  );
}

/** Inline JSON-LD <script type="application/ld+json"> for the
 *  schema.org BreadcrumbList. React 19 hoists script tags into <head>
 *  natively when they're rendered as children of any component, so
 *  we don't need react-helmet-async. */
function BreadcrumbJsonLd({ items }: { items: BreadcrumbItem[] }) {
  // Resolve relative paths to absolute (Google's parser prefers absolute).
  const ld = {
    '@context': 'https://schema.org',
    '@type':    'BreadcrumbList',
    itemListElement: items.map((it, idx) => ({
      '@type':   'ListItem',
      position:  idx + 1,
      name:      it.name,
      item:      it.url.startsWith('http') ? it.url : `${SITE_BASE}${it.url}`,
    })),
  };
  return (
    <script type="application/ld+json">
      {JSON.stringify(ld)}
    </script>
  );
}
