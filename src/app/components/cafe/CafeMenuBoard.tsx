/**
 * CafeMenuBoard — the in-store drink menu (coffee, matcha, hojicha, tea),
 * laid out like the printed boards: drink + description on the left,
 * 12 oz / 16 oz prices on the right, flavour / fruit purée options beside
 * it. Data: functions/src/lib/cafeMenu.ts (shared with the SEO renderer).
 *
 * Used on /cafe (all sections + jump nav) and, one section at a time, on
 * the matcha / hojicha category, collection and tea pages.
 */
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { useT, useLang } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
import { ROUTES } from '@/lib/routes';
import {
  CAFE_MENU, CAFE_MILK_SUBSTITUTES,
  type CafeChoice, type CafeDrink, type CafeLatteOption, type CafeMenuSection, type CafeSectionId, type CafeTemp,
} from '../../../../functions/src/lib/cafeMenu';

const byLang = <T extends { name: string; nameFr: string }>(x: T, fr: boolean) => (fr ? x.nameFr : x.name);

function TempTag({ temp }: { temp?: CafeTemp }) {
  const t = useT();
  if (!temp) return null;
  const label = temp === 'hot' ? t('Hot') : temp === 'iced' ? t('Iced') : t('Iced / Hot');
  return <span className="cmb-temp" data-temp={temp}>{label}</span>;
}

function Prices({ d }: { d: Pick<CafeDrink, 'price' | 'price12' | 'price16'> }) {
  if (typeof d.price === 'number') {
    return <span className="cmb-prices"><span className="cmb-price cmb-price-one">{formatMoney(d.price)}</span></span>;
  }
  if (typeof d.price12 !== 'number') return null;
  return (
    <span className="cmb-prices">
      <span className="cmb-price"><span className="sr-only">12 oz </span>{formatMoney(d.price12)}</span>
      <span className="cmb-price"><span className="sr-only">16 oz </span>{formatMoney(d.price16 ?? d.price12)}</span>
    </span>
  );
}

function Chips({ choices, fr }: { choices: readonly CafeChoice[]; fr: boolean }) {
  return (
    <ul className="cmb-chips">
      {choices.map((c) => (
        <li key={c.name} className="cmb-chip" data-flavour={c.name.toLowerCase().replace(/[^a-z]+/g, '-')}>{byLang(c, fr)}</li>
      ))}
    </ul>
  );
}

function OptionCard({ o, fr, label }: { o: CafeLatteOption; fr: boolean; label: string }) {
  return (
    <div className="cmb-opt">
      <h3 className="cmb-opt-name">{byLang(o, fr)} <TempTag temp={o.temp} /></h3>
      <p className="cmb-opt-price">
        <span>12 oz {formatMoney(o.price12)}</span>
        <span aria-hidden="true">·</span>
        <span>16 oz {formatMoney(o.price16)}</span>
      </p>
      <p className="cmb-desc">{fr ? o.descriptionFr : o.description}</p>
      <p className="cmb-opt-label">{label}</p>
      <Chips choices={o.choices} fr={fr} />
    </div>
  );
}

