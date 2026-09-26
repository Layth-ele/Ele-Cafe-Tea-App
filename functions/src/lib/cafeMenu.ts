/**
 * cafeMenu.ts — the in-store café menu (/cafe) and the local keyword map.
 *
 * Shared by the React CafePage and renderSeo's server-rendered /cafe
 * (<head>, Menu + FAQPage JSON-LD, <noscript> body). Pastry combos are NOT
 * listed here: they come live from Admin → Pairings (/comboGalleryItems),
 * so prices and photos are always the admin's current ones.
 *
 * Only depends on storeContent (also shared), so it bundles into both.
 */
import { hoursText, money, type FaqItem, type StoreContent } from './storeContent';

/** How a drink is served. */
export type CafeTemp = 'iced-hot' | 'hot' | 'iced';

export interface CafeDrink {
  id:            string;
  name:          string;
  nameFr:        string;
  description:   string;
  descriptionFr: string;
  /** Omitted where it's obvious (affogato = ice cream). */
  temp?:         CafeTemp;
  /** 12 oz / 16 oz prices (CAD). */
  price12?:      number;
  price16?:      number;
  /** One-size drinks (espresso bar, affogato, …). */
  price?:        number;
}

export interface CafeChoice { name: string; nameFr: string }

/** Flavoured / fruit-purée lattes: one price pair, many choices. */
export interface CafeLatteOption {
  name: string; nameFr: string;
  description: string; descriptionFr: string;
  temp: CafeTemp; price12: number; price16: number;
  choices: readonly CafeChoice[];
}

export type CafeSectionId = 'coffee' | 'matcha' | 'hojicha' | 'tea';

export interface CafeMenuSection {
  id:        CafeSectionId;
  title:     string;
  titleFr:   string;
  tagline:   string;
  taglineFr: string;
  drinks:    readonly CafeDrink[];
  /** Syrup flavours offered with this section's flavoured drinks. */
  flavours?: readonly CafeChoice[];
  /** Coffee only: which drinks take a flavour. */
  flavourNote?: string; flavourNoteFr?: string;
  flavoured?: CafeLatteOption;
  puree?:     CafeLatteOption;
  /** Tea only: the drinks are made with any loose leaf tea on the shelf. */
  anyTea?:   boolean;
  /** Tea only: house favourites, each as a hot latte or an iced milk tea. */
  favourites?: readonly CafeFavourite[];
}

export interface CafeFavourite {
  id: string; name: string; nameFr: string;
  description: string; descriptionFr: string;
  /** The loose leaf tea it's made with (tea page link). */
  tea: { category: string; slug: string };
}

export const CAFE_FLAVOURS: readonly CafeChoice[] = [
  { name: 'Vanilla',           nameFr: 'Vanille' },
  { name: 'Caramel',           nameFr: 'Caramel' },
  { name: 'Maple',             nameFr: 'Érable' },
  { name: 'Strawberry',        nameFr: 'Fraise' },
  { name: 'Rose',              nameFr: 'Rose' },
  { name: 'Lavender',          nameFr: 'Lavande' },
  { name: 'Hazelnut',          nameFr: 'Noisette' },
  { name: 'Gingerbread',       nameFr: 'Pain d’épices' },
  { name: 'Sugar-free vanilla', nameFr: 'Vanille sans sucre' },
];

export const CAFE_PUREES: readonly CafeChoice[] = [
  { name: 'Strawberry', nameFr: 'Fraise' },
  { name: 'Mango',      nameFr: 'Mangue' },
  { name: 'Peach',      nameFr: 'Pêche' },
];

export const CAFE_MILK_SUBSTITUTES: readonly { name: string; nameFr: string; price: number }[] = [
  { name: 'Oat, soy, almond or coconut milk', nameFr: 'Lait d’avoine, de soya, d’amande ou de coco', price: 0.95 },
  { name: 'Lactose-free milk',                nameFr: 'Lait sans lactose',                          price: 0.70 },
];

const CHOC = 'Dark, milk or white chocolate.';
const CHOC_FR = 'Chocolat noir, au lait ou blanc.';

