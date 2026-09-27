/**
 * approvedTeaDescriptions.ts — the longer tea descriptions the owner approved
 * (Sept 2026), revised to drop the origin sentence (origin/region already
 * show in Tea Details). Applied by the admin-only applyApprovedTeaDescriptions
 * callable (contentUpdates.ts). `from` lists the texts it may replace — the
 * original and the first approved version — so a description the owner has
 * edited since is left alone. Safe to delete once applied.
 */
export const APPROVED_TEA_DESCRIPTIONS: Record<string, { from: string[]; proposed: string }> = {
  assam: {
    from: [
      'Full bodied, lovely balanced astringency with jammy hints of malt and toast. A good stout Assam.',
      'Full bodied, lovely balanced astringency with jammy hints of malt and toast. A good stout Assam.\n\nSourced from Assam, India. Certified organic.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Its caffeine makes it a good way to start the day.',
    ],
    proposed:
      'Full bodied, lovely balanced astringency with jammy hints of malt and toast. A good stout Assam.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Its caffeine makes it a good way to start the day.',
  },
  'black-currant': {
    from: [
      'Deep black currant aroma and flavor. Just imagine a currant bush full of berries. Stunning as an iced tea.',
      'Deep black currant aroma and flavor. Just imagine a currant bush full of berries. Stunning as an iced tea.\n\nIt is blended from black tea, currants and blackberry leaves, with mallow, cornflower petals, marigold petals and sunflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
    ],
    proposed:
      'Deep black currant aroma and flavor. Just imagine a currant bush full of berries. Stunning as an iced tea.\n\nIt is blended from black tea, currants and blackberry leaves, with mallow, cornflower petals, marigold petals and sunflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
  },
  'ceylon-orange-pekoe': {
    from: [
      'Full-bodied with a lovely, balanced astringency, offering bright, malty notes and a hint of citrus zest, a smooth and vibrant tea.',
      'Full-bodied with a lovely, balanced astringency, offering bright, malty notes and a hint of citrus zest, a smooth and vibrant tea.\n\nThis black tea comes from Ceylon, Sri Lanka.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
    ],
    proposed:
      'Full-bodied with a lovely, balanced astringency, offering bright, malty notes and a hint of citrus zest, a smooth and vibrant tea.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'chocolate-mint': {
    from: [
      'Fresh lovely mint combined with full flavored chocolate tea that is wonderfully reminiscent of an after-dinner mint. How decadent!',
      'Fresh lovely mint combined with full flavored chocolate tea that is wonderfully reminiscent of an after-dinner mint. How decadent!\n\nIn the blend: black tea, blackberry leaves and peppermint leaves.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Its caffeine makes it a good way to start the day.',
    ],
    proposed:
      'Fresh lovely mint combined with full flavored chocolate tea that is wonderfully reminiscent of an after-dinner mint. How decadent!\n\nIn the blend: black tea, blackberry leaves and peppermint leaves.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Its caffeine makes it a good way to start the day.',
  },
  'cinnamon-scream': {
    from: [
      'Mildly spicy with red heart cinnamon flavor. A refreshing and tongue-tickling tea.',
      'Mildly spicy with red heart cinnamon flavor. A refreshing and tongue-tickling tea.\n\nIn the blend: black tea and cinnamon.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
    ],
    proposed:
      'Mildly spicy with red heart cinnamon flavor. A refreshing and tongue-tickling tea.\n\nIn the blend: black tea and cinnamon.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'earl-grey-classic': {
    from: [
      "An unbelievable aroma that portends an unbelievable taste. We have been told repeatedly: 'This is the best Earl Grey I have ever tasted!'",
      "An unbelievable aroma that portends an unbelievable taste. We have been told repeatedly: 'This is the best Earl Grey I have ever tasted!'.\n\nThe blend brings together black tea, with cornflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.",
    ],
    proposed:
      "An unbelievable aroma that portends an unbelievable taste. We have been told repeatedly: 'This is the best Earl Grey I have ever tasted!'.\n\nThe blend brings together black tea, with cornflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.",
  },
  'earl-grey-cream': {
    from: [
      'A must for the avid Earl Grey tea drinker! Our flavoury Earl Grey mellowed with a delicious creamy taste. An excellent all day tea with a superb finish.',
      'A must for the avid Earl Grey tea drinker! Our flavoury Earl Grey mellowed with a delicious creamy taste. An excellent all day tea with a superb finish.\n\nIt is blended from black tea, with cornflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
    ],
    proposed:
      'A must for the avid Earl Grey tea drinker! Our flavoury Earl Grey mellowed with a delicious creamy taste. An excellent all day tea with a superb finish.\n\nIt is blended from black tea, with cornflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'earl-grey-decaf': {
    from: [
      'A full flavory cup of tea tending bright with excellent Earl Grey notes from natural bergamot flavoring.',
      'A full flavory cup of tea tending bright with excellent Earl Grey notes from natural bergamot flavoring.\n\nIt is blended from decaffeinated black tea, with cornflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Decaffeinated, so you can enjoy it any time, even in the evening.',
    ],
    proposed:
      'A full flavory cup of tea tending bright with excellent Earl Grey notes from natural bergamot flavoring.\n\nIt is blended from decaffeinated black tea, with cornflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Decaffeinated, so you can enjoy it any time, even in the evening.',
  },
  'earl-grey-royal': {
    from: [
      'A sophisticated blend combining classic Earl Grey with delicate jasmine buds and creamy undertones, offering a smooth, fragrant cup with floral and citrus notes.',
      'A sophisticated blend combining classic Earl Grey with delicate jasmine buds and creamy undertones, offering a smooth, fragrant cup with floral and citrus notes.\n\nIn the blend: black tea and jasmine buds, with cornflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
    ],
    proposed:
      'A sophisticated blend combining classic Earl Grey with delicate jasmine buds and creamy undertones, offering a smooth, fragrant cup with floral and citrus notes.\n\nIn the blend: black tea and jasmine buds, with cornflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
  },
  'english-breakfast': {
    from: [
      'A perfect breakfast tea with good body and full tea flavour notes. Coppery bright, especially enticing with milk.',
      'A perfect breakfast tea with good body and full tea flavour notes. Coppery bright, especially enticing with milk.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
    ],
    proposed:
      'A perfect breakfast tea with good body and full tea flavour notes. Coppery bright, especially enticing with milk.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'ginger-black-tea': {
    from: [
      'Memories of fresh ginger root; piquant, spicy and fruit hot. A refreshing and clean taste to the palate.',
      'Memories of fresh ginger root; piquant, spicy and fruit hot. A refreshing and clean taste to the palate.\n\nIt is blended from black tea and ginger, with calendula petals, marigold petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. Its caffeine makes it a good way to start the day.',
    ],
    proposed:
      'Memories of fresh ginger root; piquant, spicy and fruit hot. A refreshing and clean taste to the palate.\n\nIt is blended from black tea and ginger, with calendula petals, marigold petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. Its caffeine makes it a good way to start the day.',
  },
  gingerbread: {
    from: [
      'Lusciously ginger and sweet cinnamon cookie flavor.',
      'Lusciously ginger and sweet cinnamon cookie flavor.\n\nThe blend brings together black tea, cinnamon, star anise, cocoa beans, ginger and chamomile flowers, with safflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
    ],
    proposed:
      'Lusciously ginger and sweet cinnamon cookie flavor.\n\nThe blend brings together black tea, cinnamon, star anise, cocoa beans, ginger and chamomile flowers, with safflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'himalayan-chai': {
    from: [
      'Aromatic and warming with a rich blend of spices and a smooth, full-bodied tea base, delivering a comforting, spiced kick.',
      'Aromatic and warming with a rich blend of spices and a smooth, full-bodied tea base, delivering a comforting, spiced kick.\n\nIt is blended from black tea, ginger, cinnamon, cardamom, clove and black pepper. This black tea comes from the Himalayas, India. Certified organic.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
    ],
    proposed:
      'Aromatic and warming with a rich blend of spices and a smooth, full-bodied tea base, delivering a comforting, spiced kick.\n\nIt is blended from black tea, ginger, cinnamon, cardamom, clove and black pepper. Certified organic.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'irish-breakfast': {
    from: [
      'A stout robust blend of February Kenya BP1 and 2nd flush Assam. Superb color and very full bodied. Excellent in the early morning or afternoon.',
      'A stout robust blend of February Kenya BP1 and 2nd flush Assam. Superb color and very full bodied. Excellent in the early morning or afternoon.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
    ],
    proposed:
      'A stout robust blend of February Kenya BP1 and 2nd flush Assam. Superb color and very full bodied. Excellent in the early morning or afternoon.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
  },
  'island-coconut': {
    from: [
      'Smooth black tea meets creamy, nutty coconut. A vacation in a cup. Get ready to sip some paradise!',
      'Smooth black tea meets creamy, nutty coconut. A vacation in a cup. Get ready to sip some paradise!\n\nIn the blend: black tea and coconut pieces. Certified organic.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
    ],
    proposed:
      'Smooth black tea meets creamy, nutty coconut. A vacation in a cup. Get ready to sip some paradise!\n\nIn the blend: black tea and coconut pieces. Certified organic.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'keemun-panda': {
    from: [
      'Lovely burgundy depth with light hints of an oak cask. A tea to serve during hectic or quiet times.',
      'Lovely burgundy depth with light hints of an oak cask. A tea to serve during hectic or quiet times.\n\nThis black tea comes from Anhui Province, China.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
    ],
    proposed:
      'Lovely burgundy depth with light hints of an oak cask. A tea to serve during hectic or quiet times.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'lapsang-souchong': {
    from: [
      'A superior leaf Lapsang Souchong offering a crisp character with the remarkable and heady aroma of an oak fire.',
      'A superior leaf Lapsang Souchong offering a crisp character with the remarkable and heady aroma of an oak fire.\n\nGrown in Fujian Province — Xingchun region, China.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
    ],
    proposed:
      'A superior leaf Lapsang Souchong offering a crisp character with the remarkable and heady aroma of an oak fire.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'lychee-congou': {
    from: [
      'A leafy black tea infused with the flavor of lychee fruit producing a delightful, naturally scented tea.',
      'A leafy black tea infused with the flavor of lychee fruit producing a delightful, naturally scented tea.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
    ],
    proposed:
      'A leafy black tea infused with the flavor of lychee fruit producing a delightful, naturally scented tea.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'mango-mist': {
    from: [
      'Fresh, piquant mango character with memories of happy days in the sun.',
      'Fresh, piquant mango character with memories of happy days in the sun.\n\nThe blend brings together black tea, mango pieces and lime leaves, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
    ],
    proposed:
      'Fresh, piquant mango character with memories of happy days in the sun.\n\nThe blend brings together black tea, mango pieces and lime leaves, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
  },
  'margarets-hope-darjeeling': {
    from: [
      "A delicate, slightly astringent cup with the distinctive 'Muscatel' character. Hints of currant create an almost wine-like taste.",
      "A delicate, slightly astringent cup with the distinctive 'Muscatel' character. Hints of currant create an almost wine-like taste.\n\nSourced from Darjeeling, India.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.",
    ],
    proposed:
      "A delicate, slightly astringent cup with the distinctive 'Muscatel' character. Hints of currant create an almost wine-like taste.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.",
  },
  'monks-blend': {
    from: [
      'One of our most flavorful teas. The dramatic combination of vanilla and grenadine ensures a particularly satisfying cup.',
      'One of our most flavorful teas. The dramatic combination of vanilla and grenadine ensures a particularly satisfying cup.\n\nIn the blend: black tea, with calendula petals, marigold petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. Its caffeine makes it a good way to start the day.',
    ],
    proposed:
      'One of our most flavorful teas. The dramatic combination of vanilla and grenadine ensures a particularly satisfying cup.\n\nIn the blend: black tea, with calendula petals, marigold petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. Its caffeine makes it a good way to start the day.',
  },
  'orange-spice': {
    from: [
      'The flavory character of new season Florida oranges and fresh cinnamon is well captured in this tea. A truly tasty combination of Ceylon tea.',
      'The flavory character of new season Florida oranges and fresh cinnamon is well captured in this tea. A truly tasty combination of Ceylon tea.\n\nThe blend brings together black tea, orange peel, cinnamon and clove.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
    ],
    proposed:
      'The flavory character of new season Florida oranges and fresh cinnamon is well captured in this tea. A truly tasty combination of Ceylon tea.\n\nThe blend brings together black tea, orange peel, cinnamon and clove.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 95–100°C, and steep for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
  },
  'peach-apricot': {
    from: [
      'Makes an absolutely tremendous iced tea! A flavory and tasty combination of mellow peaches with deep, full flavored apricots.',
      'Makes an absolutely tremendous iced tea! A flavory and tasty combination of mellow peaches with deep, full flavored apricots.\n\nIt is blended from black tea, papaya pieces, blackberry leaves, apricot pieces and peach pieces, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
    ],
    proposed:
      'Makes an absolutely tremendous iced tea! A flavory and tasty combination of mellow peaches with deep, full flavored apricots.\n\nIt is blended from black tea, papaya pieces, blackberry leaves, apricot pieces and peach pieces, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'pumpkin-spice': {
    from: [
      'Notes of cinnamon and pumpkin abound. A blend of sweet spices, caramel depths, and chocolate undertones. Nothing beats a cozy cup of pumpkin spice tea.',
      'Notes of cinnamon and pumpkin abound. A blend of sweet spices, caramel depths, and chocolate undertones. Nothing beats a cozy cup of pumpkin spice tea.\n\nThe blend brings together black tea, apple pieces, orange peel, rosehip, hibiscus, cinnamon and pumpkin pieces, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Its caffeine makes it a good way to start the day.',
    ],
    proposed:
      'Notes of cinnamon and pumpkin abound. A blend of sweet spices, caramel depths, and chocolate undertones. Nothing beats a cozy cup of pumpkin spice tea.\n\nThe blend brings together black tea, apple pieces, orange peel, rosehip, hibiscus, cinnamon and pumpkin pieces, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Its caffeine makes it a good way to start the day.',
  },
  'rose-tea': {
    from: [
      'Simply a lovely tea — especially for afternoons with good friends. Delicious floral notes reminiscent of a Tea Rose garden.',
      'Simply a lovely tea — especially for afternoons with good friends. Delicious floral notes reminiscent of a Tea Rose garden.\n\nIn the blend: black tea, rosehip pieces, rose petals and blackberry leaves.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
    ],
    proposed:
      'Simply a lovely tea — especially for afternoons with good friends. Delicious floral notes reminiscent of a Tea Rose garden.\n\nIn the blend: black tea, rosehip pieces, rose petals and blackberry leaves.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Try it straight, as a creamy milk tea, or chilled over ice. Its caffeine makes it a good way to start the day.',
  },
  'vanilla-sunday': {
    from: [
      'Rich, indulgent vanilla black tea evokes a warm homey feeling. Try it with a dash of sugar for an added layer of decadence.',
      'Rich, indulgent vanilla black tea evokes a warm homey feeling. Try it with a dash of sugar for an added layer of decadence.\n\nIn the blend: black tea, with calendula petals, marigold petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
    ],
    proposed:
      'Rich, indulgent vanilla black tea evokes a warm homey feeling. Try it with a dash of sugar for an added layer of decadence.\n\nIn the blend: black tea, with calendula petals, marigold petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 95–100°C for 3–5 minutes. It has the body to take milk, as a milk tea or a tea latte, and also makes a lovely iced tea. With a full caffeine lift, it is a natural morning or early-afternoon cup.',
  },
  'young-puerh': {
    from: [
      "A character best described as elemental. The tea leaves come from the 'Dayeh' bush variety closely related to the original tea tree.",
      "A character best described as elemental. The tea leaves come from the 'Dayeh' bush variety closely related to the original tea tree.\n\nSourced from Yunnan Province, China.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Its caffeine makes it a good way to start the day.",
    ],
    proposed:
      "A character best described as elemental. The tea leaves come from the 'Dayeh' bush variety closely related to the original tea tree.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 95–100°C for 3–5 minutes. Enjoy it plain, with milk as a tea latte, or brewed strong and poured over ice. Its caffeine makes it a good way to start the day.",
  },
  'arabian-camomile': {
    from: [
      'Very aromatic with a fruity tending floral flavor.',
      'Very aromatic with a fruity tending floral flavor.\n\nGrown in the Nile River Delta and Fayoum, Egypt.\n\nBrew one teaspoon (about 2 g) per cup at 89°C for 6 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
    ],
    proposed:
      'Very aromatic with a fruity tending floral flavor.\n\nBrew one teaspoon (about 2 g) per cup at 89°C for 6 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
  },
  lavender: {
    from: [
      'Mild with slight pungent and a distinctive floral perfume character.',
      'Mild with slight pungent and a distinctive floral perfume character.\n\nGrown in Provence, France.\n\nUse about 2 g (one teaspoon) per cup, with water at 95°C, and steep for 4–5 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
    ],
    proposed:
      'Mild with slight pungent and a distinctive floral perfume character.\n\nUse about 2 g (one teaspoon) per cup, with water at 95°C, and steep for 4–5 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  'rose-petal': {
    from: [
      'Light floral notes and pleasant lingering finish.',
      'Light floral notes and pleasant lingering finish.\n\nThis flower infusion comes from the Nile River Delta and Fayoum, Egypt.\n\nBrew one teaspoon (about 2 g) per cup at 95°C for 4–5 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
    ],
    proposed:
      'Light floral notes and pleasant lingering finish.\n\nBrew one teaspoon (about 2 g) per cup at 95°C for 4–5 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'bingo-blueberry': {
    from: [
      'A full flavored tea with superb and well-defined blueberry highlights. Excellent as an iced tea.',
      'A full flavored tea with superb and well-defined blueberry highlights. Excellent as an iced tea.\n\nIn the blend: hibiscus petals, apple pieces, elderberry pieces, currant pieces, European blueberries and American blueberries, with cornflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
    ],
    proposed:
      'A full flavored tea with superb and well-defined blueberry highlights. Excellent as an iced tea.\n\nIn the blend: hibiscus petals, apple pieces, elderberry pieces, currant pieces, European blueberries and American blueberries, with cornflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'lime-gelato': {
    from: [
      "Pinch me! Have a fresh lime gelato in St. Mark's Square without the hassle. Nothing like it!",
      "Pinch me! Have a fresh lime gelato in St. Mark's Square without the hassle. Nothing like it!\n\nThe blend brings together apple pieces, hibiscus, rosehip, lemon pieces, lime pieces, peppermint leaves and lime leaves.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.",
    ],
    proposed:
      "Pinch me! Have a fresh lime gelato in St. Mark's Square without the hassle. Nothing like it!\n\nThe blend brings together apple pieces, hibiscus, rosehip, lemon pieces, lime pieces, peppermint leaves and lime leaves.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.",
  },
  'peach-harmony': {
    from: [
      'Delicious smooth and lightly sweet peach notes are in abundance. Lightly fresh hibiscus finish.',
      'Delicious smooth and lightly sweet peach notes are in abundance. Lightly fresh hibiscus finish.\n\nIt is blended from apple pieces, hibiscus, rosehip, peach pieces and chamomile petals.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
    ],
    proposed:
      'Delicious smooth and lightly sweet peach notes are in abundance. Lightly fresh hibiscus finish.\n\nIt is blended from apple pieces, hibiscus, rosehip, peach pieces and chamomile petals.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  'strawberry-kiwi': {
    from: [
      'Bold strawberry kiwi flavor, tart, full bodied notes.',
      'Bold strawberry kiwi flavor, tart, full bodied notes.\n\nIt is blended from apple pieces, hibiscus petals, rosehip, kiwi pieces and strawberry pieces.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.',
    ],
    proposed:
      'Bold strawberry kiwi flavor, tart, full bodied notes.\n\nIt is blended from apple pieces, hibiscus petals, rosehip, kiwi pieces and strawberry pieces.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.',
  },
  'sunny-mango': {
    from: [
      'The unsurpassable flavor of Micronesian mangos makes love to the taste buds. Fruity, lively and bright. Start a new affair!',
      'The unsurpassable flavor of Micronesian mangos makes love to the taste buds. Fruity, lively and bright. Start a new affair!\n\nIt is blended from apple pieces, hibiscus petals, rosehip, mango pieces, pineapple pieces, elderberry pieces and orange pieces.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
    ],
    proposed:
      'The unsurpassable flavor of Micronesian mangos makes love to the taste buds. Fruity, lively and bright. Start a new affair!\n\nIt is blended from apple pieces, hibiscus petals, rosehip, mango pieces, pineapple pieces, elderberry pieces and orange pieces.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  'dragon-well': {
    from: [
      'Full bodied tending astringent (brisk) with a slight heady bouquet. Full green tea flavor.',
      'Full bodied tending astringent (brisk) with a slight heady bouquet. Full green tea flavor.\n\nSourced from Zhejiang Province, China.\n\nBrew one teaspoon (about 2 g) per cup at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'Full bodied tending astringent (brisk) with a slight heady bouquet. Full green tea flavor.\n\nBrew one teaspoon (about 2 g) per cup at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  genmaicha: {
    from: [
      'Toasty and bakey with slight buttery notes. Popped rice kernels provide an excellent visual and impart the unique flavor of the tea.',
      'Toasty and bakey with slight buttery notes. Popped rice kernels provide an excellent visual and impart the unique flavor of the tea.\n\nThe blend brings together green tea, roasted rice and popped rice. This green tea comes from Kagoshima Prefecture, Japan.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'Toasty and bakey with slight buttery notes. Popped rice kernels provide an excellent visual and impart the unique flavor of the tea.\n\nThe blend brings together green tea, roasted rice and popped rice.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'ginger-green': {
    from: [
      'Full Monty, ginger awakens your taste buds with hot spice and leads them to an astringent premium Sencha finish.',
      'Full Monty, ginger awakens your taste buds with hot spice and leads them to an astringent premium Sencha finish.\n\nIn the blend: green tea and ginger.\n\nUse about 2 g (one teaspoon) per cup, with water at 75–80°C, and steep for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'Full Monty, ginger awakens your taste buds with hot spice and leads them to an astringent premium Sencha finish.\n\nIn the blend: green tea and ginger.\n\nUse about 2 g (one teaspoon) per cup, with water at 75–80°C, and steep for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'ginger-lemon': {
    from: [
      'Lively and flavorful ginger notes peeking through the sweet lemon character. A delightful tea.',
      'Lively and flavorful ginger notes peeking through the sweet lemon character. A delightful tea.\n\nIn the blend: green tea, lime pieces, lemon pieces and ginger, with calendula petals, marigold petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2 g) per cup at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'Lively and flavorful ginger notes peeking through the sweet lemon character. A delightful tea.\n\nIn the blend: green tea, lime pieces, lemon pieces and ginger, with calendula petals, marigold petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2 g) per cup at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'green-jasmine': {
    from: [
      'Exquisite, abundant jasmine character on a seasonal green tea. This jasmine flavor is only possible with midnight May flowers.',
      'Exquisite, abundant jasmine character on a seasonal green tea. This jasmine flavor is only possible with midnight May flowers.\n\nIn the blend: green tea and jasmine petals. Sourced from Jiangxi Province, China. Certified organic.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'Exquisite, abundant jasmine character on a seasonal green tea. This jasmine flavor is only possible with midnight May flowers.\n\nIn the blend: green tea and jasmine petals. Certified organic.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'lemon-green': {
    from: [
      'A pleasant blend of tart lemon with the sweetness of green tea. Makes excellent iced tea.',
      'A pleasant blend of tart lemon with the sweetness of green tea. Makes excellent iced tea.\n\nIt is blended from green tea, lime pieces and lemon pieces, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'A pleasant blend of tart lemon with the sweetness of green tea. Makes excellent iced tea.\n\nIt is blended from green tea, lime pieces and lemon pieces, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'long-island-strawberry': {
    from: [
      'Flavory, summer sweet strawberry and papaya pieces round out an exceptionally smooth green tea.',
      'Flavory, summer sweet strawberry and papaya pieces round out an exceptionally smooth green tea.\n\nIt is blended from green tea, papaya pieces and strawberry pieces.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'Flavory, summer sweet strawberry and papaya pieces round out an exceptionally smooth green tea.\n\nIt is blended from green tea, papaya pieces and strawberry pieces.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'lucky-dragon-hyson': {
    from: [
      'Bold and full flavored with hints of pine on the finish. An excellent example of a robust China green tea.',
      'Bold and full flavored with hints of pine on the finish. An excellent example of a robust China green tea.\n\nSourced from Anhui Province, China. Certified organic.\n\nUse about 2 g (one teaspoon) per cup, with water at 75–80°C, and steep for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'Bold and full flavored with hints of pine on the finish. An excellent example of a robust China green tea.\n\nUse about 2 g (one teaspoon) per cup, with water at 75–80°C, and steep for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'magic-mango-natural': {
    from: [
      'Like being carried on trade winds, notes of mango create an exotic fruit pungency. Pineapple cubes highlight the mango character and mallow petals accent a clean finish.',
      'Like being carried on trade winds, notes of mango create an exotic fruit pungency. Pineapple cubes highlight the mango character and mallow petals accent a clean finish.\n\nThe blend brings together green tea and pineapple pieces, with mallow petals for colour.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'Like being carried on trade winds, notes of mango create an exotic fruit pungency. Pineapple cubes highlight the mango character and mallow petals accent a clean finish.\n\nThe blend brings together green tea and pineapple pieces, with mallow petals for colour.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'pan-fired-darjeeling': {
    from: [
      'Delicate flavor with muscatel notes. Hints of pungency note its 2nd flush production time.',
      'Delicate flavor with muscatel notes. Hints of pungency note its 2nd flush production time.\n\nThis green tea comes from Darjeeling, India.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'Delicate flavor with muscatel notes. Hints of pungency note its 2nd flush production time.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'royal-green': {
    from: [
      'A green tea with surprising body and a captivating taste that has an intriguing hint of oakiness.',
      'A green tea with surprising body and a captivating taste that has an intriguing hint of oakiness.\n\nSourced from Zhejiang Province, China. Certified organic.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'A green tea with surprising body and a captivating taste that has an intriguing hint of oakiness.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'sencha-fuji': {
    from: [
      'Delicious green tea character with depth, body and some pungency. Cup tends bright forest green.',
      'Delicious green tea character with depth, body and some pungency. Cup tends bright forest green.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'Delicious green tea character with depth, body and some pungency. Cup tends bright forest green.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'sencha-kyoto-cherry-rose': {
    from: [
      'Exquisite green tea blended with sweet cherry flavouring and subtle rose hints. Fresh and smooth with excellent depth and body.',
      'Exquisite green tea blended with sweet cherry flavouring and subtle rose hints. Fresh and smooth with excellent depth and body.\n\nIn the blend: Sencha green tea and rose petals.\n\nBrew one teaspoon (about 2 g) per cup at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'Exquisite green tea blended with sweet cherry flavouring and subtle rose hints. Fresh and smooth with excellent depth and body.\n\nIn the blend: Sencha green tea and rose petals.\n\nBrew one teaspoon (about 2 g) per cup at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'shanghai-lychee-jasmine': {
    from: [
      'Superb synergy of jasmine, green tea, and luscious lychee fruit. Sweet fruit entwined with delicate floral jasmine.',
      'Superb synergy of jasmine, green tea, and luscious lychee fruit. Sweet fruit entwined with delicate floral jasmine.\n\nIn the blend: green tea and jasmine petals. Grown in Anhui and Fujian Provinces, China.\n\nUse about 2 g (one teaspoon) per cup, with water at 75–80°C, and steep for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'Superb synergy of jasmine, green tea, and luscious lychee fruit. Sweet fruit entwined with delicate floral jasmine.\n\nIn the blend: green tea and jasmine petals.\n\nUse about 2 g (one teaspoon) per cup, with water at 75–80°C, and steep for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'vanilla-green': {
    from: [
      "Sweet, flavorful vanilla gives this green tea depth and character. The aroma almost shouts 'Welcome Home'.",
      "Sweet, flavorful vanilla gives this green tea depth and character. The aroma almost shouts 'Welcome Home'.\n\nIn the blend: green tea, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.",
    ],
    proposed:
      "Sweet, flavorful vanilla gives this green tea depth and character. The aroma almost shouts 'Welcome Home'.\n\nIn the blend: green tea, with calendula petals, marigold petals and sunflower petals for colour.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 2–3 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.",
  },
  'body-and-soul': {
    from: [
      'Makes you want to dance. Light tart fruity mint opens your palate, floral and fruit follow and finishes with piquant ginger. Life goodness in a cup.',
      'Makes you want to dance. Light tart fruity mint opens your palate, floral and fruit follow and finishes with piquant ginger. Life goodness in a cup.\n\nThe blend brings together peppermint leaves, rosehip pieces, spearmint leaves, ginger, rooibos, hibiscus petals, rose petals and osmanthus petals, with calendula petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
    ],
    proposed:
      'Makes you want to dance. Light tart fruity mint opens your palate, floral and fruit follow and finishes with piquant ginger. Life goodness in a cup.\n\nThe blend brings together peppermint leaves, rosehip pieces, spearmint leaves, ginger, rooibos, hibiscus petals, rose petals and osmanthus petals, with calendula petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'cozy-apple-cinnamon': {
    from: [
      'Warm apple flavor with sweet cinnamon highlights. Tangy citrus balanced by rich notes of anise, clove, and cardamom.',
      'Warm apple flavor with sweet cinnamon highlights. Tangy citrus balanced by rich notes of anise, clove, and cardamom.\n\nIn the blend: apple, hibiscus, cinnamon, star anise, orange peel, cloves, elderberry, currants, cardamom, rosehip, ginger, stevia leaves and black pepper, with cornflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
    ],
    proposed:
      'Warm apple flavor with sweet cinnamon highlights. Tangy citrus balanced by rich notes of anise, clove, and cardamom.\n\nIn the blend: apple, hibiscus, cinnamon, star anise, orange peel, cloves, elderberry, currants, cardamom, rosehip, ginger, stevia leaves and black pepper, with cornflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  'golden-elixir': {
    from: [
      'Licorice-like notes from the turmeric with a light sweet finish.',
      'Licorice-like notes from the turmeric with a light sweet finish.\n\nThe blend brings together ginger, turmeric root, carrot pieces, beet pieces and pineapple pieces, with calendula petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–10 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
    ],
    proposed:
      'Licorice-like notes from the turmeric with a light sweet finish.\n\nThe blend brings together ginger, turmeric root, carrot pieces, beet pieces and pineapple pieces, with calendula petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–10 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'green-mate': {
    from: [
      'True gaucho flavor, full bodied but slightly bitter and wild. Mate is rich in mateine and was used as caffeine in Latin America before the advent of coffee.',
      'True gaucho flavor, full bodied but slightly bitter and wild. Mate is rich in mateine and was used as caffeine in Latin America before the advent of coffee.\n\nGrown in Parana, Brazil. Certified organic.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–10 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'True gaucho flavor, full bodied but slightly bitter and wild. Mate is rich in mateine and was used as caffeine in Latin America before the advent of coffee.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–10 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  moringa: {
    from: [
      'Notes of cabbage with an olive chaser.',
      'Notes of cabbage with an olive chaser.\n\nGrown in Kerala, India.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
    ],
    proposed:
      'Notes of cabbage with an olive chaser.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  peppermint: {
    from: [
      'Pungent, cool, fresh, menthol. Infused leaf is bright green, tending yellowish.',
      'Pungent, cool, fresh, menthol. Infused leaf is bright green, tending yellowish.\n\nThis herbal blend comes from Washington State, USA. Certified organic.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
    ],
    proposed:
      'Pungent, cool, fresh, menthol. Infused leaf is bright green, tending yellowish.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  'sleepy-moon': {
    from: [
      'Soft camomile and sweet apple notes, tempered with light mint. A soothing medley of flavors.',
      "Soft camomile and sweet apple notes, tempered with light mint. A soothing medley of flavors.\n\nThe blend brings together apple, lavender, chamomile, St. John's wort, lemon balm, licorice, fennel, peppermint and valerian.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.",
    ],
    proposed:
      "Soft camomile and sweet apple notes, tempered with light mint. A soothing medley of flavors.\n\nThe blend brings together apple, lavender, chamomile, St. John's wort, lemon balm, licorice, fennel, peppermint and valerian.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–10 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.",
  },
  'tulsi-licorice-delight': {
    from: [
      'Pleasant tending fruity cup with a delicious ginger finish.',
      'Pleasant tending fruity cup with a delicious ginger finish.\n\nIt is blended from ginger, licorice, Tulsi (Holy Basil), dandelion leaves, burdock root, rose petals and elder flowers, with safflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–10 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
    ],
    proposed:
      'Pleasant tending fruity cup with a delicious ginger finish.\n\nIt is blended from ginger, licorice, Tulsi (Holy Basil), dandelion leaves, burdock root, rose petals and elder flowers, with safflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–10 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'creamy-oolong': {
    from: [
      "A most unique character best described as 'premium oolong with sweet milk and light orchid notes peeking out from camellia depths'.",
      "A most unique character best described as 'premium oolong with sweet milk and light orchid notes peeking out from camellia depths'.\n\nThis oolong comes from Fujian Province, China.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 90–95°C for 3–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.",
    ],
    proposed:
      "A most unique character best described as 'premium oolong with sweet milk and light orchid notes peeking out from camellia depths'.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 90–95°C for 3–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.",
  },
  'mango-oolong': {
    from: [
      "Remember the taste of a ripe yellow mango — the center of it? Here you go — you found it! No wonder J'Adore!",
      "Remember the taste of a ripe yellow mango — the center of it? Here you go — you found it! No wonder J'Adore!\n\nIt is blended from oolong tea and mango pieces, with calendula petals, marigold petals and sunflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 90–95°C, and steep for 3–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.",
    ],
    proposed:
      "Remember the taste of a ripe yellow mango — the center of it? Here you go — you found it! No wonder J'Adore!\n\nIt is blended from oolong tea and mango pieces, with calendula petals, marigold petals and sunflower petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 90–95°C, and steep for 3–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.",
  },
  oolong: {
    from: [
      "A light 'airy' character with delicate orchid-like notes.",
      "A light 'airy' character with delicate orchid-like notes.\n\nThis oolong comes from Fujian Province, China.\n\nBrew one teaspoon (about 2.5 g) per cup at 90–95°C for 3–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.",
    ],
    proposed:
      "A light 'airy' character with delicate orchid-like notes.\n\nBrew one teaspoon (about 2.5 g) per cup at 90–95°C for 3–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.",
  },
  'royal-oolong': {
    from: [
      'A lively floral oolong with a creamy finish blended with smooth notes of green tea and infused with a hint of Earl Grey for a royally refreshing cup.',
      'A lively floral oolong with a creamy finish blended with smooth notes of green tea and infused with a hint of Earl Grey for a royally refreshing cup.\n\nIt is blended from oolong tea and green tea, with amaranth petals, cornflower petals, calendula petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 90–95°C for 3–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
    ],
    proposed:
      'A lively floral oolong with a creamy finish blended with smooth notes of green tea and infused with a hint of Earl Grey for a royally refreshing cup.\n\nIt is blended from oolong tea and green tea, with amaranth petals, cornflower petals, calendula petals and sunflower petals for colour.\n\nBrew one teaspoon (about 2.5 g) per cup at 90–95°C for 3–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. With moderate caffeine, it is an easy cup for the afternoon.',
  },
  'cape-cod-cranberry': {
    from: [
      'The lively tart flavor of cranberry blends well with mellow sweet rooibos. Sip and take a trip to the Cape Cod Cranberry Festival.',
      'The lively tart flavor of cranberry blends well with mellow sweet rooibos. Sip and take a trip to the Cape Cod Cranberry Festival.\n\nThe blend brings together rooibos, rosehip pieces, lime leaves and cranberry pieces.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
    ],
    proposed:
      'The lively tart flavor of cranberry blends well with mellow sweet rooibos. Sip and take a trip to the Cape Cod Cranberry Festival.\n\nThe blend brings together rooibos, rosehip pieces, lime leaves and cranberry pieces.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'ginger-rooibos': {
    from: [
      'Bright clean taste with superb ginger notes. A palate refreshing spicy character combined with a fruity touch.',
      'Bright clean taste with superb ginger notes. A palate refreshing spicy character combined with a fruity touch.\n\nIt is blended from rooibos and ginger root.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
    ],
    proposed:
      'Bright clean taste with superb ginger notes. A palate refreshing spicy character combined with a fruity touch.\n\nIt is blended from rooibos and ginger root.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'green-rooibos': {
    from: [
      'Sweet pleasant cup with delicate herbaceous notes. Light fruity finish.',
      'Sweet pleasant cup with delicate herbaceous notes. Light fruity finish.\n\nGrown in Cederberg, South Africa. Certified organic.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
    ],
    proposed:
      'Sweet pleasant cup with delicate herbaceous notes. Light fruity finish.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  'jet-lag-asleep': {
    from: [
      'Dream the time zones away. Buttery notes of toffee and cream slide into bed with appley notes of camomile.',
      'Dream the time zones away. Buttery notes of toffee and cream slide into bed with appley notes of camomile.\n\nIt is blended from rooibos and chamomile petals.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.',
    ],
    proposed:
      'Dream the time zones away. Buttery notes of toffee and cream slide into bed with appley notes of camomile.\n\nIt is blended from rooibos and chamomile petals.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.',
  },
  'madagascar-vanilla': {
    from: [
      'Fruity with sweet notes. Vanilla flavoring gives the rooibos a wonderful jazzy depth.',
      'Fruity with sweet notes. Vanilla flavoring gives the rooibos a wonderful jazzy depth.\n\nIn the blend: rooibos and almond pieces, with calendula petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.',
    ],
    proposed:
      'Fruity with sweet notes. Vanilla flavoring gives the rooibos a wonderful jazzy depth.\n\nIn the blend: rooibos and almond pieces, with calendula petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.',
  },
  'mango-rooibos': {
    from: [
      "Inspired by Bora Bora's best loved tropical fruit - mango! Delicious fruit highlights transport one to tropical climes.",
      "Inspired by Bora Bora's best loved tropical fruit - mango! Delicious fruit highlights transport one to tropical climes.\n\nIn the blend: rooibos, mango pieces, pineapple pieces and blackberry leaves, with calendula petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.",
    ],
    proposed:
      "Inspired by Bora Bora's best loved tropical fruit - mango! Delicious fruit highlights transport one to tropical climes.\n\nIn the blend: rooibos, mango pieces, pineapple pieces and blackberry leaves, with calendula petals for colour.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.",
  },
  'provence-lavender': {
    from: [
      'Flavory with a floral and fruity bouquet; perfumy lavender notes. Inspired by the joie de vivre of France.',
      'Flavory with a floral and fruity bouquet; perfumy lavender notes. Inspired by the joie de vivre of France.\n\nIt is blended from rooibos, rosehip pieces, elderberry pieces, blueberry pieces, lavender petals and rose petals.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.',
    ],
    proposed:
      'Flavory with a floral and fruity bouquet; perfumy lavender notes. Inspired by the joie de vivre of France.\n\nIt is blended from rooibos, rosehip pieces, elderberry pieces, blueberry pieces, lavender petals and rose petals.\n\nUse about 2.5 g (one teaspoon) per cup, with water at 100°C, and steep for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Naturally caffeine-free, it is lovely in the evening.',
  },
  rainbow: {
    from: [
      'The flavor profile of this tea is a pot of gold. A terrific fruit medley with Amaretto notes.',
      'The flavor profile of this tea is a pot of gold. A terrific fruit medley with Amaretto notes.\n\nThe blend brings together rooibos, with cornflower petals, calendula petals and safflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
    ],
    proposed:
      'The flavor profile of this tea is a pot of gold. A terrific fruit medley with Amaretto notes.\n\nThe blend brings together rooibos, with cornflower petals, calendula petals and safflower petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Caffeine-free, so it suits any time of day, including before bed.',
  },
  raspberry: {
    from: [
      'Spritely notes of raspberry come to the fore with light overtones of rooibos. A perfect raspberry jam finish.',
      'Spritely notes of raspberry come to the fore with light overtones of rooibos. A perfect raspberry jam finish.\n\nIt is blended from rooibos and raspberry leaves.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
    ],
    proposed:
      'Spritely notes of raspberry come to the fore with light overtones of rooibos. A perfect raspberry jam finish.\n\nIt is blended from rooibos and raspberry leaves.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. Brew it double-strength and pour it over ice for a caffeine-free iced tea. Naturally caffeine-free, it is lovely in the evening.',
  },
  rooibos: {
    from: [
      'The reddish orange cup is fruity with sweet notes.',
      'The reddish orange cup is fruity with sweet notes.\n\nThis rooibos comes from Cederberg, South Africa. Certified organic.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
    ],
    proposed:
      'The reddish orange cup is fruity with sweet notes.\n\nBrew one teaspoon (about 2.5 g) per cup at 100°C for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
  },
  'sunshine-lemon': {
    from: [
      'Lemon invigorates the rooibos taste. Simply wonderful hot or iced and dressed with a slice of lemon.',
      'Lemon invigorates the rooibos taste. Simply wonderful hot or iced and dressed with a slice of lemon.\n\nThe blend brings together rooibos and lemongrass leaves, with calendula petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
    ],
    proposed:
      'Lemon invigorates the rooibos taste. Simply wonderful hot or iced and dressed with a slice of lemon.\n\nThe blend brings together rooibos and lemongrass leaves, with calendula petals for colour.\n\nTo brew, steep about 2.5 g (one teaspoon) per cup in water at 100°C for 5–7 minutes. It is just as good iced: brew it strong and pour it over ice. Caffeine-free, so it suits any time of day, including before bed.',
  },
  sowmee: {
    from: [
      'Delicious toasty character with body reminiscent of Oolongs. Lingering taste that encourages another cup.',
      'Delicious toasty character with body reminiscent of Oolongs. Lingering taste that encourages another cup.\n\nGrown in Fujian Province, China.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 4–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. Gentle on caffeine, it suits a quiet afternoon.',
    ],
    proposed:
      'Delicious toasty character with body reminiscent of Oolongs. Lingering taste that encourages another cup.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 4–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. Gentle on caffeine, it suits a quiet afternoon.',
  },
  'white-tea': {
    from: [
      'Clear slightly pale cup with a fresh aroma and a smooth velvety flavor. Delicate jammy notes reminiscent of Keemun or a mild Bordeaux.',
      'Clear slightly pale cup with a fresh aroma and a smooth velvety flavor. Delicate jammy notes reminiscent of Keemun or a mild Bordeaux.\n\nSourced from Fujian Province, China.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 4–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. Gentle on caffeine, it suits a quiet afternoon.',
    ],
    proposed:
      'Clear slightly pale cup with a fresh aroma and a smooth velvety flavor. Delicate jammy notes reminiscent of Keemun or a mild Bordeaux.\n\nTo brew, steep about 2 g (one teaspoon) per cup in water at 75–80°C for 4–5 minutes. It also makes a refreshing iced tea: brew it strong and pour it over ice. Gentle on caffeine, it suits a quiet afternoon.',
  },
};
