/**
 * rewards.ts — Ele Rewards, the café loyalty programme (run on RewardUp).
 *
 * Shared by the React RewardsPage and renderSeo's server-rendered /rewards
 * (<head>, FAQPage JSON-LD, <noscript> body), like cafeMenu.ts. Members
 * sign up and manage points on the RewardUp member site (REWARDS_URL);
 * this page explains the programme and sends them there.
 *
 * Keep EARN / REDEEM in step with RewardUp → Program settings.
 */
import type { FaqItem } from './storeContent';

export const REWARDS_URL = 'https://ele-cafe.member.rewardup.io';

export const REWARDS_TITLE = 'Ele Rewards — Café Loyalty Program in Vancouver | Ele Café';
export const REWARDS_DESCRIPTION =
  'Join Ele Rewards, the Ele Café loyalty program in Vancouver: get 10% off when you sign up, earn 1 point per $1 on tea, matcha and coffee, and turn 100 points into $5 off.';
export const REWARDS_TITLE_FR =
  'Ele Rewards — Programme de fidélité du café à Vancouver | Ele Café';
export const REWARDS_DESCRIPTION_FR =
  'Joignez Ele Rewards, le programme de fidélité d’Ele Café à Vancouver : 10 % de rabais à l’inscription, 1 point par dollar sur le thé, le matcha et le café, et 5 $ de rabais pour 100 points.';

export interface RewardsItem {
  id: string;
  icon: string;
  title: string;
  titleFr: string;
  detail: string;
  detailFr: string;
}

export const REWARDS_EARN: readonly RewardsItem[] = [
  {
    id: 'signup',
    icon: '🎉',
    title: 'Sign up',
    titleFr: 'Inscription',
    detail: 'Earn 10 points',
    detailFr: 'Gagnez 10 points',
  },
  {
    id: 'order',
    icon: '☕',
    title: 'Place an order',
    titleFr: 'Passez une commande',
    detail: 'Earn 1 point for every $1 spent',
    detailFr: 'Gagnez 1 point par dollar dépensé',
  },
  {
    id: 'review',
    icon: '⭐',
    title: 'Write a review',
    titleFr: 'Écrivez un avis',
    detail: 'Earn 50 points',
    detailFr: 'Gagnez 50 points',
  },
  {
    id: 'birthday',
    icon: '🎂',
    title: 'Join the Birthday Club',
    titleFr: 'Joignez le Club anniversaire',
    detail: 'Earn 10 points',
    detailFr: 'Gagnez 10 points',
  },
  {
    id: 'sms',
    icon: '💬',
    title: 'Subscribe to SMS',
    titleFr: 'Abonnez-vous aux textos',
    detail: 'Earn 10 points',
    detailFr: 'Gagnez 10 points',
  },
  {
    id: 'wallet',
    icon: '📱',
    title: 'Add to your mobile wallet',
    titleFr: 'Ajoutez à votre portefeuille mobile',
    detail: 'Earn 10 points',
    detailFr: 'Gagnez 10 points',
  },
];

export const REWARDS_REDEEM: readonly RewardsItem[] = [
  {
    id: 'welcome',
    icon: '🎁',
    title: 'Welcome reward',
    titleFr: 'Récompense de bienvenue',
    detail: 'Sign up and get 10% off',
    detailFr: 'Inscrivez-vous et obtenez 10 % de rabais',
  },
  {
    id: 'five',
    icon: '💵',
    title: '$5 off',
    titleFr: '5 $ de rabais',
    detail: 'Spend 100 points and get $5 off',
    detailFr: 'Échangez 100 points contre 5 $ de rabais',
  },
];

export function rewardsIntro(lang: 'en' | 'fr' = 'en'): string {
  return lang === 'fr'
    ? 'Ele Rewards est le programme de fidélité gratuit d’Ele Café à Vancouver. Obtenez 10 % de rabais dès l’inscription, cumulez des points sur chaque thé, matcha, hojicha et café, et échangez-les contre des rabais.'
    : 'Ele Rewards is Ele Café’s free loyalty program in Vancouver. Get 10% off when you sign up, earn points on every tea, matcha, hojicha and coffee, and turn them into discounts.';
}

export function buildRewardsFaq(lang: 'en' | 'fr' = 'en'): FaqItem[] {
  if (lang === 'fr') {
    return [
      {
        q: 'Ele Rewards est-il gratuit?',
        a: 'Oui. L’inscription est gratuite et vous obtenez 10 % de rabais dès que vous vous joignez au programme.',
      },
      {
        q: 'Comment gagner des points?',
        a: 'Vous gagnez 1 point par dollar dépensé, 50 points par avis, et 10 points pour l’inscription, le Club anniversaire, les textos et l’ajout de votre carte au portefeuille mobile.',
      },
      {
        q: 'Combien valent mes points?',
        a: '100 points valent 5 $ de rabais sur votre prochain achat.',
      },
      {
        q: 'Où puis-je utiliser mes récompenses?',
        a: 'À notre café de Vancouver. Consultez votre solde et vos récompenses en tout temps sur votre page membre Ele Rewards.',
      },
    ];
  }
  return [
    {
      q: 'Is Ele Rewards free?',
      a: 'Yes. Joining is free and you get 10% off as soon as you sign up.',
    },
    {
      q: 'How do I earn points?',
      a: 'You earn 1 point for every $1 you spend, 50 points for a review, and 10 points each for signing up, joining the Birthday Club, subscribing to SMS and adding your card to your mobile wallet.',
    },
    { q: 'What are my points worth?', a: '100 points get you $5 off your next purchase.' },
    {
      q: 'Where can I use my rewards?',
      a: 'At our Vancouver tea café. You can check your balance and rewards any time on your Ele Rewards member page.',
    },
  ];
}