/** Matcha and hojicha share a board; only the tea and a few prices differ. */
function powderDrinks(id: 'matcha' | 'hojicha', Name: string, NameFr: string): CafeDrink[] {
  const t = Name.toLowerCase();
  return [
    { id: `${id}-tea`, name: `${Name} Tea`, nameFr: `Thé ${t}`, temp: 'iced-hot', price12: 4.99, price16: 4.99,
      description: `Premium ${t} whisked traditionally with hot water.`,
      descriptionFr: `${NameFr} de qualité supérieure fouetté à l’eau chaude, à la manière traditionnelle.` },
    { id: `${id}-espresso-tea`, name: `${Name} Espresso Tea`, nameFr: `Thé ${t} espresso`, temp: 'iced-hot', price12: 6.99, price16: 6.99,
      description: `Premium ${t} with a shot of espresso.`,
      descriptionFr: `${NameFr} de qualité supérieure avec un shot d’espresso.` },
    { id: `${id}-latte`, name: `${Name} Latte`, nameFr: `Latte au ${t}`, temp: 'iced-hot', price12: 6.35, price16: 6.99,
      description: `Silky ceremonial ${t} blended with steamed or cold milk.`,
      descriptionFr: `${NameFr} de cérémonie soyeux, mélangé à du lait chaud ou froid.` },
    { id: `chocolate-${id}-latte`, name: `Chocolate ${Name} Latte`, nameFr: `Latte ${t} au chocolat`, temp: 'iced-hot', price12: 7.85, price16: 8.99,
      description: `${Name} latte with chocolate. ${CHOC}`, descriptionFr: `Latte au ${t} et chocolat. ${CHOC_FR}` },
    { id: `dirty-${id}`, name: `Dirty ${Name}`, nameFr: `Dirty ${t}`, temp: 'iced-hot', price12: 7.99, price16: 8.49,
      description: `Ceremonial ${t} and a shot of espresso.`, descriptionFr: `${NameFr} de cérémonie et un shot d’espresso.` },
    { id: `chocolate-dirty-${id}`, name: `Chocolate Dirty ${Name}`, nameFr: `Dirty ${t} au chocolat`, temp: 'iced-hot', price12: 8.85, price16: 9.99,
      description: `Dirty ${t} with chocolate. ${CHOC}`, descriptionFr: `Dirty ${t} au chocolat. ${CHOC_FR}` },
    { id: `${id}-affogato`, name: `${Name} Affogato`, nameFr: `Affogato au ${t}`, price: 8.99,
      description: `Ceremonial ${t} poured over vanilla ice cream.`, descriptionFr: `${NameFr} de cérémonie versé sur de la crème glacée à la vanille.` },
    { id: `${id}misu-latte`, name: `${Name}’misu Latte`, nameFr: `Latte ${t}’misu`, temp: 'iced-hot', price: 8.99,
      description: `${Name} latte with mascarpone cream and steamed or cold milk, topped with a ladyfinger.`,
      descriptionFr: `Latte au ${t} avec crème mascarpone et lait chaud ou froid, garni d’un biscuit à la cuillère.` },
  ];
}

function powderOptions(Name: string, NameFr: string, price16: number): Pick<CafeMenuSection, 'flavoured' | 'puree'> {
  const t = Name.toLowerCase();
  return {
    flavoured: {
      name: `Flavoured ${Name} Latte`, nameFr: `Latte au ${t} aromatisé`, temp: 'iced-hot', price12: 6.95, price16,
      description: `Your ${t}, never boring. Pick the flavour that fits your mood and enjoy it iced or hot.`,
      descriptionFr: `Votre ${t}, jamais ennuyeux. Choisissez la saveur qui vous ressemble et savourez-le glacé ou chaud.`,
      choices: CAFE_FLAVOURS,
    },
    puree: {
      name: `Fruit Purée ${Name} Latte`, nameFr: `Latte au ${t} et purée de fruits`, temp: 'iced-hot', price12: 6.95, price16,
      description: `Ceremonial ${t} layered over real fruit purée: as pretty as it tastes. Iced or hot.`,
      descriptionFr: `${NameFr} de cérémonie étagé sur une vraie purée de fruits, aussi beau que bon. Glacé ou chaud.`,
      choices: CAFE_PUREES,
    },
  };
}

