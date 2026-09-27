/**
 * ssrTea.ts — the tea (and its latest reviews) that renderSeo embedded in
 * a server-rendered /tea-profile page as <script id="ele-ssr-tea">.
 *
 * TeaProfilePage shows it straight away, and fetchTea / the reviews
 * listener fall back to it when Firestore can't be read — crawlers fail the
 * App Check challenge, and without this Google saw a "sold out" placeholder
 * with no reviews. Only the tea whose slug matches the page is returned.
 */
export interface SsrReview {
  id: string;
  userName: string;
  rating: number;
  comment?: string;
  /** Epoch ms. */
  createdAt: number;
  verifiedPurchase?: boolean;
}

interface SsrTeaPayload {
  slug: string;
  tea: Record<string, unknown>;
  reviews: SsrReview[];
}

let cached: SsrTeaPayload | null | undefined;

function payload(): SsrTeaPayload | null {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    const el = typeof document === 'undefined' ? null : document.getElementById('ele-ssr-tea');
    if (el?.textContent) cached = JSON.parse(el.textContent) as SsrTeaPayload;
  } catch {
    cached = null;
  }
  return cached;
}

/** Raw tea doc (Firestore shape) for `slug`, if the server embedded it. */
export function ssrTeaDoc(slug: string | undefined): Record<string, unknown> | null {
  const p = payload();
  return p && slug && p.slug === slug ? p.tea : null;
}

/** Latest published reviews for `slug`, if the server embedded them. */
export function ssrReviews(slug: string | undefined): SsrReview[] | null {
  const p = payload();
  return p && slug && p.slug === slug ? p.reviews : null;
}
