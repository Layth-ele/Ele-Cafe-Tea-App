/**
 * PressPage — /press. Media kit: quick facts, a copy-ready description,
 * brand assets and a media contact. Copy in functions/src/lib/press.ts,
 * shared with renderSeo; facts come from Admin → Settings + the catalog.
 */
import { useQuery } from '@tanstack/react-query';
import { Copy, Download, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { useStoreContent } from '@/hooks/useStoreContent';
import { useLang } from '@/i18n/useT';
import { ROUTES, SITE_BASE } from '@/lib/routes';
import { fetchActiveTeaCount, queryKeys } from '@/lib/firebaseQueries';
import { addressLines, FOUNDING_YEAR, hoursText } from '../../../functions/src/lib/storeContent';
import {
  PRESS_ASSETS,
  PRESS_DESCRIPTION,
  PRESS_DESCRIPTION_FR,
  PRESS_TITLE,
  pressBoilerplate,
} from '../../../functions/src/lib/press';

function PressPage() {
  const lang = useLang();
  const fr = lang === 'fr';
  const L = (en: string, frText: string) => (fr ? frText : en);
  const store = useStoreContent();
  const { data: teaCount = 0 } = useQuery({
    queryKey: queryKeys.teaCount(),
    queryFn: fetchActiveTeaCount,
    staleTime: 10 * 60 * 1000,
  });
  const [street] = addressLines(store.address);
  const boilerplate = pressBoilerplate({ teaCount, street }, lang);
  const email = store.email || 'info@elecafe.ca';
  const url = `${SITE_BASE}/press`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(boilerplate);
      toast.success(L('Description copied', 'Description copiée'));
    } catch {
      toast.error(
        L(
          'Could not copy — select the text and copy it',
          'Copie impossible — sélectionnez le texte pour le copier',
        ),
      );
    }
  };

  const facts: Array<[string, string]> = [
    [L('Name', 'Nom'), 'Ele Café'],
    [
      L('What', 'Quoi'),
      L('Loose leaf tea shop and tea café', 'Boutique de thé en vrac et café de thé'),
    ],
    [L('Founded', 'Fondé'), `${FOUNDING_YEAR}, Vancouver, BC`],
    ...(store.address ? [[L('Address', 'Adresse'), store.address] as [string, string]] : []),
    ...(teaCount > 0
      ? [
          [L('Teas', 'Thés'), L(`${teaCount} loose leaf teas`, `${teaCount} thés en vrac`)] as [
            string,
            string,
          ],
        ]
      : []),
    [
      L('Café', 'Café'),
      L(
        'Matcha, hojicha, coffee and tea & pastry pairings',
        'Matcha, hojicha, café et accords thé et pâtisserie',
      ),
    ],
    [
      L('Online', 'En ligne'),
      L(
        'elecafe.ca — ships across Canada, English & French',
        'elecafe.ca — livraison partout au Canada, en français et en anglais',
      ),
    ],
    ...(store.hours.length
      ? [[L('Hours', 'Heures'), hoursText(store.hours, lang)] as [string, string]]
      : []),
  ];

  return (
    <div className="pp-page press-page">
      <SeoHead
        title={PRESS_TITLE}
        description={PRESS_DESCRIPTION}
        url={url}
        breadcrumbs={[
          { name: 'Home', url: SITE_BASE },
          { name: 'Press', url },
        ]}
      />
      <div className="bc-page-wrap">
        <Breadcrumbs
          withoutSchema
          items={[
            { name: L('Home', 'Accueil'), url: ROUTES.HOME },
            { name: L('Press', 'Presse'), url: '/press' },
          ]}
        />
      </div>

      <header className="pp-page-header">
        <span className="overline">{L('Press & media', 'Presse et médias')}</span>
        <h1 className="pp-page-h1">{L('Ele Café press kit', 'Trousse média d’Ele Café')}</h1>
        <p className="pp-page-intro">{fr ? PRESS_DESCRIPTION_FR : PRESS_DESCRIPTION}</p>
      </header>

      <div className="rw-grid">
        <section className="rw-card" aria-labelledby="press-facts">
          <h2 id="press-facts" className="rw-h2">
            {L('Quick facts', 'En bref')}
          </h2>
          <dl className="press-facts">
            {facts.map(([k, v]) => (
              <div key={k} className="press-fact">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rw-card" aria-labelledby="press-about">
          <h2 id="press-about" className="rw-h2">
            {L('About Ele Café (copy-ready)', 'À propos d’Ele Café (prêt à copier)')}
          </h2>
          <p className="press-boilerplate">{boilerplate}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={copy}>
            <Copy size={14} aria-hidden="true" /> {L('Copy description', 'Copier la description')}
          </button>
        </section>

        <section className="rw-card" aria-labelledby="press-assets">
          <h2 id="press-assets" className="rw-h2">
            {L('Logos & images', 'Logos et images')}
          </h2>
          <ul className="press-assets">
            {PRESS_ASSETS.map((a) => (
              <li key={a.file}>
                <a href={a.file} download className="press-asset">
                  <Download size={14} aria-hidden="true" /> {fr ? a.labelFr : a.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="rw-detail">
            {L(
              'Please link to elecafe.ca when you use them. Need product photos? Just ask.',
              'Merci de faire un lien vers elecafe.ca lorsque vous les utilisez. Besoin de photos de produits? Écrivez-nous.',
            )}
          </p>
        </section>

        <section className="rw-card" aria-labelledby="press-contact">
          <h2 id="press-contact" className="rw-h2">
            {L('Media contact', 'Contact médias')}
          </h2>
          <p className="rw-detail">
            {L(
              'Interviews, tastings, photos or samples:',
              'Entrevues, dégustations, photos ou échantillons :',
            )}
          </p>
          <p>
            <a
              href={`mailto:${email}?subject=${encodeURIComponent(L('Media inquiry', 'Demande médias'))}`}
              className="btn btn-lg cpp-cta-dark"
            >
              <Mail size={16} aria-hidden="true" /> {email}
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}

export default PressPage;
