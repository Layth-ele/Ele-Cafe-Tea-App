/**
 * useInventoryCategoryRoute.ts — which inventory page is showing.
 *
 *   /inventory, /admin/inventory           → the category menu
 *   /inventory/:category, /admin/…/:category → that category's own page
 *
 * Old bookmarks with ?category=x redirect to /…/x. An unknown category
 * redirects back to the menu. Each opened category is remembered on this
 * device so the menu can mark it "Last opened".
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useInventoryCategories } from '@/features/inventory/hooks/useInventoryCategories';
import { readLastCategory, writeLastCategory } from '@/features/inventory/lib/inventoryNav';
import type { InventoryCategory } from '@/features/inventory/schemas/inventoryCategory.schema';

export function useInventoryCategoryRoute(surface: 'staff' | 'admin', basePath: string) {
  const { category: urlId } = useParams<{ category?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { categories, loading } = useInventoryCategories();

  const ids = useMemo(() => categories.map((c) => c.id), [categories]);
  const hrefFor = useCallback((id: string) => `${basePath}/${encodeURIComponent(id)}`, [basePath]);
  const legacy = searchParams.get('category');

  useEffect(() => {
    if (loading) return;
    if (!urlId && legacy && ids.includes(legacy)) navigate(hrefFor(legacy), { replace: true });
    else if (urlId && !ids.includes(urlId)) navigate(basePath, { replace: true });
  }, [loading, urlId, legacy, ids, navigate, hrefFor, basePath]);

  const activeCategory: InventoryCategory | undefined = urlId ? categories.find((c) => c.id === urlId) : undefined;
  const activeId = activeCategory?.id ?? '';

  useEffect(() => {
    if (activeId) writeLastCategory(surface, activeId);
  }, [activeId, surface]);

  const go = useCallback((id: string) => navigate(id ? hrefFor(id) : basePath), [navigate, hrefFor, basePath]);

  return {
    categories, loading, activeId, activeCategory, hrefFor, go, basePath,
    /** True on the category menu (no category in the URL). */
    isMenu: !urlId,
    lastOpened: readLastCategory(surface),
  };
}
