/**
 * FranchisePage — /franchise. A short pitch for the Ele Café concept and
 * an "Email us" button. Copy lives in functions/src/lib/franchise.ts,
 * shared with renderSeo's server-rendered /franchise.
 */
import { Mail } from 'lucide-react';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { useStoreContent } from '@/hooks/useStoreContent';
import { useT, useLang } from '@/i18n/useT';
import { ROUTES, SITE_BASE } from '@/lib/routes';
import {
  FRANCHISE_CONCEPT, FRANCHISE_DESCRIPTION, FRANCHISE_EMAIL_FALLBACK, FRANCHISE_PARTNER, FRANCHISE_TITLE,
  franchiseIntro, franchiseMailto,
} from '../../../functions/src/lib/franchise';

function FranchisePage() {
  const t = useT();
  const lang = useLang();
  const fr = lang === 'fr';
  const store = useStoreContent();
  const email = store.email || FRANCHISE_EMAIL_FALLBACK;
  const url = `${SITE_BASE}${ROUTES.FRANCHISE}`;

  const emailButton = (
    <a href={franchiseMailto(email, lang)} className="btn btn-lg cpp-cta-dark rw-join">
      <Mail size={16} aria-hidden="true" /> {t('Email us about franchising')}
    </a>
  );

  return (
    <div className="pp-page">
      <SeoHead
        title={FRANCHISE_TITLE}
        description={FRANCHISE_DESCRIPTION}
        url={url}
        breadcrumbs={[
          { name: 'Home',      url: SITE_BASE },
          { name: 'Franchise', url },
        ]}
      />
      <div className="bc-page-wrap">
        <Breadcrumbs
          withoutSchema
          items={[
            { name: 'Home',                 url: ROUTES.HOME },
            { name: t('Franchise'),         url: ROUTES.FRANCHISE },
          ]}
        />
      </div>

      <header className="pp-page-header">
        <span className="overline">{t('Franchise opportunities')}</span>
        <h1 className="pp-page-h1">{t('Open an Ele Café in your city')}</h1>
        <p className="pp-page-intro">{franchiseIntro(lang)}</p>
        <p className="rw-cta">{emailButton}</p>
        <p className="rw-cta-note">{t('Or write to us at {email}. We reply to every inquiry.', { email })}</p>
      </header>

      <div className="rw-grid">
        <section className="rw-card" aria-labelledby="fr-concept">
          <h2 id="fr-concept" className="rw-h2">{t('The concept')}</h2>
          <ul className="rw-list">
            {FRANCHISE_CONCEPT.map((p) => (
              <li key={p.id} className="rw-item">
                <span className="rw-icon" aria-hidden="true">{p.icon}</span>
                <span className="rw-text">
                  <strong className="rw-title">{fr ? p.titleFr : p.title}</strong>
                  <span className="rw-detail">{fr ? p.textFr : p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rw-card" aria-labelledby="fr-partner">
          <h2 id="fr-partner" className="rw-h2">{t('Who we’re looking for')}</h2>
          <ul className="rw-list">
            {FRANCHISE_PARTNER.map((p) => (
              <li key={p.en} className="rw-item">
                <span className="rw-icon" aria-hidden="true">✓</span>
                <span className="rw-detail fr-partner-text">{fr ? p.fr : p.en}</span>
              </li>
            ))}
          </ul>
          <h3 className="rw-title fr-next-h">{t('How it starts')}</h3>
          <p className="rw-detail">{t('Email us with your name, city and a little about yourself. We’ll set up a call to walk you through the concept, support and investment.')}</p>
        </section>
      </div>

      <section className="pix-cta-section">
        <h2 className="pix-cta-h2">{t('Let’s talk')}</h2>
        <p className="pix-cta-body">{t('Tell us where you’d like to open, and we’ll take it from there.')}</p>
        {emailButton}
      </section>
    </div>
  );
}

export default FranchisePage;
