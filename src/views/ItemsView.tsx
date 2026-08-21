import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Tag, Boxes, PackagePlus, Plus } from 'lucide-react';
import { PageHeader, ErrorBanner, Button, ConfirmModal } from '@/components/ui';
import { useToast } from '@/components/Toast';
import {
  fetchItems,
  fetchComponentStockSummary,
  fetchSuppliers,
  fetchBatches,
  fetchUsedBatchIds,
  fetchCaps,
  fetchAtomizers,
  fetchBoxes,
} from '@/lib/queries';
import { supabase, type Item, type ComponentStockSummary, type Supplier, type BatchWithRelations } from '@/lib/supabase';
import type { View } from '@/lib/types';
import type { NavigationContext } from '@/components/AppShell';
import { getErrorMessage } from '@/lib/utils';

// Subcomponents
import { ItemCatalogueTab } from './items/ItemCatalogueTab';
import { InwardBatchesTab } from './items/InwardBatchesTab';
import { InwardStockModal } from './items/InwardStockModal';
import { AddItemModal } from './items/AddItemModal';
import { EditItemModal } from './items/EditItemModal';
import { ItemAuditModal } from './items/ItemAuditModal';
import type { CategoryAggregates } from './items/types';

export type ItemsViewProps = {
  initialItemId?: string;
  initialBatchId?: string;
  initialOpenInwardModal?: boolean;
  initialActiveTab?: 'catalogue' | 'batches';
  onViewChange?: (view: View, context?: NavigationContext) => void;
};

