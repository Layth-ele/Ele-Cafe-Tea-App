/**
 * AdminInventory.tsx — Admin's inventory dashboard, v2.
 *
 * Multi-category. /admin/inventory is the category menu; each category
 * opens its own page (/admin/inventory/:category) with an "All
 * categories" back button, plus the menu as a sidebar on desktop.
 * Covers tea (level model, /inventory), admin-defined categories
 * (quantity model, /inventory_items) and the cooler log (temperature
 * model, /cooler_temp_logs).
 *
 * Admin-only affordances:
 *   - "+ Add category" button in the category nav → CategoryFormModal
 *   - "+ Add item" button in the item table header (non-tea tabs)
 *   - Edit / Archive row actions per item
 *   - PDF export for the active tab (full report uses the tea level
 *     export; item tabs are not exported in v2 — left as future work)
 *
 * Single subscription per data slice — the active tab determines
 * which hook is mounted. Switching tabs unmounts the old listener
 * cleanly.
 */

import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { InventoryTable } from '@/features/inventory/components/InventoryTable';
import { InventoryItemTable } from '@/features/inventory/components/InventoryItemTable';
import { InventoryCategoryNav } from '@/features/inventory/components/InventoryCategoryNav';
import { CoolerLogPanel } from '@/features/inventory/components/CoolerLogPanel';
import { useInventoryCategoryRoute } from '@/features/inventory/hooks/useInventoryCategoryRoute';
import { useInventoryLowCounts } from '@/features/inventory/hooks/useInventoryLowCounts';
import { useCoolerDueCount } from '@/features/inventory/hooks/useCoolerLog';
import { COOLER_CATEGORY_ID, TEA_CATEGORY_ID } from '@/features/inventory/lib/inventoryNav';
import { CategoryFormModal } from '@/features/inventory/components/CategoryFormModal';
import { ItemFormModal } from '@/features/inventory/components/ItemFormModal';
import { useInventoryList } from '@/features/inventory/hooks/useInventoryList';
import { useInventoryItems, type InventoryItemRowData } from '@/features/inventory/hooks/useInventoryItems';
import { generateInventoryPdf, type ReportKind } from '@/features/inventory/lib/inventoryPdf';
import { archiveInventoryItem, deleteInventoryItem } from '@/features/inventory/services/inventoryItems.service';
import { archiveInventoryCategory, deleteInventoryCategory } from '@/features/inventory/services/inventoryCategories.service';
import type { InventoryCategory } from '@/features/inventory/schemas/inventoryCategory.schema';
import { SeoHead } from '@/app/components/SeoHead';
import { ConfirmModal } from '@/app/components/modals/Modal';
import { ROUTES } from '@/lib/routes';
import { ArrowLeft, FileDown, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { AdminPageHeader } from '@/app/components/admin/AdminPageHeader';
type ItemModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; item: InventoryItemRowData };

/**
 * Delete-confirmation state machine. We model archive AND hard-delete
 * (for both items and categories) through one discriminated union so
 * the ConfirmModal stays a single mount and the in-flight `loading`
 * flag has one home.
 *
 * Phase 15:
 *   - 'item-archive'   = archive (soft-delete) an item
 *   - 'item-delete'    = hard-delete an item
 *   - 'cat-archive'    = archive (soft-delete) a category
 *   - 'cat-delete'     = hard-delete a category (server refuses if it
 *                        has items; admin then re-confirms with cascade)
 *   - 'cat-delete-cascade' = same as above but with cascade flag
 */
type ConfirmState =
  | { kind: 'closed' }
  | { kind: 'item-archive';      item: InventoryItemRowData }
  | { kind: 'item-delete';       item: InventoryItemRowData }
  | { kind: 'cat-archive';       category: InventoryCategory }
  | { kind: 'cat-delete';        category: InventoryCategory; itemCount?: number }
  | { kind: 'cat-delete-cascade'; category: InventoryCategory; itemCount: number };

