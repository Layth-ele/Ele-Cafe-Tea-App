/**
 * InventoryPage.tsx — Employee inventory dashboard.
 *
 * /inventory is the category menu; /inventory/:category is that
 * category's own page with an "All categories" back button (desktop also
 * keeps the menu as a sidebar). URLs are bookmarkable. Same surface as /admin/inventory minus admin-only actions.
 * The validated session's role drives `readOnly`; firestore.rules
 * enforce the same (see lib/inventorySession.ts).
 */

import { Link, useNavigate } from 'react-router';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useInventoryAccess } from '@/features/inventory/hooks/useInventoryAccess';
import { InventoryTable } from '@/features/inventory/components/InventoryTable';
import { InventoryItemTable } from '@/features/inventory/components/InventoryItemTable';
import { InventoryCategoryNav } from '@/features/inventory/components/InventoryCategoryNav';
import { CoolerLogPanel } from '@/features/inventory/components/CoolerLogPanel';
import { ReadOnlyBanner } from '@/features/inventory/components/ReadOnlyBanner';
import { useInventoryList } from '@/features/inventory/hooks/useInventoryList';
import { useInventoryItems } from '@/features/inventory/hooks/useInventoryItems';
import { useInventoryLowCounts } from '@/features/inventory/hooks/useInventoryLowCounts';
import { useInventoryCategoryRoute } from '@/features/inventory/hooks/useInventoryCategoryRoute';
import { useCoolerDueCount } from '@/features/inventory/hooks/useCoolerLog';
import { inventorySessionUid } from '@/features/inventory/lib/inventorySession';
import { COOLER_CATEGORY_ID, TEA_CATEGORY_ID } from '@/features/inventory/lib/inventoryNav';
import { ROUTES } from '@/lib/routes';

export function InventoryPage() {
  const { employeeName, isReadOnly } = useInventoryAccess();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { categories, loading: catsLoading, activeId, activeCategory, hrefFor, isMenu, lastOpened } =
    useInventoryCategoryRoute('staff', ROUTES.INVENTORY);

  const teaList = useInventoryList();
  const isItems = !!activeCategory && activeCategory.model === 'quantity';
  const itemList = useInventoryItems(isItems ? activeId : '');
  const { lowCounts, totals } = useInventoryLowCounts();
  const coolerDue = useCoolerDueCount(categories.some((c) => c.id === COOLER_CATEGORY_ID));

  const teaLow = teaList.rows.filter((r) => r.status === 'low_stock' || r.status === 'out_of_stock').length;
  const alerts = Object.fromEntries(categories.map((c) => [c.id,
    c.id === TEA_CATEGORY_ID ? { count: teaLow, label: 'low' }
      : c.id === COOLER_CATEGORY_ID ? { count: coolerDue, label: 'due' }
      : { count: lowCounts[c.id] ?? 0, label: 'low' }]));
  const counts = { ...totals, [TEA_CATEGORY_ID]: teaList.rows.length };

  async function handleSignOut() {
    // Go to the login page first so the guard unmounts before the auth
    // change (no access-modal flash). A staff device never lands on the
    // storefront; InventorySessionSync ends the employee session.
    navigate(ROUTES.LOGIN, { replace: true });
    await logout();
  }

  const stampName = employeeName ?? 'unknown-employee';

  return (
    <div className="staff-app">
      {/* Sticky staff bar — the same on every staff page: navigation on
          the left (brand on the menu, "All categories" on a category),
          Sign out on the right. Clears the iPhone status bar. */}
      <header className="sh-bar">
        {isMenu ? (
          <span className="sh-brand">Ele Café <span aria-hidden="true">·</span> Staff</span>
        ) : (
          <Link to={ROUTES.INVENTORY} className="sh-btn">
            <ArrowLeft size={18} aria-hidden="true" />
            <span>All categories</span>
          </Link>
        )}
        <button type="button" onClick={() => void handleSignOut()} className="sh-btn sh-btn--quiet">
          <LogOut size={17} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </header>

    <main className="ip-root ip-root--wide">
      <div className="sh-hero">
        <h1 className="sh-title">{isMenu ? 'Inventory' : activeCategory?.name ?? 'Inventory'}</h1>
        <p className="sh-sub">
          Hi {employeeName ?? 'there'} 👋 — {isReadOnly
            ? 'this is a view-only session.'
            : activeCategory?.model === 'temperature'
              ? 'log today’s cooler and dishwasher checks.'
              : 'update levels and quantities as you refill.'}
        </p>
      </div>

      {isReadOnly && <ReadOnlyBanner />}

      {isMenu ? (
        catsLoading ? <div className="iit-loading">Loading…</div>
          : categories.length === 0 ? <div className="iit-empty"><p>No inventory categories yet.</p></div>
          : <InventoryCategoryNav variant="menu" categories={categories} lastOpenedId={lastOpened} hrefFor={hrefFor} alerts={alerts} totals={counts} />
      ) : (
        <div className="inv-layout">
          <InventoryCategoryNav variant="sidebar" categories={categories} activeId={activeId} hrefFor={hrefFor} alerts={alerts} totals={counts} />
          <section className="inv-main">
            {!activeCategory ? (
              <div className="iit-loading">Loading…</div>
            ) : activeCategory.model === 'level' ? (
              <>
                <InventoryTable
                  rows={teaList.rows}
                  loading={teaList.loading}
                  error={teaList.error}
                  updatedBy={stampName}
                  onUpdate={teaList.update}
                  readOnly={isReadOnly}
                />
              </>
            ) : activeCategory.model === 'temperature' ? (
              <>
                <CoolerLogPanel readOnly={isReadOnly} isAdmin={false} loggedBy={stampName} loggedByUid={inventorySessionUid()} />
              </>
            ) : (
              <InventoryItemTable
                showTitle={false}
                category={activeCategory}
                rows={itemList.rows}
                loading={itemList.loading}
                error={itemList.error}
                updatedBy={stampName}
                onUpdate={itemList.update}
                readOnly={isReadOnly}
              />
            )}
          </section>
        </div>
      )}
    </main>
    </div>
  );
}

export default InventoryPage;
