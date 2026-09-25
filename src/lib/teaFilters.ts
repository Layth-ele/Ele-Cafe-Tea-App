import type { Product } from '@/types';
import { isProductAvailable } from '@/lib/availability';

/**
 * teaFilters — the tea filter rules shared by ProductsPage and the
 * gift-builder steps.
 *
 * Everything below is derived from the live /teas data, so it follows
 * whatever the admin types — no code change when teas, ingredients or
 * benefits are added or removed:
 *   • Ingredients: each tea's comma-separated `ingredients` is grouped
 *     into one option per ingredient ("Rosehip" + "Rosehip pieces" →
 *     Rosehip). French labels come from the matching `ingredientsFr`.
 *   • Functionality: benefit keywords map onto the groups in
 *     FUNCTION_GROUPS; a group only shows when at least one tea has it.
 *   • Every option shows how many teas it would return (facetCounts).
 */

export const CAFF_LEVELS = ['None', 'Low', 'Medium', 'High'] as const;

type FunctionGroup = { label: string; matchers: RegExp[]; /** ignore descriptions ("heart of Darjeeling") */ benefitsOnly?: boolean };

export const FUNCTION_GROUPS: readonly FunctionGroup[] = [
  { label: 'Relaxation', matchers: [/\brelax/, /\bcalm/, /\bstress relief/, /\bsooth/] },
  { label: 'Sleep',      matchers: [/\bsleep/, /\bbedtime/, /\brest\b/, /\bnight/] },
  { label: 'Energy',     matchers: [/\benerg/, /\bvitamin[- ]?rich/, /\brevital/] },
  { label: 'Focus',      matchers: [/\bfocus/, /\bclarit/, /\bmental/, /\balertness/, /\bconcentrat/] },
  { label: 'Digestion',  matchers: [/\bdigest/, /\bstomach/, /\bgut\b/] },
  { label: 'Immunity',   matchers: [/\bimmun/, /\bdefen[sc]e/] },
  { label: 'Detox',      matchers: [/\bdetox/, /\bcleans/, /\bpurif/] },
  { label: 'Antioxidants',        matchers: [/\bantioxid/], benefitsOnly: true },
  { label: 'Heart health',        matchers: [/\bheart/, /\bcardio/, /\bcholesterol/], benefitsOnly: true },
  { label: 'Weight & metabolism', matchers: [/\bweight/, /\bmetabol/], benefitsOnly: true },
  { label: 'Respiratory',         matchers: [/\brespirat/, /\bbreath/, /\bthroat/], benefitsOnly: true },
  { label: 'Skin',                matchers: [/\bskin/, /\bbeauty/, /\bglow/], benefitsOnly: true },
];
/** Back-compat: the functionality labels. */
export const FUNCTION_LIST = FUNCTION_GROUPS.map((g) => g.label);

function normalizeText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function parseCsv(s?: string | null): string[] {
  return (s ?? '').split(',').map((v) => v.trim()).filter(Boolean);
}

// ── Ingredients ─────────────────────────────────────────────────────────────

const EN_DESCRIPTORS = /\b(pieces?|petals?|leaves|leaf|flowers?|blossoms?|buds?|roots?|peel|bits|granules|slices?|chunks?|and)\b/g;
const EN_ADJECTIVES = /^(american|european|wild|dried|organic|natural|whole|crushed|roasted|popped)\s+/;

/** Canonical grouping key for one ingredient: "Rosehip pieces" → "rosehip",
 *  "Cloves" → "clove", "Sencha green tea" → "green tea". */
