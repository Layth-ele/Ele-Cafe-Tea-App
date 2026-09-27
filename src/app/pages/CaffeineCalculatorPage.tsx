/**
 * CaffeineCalculatorPage — /tea-caffeine-calculator. A free tool: add the
 * teas (and coffees) you drink in a day, see a typical caffeine total
 * against Health Canada's guidance. Data in functions/src/lib/caffeine.ts,
 * shared with renderSeo's server-rendered version. Meant to be useful
 * enough that tea blogs and local media link to it.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Minus, Plus, Link2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { useLang } from '@/i18n/useT';
import { ROUTES, SITE_BASE } from '@/lib/routes';
import {
  CAFFEINE_DESCRIPTION,
  CAFFEINE_DRINKS,
  CAFFEINE_INTRO,
  CAFFEINE_INTRO_FR,
  CAFFEINE_LIMITS,
  CAFFEINE_TITLE,
  HEALTH_CANADA_CAFFEINE_URL,
  caffeineTotal,
} from '../../../functions/src/lib/caffeine';

const PATH = '/tea-caffeine-calculator';

function CaffeineCalculatorPage() {
  const fr = useLang() === 'fr';
  const L = (en: string, frText: string) => (fr ? frText : en);
  const [counts, setCounts] = useState<Record<string, number>>({ black: 1, green: 1 });
  const [limitId, setLimitId] = useState('adult');
  const limit = CAFFEINE_LIMITS.find((l) => l.id === limitId) ?? CAFFEINE_LIMITS[0];
  const total = useMemo(() => caffeineTotal(counts), [counts]);
  const pct = Math.min(100, Math.round((total.max / limit.mg) * 100));
  const over = total.max > limit.mg;
  const url = `${SITE_BASE}${PATH}`;

  const setCount = (id: string, n: number) =>
    setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(12, n)) }));

  // Share: native share sheet on phones (WhatsApp, Messages, …); copies
  // the link where there's no share sheet. The link preview itself comes
  // from /og-caffeine-calculator.png ("Ele Café Caffeine Calculator").
  const shareTitle = L('Ele Café Caffeine Calculator', 'Calculateur de caféine Ele Café');
  const shareText = L(
    'Check your daily caffeine with the Ele Café Caffeine Calculator:',
    'Calculez votre caféine quotidienne avec le calculateur Ele Café :',
  );
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(L('Link copied', 'Lien copié'));
    } catch {
      toast.error(L('Could not copy the link', 'Copie du lien impossible'));
    }
  };
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url });
        return;
      } catch (err) {
        // User closed the share sheet — nothing to do.
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    await copyLink();
  };

  return (
    <div className="pp-page cc-page">
      <SeoHead
        title={CAFFEINE_TITLE}
        image={`${SITE_BASE}/og-caffeine-calculator.png`}
        description={CAFFEINE_DESCRIPTION}
        url={url}
        breadcrumbs={[
          { name: 'Home', url: SITE_BASE },
          { name: 'Tea caffeine calculator', url },
        ]}
        extraJsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Tea Caffeine Calculator',
          url,
          applicationCategory: 'HealthApplication',
          operatingSystem: 'Any',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'CAD' },
          publisher: { '@id': `${SITE_BASE}/#business` },
        }}
      />
      <div className="bc-page-wrap">
        <Breadcrumbs
          withoutSchema
          items={[
            { name: L('Home', 'Accueil'), url: ROUTES.HOME },
            { name: L('Caffeine calculator', 'Calculateur de caféine'), url: PATH },
          ]}
        />
      </div>

      <header className="pp-page-header">
        <span className="overline">{L('Free tool', 'Outil gratuit')}</span>
        <h1 className="pp-page-h1">
          {L('Tea caffeine calculator', 'Calculateur de caféine du thé')}
        </h1>
        <p className="pp-page-intro">{fr ? CAFFEINE_INTRO_FR : CAFFEINE_INTRO}</p>
      </header>

      <section className="cc-tool" aria-labelledby="cc-tool-h">
        <h2 id="cc-tool-h" className="rw-h2">
          {L('What do you drink in a day?', 'Que buvez-vous dans une journée?')}
        </h2>
        <ul className="cc-rows">
          {CAFFEINE_DRINKS.map((d) => {
            const n = counts[d.id] ?? 0;
            const name = fr ? d.nameFr : d.name;
            return (
              <li key={d.id} className="cc-row" data-active={n > 0 ? 'true' : 'false'}>
                <span className="cc-row-name">
                  <strong>{name}</strong>
                  <span className="cc-row-meta">
                    {fr ? d.servingFr : d.serving} ·{' '}
                    {d.max === 0 ? L('caffeine-free', 'sans caféine') : `${d.min}–${d.max} mg`}
                  </span>
                </span>
                <span className="cc-stepper" role="group" aria-label={name}>
                  <button
                    type="button"
                    onClick={() => setCount(d.id, n - 1)}
                    disabled={n === 0}
                    aria-label={L(`One less ${name}`, `Un de moins : ${name}`)}
                  >
                    <Minus size={14} aria-hidden="true" />
                  </button>
                  <output aria-live="polite">{n}</output>
                  <button
                    type="button"
                    onClick={() => setCount(d.id, n + 1)}
                    aria-label={L(`One more ${name}`, `Un de plus : ${name}`)}
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="cc-result" data-over={over ? 'true' : 'false'}>
          <label className="cc-limit">
            <span>{L('Daily guidance for', 'Recommandation quotidienne pour')}</span>
            <select id="cc-limit" value={limitId} onChange={(e) => setLimitId(e.target.value)}>
              {CAFFEINE_LIMITS.map((l) => (
                <option key={l.id} value={l.id}>
                  {fr ? l.labelFr : l.label} — {l.mg} mg
                </option>
              ))}
            </select>
          </label>
          <p className="cc-total">
            <span className="cc-total-num">
              {total.min === total.max ? `${total.max}` : `${total.min}–${total.max}`} mg
            </span>{' '}
            {L('of caffeine a day', 'de caféine par jour')}
          </p>
          <div
            className="cc-bar"
            role="img"
            aria-label={L(`Up to ${pct}% of ${limit.mg} mg`, `Jusqu’à ${pct} % de ${limit.mg} mg`)}
          >
            {/* eslint-disable-next-line react/forbid-dom-props -- live percentage */}
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="cc-verdict">
            {total.max === 0
              ? L(
                  'Caffeine-free — perfect for the evening.',
                  'Sans caféine — parfait pour le soir.',
                )
              : over
                ? L(
                    `That can go over ${limit.mg} mg. Swap a cup or two for rooibos, herbal or hojicha.`,
                    `Cela peut dépasser ${limit.mg} mg. Remplacez une tasse ou deux par un rooibos, une tisane ou un hojicha.`,
                  )
                : L(
                    `Within Health Canada’s ${limit.mg} mg daily guidance.`,
                    `Dans la limite quotidienne de ${limit.mg} mg de Santé Canada.`,
                  )}
          </p>
        </div>
      </section>

      <section className="rw-card cc-table-card" aria-labelledby="cc-table-h">
        <h2 id="cc-table-h" className="rw-h2">
          {L('Caffeine by tea type', 'La caféine selon le type de thé')}
        </h2>
        <div className="cc-table-wrap">
          <table className="cc-table">
            <thead>
              <tr>
                <th scope="col">{L('Drink', 'Boisson')}</th>
                <th scope="col">{L('Serving', 'Portion')}</th>
                <th scope="col">{L('Caffeine', 'Caféine')}</th>
              </tr>
            </thead>
            <tbody>
              {CAFFEINE_DRINKS.map((d) => (
                <tr key={d.id}>
                  <th scope="row">
                    {d.link ? (
                      <Link to={d.link}>{fr ? d.nameFr : d.name}</Link>
                    ) : fr ? (
                      d.nameFr
                    ) : (
                      d.name
                    )}
                  </th>
                  <td>{fr ? d.servingFr : d.serving}</td>
                  <td>{d.max === 0 ? L('None', 'Aucune') : `${d.min}–${d.max} mg`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cc-note">
          {L(
            'Typical ranges; the real amount depends on the leaf, how much you use, and how long and how hot you steep it. Daily guidance from ',
            'Valeurs typiques; la quantité réelle dépend de la feuille, de la dose, et de la durée et de la température d’infusion. Recommandations de ',
          )}
          <a href={HEALTH_CANADA_CAFFEINE_URL} target="_blank" rel="noopener noreferrer">
            {L('Health Canada', 'Santé Canada')}
          </a>
          .
        </p>
      </section>

      <section className="rw-card cc-tips" aria-labelledby="cc-tips-h">
        <h2 id="cc-tips-h" className="rw-h2">
          {L('Want less caffeine?', 'Moins de caféine?')}
        </h2>
        <ul className="cc-tip-list">
          <li>
            <Link to="/collections/caffeine-free">
              {L('Caffeine-free teas', 'Thés sans caféine')}
            </Link>{' '}
            —{' '}
            {L('rooibos, herbal, flower and fruit blends.', 'rooibos, tisanes, fleurs et fruits.')}
          </li>
          <li>
            <Link to="/collections/matcha-powder">{L('Hojicha', 'Hojicha')}</Link> —{' '}
            {L(
              'roasted green tea with a fraction of matcha’s caffeine.',
              'thé vert torréfié, avec une fraction de la caféine du matcha.',
            )}
          </li>
          <li>
            {L(
              'Steep for less time, or use cooler water — both give a gentler cup.',
              'Infusez moins longtemps ou avec une eau moins chaude : la tasse sera plus douce.',
            )}
          </li>
        </ul>
      </section>

      <section className="rw-card cc-share" aria-labelledby="cc-share-h">
        <p className="cc-share-eyebrow">{shareTitle}</p>
        <h2 id="cc-share-h" className="rw-h2">
          {L('Share it with someone you care about', 'Partagez-le avec vos proches')}
        </h2>
        <p className="rw-detail">
          {L(
            'Invite the tea lovers in your life to discover how much caffeine is in their daily cups — a thoughtful way to help them enjoy every sip, in balance.',
            'Invitez les amateurs de thé de votre entourage à découvrir la caféine de leurs tasses quotidiennes — une attention délicate pour savourer chaque gorgée, en équilibre.',
          )}
        </p>
        <div className="cc-share-actions">
          <button type="button" className="cc-share-btn" onClick={share}>
            <Share2 size={18} aria-hidden="true" />
            {L('Share the calculator', 'Partager le calculateur')}
          </button>
          <button type="button" className="cc-share-copy" onClick={copyLink}>
            <Link2 size={15} aria-hidden="true" /> {L('Copy link', 'Copier le lien')}
          </button>
        </div>
      </section>
    </div>
  );
}

export default CaffeineCalculatorPage;
