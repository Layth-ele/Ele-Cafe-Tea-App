/**
 * categories.ts — canonical category list.
 *
 * Extracted from mockProducts.ts so pages that only need this small
 * constant (HomePage, ProductsPage, TeaProfilePage, BundleTeaCard,
 * AdminProducts) don't transitively pull the full 79-tea seed data
 * (~44 KB raw / ~12 KB gzip) into their bundle. The seed data is
 * lazy-imported by firebaseQueries.ts on the rare fallback path; UI
 * code only needs the lightweight category metadata.
 */
export const categories = [
  { id: 'black',   name: 'Black Tea',   nameFr: 'Thé noir',        color: '#3d1a1a' },
  { id: 'green',   name: 'Green Tea',   nameFr: 'Thé vert',        color: '#2d6a4f' },
  { id: 'white',   name: 'White Tea',   nameFr: 'Thé blanc',       color: '#8d99ae' },
  { id: 'oolong',  name: 'Oolong Tea',  nameFr: 'Thé oolong',      color: '#6b4c2a' },
  { id: 'rooibos', name: 'Rooibos Tea', nameFr: 'Rooibos',         color: '#b5451b' },
  { id: 'herbal',  name: 'Herbal Tea',  nameFr: 'Tisane',          color: '#386641' },
  { id: 'flower',  name: 'Flower Tea',  nameFr: 'Thé aux fleurs',  color: '#c77dff' },
  { id: 'fruit',   name: 'Fruit Tea',   nameFr: 'Thé aux fruits',  color: '#e07a5f' },
  // Matcha + hojicha powders. `hideUntilStocked`: only shown on the
  // storefront once at least one active product is in the category
  // (see useVisibleCategoryIds) — so a new category never leads to an
  // empty page.
  { id: 'powder',  name: 'Tea Powders', nameFr: 'Thés en poudre',  color: '#5f7f3a', hideUntilStocked: true },
] as const;

export type CategoryId = typeof categories[number]['id'];