export function ItemsView({
  initialItemId,
  initialBatchId,
  initialOpenInwardModal,
  initialActiveTab,
  onViewChange,
}: ItemsViewProps = {}) {
  // Navigation Tabs State: 'catalogue' (SKU Master) vs 'batches' (Inward Batches Ledger)
  const [activeTab, setActiveTab] = useState<'catalogue' | 'batches'>(initialActiveTab || 'catalogue');

  // Core Data
  const [items, setItems] = useState<Item[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [batches, setBatches] = useState<BatchWithRelations[]>([]);
  const [usedBatchIds, setUsedBatchIds] = useState<Set<string>>(new Set());
  const [stockSummaryMap, setStockSummaryMap] = useState<Map<string, ComponentStockSummary>>(new Map());
  const [caps, setCaps] = useState<Item[]>([]);
  const [atomizers, setAtomizers] = useState<Item[]>([]);
  const [boxes, setBoxes] = useState<Item[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState(initialBatchId || '');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [deleteModalItem, setDeleteModalItem] = useState<{ id: string; name: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);

  const [showInwardModal, setShowInwardModal] = useState(Boolean(initialOpenInwardModal));
  const [preselectedInwardItemId, setPreselectedInwardItemId] = useState(initialItemId || '');
  const [deleteModalBatch, setDeleteModalBatch] = useState<BatchWithRelations | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);

  const [inspectedItemSummary, setInspectedItemSummary] = useState<ComponentStockSummary | null>(null);
  const lastHandledItemIdRef = useRef<string | null>(null);

  const toast = useToast();

  const load = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const [itms, summary, supps, b, used, c, a, bx] = await Promise.all([
        fetchItems(),
        fetchComponentStockSummary().catch(() => [] as ComponentStockSummary[]),
        fetchSuppliers().catch(() => [] as Supplier[]),
        fetchBatches().catch(() => [] as BatchWithRelations[]),
        fetchUsedBatchIds().catch(() => new Set<string>()),
        fetchCaps().catch(() => [] as Item[]),
        fetchAtomizers().catch(() => [] as Item[]),
        fetchBoxes().catch(() => [] as Item[]),
      ]);

      setItems(itms);
      setSuppliers(supps);
      setBatches(b);
      setUsedBatchIds(used);
      setCaps(c);
      setAtomizers(a);
      setBoxes(bx);

      const sMap = new Map<string, ComponentStockSummary>();
      for (const s of summary) sMap.set(s.item.id, s);
      setStockSummaryMap(sMap);

      if (initialItemId && lastHandledItemIdRef.current !== initialItemId && sMap.has(initialItemId)) {
        lastHandledItemIdRef.current = initialItemId;
        setInspectedItemSummary(sMap.get(initialItemId) || null);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load stock catalogue and batches'));
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [initialItemId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (initialActiveTab) {
      setActiveTab(initialActiveTab);
    }
  }, [initialActiveTab]);

  useEffect(() => {
    if (initialOpenInwardModal) {
      setShowInwardModal(true);
      if (initialItemId) setPreselectedInwardItemId(initialItemId);
    }
  }, [initialOpenInwardModal, initialItemId]);

  // Realtime multi-user live sync
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const debouncedReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        load(true);
      }, 300);
    };

    const channel = supabase
      .channel('items-and-batches-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inward_batches' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_stock_receipts' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_movements' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, debouncedReload)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const openInwardStockModal = (item?: Item) => {
    setPreselectedInwardItemId(item ? item.id : '');
    setShowInwardModal(true);
  };

  // Delete Item SKU handler
  const executeDeleteItem = async () => {
    if (!deleteModalItem) return;
    setDeletingItem(true);
    try {
      const { error: deleteErr } = await supabase.from('items').delete().eq('id', deleteModalItem.id);
      if (deleteErr) throw deleteErr;
      toast.success(`Item "${deleteModalItem.name}" deleted.`, 'Item Removed');
      setDeleteModalItem(null);
      await load(true);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to delete item');
      toast.error(msg, 'Delete Blocked');
    } finally {
      setDeletingItem(false);
    }
  };

  // Delete Inward Batch handler
  const executeDeleteBatch = async () => {
    if (!deleteModalBatch) return;
    setDeletingBatch(true);
    try {
      if (deleteModalBatch.image_url) {
        try {
          const u = new URL(deleteModalBatch.image_url);
          const parts = u.pathname.split('batch-images/');
          if (parts[1]) {
            await supabase.storage.from('batch-images').remove([decodeURIComponent(parts[1])]).catch(() => {});
          }
        } catch {
          // ignore
        }
      }

      const { error: deleteErr } = await supabase.from('inward_batches').delete().eq('id', deleteModalBatch.id);
      if (deleteErr) throw deleteErr;

      toast.success(`Batch "${deleteModalBatch.batch_no}" deleted successfully.`, 'Batch Removed');
      setDeleteModalBatch(null);
      await load(true);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to delete batch');
      toast.error(msg, 'Delete Blocked');
    } finally {
      setDeletingBatch(false);
    }
  };

  // Calculate category aggregates from live stock summary
  const categoryAggregates: CategoryAggregates = useMemo(() => {
    return (items ?? []).reduce((acc, item) => {
      const cat = item.category || 'Bottle';
      const sum = stockSummaryMap.get(item.id);
      if (!acc[cat]) {
        acc[cat] = { skuCount: 0, available: 0, inwarded: 0, inFactory: 0, dispatched: 0, scrapped: 0, used: 0 };
      }
      acc[cat].skuCount += 1;
      if (sum) {
        acc[cat].available += sum.availableStock;
        acc[cat].inwarded += sum.totalInwarded;
        acc[cat].inFactory += sum.totalInFactoryAssembled;
        acc[cat].dispatched += sum.totalDispatchedInOrders;
        acc[cat].scrapped += sum.totalScrapped;
        acc[cat].used += sum.totalUsedInBatches;
      }
      return acc;
    }, {} as CategoryAggregates);
  }, [items, stockSummaryMap]);

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <PageHeader
        title="Items & Stock Management"
        subtitle="Manage master catalogue SKUs, receive stock batches with brand name tagging, and launch batches directly into the production pipeline."
        action={
          <Button
            variant="primary"
            onClick={() => openInwardStockModal()}
            className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm py-2 px-4 rounded-xl flex items-center gap-2 text-xs cursor-pointer"
          >
            <PackagePlus className="h-4 w-4 text-emerald-100" />
            <span>Inward Stock & Batch</span>
          </Button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {/* SUB-TABS NAVIGATION: CATALOGUE VS INWARD BATCHES */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-2 rounded-t-2xl shadow-2xs">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('catalogue')}
            className={`flex items-center gap-2 py-3.5 px-4 text-xs font-black border-b-2 transition-all cursor-pointer ${
              activeTab === 'catalogue'
                ? 'border-indigo-600 text-indigo-900 bg-indigo-50/40 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Tag className="h-4 w-4 text-indigo-600" />
            <span>Master Catalogue & Stock Balances</span>
            <span className="bg-indigo-100 text-indigo-900 text-[10px] font-black px-2 py-0.5 rounded-full">
              {items?.length || 0} SKUs
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('batches')}
            className={`flex items-center gap-2 py-3.5 px-4 text-xs font-black border-b-2 transition-all cursor-pointer ${
              activeTab === 'batches'
                ? 'border-emerald-600 text-emerald-950 bg-emerald-50/40 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Boxes className="h-4 w-4 text-emerald-600" />
            <span>Inward Batches & Receipts Ledger</span>
            <span className="bg-emerald-100 text-emerald-900 text-[10px] font-black px-2 py-0.5 rounded-full">
              {batches?.length || 0} Batches
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: MASTER CATALOGUE & STOCK BALANCES */}
      {activeTab === 'catalogue' && (
        <ItemCatalogueTab
          items={items ?? []}
          stockSummaryMap={stockSummaryMap}
          categoryAggregates={categoryAggregates}
          selectedCategoryFilter={selectedCategoryFilter}
          onSelectCategoryFilter={setSelectedCategoryFilter}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          loading={loading}
          onOpenAddModal={() => setShowAddModal(true)}
          onOpenEditModal={(item) => setEditingItem(item)}
          onOpenDeleteModal={(item) => setDeleteModalItem(item)}
          onOpenAuditModal={(summary) => setInspectedItemSummary(summary)}
        />
      )}

      {/* TAB 2: INWARD BATCHES & RECEIPTS LEDGER */}
      {activeTab === 'batches' && (
        <InwardBatchesTab
          batches={batches}
          usedBatchIds={usedBatchIds}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          loading={loading}
          onOpenInwardModal={() => openInwardStockModal()}
          onOpenDeleteBatchModal={(batch) => setDeleteModalBatch(batch)}
          onViewChange={onViewChange}
        />
      )}

      {/* MODAL 1: UNIFIED INWARD STOCK & BATCH MODAL */}
      {showInwardModal && (
        <InwardStockModal
          isOpen={showInwardModal}
          onClose={() => {
            setShowInwardModal(false);
            setPreselectedInwardItemId('');
          }}
          items={items ?? []}
          suppliers={suppliers}
          caps={caps}
          atomizers={atomizers}
          boxes={boxes}
          stockSummaryMap={stockSummaryMap}
          preselectedItemId={preselectedInwardItemId}
          onBatchCreated={() => load(true)}
          onSupplierCreated={(newSupp) => {
            setSuppliers((prev) => [...prev, newSupp].sort((a, b) => a.name.localeCompare(b.name)));
          }}
          onItemCreated={(newItem) => {
            if (newItem) {
              setItems((prev) => (prev ? [newItem, ...prev] : [newItem]));
            }
            load(true);
          }}
        />
      )}

      {/* MODAL 2: ADD NEW SKU MODAL */}
      {showAddModal && (
        <AddItemModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onItemCreated={(newItem) => {
            if (newItem) {
              setItems((prev) => (prev ? [newItem, ...prev] : [newItem]));
            }
            load(true);
          }}
          existingItems={items ?? []}
        />
      )}

      {/* MODAL 3: EDIT ITEM SKU MODAL */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onItemUpdated={() => load(true)}
        />
      )}

      {/* MODAL 4: 360° ITEM AUDIT DRILLDOWN */}
      {inspectedItemSummary && (
        <ItemAuditModal
          summary={inspectedItemSummary}
          onClose={() => setInspectedItemSummary(null)}
        />
      )}

      {/* MODAL 5: CONFIRM DELETE ITEM */}
      {deleteModalItem && (
        <ConfirmModal
          isOpen={Boolean(deleteModalItem)}
          onClose={() => setDeleteModalItem(null)}
          onConfirm={executeDeleteItem}
          title="Delete Component SKU"
          message={`Are you sure you want to delete SKU "${deleteModalItem.name}"? If this item is linked to inward batches or movements, the database will block deletion.`}
          confirmText="Delete SKU"
          loading={deletingItem}
          variant="danger"
        />
      )}

      {/* MODAL 6: CONFIRM DELETE INWARD BATCH */}
      {deleteModalBatch && (
        <ConfirmModal
          isOpen={Boolean(deleteModalBatch)}
          onClose={() => setDeleteModalBatch(null)}
          onConfirm={executeDeleteBatch}
          title="Delete Inward Batch"
          message={`Are you sure you want to delete Batch "${deleteModalBatch.batch_no}" (${deleteModalBatch.item?.name})? Batches with existing stage movements cannot be deleted.`}
          confirmText="Delete Batch"
          loading={deletingBatch}
          variant="danger"
        />
      )}
    </div>
  );
}
