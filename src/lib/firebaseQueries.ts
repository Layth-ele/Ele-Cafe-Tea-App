import {
  collection,
  doc,
  getDoc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import type { Product } from '@/types';
import { validateProduct } from '@/schemas/product.schema';
import { db } from './firebase';

// ---------------------------------------------------------------------------
// Mock-product loader — singleton promise so the dynamic import fires once.
// ---------------------------------------------------------------------------
let mockPromise: Promise<typeof import('../data/mockProducts')> | null = null;
function loadMockProducts() {
  if (!mockPromise) mockPromise = import('../data/mockProducts');
  return mockPromise;
}

// ---------------------------------------------------------------------------
// Parse + assert a raw Firestore document against the Zod productSchema.
// Throws with the field-level Zod errors instead of silently passing bad data.
// ---------------------------------------------------------------------------
function parseProduct(raw: unknown, context: string): Product {
  const result = validateProduct(raw);
  if (!result.success) {
    throw new TypeError(
      `[firebaseQueries] ${context}: Firestore document failed validation — ` +
      result.error.issues.map(i => `${i.path.map(String).join('.')}: ${i.message}`).join(', '),
    );
  }
  return result.data;
}

/**
 * Parse a list of Firestore tea docs. A doc that fails validation is
 * logged and skipped, so one bad tea can't take the whole catalog down
 * to the mock fallback.
 */
export function parseProductDocs(
  docs: ReadonlyArray<{ id: string; data: () => unknown }>,
  context: string,
): Product[] {
  const rows: Product[] = [];
  for (const d of docs) {
    try {
      rows.push(parseProduct({ id: d.id, ...(d.data() as object) }, `${context}/${d.id}`));
    } catch (err) {
      console.warn('[firebaseQueries] skipping invalid tea:', err);
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const activeOnly = (list: Product[]) => list.filter(p => p.isActive !== false);

/** Applied to every mock in catch paths so customers can never add a mock
 *  tea to cart when Firestore is unreachable. */
export const markUnavailable = (p: Product): Product => ({
  ...p,
  available:         false,
  availabilityLabel: 'out_of_stock' as const,
});

export const queryKeys = {
  teas:       ()             => ['teas']               as const,
  featured:   ()             => ['teas', 'featured']   as const,
  teaCount:   ()             => ['teas', 'count']      as const,
  activeCategories: ()       => ['teas', 'active-categories'] as const,
  tea:        (slug: string) => ['tea', slug]           as const,
  userOrders: (uid: string)  => ['orders', 'user', uid] as const,
  allOrders:  (n?: number)   => ['orders', 'all', n]    as const,
};

// ---------------------------------------------------------------------------
// fetchActiveTeaCount — for copy like "75 loose leaf teas". Two aggregation
// queries (1 read each) instead of loading the catalog, and no mock
// fallback: on failure it returns 0 and callers leave the number out
// rather than show the seed list's size as if it were real.
// ---------------------------------------------------------------------------
export async function fetchActiveTeaCount(): Promise<number> {
  try {
    const teas = collection(db, 'teas');
    const [all, inactive] = await Promise.all([
      getCountFromServer(teas),
      getCountFromServer(query(teas, where('isActive', '==', false))),
    ]);
    return Math.max(0, all.data().count - inactive.data().count);
  } catch (err) {
    console.warn('[firebaseQueries] fetchActiveTeaCount failed:', err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// fetchActiveCategoryIds — categories that have at least one active tea.
// Two count aggregations per category (1 read each), so the storefront can
// hide a category (e.g. a new "Tea Powders" line) until something in it is
// on sale. Returns null on failure so callers can fall back safely.
// ---------------------------------------------------------------------------
export async function fetchActiveCategoryIds(ids: readonly string[]): Promise<string[] | null> {
  try {
    const teas = collection(db, 'teas');
    const counts = await Promise.all(ids.map(async (id) => {
      const [all, inactive] = await Promise.all([
        getCountFromServer(query(teas, where('category', '==', id))),
        getCountFromServer(query(teas, where('category', '==', id), where('isActive', '==', false))),
      ]);
      return [id, all.data().count - inactive.data().count] as const;
    }));
    return counts.filter(([, n]) => n > 0).map(([id]) => id);
  } catch (err) {
    console.warn('[firebaseQueries] fetchActiveCategoryIds failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// fetchTeas
// ---------------------------------------------------------------------------
export async function fetchTeas(): Promise<Product[]> {
  try {
    const snap = await getDocs(query(collection(db, 'teas'), orderBy('name', 'asc')));
    const rows = parseProductDocs(snap.docs, 'fetchTeas');
    if (rows.length) return activeOnly(rows);

    const { mockProducts } = await loadMockProducts();
    return activeOnly(mockProducts as Product[]);
  } catch (err) {
    console.warn('[firebaseQueries] fetchTeas failed, using mock fallback:', err);
    const { mockProducts } = await loadMockProducts();
    return activeOnly((mockProducts as Product[]).map(markUnavailable));
  }
}

// ---------------------------------------------------------------------------
// fetchFeaturedTeas
// ---------------------------------------------------------------------------
export async function fetchFeaturedTeas(): Promise<Product[]> {
  try {
    const q = query(
      collection(db, 'teas'),
      where('featured', '==', true),
      where('isActive', '==', true),
      orderBy('name', 'asc'),
      limit(12),
    );
    const snap = await getDocs(q);
    const rows = parseProductDocs(snap.docs, 'fetchFeaturedTeas');
    if (rows.length) return rows;

    return (await fetchTeas()).filter(t => t.featured).slice(0, 12);
  } catch (err) {
    console.warn('[firebaseQueries] fetchFeaturedTeas failed, falling back to fetchTeas:', err);
    // fetchTeas() already handles its own catch path (marks mocks unavailable).
    return (await fetchTeas()).filter(t => t.featured).slice(0, 12);
  }
}

// ---------------------------------------------------------------------------
// fetchTea
// ---------------------------------------------------------------------------
export async function fetchTea(slug: string): Promise<Product | null> {
  if (!slug) return null;

  // Build candidate list: try the slug as-given first (canonical hot-path),
  // then the normalized version (covers hand-edited URLs, share-target
  // landings, and server-rendered SEO fetches that skipped canonicalization).
  const { toSlug } = await import('./slugify');
  const canon = toSlug(slug);
  const candidates: string[] = canon && canon !== slug ? [slug, canon] : [slug];

  // -------------------------------------------------------------------------
  // Fetch one candidate via ID + slug query IN PARALLEL.
  // -------------------------------------------------------------------------
  async function lookupCandidate(candidate: string): Promise<Product | null> {
    const [byIdSnap, bySlugSnap] = await Promise.all([
      getDoc(doc(db, 'teas', candidate)),
      getDocs(query(collection(db, 'teas'), where('slug', '==', candidate), limit(1))),
    ]);

    if (byIdSnap.exists()) {
      const p = parseProduct({ id: byIdSnap.id, ...byIdSnap.data() }, 'fetchTea/byId');
      return p.isActive === false ? null : p;
    }

    if (!bySlugSnap.empty) {
      const d = bySlugSnap.docs[0];
      const p = parseProduct({ id: d.id, ...d.data() }, 'fetchTea/bySlug');
      return p.isActive === false ? null : p;
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // If a product came back without an image, try a cheap single-doc re-fetch
  // first (covers partial-write races), then fall back to the full live list
  // (usually already cached by React Query so no extra network cost).
  // -------------------------------------------------------------------------
  const hasUsableImage = (p: Product | null | undefined): p is Product =>
    typeof p?.image === 'string' && p.image.trim().length > 0;

  async function promoteImage(primary: Product, candidate: string): Promise<Product> {
    if (hasUsableImage(primary)) return primary;

    try {
      const fresh = await getDoc(doc(db, 'teas', candidate));
      if (fresh.exists()) {
        const p = parseProduct({ id: fresh.id, ...fresh.data() }, 'promoteImage/re-fetch');
        if (hasUsableImage(p)) return p;
      }
    } catch (err) {
      console.warn('[firebaseQueries] promoteImage single-doc re-fetch failed:', err);
    }

    try {
      const live = await fetchTeas();
      for (const c of candidates) {
        const match = live.find(
          p => (p.slug === c || p.id === c) && hasUsableImage(p),
        );
        if (match) return match;
      }
    } catch (err) {
      console.warn('[firebaseQueries] promoteImage live-list fallback failed:', err);
    }

    return primary;
  }

  // -------------------------------------------------------------------------
  // Main lookup
  // -------------------------------------------------------------------------
  try {
    for (const candidate of candidates) {
      const product = await lookupCandidate(candidate);
      if (product) return promoteImage(product, candidate);
    }

    const { mockProducts } = await loadMockProducts();
    const list = mockProducts as Product[];
    for (const candidate of candidates) {
      const m = list.find(p => p.slug === candidate || p.id === candidate);
      if (m) return m;
    }
    return null;
  } catch (err) {
    console.warn('[firebaseQueries] fetchTea failed, using mock fallback:', err);
    const { mockProducts } = await loadMockProducts();
    const list = mockProducts as Product[];
    for (const candidate of candidates) {
      const m = list.find(x => x.slug === candidate || x.id === candidate);
      if (m) return markUnavailable(m);
    }
    return null;
  }
}