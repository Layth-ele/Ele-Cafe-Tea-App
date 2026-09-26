/**
 * seoCatalog.ts — single source for category + collection landing-page copy.
 *
 * Shared by the renderSeo / getSitemap Cloud Functions (server-rendered
 * <head>, <noscript> body, sitemap) and the React storefront (category
 * intro on /products/:category, /collections/:slug pages). Keeping the
 * keyword copy and the collection membership rules in one module means
 * the crawler HTML, the hydrated page and the sitemap can never disagree.
 *
 * No imports — this file is bundled into both the client and functions.
 */

export interface CategorySeo {
  label: string;
  labelFr: string;
  /** Keyword-rich intro paragraph shown above the product grid. */
  intro: string;
  introFr: string;
}

export const CATEGORY_SEO: Record<string, CategorySeo> = {
  black: {
    label: 'Black Tea',
    labelFr: 'Thé noir',
    intro:
      'Shop loose leaf black tea online in Canada — Assam, Ceylon, Earl Grey, English Breakfast and masala chai, blended and packed at our Vancouver tea café. Bold, malty and full-bodied, black tea is the classic morning cup and takes milk well.',
    introFr:
      'Achetez du thé noir en vrac en ligne au Canada — Assam, Ceylan, Earl Grey, English Breakfast et chai masala, mélangés et emballés dans notre café de thé à Vancouver. Corsé et malté, le thé noir est la tasse classique du matin et se marie bien avec du lait.',
  },
  green: {
    label: 'Green Tea',
    labelFr: 'Thé vert',
    intro:
      'Buy loose leaf green tea in Canada — Japanese sencha and genmaicha, Chinese jasmine and Dragon Well, and fresh flavoured green tea blends. Rich in antioxidants and lighter in caffeine than coffee, green tea brews sweet and smooth at 75–80°C.',
    introFr:
      'Achetez du thé vert en vrac au Canada — sencha et genmaicha japonais, jasmin et Dragon Well chinois, et mélanges de thé vert aromatisés. Riche en antioxydants et moins caféiné que le café, le thé vert infuse doux à 75–80 °C.',
  },
  white: {
    label: 'White Tea',
    labelFr: 'Thé blanc',
    intro:
      'Discover loose leaf white tea — delicate silver needle and white peony buds with a soft, honeyed finish. The least processed of all teas, white tea is naturally light, low in caffeine and shipped fresh across Canada from Vancouver.',
    introFr:
      'Découvrez le thé blanc en vrac — délicats bourgeons Silver Needle et Pivoine blanche à la finale douce et mielleuse. Le moins transformé de tous les thés, naturellement léger, faible en caféine et expédié frais partout au Canada depuis Vancouver.',
  },
  oolong: {
    label: 'Oolong Tea',
    labelFr: 'Thé oolong',
    intro:
      'Shop loose leaf oolong tea online — floral Tie Guan Yin, milky oolong and roasted Taiwanese oolongs. Partly oxidised between green and black tea, a good oolong can be steeped several times, making it one of the best-value teas to buy in Canada.',
    introFr:
      'Achetez du thé oolong en vrac en ligne — Tie Guan Yin floral, oolong laiteux et oolongs taïwanais torréfiés. Partiellement oxydé, entre le thé vert et le thé noir, un bon oolong peut infuser plusieurs fois.',
  },
  rooibos: {
    label: 'Rooibos Tea',
    labelFr: 'Thé rooibos',
    intro:
      'Naturally caffeine-free rooibos tea from South Africa — smooth, sweet and nutty red bush blends including vanilla, chai and fruit rooibos. The perfect evening tea for the whole family, loose leaf and shipped across Canada.',
    introFr:
      'Rooibos d’Afrique du Sud naturellement sans caféine — mélanges doux, sucrés et aux notes de noisette, dont rooibos vanille, chai et fruité. Le thé du soir idéal pour toute la famille, en vrac et expédié partout au Canada.',
  },
  herbal: {
    label: 'Herbal Tea',
    labelFr: 'Tisane',
    intro:
      'Loose leaf herbal tea blends made with real herbs, roots and spices — peppermint, ginger, turmeric, chamomile and more. Most of our herbal teas are caffeine-free, making them ideal for relaxing, digestion and sleep. Blended in Vancouver, delivered across Canada.',
    introFr:
      'Tisanes en vrac faites de vraies herbes, racines et épices — menthe poivrée, gingembre, curcuma, camomille et plus. La plupart sont sans caféine, idéales pour la détente, la digestion et le sommeil. Mélangées à Vancouver, livrées partout au Canada.',
  },
  flower: {
    label: 'Flower Tea',
    labelFr: 'Thé aux fleurs',
    intro:
      'Whole-blossom flower teas — lavender, chamomile, rose, hibiscus and colour-changing butterfly pea flower tea. Calming, aromatic and mostly caffeine-free, these floral infusions make a beautiful loose leaf tea gift.',
    introFr:
      'Thés aux fleurs entières — lavande, camomille, rose, hibiscus et pois bleu qui change de couleur. Apaisantes, parfumées et presque toutes sans caféine, ces infusions florales font un magnifique cadeau de thé en vrac.',
  },
  fruit: {
    label: 'Fruit Tea',
    labelFr: 'Thé aux fruits',
    intro:
      'Fruit tea blends packed with real dried fruit and berries — naturally sweet, vivid and caffeine-free. Enjoy them hot, or brew strong for the best iced tea at home. Loose leaf fruit tea from our Vancouver tea shop, shipped across Canada.',
    introFr:
      'Mélanges de thé aux fruits remplis de vrais fruits séchés et de baies — naturellement sucrés, éclatants et sans caféine. À savourer chauds ou infusés fort pour le meilleur thé glacé maison. Thé aux fruits en vrac de notre boutique de Vancouver.',
  },
  powder: {
    label: 'Tea Powders',
    labelFr: 'Thés en poudre',
    intro:
      'Buy matcha powder and hojicha powder in Canada — stone-ground Japanese green tea for lattes, baking and traditional whisked tea. Vibrant ceremonial matcha and toasty, low-caffeine roasted hojicha, fresh from our Vancouver tea café.',
    introFr:
      'Achetez de la poudre de matcha et de hojicha au Canada — thé vert japonais moulu à la pierre pour lattes, pâtisserie et thé fouetté traditionnel. Matcha de cérémonie éclatant et hojicha torréfié, doux et peu caféiné, de notre café de thé à Vancouver.',
  },
};

