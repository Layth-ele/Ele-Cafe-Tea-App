/**
 * press.ts — the /press page (media kit): quick facts, a copy-ready
 * boilerplate paragraph and brand assets, so writers can mention and link
 * Ele Café accurately. Shared by the React page and renderSeo.
 *
 * Facts that change (address, tea count, email) come from Admin → Settings
 * and the live catalog, never hard-coded here.
 */
import { FOUNDING_YEAR } from './storeContent';

export const PRESS_TITLE = 'Press & Media Kit | Ele Café Vancouver';
export const PRESS_TITLE_FR = 'Presse et trousse média | Ele Café Vancouver';
export const PRESS_DESCRIPTION =
  'Ele Café press kit: facts, a copy-ready description, logos and images of the Vancouver loose leaf tea shop and tea café, plus a media contact.';
export const PRESS_DESCRIPTION_FR =
  'Trousse média d’Ele Café : faits, description prête à copier, logos et images de la boutique de thé en vrac et café de thé de Vancouver, et contact médias.';

/** The paragraph writers can paste as-is. */
export function pressBoilerplate(
  o: { teaCount: number; street: string },
  lang: 'en' | 'fr' = 'en',
): string {
  const n = o.teaCount > 0 ? `${o.teaCount} ` : '';
  if (lang === 'fr') {
    return (
      `Ele Café est une boutique de thé en vrac et un café de thé à Vancouver (C.-B.), ouvert en ${FOUNDING_YEAR}` +
      `${o.street ? ` au ${o.street}` : ''}. Il propose ${n}thés en vrac — noirs, verts, blancs, oolong, rooibos, tisanes, fleurs et fruits — ` +
      'ainsi que du matcha et du hojicha de cérémonie préparés à la commande, du café et des accords avec pâtisseries. ' +
      'Ses thés sont expédiés partout au Canada depuis elecafe.ca.'
    );
  }
  return (
    `Ele Café is a loose leaf tea shop and tea café in Vancouver, BC, open since ${FOUNDING_YEAR}` +
    `${o.street ? ` at ${o.street}` : ''}. It offers ${n}loose leaf teas — black, green, white, oolong, rooibos, herbal, flower and fruit — ` +
    'alongside ceremonial matcha and hojicha whisked to order, coffee and tea & pastry pairings, ' +
    'and ships its teas across Canada from elecafe.ca.'
  );
}

export interface PressAsset {
  file: string;
  label: string;
  labelFr: string;
  kind: string;
}

export const PRESS_ASSETS: readonly PressAsset[] = [
  { file: '/icons/icon.svg', label: 'Logo (SVG)', labelFr: 'Logo (SVG)', kind: 'SVG' },
  {
    file: '/icons/icon-512.png',
    label: 'Logo (PNG, 512 px)',
    labelFr: 'Logo (PNG, 512 px)',
    kind: 'PNG',
  },
  {
    file: '/og-default.png',
    label: 'Brand image (1200 × 630)',
    labelFr: 'Image de marque (1200 × 630)',
    kind: 'PNG',
  },
];
