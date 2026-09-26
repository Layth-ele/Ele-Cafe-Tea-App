/**
 * placeOrder input validation — everything the browser sends about the
 * cart is untrusted. Pure functions (no Firestore), unit-tested in
 * tests/unit/lib/orderValidation.test.ts.
 *
 * - IDs are restricted to slug characters: they're used to build
 *   Firestore paths (`teas/${id}`), and a "/" would let a client point
 *   the price lookup at a document it controls.
 * - Bundle price and contents come from BUNDLE_TIERS, never the client.
 * - Free-text fields are length-capped (they end up in emails / admin UI).
 */

/** Server copy of src/app/components/gift-builder/data/bundles.ts.
 *  Keep prices and counts in sync when bundles change. */
export const BUNDLE_TIERS: Record<string, {
  name: string; price: number; teaCount: number; sampleCount: number; hasFrenchPress: boolean;
}> = {
  discovery:    { name: 'Taster', price: 15, teaCount: 1, sampleCount: 1, hasFrenchPress: false },
  curators:     { name: 'Trio',   price: 35, teaCount: 3, sampleCount: 2, hasFrenchPress: false },
  connoisseurs: { name: 'Deluxe', price: 75, teaCount: 5, sampleCount: 3, hasFrenchPress: true },
  signature:    { name: 'Grand',  price: 99, teaCount: 7, sampleCount: 5, hasFrenchPress: true },
};

export const MAX_LINE_QUANTITY = 50;
export const MAX_LINES = 100;

const SLUG_RE = /^[A-Za-z0-9_-]{1,120}$/;
const BUNDLE_LINE_RE = /^bundle-[A-Za-z0-9_-]{1,100}$/;

export class OrderInputError extends Error {}

export const isSlugId = (v: unknown): v is string => typeof v === 'string' && SLUG_RE.test(v);

/** Trim + cap a free-text value; non-strings become ''. */
export function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export interface DirectLine { kind: 'tea'; productId: string; quantity: number }
export interface BundleLine {
  kind: 'bundle';
  productId: string;
  quantity: 1;
  price: number;
  name: string;
  teaIds: string[];
  sampleIds: string[];
  /** Sanitised blob stored on the order (never the raw client object). */
  bundle: Record<string, unknown>;
}
export type OrderLine = DirectLine | BundleLine;

type RawItem = { productId?: unknown; quantity?: unknown; bundle?: unknown };
type RawTea = { id?: unknown; name?: unknown; image?: unknown; origin?: unknown };

function cleanTeaList(list: unknown, label: string): { ids: string[]; items: Record<string, string>[] } {
  if (!Array.isArray(list)) throw new OrderInputError(`Bundle ${label} are missing.`);
  const ids: string[] = []; const items: Record<string, string>[] = [];
  for (const t of list as RawTea[]) {
    if (!isSlugId(t?.id)) throw new OrderInputError(`A tea in your bundle is invalid. Please rebuild the bundle.`);
    ids.push(t.id);
    items.push({
      id: t.id,
      name: cleanText(t.name, 120),
      ...(cleanText(t.image, 1000) ? { image: cleanText(t.image, 1000) } : {}),
      ...(cleanText(t.origin, 80) ? { origin: cleanText(t.origin, 80) } : {}),
    });
  }
  return { ids, items };
}

/** Validate and normalise the cart lines. Throws OrderInputError with a
 *  customer-readable message. */
export function validateOrderLines(rawItems: unknown): OrderLine[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new OrderInputError('Your cart is empty.');
  if (rawItems.length > MAX_LINES) throw new OrderInputError(`Too many items (max ${MAX_LINES}).`);

  return (rawItems as RawItem[]).map((i): OrderLine => {
    const q = i?.quantity;
    if (typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > MAX_LINE_QUANTITY) {
      throw new OrderInputError(`Quantities must be whole numbers from 1 to ${MAX_LINE_QUANTITY}.`);
    }

    if (typeof i.productId === 'string' && i.productId.startsWith('bundle-')) {
      if (!BUNDLE_LINE_RE.test(i.productId)) throw new OrderInputError('A gift bundle in your cart is invalid.');
      if (q !== 1) throw new OrderInputError('Gift bundles are one per line.');
      const b = (i.bundle ?? {}) as Record<string, unknown>;
      const tier = typeof b.slug === 'string' ? BUNDLE_TIERS[b.slug] : undefined;
      if (!tier) throw new OrderInputError('A gift bundle in your cart is no longer offered. Please rebuild it.');
      const teas = cleanTeaList(b.teas, 'teas');
      const samples = cleanTeaList(b.samples, 'samples');
      if (teas.ids.length !== tier.teaCount) {
        throw new OrderInputError(`The ${tier.name} bundle includes exactly ${tier.teaCount} tea${tier.teaCount > 1 ? 's' : ''}. Please rebuild it.`);
      }
      if (samples.ids.length > tier.sampleCount) {
        throw new OrderInputError(`The ${tier.name} bundle includes up to ${tier.sampleCount} samples. Please rebuild it.`);
      }
      const p = (b.personalization ?? {}) as Record<string, unknown>;
      return {
        kind: 'bundle',
        productId: i.productId,
        quantity: 1,
        price: tier.price,
        name: tier.name,
        teaIds: teas.ids,
        sampleIds: samples.ids,
        bundle: {
          slug: b.slug,
          name: tier.name,
          hasFrenchPress: tier.hasFrenchPress,
          teas: teas.items,
          samples: samples.items,
          personalization: {
            recipientName:  cleanText(p.recipientName, 100),
            senderName:     cleanText(p.senderName, 100),
            occasion:       cleanText(p.occasion, 60),
            customOccasion: cleanText(p.customOccasion, 100),
            message:        cleanText(p.message, 1000),
            deliveryDate:   cleanText(p.deliveryDate, 30) || null,
          },
        },
      };
    }

    if (!isSlugId(i?.productId)) throw new OrderInputError('An item in your cart is invalid. Please refresh your cart.');
    return { kind: 'tea', productId: i.productId, quantity: q };
  });
}
