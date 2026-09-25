/**
 * AdminPageHeader — the one page header every admin tab uses, so all
 * tabs share the same title position, type scale and action placement.
 *
 *   eyebrow      small uppercase context line ("Manage & fulfil")
 *   title        the page name (the page's only <h1>)
 *   description  optional one-line explanation
 *   meta         optional status line under the title (counts, alerts)
 *   actions      primary page buttons — right on desktop, full width on phones
 */
import type { ReactNode } from 'react';

interface AdminPageHeaderProps {
  eyebrow:      string;
  title:        string;
  description?: ReactNode;
  meta?:        ReactNode;
  actions?:     ReactNode;
}

export function AdminPageHeader({ eyebrow, title, description, meta, actions }: AdminPageHeaderProps) {
  return (
    <header className="aph">
      <div className="aph-text">
        <p className="aph-eyebrow">{eyebrow}</p>
        <h1 className="aph-title">{title}</h1>
        {description && <p className="aph-desc">{description}</p>}
        {meta && <div className="aph-meta">{meta}</div>}
      </div>
      {actions && <div className="aph-actions">{actions}</div>}
    </header>
  );
}
