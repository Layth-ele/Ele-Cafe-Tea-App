import { describe, expect, test } from 'vitest';
import { deriveFilterVocabulary, facetCounts, ingredientKey, matchesTeaFilters, type TeaFilterState } from '../../../src/lib/teaFilters';
import type { Product } from '../../../src/types';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'tea-1',
    slug: 'tea-1',
    name: 'Test Tea',
    description: 'Test description',
    category: 'black',
    stock: 12,
    isOrganic: false,
    caffeine: 'Medium',
    benefits: '',
    ingredients: '',
    origin: '',
    regions: '',
    ...overrides,
  } as Product;
}

function baseFilters(): TeaFilterState {
  return {
    selectedCats: new Set(),
    inStock: false,
    outOfStock: false,
    organicOnly: false,
    caffFilter: new Set(),
    ingredientFilter: new Set(),
    functFilter: new Set(),
  };
}

describe('teaFilters functionality matching', () => {
  test('matches Energising products when filtering Energy', () => {
    const product = makeProduct({
      benefits: 'Antioxidant, Energising, Focus, Immune system',
      description: 'Good for alertness and vitality',
    });

    const filters = baseFilters();
    filters.functFilter = new Set(['Energy']);

    expect(matchesTeaFilters(product, filters, '')).toBe(true);
  });

  test('matches Calming / Stress relief products when filtering Relaxation', () => {
    const product = makeProduct({
      benefits: 'Calming, Relaxing, Stress relief',
      description: 'A gentle evening cup',
    });

    const filters = baseFilters();
    filters.functFilter = new Set(['Relaxation']);

    expect(matchesTeaFilters(product, filters, '')).toBe(true);
  });

  test('matches Immune system text when filtering Immunity', () => {
    const product = makeProduct({
      benefits: 'Antioxidant, Immune system, Digestive, Energising',
      description: 'Supports daily wellness',
    });

    const filters = baseFilters();
    filters.functFilter = new Set(['Immunity']);

    expect(matchesTeaFilters(product, filters, '')).toBe(true);
  });

  test('rejects when the selected function is not present', () => {
    const product = makeProduct({
      benefits: 'Calming, Relaxing, Stress relief',
    });

    const filters = baseFilters();
    filters.functFilter = new Set(['Energy']);

    expect(matchesTeaFilters(product, filters, '')).toBe(false);
  });
});

describe('teaFilters vocabulary derivation', () => {
  test('only lists functionality groups some tea has', () => {
    const products = [
      makeProduct({
        benefits: 'Calming, Energising, Focus, Immune system',
        description: 'Good for alertness, digestive comfort, and stress relief',
      }),
      makeProduct({
        benefits: 'Detox, Relaxing, Revitalizing',
        description: 'A purifying brew for a gentle reset',
      }),
    ];

    const labels = deriveFilterVocabulary(products).functions.map((o) => o.value);
    for (const label of ['Relaxation', 'Energy', 'Focus', 'Detox', 'Digestion', 'Immunity']) {
      expect(labels).toContain(label);
    }
    expect(labels).not.toContain('Skin');
    expect(labels).not.toContain('Sleep'); // "reset" is not "rest"
  });

  test('empty catalog → no options', () => {
    const vocab = deriveFilterVocabulary([]);
    expect(vocab.functions).toEqual([]);
    expect(vocab.ingredients).toEqual([]);
  });

  test('groups ingredient spellings into one option with a French label', () => {
    const products = [
      makeProduct({ id: 'a', ingredients: 'Black tea, Rosehip pieces, Cloves', ingredientsFr: 'Thé noir, morceaux d\'églantier, clous de girofle' } as Partial<Product>),
      makeProduct({ id: 'b', ingredients: 'Pine-smoked black tea, Rosehip, Clove', ingredientsFr: 'Thé noir fumé, cynorrhodon, clou de girofle' } as Partial<Product>),
    ];
    const opts = deriveFilterVocabulary(products).ingredients;
    expect(opts.map((o) => o.value).sort()).toEqual(['black tea', 'clove', 'rosehip']);
    const black = opts.find((o) => o.value === 'black tea')!;
    expect(black.total).toBe(2);
    expect(black.label).toBe('Black tea');
  });
});

describe('ingredientKey', () => {
  test.each([
    ['Rosehip pieces', 'rosehip'],
    ['Cloves', 'clove'],
    ['American blueberries', 'blueberry'],
    ['Sencha green tea', 'green tea'],
    ['Decaffeinated black tea', 'black tea'],
    ['Rose buds and petals', 'rose'],
    ["St. John's wort", "st. john's wort"],
    ['Lemongrass leaves', 'lemongrass'],
    ['Hibiscus petals', 'hibiscus'],
    ['Roasted rice', 'roasted rice'],
    ['Tulsi (Holy Basil)', 'tulsi'],
  ])('%s → %s', (raw, key) => {
    expect(ingredientKey(raw)).toBe(key);
  });

  test('ingredient filter matches grouped spellings, not substrings', () => {
    const f = baseFilters();
    f.ingredientFilter = new Set(['rose']);
    expect(matchesTeaFilters(makeProduct({ ingredients: 'Rosehip' }), f, '')).toBe(false);
    expect(matchesTeaFilters(makeProduct({ ingredients: 'Rose petals' }), f, '')).toBe(true);
    // Older links used the curated label.
    f.ingredientFilter = new Set(['Green Tea']);
    expect(matchesTeaFilters(makeProduct({ ingredients: 'Green tea leaves' }), f, '')).toBe(true);
  });
});

describe('facetCounts', () => {
  test('counts what each option would return', () => {
    const products = [
      makeProduct({ id: 'a', category: 'black', ingredients: 'Black tea, Ginger' }),
      makeProduct({ id: 'b', category: 'black', ingredients: 'Black tea' }),
      makeProduct({ id: 'c', category: 'green', ingredients: 'Green tea, Ginger' }),
    ];
    const f = baseFilters();
    f.selectedCats = new Set(['black']);
    const c = facetCounts(products, f, '');
    expect(c.cats.get('black')).toBe(2);
    expect(c.cats.get('green')).toBe(1);          // OR facet ignores its own picks
    expect(c.ingredients.get('ginger')).toBe(1);  // within the black selection
    expect(c.ingredients.get('green tea')).toBeUndefined();
  });
});

describe('search', () => {
  test('finds French text, ignores accents, matches every word', () => {
    const p = makeProduct({ name: 'Peppermint', ingredients: 'Peppermint leaves', nameFr: 'Menthe poivrée' } as Partial<Product>);
    expect(matchesTeaFilters(p, baseFilters(), 'menthe poivree')).toBe(true);
    expect(matchesTeaFilters(p, baseFilters(), 'peppermint jasmine')).toBe(false);
  });
});
