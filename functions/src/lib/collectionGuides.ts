/**
 * collectionGuides.ts — short, practical guides for the collection pages
 * that match real search terms (see LOCAL_KEYWORDS in cafeMenu.ts).
 *
 * Shown under the tea grid on /collections/{slug} and in renderSeo's
 * server-rendered version (plus FAQPage JSON-LD). Keep it factual: brewing
 * numbers, what the style is, how the café serves it. No health claims.
 * Collections without an entry (organic, high-caffeine, best-sellers)
 * simply show no guide.
 */
import type { FaqItem } from './storeContent';

export interface GuideSection {
  h: string;
  p: string;
}
export interface CollectionGuide {
  sections: GuideSection[];
  sectionsFr: GuideSection[];
  faq: FaqItem[];
  faqFr: FaqItem[];
}

export const COLLECTION_GUIDES: Record<string, CollectionGuide> = {
  'matcha-powder': {
    sections: [
      {
        h: 'Matcha vs hojicha',
        p: 'Both are Japanese green teas ground to a fine powder, so you drink the whole leaf. Matcha is made from shade-grown leaves and tastes vivid, grassy and sweet with a creamy umami finish. Hojicha is roasted before grinding, which turns it a warm brown and gives it a toasty, caramel-like flavour with noticeably less caffeine, a good choice for afternoons and evenings.',
      },
      {
        h: 'How to prepare it at home',
        p: 'For a straight cup, sift 1–2 g (about ½–1 teaspoon) into a bowl, add 60–70 ml of water at 70–80°C (never boiling, which turns matcha bitter) and whisk briskly in a zig-zag until a fine foam forms. For a latte, whisk the same amount with a splash of water into a paste, then top with 180–240 ml of steamed or cold milk. Hojicha tolerates hotter water, around 80–90°C.',
      },
      {
        h: 'Try it at our café first',
        p: 'At our Vancouver café we whisk matcha and hojicha to order: straight, as lattes, dirty (with a shot of espresso), as an affogato, or flavoured with vanilla, maple, lavender and more, or layered over strawberry, mango or peach purée. It is an easy way to find the style you like before buying a tin.',
      },
    ],
    sectionsFr: [
      {
        h: 'Matcha ou hojicha?',
        p: 'Ce sont deux thés verts japonais moulus en poudre fine : on boit donc la feuille entière. Le matcha provient de feuilles cultivées à l’ombre et offre un goût vif, herbacé et doux, avec une finale crémeuse et umami. Le hojicha est torréfié avant d’être moulu, ce qui lui donne une couleur brune et un goût grillé, proche du caramel, avec nettement moins de caféine, idéal en après-midi ou en soirée.',
      },
      {
        h: 'Le préparer à la maison',
        p: 'Pour une tasse nature, tamisez 1 à 2 g (environ ½ à 1 cuillère à thé) dans un bol, ajoutez 60 à 70 ml d’eau à 70–80 °C (jamais bouillante, ce qui rend le matcha amer) et fouettez vivement en zigzag jusqu’à obtenir une mousse fine. Pour un latte, fouettez la même quantité avec un peu d’eau pour faire une pâte, puis ajoutez 180 à 240 ml de lait chaud ou froid. Le hojicha supporte une eau plus chaude, vers 80–90 °C.',
      },
      {
        h: 'Goûtez-le d’abord au café',
        p: 'À notre café de Vancouver, nous fouettons le matcha et le hojicha à la commande : nature, en latte, en version « dirty » avec un shot d’espresso, en affogato, aromatisés à la vanille, à l’érable, à la lavande et plus, ou étagés sur une purée de fraise, de mangue ou de pêche. Une belle façon de trouver votre style avant d’acheter une boîte.',
      },
    ],
    faq: [
      {
        q: 'Is matcha the same as green tea powder?',
        a: 'Matcha is a specific type of powdered green tea made from shade-grown leaves that are stone-ground. Ordinary green tea powder is usually made from regular green tea leaves and tastes flatter and more bitter.',
      },
      {
        q: 'Does hojicha have caffeine?',
        a: 'Yes, but less than matcha. Roasting lowers the caffeine, which is why hojicha is popular later in the day.',
      },
      {
        q: 'What water temperature should I use for matcha?',
        a: 'Use water at 70–80°C. Boiling water scorches the powder and makes it bitter.',
      },
    ],
    faqFr: [
      {
        q: 'Le matcha est-il la même chose que la poudre de thé vert?',
        a: 'Le matcha est un thé vert en poudre précis, fait de feuilles cultivées à l’ombre et moulues à la pierre. La poudre de thé vert ordinaire provient de feuilles courantes et a un goût plus plat et plus amer.',
      },
      {
        q: 'Le hojicha contient-il de la caféine?',
        a: 'Oui, mais moins que le matcha. La torréfaction réduit la caféine, d’où sa popularité en fin de journée.',
      },
      {
        q: 'À quelle température préparer le matcha?',
        a: 'Utilisez une eau à 70–80 °C. L’eau bouillante brûle la poudre et la rend amère.',
      },
    ],
  },

  'caffeine-free': {
    sections: [
      {
        h: 'Naturally caffeine-free teas',
        p: 'Herbal teas (tisanes) such as chamomile, peppermint and lavender, fruit blends made from dried fruit and hibiscus, and South African rooibos contain no tea leaves, so they are naturally free of caffeine. That makes them a comfortable choice in the evening, for anyone avoiding caffeine, and for kids’ iced teas.',
      },
      {
        h: 'Caffeine-free vs decaf',
        p: 'Decaffeinated tea is real tea with most of the caffeine removed, so a small amount remains. If you want none at all, choose a herbal, fruit or rooibos tea rather than a decaf black or green tea.',
      },
      {
        h: 'How to brew them',
        p: 'Use about 1 teaspoon (2–3 g) per 250 ml cup and freshly boiled water. Because there are no tea leaves to turn bitter, you can steep longer, 5 to 7 minutes, for a fuller flavour. Rooibos and fruit blends also make excellent iced tea and take milk well as a latte.',
      },
    ],
    sectionsFr: [
      {
        h: 'Des thés naturellement sans caféine',
        p: 'Les tisanes comme la camomille, la menthe poivrée et la lavande, les mélanges de fruits séchés et d’hibiscus, et le rooibos d’Afrique du Sud ne contiennent aucune feuille de thé : ils sont donc naturellement sans caféine. Un choix agréable le soir, pour qui évite la caféine, et pour les thés glacés des enfants.',
      },
      {
        h: 'Sans caféine ou décaféiné?',
        p: 'Le thé décaféiné est un vrai thé dont on a retiré la majeure partie de la caféine : il en reste donc un peu. Pour n’en avoir aucune, choisissez une tisane, un mélange de fruits ou un rooibos plutôt qu’un thé noir ou vert décaféiné.',
      },
      {
        h: 'Comment les infuser',
        p: 'Comptez environ 1 cuillère à thé (2 à 3 g) par tasse de 250 ml et une eau fraîchement bouillie. Comme il n’y a pas de feuilles de thé qui deviennent amères, vous pouvez infuser plus longtemps, de 5 à 7 minutes, pour plus de saveur. Le rooibos et les mélanges de fruits font aussi d’excellents thés glacés et se marient bien au lait en latte.',
      },
    ],
    faq: [
      {
        q: 'Is rooibos caffeine-free?',
        a: 'Yes. Rooibos comes from a South African shrub, not the tea plant, so it is naturally caffeine-free.',
      },
      {
        q: 'Is decaf tea the same as caffeine-free tea?',
        a: 'No. Decaf tea still contains a small amount of caffeine. Herbal, fruit and rooibos teas contain none.',
      },
      {
        q: 'Can I drink caffeine-free tea iced?',
        a: 'Yes. Brew it double strength and pour it over ice, or cold-brew it in the fridge overnight.',
      },
    ],
    faqFr: [
      {
        q: 'Le rooibos est-il sans caféine?',
        a: 'Oui. Le rooibos provient d’un arbuste sud-africain, pas du théier : il est donc naturellement sans caféine.',
      },
      {
        q: 'Le thé décaféiné est-il sans caféine?',
        a: 'Non. Le thé décaféiné contient encore un peu de caféine. Les tisanes, les mélanges de fruits et le rooibos n’en contiennent pas.',
      },
      {
        q: 'Peut-on boire ces thés glacés?',
        a: 'Oui. Infusez-les deux fois plus fort et versez sur de la glace, ou faites-les infuser à froid au réfrigérateur toute une nuit.',
      },
    ],
  },

  'chai-tea': {
    sections: [
      {
        h: 'What is chai?',
        p: 'Chai is black tea brewed with warming spices, most often cinnamon, cardamom, ginger, clove and black pepper, then sweetened and finished with milk. It is bold enough to stand up to milk and sugar, which is why it is the base of the chai latte.',
      },
      {
        h: 'How to make chai at home',
        p: 'For one mug, simmer 1 heaped teaspoon (about 3 g) of loose leaf chai in 150 ml of water for 3–4 minutes, add 150 ml of milk, bring it back just to a simmer, sweeten to taste and strain. For a quicker cup, steep it in boiling water for 4–5 minutes and top with steamed milk.',
      },
      {
        h: 'At our café',
        p: 'Order a Chai Tea Latte hot, or as an iced milk tea when it’s warm out. Coffee lovers can try a Dirty Chai Latte, which adds a shot of espresso.',
      },
    ],
    sectionsFr: [
      {
        h: 'Qu’est-ce que le chai?',
        p: 'Le chai est un thé noir infusé avec des épices réconfortantes, le plus souvent cannelle, cardamome, gingembre, clou de girofle et poivre noir, puis sucré et adouci de lait. Il est assez corsé pour supporter le lait et le sucre, d’où son rôle de base du chai latte.',
      },
      {
        h: 'Préparer le chai à la maison',
        p: 'Pour une grande tasse, faites mijoter 1 bonne cuillère à thé (environ 3 g) de chai en vrac dans 150 ml d’eau pendant 3 à 4 minutes, ajoutez 150 ml de lait, ramenez juste à frémissement, sucrez au goût et filtrez. Pour aller plus vite, infusez-le 4 à 5 minutes dans l’eau bouillante et ajoutez du lait chaud.',
      },
      {
        h: 'À notre café',
        p: 'Commandez un Chai latte chaud, ou en thé au lait glacé par temps chaud. Les amateurs de café essaieront le Dirty chai latte, avec un shot d’espresso.',
      },
    ],
    faq: [
      {
        q: 'Does chai tea have caffeine?',
        a: 'Traditional chai is made with black tea, so it does contain caffeine, generally less than a cup of coffee.',
      },
      { q: 'What is a dirty chai?', a: 'A chai latte with a shot of espresso added.' },
      {
        q: 'Can chai be made with plant milk?',
        a: 'Yes. Oat milk is especially good with chai spices. At the café, oat, soy, almond and coconut milk are available.',
      },
    ],
    faqFr: [
      {
        q: 'Le chai contient-il de la caféine?',
        a: 'Le chai traditionnel est fait de thé noir : il contient donc de la caféine, généralement moins qu’un café.',
      },
      { q: 'Qu’est-ce qu’un dirty chai?', a: 'Un chai latte auquel on ajoute un shot d’espresso.' },
      {
        q: 'Peut-on faire le chai avec un lait végétal?',
        a: 'Oui. Le lait d’avoine se marie particulièrement bien aux épices. Au café, nous offrons les laits d’avoine, de soya, d’amande et de coco.',
      },
    ],
  },

  'milk-tea': {
    sections: [
      {
        h: 'Which teas make good milk tea?',
        p: 'Milk tea needs a tea strong enough not to disappear under milk. Malty black teas like Assam and breakfast blends are the classic choice, Earl Grey adds bergamot, and chai brings spice. For a caffeine-free version, rooibos works beautifully with milk.',
      },
      {
        h: 'How to make it at home',
        p: 'Use twice your usual amount of tea, about 2 teaspoons (5 g) per 250 ml, and steep in boiling water for 4–5 minutes so it’s concentrated. Add milk to taste and sweeten if you like. For iced milk tea, let the strong tea cool, pour it over plenty of ice, then top with cold milk.',
      },
      {
        h: 'At our café',
        p: 'We serve Iced Milk Tea made with real loose leaf tea, and our favourites, London Fog, Rose, Shanghai Lychee Jasmine, Chai and Rooibos, can all be ordered as an iced milk tea.',
      },
    ],
    sectionsFr: [
      {
        h: 'Quels thés pour un thé au lait?',
        p: 'Le thé au lait demande un thé assez corsé pour ne pas disparaître sous le lait. Les thés noirs maltés comme l’Assam et les mélanges du matin sont le choix classique, l’Earl Grey ajoute la bergamote et le chai, les épices. Pour une version sans caféine, le rooibos se marie à merveille au lait.',
      },
      {
        h: 'Le préparer à la maison',
        p: 'Utilisez deux fois plus de thé que d’habitude, environ 2 cuillères à thé (5 g) par 250 ml, et infusez 4 à 5 minutes dans l’eau bouillante pour obtenir un thé concentré. Ajoutez du lait au goût et sucrez si vous le souhaitez. Pour un thé au lait glacé, laissez refroidir le thé, versez-le sur beaucoup de glace, puis ajoutez du lait froid.',
      },
      {
        h: 'À notre café',
        p: 'Nous servons un thé au lait glacé préparé avec du vrai thé en vrac, et nos favoris (London Fog, rose, litchi jasmin de Shanghai, chai et rooibos) se commandent tous en thé au lait glacé.',
      },
    ],
    faq: [
      {
        q: 'Why does my milk tea taste weak?',
        a: 'The tea wasn’t strong enough. Use about twice the usual amount of leaves and steep a little longer before adding milk.',
      },
      {
        q: 'Can I make milk tea without caffeine?',
        a: 'Yes. Rooibos is naturally caffeine-free and pairs very well with milk.',
      },
      {
        q: 'Should milk go in first or last?',
        a: 'With loose leaf tea, brew the tea first, then add milk, so the leaves can steep properly in hot water.',
      },
    ],
    faqFr: [
      {
        q: 'Pourquoi mon thé au lait goûte-t-il faible?',
        a: 'Le thé n’était pas assez fort. Utilisez environ deux fois plus de feuilles et infusez un peu plus longtemps avant d’ajouter le lait.',
      },
      {
        q: 'Peut-on faire un thé au lait sans caféine?',
        a: 'Oui. Le rooibos est naturellement sans caféine et se marie très bien au lait.',
      },
      {
        q: 'Le lait en premier ou en dernier?',
        a: 'Avec un thé en vrac, infusez d’abord le thé, puis ajoutez le lait, pour que les feuilles infusent bien dans l’eau chaude.',
      },
    ],
  },

  'tea-latte': {
    sections: [
      {
        h: 'What is a tea latte?',
        p: 'A tea latte is strongly brewed tea topped with steamed, frothed milk, the tea version of a café latte. The best-known is the London Fog: Earl Grey with vanilla and steamed milk, a Vancouver classic.',
      },
      {
        h: 'How to make one at home',
        p: 'Brew a concentrate: 2 teaspoons (about 5 g) of tea in 120 ml of water just off the boil for 4–5 minutes, then strain. Heat and froth 180 ml of milk (a milk frother or a jar shaken hard, then microwaved, both work), pour it over the tea and sweeten to taste. For a London Fog, add a little vanilla syrup.',
      },
      {
        h: 'At our café',
        p: 'Tea lattes are served hot. Try our favourites, London Fog, Rose Tea Latte, Shanghai Lychee Jasmine, Chai and Rooibos, or ask for any tea on our shelves as a latte. Want it cold? Order it as an iced milk tea.',
      },
    ],
    sectionsFr: [
      {
        h: 'Qu’est-ce qu’un latte au thé?',
        p: 'Un latte au thé est un thé infusé fort garni de lait chaud moussé, la version thé du café latte. Le plus connu est le London Fog : Earl Grey, vanille et lait chaud, un classique de Vancouver.',
      },
      {
        h: 'Le préparer à la maison',
        p: 'Préparez un concentré : 2 cuillères à thé (environ 5 g) de thé dans 120 ml d’eau juste bouillie, 4 à 5 minutes, puis filtrez. Faites chauffer et mousser 180 ml de lait (un mousseur ou un bocal bien secoué puis passé au micro-ondes), versez-le sur le thé et sucrez au goût. Pour un London Fog, ajoutez un peu de sirop de vanille.',
      },
      {
        h: 'À notre café',
        p: 'Les lattes au thé sont servis chauds. Essayez nos favoris (London Fog, latte à la rose, litchi jasmin de Shanghai, chai et rooibos) ou demandez n’importe quel thé de nos étagères en latte. Envie de froid? Commandez-le en thé au lait glacé.',
      },
    ],
    faq: [
      {
        q: 'What tea is in a London Fog?',
        a: 'Earl Grey, a black tea flavoured with bergamot, with vanilla and steamed milk.',
      },
      {
        q: 'Is a tea latte the same as milk tea?',
        a: 'They’re close. A tea latte uses steamed, frothed milk and is served hot. Milk tea is strong tea with milk added, and at our café it’s served iced.',
      },
      {
        q: 'Which teas work best as lattes?',
        a: 'Bold or aromatic teas: Earl Grey, chai, Assam, rooibos and floral blends like rose or jasmine.',
      },
    ],
    faqFr: [
      {
        q: 'Quel thé contient le London Fog?',
        a: 'De l’Earl Grey, un thé noir parfumé à la bergamote, avec de la vanille et du lait chaud.',
      },
      {
        q: 'Le latte au thé et le thé au lait, c’est pareil?',
        a: 'Presque. Le latte au thé utilise du lait chaud moussé et se sert chaud. Le thé au lait est un thé fort additionné de lait, servi glacé à notre café.',
      },
      {
        q: 'Quels thés font les meilleurs lattes?',
        a: 'Les thés corsés ou aromatiques : Earl Grey, chai, Assam, rooibos et mélanges floraux comme la rose ou le jasmin.',
      },
    ],
  },

  'japanese-tea': {
    sections: [
      {
        h: 'The main Japanese teas',
        p: 'Sencha is the everyday Japanese green tea: steamed rather than pan-fired, which keeps it bright, grassy and sweet. Genmaicha blends green tea with roasted rice for a nutty, comforting cup. Hojicha is roasted green tea with a toasty flavour and less caffeine, and matcha is shade-grown tea stone-ground into a powder.',
      },
      {
        h: 'How to brew Japanese green tea',
        p: 'Japanese green teas like cooler water: about 70–80°C, which you can reach by letting boiled water rest for 2–3 minutes. Use 1 teaspoon (2–3 g) per 250 ml and steep only 1–2 minutes; longer makes it bitter. Good leaves can be re-steeped two or three times.',
      },
      {
        h: 'Try them at our café',
        p: 'Our Vancouver café serves ceremonial matcha and hojicha lattes whisked to order, and any loose leaf tea on our shelves can be brewed for you to try before you buy.',
      },
    ],
    sectionsFr: [
      {
        h: 'Les principaux thés japonais',
        p: 'Le sencha est le thé vert japonais du quotidien : étuvé plutôt que torréfié à la poêle, il reste vif, herbacé et doux. Le genmaicha mélange thé vert et riz grillé pour une tasse réconfortante aux notes de noisette. Le hojicha est un thé vert torréfié, au goût grillé et moins caféiné, et le matcha est un thé cultivé à l’ombre puis moulu à la pierre.',
      },
      {
        h: 'Infuser un thé vert japonais',
        p: 'Les thés verts japonais aiment une eau plus fraîche : environ 70–80 °C, obtenue en laissant reposer l’eau bouillie 2 à 3 minutes. Comptez 1 cuillère à thé (2 à 3 g) par 250 ml et n’infusez que 1 à 2 minutes : plus longtemps, il devient amer. De bonnes feuilles se réinfusent deux ou trois fois.',
      },
      {
        h: 'Goûtez-les à notre café',
        p: 'Notre café de Vancouver sert des lattes au matcha et au hojicha de cérémonie fouettés à la commande, et tous nos thés en vrac peuvent être infusés pour que vous les goûtiez avant d’acheter.',
      },
    ],
    faq: [
      {
        q: 'Why is my green tea bitter?',
        a: 'The water was too hot or it steeped too long. Use 70–80°C water and steep for 1–2 minutes.',
      },
      {
        q: 'What is genmaicha?',
        a: 'Green tea blended with roasted brown rice, sometimes called “popcorn tea” for its toasty, nutty flavour.',
      },
      {
        q: 'Which Japanese tea has the least caffeine?',
        a: 'Hojicha and genmaicha are generally lower in caffeine than sencha or matcha.',
      },
    ],
    faqFr: [
      {
        q: 'Pourquoi mon thé vert est-il amer?',
        a: 'L’eau était trop chaude ou l’infusion trop longue. Utilisez une eau à 70–80 °C et infusez 1 à 2 minutes.',
      },
      {
        q: 'Qu’est-ce que le genmaicha?',
        a: 'Un thé vert mélangé à du riz brun grillé, parfois surnommé « thé popcorn » pour son goût grillé de noisette.',
      },
      {
        q: 'Quel thé japonais contient le moins de caféine?',
        a: 'Le hojicha et le genmaicha contiennent généralement moins de caféine que le sencha ou le matcha.',
      },
    ],
  },

  'iced-tea': {
    sections: [
      {
        h: 'Which teas make the best iced tea?',
        p: 'Fruit and hibiscus blends give bright, naturally colourful iced tea without any caffeine. Rooibos and herbal teas are smooth and forgiving, and green and black teas make a classic, refreshing iced tea, especially fruit-flavoured blends like peach or mango.',
      },
      {
        h: 'Two ways to make it at home',
        p: 'Cold brew: add about 10 g of tea (roughly 4 teaspoons) to 1 litre of cold water and leave it in the fridge for 8–12 hours, then strain. It’s smooth and never bitter. Hot brew over ice: steep a double-strength cup (2 teaspoons per 250 ml) for the normal time, then pour it straight over a glass full of ice.',
      },
      {
        h: 'At our café',
        p: 'We brew iced tea fresh from our loose leaf fruit, herbal, green and black teas, and we also serve iced milk tea and iced matcha and hojicha lattes.',
      },
    ],
    sectionsFr: [
      {
        h: 'Quels thés pour un bon thé glacé?',
        p: 'Les mélanges de fruits et d’hibiscus donnent un thé glacé éclatant et coloré, sans caféine. Le rooibos et les tisanes sont doux et faciles à réussir, et les thés verts et noirs font un thé glacé classique et rafraîchissant, surtout les mélanges fruités comme la pêche ou la mangue.',
      },
      {
        h: 'Deux façons de le préparer',
        p: 'Infusion à froid : mettez environ 10 g de thé (à peu près 4 cuillères à thé) dans 1 litre d’eau froide et laissez 8 à 12 heures au réfrigérateur, puis filtrez. Il est doux et jamais amer. Infusion chaude sur glace : infusez une tasse deux fois plus forte (2 cuillères à thé par 250 ml) le temps habituel, puis versez-la directement sur un verre rempli de glace.',
      },
      {
        h: 'À notre café',
        p: 'Nous infusons le thé glacé à partir de nos thés en vrac aux fruits, tisanes, thés verts et noirs, et servons aussi du thé au lait glacé et des lattes glacés au matcha et au hojicha.',
      },
    ],
    faq: [
      {
        q: 'How long should I cold brew tea?',
        a: '8–12 hours in the fridge, with about 10 g of tea per litre of water.',
      },
      {
        q: 'Why does my iced tea go cloudy?',
        a: 'Hot-brewed black tea can cloud as it cools quickly. Cold brewing avoids it, and it doesn’t affect the taste.',
      },
      {
        q: 'Is there caffeine-free iced tea?',
        a: 'Yes. Fruit, hibiscus, herbal and rooibos teas are naturally caffeine-free and make great iced tea.',
      },
    ],
    faqFr: [
      {
        q: 'Combien de temps infuser à froid?',
        a: '8 à 12 heures au réfrigérateur, avec environ 10 g de thé par litre d’eau.',
      },
      {
        q: 'Pourquoi mon thé glacé devient-il trouble?',
        a: 'Le thé noir infusé chaud peut se troubler en refroidissant vite. L’infusion à froid l’évite, et cela n’affecte pas le goût.',
      },
      {
        q: 'Existe-t-il un thé glacé sans caféine?',
        a: 'Oui. Les thés aux fruits, à l’hibiscus, les tisanes et le rooibos sont naturellement sans caféine et font d’excellents thés glacés.',
      },
    ],
  },
};