/** Minimal tea shape both the Firestore doc and the client Product satisfy. */
export interface CollectionTea {
  name?: string;
  category?: string;
  caffeine?: string;
  isOrganic?: boolean;
  ratingCount?: number;
  origin?: string;
  /** Admin → Products "Serving suggestions" (e.g. Milk Tea, Tea Latte). */
  servingSuggestions?: ReadonlyArray<{ label?: string; enabled?: boolean } | string>;
}

export interface CollectionDef {
  slug: string;
  title: string;
  titleFr: string;
  /** Meta description / intro paragraph (keyword-rich, ~150–250 chars). */
  description: string;
  descriptionFr: string;
  match: (tea: CollectionTea) => boolean;
}

const JAPANESE_RE =
  /\b(matcha|sencha|genmaicha|hojicha|houjicha|gyokuro|bancha|kukicha|japan(ese)?)\b/i;
const ICED_RE =
  /\b(iced|hibiscus|peach|mango|berry|berries|strawberry|raspberry|lemon|passion|tropical)\b/i;

const caff = (t: CollectionTea) => (t.caffeine ?? '').toLowerCase();

/** True when the tea has an enabled serving suggestion matching `re`. */
export function servedAs(t: CollectionTea, re: RegExp): boolean {
  return (t.servingSuggestions ?? []).some((sg) =>
    typeof sg === 'string' ? re.test(sg) : sg.enabled !== false && re.test(sg.label ?? ''),
  );
}

