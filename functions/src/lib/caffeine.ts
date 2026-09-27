/**
 * caffeine.ts — data for the Tea Caffeine Calculator (/tea-caffeine-calculator).
 *
 * Shared by the React page and renderSeo's server-rendered version. Tea
 * ranges match the brewing notes on every tea page (SEO_BREWING_PARAMS in
 * index.ts); daily limits are Health Canada's guidance.
 *
 * No imports — bundled into both the client and functions.
 */

export const CAFFEINE_TITLE =
  'Tea Caffeine Calculator — How Much Caffeine Is in Your Tea? | Ele Café';
export const CAFFEINE_TITLE_FR =
  'Calculateur de caféine du thé — Combien de caféine dans votre thé? | Ele Café';
export const CAFFEINE_DESCRIPTION =
  'Free tea caffeine calculator: add up the caffeine in black, green, white and oolong tea, matcha, hojicha and coffee, and compare it with Health Canada’s daily limit.';
export const CAFFEINE_DESCRIPTION_FR =
  'Calculateur gratuit : additionnez la caféine du thé noir, vert, blanc et oolong, du matcha, du hojicha et du café, et comparez-la à la limite quotidienne de Santé Canada.';

export interface CaffeineDrink {
  id: string;
  name: string;
  nameFr: string;
  serving: string;
  servingFr: string;
  /** Typical caffeine per serving, mg. */
  min: number;
  max: number;
  /** Where to shop it on the site (category or collection path). */
  link?: string;
}

export const CAFFEINE_DRINKS: readonly CaffeineDrink[] = [
  {
    id: 'black',
    name: 'Black tea',
    nameFr: 'Thé noir',
    serving: '1 cup (250 ml)',
    servingFr: '1 tasse (250 ml)',
    min: 40,
    max: 70,
    link: '/products/black',
  },
  {
    id: 'oolong',
    name: 'Oolong tea',
    nameFr: 'Thé oolong',
    serving: '1 cup (250 ml)',
    servingFr: '1 tasse (250 ml)',
    min: 30,
    max: 50,
    link: '/products/oolong',
  },
  {
    id: 'green',
    name: 'Green tea',
    nameFr: 'Thé vert',
    serving: '1 cup (250 ml)',
    servingFr: '1 tasse (250 ml)',
    min: 20,
    max: 45,
    link: '/products/green',
  },
  {
    id: 'white',
    name: 'White tea',
    nameFr: 'Thé blanc',
    serving: '1 cup (250 ml)',
    servingFr: '1 tasse (250 ml)',
    min: 15,
    max: 30,
    link: '/products/white',
  },
  {
    id: 'matcha',
    name: 'Matcha (latte or whisked)',
    nameFr: 'Matcha (latte ou fouetté)',
    serving: '1 serving (2 g)',
    servingFr: '1 portion (2 g)',
    min: 60,
    max: 70,
    link: '/collections/matcha-powder',
  },
  {
    id: 'hojicha',
    name: 'Hojicha (latte or whisked)',
    nameFr: 'Hojicha (latte ou fouetté)',
    serving: '1 serving (2 g)',
    servingFr: '1 portion (2 g)',
    min: 10,
    max: 20,
    link: '/collections/matcha-powder',
  },
  {
    id: 'rooibos',
    name: 'Rooibos, herbal & fruit tea',
    nameFr: 'Rooibos, tisanes et thés aux fruits',
    serving: '1 cup (250 ml)',
    servingFr: '1 tasse (250 ml)',
    min: 0,
    max: 0,
    link: '/collections/caffeine-free',
  },
  {
    id: 'coffee',
    name: 'Brewed coffee',
    nameFr: 'Café filtre',
    serving: '1 cup (250 ml)',
    servingFr: '1 tasse (250 ml)',
    min: 95,
    max: 165,
  },
  {
    id: 'espresso',
    name: 'Espresso',
    nameFr: 'Espresso',
    serving: '1 shot (30 ml)',
    servingFr: '1 dose (30 ml)',
    min: 60,
    max: 75,
  },
];

export interface CaffeineLimit {
  id: string;
  label: string;
  labelFr: string;
  mg: number;
}

/** Health Canada's maximum daily caffeine intake guidance. */
export const CAFFEINE_LIMITS: readonly CaffeineLimit[] = [
  { id: 'adult', label: 'Healthy adults', labelFr: 'Adultes en bonne santé', mg: 400 },
  {
    id: 'pregnancy',
    label: 'Pregnant, breastfeeding or planning a pregnancy',
    labelFr: 'Grossesse, allaitement ou projet de grossesse',
    mg: 300,
  },
];

export const HEALTH_CANADA_CAFFEINE_URL =
  'https://www.canada.ca/en/health-canada/services/food-nutrition/food-safety/food-additives/caffeine-foods.html';

/** Total caffeine range (mg) for a map of drink id → servings. */
export function caffeineTotal(counts: Record<string, number>): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const d of CAFFEINE_DRINKS) {
    const n = Math.max(0, Math.floor(counts[d.id] ?? 0));
    min += n * d.min;
    max += n * d.max;
  }
  return { min, max };
}

export const CAFFEINE_INTRO =
  'How much caffeine is in your tea? Add the cups you drink in a day to see a typical total, and how it compares with Health Canada’s daily guidance. Tea usually has far less caffeine than coffee, and steeping time and water temperature change it too: a shorter, cooler steep gives a gentler cup.';
export const CAFFEINE_INTRO_FR =
  'Combien de caféine contient votre thé? Ajoutez les tasses que vous buvez dans une journée pour voir un total typique, et le comparer aux recommandations de Santé Canada. Le thé contient généralement bien moins de caféine que le café, et le temps d’infusion et la température de l’eau la font aussi varier : une infusion plus courte et moins chaude donne une tasse plus douce.';
