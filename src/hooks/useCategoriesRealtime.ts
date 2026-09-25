/**
 * useCategoriesRealtime — live subscription to /categories with sane
 * fallback to the hardcoded TEA_CATEGORIES baseline.
 *
 * Why a live subscription: when admin adds a new category and a tea
 * tagged with that category, customers should see the new category in
 * the filter sidebar without a page refresh.
 *
 * Why fallback to baseline:
 *   - Day 1 deploy: /categories is empty → use baseline → site works normally.
 *   - Admin clears /categories by accident → use baseline → site still works.
 *   - Subscription errors (rules misconfig, network) → use baseline.
 *
 * The hook MERGES Firestore categories with the baseline so the 8
 * default categories never vanish. Firestore can override a baseline
 * entry by using the same id (e.g. write { id: 'green', label: 'Green
 * (Premium)' } to replace the default label).
 *
 * Schema for /categories docs:
 *   id        string   (e.g. 'puerh'). Used in URLs + tea.category.
 *   label     string   (e.g. 'Pu-erh Tea'). Display name.
 *   order?    number   Sort order, lower first. Defaults to 999.
 *   isActive? boolean  Hide a category without deleting. Defaults true.
 *
 * Cost: one subscription per open page. Categories rarely change so
 * snapshot pushes are infrequent. Free-tier-friendly even at scale.
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TEA_CATEGORIES } from '@/lib/routes';
import { categories as CATEGORY_DATA } from '@/data/categories';

/** Shape exposed to consumers. Subset of the Firestore doc — order/isActive
 *  are normalized away. Matches the baseline TEA_CATEGORIES structure so
 *  this can be a drop-in replacement.
 *
 *  Phase-12 schema-fidelity fix: `labelFr` is now surfaced. Pre-fix the
 *  hook dropped labelFr on the way out even though the categorySchema
 *  declared it and admins could write it via the Firestore Console.
 *  Without surfacing, FR-locale customers always saw the English label.
 *  Consumers can render `c.labelFr ?? c.label` (the schema's documented
 *  fallback) once they're updated to read this field. */
export interface TeaCategory {
  id:    string;
  label: string;
  labelFr?: string;
}

/** Mutable copy of the baseline so we can merge into a Map. */
const BASELINE: TeaCategory[] = TEA_CATEGORIES.map(c => ({
  id: c.id, label: c.label, labelFr: CATEGORY_DATA.find(d => d.id === c.id)?.nameFr,
}));

export function useCategoriesRealtime(): TeaCategory[] {
  const [categories, setCategories] = useState<TeaCategory[]>(BASELINE);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onSnapshot(
      collection(db, 'categories'),
      (snap) => {
        if (cancelled) return;
        // Merge: start with baseline, overwrite with Firestore entries
        // by id, drop inactive ones, sort by order then label.
        const merged = new Map<string, TeaCategory & { order: number }>();
        for (const c of BASELINE) merged.set(c.id, { ...c, order: 999 });

        for (const docSnap of snap.docs) {
          // Docs written by the admin/seed use `name` / `nameFr`; older
          // ones may use `label` / `labelFr`. Accept both.
          const d = docSnap.data() as {
            id?: string; label?: string; labelFr?: string; name?: string; nameFr?: string;
            order?: number; isActive?: boolean;
          };
          const id      = d.id ?? docSnap.id;
          // A missing label, or one that's just the id ("black"), falls
          // back to the built-in display name ("Black Tea") so filters
          // read the same as the rest of the site.
          const rawLabel = (d.label ?? d.name)?.trim();
          const label   = rawLabel && rawLabel.toLowerCase() !== String(id).toLowerCase()
            ? rawLabel
            : merged.get(id)?.label ?? (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');
          const frRaw   = d.labelFr ?? d.nameFr;
          // No French in Firestore → keep the built-in French name, but
          // only while the English name is still the built-in one.
          const base    = merged.get(id);
          const labelFr = typeof frRaw === 'string' && frRaw.trim().length > 0
            ? frRaw.trim()
            : base && base.label === label ? base.labelFr : undefined;
          const order   = typeof d.order === 'number' ? d.order : 999;
          // Defensive: drop entries with no id/label
          if (!id || !label) continue;
          // isActive defaults to true — only `false` hides
          if (d.isActive === false) {
            merged.delete(id);
          } else {
            merged.set(id, { id, label, labelFr, order });
          }
        }

        const list = [...merged.values()].sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.label.localeCompare(b.label);
        });
        setCategories(list.map(({ id, label, labelFr }) => ({ id, label, labelFr })));
      },
      (err) => {
        // Subscription error — keep baseline. Log so it's visible in
        // the console but don't surface to users.
        console.warn('[useCategoriesRealtime] subscription error, keeping baseline:', err);
        if (!cancelled) setCategories(BASELINE);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return categories;
}
