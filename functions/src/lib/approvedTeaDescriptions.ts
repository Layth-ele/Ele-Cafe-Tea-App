/**
 * approvedTeaDescriptions.ts — the 75 longer tea descriptions the owner
 * approved (Sept 2026). Applied once by the admin-only applyApprovedTeaDescriptions
 * callable (contentUpdates.ts); `current` is the text the draft was made from, so
 * a description edited since then is left alone. Safe to delete once applied.
 */
export const APPROVED_TEA_DESCRIPTIONS: Record<string, { current: string; proposed: string }> = {
  assam: {
    current:
      'Full bodied, lovely balanced astringency with jammy hints of malt and toast. A good stout Assam.',
    proposed:
      'Full bodied, lovely balanced astringency with jammy hints of malt and toast. A good stout Assam.\n\nSourced from Assam, India. Certified organic.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Its caffeine makes it a good way to start the day.',
  },
  'black-currant': {
    current:
      'Deep black currant aroma and flavor. Just imagine a currant bush full of berries. Stunning as an iced tea.',
    proposed:
      'Deep black currant aroma and flavor. Just imagine a currant bush full of berries. Stunning as an iced tea.\n\nIt is blended from black tea, currants and blackberry leaves, with mallow, cornflower petals, marigold petals and sunflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
  },
  'ceylon-orange-pekoe': {
    current:
      'Full-bodied with a lovely, balanced astringency, offering bright, malty notes and a hint of citrus zest, a smooth and vibrant tea.',
    proposed:
      'Full-bodied with a lovely, balanced astringency, offering bright, malty notes and a hint of citrus zest, a smooth and vibrant tea.\n\nThis black tea comes from Ceylon, Sri Lanka.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'chocolate-mint': {
    current:
      'Fresh lovely mint combined with full flavored chocolate tea that is wonderfully reminiscent of an after-dinner mint. How decadent!',
    proposed:
      'Fresh lovely mint combined with full flavored chocolate tea that is wonderfully reminiscent of an after-dinner mint. How decadent!\n\nIn the blend: black tea, blackberry leaves and peppermint leaves.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Its caffeine makes it a good way to start the day.',
  },
  'cinnamon-scream': {
    current: 'Mildly spicy with red heart cinnamon flavor. A refreshing and tongue-tickling tea.',
    proposed:
      'Mildly spicy with red heart cinnamon flavor. A refreshing and tongue-tickling tea.\n\nIn the blend: black tea and cinnamon.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'earl-grey-classic': {
    current:
      "An unbelievable aroma that portends an unbelievable taste. We have been told repeatedly: 'This is the best Earl Grey I have ever tasted!'",
    proposed:
      "An unbelievable aroma that portends an unbelievable taste. We have been told repeatedly: 'This is the best Earl Grey I have ever tasted!'.\n\nThe blend brings together black tea, with cornflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.",
  },
  'earl-grey-cream': {
    current:
      'A must for the avid Earl Grey tea drinker! Our flavoury Earl Grey mellowed with a delicious creamy taste. An excellent all day tea with a superb finish.',
    proposed:
      'A must for the avid Earl Grey tea drinker! Our flavoury Earl Grey mellowed with a delicious creamy taste. An excellent all day tea with a superb finish.\n\nIt is blended from black tea, with cornflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'earl-grey-decaf': {
    current:
      'A full flavory cup of tea tending bright with excellent Earl Grey notes from natural bergamot flavoring.',
    proposed:
      'A full flavory cup of tea tending bright with excellent Earl Grey notes from natural bergamot flavoring.\n\nIt is blended from decaffeinated black tea, with cornflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Decaffeinated, so you can enjoy it any time, even in the evening.',
  },
  'earl-grey-royal': {
    current:
      'A sophisticated blend combining classic Earl Grey with delicate jasmine buds and creamy undertones, offering a smooth, fragrant cup with floral and citrus notes.',
    proposed:
      'A sophisticated blend combining classic Earl Grey with delicate jasmine buds and creamy undertones, offering a smooth, fragrant cup with floral and citrus notes.\n\nIn the blend: black tea and jasmine buds, with cornflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
  },
  'english-breakfast': {
    current:
      'A perfect breakfast tea with good body and full tea flavour notes. Coppery bright, especially enticing with milk.',
    proposed:
      'A perfect breakfast tea with good body and full tea flavour notes. Coppery bright, especially enticing with milk.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'ginger-black-tea': {
    current:
      'Memories of fresh ginger root; piquant, spicy and fruit hot. A refreshing and clean taste to the palate.',
    proposed:
      'Memories of fresh ginger root; piquant, spicy and fruit hot. A refreshing and clean taste to the palate.\n\nIt is blended from black tea and ginger, with calendula petals, marigold petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. Its caffeine makes it a good way to start the day.',
  },
  gingerbread: {
    current: 'Lusciously ginger and sweet cinnamon cookie flavor.',
    proposed:
      'Lusciously ginger and sweet cinnamon cookie flavor.\n\nThe blend brings together black tea, cinnamon, star anise, cocoa beans, ginger and chamomile flowers, with safflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'himalayan-chai': {
    current:
      'Aromatic and warming with a rich blend of spices and a smooth, full-bodied tea base, delivering a comforting, spiced kick.',
    proposed:
      'Aromatic and warming with a rich blend of spices and a smooth, full-bodied tea base, delivering a comforting, spiced kick.\n\nIt is blended from black tea, ginger, cinnamon, cardamom, clove and black pepper. This black tea comes from the Himalayas, India. Certified organic.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'irish-breakfast': {
    current:
      'A stout robust blend of February Kenya BP1 and 2nd flush Assam. Superb color and very full bodied. Excellent in the early morning or afternoon.',
    proposed:
      'A stout robust blend of February Kenya BP1 and 2nd flush Assam. Superb color and very full bodied. Excellent in the early morning or afternoon.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
  },
  'island-coconut': {
    current:
      'Smooth black tea meets creamy, nutty coconut. A vacation in a cup. Get ready to sip some paradise!',
    proposed:
      'Smooth black tea meets creamy, nutty coconut. A vacation in a cup. Get ready to sip some paradise!\n\nIn the blend: black tea and coconut pieces. Certified organic.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'keemun-panda': {
    current:
      'Lovely burgundy depth with light hints of an oak cask. A tea to serve during hectic or quiet times.',
    proposed:
      'Lovely burgundy depth with light hints of an oak cask. A tea to serve during hectic or quiet times.\n\nThis black tea comes from Anhui Province, China.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'lapsang-souchong': {
    current:
      'A superior leaf Lapsang Souchong offering a crisp character with the remarkable and heady aroma of an oak fire.',
    proposed:
      'A superior leaf Lapsang Souchong offering a crisp character with the remarkable and heady aroma of an oak fire.\n\nGrown in Fujian Province — Xingchun region, China.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'lychee-congou': {
    current:
      'A leafy black tea infused with the flavor of lychee fruit producing a delightful, naturally scented tea.',
    proposed:
      'A leafy black tea infused with the flavor of lychee fruit producing a delightful, naturally scented tea.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'mango-mist': {
    current: 'Fresh, piquant mango character with memories of happy days in the sun.',
    proposed:
      'Fresh, piquant mango character with memories of happy days in the sun.\n\nThe blend brings together black tea, mango pieces and lime leaves, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
  },
  'margarets-hope-darjeeling': {
    current:
      "A delicate, slightly astringent cup with the distinctive 'Muscatel' character. Hints of currant create an almost wine-like taste.",
    proposed:
      "A delicate, slightly astringent cup with the distinctive 'Muscatel' character. Hints of currant create an almost wine-like taste.\n\nSourced from Darjeeling, India.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.",
  },
  'monks-blend': {
    current:
      'One of our most flavorful teas. The dramatic combination of vanilla and grenadine ensures a particularly satisfying cup.',
    proposed:
      'One of our most flavorful teas. The dramatic combination of vanilla and grenadine ensures a particularly satisfying cup.\n\nIn the blend: black tea, with calendula petals, marigold petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. Its caffeine makes it a good way to start the day.',
  },
  'orange-spice': {
    current:
      'The flavory character of new season Florida oranges and fresh cinnamon is well captured in this tea. A truly tasty combination of Ceylon tea.',
    proposed:
      'The flavory character of new season Florida oranges and fresh cinnamon is well captured in this tea. A truly tasty combination of Ceylon tea.\n\nThe blend brings together black tea, orange peel, cinnamon and clove.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
  },
  'peach-apricot': {
    current:
      'Makes an absolutely tremendous iced tea! A flavory and tasty combination of mellow peaches with deep, full flavored apricots.',
    proposed:
      'Makes an absolutely tremendous iced tea! A flavory and tasty combination of mellow peaches with deep, full flavored apricots.\n\nIt is blended from black tea, papaya pieces, blackberry leaves, apricot pieces and peach pieces, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'pumpkin-spice': {
    current:
      'Notes of cinnamon and pumpkin abound. A blend of sweet spices, caramel depths, and chocolate undertones. Nothing beats a cozy cup of pumpkin spice tea.',
    proposed:
      'Notes of cinnamon and pumpkin abound. A blend of sweet spices, caramel depths, and chocolate undertones. Nothing beats a cozy cup of pumpkin spice tea.\n\nThe blend brings together black tea, apple pieces, orange peel, rosehip, hibiscus, cinnamon and pumpkin pieces, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Its caffeine makes it a good way to start the day.',
  },
  'rose-tea': {
    current:
      'Simply a lovely tea — especially for afternoons with good friends. Delicious floral notes reminiscent of a Tea Rose garden.',
    proposed:
      'Simply a lovely tea — especially for afternoons with good friends. Delicious floral notes reminiscent of a Tea Rose garden.\n\nIn the blend: black tea, rosehip pieces, rose petals and blackberry leaves.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
  },
  'vanilla-sunday': {
    current:
      'Rich, indulgent vanilla black tea evokes a warm homey feeling. Try it with a dash of sugar for an added layer of decadence.',
    proposed:
      'Rich, indulgent vanilla black tea evokes a warm homey feeling. Try it with a dash of sugar for an added layer of decadence.\n\nIn the blend: black tea, with calendula petals, marigold petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'young-puerh': {
    current:
      "A character best described as elemental. The tea leaves come from the 'Dayeh' bush variety closely related to the original tea tree.",
    proposed:
      "A character best described as elemental. The tea leaves come from the 'Dayeh' bush variety closely related to the original tea tree.\n\nSourced from Yunnan Province, China.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Its caffeine makes it a good way to start the day.",
  },
  'arabian-camomile': {
    current: 'Very aromatic with a fruity tending floral flavor.',
    proposed:
      'Very aromatic with a fruity tending floral flavor.\n\nGrown in the Nile River Delta and Fayoum, Egypt.\n\nBrew one teaspoon (about 2 g) per cup at 89°C for 6 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
  },
  lavender: {
    current: 'Mild with slight pungent and a distinctive floral perfume character.',
    proposed:
      'Mild with slight pungent and a distinctive floral perfume character.\n\nGrown in Provence, France.\n\nUse about 2 g (one teaspoon) per cup, with water at 95°C, and steep for 4–5 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  'rose-petal': {
    current: 'Light floral notes and pleasant lingering finish.',
    proposed:
      'Light floral notes and pleasant lingering finish.\n\nThis flower infusion comes from the Nile River Delta and Fayoum, Egypt.\n\nBrew one teaspoon (about 2 g) per cup at 95°C for 4–5 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'bingo-blueberry': {
    current:
      'A full flavored tea with superb and well-defined blueberry highlights. Excellent as an iced tea.',
    proposed:
      'A full flavored tea with superb and well-defined blueberry highlights. Excellent as an iced tea.\n\nIn the blend: hibiscus petals, apple pieces, elderberry pieces, currant pieces, European blueberries and American blueberries, with cornflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'lime-gelato': {
    current:
      "Pinch me! Have a fresh lime gelato in St. Mark's Square without the hassle. Nothing like it!",
    proposed:
      "Pinch me! Have a fresh lime gelato in St. Mark's Square without the hassle. Nothing like it!\n\nThe blend brings together apple pieces, hibiscus, rosehip, lemon pieces, lime pieces, peppermint leaves and lime leaves.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.",
  },
  'peach-harmony': {
    current:
      'Delicious smooth and lightly sweet peach notes are in abundance. Lightly fresh hibiscus finish.',
    proposed:
      'Delicious smooth and lightly sweet peach notes are in abundance. Lightly fresh hibiscus finish.\n\nIt is blended from apple pieces, hibiscus, rosehip, peach pieces and chamomile petals.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  'strawberry-kiwi': {
    current: 'Bold strawberry kiwi flavor, tart, full bodied notes.',
    proposed:
      'Bold strawberry kiwi flavor, tart, full bodied notes.\n\nIt is blended from apple pieces, hibiscus petals, rosehip, kiwi pieces and strawberry pieces.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.',
  },
  'sunny-mango': {
    current:
      'The unsurpassable flavor of Micronesian mangos makes love to the taste buds. Fruity, lively and bright. Start a new affair!',
    proposed:
      'The unsurpassable flavor of Micronesian mangos makes love to the taste buds. Fruity, lively and bright. Start a new affair!\n\nIt is blended from apple pieces, hibiscus petals, rosehip, mango pieces, pineapple pieces, elderberry pieces and orange pieces.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  'dragon-well': {
    current:
      'Full bodied tending astringent (brisk) with a slight heady bouquet. Full green tea flavor.',
    proposed:
      'Full bodied tending astringent (brisk) with a slight heady bouquet. Full green tea flavor.\n\nSourced from Zhejiang Province, China.\n\nBrew one teaspoon (about 2 g) per cup at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  genmaicha: {
    current:
      'Toasty and bakey with slight buttery notes. Popped rice kernels provide an excellent visual and impart the unique flavor of the tea.',
    proposed:
      'Toasty and bakey with slight buttery notes. Popped rice kernels provide an excellent visual and impart the unique flavor of the tea.\n\nThe blend brings together green tea, roasted rice and popped rice. This green tea comes from Kagoshima Prefecture, Japan.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'ginger-green': {
    current:
      'Full Monty, ginger awakens your taste buds with hot spice and leads them to an astringent premium Sencha finish.',
    proposed:
      'Full Monty, ginger awakens your taste buds with hot spice and leads them to an astringent premium Sencha finish.\n\nIn the blend: green tea and ginger.\n\nUse about 2 g (one teaspoon) per cup, with water at 75–80°C, and steep for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'ginger-lemon': {
    current:
      'Lively and flavorful ginger notes peeking through the sweet lemon character. A delightful tea.',
    proposed:
      'Lively and flavorful ginger notes peeking through the sweet lemon character. A delightful tea.\n\nIn the blend: green tea, lime pieces, lemon pieces and ginger, with calendula petals, marigold petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2 g) per cup at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'green-jasmine': {
    current:
      'Exquisite, abundant jasmine character on a seasonal green tea. This jasmine flavor is only possible with midnight May flowers.',
    proposed:
      'Exquisite, abundant jasmine character on a seasonal green tea. This jasmine flavor is only possible with midnight May flowers.\n\nIn the blend: green tea and jasmine petals. Sourced from Jiangxi Province, China. Certified organic.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'lemon-green': {
    current:
      'A pleasant blend of tart lemon with the sweetness of green tea. Makes excellent iced tea.',
    proposed:
      'A pleasant blend of tart lemon with the sweetness of green tea. Makes excellent iced tea.\n\nIt is blended from green tea, lime pieces and lemon pieces, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'long-island-strawberry': {
    current:
      'Flavory, summer sweet strawberry and papaya pieces round out an exceptionally smooth green tea.',
    proposed:
      'Flavory, summer sweet strawberry and papaya pieces round out an exceptionally smooth green tea.\n\nIt is blended from green tea, papaya pieces and strawberry pieces.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'lucky-dragon-hyson': {
    current:
      'Bold and full flavored with hints of pine on the finish. An excellent example of a robust China green tea.',
    proposed:
      'Bold and full flavored with hints of pine on the finish. An excellent example of a robust China green tea.\n\nSourced from Anhui Province, China. Certified organic.\n\nUse about 2 g (one teaspoon) per cup, with water at 75–80°C, and steep for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'magic-mango-natural': {
    current:
      'Like being carried on trade winds, notes of mango create an exotic fruit pungency. Pineapple cubes highlight the mango character and mallow petals accent a clean finish.',
    proposed:
      'Like being carried on trade winds, notes of mango create an exotic fruit pungency. Pineapple cubes highlight the mango character and mallow petals accent a clean finish.\n\nThe blend brings together green tea and pineapple pieces, with mallow petals for colour.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'pan-fired-darjeeling': {
    current:
      'Delicate flavor with muscatel notes. Hints of pungency note its 2nd flush production time.',
    proposed:
      'Delicate flavor with muscatel notes. Hints of pungency note its 2nd flush production time.\n\nThis green tea comes from Darjeeling, India.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'royal-green': {
    current:
      'A green tea with surprising body and a captivating taste that has an intriguing hint of oakiness.',
    proposed:
      'A green tea with surprising body and a captivating taste that has an intriguing hint of oakiness.\n\nSourced from Zhejiang Province, China. Certified organic.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'sencha-fuji': {
    current:
      'Delicious green tea character with depth, body and some pungency. Cup tends bright forest green.',
    proposed:
      'Delicious green tea character with depth, body and some pungency. Cup tends bright forest green.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'sencha-kyoto-cherry-rose': {
    current:
      'Exquisite green tea blended with sweet cherry flavouring and subtle rose hints. Fresh and smooth with excellent depth and body.',
    proposed:
      'Exquisite green tea blended with sweet cherry flavouring and subtle rose hints. Fresh and smooth with excellent depth and body.\n\nIn the blend: Sencha green tea and rose petals.\n\nBrew one teaspoon (about 2 g) per cup at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'shanghai-lychee-jasmine': {
    current:
      'Superb synergy of jasmine, green tea, and luscious lychee fruit. Sweet fruit entwined with delicate floral jasmine.',
    proposed:
      'Superb synergy of jasmine, green tea, and luscious lychee fruit. Sweet fruit entwined with delicate floral jasmine.\n\nIn the blend: green tea and jasmine petals. Grown in Anhui and Fujian Provinces, China.\n\nUse about 2 g (one teaspoon) per cup, with water at 75–80°C, and steep for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'vanilla-green': {
    current:
      "Sweet, flavorful vanilla gives this green tea depth and character. The aroma almost shouts 'Welcome Home'.",
    proposed:
      "Sweet, flavorful vanilla gives this green tea depth and character. The aroma almost shouts 'Welcome Home'.\n\nIn the blend: green tea, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.",
  },
  'body-and-soul': {
    current:
      'Makes you want to dance. Light tart fruity mint opens your palate, floral and fruit follow and finishes with piquant ginger. Life goodness in a cup.',
    proposed:
      'Makes you want to dance. Light tart fruity mint opens your palate, floral and fruit follow and finishes with piquant ginger. Life goodness in a cup.\n\nThe blend brings together peppermint leaves, rosehip pieces, spearmint leaves, ginger, rooibos, hibiscus petals, rose petals and osmanthus petals, with calendula petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'cozy-apple-cinnamon': {
    current:
      'Warm apple flavor with sweet cinnamon highlights. Tangy citrus balanced by rich notes of anise, clove, and cardamom.',
    proposed:
      'Warm apple flavor with sweet cinnamon highlights. Tangy citrus balanced by rich notes of anise, clove, and cardamom.\n\nIn the blend: apple, hibiscus, cinnamon, star anise, orange peel, cloves, elderberry, currants, cardamom, rosehip, ginger, stevia leaves and black pepper, with cornflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  'golden-elixir': {
    current: 'Licorice-like notes from the turmeric with a light sweet finish.',
    proposed:
      'Licorice-like notes from the turmeric with a light sweet finish.\n\nThe blend brings together ginger, turmeric root, carrot pieces, beet pieces and pineapple pieces, with calendula petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–10 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'green-mate': {
    current:
      'True gaucho flavor, full bodied but slightly bitter and wild. Mate is rich in mateine and was used as caffeine in Latin America before the advent of coffee.',
    proposed:
      'True gaucho flavor, full bodied but slightly bitter and wild. Mate is rich in mateine and was used as caffeine in Latin America before the advent of coffee.\n\nGrown in Parana, Brazil. Certified organic.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–10 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  moringa: {
    current: 'Notes of cabbage with an olive chaser.',
    proposed:
      'Notes of cabbage with an olive chaser.\n\nGrown in Kerala, India.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  peppermint: {
    current: 'Pungent, cool, fresh, menthol. Infused leaf is bright green, tending yellowish.',
    proposed:
      'Pungent, cool, fresh, menthol. Infused leaf is bright green, tending yellowish.\n\nThis herbal blend comes from Washington State, USA. Certified organic.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  'sleepy-moon': {
    current:
      'Soft camomile and sweet apple notes, tempered with light mint. A soothing medley of flavors.',
    proposed:
      "Soft camomile and sweet apple notes, tempered with light mint. A soothing medley of flavors.\n\nThe blend brings together apple, lavender, chamomile, St. John's wort, lemon balm, licorice, fennel, peppermint and valerian.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.",
  },
  'tulsi-licorice-delight': {
    current: 'Pleasant tending fruity cup with a delicious ginger finish.',
    proposed:
      'Pleasant tending fruity cup with a delicious ginger finish.\n\nIt is blended from ginger, licorice, Tulsi (Holy Basil), dandelion leaves, burdock root, rose petals and elder flowers, with safflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–10 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'creamy-oolong': {
    current:
      "A most unique character best described as 'premium oolong with sweet milk and light orchid notes peeking out from camellia depths'.",
    proposed:
      "A most unique character best described as 'premium oolong with sweet milk and light orchid notes peeking out from camellia depths'.\n\nThis oolong comes from Fujian Province, China.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 90–95°C for 3–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.",
  },
  'mango-oolong': {
    current:
      "Remember the taste of a ripe yellow mango — the center of it? Here you go — you found it! No wonder J'Adore!",
    proposed:
      "Remember the taste of a ripe yellow mango — the center of it? Here you go — you found it! No wonder J'Adore!\n\nIt is blended from oolong tea and mango pieces, with calendula petals, marigold petals and sunflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 90–95°C, and steep for 3–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.",
  },
  oolong: {
    current: "A light 'airy' character with delicate orchid-like notes.",
    proposed:
      "A light 'airy' character with delicate orchid-like notes.\n\nThis oolong comes from Fujian Province, China.\n\nBrew one teaspoon (about 2.5 g) per cup at 90–95°C for 3–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.",
  },
  'royal-oolong': {
    current:
      'A lively floral oolong with a creamy finish blended with smooth notes of green tea and infused with a hint of Earl Grey for a royally refreshing cup.',
    proposed:
      'A lively floral oolong with a creamy finish blended with smooth notes of green tea and infused with a hint of Earl Grey for a royally refreshing cup.\n\nIt is blended from oolong tea and green tea, with amaranth petals, cornflower petals, calendula petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 90–95°C for 3–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'cape-cod-cranberry': {
    current:
      'The lively tart flavor of cranberry blends well with mellow sweet rooibos. Sip and take a trip to the Cape Cod Cranberry Festival.',
    proposed:
      'The lively tart flavor of cranberry blends well with mellow sweet rooibos. Sip and take a trip to the Cape Cod Cranberry Festival.\n\nThe blend brings together rooibos, rosehip pieces, lime leaves and cranberry pieces.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'ginger-rooibos': {
    current:
      'Bright clean taste with superb ginger notes. A palate refreshing spicy character combined with a fruity touch.',
    proposed:
      'Bright clean taste with superb ginger notes. A palate refreshing spicy character combined with a fruity touch.\n\nIt is blended from rooibos and ginger root.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'green-rooibos': {
    current: 'Sweet pleasant cup with delicate herbaceous notes. Light fruity finish.',
    proposed:
      'Sweet pleasant cup with delicate herbaceous notes. Light fruity finish.\n\nGrown in Cederberg, South Africa. Certified organic.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  'jet-lag-asleep': {
    current:
      'Dream the time zones away. Buttery notes of toffee and cream slide into bed with appley notes of camomile.',
    proposed:
      'Dream the time zones away. Buttery notes of toffee and cream slide into bed with appley notes of camomile.\n\nIt is blended from rooibos and chamomile petals.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.',
  },
  'madagascar-vanilla': {
    current:
      'Fruity with sweet notes. Vanilla flavoring gives the rooibos a wonderful jazzy depth.',
    proposed:
      'Fruity with sweet notes. Vanilla flavoring gives the rooibos a wonderful jazzy depth.\n\nIn the blend: rooibos and almond pieces, with calendula petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.',
  },
  'mango-rooibos': {
    current:
      "Inspired by Bora Bora's best loved tropical fruit - mango! Delicious fruit highlights transport one to tropical climes.",
    proposed:
      "Inspired by Bora Bora's best loved tropical fruit - mango! Delicious fruit highlights transport one to tropical climes.\n\nIn the blend: rooibos, mango pieces, pineapple pieces and blackberry leaves, with calendula petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.",
  },
  'provence-lavender': {
    current:
      'Flavory with a floral and fruity bouquet; perfumy lavender notes. Inspired by the joie de vivre of France.',
    proposed:
      'Flavory with a floral and fruity bouquet; perfumy lavender notes. Inspired by the joie de vivre of France.\n\nIt is blended from rooibos, rosehip pieces, elderberry pieces, blueberry pieces, lavender petals and rose petals.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.',
  },
  rainbow: {
    current:
      'The flavor profile of this tea is a pot of gold. A terrific fruit medley with Amaretto notes.',
    proposed:
      'The flavor profile of this tea is a pot of gold. A terrific fruit medley with Amaretto notes.\n\nThe blend brings together rooibos, with cornflower petals, calendula petals and safflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
  },
  raspberry: {
    current:
      'Spritely notes of raspberry come to the fore with light overtones of rooibos. A perfect raspberry jam finish.',
    proposed:
      'Spritely notes of raspberry come to the fore with light overtones of rooibos. A perfect raspberry jam finish.\n\nIt is blended from rooibos and raspberry leaves.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  rooibos: {
    current: 'The reddish orange cup is fruity with sweet notes.',
    proposed:
      'The reddish orange cup is fruity with sweet notes.\n\nThis rooibos comes from Cederberg, South Africa. Certified organic.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'sunshine-lemon': {
    current:
      'Lemon invigorates the rooibos taste. Simply wonderful hot or iced and dressed with a slice of lemon.',
    proposed:
      'Lemon invigorates the rooibos taste. Simply wonderful hot or iced and dressed with a slice of lemon.\n\nThe blend brings together rooibos and lemongrass leaves, with calendula petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
  },
  sowmee: {
    current:
      'Delicious toasty character with body reminiscent of Oolongs. Lingering taste that encourages another cup.',
    proposed:
      'Delicious toasty character with body reminiscent of Oolongs. Lingering taste that encourages another cup.\n\nGrown in Fujian Province, China.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 4–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. Gentle on caffeine, it suits a quiet afternoon.',
  },
  'white-tea': {
    current:
      'Clear slightly pale cup with a fresh aroma and a smooth velvety flavor. Delicate jammy notes reminiscent of Keemun or a mild Bordeaux.',
    proposed:
      'Clear slightly pale cup with a fresh aroma and a smooth velvety flavor. Delicate jammy notes reminiscent of Keemun or a mild Bordeaux.\n\nSourced from Fujian Province, China.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 4–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. Gentle on caffeine, it suits a quiet afternoon.',
  },
};
