/**
 * teaGuide.ts — homepage "Loose Leaf Tea Guide" + "Shop by mood" content.
 *
 * Brewing figures are standard ranges for each tea type (each tea's own
 * page shows its exact temperature and steep time). Kept in one place so
 * the visible guide, the FAQ answers and the FAQPage JSON-LD agree.
 */
import type { CategoryId } from './categories';

export interface TeaTypeGuide {
  id:          CategoryId;
  /** One-line, keyword-rich description of the tea type. */
  description: string;
  /** Same in French (shown when the site is in French). */
  descriptionFr: string;
  temp:        string;
  time:        string;
  /** French steep/prep line when `time` contains words (e.g. powders). */
  timeFr?:     string;
  caffeine:    'Contains caffeine' | 'Caffeine-free' | 'Mostly caffeine-free';
}

export const TEA_GUIDE: readonly TeaTypeGuide[] = [
  { id: 'black',   temp: '95–100°C', time: '3–5 min', caffeine: 'Contains caffeine',
    description: 'Fully oxidised, bold and malty — the classic morning cup, from Assam to Earl Grey and chai. Takes milk well.', descriptionFr: 'Entièrement oxydé, corsé et malté — la tasse classique du matin, de l’Assam à l’Earl Grey et au chai. Se marie bien avec du lait.' },
  { id: 'green',   temp: '75–80°C',  time: '2–3 min', caffeine: 'Contains caffeine',
    description: 'Unoxidised and fresh, with grassy, vegetal and jasmine notes. Cooler water keeps it sweet, not bitter.', descriptionFr: 'Non oxydé et frais, aux notes herbacées, végétales et de jasmin. Une eau moins chaude le garde doux, sans amertume.' },
  { id: 'white',   temp: '80–85°C',  time: '3–5 min', caffeine: 'Contains caffeine',
    description: 'The most delicate tea — young leaves and buds, lightly processed, with a soft, honeyed finish.', descriptionFr: 'Le thé le plus délicat — jeunes feuilles et bourgeons, peu transformés, à la finale douce et mielleuse.' },
  { id: 'oolong',  temp: '85–95°C',  time: '3–5 min', caffeine: 'Contains caffeine',
    description: 'Partly oxidised, between green and black — floral to toasty. Good leaves can be steeped several times.', descriptionFr: 'Partiellement oxydé, entre le vert et le noir — de floral à grillé. De bonnes feuilles peuvent infuser plusieurs fois.' },
  { id: 'rooibos', temp: '100°C',    time: '5–7 min', caffeine: 'Caffeine-free',
    description: 'South African red bush — naturally caffeine-free, smooth and nutty. Won’t turn bitter, so steep it long.', descriptionFr: 'Buisson rouge d’Afrique du Sud — naturellement sans caféine, doux et aux notes de noisette. Ne devient pas amer : laissez-le infuser longtemps.' },
  { id: 'herbal',  temp: '100°C',    time: '5–7 min', caffeine: 'Mostly caffeine-free',
    description: 'Infusions of herbs, roots and spices like ginger, mint and turmeric — most are caffeine-free (maté blends aside).', descriptionFr: 'Infusions d’herbes, de racines et d’épices comme le gingembre, la menthe et le curcuma — la plupart sans caféine (sauf les mélanges au maté).' },
  { id: 'flower',  temp: '90–100°C', time: '4–6 min', caffeine: 'Mostly caffeine-free',
    description: 'Whole blossoms such as lavender, chamomile and butterfly pea — calming, aromatic evening teas.', descriptionFr: 'Fleurs entières comme la lavande, la camomille et le pois bleu — des thés du soir apaisants et parfumés.' },
  { id: 'fruit',   temp: '100°C',    time: '5–8 min', caffeine: 'Caffeine-free',
    description: 'Dried fruit and berry blends, naturally sweet and vivid — excellent hot or brewed strong and iced.', descriptionFr: 'Mélanges de fruits séchés et de baies, naturellement sucrés et éclatants — excellents chauds ou infusés fort et servis glacés.' },
  { id: 'powder',  temp: '70–80°C',  time: 'Whisk 20–30 s', timeFr: 'Fouetter 20–30 s', caffeine: 'Contains caffeine',
    description: 'Stone-ground Japanese matcha and roasted hojicha powders — whisk into water for a frothy bowl or into milk for a café-style latte.', descriptionFr: 'Matcha japonais moulu à la pierre et poudre de hojicha torréfiée — à fouetter dans l’eau pour un bol mousseux ou dans le lait pour un latte comme au café.' },
];

export const MOODS = [
  { title: 'Caffeine-free',  sub: 'Rooibos, herbal & fruit teas for any hour', to: '/collections/caffeine-free' },
  { title: 'Morning energy', sub: 'Bold black and bright green teas',          to: '/products?cats=black,green' },
  { title: 'Calm & unwind',  sub: 'Herbal, flower & rooibos blends',           to: '/products?cats=herbal,flower,rooibos' },
  { title: 'Certified organic', sub: 'Our organic loose leaf selection',       to: '/collections/organic' },
  { title: 'Fruity & iced',  sub: 'Vivid blends that shine over ice',          to: '/collections/iced-tea' },
  { title: 'Tea gifts',      sub: 'Build a gift box in minutes',               to: '/gifts' },
] as const;
