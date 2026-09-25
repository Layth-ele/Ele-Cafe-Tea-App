import { useLocation } from 'react-router';
import { ROUTES, SITE_BASE } from '@/lib/routes';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { useStoreContent } from '@/hooks/useStoreContent';
import { useT } from '@/i18n/useT';
import { phoneTel } from '../../../../functions/src/lib/storeContent';

interface StaticPageProps {
  title: string;
  seoTitle?: string;
  seoDesc?: string;
  /** Page-specific JSON-LD (e.g. LocalBusiness on /contact). */
  extraJsonLd?: Record<string, unknown>;
  children: React.ReactNode;
}

/** Store contact line ("Ele Café · address · phone") used at the foot of
 *  the info pages — from Admin → Settings, like everything else. */
export function StoreContactLine() {
  const store = useStoreContent();
  const tel = phoneTel(store.phone);
  return (
    <p className="ip-meta-tail">
      {store.name}{store.address && ` · ${store.address}`}
      {tel && <> · <a href={`tel:${tel}`} className="ip-link-inherit">{store.phone}</a></>}
    </p>
  );
}

export function StaticPage({ title, seoTitle, seoDesc, extraJsonLd, children }: StaticPageProps) {
  // Visible heading + breadcrumb follow the language; SeoHead stays English.
  const t = useT();
  // Canonical + breadcrumb use the real route (/contact, /refund-policy …)
  // so each info page is indexed as itself, not as a copy of the homepage.
  const pageUrl = `${SITE_BASE}${useLocation().pathname.replace(/\/$/, '')}`;
  return (
    <div className="sp-page">
      <SeoHead
        title={seoTitle ?? `${title} | Ele Café`}
        description={seoDesc ?? `${title} — Ele Café Vancouver`}
        url={pageUrl}
        breadcrumbs={[
          { name: 'Home',  url: SITE_BASE },
          { name: title,   url: pageUrl },
        ]}
        extraJsonLd={extraJsonLd}
      />
      <div className="sp-inner">

        {/* Visible breadcrumbs for sub-pages — Phase 4 gate. Marked
            withoutSchema since the JSON-LD copy already rides on
            <SeoHead breadcrumbs={…}> above. */}
        <Breadcrumbs
          withoutSchema
          items={[
            { name: t('Home'), url: ROUTES.HOME },
            { name: t(title), url: '' },
          ]}
        />

        <h1 className="sp-h1">
          {t(title)}
        </h1>

        <div className="sp-body">
          {children}
        </div>
      </div>
    </div>
  );
}