/** The café menu, in board order. Prices from the in-store menu boards. */
export const CAFE_MENU: readonly CafeMenuSection[] = [
  {
    id: 'coffee', title: 'Coffee', titleFr: 'Café',
    tagline: 'Espresso bar classics, lattes and mochas — from a double-shot medium blend.',
    taglineFr: 'Les classiques du bar à espresso, lattes et mokas — à base d’un double shot de mélange médium.',
    drinks: [
      { id: 'espresso', name: 'Espresso', nameFr: 'Espresso', temp: 'iced-hot', price: 3.75,
        description: 'Double shot of our medium blend — smooth and creamy.', descriptionFr: 'Double shot de notre mélange médium — doux et crémeux.' },
      { id: 'americano', name: 'Americano', nameFr: 'Americano', temp: 'iced-hot', price: 4.35,
        description: 'Espresso with hot or cold water.', descriptionFr: 'Espresso allongé d’eau chaude ou froide.' },
      { id: 'flavoured-americano', name: 'Flavoured Americano', nameFr: 'Americano aromatisé', temp: 'iced-hot', price: 5.00,
        description: 'Americano with your choice of flavour syrup.', descriptionFr: 'Americano avec le sirop de votre choix.' },
      { id: 'americano-misto', name: 'Americano Misto', nameFr: 'Americano misto', temp: 'iced-hot', price: 5.10,
        description: 'Espresso with hot water and a splash of steamed milk.', descriptionFr: 'Espresso allongé d’eau chaude avec un nuage de lait chaud.' },
      { id: 'cappuccino', name: 'Cappuccino', nameFr: 'Cappuccino', temp: 'hot', price: 5.40,
        description: 'Rich espresso topped with thick, creamy milk foam.', descriptionFr: 'Espresso corsé garni d’une épaisse mousse de lait crémeuse.' },
      { id: 'flat-white', name: 'Flat White', nameFr: 'Flat white', temp: 'hot', price: 5.35,
        description: 'Strong espresso with smooth steamed milk.', descriptionFr: 'Espresso intense avec un lait chaud onctueux.' },
      { id: 'macchiato', name: 'Macchiato', nameFr: 'Macchiato', temp: 'hot', price: 4.50,
        description: 'A shot of espresso with a small dollop of milk foam.', descriptionFr: 'Un shot d’espresso avec une touche de mousse de lait.' },
      { id: 'cortado', name: 'Cortado', nameFr: 'Cortado', temp: 'hot', price: 4.60,
        description: 'Equal parts espresso and warm milk — smooth and balanced.', descriptionFr: 'Espresso et lait chaud à parts égales — doux et équilibré.' },
      { id: 'coffee-latte', name: 'Coffee Latte', nameFr: 'Latte au café', temp: 'iced-hot', price12: 5.35, price16: 5.90,
        description: 'Espresso with steamed or cold milk — single or double shot.', descriptionFr: 'Espresso avec lait chaud ou froid — simple ou double shot.' },
      { id: 'flavoured-coffee-latte', name: 'Flavoured Coffee Latte', nameFr: 'Latte au café aromatisé', temp: 'iced-hot', price12: 5.95, price16: 6.50,
        description: 'Espresso and milk with your choice of flavour syrup.', descriptionFr: 'Espresso et lait avec le sirop de votre choix.' },
      { id: 'mocha', name: 'Mocha', nameFr: 'Moka', temp: 'iced-hot', price12: 7.49, price16: 7.99,
        description: `Coffee latte with chocolate. ${CHOC}`, descriptionFr: `Latte au café et chocolat. ${CHOC_FR}` },
      { id: 'dirty-chai-latte', name: 'Dirty Chai Latte', nameFr: 'Dirty chai latte', temp: 'iced-hot', price12: 7.49, price16: 7.99,
        description: 'Chai tea latte with a shot of espresso.', descriptionFr: 'Chai latte avec un shot d’espresso.' },
      { id: 'affogato', name: 'Affogato', nameFr: 'Affogato', price: 8.99,
        description: 'Espresso poured over vanilla ice cream.', descriptionFr: 'Espresso versé sur de la crème glacée à la vanille.' },
      { id: 'coffeemisu-latte', name: 'Coffee’misu Latte', nameFr: 'Latte café’misu', temp: 'iced-hot', price: 8.99,
        description: 'Coffee latte with mascarpone cream and steamed or cold milk, topped with a ladyfinger.',
        descriptionFr: 'Latte au café avec crème mascarpone et lait chaud ou froid, garni d’un biscuit à la cuillère.' },
    ],
    flavours: CAFE_FLAVOURS,
    flavourNote: 'Your coffee, never boring. Add a flavour to your Americano or latte and enjoy it iced or hot.',
    flavourNoteFr: 'Votre café, jamais ennuyeux. Ajoutez une saveur à votre Americano ou latte et savourez-le glacé ou chaud.',
  },
  {
    id: 'matcha', title: 'Matcha', titleFr: 'Matcha',
    tagline: 'Ceremonial-grade Japanese matcha, whisked to order — hot or iced.',
    taglineFr: 'Matcha japonais de qualité cérémonie, fouetté à la commande — chaud ou glacé.',
    drinks: powderDrinks('matcha', 'Matcha', 'Matcha'),
    ...powderOptions('Matcha', 'Matcha', 7.69),
  },
  {
    id: 'hojicha', title: 'Hojicha', titleFr: 'Hojicha',
    tagline: 'Roasted Japanese green tea — toasty, caramel-smooth and naturally low in caffeine.',
    taglineFr: 'Thé vert japonais torréfié — grillé, doux comme le caramel et naturellement peu caféiné.',
    drinks: powderDrinks('hojicha', 'Hojicha', 'Hojicha'),
    ...powderOptions('Hojicha', 'Hojicha', 7.99),
  },
  {
    id: 'tea', title: 'Tea', titleFr: 'Thé',
    tagline: 'Any loose leaf tea on our shelves, brewed the way you like it — hot, iced, with milk or as a latte.',
    taglineFr: 'N’importe quel thé en vrac de nos étagères, préparé à votre goût — chaud, glacé, au lait ou en latte.',
    anyTea: true,
    favourites: [
      { id: 'london-fog', name: 'London Fog', nameFr: 'London Fog', tea: { category: 'black', slug: 'earl-grey-classic' },
        description: 'Earl Grey with vanilla and milk — the Vancouver classic.',
        descriptionFr: 'Earl Grey, vanille et lait — le grand classique de Vancouver.' },
      { id: 'rose-tea-latte', name: 'Rose Tea Latte', nameFr: 'Latte au thé à la rose', tea: { category: 'black', slug: 'rose-tea' },
        description: 'Black tea with rose petals, soft and floral.',
        descriptionFr: 'Thé noir aux pétales de rose, doux et floral.' },
      { id: 'lychee-jasmine-latte', name: 'Shanghai Lychee Jasmine Tea Latte', nameFr: 'Latte au thé litchi jasmin de Shanghai',
        tea: { category: 'green', slug: 'shanghai-lychee-jasmine' },
        description: 'Jasmine green tea with sweet lychee.',
        descriptionFr: 'Thé vert au jasmin et litchi sucré.' },
      { id: 'chai-tea-latte', name: 'Chai Tea Latte', nameFr: 'Chai latte', tea: { category: 'black', slug: 'himalayan-chai' },
        description: 'Himalayan chai — cinnamon, cardamom, ginger and clove.',
        descriptionFr: 'Chai de l’Himalaya — cannelle, cardamome, gingembre et clou de girofle.' },
      { id: 'rooibos-tea-latte', name: 'Rooibos Tea Latte', nameFr: 'Latte au rooibos', tea: { category: 'rooibos', slug: 'rooibos' },
        description: 'Naturally caffeine-free South African rooibos — smooth and honeyed.',
        descriptionFr: 'Rooibos sud-africain naturellement sans caféine — doux et miellé.' },
    ],
    drinks: [
      { id: 'infused-tea', name: 'Infused Tea', nameFr: 'Thé infusé', temp: 'hot',
        description: 'Loose leaf tea steeped to order at the right temperature and time.',
        descriptionFr: 'Thé en vrac infusé à la commande, à la bonne température et au bon temps.' },
      { id: 'iced-tea', name: 'Iced Tea', nameFr: 'Thé glacé', temp: 'iced',
        description: 'Freshly brewed iced tea from our fruit, herbal, green and black teas.',
        descriptionFr: 'Thé glacé fraîchement infusé à partir de nos thés aux fruits, tisanes, thés verts et noirs.' },
      { id: 'milk-tea', name: 'Iced Milk Tea', nameFr: 'Thé au lait glacé', temp: 'iced',
        description: 'Loose leaf tea brewed strong and poured over ice with cold milk — rich and creamy.',
        descriptionFr: 'Thé en vrac infusé fort, versé sur glace avec du lait froid — riche et crémeux.' },
      { id: 'tea-latte', name: 'Tea Latte', nameFr: 'Latte au thé', temp: 'hot',
        description: 'Tea brewed strong and topped with steamed milk. Want it cold? Order it as an iced milk tea.',
        descriptionFr: 'Thé infusé fort et garni de lait chaud. Envie de froid? Commandez-le en thé au lait glacé.' },
    ],
  },
];

