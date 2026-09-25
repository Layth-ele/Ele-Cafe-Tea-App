/**
 * RewardsPage — /rewards. Explains Ele Rewards (the café loyalty
 * programme, run on RewardUp) and sends people to the RewardUp member
 * site to join. Copy + FAQ come from functions/src/lib/rewards.ts, shared
 * with renderSeo's server-rendered /rewards so the page and Google agree.
 */
import { ArrowRight, ExternalLink } from 'lucide-react';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { HomeFaq } from '@/app/components/home/HomeGuideSections';
import { useT, useLang } from '@/i18n/useT';
import { ROUTES, SITE_BASE } from '@/lib/routes';
import { faqJsonLd } from '../../../functions/src/lib/storeContent';
import {
  REWARDS_DESCRIPTION, REWARDS_EARN, REWARDS_REDEEM, REWARDS_TITLE, REWARDS_URL,
  buildRewardsFaq, rewardsIntro, type RewardsItem,
} from '../../../functions/src/lib/rewards';

function RewardsList({ items, fr }: { items: readonly RewardsItem[]; fr: boolean }) {
  return (
    <ul className="rw-list">
      {items.map((i) => (
        <li key={i.id} className="rw-item">
          <span className="rw-icon" aria-hidden="true">{i.icon}</span>
          <span className="rw-text">
            <strong className="rw-title">{fr ? i.titleFr : i.title}</strong>
            <span className="rw-detail">{fr ? i.detailFr : i.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function JoinButton() {
  const t = useT();
  return (
    <a href={REWARDS_URL} target="_blank" rel="noopener noreferrer" className="btn btn-lg cpp-cta-dark rw-join">
      {t('Join Ele Rewards — get 10% off')} <ExternalLink size={15} aria-hidden="true" />
    </a>
  );
}

function RewardsPage() {
  const t = useT();
  const lang = useLang();
  const fr = lang === 'fr';
  const url = `${SITE_BASE}${ROUTES.REWARDS}`;
  const faqEn = buildRewardsFaq('en');

  return (
    <div className="pp-page">
      <SeoHead
        title={REWARDS_TITLE}
        description={REWARDS_DESCRIPTION}
        url={url}
        breadcrumbs={[
          { name: 'Home',        url: SITE_BASE },
          { name: 'Ele Rewards', url },
        ]}
        extraJsonLd={[faqJsonLd(faqEn)]}
      />
      <div className="bc-page-wrap">
        <Breadcrumbs
          withoutSchema
          items={[
            { name: 'Home',            url: ROUTES.HOME },
            { name: t('Ele Rewards'),  url: ROUTES.REWARDS },
          ]}
        />
      </div>

      <header className="pp-page-header">
        <span className="overline">{t('Ele Café loyalty program')}</span>
        <h1 className="pp-page-h1">{t('Ele Rewards')}</h1>
        <p className="pp-page-intro">{rewardsIntro(lang)}</p>
        <p className="rw-cta"><JoinButton /></p>
        <p className="rw-cta-note">{t('Free to join. You’ll sign up on our rewards page, powered by RewardUp.')}</p>
      </header>

      <div className="rw-grid">
        <section className="rw-card" aria-labelledby="rw-earn">
          <h2 id="rw-earn" className="rw-h2">{t('Ways to earn points')}</h2>
          <RewardsList items={REWARDS_EARN} fr={fr} />
        </section>
        <section className="rw-card" aria-labelledby="rw-redeem">
          <h2 id="rw-redeem" className="rw-h2">{t('Ways to redeem')}</h2>
          <RewardsList items={REWARDS_REDEEM} fr={fr} />
          <p className="rw-card-foot">
            <a href={REWARDS_URL} target="_blank" rel="noopener noreferrer" className="hg-guide-link">
              {t('Check your points balance')} <ArrowRight size={13} aria-hidden="true" />
            </a>
          </p>
        </section>
      </div>

      <HomeFaq items={buildRewardsFaq(lang)} title={t('Ele Rewards FAQ')} />

      <section className="pix-cta-section">
        <h2 className="pix-cta-h2">{t('Start earning on your next cup')}</h2>
        <p className="pix-cta-body">{t('Sign up in a minute and your 10% welcome discount is ready right away.')}</p>
        <JoinButton />
      </section>
    </div>
  );
}

export default RewardsPage;
