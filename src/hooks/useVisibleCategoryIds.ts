/**
 * useVisibleCategoryIds — which tea categories the storefront shows.
 *
 * Categories flagged `hideUntilStocked` in src/data/categories.ts (new
 * lines such as Tea Powders) appear only once they contain at least one
 * active product, so customers never land on an empty category. The
 * original categories always show. While the counts load — or if they
 * can't be read — flagged categories stay hidden (fail closed).
 */
import { useQuery } from '@tanstack/react-query';
import { categories } from '@/data/categories';
import { fetchActiveCategoryIds, queryKeys } from '@/lib/firebaseQueries';
import { resolveVisibleCategoryIds } from '@/lib/categoryVisibility';

const GATED = categories.filter((c) => 'hideUntilStocked' in c && c.hideUntilStocked).map((c) => c.id as string);

export function useVisibleCategoryIds(): Set<string> {
  const { data } = useQuery({
    queryKey: queryKeys.activeCategories(),
    queryFn: () => fetchActiveCategoryIds(GATED),
    enabled: GATED.length > 0,
    staleTime: 10 * 60 * 1000,
  });
  return resolveVisibleCategoryIds(categories.map((c) => c.id as string), GATED, data);
}