export function CafeMenuSectionView({ section, headingId, compact = false }: {
  section: CafeMenuSection;
  headingId?: string;
  /** On tea / category pages: adds a link to the full café menu. */
  compact?: boolean;
}) {
  const t = useT();
  const fr = useLang() === 'fr';
  const sized = section.drinks.some((d) => typeof d.price12 === 'number');
  const hasExtras = !!(section.flavoured || section.puree || section.flavours || section.anyTea);
  const id = headingId ?? `menu-${section.id}`;

  return (
    <section className="cmb" data-menu={section.id} aria-labelledby={id}>
      <header className="cmb-head">
        {compact && <span className="cmb-eyebrow">{t('At our Vancouver café')}</span>}
        <h2 id={id} className="cmb-title">{compact ? t('{name} menu', { name: fr ? section.titleFr : section.title }) : (fr ? section.titleFr : section.title)}</h2>
        <p className="cmb-tagline">{fr ? section.taglineFr : section.tagline}</p>
      </header>

      <div className={`cmb-body${hasExtras ? '' : ' cmb-body-single'}`}>
        <div className="cmb-list">
          {sized && (
            <div className="cmb-cols" aria-hidden="true">
              <span>12 oz</span><span>16 oz</span>
            </div>
          )}
          <ul className="cmb-items">
            {section.drinks.map((d) => (
              <li key={d.id} className="cmb-item">
                <div className="cmb-item-main">
                  <h3 className="cmb-name">{byLang(d, fr)} <TempTag temp={d.temp} /></h3>
                  <p className="cmb-desc">{fr ? d.descriptionFr : d.description}</p>
                </div>
                <Prices d={d} />
              </li>
            ))}
          </ul>
        </div>

        {hasExtras && (
          <aside className="cmb-extras">
            {section.flavoured && <OptionCard o={section.flavoured} fr={fr} label={t('Choose your flavour')} />}
            {section.puree && <OptionCard o={section.puree} fr={fr} label={t('Choose your fruit')} />}
            {section.flavours && (
              <div className="cmb-opt">
                <h3 className="cmb-opt-name">{t('Choose your flavour')}</h3>
                {section.flavourNote && <p className="cmb-desc">{fr ? section.flavourNoteFr : section.flavourNote}</p>}
                <Chips choices={section.flavours} fr={fr} />
              </div>
            )}
            {section.anyTea && (
              <div className="cmb-opt">
                <h3 className="cmb-opt-name">{t('Pick your tea')}</h3>
                <p className="cmb-desc">{t('Every tea page shows the ways we serve it in the café. Good places to start:')}</p>
                <ul className="cmb-links">
                  <li><Link to={ROUTES.COLLECTION('iced-tea')}>{t('Iced tea blends')}</Link></li>
                  <li><Link to={ROUTES.COLLECTION('milk-tea')}>{t('Teas for milk tea')}</Link></li>
                  <li><Link to={ROUTES.COLLECTION('tea-latte')}>{t('Teas for lattes')}</Link></li>
                  <li><Link to={ROUTES.PRODUCTS}>{t('Browse all teas')}</Link></li>
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>

      {section.favourites && section.favourites.length > 0 && (
        <div className="cmb-favs-wrap">
          <h3 className="cmb-opt-name">{t('House favourites')}</h3>
          <p className="cmb-desc cmb-favs-sub">{t('Each one as a hot tea latte or an iced milk tea.')}</p>
          <ul className="cmb-favs">
            {section.favourites.map((f) => (
              <li key={f.id} className="cmb-fav">
                <Link to={ROUTES.TEA_PROFILE(f.tea.category, f.tea.slug)} className="cmb-fav-name">{byLang(f, fr)}</Link>
                <span className="cmb-desc">{fr ? f.descriptionFr : f.description}</span>
                <span className="cmb-fav-tags">
                  <span className="cmb-temp" data-temp="hot">{t('Hot latte')}</span>
                  <span className="cmb-temp" data-temp="iced">{t('Iced milk tea')}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="cmb-milk">
        <span className="cmb-milk-label">{t('Milk substitutes')}</span>
        {CAFE_MILK_SUBSTITUTES.map((m) => (
          <span key={m.name} className="cmb-milk-item">{byLang(m, fr)} <strong>+{formatMoney(m.price)}</strong></span>
        ))}
      </footer>

      {compact && (
        <p className="cmb-more">
          <Link to={`${ROUTES.CAFE}#menu-${section.id}`} className="hg-guide-link">
            {t('See the full café menu')} <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </p>
      )}
    </section>
  );
}

/** One board by id (tea / category pages). */
export function CafeMenuFor({ id }: { id: CafeSectionId }) {
  const section = CAFE_MENU.find((s) => s.id === id);
  return section ? <CafeMenuSectionView section={section} headingId={`cafe-menu-${id}`} compact /> : null;
}

/** Sticky jump bar for /cafe. */
export function CafeMenuNav() {
  const t = useT();
  const fr = useLang() === 'fr';
  return (
    <nav className="cmb-nav" aria-label={t('Café menu sections')}>
      {CAFE_MENU.map((s) => (
        <a key={s.id} href={`#menu-${s.id}`} className="cmb-nav-link" data-menu={s.id}>{fr ? s.titleFr : s.title}</a>
      ))}
    </nav>
  );
}

/** Which café board fits a tea — only the matcha / hojicha powders (the
 *  café whisks the powder; a loose-leaf "genmaicha with matcha" isn't it). */
export function cafeSectionForTea(p: { name?: string; slug?: string; category?: string }): CafeSectionId | null {
  if (p.category !== 'powder') return null;
  const s = `${p.name ?? ''} ${p.slug ?? ''}`.toLowerCase();
  if (/\bmatcha\b/.test(s)) return 'matcha';
  if (/\bho(u)?jicha\b/.test(s)) return 'hojicha';
  return null;
}