/** Every drink on the menu, flattened (SEO fallback, keyword checks). */
export const CAFE_DRINKS: readonly CafeDrink[] = CAFE_MENU.flatMap((s) => s.drinks);

export const CAFE_TITLE = 'Café Menu — Coffee, Matcha, Hojicha & Tea | Ele Café Vancouver';

export const CAFE_DESCRIPTION = 'Ele Café, a Vancouver tea café: espresso, coffee lattes, mocha and Americano, ceremonial matcha and hojicha lattes, milk tea, iced tea and croissant pastry combos.';
export const CAFE_DESCRIPTION_FR = 'Ele Café, café de thé à Vancouver : espresso, lattes au café, moka et Americano, lattes au matcha de cérémonie et au hojicha, thé au lait, thé glacé et combos pâtisserie.';

export const PAIRINGS_TITLE = 'Tea & Pastry Pairings — Croissants, Danishes & Strudels | Ele Café Vancouver';
export const PAIRINGS_DESCRIPTION = 'Tea and pastry pairing combos at Ele Café Vancouver: butter and Nutella croissants, danishes and savoury strudels, each with your choice of tea or Americano.';

/** Keyword-rich intro under the /cafe heading. `street` from Admin → Settings. */
export function cafeIntro(s: StoreContent, lang: 'en' | 'fr' = 'en'): string {
  const [street] = s.address.split(',');
  const where = street?.trim();
  if (lang === 'fr') {
    return `Vous cherchez un bon café à Vancouver pour un thé et une pâtisserie? ${where ? `Passez nous voir au ${where} : ` : ''}`
      + 'notre café sert un menu complet de café (espresso, Americano, cappuccino, lattes, moka), de matcha de cérémonie et de hojicha (lattes, dirty matcha, affogato, lattes aromatisés ou à la purée de fruits), '
      + 'ainsi que nos thés en vrac en infusion, thé glacé, thé au lait ou latte au thé, '
      + 'avec des croissants au beurre, au Nutella et aux amandes, des danoises, des strudels salés et des muffins. '
      + 'Chaque pâtisserie se prend en combo avec un thé ou un Americano.';
  }
  return `Looking for the best café in Vancouver for tea and pastries? ${where ? `Visit us at ${where}: ` : ''}`
    + 'our tea café pours a full coffee menu (espresso, Americano, cappuccino, lattes and mochas), ceremonial matcha and hojicha (matcha lattes, hojicha lattes, dirty matcha, affogato, flavoured and fruit purée lattes), '
    + 'and every loose leaf tea on our shelves as infused tea, iced tea, milk tea or a tea latte, '
    + 'alongside butter, Nutella and almond croissants, danishes, savoury strudels and muffins. '
    + 'Every pastry comes as a combo with your choice of tea or Americano.';
}

