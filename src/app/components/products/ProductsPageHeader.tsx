
import { useT } from '@/i18n/useT';interface ProductsPageHeaderProps {
  title: string;
  /** Keyword-rich intro under the heading (category / collection pages). */
  intro?: string;
  resultCount: number;
  page: number;
  totalPages: number;
  loading: boolean;
}

export function ProductsPageHeader({ title, intro, resultCount, page, totalPages, loading }: ProductsPageHeaderProps) {
  const t = useT();
  return (
    <div className="pp-page-header">
      <span className="overline">{t('Ele Café Collection')}</span>
      <h1 className="pp-page-h1">{title}</h1>
      {intro && <p className="pp-page-intro">{intro}</p>}
      {!loading && (
        <p className="pp-page-count" aria-live="polite" aria-atomic="true">
          {t(resultCount === 1 ? '{count} result' : '{count} results', { count: resultCount })}
          {totalPages > 1 ? ` · ${t('page {page} of {total}', { page, total: totalPages })}` : ''}
        </p>
      )}
    </div>
  );
}
