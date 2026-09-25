import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ShieldCheck, Download, Printer, RefreshCw, Zap, Package, LayoutDashboard, Layers, ArrowLeftRight, Truck, MapPin, PackageCheck, Filter, Clock, RotateCcw, Calendar, ClipboardList, Users
} from 'lucide-react';
import {
  Button, ErrorBanner, SearchInput, CardSkeleton, TableSkeleton, Modal
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import { DeliveryChallanModal } from '@/components/DeliveryChallanModal';
import type {
  BatchWithRelations,
  MovementWithRelations,
  Dispatch,
  ComponentStockSummary,
} from '@/lib/supabase';
import { ITEM_CATEGORIES, COMMON_COLORS } from '@/lib/supabase';
import type { View } from '@/lib/types';
import {
  formatDate,
  getErrorMessage,
  downloadCSV,
  getTodayDateString,
} from '@/lib/utils';

// Modular Dashboard Subcomponents & Engine
import type { DynamicContext, DynamicContextType, InspectedBatchItem } from './dashboard/types';
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
import { AllocateModal } from './items/AllocateModal';
import type { NavigationContext } from '@/components/AppShell';
import { useDashboardData } from './dashboard/useDashboardData';
import { useDashboardFilters } from './dashboard/useDashboardFilters';
import { useAuth } from '@/lib/auth';

export type DashboardViewProps = {
  onViewChange: (view: View, context?: NavigationContext) => void;
  initialInspectBatch?: BatchWithRelations | null;
  initialChallanDispatch?: (Dispatch & { batch?: BatchWithRelations; batchNo?: string; itemName?: string; supplierName?: string }) | Dispatch | null;
  initialBatchId?: string;
};

export function DashboardView({
  onViewChange,
  initialInspectBatch,
  initialChallanDispatch,
  initialBatchId,
}: DashboardViewProps) {
  const { success, error: toastError } = useToast();
  const { canPerform } = useAuth();

  // Tab & Filter State from custom hook
  const {
    asOfDate,
    setAsOfDate,
    activeTab,
    setActiveTab,
    kpiFilter,
    setKpiFilter,
    selectedColor,
    setSelectedColor,
    selectedCategory,
    setSelectedCategory,
    selectedStageId,
    setSelectedStageId,
    selectedSupplierId,
    setSelectedSupplierId,
    selectedItemId,
    setSelectedItemId,
    searchQuery,
    setSearchQuery,
    expandedBatchIds,
    setExpandedBatchIds,
    expandedComponentIds,
    setExpandedComponentIds,
  } = useDashboardFilters();

  // Raw Database Entity State & Realtime Sync from custom hook
  const {
    stages,
    batches,
    movements,
    dispatches,
    locations,
    suppliers,
    items,
    componentStocks,
    allocations,
    vendorPortalMetrics,
    loading,
    error,
    loadData,
  } = useDashboardData(asOfDate, toastError);

  // Export Modal State
  const [exportModalOpen, setExportModalOpen] = useState(false);

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

  const [allocateModalBatch, setAllocateModalBatch] = useState<BatchWithRelations | null>(null);


  // Pure Calculation Engine with Point-in-Time asOfDate
  const calculations = useMemo(() => {
    return calculateDashboardMetrics({
      stages,
      batches,
      movements,
      dispatches,
      componentStocks,
      allocations,
      asOfDate: asOfDate || null,
    });
  }, [stages, batches, movements, dispatches, componentStocks, allocations, asOfDate]);

  const lastHandledBatchRef = useRef<string | null>(null);
  const lastHandledDispatchRef = useRef<string | null>(null);

  // Initial props inspection sync
  useEffect(() => {
    const targetBatchId = initialInspectBatch?.id || initialBatchId;
    if (!targetBatchId) {
      if (lastHandledBatchRef.current !== null) {
        lastHandledBatchRef.current = null;
        setInspectedBatchItem(null);
      }
      return;
    }

    if (lastHandledBatchRef.current !== targetBatchId) {
      lastHandledBatchRef.current = targetBatchId;

      if (calculations) {
        const found = calculations.batchMatrix.find(
          (bm) => bm.batch.id === targetBatchId || bm.batch.batch_no.toLowerCase() === targetBatchId.toLowerCase()
        );
        if (found) {
          setInspectedBatchItem(found);
          return;
        }
      }

      if (initialInspectBatch) {
        setInspectedBatchItem({
          batch: initialInspectBatch,
          stageQuantities: {},
          activeStages: [],
          dispatchedQty: 0,
          inFactoryQty: initialInspectBatch.qty_received,
          dispatches: [],
          movements: [],
          customerNames: [],
          isRawOnly: true,
          isReadyOnly: false,
          isInProduction: false,
          ageInDays: 0,
          isStalled: false,
          resolvedCapName: null,
          resolvedAtomizerName: null,
          resolvedBoxName: null,
          allocatedOutQty: 0,
          allocatedInQty: 0,
          netReceivedQty: initialInspectBatch.qty_received,
          allocationsOut: [],
          allocationsIn: [],
          rawStockQty: initialInspectBatch.qty_received,
          wipQty: 0,
          readyQty: 0,
          scrappedQty: 0,
          isComponentBatch: false,
        });
      }
    }
  }, [initialInspectBatch, initialBatchId, calculations]);

  useEffect(() => {
    if (!initialChallanDispatch) {
      lastHandledDispatchRef.current = null;
      return;
    }
    if (lastHandledDispatchRef.current !== initialChallanDispatch.id) {
      lastHandledDispatchRef.current = initialChallanDispatch.id;
      setChallanDispatch(initialChallanDispatch);
      setChallanModalOpen(true);
    }
  }, [initialChallanDispatch]);

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

  // ─── Universal CSV Export Handlers (RFC 4180 & UTF-8 BOM Compliant) ───
  const dateSuffix = asOfDate || getTodayDateString();

  const exportBatchMatrixCSV = () => {
    if (!calculations) return;
    try {
      const headers = [
        'Batch No',
        'Item',
        'Category',
        'Supplier',
        'Bay Location',
        'Received On',
        'Age (Days)',
        'Inward Total',
        ...calculations.processStages.map((s) => `${s.name} Stock`),
        'Dispatched Qty',
        'Factory Stock Balance',
        'Cap Component',
        'Atomizer Component',
        'Box Component',
      ];
      const rows = calculations.batchMatrix.map((bm) => [
        bm.batch.batch_no,
        bm.batch.item?.name ?? '',
        bm.batch.item?.category ?? 'Bottle',
        bm.batch.supplier?.name ?? '',
        bm.batch.location,
        bm.batch.received_on,
        bm.ageInDays,
        bm.batch.qty_received,
        ...calculations.processStages.map((s) => bm.stageQuantities[s.id] ?? 0),
        bm.dispatchedQty,
        bm.inFactoryQty,
        bm.resolvedCapName ?? '',
        bm.resolvedAtomizerName ?? '',
        bm.resolvedBoxName ?? '',
      ]);

      const filename = `ffstock_batch_matrix_${dateSuffix}`;
      downloadCSV(filename, headers, rows);
      success('Batch matrix CSV report downloaded successfully', 'Export Complete');
      setExportModalOpen(false);
    } catch (err) {
      toastError(getErrorMessage(err), 'Export failed');
    }
  };

  const exportStagesSummaryCSV = () => {
    if (!calculations) return;
    try {
      const headers = [
        'Sequence No',
        'Production Stage',
        'Total Stage Stock',
        'Bottles Qty',
        'Caps Qty',
        'Atomizers Qty',
        'Packaging Boxes Qty',
        'Active Batches Count',
      ];
      const rows = calculations.stageBreakdown.map((sb) => [
        sb.stage.sequence_no,
        sb.stage.name,
        sb.totalQty,
        sb.bottlesQty,
        sb.capsQty,
        sb.atomizersQty,
        sb.boxesQty,
        sb.batches.length,
      ]);

      const filename = `ffstock_stages_summary_${dateSuffix}`;
      downloadCSV(filename, headers, rows);
      success('Stage breakdown CSV report downloaded successfully', 'Export Complete');
      setExportModalOpen(false);
    } catch (err) {
      toastError(getErrorMessage(err), 'Export failed');
    }
  };

  const exportDispatchesCSV = () => {
    if (!calculations) return;
    try {
      const headers = [
        'Invoice No',
        'Customer Name',
        'Dispatched Date',
        'Batch No',
        'Item SKU',
        'Dispatched Qty',
        'Variant Name',
        'Color Variant',
        'Cap Name',
        'Atomizer Name',
        'Box Name',
        'Product Specifications',
      ];
      const rows = calculations.enrichedDispatches.map((d) => [
        d.invoice_no,
        d.customer_name,
        d.dispatched_on,
        d.batchNo,
        d.itemName,
        d.qty,
        d.variant_name ?? '',
        d.resolvedColor ?? '',
        d.resolvedCapName ?? '',
        d.resolvedAtomizerName ?? '',
        d.resolvedBoxName ?? '',
        d.product_specs ?? '',
      ]);

      const filename = `ffstock_dispatches_register_${dateSuffix}`;
      downloadCSV(filename, headers, rows);
      success('Customer dispatches CSV report downloaded successfully', 'Export Complete');
      setExportModalOpen(false);
    } catch (err) {
      toastError(getErrorMessage(err), 'Export failed');
    }
  };

  const exportMovementsCSV = () => {
    if (!calculations) return;
    try {
      const headers = [
        'Movement Date',
        'Batch No',
        'Item SKU',
        'From Stage',
        'To Stage',
        'Qty Moved',
        'Variant Name',
        'Cap Used',
        'Atomizer Used',
        'Box Used',
        'Color',
        'Printing Design',
        'Operator (Done By)',
        'Remarks',
      ];
      const rows = calculations.enrichedMovements.map((m) => [
        m.moved_on,
        m.batchNo,
        m.itemName,
        m.from_stage?.name ?? '',
        m.to_stage?.name ?? '',
        m.qty_moved,
        m.variant_name ?? '',
        m.cap_name ?? '',
        m.atomizer_name ?? '',
        m.box_name ?? '',
        m.color ?? '',
        m.printing_design ?? '',
        m.done_by ?? '',
        m.remarks ?? '',
      ]);

      const filename = `ffstock_movements_ledger_${dateSuffix}`;
      downloadCSV(filename, headers, rows);
      success('Movements ledger CSV report downloaded successfully', 'Export Complete');
      setExportModalOpen(false);
    } catch (err) {
      toastError(getErrorMessage(err), 'Export failed');
    }
  };

  const exportComponentsBOMCSV = () => {
    if (!componentStocks || componentStocks.length === 0) return;
    try {
      const headers = [
        'Component SKU',
        'Category',
        'Unit',
        'Total Inwarded',
        'Loose Warehouse Stock',
        'In-Factory Assembled WIP',
        'Dispatched in Orders',
        'Scrapped Defect Qty',
        'Net Available Balance',
      ];
      const rows = componentStocks.map((c) => [
        c.item.name,
        c.category,
        c.item.unit ?? 'pcs',
        c.totalInwarded,
        c.unallocatedWarehouseStock,
        c.totalInFactoryAssembled,
        c.totalDispatchedInOrders,
        c.totalScrapped,
        c.availableStock,
      ]);

      const filename = `ffstock_components_bom_${dateSuffix}`;
      downloadCSV(filename, headers, rows);
      success('Component BOM CSV report downloaded successfully', 'Export Complete');
      setExportModalOpen(false);
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
          item.customerNames.some((c: string) => c.toLowerCase().includes(q));
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
            bItem.customerNames.some((c: string) => c.toLowerCase().includes(q));
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
            {asOfDate ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-300 shadow-2xs">
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                Snapshot: {formatDate(asOfDate)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200 shadow-2xs">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Live Verified Stock
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 max-w-2xl leading-relaxed">
            Live manufacturing overview. Track Bottles, Caps, Atomizers, Packaging, batch movements, factory floor balances, and customer dispatches with 100% accuracy.
          </p>
        </div>

        {/* Global Action Strip */}
        <div className="flex flex-wrap items-center gap-2">
          {/* As-Of Date Selector (Point-in-Time Time Travel) */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs shadow-2xs">
            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-[11px] font-bold text-slate-500 hidden xl:inline">As of:</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              max={getTodayDateString()}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
              title="Select historical snapshot date (Time-Travel Mode)"
            />
            {asOfDate && (
              <button
                type="button"
                onClick={() => setAsOfDate('')}
                className="text-[11px] font-bold text-amber-600 hover:text-amber-800 underline ml-1 cursor-pointer"
                title="Clear filter & return to Live Stock"
              >
                Live
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportModalOpen(true)}
            title="Download CSV Reports"
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

          {(canPerform('stage_move') || canPerform('dispatch')) && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => openQuickModal()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm font-bold text-xs cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5 text-amber-300" />
              Quick Action
            </Button>
          )}

          {canPerform('inward') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onViewChange('items', { openInwardModal: true })}
              className="text-xs font-bold cursor-pointer"
            >
              <Package className="h-3.5 w-3.5 text-emerald-600" />
              Inward Stock
            </Button>
          )}
        </div>
      </div>

      {/* Point-in-Time Time Travel Banner */}
      {asOfDate && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl bg-amber-500/10 border border-amber-400/50 p-4 text-amber-950">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white font-bold shadow-2xs">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">
                Historical Point-in-Time Snapshot Mode: As of {formatDate(asOfDate)}
              </p>
              <p className="text-xs text-amber-700">
                All batch balances, production stages, customer shipments, and BOM components are recalculated strictly as of this historical date.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAsOfDate('')}
            className="bg-white text-amber-900 hover:bg-amber-100 border-amber-300 font-bold text-xs shrink-0 cursor-pointer shadow-2xs"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1 text-amber-600" />
            Reset to Live Stock
          </Button>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {/* ─── Production Orders & Vendor Portal Quick KPI Strip ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          onClick={() => onViewChange('orders')}
          className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50/90 to-white border border-indigo-100/90 hover:border-indigo-300 shadow-2xs hover:shadow-xs transition-all cursor-pointer group flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs group-hover:scale-105 transition-transform">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 block">
                Active Production Orders
              </span>
              <p className="text-xl font-extrabold text-slate-900 font-mono">
                {vendorPortalMetrics.activeOrdersCount}
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
            View Orders &rarr;
          </span>
        </div>

        <div
          onClick={() => onViewChange('vendor-pending')}
          className="p-4 rounded-2xl bg-gradient-to-r from-amber-50/90 to-white border border-amber-100/90 hover:border-amber-300 shadow-2xs hover:shadow-xs transition-all cursor-pointer group flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-xs group-hover:scale-105 transition-transform">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 block">
                Vendor Pending Board
              </span>
              <p className="text-xl font-extrabold text-slate-900 font-mono">
                {vendorPortalMetrics.pendingVendorAllocationsCount}
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-amber-700 group-hover:translate-x-0.5 transition-transform">
            Expedite &rarr;
          </span>
        </div>

        <div
          onClick={() => onViewChange('clients')}
          className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50/90 to-white border border-emerald-100/90 hover:border-emerald-300 shadow-2xs hover:shadow-xs transition-all cursor-pointer group flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-xs group-hover:scale-105 transition-transform">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">
                Registered Clients
              </span>
              <p className="text-xl font-extrabold text-slate-900 font-mono">
                {vendorPortalMetrics.clientsCount}
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-emerald-700 group-hover:translate-x-0.5 transition-transform">
            Directory &rarr;
          </span>
        </div>
      </div>

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
          <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 overflow-x-auto flex-nowrap sm:flex-wrap snap-x scrollbar-none pb-1 sm:pb-1.5 max-w-full">
            <button
              type="button"
              onClick={() => setActiveTab('batch-matrix')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer shrink-0 snap-start min-h-[38px] ${
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
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer shrink-0 snap-start min-h-[38px] ${
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
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer shrink-0 snap-start min-h-[38px] ${
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
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer shrink-0 snap-start min-h-[38px] ${
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
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer shrink-0 snap-start min-h-[38px] ${
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
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer shrink-0 snap-start min-h-[38px] ${
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
          onOpenAllocateModal={(b) => setAllocateModalBatch(b)}
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
          onNavigateToOutward={(bId) => onViewChange('outward', { batchId: bId })}
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
          onOpenAllocateModal={(b) => setAllocateModalBatch(b)}
        />
      )}

      {allocateModalBatch && (
        <AllocateModal
          isOpen={Boolean(allocateModalBatch)}
          onClose={() => setAllocateModalBatch(null)}
          sourceBatch={allocateModalBatch}
          allBatches={batches || []}
          onAllocationComplete={() => {
            setAllocateModalBatch(null);
            loadData();
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

      {/* Universal Export Modal */}
      {exportModalOpen && calculations && (
        <Modal
          isOpen={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          title={`Export Factory Data Reports (${asOfDate ? `As of ${formatDate(asOfDate)}` : 'Live Ledger'})`}
          maxWidthClass="max-w-xl"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Download standard RFC 4180 and UTF-8 BOM compliant CSV spreadsheets for Excel, accounting systems, and compliance audits.
            </p>

            <div className="grid grid-cols-1 gap-2.5">
              <button
                type="button"
                onClick={exportBatchMatrixCSV}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 font-bold">
                    <LayoutDashboard className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 group-hover:text-amber-800">
                      Batch Inventory Matrix ({calculations.batchMatrix.length} batches)
                    </p>
                    <p className="text-xs text-slate-500">
                      Full breakdown of inward quantities, stage-by-stage distribution, aging, and components.
                    </p>
                  </div>
                </div>
                <Download className="h-4 w-4 text-slate-400 group-hover:text-amber-600 shrink-0" />
              </button>

              <button
                type="button"
                onClick={exportStagesSummaryCSV}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-800 font-bold">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 group-hover:text-blue-800">
                      Stages Stock Summary ({calculations.processStages.length} stages)
                    </p>
                    <p className="text-xs text-slate-500">
                      Aggregated floor inventory by production milestone (Bottles, Caps, Pumps, Packaging).
                    </p>
                  </div>
                </div>
                <Download className="h-4 w-4 text-slate-400 group-hover:text-blue-600 shrink-0" />
              </button>

              <button
                type="button"
                onClick={exportDispatchesCSV}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-800">
                      Customer Dispatches Register ({dispatches.length} shipments)
                    </p>
                    <p className="text-xs text-slate-500">
                      Chronological log of customer invoices, quantities, variants, and product specs.
                    </p>
                  </div>
                </div>
                <Download className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 shrink-0" />
              </button>

              <button
                type="button"
                onClick={exportMovementsCSV}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-800 font-bold">
                    <ArrowLeftRight className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-800">
                      Movements & Operations Ledger ({movements.length} logs)
                    </p>
                    <p className="text-xs text-slate-500">
                      Complete audit trail of stage transfers, operator names, split variants, and remarks.
                    </p>
                  </div>
                </div>
                <Download className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 shrink-0" />
              </button>

              <button
                type="button"
                onClick={exportComponentsBOMCSV}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-purple-400 hover:bg-purple-50/50 transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-800 font-bold">
                    <PackageCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 group-hover:text-purple-800">
                      Component BOM Inventory Balance ({componentStocks.length} components)
                    </p>
                    <p className="text-xs text-slate-500">
                      5-state component reconciliation (Inwarded, Warehouse, Assembled WIP, Dispatched, Scrapped).
                    </p>
                  </div>
                </div>
                <Download className="h-4 w-4 text-slate-400 group-hover:text-purple-600 shrink-0" />
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