function AdminInventory() {
  const { currentUser } = useAuth();
  // /admin/inventory/:category — own URL per category (bookmarkable,
  // back button works); bare /admin/inventory opens the last one used.
  const { categories, loading: catsLoading, activeId, activeCategory, hrefFor, go, isMenu, lastOpened } =
    useInventoryCategoryRoute('admin', ROUTES.ADMIN_INVENTORY);

  // Always mount the tea hook (so the tab count badge shows even when
  // a non-tea tab is active). Item hook is mounted with the active
  // category id; when activeId === 'tea' we pass empty string which
  // short-circuits the subscription.
  const teaList = useInventoryList();
  const itemList = useInventoryItems(activeCategory?.model === 'quantity' ? activeId : '');
  const { lowCounts, totals } = useInventoryLowCounts();
  const coolerDue = useCoolerDueCount(categories.some((c) => c.id === COOLER_CATEGORY_ID));

  const [categoryModalOpen, setCategoryModalOpen] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<InventoryCategory | null>(null);
  const [itemModal, setItemModal] = useState<ItemModalState>({ kind: 'closed' });
  const [generating, setGenerating] = useState<ReportKind | null>(null);

  // Phase 15 — delete/archive confirmation flow. Single state-machine so
  // every destructive op routes through one ConfirmModal mount with
  // one in-flight `pending` flag (prevents double-submits).
  const [confirmState, setConfirmState] = useState<ConfirmState>({ kind: 'closed' });
  const [pending, setPending] = useState<boolean>(false);

  const stampName = currentUser?.email ?? 'admin';

  // Nav badges: items needing restock per category (tea by level),
  // and today's cooler checks not yet done.
  const teaLow = teaList.rows.filter((r) => r.status === 'low_stock' || r.status === 'out_of_stock').length;
  const alerts = Object.fromEntries(categories.map((c) => [c.id,
    c.id === TEA_CATEGORY_ID ? { count: teaLow, label: 'low' }
      : c.id === COOLER_CATEGORY_ID ? { count: coolerDue, label: 'due' }
      : { count: lowCounts[c.id] ?? 0, label: 'low' }]));
  const counts = { ...totals, [TEA_CATEGORY_ID]: teaList.rows.length };
  const handleSetActive = go;

  const handleExport = (kind: ReportKind) => {
    if (teaList.loading) {
      toast.info('Still loading inventory — try again in a moment.');
      return;
    }
    if (generating) return;
    setGenerating(kind);
    try {
      const filename = generateInventoryPdf(teaList.rows, kind, currentUser?.email ?? undefined);
      toast.success(`Generated ${filename}`);
    } catch (err) {
      console.error('PDF export failed:', err);
      toast.error('Could not generate the report. Try again.');
    } finally {
      setGenerating(null);
    }
  };

  /**
   * Single dispatcher for the confirm modal's onConfirm. Branches on
   * the confirm-state kind to invoke the right service. Catches the
   * "has items" precondition error on the first delete attempt and
   * upgrades the modal to the cascade-confirm variant so the admin
   * gets to make an informed choice instead of bouncing on an error
   * toast.
   */
  const handleConfirm = async () => {
    if (confirmState.kind === 'closed' || pending) return;
    setPending(true);
    try {
      switch (confirmState.kind) {
        case 'item-archive': {
          await archiveInventoryItem(confirmState.item.id);
          toast.success(`${confirmState.item.name} archived.`);
          setConfirmState({ kind: 'closed' });
          break;
        }
        case 'item-delete': {
          await deleteInventoryItem(confirmState.item.id);
          toast.success(`${confirmState.item.name} permanently deleted.`);
          setConfirmState({ kind: 'closed' });
          break;
        }
        case 'cat-archive': {
          await archiveInventoryCategory(confirmState.category.id);
          toast.success(`${confirmState.category.name} archived.`);
          if (activeId === confirmState.category.id) handleSetActive('');
          setConfirmState({ kind: 'closed' });
          break;
        }
        case 'cat-delete': {
          // Try non-cascade first. If items exist, the server throws
          // `failed-precondition` with the count in the message; we
          // pivot the modal to the cascade-confirm variant rather than
          // toasting an error and losing context.
          try {
            const res = await deleteInventoryCategory(confirmState.category.id, { cascade: false });
            toast.success(
              res.deletedItems > 0
                ? `${confirmState.category.name} and ${res.deletedItems} items deleted.`
                : `${confirmState.category.name} permanently deleted.`
            );
            if (activeId === confirmState.category.id) handleSetActive('');
            setConfirmState({ kind: 'closed' });
          } catch (err) {
            // Parse the server's count from the error message. The
            // server emits "Category has N item(s). Pass cascade=true…"
            // — we extract N to surface in the cascade-confirm copy.
            const msg = err instanceof Error ? err.message : String(err);
            const match = /has (\d+) item/.exec(msg);
            if (match) {
              setConfirmState({
                kind:      'cat-delete-cascade',
                category:  confirmState.category,
                itemCount: parseInt(match[1], 10),
              });
            } else {
              throw err;
            }
          }
          break;
        }
        case 'cat-delete-cascade': {
          const res = await deleteInventoryCategory(confirmState.category.id, { cascade: true });
          toast.success(
            `${confirmState.category.name} and ${res.deletedItems} item${res.deletedItems === 1 ? '' : 's'} permanently deleted.`
          );
          if (activeId === confirmState.category.id) handleSetActive('');
          setConfirmState({ kind: 'closed' });
          break;
        }
      }
    } catch (err) {
      console.error('[AdminInventory] confirm action failed:', err);
      toast.error(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setPending(false);
    }
  };

  // Lookup helpers for the ConfirmModal's dynamic title + message.
  const confirmCopy = (() => {
    switch (confirmState.kind) {
      case 'item-archive':
        return {
          title:   'Archive item?',
          message: `${confirmState.item.name} will be hidden from the inventory dashboard but remains in the audit log. You can re-add it later.`,
          confirmLabel: 'Archive',
        };
      case 'item-delete':
        return {
          title:   'Delete item permanently?',
          message: `${confirmState.item.name} will be removed from Firestore entirely. The audit log entry is preserved. This cannot be undone.`,
          confirmLabel: 'Delete permanently',
        };
      case 'cat-archive':
        return {
          title:   'Archive category?',
          message: `${confirmState.category.name}: items remain accessible to the audit log but the tab disappears. Reversible.`,
          confirmLabel: 'Archive',
        };
      case 'cat-delete':
        return {
          title:   'Delete category permanently?',
          message: `${confirmState.category.name} will be removed from Firestore entirely. If it has items, you'll be prompted to confirm cascade delete. This cannot be undone.`,
          confirmLabel: 'Delete permanently',
        };
      case 'cat-delete-cascade':
        return {
          title:   `Delete category and ${confirmState.itemCount} item${confirmState.itemCount === 1 ? '' : 's'}?`,
          message: `${confirmState.category.name} has ${confirmState.itemCount} item${confirmState.itemCount === 1 ? '' : 's'}. Deleting now will permanently remove the category AND every item inside it. The audit log entries are preserved. This cannot be undone.`,
          confirmLabel: 'Delete everything',
        };
      case 'closed':
      default:
        return { title: '', message: '', confirmLabel: 'Confirm' };
    }
  })();

  return (
    <div className="space-y-6">
      <SeoHead title="Inventory | Ele Café Admin" description="Manage tea levels, categories, and back-of-house items." noIndex />

      <AdminPageHeader
        eyebrow={isMenu ? 'Stock & equipment' : 'Inventory'}
        title={isMenu ? 'Inventory' : activeCategory?.name ?? 'Inventory'}
        description={isMenu ? 'Tea container levels, café supplies and the equipment log. Changes save automatically.' : undefined}
        actions={
          <>
            <Link to={ROUTES.ADMIN_INVENTORY_LOGS} className="btn btn-outline">Audit log</Link>
            {isMenu && (
              <button type="button" className="btn btn-dark" onClick={() => setCategoryModalOpen(true)}>
                <Plus size={16} aria-hidden="true" /> Add category
              </button>
            )}
          </>
        }
      />

      {isMenu ? (
        catsLoading ? <div className="iit-loading" aria-live="polite">Loading…</div>
          : categories.length === 0 ? <div className="iit-empty"><p>No categories yet — add one to get started.</p></div>
          : (
            <InventoryCategoryNav
              variant="menu"
              categories={categories}
              lastOpenedId={lastOpened}
              hrefFor={hrefFor}
              alerts={alerts}
              totals={counts}
              onAddCategory={() => setCategoryModalOpen(true)}
            />
          )
      ) : (
        <div className="inv-layout">
          <InventoryCategoryNav
            variant="sidebar"
            categories={categories}
            activeId={activeId}
            hrefFor={hrefFor}
            alerts={alerts}
            totals={counts}
            onAddCategory={() => setCategoryModalOpen(true)}
          />
          <section className="inv-main">
            <div className="inv-cat-bar">
              <Link to={ROUTES.ADMIN_INVENTORY} className="inv-back">
                <ArrowLeft size={18} aria-hidden="true" /> All categories
              </Link>
            </div>
            {activeCategory && (activeCategory.model === 'level' || !activeCategory.isSystem) && (
              <div className="ai-actions inv-cat-actions">
                {activeCategory?.model === 'level' && (
                  <div className="ai-pdf-group" role="group" aria-label="Export reports">
                    <button type="button" onClick={() => handleExport('full')}
                      disabled={teaList.loading || generating !== null}
                      aria-busy={generating === 'full'} className="ai-pdf-btn">
                      <FileDown size={14} />
                      {generating === 'full' ? 'Generating…' : 'Full report'}
                    </button>
                    <button type="button" onClick={() => handleExport('low_stock')}
                      disabled={teaList.loading || generating !== null}
                      aria-busy={generating === 'low_stock'} className="ai-pdf-btn">
                      <FileDown size={14} />
                      {generating === 'low_stock' ? 'Generating…' : 'Low stock'}
                    </button>
                    <button type="button" onClick={() => handleExport('out_of_stock')}
                      disabled={teaList.loading || generating !== null}
                      aria-busy={generating === 'out_of_stock'} className="ai-pdf-btn">
                      <FileDown size={14} />
                      {generating === 'out_of_stock' ? 'Generating…' : 'Out of stock'}
                    </button>
                  </div>
                )}
                {activeCategory && !activeCategory.isSystem && (
                  <>
                    <button
                      type="button"
                      className="iit-add-btn"
                      onClick={() => setEditingCategory(activeCategory)}
                    >
                      Edit category
                    </button>
                    <button
                      type="button"
                      className="iit-add-btn"
                      onClick={() => setConfirmState({ kind: 'cat-archive', category: activeCategory })}
                      title="Archive — hides the tab but keeps items + audit log readable; reversible"
                    >
                      Archive category
                    </button>
                    <button
                      type="button"
                      className="iit-add-btn iit-add-btn--danger"
                      onClick={() => setConfirmState({ kind: 'cat-delete', category: activeCategory })}
                      title="Delete permanently — removes the category and (with confirmation) every item inside it"
                    >
                      Delete category
                    </button>
                  </>
                )}
              </div>
            )}
            {!activeCategory ? (
              <div className="iit-loading" aria-live="polite">Loading…</div>
            ) : activeCategory.model === 'level' ? (
              <>
                <InventoryTable
                  rows={teaList.rows}
                  loading={teaList.loading}
                  error={teaList.error}
                  updatedBy={stampName}
                  onUpdate={teaList.update}
                />
              </>
            ) : activeCategory.model === 'temperature' ? (
              <>
                <CoolerLogPanel readOnly={false} isAdmin loggedBy={stampName} loggedByUid={currentUser?.uid ?? null} />
              </>
            ) : (
              <InventoryItemTable
                category={activeCategory}
                rows={itemList.rows}
                loading={itemList.loading}
                error={itemList.error}
                updatedBy={stampName}
                onUpdate={itemList.update}
                onAdd={() => setItemModal({ kind: 'create' })}
                onEdit={(item) => setItemModal({ kind: 'edit', item })}
                onArchive={(item) => setConfirmState({ kind: 'item-archive', item })}
                onDelete={(item) => setConfirmState({ kind: 'item-delete', item })}
              />
            )}
          </section>
        </div>
      )}

      {categoryModalOpen && (
        <CategoryFormModal
          mode="create"
          onClose={() => setCategoryModalOpen(false)}
          onSaved={() => toast.success('Category added.')}
        />
      )}

      {editingCategory && (
        <CategoryFormModal
          mode="edit"
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSaved={() => toast.success('Category updated.')}
        />
      )}

      {itemModal.kind !== 'closed' && activeCategory && (
        <ItemFormModal
          mode={itemModal.kind}
          category={activeCategory}
          item={itemModal.kind === 'edit' ? itemModal.item : undefined}
          onClose={() => setItemModal({ kind: 'closed' })}
          onSaved={() => toast.success(itemModal.kind === 'create' ? 'Item added.' : 'Item updated.')}
        />
      )}

      {/* Phase 15 — single ConfirmModal mount for all destructive ops
          (archive/delete on items and categories). The state-machine
          determines the title/message/handler so we never have multiple
          modals stacked. `pending` disables the buttons while the
          callable is in flight. */}
      <ConfirmModal
        open={confirmState.kind !== 'closed'}
        onClose={() => { if (!pending) setConfirmState({ kind: 'closed' }); }}
        onConfirm={() => void handleConfirm()}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmCopy.confirmLabel}
        loading={pending}
        danger
      />
    </div>
  );
}

export default AdminInventory;
