import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Download, Printer, RefreshCw, Zap, Package, LayoutDashboard, Layers, ArrowLeftRight, Truck, MapPin, PackageCheck, Filter
} from 'lucide-react';
import {
  Button, ErrorBanner, SearchInput, CardSkeleton, TableSkeleton, Modal
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import { DeliveryChallanModal } from '@/components/DeliveryChallanModal';
import {
  fetchStages,
  fetchBatches,
  fetchMovements,
  fetchDispatches,
  fetchLocationStock,
  fetchSuppliers,
  fetchItems,
  fetchComponentStockSummary,
} from '@/lib/queries';
import type {
  Stage,
  BatchWithRelations,
  MovementWithRelations,
  Dispatch,
  Supplier,
  Item,
  ComponentStockSummary,
} from '@/lib/supabase';
import { supabase, ITEM_CATEGORIES, COMMON_COLORS } from '@/lib/supabase';
import type { LocationStock, View } from '@/lib/types';
import {
  formatDate,
  getErrorMessage,
  downloadCSV,
} from '@/lib/utils';

// Modular Dashboard Subcomponents & Engine
import type { DashboardTab, KpiFilter, DynamicContextType, DynamicContext, InspectedBatchItem } from './dashboard/types';
import { calculateDashboardMetrics } from './dashboard/dashboardCalculations';
import { DashboardKPIs } from './dashboard/DashboardKPIs';
import { BatchMatrixTab } from './dashboard/BatchMatrixTab';
import { StagesTab } from './dashboard/StagesTab';
import { TransitionsTab } from './dashboard/TransitionsTab';
import { DispatchesTab } from './dashboard/DispatchesTab';
import { LocationsTab } from './dashboard/LocationsTab';
import { ComponentsTab } from './dashboard/ComponentsTab';
import { QuickActionModal } from './dashboard/QuickActionModal';
import { ReversalModal } from './dashboard/ReversalModal';
import { MilestoneDrilldownModal } from './dashboard/MilestoneDrilldownModal';
import { ComponentDrilldownModal } from './dashboard/ComponentDrilldownModal';
import { BatchInspectionModal } from './dashboard/BatchInspectionModal';

export type DashboardViewProps = {
  onViewChange: (view: View) => void;
};

export function DashboardView({ onViewChange }: DashboardViewProps) {
  const { success, error: toastError } = useToast();

  // Raw Database Entity State
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [batches, setBatches] = useState<BatchWithRelations[] | null>(null);
  const [movements, setMovements] = useState<MovementWithRelations[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [locations, setLocations] = useState<LocationStock[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [componentStocks, setComponentStocks] = useState<ComponentStockSummary[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab & Filter State
  const [activeTab, setActiveTab] = useState<DashboardTab>('batch-matrix');
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('ALL');
  const [selectedColor, setSelectedColor] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStageId, setSelectedStageId] = useState<string | 'ALL'>('ALL');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | 'ALL'>('ALL');
  const [selectedItemId, setSelectedItemId] = useState<string | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Expandable Accordions
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());
  const [expandedComponentIds, setExpandedComponentIds] = useState<Set<string>>(new Set());

  // Modal Dialog States
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [quickBatchId, setQuickBatchId] = useState('');
  const [quickModalTab, setQuickModalTab] = useState<'move' | 'scrap' | 'dispatch'>('move');

  const [dynamicContext, setDynamicContext] = useState<DynamicContext | null>(null);
  const [inspectedBatchItem, setInspectedBatchItem] = useState<InspectedBatchItem | null>(null);
  const [selectedComponentForDrilldown, setSelectedComponentForDrilldown] = useState<ComponentStockSummary | null>(null);
  const [zoomImageUrl, setZoomImageUrl] = useState<{ url: string; title: string; batchNo: string } | null>(null);

  const [reversalModalOpen, setReversalModalOpen] = useState(false);
  const [reversalTarget, setReversalTarget] = useState<(MovementWithRelations & { batch?: BatchWithRelations; batchNo?: string; itemName?: string; supplierName?: string }) | null>(null);

  const [challanModalOpen, setChallanModalOpen] = useState(false);
  const [challanDispatch, setChallanDispatch] = useState<(Dispatch & { batch?: BatchWithRelations; batchNo?: string; itemName?: string; supplierName?: string }) | null>(null);

  // Load Data
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [
        stagesData,
        batchesData,
        movementsData,
        dispatchesData,
        locationsData,
        suppliersData,
        itemsData,
        componentStocksData,
      ] = await Promise.all([
        fetchStages(),
        fetchBatches(),
        fetchMovements(),
        fetchDispatches(),
        fetchLocationStock(),
        fetchSuppliers(),
        fetchItems(),
        fetchComponentStockSummary(),
      ]);

      setStages(stagesData);
      setBatches(batchesData);
      setMovements(movementsData as MovementWithRelations[]);
      setDispatches(dispatchesData);
      setLocations(locationsData);
      setSuppliers(suppliersData);
      setItems(itemsData);
      setComponentStocks(componentStocksData);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to load factory dashboard records');
      setError(msg);
      toastError(msg, 'Data sync failed');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime live syncing across multi-user terminals
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const debouncedReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        loadData();
      }, 300);
    };

    const channel = supabase
      .channel('dashboard-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inward_batches' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_movements' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_stock_receipts' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, debouncedReload)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Pure Calculation Engine
  const calculations = useMemo(() => {
    return calculateDashboardMetrics({
      stages,
      batches,
      movements,
      dispatches,
      componentStocks,
    });
  }, [stages, batches, movements, dispatches, componentStocks]);

  // Derived Component Catalog Lists
  const caps = useMemo(
    () => items.filter((i) => (i.category || '').toLowerCase().includes('cap') || (i.category || '').toLowerCase().includes('closure')),
    [items]
  );
  const atomizers = useMemo(
    () => items.filter((i) => (i.category || '').toLowerCase().includes('atomizer') || (i.category || '').toLowerCase().includes('pump') || (i.category || '').toLowerCase().includes('spray')),
    [items]
  );
  const boxes = useMemo(
    () => items.filter((i) => (i.category || '').toLowerCase().includes('pack') || (i.category || '').toLowerCase().includes('box') || (i.category || '').toLowerCase().includes('carton')),
    [items]
  );

  // Open Quick Modal Helper
  const openQuickModal = (batchId?: string, defaultTab: 'move' | 'scrap' | 'dispatch' = 'move') => {
    setQuickModalTab(defaultTab);
    const targetBatchId = batchId || (batches && batches.length > 0 ? batches[0].id : '');
    setQuickBatchId(targetBatchId);
    setQuickModalOpen(true);
  };

  // Open Milestone Drilldown Context Helper
  const openMilestoneContext = (
    key: DynamicContextType,
    title: string,
    subtitle: string,
    badgeLabel: string,
    color: 'slate' | 'amber' | 'sky' | 'violet' | 'emerald' | 'rose',
    stageId?: string
  ) => {
    setDynamicContext({ key, title, subtitle, badgeLabel, color, stageId });
  };

  // Row Accordion Helpers
  const toggleRowAccordion = (batchId: string) => {
    setExpandedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const toggleComponentAccordion = (itemId: string) => {
    setExpandedComponentIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const expandAllRows = () => {
    if (!batches) return;
    if (expandedBatchIds.size === batches.length) {
      setExpandedBatchIds(new Set());
    } else {
      setExpandedBatchIds(new Set(batches.map((b) => b.id)));
    }
  };

  // Export CSV Handler (RFC 4180 & Blob-based)
  const exportToCSV = () => {
    if (!calculations) return;
    try {
      const headers = [
        'Batch No',
        'Item',
        'Supplier',
        'Location',
        'Received On',
        'Age (Days)',
        'Inward Total',
        ...calculations.processStages.map((s) => s.name),
        'Dispatched',
        'Factory Balance',
      ];
      const rows = calculations.batchMatrix.map((bm) => [
        bm.batch.batch_no,
        bm.batch.item?.name ?? '',
        bm.batch.supplier?.name ?? '',
        bm.batch.location,
        bm.batch.received_on,
        bm.ageInDays,
        bm.batch.qty_received,
        ...calculations.processStages.map((s) => bm.stageQuantities[s.id] ?? 0),
        bm.dispatchedQty,
        bm.inFactoryQty,
      ]);

      const filename = `factory_inventory_report_${formatDate(new Date().toISOString()).replace(/\s+/g, '_')}`;
      downloadCSV(filename, headers, rows);
      success('CSV report downloaded successfully', 'Export complete');
    } catch (err) {
      toastError(getErrorMessage(err), 'Export failed');
    }
  };

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  // Filter Pipeline Computations
  const q = searchQuery.toLowerCase().trim();

  const filteredBatchMatrix = useMemo(() => {
    if (!calculations) return [];
    return calculations.batchMatrix.filter((item) => {
      if (kpiFilter === 'IN_FACTORY' && item.inFactoryQty <= 0) return false;
      if (kpiFilter === 'IN_PRODUCTION' && !item.isInProduction) return false;
      if (kpiFilter === 'READY') {
        const readyStage = stages?.find((s) => s.name === 'Ready');
        if (!readyStage || (item.stageQuantities[readyStage.id] ?? 0) <= 0) return false;
      }
      if (kpiFilter === 'RAW') {
        const rawStage = stages?.find((s) => s.name === 'Raw Stock');
        if (!rawStage || (item.stageQuantities[rawStage.id] ?? 0) <= 0) return false;
      }
      if (kpiFilter === 'DISPATCHED' && item.dispatchedQty <= 0) return false;
      if (kpiFilter === 'STALLED' && !item.isStalled) return false;

      if (selectedColor !== 'ALL' && item.batch.color !== selectedColor) return false;
      if (selectedCategory !== 'ALL' && item.batch.item?.category?.toLowerCase() !== selectedCategory.toLowerCase()) return false;
      if (selectedStageId !== 'ALL' && (item.stageQuantities[selectedStageId] ?? 0) <= 0) return false;
      if (selectedSupplierId !== 'ALL' && item.batch.supplier_id !== selectedSupplierId) return false;
      if (selectedItemId !== 'ALL' && item.batch.item_id !== selectedItemId) return false;

      if (q) {
        const match =
          item.batch.batch_no.toLowerCase().includes(q) ||
          (item.batch.item?.name ?? '').toLowerCase().includes(q) ||
          (item.batch.supplier?.name ?? '').toLowerCase().includes(q) ||
          item.batch.location.toLowerCase().includes(q) ||
          (item.resolvedCapName ?? '').toLowerCase().includes(q) ||
          (item.resolvedAtomizerName ?? '').toLowerCase().includes(q) ||
          (item.resolvedBoxName ?? '').toLowerCase().includes(q) ||
          item.customerNames.some((c) => c.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [calculations, kpiFilter, stages, selectedColor, selectedCategory, selectedStageId, selectedSupplierId, selectedItemId, q]);

  const filteredStageBreakdown = useMemo(() => {
    if (!calculations) return [];
    return calculations.stageBreakdown.map((sb) => {
      const filteredBatches = sb.batches.filter((bItem) => {
        if (selectedColor !== 'ALL' && bItem.batch.color !== selectedColor) return false;
        if (selectedCategory !== 'ALL' && bItem.category.toLowerCase() !== selectedCategory.toLowerCase()) return false;
        if (selectedSupplierId !== 'ALL' && bItem.batch.supplier_id !== selectedSupplierId) return false;
        if (selectedItemId !== 'ALL' && bItem.batch.item_id !== selectedItemId) return false;

        if (q) {
          const match =
            bItem.batch.batch_no.toLowerCase().includes(q) ||
            (bItem.batch.item?.name ?? '').toLowerCase().includes(q) ||
            (bItem.batch.supplier?.name ?? '').toLowerCase().includes(q) ||
            bItem.batch.location.toLowerCase().includes(q) ||
            (bItem.resolvedCapName ?? '').toLowerCase().includes(q) ||
            (bItem.resolvedAtomizerName ?? '').toLowerCase().includes(q) ||
            (bItem.resolvedBoxName ?? '').toLowerCase().includes(q) ||
            bItem.customerNames.some((c) => c.toLowerCase().includes(q));
          if (!match) return false;
        }
        return true;
      });

      const totalStageQty = filteredBatches.reduce((sum, item) => sum + item.qty, 0);
      const bottlesQty = filteredBatches.filter((item) => item.category === 'Bottle').reduce((sum, item) => sum + item.qty, 0);
      const capsQty = filteredBatches.filter((item) => item.category === 'Cap').reduce((sum, item) => sum + item.qty, 0);
      const atomizersQty = filteredBatches.filter((item) => item.category === 'Atomizer').reduce((sum, item) => sum + item.qty, 0);
      const boxesQty = filteredBatches.filter((item) => item.category === 'Packaging').reduce((sum, item) => sum + item.qty, 0);

      return {
        ...sb,
        totalQty: totalStageQty,
        bottlesQty,
        capsQty,
        atomizersQty,
        boxesQty,
        batches: filteredBatches,
      };
    });
  }, [calculations, selectedColor, selectedCategory, selectedSupplierId, selectedItemId, q]);

  const filteredMovements = useMemo(() => {
    if (!calculations) return [];
    return calculations.enrichedMovements.filter((m) => {
      if (!q) return true;
      return (
        m.batchNo.toLowerCase().includes(q) ||
        m.itemName.toLowerCase().includes(q) ||
        m.supplierName.toLowerCase().includes(q) ||
        (m.from_stage?.name ?? '').toLowerCase().includes(q) ||
        (m.to_stage?.name ?? '').toLowerCase().includes(q) ||
        (m.remarks ?? '').toLowerCase().includes(q)
      );
    });
  }, [calculations, q]);

  const filteredDispatches = useMemo(() => {
    if (!calculations) return [];
    return calculations.enrichedDispatches.filter((d) => {
      if (!q) return true;
      return (
        d.customer_name.toLowerCase().includes(q) ||
        d.invoice_no.toLowerCase().includes(q) ||
        d.batchNo.toLowerCase().includes(q) ||
        d.itemName.toLowerCase().includes(q) ||
        d.supplierName.toLowerCase().includes(q) ||
        (d.resolvedCapName ?? '').toLowerCase().includes(q) ||
        (d.resolvedAtomizerName ?? '').toLowerCase().includes(q) ||
        (d.resolvedBoxName ?? '').toLowerCase().includes(q) ||
        (d.resolvedColor ?? '').toLowerCase().includes(q)
      );
    });
  }, [calculations, q]);

  const activeFilterCount =
    (kpiFilter !== 'ALL' ? 1 : 0) +
    (selectedColor !== 'ALL' ? 1 : 0) +
    (selectedCategory !== 'ALL' ? 1 : 0) +
    (selectedStageId !== 'ALL' ? 1 : 0) +
    (selectedSupplierId !== 'ALL' ? 1 : 0) +
    (selectedItemId !== 'ALL' ? 1 : 0) +
    (q ? 1 : 0);

  const resetAllFilters = () => {
    setKpiFilter('ALL');
    setSelectedColor('ALL');
    setSelectedCategory('ALL');
    setSelectedStageId('ALL');
    setSelectedSupplierId('ALL');
    setSelectedItemId('ALL');
    setSearchQuery('');
  };

  // Loading Skeleton State
  if (loading || !stages || !batches || !calculations) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-72 bg-slate-200 rounded-xl animate-pulse" />
        <CardSkeleton count={5} />
        <TableSkeleton rows={8} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Header & Action Bar ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Factory Dashboard
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200 shadow-2xs">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Live Verified Stock
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 max-w-2xl leading-relaxed">
            Live manufacturing overview. Track Bottles, Caps, Atomizers, Packaging, batch movements, factory floor balances, and customer dispatches with 100% accuracy.
          </p>
        </div>

        {/* Global Action Strip */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            title="Download CSV Report"
            className="text-xs font-bold text-slate-700 bg-white shadow-2xs hover:bg-slate-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            title="Print Shift Summary"
            className="text-xs font-bold text-slate-700 bg-white shadow-2xs hover:bg-slate-50 cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            Print
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            title="Refresh live data"
            className="text-xs font-bold text-slate-700 bg-white shadow-2xs hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
            Sync
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => openQuickModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm font-bold text-xs cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5 text-amber-300" />
            Quick Action
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onViewChange('inward')}
            className="text-xs font-bold cursor-pointer"
          >
            <Package className="h-3.5 w-3.5" />
            Inward Entry
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* ─── Executive KPIs, Exception Strip & 4-Pillar Master ─── */}
      <DashboardKPIs
        calculations={calculations}
        kpiFilter={kpiFilter}
        onOpenMilestoneContext={openMilestoneContext}
        onSetActiveTab={setActiveTab}
        activeFilterCount={activeFilterCount}
      />

      {/* ─── Manager View Controls & Multi-Filter Toolbar ─── */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 pb-3">
          {/* Tab Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('batch-matrix')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'batch-matrix'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              All Batches ({batches.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('stages')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'stages'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              By Stage ({calculations.processStages.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('transitions')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'transitions'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Movement History ({movements.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('dispatches')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'dispatches'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Truck className="h-3.5 w-3.5" />
              Customer Shipments ({dispatches.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('locations')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'locations'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              Storage Bays ({locations.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('components')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'components'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <PackageCheck className="h-3.5 w-3.5 text-emerald-400" />
              Parts & Components ({componentStocks.length})
            </button>
          </div>

          {/* Search and Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition focus:border-slate-900 focus:outline-hidden shadow-2xs"
            >
              <option value="ALL">All Colors</option>
              {COMMON_COLORS.map((c: string) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition focus:border-slate-900 focus:outline-hidden shadow-2xs"
            >
              <option value="ALL">All Categories</option>
              {ITEM_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition focus:border-slate-900 focus:outline-hidden shadow-2xs"
            >
              <option value="ALL">All Suppliers ({suppliers.length})</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition focus:border-slate-900 focus:outline-hidden shadow-2xs"
            >
              <option value="ALL">All Items ({items.length})</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  [{i.category || 'Bottle'}] {i.name}
                </option>
              ))}
            </select>

            <div className="w-full sm:w-64">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search batch, item, customer…"
              />
            </div>
          </div>
        </div>

        {/* Active Filter Chips Ribbon */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-slate-100/80 px-3.5 py-2 rounded-xl border border-slate-200 text-xs">
            <span className="font-extrabold text-slate-700 flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-slate-500" /> Active Filters:
            </span>

            {kpiFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-300 px-2 py-0.5 font-bold text-slate-800 shadow-2xs">
                Status: {kpiFilter}
                <button
                  type="button"
                  onClick={() => setKpiFilter('ALL')}
                  className="text-slate-400 hover:text-slate-700 ml-1 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            {selectedCategory !== 'ALL' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-300 px-2 py-0.5 font-bold text-slate-800 shadow-2xs">
                Category: {selectedCategory}
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className="text-slate-400 hover:text-slate-700 ml-1 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            {selectedStageId !== 'ALL' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-300 px-2 py-0.5 font-bold text-slate-800 shadow-2xs">
                Stage: {stages.find((s) => s.id === selectedStageId)?.name}
                <button
                  type="button"
                  onClick={() => setSelectedStageId('ALL')}
                  className="text-slate-400 hover:text-slate-700 ml-1 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            {selectedSupplierId !== 'ALL' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-300 px-2 py-0.5 font-bold text-slate-800 shadow-2xs">
                Supplier: {suppliers.find((s) => s.id === selectedSupplierId)?.name}
                <button
                  type="button"
                  onClick={() => setSelectedSupplierId('ALL')}
                  className="text-slate-400 hover:text-slate-700 ml-1 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            {selectedItemId !== 'ALL' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-300 px-2 py-0.5 font-bold text-slate-800 shadow-2xs">
                Item: {items.find((i) => i.id === selectedItemId)?.name}
                <button
                  type="button"
                  onClick={() => setSelectedItemId('ALL')}
                  className="text-slate-400 hover:text-slate-700 ml-1 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            {q && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-300 px-2 py-0.5 font-bold text-slate-800 shadow-2xs">
                Query: "{q}"
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-slate-400 hover:text-slate-700 ml-1 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={resetAllFilters}
              className="ml-auto text-xs font-black text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
            >
              Clear All ({activeFilterCount})
            </button>
          </div>
        )}
      </div>

      {/* ─── Tab Content Views ─── */}
      {activeTab === 'batch-matrix' && (
        <BatchMatrixTab
          filteredBatchMatrix={filteredBatchMatrix}
          processStages={calculations.processStages}
          selectedStageId={selectedStageId}
          expandedBatchIds={expandedBatchIds}
          onToggleRowAccordion={toggleRowAccordion}
          onExpandAllRows={expandAllRows}
          totalBatchesCount={batches.length}
          activeFilterCount={activeFilterCount}
          onResetAllFilters={resetAllFilters}
          onSetZoomImageUrl={setZoomImageUrl}
          onSetInspectedBatchItem={setInspectedBatchItem}
          onOpenQuickModal={openQuickModal}
        />
      )}

      {activeTab === 'stages' && (
        <StagesTab
          filteredStageBreakdown={filteredStageBreakdown}
          selectedStageId={selectedStageId}
          onSetZoomImageUrl={setZoomImageUrl}
          onSetInspectedBatchItem={setInspectedBatchItem}
          onOpenQuickModal={openQuickModal}
          batchMatrix={calculations.batchMatrix}
        />
      )}

      {activeTab === 'transitions' && (
        <TransitionsTab
          filteredMovements={filteredMovements}
          onOpenReversalModal={(m) => {
            setReversalTarget(m);
            setReversalModalOpen(true);
          }}
        />
      )}

      {activeTab === 'dispatches' && (
        <DispatchesTab
          filteredDispatches={filteredDispatches}
          totalDispatched={calculations.totalDispatched}
          onOpenChallanModal={(d) => {
            setChallanDispatch(d);
            setChallanModalOpen(true);
          }}
        />
      )}

      {activeTab === 'locations' && (
        <LocationsTab
          locations={locations}
          batches={batches}
        />
      )}

      {activeTab === 'components' && (
        <ComponentsTab
          componentStocks={componentStocks}
          filteredDispatches={filteredDispatches}
          expandedComponentIds={expandedComponentIds}
          onToggleComponentAccordion={toggleComponentAccordion}
          onSetSelectedComponentForDrilldown={setSelectedComponentForDrilldown}
          selectedCategory={selectedCategory}
          searchQuery={searchQuery}
          onViewChange={onViewChange}
          movements={movements}
        />
      )}

      {/* ─── Modals ─── */}
      {quickModalOpen && (
        <QuickActionModal
          isOpen={quickModalOpen}
          onClose={() => setQuickModalOpen(false)}
          initialBatchId={quickBatchId}
          initialTab={quickModalTab}
          batches={batches}
          stages={stages}
          caps={caps}
          atomizers={atomizers}
          boxes={boxes}
          calculations={calculations}
          onSuccess={loadData}
        />
      )}

      {reversalModalOpen && reversalTarget && (
        <ReversalModal
          isOpen={reversalModalOpen}
          onClose={() => {
            setReversalModalOpen(false);
            setReversalTarget(null);
          }}
          reversalTarget={reversalTarget}
          calculations={calculations}
          onSuccess={loadData}
        />
      )}

      {dynamicContext && (
        <MilestoneDrilldownModal
          dynamicContext={dynamicContext}
          onClose={() => setDynamicContext(null)}
          calculations={calculations}
          componentStocks={componentStocks}
          onSetInspectedBatchItem={setInspectedBatchItem}
          onSetSelectedComponentForDrilldown={setSelectedComponentForDrilldown}
          onOpenQuickModal={openQuickModal}
        />
      )}

      {selectedComponentForDrilldown && (
        <ComponentDrilldownModal
          selectedComponent={selectedComponentForDrilldown}
          onClose={() => setSelectedComponentForDrilldown(null)}
        />
      )}

      {inspectedBatchItem && (
        <BatchInspectionModal
          inspectedBatchItem={inspectedBatchItem}
          onClose={() => setInspectedBatchItem(null)}
          stages={stages}
          processStages={calculations.processStages}
          onSetZoomImageUrl={setZoomImageUrl}
          onOpenQuickModal={openQuickModal}
          onOpenChallanModal={(d) => {
            setChallanDispatch(d);
            setChallanModalOpen(true);
          }}
        />
      )}

      {zoomImageUrl && (
        <Modal
          isOpen={Boolean(zoomImageUrl)}
          onClose={() => setZoomImageUrl(null)}
          title={`Shipment / Stock Photo — ${zoomImageUrl.batchNo}`}
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-500 font-medium">{zoomImageUrl.title}</p>
            <div className="flex justify-center bg-slate-100 p-2 rounded-2xl border border-slate-200">
              <img
                src={zoomImageUrl.url}
                alt={zoomImageUrl.batchNo}
                className="max-h-[65vh] rounded-xl object-contain shadow-sm"
              />
            </div>
          </div>
        </Modal>
      )}

      {challanModalOpen && challanDispatch && (
        <DeliveryChallanModal
          isOpen={challanModalOpen}
          onClose={() => {
            setChallanModalOpen(false);
            setChallanDispatch(null);
          }}
          dispatch={challanDispatch}
        />
      )}
    </div>
  );
}