export const SEO_COLLECTIONS: readonly CollectionDef[] = [
  {
    slug: 'caffeine-free',
    title: 'Caffeine-Free Tea',
    titleFr: 'Thé sans caféine',
    description:
      'Shop caffeine-free tea in Canada — rooibos, herbal, fruit and flower infusions for evenings, kids and anyone cutting back on caffeine. Loose leaf, blended in Vancouver.',
    descriptionFr:
      'Achetez du thé sans caféine au Canada — rooibos, tisanes, infusions de fruits et de fleurs pour le soir, les enfants et quiconque réduit la caféine. En vrac, mélangé à Vancouver.',
    match: (t) => caff(t) === 'none' || ['rooibos', 'fruit'].includes(t.category ?? ''),
  },
  {
    slug: 'organic',
    title: 'Organic Tea',
    titleFr: 'Thé biologique',
    description:
      'Certified organic loose leaf tea online in Canada — organic green, black, herbal and rooibos teas, hand-selected for purity and flavour at Ele Café Vancouver.',
    descriptionFr:
      'Thé en vrac certifié biologique en ligne au Canada — thés verts, noirs, tisanes et rooibos biologiques, choisis pour leur pureté et leur saveur chez Ele Café Vancouver.',
    match: (t) => t.isOrganic === true,
  },
  {
    slug: 'high-caffeine',
    title: 'High-Caffeine Tea',
    titleFr: 'Thé riche en caféine',
    description:
      'Bold, high-caffeine loose leaf teas for morning energy — strong black teas and breakfast blends, a smooth alternative to coffee. Shipped across Canada from Vancouver.',
    descriptionFr:
      'Thés en vrac corsés et riches en caféine pour l’énergie du matin — thés noirs forts et mélanges déjeuner, une alternative douce au café. Expédiés partout au Canada.',
    match: (t) => caff(t) === 'high' || (t.category === 'black' && !t.caffeine),
  },
  {
    slug: 'best-sellers',
    title: 'Best-Selling Tea',
    titleFr: 'Thés les plus vendus',
    description:
      'Our best-selling loose leaf teas — the most-loved, top-rated blends from Ele Café, Vancouver’s tea café, chosen by customers across Canada.',
    descriptionFr:
      'Nos thés en vrac les plus vendus — les mélanges les mieux notés d’Ele Café, le café de thé de Vancouver, choisis par des clients de partout au Canada.',
    match: (t) => typeof t.ratingCount === 'number' && t.ratingCount >= 5,
  },
  {
    slug: 'matcha-powder',
    title: 'Ceremonial Matcha & Hojicha Powder',
    titleFr: 'Poudre de matcha de cérémonie et de hojicha',
    description:
      'Buy ceremonial matcha powder and hojicha powder in Canada — stone-ground Japanese tea for matcha lattes, hojicha lattes, baking and whisked tea. From Ele Café in Vancouver.',
    descriptionFr:
      'Achetez de la poudre de matcha de cérémonie et de hojicha au Canada — thé japonais moulu à la pierre pour lattes au matcha, lattes au hojicha, pâtisserie et thé fouetté. D’Ele Café à Vancouver.',
    match: (t) => t.category === 'powder' || /\b(matcha|hojicha|houjicha)\b/i.test(t.name ?? ''),
  },
  {
    slug: 'japanese-tea',
    title: 'Japanese Tea',
    titleFr: 'Thé japonais',
    description:
      'Japanese green tea online in Canada — sencha, genmaicha, hojicha and matcha. Fresh, grassy and umami-rich loose leaf Japanese tea from our Vancouver tea shop.',
    descriptionFr:
      'Thé vert japonais en ligne au Canada — sencha, genmaicha, hojicha et matcha. Thé japonais en vrac frais, herbacé et riche en umami de notre boutique de Vancouver.',
    match: (t) => /japan/i.test(t.origin ?? '') || JAPANESE_RE.test(t.name ?? ''),
  },
  {
    slug: 'iced-tea',
    title: 'Iced Tea Blends',
    titleFr: 'Thés glacés',
    description:
      'The best loose leaf teas for iced tea — fruit, hibiscus and berry blends that brew vivid and naturally sweet over ice. Make café-style iced tea at home, shipped across Canada.',
    descriptionFr:
      'Les meilleurs thés en vrac pour le thé glacé — mélanges de fruits, d’hibiscus et de baies, éclatants et naturellement sucrés sur glace. Du thé glacé comme au café, à la maison.',
    match: (t) => t.category === 'fruit' || ICED_RE.test(t.name ?? ''),
  },
  {
    slug: 'tea-latte',
    title: 'Teas for Lattes',
    titleFr: 'Thés pour lattes',
    description:
      'The best loose leaf teas for a tea latte — Earl Grey for a London Fog, chai, rooibos and more, brewed strong and topped with steamed milk. Make café-style tea lattes at home.',
    descriptionFr:
      'Les meilleurs thés en vrac pour un latte au thé — Earl Grey pour un London Fog, chai, rooibos et plus, infusés fort et garnis de lait chaud. Des lattes au thé comme au café, à la maison.',
    match: (t) => t.category === 'powder' || servedAs(t, /\blatte\b/i),
  },
  {
    slug: 'milk-tea',
    title: 'Teas for Milk Tea',
    titleFr: 'Thés pour thé au lait',
    description:
      'Loose leaf teas that make rich, creamy milk tea at home — bold black teas, chai and rooibos that stand up to milk, hot or iced. Shipped across Canada from Vancouver.',
    descriptionFr:
      'Des thés en vrac pour un thé au lait riche et crémeux à la maison — thés noirs corsés, chai et rooibos qui tiennent tête au lait, chauds ou glacés. Expédiés partout au Canada.',
    match: (t) => servedAs(t, /\bmilk\s*tea\b/i),
  },
  {
    slug: 'chai-tea',
    title: 'Chai Tea',
    titleFr: 'Thé chai',
    description:
      'Loose leaf chai tea in Canada — spiced masala chai with real cinnamon, cardamom, ginger and clove. Brew it strong for the perfect homemade chai latte.',
    descriptionFr:
      'Thé chai en vrac au Canada — chai masala épicé à la vraie cannelle, cardamome, gingembre et clou de girofle. Infusez-le fort pour un chai latte maison parfait.',
    match: (t) => /\bchai\b/i.test(t.name ?? ''),
  },
];

