import { describe, test, expect } from 'vitest';
import { parseProductDocs } from '@/lib/firebaseQueries';

// Admin → Edit writes null for every cleared field; a tea saved without a
// photo must still show in the shop (it once hid Matcha and Hojicha).
describe('parseProductDocs', () => {
  test('keeps a tea whose optional fields are null', () => {
    const doc = {
      id: 'matcha-powder',
      data: () => ({
        name: 'Ceremonial Matcha Powder',
        slug: 'matcha-powder',
        category: 'powder',
        price: 18,
        image: '',
        isActive: true,
        available: true,
        availabilityLabel: 'in_stock',
        blurhash: null,
        variantsAvailable: null,
        nameFr: null,
        allergens: null,
      }),
    };
    const rows = parseProductDocs([doc], 'test');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Ceremonial Matcha Powder');
  });
});