/** Café FAQ — visible accordion + FAQPage JSON-LD on /cafe. */
export function buildCafeFaq(s: StoreContent, lang: 'en' | 'fr' = 'en'): FaqItem[] {
  const hours = s.hours.length ? hoursText(s.hours, lang) : '';
  if (lang === 'fr') {
    return [
      { q: 'Où se trouve Ele Café à Vancouver?',
        a: `${s.address ? `Nous sommes au ${s.address}.` : 'Nous sommes à Vancouver.'}${hours ? ` Heures d’ouverture : ${hours}.` : ''}` },
      { q: 'Servez-vous du matcha de cérémonie?',
        a: 'Oui. Matcha et hojicha japonais de qualité cérémonie, fouettés à la commande : thé, latte, dirty matcha, affogato, et lattes aromatisés (vanille, érable, lavande…) ou à la purée de fruits (fraise, mangue, pêche), chauds ou glacés.' },
      { q: 'Servez-vous du café?',
        a: 'Oui — un bar à espresso complet : espresso, Americano, cappuccino, flat white, cortado, macchiato, lattes au café aromatisés, moka, dirty chai et affogato, en format 12 oz ou 16 oz.' },
      { q: 'Avez-vous des laits végétaux?',
        a: 'Oui — lait d’avoine, de soya, d’amande ou de coco (+0,95 $) et lait sans lactose (+0,70 $) dans n’importe quelle boisson.' },
      { q: 'Quelles pâtisseries proposez-vous?',
        a: 'Des croissants au beurre, au Nutella et aux amandes, des danoises (poire, pistache), des strudels épinards-feta et poireaux-parmesan, des spirales à la crème de pistache et des muffins, chacun en combo avec un thé ou un Americano.' },
      { q: 'Puis-je acheter le thé que je bois au café?',
        a: `Oui. Tous nos thés en vrac sont en vente sur place et en ligne, avec cueillette gratuite à Vancouver${s.freeShippingThreshold > 0 ? ` et livraison gratuite au Canada dès ${money(s.freeShippingThreshold)}` : ''}.` },
    ];
  }
  return [
    { q: 'Where is Ele Café in Vancouver?',
      a: `${s.address ? `We’re at ${s.address}.` : 'We’re in Vancouver.'}${hours ? ` Opening hours: ${hours}.` : ''}` },
    { q: 'Do you serve ceremonial matcha?',
      a: 'Yes. Ceremonial-grade Japanese matcha and roasted hojicha, whisked to order: straight, as a latte, dirty (with espresso), affogato, or as a flavoured (vanilla, maple, lavender…) or fruit purée (strawberry, mango, peach) latte, hot or iced.' },
    { q: 'Do you serve coffee?',
      a: 'Yes — a full espresso bar: espresso, Americano, cappuccino, flat white, cortado, macchiato, flavoured coffee lattes, mocha, dirty chai and affogato, in 12 oz or 16 oz.' },
    { q: 'Do you have dairy-free milk?',
      a: 'Yes — oat, soy, almond or coconut milk (+$0.95) and lactose-free milk (+$0.70) in any drink.' },
    { q: 'What pastries do you have?',
      a: 'Butter, Nutella and almond croissants, pear and pistachio danishes, spinach-and-feta and leek-and-parmesan strudels, pistachio cream spiral croissants and muffins — each available as a combo with tea or an Americano.' },
    { q: 'Can I buy the tea I drink at the café?',
      a: `Yes. Every loose leaf tea we brew is for sale in the café and online, with free pickup in Vancouver${s.freeShippingThreshold > 0 ? ` and free Canada-wide shipping over ${money(s.freeShippingThreshold)}` : ''}.` },
  ];
}