export const SEO_COLLECTION_BY_SLUG: Readonly<Record<string, CollectionDef>> = Object.fromEntries(
  SEO_COLLECTIONS.map((c) => [c.slug, c]),
);

// ── Tea page <title> / meta description (shared by TeaProfilePage and
//    renderSeo so the page and Google's copy always match) ─────────────────

/** "Assam — Loose Leaf Black Tea | Ele Café Vancouver" (matches how people search). */
export function teaSeoTitle(name: string, category: string, lang: 'en' | 'fr' = 'en'): string {
  if (lang === 'fr') {
    if (category === 'powder') return `${name} | Thé japonais en poudre | Ele Café Vancouver`;
    const labelFr = (CATEGORY_SEO[category]?.labelFr ?? 'Thé').toLowerCase();
    return `${name} — ${labelFr.charAt(0).toUpperCase()}${labelFr.slice(1)} en vrac | Ele Café Vancouver`;
  }
  if (category === 'powder') return `${name} | Japanese Tea Powder | Ele Café Vancouver`;
  const label = CATEGORY_SEO[category]?.label ?? 'Tea';
  return `${name} — Loose Leaf ${label} | Ele Café Vancouver`;
}

/** First sentence of the description + price/weight + pickup/shipping, ≤158 chars. */
export function teaMetaDescription(
  t: {
    name: string;
    description?: string;
    price?: number;
    weight?: string;
    category: string;
  },
  lang: 'en' | 'fr' = 'en',
): string {
  if (lang === 'fr') return teaMetaDescriptionFr(t);
  const label = (CATEGORY_SEO[t.category]?.label ?? 'tea').toLowerCase();
  const s = (t.description ?? '').replace(/\s+/g, ' ').trim();
  let lead =
    (s.match(/^.+?[.!?](\s|$)/)?.[0] ?? s).trim() ||
    `${t.name}, premium loose leaf ${label} from Ele Café in Vancouver.`;
  if (lead.length > 95) lead = `${lead.slice(0, 94).replace(/\s+\S*$/, '')}…`;
  const price =
    typeof t.price === 'number' && t.price > 0
      ? `$${Number.isInteger(t.price) ? t.price : t.price.toFixed(2)}${t.weight ? ` / ${t.weight.replace(/\s*g$/i, ' g')}` : ''}. `
      : '';
  const tail = `${price}Free pickup in Vancouver or shipped across Canada.`;
  const out = `${lead} ${tail}`;
  return out.length <= 158 ? out : `${out.slice(0, 157).replace(/\s+\S*$/, '')}…`;
}

function teaMetaDescriptionFr(t: {
  name: string;
  description?: string;
  price?: number;
  weight?: string;
  category: string;
}): string {
  const label = (CATEGORY_SEO[t.category]?.labelFr ?? 'thé').toLowerCase();
  const s = (t.description ?? '').replace(/\s+/g, ' ').trim();
  let lead =
    (s.match(/^.+?[.!?](\s|$)/)?.[0] ?? s).trim() ||
    `${t.name}, ${label} en vrac haut de gamme d’Ele Café à Vancouver.`;
  if (lead.length > 95) lead = `${lead.slice(0, 94).replace(/\s+\S*$/, '')}…`;
  const price =
    typeof t.price === 'number' && t.price > 0
      ? `${Number.isInteger(t.price) ? t.price : t.price.toFixed(2).replace('.', ',')} $${t.weight ? ` / ${t.weight.replace(/\s*g$/i, ' g')}` : ''}. `
      : '';
  const out = `${lead} ${price}Cueillette gratuite à Vancouver ou livraison partout au Canada.`;
  return out.length <= 158 ? out : `${out.slice(0, 157).replace(/\s+\S*$/, '')}…`;
}
