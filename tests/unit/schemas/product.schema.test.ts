/**
 * product.schema.test.ts — Firestore read-shape guarantees.
 *
 * Tea docs come back from Firestore with Timestamps (not Dates), null for
 * untranslated French fields, and image: '' for teas without a photo.
 * Any of those failing validation used to drop the whole catalog to the
 * mock fallback (no images, everything "Sold out"). These tests pin that
 * real stored shapes parse.
 */
import { describe, test, expect, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { validateProduct } from '@/schemas/product.schema';

vi.mock('@/lib/firebase', () => ({ db: {} }));
const { parseProductDocs, markUnavailable } = await import('@/lib/firebaseQueries');

const base = {
  id:    'oolong',
  slug:  'oolong',
  name:  'Oolong',
  price: 20,
  image: 'https://firebasestorage.googleapis.com/v0/b/x/o/teas%2Foolong.png',
};

describe('productSchema — Firestore shapes', () => {
  test('converts Firestore Timestamps to Dates', () => {
    const at = new Date('2026-05-01T12:00:00Z');
    const r = validateProduct({ ...base, createdAt: Timestamp.fromDate(at), updatedAt: Timestamp.fromDate(at) });
    expect(r.success).toBe(true);
    expect(r.data?.createdAt).toBeInstanceOf(Date);
    expect(r.data?.createdAt?.getTime()).toBe(at.getTime());
  });

  test('still accepts plain Dates and missing dates', () => {
    expect(validateProduct({ ...base, createdAt: new Date() }).success).toBe(true);
    expect(validateProduct(base).success).toBe(true);
  });

  test('treats null French fields as not set', () => {
    const r = validateProduct({
      ...base,
      nameFr: null, descriptionFr: null, benefitsFr: null,
      ingredientsFr: null, originFr: null, regionsFr: null,
    });
    expect(r.success).toBe(true);
    expect(r.data?.nameFr).toBeUndefined();
  });

  test("treats image: '' as no photo", () => {
    const r = validateProduct({ ...base, image: '' });
    expect(r.success).toBe(true);
    expect(r.data?.image).toBeUndefined();
  });

  test('still rejects a malformed image URL', () => {
    expect(validateProduct({ ...base, image: 'not a url' }).success).toBe(false);
  });
});

describe('parseProductDocs', () => {
  const doc = (id: string, data: object) => ({ id, data: () => data });

  test('skips an invalid doc instead of failing the whole list', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = parseProductDocs(
      [doc('a', { ...base, slug: 'a' }), doc('bad', { ...base, price: -1 }), doc('b', { ...base, slug: 'b' })],
      'test',
    );
    expect(rows.map(r => r.slug)).toEqual(['a', 'b']);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  test('uses the Firestore doc id', () => {
    const [row] = parseProductDocs([doc('green-jasmine', { name: 'Green Jasmine' })], 'test');
    expect(row.id).toBe('green-jasmine');
  });
});

describe('markUnavailable', () => {
  test('makes a fallback tea unpurchasable', () => {
    const p = markUnavailable({ ...base, available: true, availabilityLabel: 'in_stock' });
    expect(p.available).toBe(false);
    expect(p.availabilityLabel).toBe('out_of_stock');
  });
});
