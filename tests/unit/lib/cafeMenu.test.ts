import { describe, expect, test } from 'vitest';
import { CAFE_DRINKS, CAFE_MENU, cafeMenuLd } from '../../../functions/src/lib/cafeMenu';

describe('café menu data', () => {
  test('coffee, matcha, hojicha and tea boards, in that order', () => {
    expect(CAFE_MENU.map((s) => s.id)).toEqual(['coffee', 'matcha', 'hojicha', 'tea']);
  });

  test('drink ids are unique and every drink has English + French copy', () => {
    const ids = CAFE_DRINKS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of CAFE_DRINKS) {
      for (const v of [d.name, d.nameFr, d.description, d.descriptionFr]) expect(v.trim()).not.toBe('');
    }
  });

  test('every coffee / matcha / hojicha drink is priced; 16 oz never cheaper than 12 oz', () => {
    for (const sec of CAFE_MENU.filter((s) => s.id !== 'tea')) {
      for (const d of sec.drinks) {
        const priced = typeof d.price === 'number' || (typeof d.price12 === 'number' && typeof d.price16 === 'number');
        expect(priced, `${d.id} has no price`).toBe(true);
        if (typeof d.price12 === 'number') expect(d.price16!).toBeGreaterThanOrEqual(d.price12);
      }
    }
  });

  test('menu JSON-LD carries a section per board with CAD offers', () => {
    const ld = cafeMenuLd('https://elecafe.ca', []) as { hasMenuSection: Array<{ name: string; hasMenuItem: Array<{ name: string; offers?: unknown }> }> };
    expect(ld.hasMenuSection.map((s) => s.name)).toEqual(['Coffee', 'Matcha', 'Hojicha', 'Tea']);
    const latte = ld.hasMenuSection[1].hasMenuItem.find((i) => i.name === 'Matcha Latte');
    expect(latte?.offers).toEqual([
      { '@type': 'Offer', name: '12 oz', price: '6.35', priceCurrency: 'CAD' },
      { '@type': 'Offer', name: '16 oz', price: '6.99', priceCurrency: 'CAD' },
    ]);
  });
});