export function ingredientKey(raw: string): string {
  let s = normalizeText(raw).replace(/\(.*?\)/g, ' ');
  // Tea bases group together so "Black tea" finds every black-tea blend.
  if (/\bblack tea\b|\bpu-?erh\b/.test(s)) return 'black tea';
  if (/\bgreen tea\b|\bsencha\b|\bmatcha\b|\bgyokuro\b/.test(s)) return 'green tea';
  if (/\boolong\b/.test(s)) return 'oolong tea';
  if (/\bwhite tea\b/.test(s)) return 'white tea';
  if (/\brooibos\b/.test(s)) return 'rooibos';
  s = s.replace(EN_DESCRIPTORS, ' ').replace(/\s+/g, ' ').trim();
  // "popped rice" / "roasted rice" stay distinct from plain rice.
  if (!/^(popped|roasted) rice$/.test(s)) s = s.replace(EN_ADJECTIVES, '');
  s = s.split(' ').map((w) =>
    w.endsWith('berries') ? `${w.slice(0, -3)}y`
    : w.length > 3 && w.endsWith('s') && !/(ss|us|is|'s)$/.test(w) ? w.slice(0, -1)
    : w).join(' ');
  return s || normalizeText(raw).trim();
}

const FR_PREFIX = /^(boutons et petales|morceaux|petales|feuilles|fleurs|boutons|racines?|ecorces?|brisures|bourgeons|graines)\s+(de\s+|d['’]\s*|du\s+|des\s+)/;

function frIngredientLabel(raw: string): string {
  // Strip the form ("morceaux de pomme" → "pomme") but keep accents.
  const plain = normalizeText(raw.trim());
  const m = plain.match(FR_PREFIX);
  const out = m ? raw.trim().slice(m[0].length) : raw.trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Per-product caches — products are immutable snapshots, so a WeakMap
// keyed on the object stays valid until the next Firestore snapshot.
const ingredientCache = new WeakMap<Product, Set<string>>();
const functionCache = new WeakMap<Product, Set<string>>();

export function teaIngredientKeys(p: Product): Set<string> {
  let keys = ingredientCache.get(p);
  if (!keys) {
    keys = new Set(parseCsv(p.ingredients).map(ingredientKey));
    ingredientCache.set(p, keys);
  }
  return keys;
}

export function teaFunctionKeys(p: Product): Set<string> {
  let keys = functionCache.get(p);
  if (!keys) {
    const benefits = normalizeText(p.benefits ?? '');
    const both = `${benefits} ${normalizeText(p.description ?? '')}`;
    keys = new Set(FUNCTION_GROUPS
      .filter((g) => g.matchers.some((re) => re.test(g.benefitsOnly ? benefits : both)))
      .map((g) => g.label));
    functionCache.set(p, keys);
  }
  return keys;
}

// ── Filter state ────────────────────────────────────────────────────────────

export interface FilterOpenSections {
  cats: boolean;
  avail: boolean;
  more: boolean;
  ing: boolean;
  funct: boolean;
}

export const DEFAULT_OPEN_SECTIONS: FilterOpenSections = {
  cats: true,
  avail: true,
  more: true,
  ing: false,
  funct: false,
};

export interface TeaFilterState {
  selectedCats: Set<string>;
  inStock: boolean;
  outOfStock: boolean;
  organicOnly: boolean;
  caffFilter: Set<string>;
  ingredientFilter: Set<string>;
  functFilter: Set<string>;
}

type Setter<T> = (next: T | ((prev: T) => T)) => void;

export interface TeaFilterActions {
  toggleCat: (id: string) => void;
  setSelectedCats: Setter<Set<string>>;
  setInStock: Setter<boolean>;
  setOutOfStock: Setter<boolean>;
  setOrganicOnly: Setter<boolean>;
  setCaffFilter: Setter<Set<string>>;
  setIngredientFilter: Setter<Set<string>>;
  setFunctFilter: Setter<Set<string>>;
  toggleCaff: (v: string) => void;
  toggleIngredient: (v: string) => void;
  toggleFunct: (v: string) => void;
}

function searchBlob(p: Product): string {
  const x = p as Product & Partial<Record<'nameFr' | 'descriptionFr' | 'ingredientsFr' | 'benefitsFr' | 'originFr' | 'regionsFr', string>>;
  return normalizeText([
    p.name, x.nameFr, p.description, x.descriptionFr, p.category, p.ingredients, x.ingredientsFr,
    p.origin, x.originFr, p.regions, x.regionsFr, p.benefits, x.benefitsFr,
  ].filter(Boolean).join(' '));
}

export function matchesTeaFilters(product: Product, f: TeaFilterState, search: string): boolean {
  if (f.selectedCats.size > 0 && !f.selectedCats.has(product.category ?? '')) return false;

  // Asking for in-stock AND out-of-stock (or neither) is no constraint —
  // their intersection would be an empty grid.
  const isAvailable = isProductAvailable(product);
  if (f.inStock && !f.outOfStock && !isAvailable) return false;
  if (f.outOfStock && !f.inStock && isAvailable)  return false;

  if (f.organicOnly && !product.isOrganic) return false;

  if (f.caffFilter.size > 0 && !f.caffFilter.has(product.caffeine ?? 'None')) return false;

  // Ingredients and functionality are AND: every ticked one must be present.
  if (f.ingredientFilter.size > 0) {
    const keys = teaIngredientKeys(product);
    for (const sel of f.ingredientFilter) if (!keys.has(ingredientKey(sel))) return false;
  }

  if (f.functFilter.size > 0) {
    const keys = teaFunctionKeys(product);
    for (const sel of f.functFilter) if (!keys.has(sel)) return false;
  }

  const q = normalizeText(search.trim());
  if (!q) return true;
  const blob = searchBlob(product);
  // Every word must appear somewhere ("green mint" finds mint green teas).
  return q.split(/\s+/).every((w) => blob.includes(w));
}

// ── Vocabulary + counts ─────────────────────────────────────────────────────

export interface FilterOption {
  /** Stored in the filter state / URL. */
  value:    string;
  label:    string;
  labelFr?: string;
  /** Teas in the whole catalog with this option (for ordering). */
  total:    number;
}

export function deriveFilterVocabulary(products: Product[]): { ingredients: FilterOption[]; functions: FilterOption[] } {
  const ing = new Map<string, { total: number; en: Map<string, number>; fr: Map<string, number> }>();
  const fn = new Map<string, number>();

  for (const p of products) {
    const en = parseCsv(p.ingredients);
    const frList = parseCsv((p as Product & { ingredientsFr?: string }).ingredientsFr);
    const aligned = frList.length === en.length;
    const seen = new Set<string>();
    en.forEach((raw, i) => {
      const key = ingredientKey(raw);
      const entry = ing.get(key) ?? { total: 0, en: new Map(), fr: new Map() };
      if (!seen.has(key)) { entry.total++; seen.add(key); }
      // A spelling that is already the plain ingredient ("Clove", "St. John's wort") can be the label as typed.
      if (normalizeText(raw) === key) entry.en.set(raw, (entry.en.get(raw) ?? 0) + 1);
      if (aligned) {
        const frLabel = frIngredientLabel(frList[i]);
        entry.fr.set(frLabel, (entry.fr.get(frLabel) ?? 0) + 1);
      }
      ing.set(key, entry);
    });
    for (const label of teaFunctionKeys(p)) fn.set(label, (fn.get(label) ?? 0) + 1);
  }

  const byPopularity = (a: FilterOption, b: FilterOption) => b.total - a.total || a.label.localeCompare(b.label);
  const ingredients = [...ing.entries()].map(([key, e]): FilterOption => {
    // Most common spelling; ties → the shortest ("Myrtille" over "Myrtilles européennes").
    const pick = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0];
    const fr = pick(e.fr);
    return { value: key, label: capitalize(pick(e.en) ?? key), ...(fr ? { labelFr: fr } : {}), total: e.total };
  }).sort(byPopularity);
  // Groups keep their curated order; only ones some tea has are shown.
  const functions = FUNCTION_GROUPS.filter((g) => fn.has(g.label))
    .map((g): FilterOption => ({ value: g.label, label: g.label, total: fn.get(g.label) ?? 0 }));

  return { ingredients, functions };
}

export interface FacetCounts {
  cats: Map<string, number>;
  caffeine: Map<string, number>;
  organic: number;
  inStock: number;
  outOfStock: number;
  ingredients: Map<string, number>;
  functions: Map<string, number>;
}

/** How many teas each option would show given the other active filters
 *  (standard "faceted" counts). OR-facets (category, caffeine) count as
 *  if only that option were picked; AND-facets (ingredients,
 *  functionality) count with the option added to the current picks. */
export function facetCounts(products: Product[], f: TeaFilterState, search: string): FacetCounts {
  const without = (patch: Partial<TeaFilterState>) => {
    const g = { ...f, ...patch };
    return products.filter((p) => matchesTeaFilters(p, g, search));
  };
  const tally = (list: Product[], keysOf: (p: Product) => Iterable<string>) => {
    const m = new Map<string, number>();
    for (const p of list) for (const k of keysOf(p)) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };

  const baseAvail = without({ inStock: false, outOfStock: false });
  const current = without({});
  return {
    cats:        tally(without({ selectedCats: new Set() }), (p) => [p.category ?? '']),
    caffeine:    tally(without({ caffFilter: new Set() }), (p) => [p.caffeine ?? 'None']),
    organic:     without({ organicOnly: true }).length,
    inStock:     baseAvail.filter(isProductAvailable).length,
    outOfStock:  baseAvail.filter((p) => !isProductAvailable(p)).length,
    // Current AND-picks already applied, so counting keys = "if you also tick this".
    ingredients: tally(current, teaIngredientKeys),
    functions:   tally(current, teaFunctionKeys),
  };
}
