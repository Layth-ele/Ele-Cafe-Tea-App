import { describe, test, expect } from 'vitest';
import { comboDiet, comboCalories, cafeMenuLd } from '../../../functions/src/lib/cafeMenu';

describe('pastry dietary tags', () => {
  test('orders tags, ignores unknown ones, and counts the old vegan flag', () => {
    expect(comboDiet({ diet: ['vegan', 'dairy-free', 'keto'] })).toEqual(['dairy-free', 'vegan']);
    expect(comboDiet({ vegan: true })).toEqual(['vegan']);
    expect(comboDiet({})).toEqual([]);
  });

  test('calories: whole number or null', () => {
    expect(comboCalories({ calories: 399.6 })).toBe(400);
    expect(comboCalories({ calories: 0 })).toBeNull();
    expect(comboCalories({})).toBeNull();
  });

  test('menu JSON-LD carries suitableForDiet and calories', () => {
    const ld = cafeMenuLd('https://elecafe.ca', [
      {
        title: 'Orange Brownie',
        price: 8.95,
        diet: ['dairy-free', 'gluten-free', 'vegan', 'vegetarian'],
        calories: 400,
      },
    ]) as { hasMenuSection: Array<{ hasMenuItem: Array<Record<string, unknown>> }> };
    const item = ld.hasMenuSection.at(-1)!.hasMenuItem[0];
    expect(item.suitableForDiet).toEqual([
      'https://schema.org/GlutenFreeDiet',
      'https://schema.org/VeganDiet',
      'https://schema.org/VegetarianDiet',
    ]);
    expect(item.nutrition).toEqual({ '@type': 'NutritionInformation', calories: '400 calories' });
  });
});