/** A priced pastry combo from Admin → Pairings. */
export interface CafeCombo { title: string; description?: string; price: number; slug?: string; imageUrl?: string }

function drinkOffers(d: { price?: number; price12?: number; price16?: number }): Record<string, unknown> {
  const offer = (price: number, name?: string) =>
    ({ '@type': 'Offer', ...(name ? { name } : {}), price: price.toFixed(2), priceCurrency: 'CAD' });
  if (typeof d.price === 'number') return { offers: offer(d.price) };
  const sized = [
    ...(typeof d.price12 === 'number' ? [offer(d.price12, '12 oz')] : []),
    ...(typeof d.price16 === 'number' ? [offer(d.price16, '16 oz')] : []),
  ];
  return sized.length ? { offers: sized } : {};
}

/** schema.org Menu for /cafe: drinks + live pastry combos. */
export function cafeMenuLd(siteBase: string, combos: readonly CafeCombo[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    '@id': `${siteBase}/cafe#menu`,
    name: 'Ele Café Menu',
    url: `${siteBase}/cafe`,
    inLanguage: 'en-CA',
    hasMenuSection: [
      ...CAFE_MENU.map((sec) => ({
        '@type': 'MenuSection',
        name: sec.title,
        description: sec.tagline,
        hasMenuItem: [
          ...sec.drinks.map((d) => ({ '@type': 'MenuItem', name: d.name, description: d.description, ...drinkOffers(d) })),
          ...[sec.flavoured, sec.puree].filter((o): o is CafeLatteOption => !!o).map((o) => ({
            '@type': 'MenuItem', name: o.name,
            description: `${o.description} ${o.choices.map((c) => c.name).join(', ')}.`,
            ...drinkOffers(o),
          })),
          ...(sec.favourites ?? []).map((f) => ({
            '@type': 'MenuItem', name: f.name,
            description: `${f.description} Hot tea latte or iced milk tea.`,
          })),
        ],
      })),
      ...(combos.length ? [{
        '@type': 'MenuSection',
        name: 'Pastry Combos',
        description: 'Each pastry comes with your choice of tea or Americano.',
        hasMenuItem: combos.map((c) => ({
          '@type': 'MenuItem',
          name: c.title,
          ...(c.description ? { description: c.description } : {}),
          ...(c.imageUrl ? { image: c.imageUrl } : {}),
          offers: { '@type': 'Offer', price: c.price.toFixed(2), priceCurrency: 'CAD' },
        })),
      }] : []),
    ],
  };
}

