/**
 * bundles.ts — Hardcoded bundle catalog for the v1 gift builder.
 *
 * Why hardcoded?
 * --------------
 * Day 16 ships with four fixed bundles. Migrating to Firestore-backed
 * bundle config (so non-engineers can edit prices/contents) is queued
 * for a future Day 17 — see SPEC_DAY_16_GIFT_BUILDER.md, Risks section.
 *
 * Pricing is intentionally non-linear: bundles are positioned as
 * curated experiences, not bulk-discount tea packs. The Curator's
 * Bundle is the impulse-buy sweet spot ($35), the Connoisseur's
 * Bundle is the perceived "best value" anchor ($75 with French press).
 */

export type BundleSlug = 'discovery' | 'curators' | 'connoisseurs' | 'signature';

export interface Bundle {
  slug:          BundleSlug;
  /** Display name, e.g. "Trio" or "Deluxe". */
  name:          string;
  /** Short two-line included list, rendered on the bundle card. */
  includes:      readonly string[];
  /** Number of paid teas the customer picks in step 2. */
  teaCount:      number;
  /** Number of free samples on top of the paid teas. */
  sampleCount:   number;
  /** Whether a French press is included. */
  hasFrenchPress: boolean;
  /** Bundle price in CAD, before tax/shipping. */
  price:         number;
  /** Optional marketing badge. */
  badge?:        'Most Popular' | 'Best Value';
  /** One-liner used as the card subheadline / tooltip. */
  tagline:       string;
}

export const BUNDLES: readonly Bundle[] = [
  {
    slug:          'discovery',
    // Day 16 v2: bundle names dropped to single words for readability.
    // Context — page heading, modal title, URL — already establishes
    // these are bundles, so the suffix was just visual noise.
    name:          'Taster',
    includes:      ['1 tea', '1 free sample'],
    teaCount:      1,
    sampleCount:   1,
    hasFrenchPress: false,
    price:         15,
    tagline:       'A single curated tea — perfect for a first taste.',
  },
  {
    slug:          'curators',
    name:          'Trio',
    includes:      ['3 teas', '2 free samples'],
    teaCount:      3,
    sampleCount:   2,
    hasFrenchPress: false,
    price:         35,
    badge:         'Most Popular',
    tagline:       'Three teas, hand-picked. Our most-gifted bundle.',
  },
  {
    slug:          'connoisseurs',
    name:          'Deluxe',
    includes:      ['5 teas', '3 free samples', 'French press'],
    teaCount:      5,
    sampleCount:   3,
    hasFrenchPress: true,
    price:         75,
    badge:         'Best Value',
    tagline:       'Five teas, three samples, and a French press.',
  },
  {
    slug:          'signature',
    name:          'Grand',
    includes:      ['7 teas', '5 free samples', 'French press'],
    teaCount:      7,
    sampleCount:   5,
    hasFrenchPress: true,
    price:         99,
    tagline:       'The full experience. Seven teas, five samples, French press.',
  },
] as const;

export function findBundle(slug: BundleSlug): Bundle {
  const b = BUNDLES.find(b => b.slug === slug);
  // Defensive: BundleSlug is a closed union, so this should be unreachable.
  // If it fires, it means the type was widened upstream — fix the call site.
  if (!b) throw new Error(`Unknown bundle slug: ${slug}`);
  return b;
}

// ── Occasion catalog ─────────────────────────────────────────────────────────
// Used by Step 3's icon picker. The user can also pick "Other" and type a
// custom string (capped at 30 chars). Removed Hanukkah and Eid per
// merchant request; historical orders that referenced those IDs are
// strings in Firestore and degrade gracefully to "—" in Step6Review's
// occasionMeta?.label ?? '—' guard.
export const OCCASIONS = [
  { id: 'birthday',     icon: '🎂', label: 'Birthday' },
  { id: 'christmas',    icon: '🎄', label: 'Christmas' },
  { id: 'new-year',     icon: '🎊', label: 'New Year' },
  { id: 'new-baby',     icon: '👶', label: 'New Baby' },
  { id: 'mothers-day',  icon: '💐', label: "Mother's Day" },
  { id: 'fathers-day',  icon: '💕', label: "Father's Day" },
  { id: 'anniversary',  icon: '💍', label: 'Anniversary' },
  { id: 'graduation',   icon: '🎓', label: 'Graduation' },
  { id: 'thank-you',    icon: '💼', label: 'Thank You' },
  { id: 'just-because', icon: '🤝', label: 'Just Because' },
  { id: 'other',        icon: '✏️', label: 'Other' },
] as const;

export type OccasionId = typeof OCCASIONS[number]['id'];
