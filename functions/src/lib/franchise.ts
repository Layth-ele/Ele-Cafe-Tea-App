/**
 * franchise.ts — the "Franchise opportunities" page (/franchise).
 *
 * Shared by the React FranchisePage and renderSeo's server-rendered
 * /franchise, like rewards.ts. Deliberately general: no fees, investment
 * figures or location counts — those go in the conversation that starts
 * with the "Email us" button.
 */
export const FRANCHISE_TITLE = 'Franchise Opportunities — Open an Ele Café Tea Café | Ele Café';
export const FRANCHISE_DESCRIPTION = 'Bring Ele Café to your city. Franchise a Vancouver tea café concept: loose leaf tea retail, ceremonial matcha, hojicha and coffee bar, pastry pairings and online store. Email us to start the conversation.';

export const FRANCHISE_EMAIL_FALLBACK = 'info@elecafe.ca';
export const FRANCHISE_SUBJECT = 'Franchise inquiry';

export interface FranchisePoint { id: string; icon: string; title: string; titleFr: string; text: string; textFr: string }

/** What makes the concept. */
export const FRANCHISE_CONCEPT: readonly FranchisePoint[] = [
  { id: 'tea', icon: '🍃', title: 'A real tea shop', titleFr: 'Une vraie boutique de thé',
    text: 'A wall of premium loose leaf teas that guests can taste in the café and take home.',
    textFr: 'Un mur de thés en vrac de qualité que les clients goûtent au café et rapportent à la maison.' },
  { id: 'bar', icon: '🍵', title: 'Matcha, hojicha & coffee bar', titleFr: 'Bar à matcha, hojicha et café',
    text: 'A full drink menu, from ceremonial matcha and hojicha lattes to espresso classics, iced or hot.',
    textFr: 'Un menu complet, des lattes au matcha et au hojicha de cérémonie aux classiques de l’espresso, glacés ou chauds.' },
  { id: 'pastry', icon: '🥐', title: 'Tea & pastry pairings', titleFr: 'Accords thé et pâtisserie',
    text: 'Croissants, danishes and strudels paired with tea: an easy, repeatable combo menu.',
    textFr: 'Croissants, danoises et strudels accordés au thé : un menu combo simple et reproductible.' },
  { id: 'digital', icon: '📱', title: 'Built-in online store', titleFr: 'Boutique en ligne intégrée',
    text: 'Online ordering, pickup, gift boxes and a loyalty program already running.',
    textFr: 'Commande en ligne, cueillette, coffrets-cadeaux et programme de fidélité déjà en place.' },
];

/** Who we'd like to hear from. */
export const FRANCHISE_PARTNER: readonly { en: string; fr: string }[] = [
  { en: 'You love tea and hospitality, and want to run a café in your community.',
    fr: 'Vous aimez le thé et l’accueil, et souhaitez tenir un café dans votre communauté.' },
  { en: 'You have, or are looking for, a location with good foot traffic.',
    fr: 'Vous avez, ou cherchez, un emplacement avec un bon achalandage.' },
  { en: 'You want a proven menu and brand rather than starting from zero.',
    fr: 'Vous voulez un menu et une marque éprouvés plutôt que de partir de zéro.' },
];

export function franchiseIntro(lang: 'en' | 'fr' = 'en'): string {
  return lang === 'fr'
    ? 'Ele Café est un café de thé de Vancouver qui réunit une boutique de thés en vrac, un bar à matcha, hojicha et café, et des accords avec pâtisseries. Vous aimeriez ouvrir un Ele Café dans votre ville? Parlons-en.'
    : 'Ele Café is a Vancouver tea café that brings together a loose leaf tea shop, a matcha, hojicha and coffee bar, and tea & pastry pairings. Would you like to open an Ele Café in your city? Let’s talk.';
}

/** mailto: link with a helpful pre-filled message. */
export function franchiseMailto(email: string, lang: 'en' | 'fr' = 'en'): string {
  const body = lang === 'fr'
    ? 'Bonjour,\n\nJe suis intéressé(e) par une franchise Ele Café.\n\nNom :\nVille / région visée :\nTéléphone :\nParlez-nous un peu de vous :\n'
    : 'Hi,\n\nI’m interested in an Ele Café franchise.\n\nName:\nCity / area:\nPhone:\nA little about me:\n';
  return `mailto:${email}?subject=${encodeURIComponent(lang === 'fr' ? 'Demande de franchise' : FRANCHISE_SUBJECT)}&body=${encodeURIComponent(body)}`;
}