// ── Local keyword map ───────────────────────────────────────────────────────
//
// The 25 search terms the site targets in Vancouver / Canada and the page
// that owns each one (one page per term avoids keyword cannibalisation).
// Chosen for purchase or visit intent — NOT measured search volumes; check
// them against Google Search Console → Performance → Queries once a few
// weeks of data exist, and swap out terms that don't earn impressions.
//
// `via: 'gbp'` terms ("near me") are ranked by the Google Business Profile
// (distance, reviews, photos, hours), not page text — they're listed so the
// map is complete. tests/unit/seo/localKeywords.test.ts checks every
// `via: 'copy'` term actually appears in its page's copy.

export interface LocalKeyword { keyword: string; page: string; via: 'copy' | 'gbp' }

export const LOCAL_KEYWORDS: readonly LocalKeyword[] = [
  { keyword: 'best café in Vancouver',       page: '/cafe',                       via: 'copy' },
  { keyword: 'café near me',                 page: '/cafe',                       via: 'gbp'  },
  { keyword: 'coffee shop near me',          page: '/cafe',                       via: 'gbp'  },
  { keyword: 'tea café',                     page: '/cafe',                       via: 'copy' },
  { keyword: 'matcha latte',                 page: '/cafe',                       via: 'copy' },
  { keyword: 'ceremonial matcha',            page: '/cafe',                       via: 'copy' },
  { keyword: 'hojicha latte',                page: '/cafe',                       via: 'copy' },
  { keyword: 'milk tea',                     page: '/cafe',                       via: 'copy' },
  { keyword: 'iced tea',                     page: '/cafe',                       via: 'copy' },
  { keyword: 'Americano',                    page: '/cafe',                       via: 'copy' },
  { keyword: 'croissant',                    page: '/cafe',                       via: 'copy' },
  { keyword: 'almond croissant',             page: '/cafe',                       via: 'copy' },
  { keyword: 'Nutella croissant',            page: '/cafe',                       via: 'copy' },
  { keyword: 'pastry combo',                 page: '/cafe',                       via: 'copy' },
  { keyword: 'tea and pastry pairing',       page: '/pairings',                   via: 'copy' },
  { keyword: 'tea shop Vancouver',           page: '/',                           via: 'copy' },
  { keyword: 'loose leaf tea Vancouver',     page: '/',                           via: 'copy' },
  { keyword: 'buy loose leaf tea online Canada', page: '/',                       via: 'copy' },
  { keyword: 'matcha powder Canada',         page: '/collections/matcha-powder',  via: 'copy' },
  { keyword: 'hojicha powder',               page: '/collections/matcha-powder',  via: 'copy' },
  { keyword: 'tea latte',                    page: '/collections/tea-latte',      via: 'copy' },
  { keyword: 'milk tea at home',             page: '/collections/milk-tea',       via: 'copy' },
  { keyword: 'caffeine-free tea',            page: '/collections/caffeine-free',  via: 'copy' },
  { keyword: 'Japanese green tea',           page: '/collections/japanese-tea',   via: 'copy' },
  { keyword: 'chai latte',                   page: '/collections/chai-tea',       via: 'copy' },
];
