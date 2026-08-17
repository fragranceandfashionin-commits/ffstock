import { useEffect, useState, useMemo } from 'react';
import {
  LayoutDashboard, ArrowRight, Package, MapPin, Layers, TrendingUp, CheckCircle, Truck, Box,
  Filter, RefreshCw, ChevronRight, ChevronDown,
  ShieldCheck, ArrowLeftRight, Building2, Download, Printer,
  Maximize2, Zap, CheckCircle2, AlertCircle, History, Clock, AlertTriangle
} from 'lucide-react';
import { Card, Spinner, ErrorBanner, Button, SearchInput, Badge, Modal, Field, inputClass } from '@/components/ui';
import { fetchStages, fetchBatches, fetchLocationStock, fetchDispatches, fetchMovements, fetchItems, fetchSuppliers } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { LocationStock } from '@/lib/types';
import type { BatchWithRelations, Dispatch, MovementWithRelations, Stage, Item, Supplier } from '@/lib/supabase';
import { formatNumber, formatDate, getErrorMessage, getTodayDateString } from '@/lib/utils';
import type { View } from '@/lib/types';

type DashboardTab = 'batch-matrix' | 'stages' | 'transitions' | 'dispatches' | 'locations';
type KpiFilter = 'ALL' | 'IN_FACTORY' | 'IN_PRODUCTION' | 'READY' | 'DISPATCHED' | 'RAW' | 'STALLED';

export function DashboardView({ onViewChange }: { onViewChange: (view: View) => void }) {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [batches, setBatches] = useState<BatchWithRelations[] | null>(null);
  const [locations, setLocations] = useState<LocationStock[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [movements, setMovements] = useState<MovementWithRelations[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interactive UI Filters
  const [activeTab, setActiveTab] = useState<DashboardTab>('batch-matrix');
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStageId, setSelectedStageId] = useState<string | 'ALL'>('ALL');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | 'ALL'>('ALL');
  const [selectedItemId, setSelectedItemId] = useState<string | 'ALL'>('ALL');

  // Ground-Truth Context Drilldown Modal State (Zero Hallucination & Zero Assumption)
  type DynamicContextType = 'RAW' | 'IN_PRODUCTION' | 'READY' | 'DISPATCHED' | 'IN_FACTORY' | 'STALLED' | 'STAGE' | 'ALL';
  const [dynamicContext, setDynamicContext] = useState<{
    key: DynamicContextType;
    stageId?: string;
    title: string;
    subtitle: string;
    badgeLabel: string;
    color: 'slate' | 'amber' | 'sky' | 'violet' | 'emerald' | 'rose';
  } | null>(null);

  const openMilestoneContext = (
    key: DynamicContextType,
    title: string,
    subtitle: string,
    badgeLabel: string,
    color: 'slate' | 'amber' | 'sky' | 'violet' | 'emerald' | 'rose'
  ) => {
    if (key === 'RAW' || key === 'IN_PRODUCTION' || key === 'READY' || key === 'DISPATCHED' || key === 'IN_FACTORY' || key === 'STALLED') {
      setKpiFilter(key);
    }
    setDynamicContext({ key, title, subtitle, badgeLabel, color });
  };

  const openStageContext = (stage: Stage) => {
    setSelectedStageId(stage.id);
    setDynamicContext({
      key: 'STAGE',
      stageId: stage.id,
      title: `Stage ${stage.sequence_no}: ${stage.name} — Ground-Truth Context`,
      subtitle: `Live factory floor ledger of units & active batches currently positioned in ${stage.name}`,
      badgeLabel: `Step ${stage.sequence_no}`,
      color: 'emerald',
    });
  };

  // Interactive Row Accordion & Media Zoom
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());
  const [zoomImageUrl, setZoomImageUrl] = useState<{ url: string; title: string; batchNo: string } | null>(null);

  // In-Place Quick Movement / Dispatch Modal
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [quickModalTab, setQuickModalTab] = useState<'move' | 'dispatch'>('move');
  const [quickBatchId, setQuickBatchId] = useState('');
  const [quickFromStageId, setQuickFromStageId] = useState('');
  const [quickToStageId, setQuickToStageId] = useState('');
  const [quickQty, setQuickQty] = useState('');
  const [quickCapName, setQuickCapName] = useState('');
  const [quickAtomizerName, setQuickAtomizerName] = useState('');
  const [quickRemarks, setQuickRemarks] = useState('');
  const [quickDoneBy, setQuickDoneBy] = useState('');
  const [quickCustomerName, setQuickCustomerName] = useState('');
  const [quickInvoiceNo, setQuickInvoiceNo] = useState('');
  const [quickDispatchDate, setQuickDispatchDate] = useState(getTodayDateString());
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSuccess, setQuickSuccess] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, b, loc, disp, mov, itms, supps] = await Promise.all([
        fetchStages(),
        fetchBatches(),
        fetchLocationStock(),
        fetchDispatches(),
        fetchMovements(),
        fetchItems(),
        fetchSuppliers(),
      ]);
      setStages(s);
      setBatches(b);
      setLocations(loc);
      setDispatches(disp);
      setMovements(mov);
      setItems(itms);
      setSuppliers(supps);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load live factory dashboard'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Realtime live syncing across multi-user terminals
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stage_movements' },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dispatches' },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inward_batches' },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'suppliers' },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Toggle row accordion
  const toggleRowAccordion = (batchId: string) => {
    setExpandedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  // Expand all / collapse all
  const expandAllRows = () => {
    if (!batches) return;
    if (expandedBatchIds.size === batches.length) {
      setExpandedBatchIds(new Set());
    } else {
      setExpandedBatchIds(new Set(batches.map((b) => b.id)));
    }
  };

  // ══════════════════════════════════════════════════════════════════
  // GRANULAR LEDGER CALCULATIONS (100% RECONCILED & ZERO ASSUMPTION)
  // ══════════════════════════════════════════════════════════════════

  const calculations = useMemo(() => {
    if (!stages || !batches) return null;

    const processStages = stages.filter((s) => s.name !== 'Dispatched');
    const rawStage = stages.find((s) => s.name === 'Raw Stock');
    const readyStage = stages.find((s) => s.name === 'Ready');

    // Batch lookup map
    const batchMap = new Map<string, BatchWithRelations>();
    for (const b of batches) {
      batchMap.set(b.id, b);
    }

    // Group movements and dispatches by batch
    const movementsByBatch = new Map<string, MovementWithRelations[]>();
    for (const m of movements) {
      const list = movementsByBatch.get(m.batch_id) ?? [];
      list.push(m);
      movementsByBatch.set(m.batch_id, list);
    }

    const dispatchesByBatch = new Map<string, Dispatch[]>();
    for (const d of dispatches) {
      const list = dispatchesByBatch.get(d.batch_id) ?? [];
      list.push(d);
      dispatchesByBatch.set(d.batch_id, list);
    }

    const now = new Date();

    // For every batch, calculate its exact stock in each stage and aging
    const batchMatrix = batches.map((b) => {
      const stockByStage = new Map<string, number>();
      for (const s of stages) stockByStage.set(s.id, 0);

      // Raw Stock initial intake
      if (rawStage) stockByStage.set(rawStage.id, b.qty_received);

      // Apply stage movements
      const bMovements = movementsByBatch.get(b.id) ?? [];
      for (const m of bMovements) {
        stockByStage.set(m.from_stage_id, (stockByStage.get(m.from_stage_id) ?? 0) - m.qty_moved);
        stockByStage.set(m.to_stage_id, (stockByStage.get(m.to_stage_id) ?? 0) + m.qty_moved);
      }

      // Apply dispatches
      const bDispatches = dispatchesByBatch.get(b.id) ?? [];
      const dispatchedQty = bDispatches.reduce((acc, d) => acc + d.qty, 0);
      if (readyStage) {
        stockByStage.set(readyStage.id, (stockByStage.get(readyStage.id) ?? 0) - dispatchedQty);
      }

      const inFactoryQty = Math.max(0, b.qty_received - dispatchedQty);

      // Stage-specific amounts
      const stageQuantities: Record<string, number> = {};
      const activeStages: { stageId: string; stageName: string; sequenceNo: number; qty: number }[] = [];

      for (const s of processStages) {
        const q = Math.max(0, stockByStage.get(s.id) ?? 0);
        stageQuantities[s.id] = q;
        if (q > 0) {
          activeStages.push({ stageId: s.id, stageName: s.name, sequenceNo: s.sequence_no, qty: q });
        }
      }

      // Customer names who received this batch
      const customerNames = Array.from(new Set(bDispatches.map((d) => d.customer_name)));

      // Active status flags
      const isRawOnly = (stageQuantities[rawStage?.id ?? ''] ?? 0) === inFactoryQty && inFactoryQty > 0;
      const isReadyOnly = (stageQuantities[readyStage?.id ?? ''] ?? 0) === inFactoryQty && inFactoryQty > 0;
      const isInProduction = activeStages.some(
        (as) => as.stageName !== 'Raw Stock' && as.stageName !== 'Ready' && as.qty > 0
      );

      // Real Aging Calculation (Calendar Days since Inward)
      const receivedDate = new Date(b.received_on);
      const ageInDays = Math.max(0, Math.floor((now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24)));
      const isStalled = inFactoryQty > 0 && ageInDays >= 7;

      return {
        batch: b,
        stageQuantities,
        activeStages,
        dispatchedQty,
        inFactoryQty,
        dispatches: bDispatches,
        movements: bMovements,
        customerNames,
        isRawOnly,
        isReadyOnly,
        isInProduction,
        ageInDays,
        isStalled,
      };
    });

    // Stage-wise aggregation and batch breakdown for each stage
    const stageBreakdown = processStages.map((s) => {
      const batchesAtStage = batchMatrix
        .filter((item) => (item.stageQuantities[s.id] ?? 0) > 0)
        .map((item) => ({
          batch: item.batch,
          qty: item.stageQuantities[s.id] ?? 0,
          customerNames: item.customerNames,
          ageInDays: item.ageInDays,
        }));

      const totalStageQty = batchesAtStage.reduce((sum, item) => sum + item.qty, 0);

      return {
        stage: s,
        totalQty: totalStageQty,
        batches: batchesAtStage,
      };
    });

    // Overall Factory Hard-Count Metrics (NO PERCENTAGES)
    const totalReceived = batches.reduce((sum, b) => sum + b.qty_received, 0);
    const totalDispatched = dispatches.reduce((sum, d) => sum + d.qty, 0);
    const totalInsideFactory = Math.max(0, totalReceived - totalDispatched);
    const rawStockTotal = stageBreakdown.find((s) => s.stage.name === 'Raw Stock')?.totalQty ?? 0;
    const readyStockTotal = stageBreakdown.find((s) => s.stage.name === 'Ready')?.totalQty ?? 0;
    const productionTotal = stageBreakdown
      .filter((s) => s.stage.name !== 'Raw Stock' && s.stage.name !== 'Ready')
      .reduce((sum, s) => sum + s.totalQty, 0);

    // Entity Hard Counts
    const batchesInFactoryCount = batchMatrix.filter((b) => b.inFactoryQty > 0).length;
    const rawBatchesCount = batchMatrix.filter((b) => (b.stageQuantities[rawStage?.id ?? ''] ?? 0) > 0).length;
    const productionBatchesCount = batchMatrix.filter((b) => b.isInProduction).length;
    const readyBatchesCount = batchMatrix.filter((b) => (b.stageQuantities[readyStage?.id ?? ''] ?? 0) > 0).length;
    const dispatchedBatchesCount = batchMatrix.filter((b) => b.dispatchedQty > 0).length;
    const stalledBatches = batchMatrix.filter((b) => b.isStalled);

    const uniqueCustomers = Array.from(new Set(dispatches.map((d) => d.customer_name).filter(Boolean)));
    const uniqueCustomersCount = uniqueCustomers.length;

    const activeRacks = Array.from(new Set(batchMatrix.filter((b) => b.inFactoryQty > 0).map((b) => b.batch.location).filter(Boolean)));
    const activeRacksCount = activeRacks.length;

    const uniqueItemsCount = new Set(batches.map((b) => b.item_id).filter(Boolean)).size;
    const uniqueSuppliersCount = new Set(batches.map((b) => b.supplier_id).filter(Boolean)).size;

    // Timeline Span Boundaries (Exact Dates from DB)
    const earliestInwardDate = batches.length > 0 ? batches.reduce((min, b) => (b.received_on < min ? b.received_on : min), batches[0].received_on) : null;
    const latestInwardDate = batches.length > 0 ? batches.reduce((max, b) => (b.received_on > max ? b.received_on : max), batches[0].received_on) : null;
    const latestMovementDate = movements.length > 0 ? movements.reduce((max, m) => (m.moved_on > max ? m.moved_on : max), movements[0].moved_on) : null;
    const latestDispatchDate = dispatches.length > 0 ? dispatches.reduce((max, d) => (d.dispatched_on > max ? d.dispatched_on : max), dispatches[0].dispatched_on) : null;

    // Enriched chronological movements
    const enrichedMovements = movements.map((m) => {
      const b = batchMap.get(m.batch_id);
      return {
        ...m,
        batch: b,
        batchNo: b?.batch_no ?? 'Unknown',
        itemName: b?.item?.name ?? 'Unknown Item',
        supplierName: b?.supplier?.name ?? 'Unknown Supplier',
      };
    });

    // Enriched dispatches
    const enrichedDispatches = dispatches.map((d) => {
      const b = batchMap.get(d.batch_id);
      return {
        ...d,
        batch: b,
        batchNo: b?.batch_no ?? 'Unknown',
        itemName: b?.item?.name ?? 'Unknown Item',
        supplierName: b?.supplier?.name ?? 'Unknown Supplier',
      };
    });

    return {
      processStages,
      batchMatrix,
      stageBreakdown,
      totalReceived,
      totalDispatched,
      totalInsideFactory,
      rawStockTotal,
      readyStockTotal,
      productionTotal,
      batchesInFactoryCount,
      rawBatchesCount,
      productionBatchesCount,
      readyBatchesCount,
      dispatchedBatchesCount,
      stalledBatches,
      uniqueCustomersCount,
      activeRacksCount,
      uniqueItemsCount,
      uniqueSuppliersCount,
      earliestInwardDate,
      latestInwardDate,
      latestMovementDate,
      latestDispatchDate,
      enrichedMovements,
      enrichedDispatches,
      batchMap,
    };
  }, [stages, batches, movements, dispatches]);

  // Quick Action Handler directly on dashboard
  const openQuickModal = (batchId?: string, defaultTab: 'move' | 'dispatch' = 'move') => {
    setQuickError(null);
    setQuickSuccess(null);
    setQuickModalTab(defaultTab);
    const targetBatchId = batchId || (batches && batches.length > 0 ? batches[0].id : '');
    setQuickBatchId(targetBatchId);
    setQuickQty('');
    setQuickCapName('');
    setQuickAtomizerName('');
    setQuickRemarks('');
    setQuickDoneBy('');
    setQuickCustomerName('');
    setQuickInvoiceNo('');
    setQuickDispatchDate(getTodayDateString());

    // Determine default fromStage with stock
    if (targetBatchId && calculations) {
      const bItem = calculations.batchMatrix.find((bm) => bm.batch.id === targetBatchId);
      if (bItem && bItem.activeStages.length > 0) {
        setQuickFromStageId(bItem.activeStages[0].stageId);
        const currentSeq = bItem.activeStages[0].sequenceNo;
        const nextStage = calculations.processStages.find((s) => s.sequence_no > currentSeq);
        if (nextStage) setQuickToStageId(nextStage.id);
        else setQuickToStageId('');
      }
    }
    setQuickModalOpen(true);
  };

  // When selected batch changes inside quick modal, auto-update available fromStages
  const selectedQuickBatchItem = useMemo(() => {
    if (!calculations || !quickBatchId) return null;
    return calculations.batchMatrix.find((bm) => bm.batch.id === quickBatchId);
  }, [calculations, quickBatchId]);

  const availableStagesForBatch = useMemo(() => {
    if (!selectedQuickBatchItem) return [];
    return selectedQuickBatchItem.activeStages;
  }, [selectedQuickBatchItem]);

  const maxQtyAvailable = useMemo(() => {
    if (!selectedQuickBatchItem || !quickFromStageId) return 0;
    return selectedQuickBatchItem.stageQuantities[quickFromStageId] ?? 0;
  }, [selectedQuickBatchItem, quickFromStageId]);

  const maxReadyQtyForDispatch = useMemo(() => {
    if (!selectedQuickBatchItem || !stages) return 0;
    const readyStage = stages.find((s) => s.name === 'Ready');
    if (!readyStage) return 0;
    return selectedQuickBatchItem.stageQuantities[readyStage.id] ?? 0;
  }, [selectedQuickBatchItem, stages]);

  const isQuickFromFilling = useMemo(() => {
    if (!stages || !quickFromStageId) return false;
    const fromStage = stages.find((s) => s.id === quickFromStageId);
    return fromStage?.name?.toLowerCase() === 'filling';
  }, [stages, quickFromStageId]);

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickError(null);
    setQuickSuccess(null);

    if (!quickBatchId) {
      setQuickError('Please select a batch.');
      return;
    }

    if (quickModalTab === 'move') {
      if (!quickFromStageId || !quickToStageId) {
        setQuickError('Please choose origin and destination stages.');
        return;
      }
      if (quickFromStageId === quickToStageId) {
        setQuickError('Destination stage must be different from origin stage.');
        return;
      }
      const qtyNum = Number(quickQty);
      if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
        setQuickError('Quantity must be a positive whole number.');
        return;
      }
      if (qtyNum > maxQtyAvailable) {
        setQuickError(`Cannot move ${formatNumber(qtyNum)} units. Only ${formatNumber(maxQtyAvailable)} available in selected stage.`);
        return;
      }

      if (isQuickFromFilling) {
        if (!quickCapName.trim() || !quickAtomizerName.trim()) {
          setQuickError('Cap Name and Atomizer Name are mandatory when moving bottles from the Filling stage.');
          return;
        }
      }

      setQuickSubmitting(true);
      try {
        const insertPayload: Record<string, unknown> = {
          batch_id: quickBatchId,
          from_stage_id: quickFromStageId,
          to_stage_id: quickToStageId,
          qty_moved: qtyNum,
          moved_on: getTodayDateString(),
          remarks: quickRemarks.trim() || null,
          done_by: quickDoneBy.trim() || null,
        };

        if (isQuickFromFilling || quickCapName.trim()) {
          insertPayload.cap_name = quickCapName.trim();
        }
        if (isQuickFromFilling || quickAtomizerName.trim()) {
          insertPayload.atomizer_name = quickAtomizerName.trim();
        }

        const { error: insErr } = await supabase.from('stage_movements').insert(insertPayload);
        if (insErr) throw insErr;
        setQuickSuccess(`Successfully transferred ${formatNumber(qtyNum)} units.`);
        await loadData();
        setTimeout(() => setQuickModalOpen(false), 800);
      } catch (err) {
        setQuickError(getErrorMessage(err, 'Failed to record stage transition'));
      } finally {
        setQuickSubmitting(false);
      }
    } else {
      // Dispatch
      if (!quickCustomerName.trim() || !quickInvoiceNo.trim()) {
        setQuickError('Please enter customer name and invoice number.');
        return;
      }
      const qtyNum = Number(quickQty);
      if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
        setQuickError('Quantity must be a positive whole number.');
        return;
      }
      if (qtyNum > maxReadyQtyForDispatch) {
        setQuickError(`Cannot dispatch ${formatNumber(qtyNum)} units. Only ${formatNumber(maxReadyQtyForDispatch)} ready in finished stock.`);
        return;
      }

      setQuickSubmitting(true);
      try {
        const { error: insErr } = await supabase.from('dispatches').insert({
          batch_id: quickBatchId,
          customer_name: quickCustomerName.trim(),
          invoice_no: quickInvoiceNo.trim(),
          qty: qtyNum,
          dispatched_on: quickDispatchDate,
        });
        if (insErr) throw insErr;
        setQuickSuccess(`Successfully recorded shipment of ${formatNumber(qtyNum)} units to ${quickCustomerName}.`);
        await loadData();
        setTimeout(() => setQuickModalOpen(false), 800);
      } catch (err) {
        setQuickError(getErrorMessage(err, 'Failed to record customer dispatch'));
      } finally {
        setQuickSubmitting(false);
      }
    }
  };

  // CSV Export
  const exportToCSV = () => {
    if (!calculations || !calculations.batchMatrix) return;
    const headers = [
      'Batch No',
      'Item Name',
      'Supplier',
      'Location Rack',
      'Inward Date',
      'Aging (Days)',
      'Total Received',
      ...calculations.processStages.map((s) => `Stage: ${s.name}`),
      'Total Dispatched',
      'Factory Balance',
      'Customer Dispatches'
    ];

    const rows = calculations.batchMatrix.map((item) => {
      return [
        `"${item.batch.batch_no}"`,
        `"${item.batch.item?.name ?? ''}"`,
        `"${item.batch.supplier?.name ?? ''}"`,
        `"${item.batch.location}"`,
        `"${formatDate(item.batch.received_on)}"`,
        item.ageInDays,
        item.batch.qty_received,
        ...calculations.processStages.map((s) => item.stageQuantities[s.id] ?? 0),
        item.dispatchedQty,
        item.inFactoryQty,
        `"${item.customerNames.join('; ')}"`
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `factory_inventory_ledger_${getTodayDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Print Factory Summary
  const handlePrint = () => {
    window.print();
  };

  if (loading) return <Spinner label="Loading factory manager dashboard…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!stages || !batches || !calculations) return null;

  const {
    processStages,
    batchMatrix,
    stageBreakdown,
    totalReceived,
    totalDispatched,
    totalInsideFactory,
    rawStockTotal,
    readyStockTotal,
    productionTotal,
    batchesInFactoryCount,
    rawBatchesCount,
    productionBatchesCount,
    readyBatchesCount,
    stalledBatches,
    uniqueCustomersCount,
    activeRacksCount,
    earliestInwardDate,
    latestInwardDate,
    latestDispatchDate,
    enrichedMovements,
    enrichedDispatches,
  } = calculations;

  // Filtered views based on global search & multi-tier filters
  const q = searchQuery.toLowerCase().trim();

  const filteredBatchMatrix = batchMatrix.filter((item) => {
    // Search query filter
    if (q) {
      const matchSearch =
        item.batch.batch_no.toLowerCase().includes(q) ||
        (item.batch.item?.name ?? '').toLowerCase().includes(q) ||
        (item.batch.supplier?.name ?? '').toLowerCase().includes(q) ||
        item.batch.location.toLowerCase().includes(q) ||
        item.customerNames.some((c) => c.toLowerCase().includes(q));
      if (!matchSearch) return false;
    }

    // Supplier filter
    if (selectedSupplierId !== 'ALL' && item.batch.supplier_id !== selectedSupplierId) {
      return false;
    }

    // Item filter
    if (selectedItemId !== 'ALL' && item.batch.item_id !== selectedItemId) {
      return false;
    }

    // Stage selection filter
    if (selectedStageId !== 'ALL') {
      const stageQty = item.stageQuantities[selectedStageId] ?? 0;
      if (stageQty <= 0) return false;
    }

    // KPI Card & Quick Triage Filter
    if (kpiFilter === 'IN_FACTORY' && item.inFactoryQty <= 0) return false;
    if (kpiFilter === 'IN_PRODUCTION' && !item.isInProduction) return false;
    if (kpiFilter === 'READY' && (item.stageQuantities[stages.find((s) => s.name === 'Ready')?.id ?? ''] ?? 0) <= 0) return false;
    if (kpiFilter === 'DISPATCHED' && item.dispatchedQty <= 0) return false;
    if (kpiFilter === 'RAW' && (item.stageQuantities[stages.find((s) => s.name === 'Raw Stock')?.id ?? ''] ?? 0) <= 0) return false;
    if (kpiFilter === 'STALLED' && !item.isStalled) return false;

    return true;
  });

  const filteredStageBreakdown = stageBreakdown
    .filter((sb) => selectedStageId === 'ALL' || sb.stage.id === selectedStageId)
    .map((sb) => ({
      ...sb,
      batches: sb.batches.filter((bItem) => {
        if (!q) return true;
        return (
          bItem.batch.batch_no.toLowerCase().includes(q) ||
          (bItem.batch.item?.name ?? '').toLowerCase().includes(q) ||
          (bItem.batch.supplier?.name ?? '').toLowerCase().includes(q) ||
          bItem.batch.location.toLowerCase().includes(q) ||
          bItem.customerNames.some((c) => c.toLowerCase().includes(q))
        );
      }),
    }));

  const filteredMovements = enrichedMovements.filter((m) => {
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

  const filteredDispatches = enrichedDispatches.filter((d) => {
    if (!q) return true;
    return (
      d.customer_name.toLowerCase().includes(q) ||
      d.invoice_no.toLowerCase().includes(q) ||
      d.batchNo.toLowerCase().includes(q) ||
      d.itemName.toLowerCase().includes(q) ||
      d.supplierName.toLowerCase().includes(q)
    );
  });

  const activeFilterCount =
    (kpiFilter !== 'ALL' ? 1 : 0) +
    (selectedStageId !== 'ALL' ? 1 : 0) +
    (selectedSupplierId !== 'ALL' ? 1 : 0) +
    (selectedItemId !== 'ALL' ? 1 : 0) +
    (q ? 1 : 0);

  const resetAllFilters = () => {
    setKpiFilter('ALL');
    setSelectedStageId('ALL');
    setSelectedSupplierId('ALL');
    setSelectedItemId('ALL');
    setSearchQuery('');
  };

  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════════
          HEADER & ACTION BAR
      ═══════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Factory Command Center
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200 shadow-2xs">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Reconciled Ledger
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 max-w-2xl leading-relaxed">
            Real-time multi-stage manufacturing ledger. Track every bottle transition, floor balances, customer dispatches, and granular batch matrix with zero estimation.
          </p>
        </div>

        {/* Global Action Strip */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            title="Download CSV Report"
            className="text-xs font-bold text-slate-700 bg-white shadow-2xs hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            title="Print Shift Summary"
            className="text-xs font-bold text-slate-700 bg-white shadow-2xs hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" />
            Print
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            title="Refresh live data"
            className="text-xs font-bold text-slate-700 bg-white shadow-2xs hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
            Sync
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => openQuickModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm font-bold text-xs"
          >
            <Zap className="h-3.5 w-3.5 text-amber-300" />
            Quick Transition
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onViewChange('inward')}
            className="text-xs font-bold"
          >
            <Package className="h-3.5 w-3.5" />
            Inward Entry
          </Button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          OPERATIONAL EXCEPTION & ATTENTION TRIAGE STRIP
      ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Stalled Batches Alert */}
        <div
          onClick={() =>
            openMilestoneContext(
              'STALLED',
              'Stalled Batches (> 7 Days) — Ground-Truth Context',
              'Active factory floor batches sitting without progression or dispatch for over 7 days',
              'Stalled Alert',
              'rose'
            )
          }
          className={`cursor-pointer p-3 rounded-2xl border transition-all flex items-center justify-between group ${
            kpiFilter === 'STALLED'
              ? 'bg-rose-100/80 border-rose-400 ring-2 ring-rose-400/40 shadow-xs'
              : stalledBatches.length > 0
              ? 'bg-rose-50/70 border-rose-200 hover:bg-rose-100/50 hover:shadow-2xs'
              : 'bg-slate-50 border-slate-200 opacity-80'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${stalledBatches.length > 0 ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">
                {stalledBatches.length} {stalledBatches.length === 1 ? 'Batch' : 'Batches'} Stalled (&gt; 7 Days)
              </p>
              <p className="text-[11px] text-slate-500">
                {stalledBatches.length > 0 ? 'Sitting on floor without full dispatch' : 'All floor batches moving within schedule'}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 bg-rose-100/80 group-hover:bg-rose-700 group-hover:text-white px-2 py-0.5 rounded-md transition-colors flex items-center gap-1">
            <Maximize2 className="h-2.5 w-2.5" />
            {kpiFilter === 'STALLED' ? 'Context Active' : 'Inspect'}
          </span>
        </div>

        {/* Ready for Customer Dispatch Staging */}
        <div
          onClick={() =>
            openMilestoneContext(
              'READY',
              '3. Finished Goods Staging — Ground-Truth Context',
              'Inspected & QA passed ready stock awaiting customer dispatches',
              'Finished Goods',
              'sky'
            )
          }
          className={`cursor-pointer p-3 rounded-2xl border transition-all flex items-center justify-between group ${
            kpiFilter === 'READY'
              ? 'bg-sky-100/80 border-sky-400 ring-2 ring-sky-400/40 shadow-xs'
              : readyStockTotal > 0
              ? 'bg-sky-50/70 border-sky-200 hover:bg-sky-100/50 hover:shadow-2xs'
              : 'bg-slate-50 border-slate-200 opacity-80'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${readyStockTotal > 0 ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              <CheckCircle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">
                {formatNumber(readyStockTotal)} Units Finished & Ready
              </p>
              <p className="text-[11px] text-slate-500">
                {readyBatchesCount} batches waiting for dispatch challan
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider text-sky-700 bg-sky-100/80 group-hover:bg-sky-700 group-hover:text-white px-2 py-0.5 rounded-md transition-colors flex items-center gap-1">
            <Maximize2 className="h-2.5 w-2.5" />
            {kpiFilter === 'READY' ? 'Context Active' : 'Inspect'}
          </span>
        </div>

        {/* Storage Rack Distribution */}
        <div
          onClick={() => setActiveTab('locations')}
          className="cursor-pointer p-3 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-800 text-white">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">
                {activeRacksCount} Active Storage Bays
              </p>
              <p className="text-[11px] text-slate-500">
                Holding {formatNumber(totalInsideFactory)} total floor units
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 bg-slate-200 group-hover:bg-slate-800 group-hover:text-white px-2 py-0.5 rounded-md transition-colors">
            View Racks
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          EXECUTIVE HUD: HARD OPERATIONAL UNIT CARDS (NO PERCENTAGES)
      ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total Inward Received */}
        <button
          type="button"
          onClick={() =>
            openMilestoneContext(
              'ALL',
              'Total Inward Intake — Ground-Truth Context',
              'All inward shipments received into factory ledger',
              'Total Intake',
              'slate'
            )
          }
          className={`text-left p-4 rounded-2xl border transition-all duration-150 relative bg-white group cursor-pointer ${
            kpiFilter === 'ALL' && activeFilterCount === 0
              ? 'border-slate-800 shadow-md ring-1 ring-slate-800'
              : 'border-slate-200 hover:border-slate-300 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Received</span>
            <Box className="h-4 w-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{formatNumber(totalReceived)}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>{formatNumber(batches.length)} total batches</span>
            <span className="font-semibold text-slate-700 flex items-center gap-0.5 group-hover:underline">
              Inspect <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </button>

        {/* Live Inside Factory */}
        <button
          type="button"
          onClick={() =>
            openMilestoneContext(
              'IN_FACTORY',
              'Live Inside Factory Balance — Ground-Truth Context',
              'Active units remaining on floor inside factory bays',
              'Inside Factory',
              'emerald'
            )
          }
          className={`text-left p-4 rounded-2xl border transition-all duration-150 relative group cursor-pointer ${
            kpiFilter === 'IN_FACTORY'
              ? 'border-emerald-700 bg-emerald-50 text-emerald-950 shadow-md ring-2 ring-emerald-600/30'
              : 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/70 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900">Inside Factory</span>
            <Building2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-800">{formatNumber(totalInsideFactory)}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-emerald-700">
            <span>{batchesInFactoryCount} active batches</span>
            <span className="font-bold flex items-center gap-0.5 group-hover:underline">
              Inspect <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          {kpiFilter === 'IN_FACTORY' && (
            <span className="absolute -top-2 right-3 bg-emerald-800 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase">
              Filter Active
            </span>
          )}
        </button>

        {/* In Production */}
        <button
          type="button"
          onClick={() =>
            openMilestoneContext(
              'IN_PRODUCTION',
              '2. Active Conversion (WIP) — Ground-Truth Context',
              'Work in progress batches undergoing machine conversion stages',
              'Active Floor WIP',
              'amber'
            )
          }
          className={`text-left p-4 rounded-2xl border transition-all duration-150 relative group cursor-pointer ${
            kpiFilter === 'IN_PRODUCTION'
              ? 'border-amber-700 bg-amber-50 text-amber-950 shadow-md ring-2 ring-amber-600/30'
              : 'border-amber-200 bg-amber-50/40 hover:bg-amber-50/70 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900">In Production</span>
            <TrendingUp className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-amber-800">{formatNumber(productionTotal)}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-amber-700">
            <span>{productionBatchesCount} batches in WIP</span>
            <span className="font-bold flex items-center gap-0.5 group-hover:underline">
              Inspect <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          {kpiFilter === 'IN_PRODUCTION' && (
            <span className="absolute -top-2 right-3 bg-amber-800 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase">
              Filter Active
            </span>
          )}
        </button>

        {/* Ready for Dispatch */}
        <button
          type="button"
          onClick={() =>
            openMilestoneContext(
              'READY',
              '3. Finished Goods Staging — Ground-Truth Context',
              'Inspected & QA passed ready stock awaiting customer dispatches',
              'Finished Goods',
              'sky'
            )
          }
          className={`text-left p-4 rounded-2xl border transition-all duration-150 relative group cursor-pointer ${
            kpiFilter === 'READY'
              ? 'border-sky-700 bg-sky-50 text-sky-950 shadow-md ring-2 ring-sky-600/30'
              : 'border-sky-200 bg-sky-50/40 hover:bg-sky-50/70 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-900">Ready to Ship</span>
            <CheckCircle className="h-4 w-4 text-sky-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-sky-800">{formatNumber(readyStockTotal)}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-sky-700">
            <span>{readyBatchesCount} finished batches</span>
            <span className="font-bold flex items-center gap-0.5 group-hover:underline">
              Inspect <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          {kpiFilter === 'READY' && (
            <span className="absolute -top-2 right-3 bg-sky-800 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase">
              Filter Active
            </span>
          )}
        </button>

        {/* Total Dispatched */}
        <button
          type="button"
          onClick={() =>
            openMilestoneContext(
              'DISPATCHED',
              '4. Dispatched & Fulfilled — Ground-Truth Context',
              'Fulfilled shipments dispatched and delivered to client accounts',
              'Fulfilled Orders',
              'violet'
            )
          }
          className={`text-left p-4 rounded-2xl border transition-all duration-150 relative group cursor-pointer ${
            kpiFilter === 'DISPATCHED'
              ? 'border-violet-700 bg-violet-50 text-violet-950 shadow-md ring-2 ring-violet-600/30'
              : 'border-violet-200 bg-violet-50/40 hover:bg-violet-50/70 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-violet-900">Total Dispatched</span>
            <Truck className="h-4 w-4 text-violet-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-violet-800">{formatNumber(totalDispatched)}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-violet-700">
            <span>{dispatches.length} shipments done</span>
            <span className="font-bold flex items-center gap-0.5 group-hover:underline">
              Inspect <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          {kpiFilter === 'DISPATCHED' && (
            <span className="absolute -top-2 right-3 bg-violet-800 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase">
              Filter Active
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════
          PHYSICAL INVENTORY LIFECYCLE & TIMELINE PIPELINE
          (100% RECONCILED GROUND-TRUTH VOLUMES, ZERO PERCENTAGES)
      ═══════════════════════════════════════════════════════ */}
      <Card className="p-5 border-slate-200 bg-white shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-indigo-600 animate-pulse" />
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-800">
                Physical Inventory Flow & Lifecycle Timeline
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Reconciled progression of all {formatNumber(totalReceived)} inward units across manufacturing milestones and client fulfillment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              Intake Span: {earliestInwardDate ? formatDate(earliestInwardDate) : '—'} → {latestInwardDate ? formatDate(latestInwardDate) : '—'}
            </span>
            {latestDispatchDate && (
              <span className="inline-flex items-center gap-1 font-semibold text-violet-800 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-lg">
                <Truck className="h-3.5 w-3.5 text-violet-600" />
                Latest Dispatch: {formatDate(latestDispatchDate)}
              </span>
            )}
          </div>
        </div>

        {/* 4 Physical Lifecycle Milestone Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Milestone 1: Raw Stock Buffer */}
          <button
            type="button"
            onClick={() =>
              openMilestoneContext(
                'RAW',
                '1. Raw Material Intake — Ground-Truth Context',
                'Intake buffer stock waiting to enter production floor pipeline',
                'Raw Stock Buffer',
                'slate'
              )
            }
            className={`text-left p-3.5 rounded-xl border transition-all duration-150 relative overflow-hidden group cursor-pointer ${
              kpiFilter === 'RAW'
                ? 'border-slate-800 bg-slate-100 shadow-md ring-2 ring-slate-800'
                : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 hover:border-slate-400 hover:shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                1. Raw Material Intake
              </span>
              <span className="text-[10px] font-black text-slate-700 bg-slate-200 group-hover:bg-slate-800 group-hover:text-white px-1.5 py-0.5 rounded transition-colors flex items-center gap-1">
                <Maximize2 className="h-2.5 w-2.5" /> Buffer
              </span>
            </div>
            <p className="text-xl font-black text-slate-900 mt-1">
              {formatNumber(rawStockTotal)} <span className="text-xs font-bold text-slate-500">units</span>
            </p>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{rawBatchesCount} {rawBatchesCount === 1 ? 'batch' : 'batches'} waiting</span>
              <span className="font-semibold text-indigo-600 group-hover:underline text-[11px] flex items-center gap-0.5">
                Inspect Context <ChevronRight className="h-3 w-3" />
              </span>
            </div>
            {kpiFilter === 'RAW' && (
              <div className="absolute top-0 right-0 h-full w-1 bg-slate-800" />
            )}
          </button>

          {/* Milestone 2: Active Floor WIP */}
          <button
            type="button"
            onClick={() =>
              openMilestoneContext(
                'IN_PRODUCTION',
                '2. Active Conversion (WIP) — Ground-Truth Context',
                'Work in progress batches undergoing machine conversion stages',
                'Active Floor WIP',
                'amber'
              )
            }
            className={`text-left p-3.5 rounded-xl border transition-all duration-150 relative overflow-hidden group cursor-pointer ${
              kpiFilter === 'IN_PRODUCTION'
                ? 'border-amber-600 bg-amber-100/70 shadow-md ring-2 ring-amber-500'
                : 'border-amber-200 bg-amber-50/50 hover:bg-amber-100/60 hover:border-amber-400 hover:shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                2. Active Conversion (WIP)
              </span>
              <span className="text-[10px] font-black text-amber-900 bg-amber-200 group-hover:bg-amber-800 group-hover:text-white px-1.5 py-0.5 rounded transition-colors flex items-center gap-1">
                <Maximize2 className="h-2.5 w-2.5" /> In Machine
              </span>
            </div>
            <p className="text-xl font-black text-amber-900 mt-1">
              {formatNumber(productionTotal)} <span className="text-xs font-bold text-amber-700">units</span>
            </p>
            <div className="mt-1 flex items-center justify-between text-xs text-amber-800">
              <span>{productionBatchesCount} {productionBatchesCount === 1 ? 'batch' : 'batches'} in WIP</span>
              <span className="font-semibold text-amber-700 group-hover:underline text-[11px] flex items-center gap-0.5">
                Inspect Context <ChevronRight className="h-3 w-3" />
              </span>
            </div>
            {kpiFilter === 'IN_PRODUCTION' && (
              <div className="absolute top-0 right-0 h-full w-1 bg-amber-500" />
            )}
          </button>

          {/* Milestone 3: Finished Goods Staging */}
          <button
            type="button"
            onClick={() =>
              openMilestoneContext(
                'READY',
                '3. Finished Goods Staging — Ground-Truth Context',
                'Inspected & QA passed ready stock awaiting customer dispatches',
                'Finished Goods',
                'sky'
              )
            }
            className={`text-left p-3.5 rounded-xl border transition-all duration-150 relative overflow-hidden group cursor-pointer ${
              kpiFilter === 'READY'
                ? 'border-sky-600 bg-sky-100/70 shadow-md ring-2 ring-sky-500'
                : 'border-sky-200 bg-sky-50/50 hover:bg-sky-100/60 hover:border-sky-400 hover:shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-800 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                3. Finished Goods Staging
              </span>
              <span className="text-[10px] font-black text-sky-900 bg-sky-200 group-hover:bg-sky-800 group-hover:text-white px-1.5 py-0.5 rounded transition-colors flex items-center gap-1">
                <Maximize2 className="h-2.5 w-2.5" /> Inspected
              </span>
            </div>
            <p className="text-xl font-black text-sky-900 mt-1">
              {formatNumber(readyStockTotal)} <span className="text-xs font-bold text-sky-700">units</span>
            </p>
            <div className="mt-1 flex items-center justify-between text-xs text-sky-800">
              <span>{readyBatchesCount} {readyBatchesCount === 1 ? 'batch' : 'batches'} ready</span>
              <span className="font-semibold text-sky-700 group-hover:underline text-[11px] flex items-center gap-0.5">
                Inspect Context <ChevronRight className="h-3 w-3" />
              </span>
            </div>
            {kpiFilter === 'READY' && (
              <div className="absolute top-0 right-0 h-full w-1 bg-sky-500" />
            )}
          </button>

          {/* Milestone 4: Shipped & Dispatched */}
          <button
            type="button"
            onClick={() =>
              openMilestoneContext(
                'DISPATCHED',
                '4. Dispatched & Fulfilled — Ground-Truth Context',
                'Fulfilled shipments dispatched and delivered to client accounts',
                'Fulfilled Orders',
                'violet'
              )
            }
            className={`text-left p-3.5 rounded-xl border transition-all duration-150 relative overflow-hidden group cursor-pointer ${
              kpiFilter === 'DISPATCHED'
                ? 'border-violet-600 bg-violet-100/70 shadow-md ring-2 ring-violet-500'
                : 'border-violet-200 bg-violet-50/50 hover:bg-violet-100/60 hover:border-violet-400 hover:shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-violet-800 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-violet-500" />
                4. Dispatched & Fulfilled
              </span>
              <span className="text-[10px] font-black text-violet-900 bg-violet-200 group-hover:bg-violet-800 group-hover:text-white px-1.5 py-0.5 rounded transition-colors flex items-center gap-1">
                <Maximize2 className="h-2.5 w-2.5" /> Fulfilled
              </span>
            </div>
            <p className="text-xl font-black text-violet-900 mt-1">
              {formatNumber(totalDispatched)} <span className="text-xs font-bold text-violet-700">units</span>
            </p>
            <div className="mt-1 flex items-center justify-between text-xs text-violet-800">
              <span>{dispatches.length} shipments to {uniqueCustomersCount} customers</span>
              <span className="font-semibold text-violet-700 group-hover:underline text-[11px] flex items-center gap-0.5">
                Inspect Context <ChevronRight className="h-3 w-3" />
              </span>
            </div>
            {kpiFilter === 'DISPATCHED' && (
              <div className="absolute top-0 right-0 h-full w-1 bg-violet-500" />
            )}
          </button>
        </div>

        {/* Proportional Physical Volume Segment Visualizer (Clean Absolute Labels) */}
        {totalReceived > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 flex p-0.5 border border-slate-200">
              {rawStockTotal > 0 && (
                <div
                  style={{ flexGrow: rawStockTotal }}
                  className="bg-slate-400 h-full rounded-l-full cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() =>
                    openMilestoneContext(
                      'RAW',
                      '1. Raw Material Intake — Ground-Truth Context',
                      'Intake buffer stock waiting to enter production floor pipeline',
                      'Raw Stock Buffer',
                      'slate'
                    )
                  }
                  title={`Raw Stock: ${formatNumber(rawStockTotal)} bottles (Click for full context)`}
                />
              )}
              {productionTotal > 0 && (
                <div
                  style={{ flexGrow: productionTotal }}
                  className="bg-amber-500 h-full cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() =>
                    openMilestoneContext(
                      'IN_PRODUCTION',
                      '2. Active Conversion (WIP) — Ground-Truth Context',
                      'Work in progress batches undergoing machine conversion stages',
                      'Active Floor WIP',
                      'amber'
                    )
                  }
                  title={`In Production: ${formatNumber(productionTotal)} bottles (Click for full context)`}
                />
              )}
              {readyStockTotal > 0 && (
                <div
                  style={{ flexGrow: readyStockTotal }}
                  className="bg-sky-500 h-full cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() =>
                    openMilestoneContext(
                      'READY',
                      '3. Finished Goods Staging — Ground-Truth Context',
                      'Inspected & QA passed ready stock awaiting customer dispatches',
                      'Finished Goods',
                      'sky'
                    )
                  }
                  title={`Ready to Ship: ${formatNumber(readyStockTotal)} bottles (Click for full context)`}
                />
              )}
              {totalDispatched > 0 && (
                <div
                  style={{ flexGrow: totalDispatched }}
                  className="bg-violet-500 h-full rounded-r-full cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() =>
                    openMilestoneContext(
                      'DISPATCHED',
                      '4. Dispatched & Fulfilled — Ground-Truth Context',
                      'Fulfilled shipments dispatched and delivered to client accounts',
                      'Fulfilled Orders',
                      'violet'
                    )
                  }
                  title={`Dispatched: ${formatNumber(totalDispatched)} bottles (Click for full context)`}
                />
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════
          INTERACTIVE MANUFACTURING CONVEYOR PIPELINE
      ═══════════════════════════════════════════════════════ */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-slate-700" />
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-800">
              Live Factory Conveyor Pipeline
            </h2>
            <span className="text-xs text-slate-400">
              (Click any stage to inspect ground-truth context)
            </span>
          </div>
          {selectedStageId !== 'ALL' && (
            <button
              type="button"
              onClick={() => setSelectedStageId('ALL')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
            >
              Reset Stage Filter ✕
            </button>
          )}
        </div>

        {/* Conveyor Grid with Directional Flow */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {stageBreakdown.map(({ stage, totalQty, batches: stageBatches }, idx) => {
            const isSelected = selectedStageId === stage.id;

            return (
              <div key={stage.id} className="relative group">
                <button
                  type="button"
                  onClick={() => openStageContext(stage)}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-150 relative overflow-hidden group cursor-pointer ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white shadow-md ring-2 ring-slate-900/30'
                      : totalQty > 0
                      ? 'border-slate-200 bg-white hover:border-slate-400 hover:shadow-2xs'
                      : 'border-slate-200 bg-slate-50/50 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black ${
                        isSelected ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {stage.sequence_no}
                    </span>
                    <span
                      className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${
                        isSelected
                          ? 'bg-slate-800 text-slate-200'
                          : totalQty > 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Maximize2 className="h-2.5 w-2.5 opacity-70 group-hover:opacity-100" />
                      {stageBatches.length} {stageBatches.length === 1 ? 'batch' : 'batches'}
                    </span>
                  </div>

                  <p className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                    {stage.name}
                  </p>

                  <p
                    className={`mt-1 text-xl font-black ${
                      isSelected ? 'text-white' : totalQty > 0 ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {formatNumber(totalQty)}
                  </p>

                  <div className="mt-1 flex items-center justify-between text-[10px]">
                    <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>
                      {stageBatches.length} active
                    </span>
                    <span className={`font-semibold group-hover:underline flex items-center gap-0.5 ${isSelected ? 'text-amber-300 font-extrabold' : 'text-slate-700'}`}>
                      Context <ChevronRight className="h-2.5 w-2.5" />
                    </span>
                  </div>

                  {isSelected && (
                    <div className="absolute top-0 right-0 h-full w-1 bg-amber-400" />
                  )}
                </button>

                {/* Connecting arrow for desktop pipeline */}
                {idx < stageBreakdown.length - 1 && (
                  <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                    <div className="h-4 w-4 rounded-full bg-slate-200 border border-white flex items-center justify-center text-slate-500 shadow-2xs">
                      <ChevronRight className="h-3 w-3" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          MANAGER VIEW CONTROLS & MULTI-FILTER TOOLBAR
      ═══════════════════════════════════════════════════════ */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 pb-3">
          {/* Tab Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('batch-matrix')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'batch-matrix'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Batch 360° Matrix ({batches.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('stages')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'stages'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Live Stage Groups ({processStages.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('transitions')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'transitions'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Transitions Ledger ({movements.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('dispatches')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'dispatches'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Truck className="h-3.5 w-3.5" />
              Dispatches ({dispatches.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('locations')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'locations'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              Racks & Suppliers ({locations.length})
            </button>
          </div>

          {/* Search and Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Supplier Filter */}
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition focus:border-slate-900 focus:outline-none shadow-2xs"
            >
              <option value="ALL">All Suppliers ({suppliers.length})</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* Item Filter */}
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition focus:border-slate-900 focus:outline-none shadow-2xs"
            >
              <option value="ALL">All Items ({items.length})</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>

            {/* Global Search */}
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
                  className="text-slate-400 hover:text-slate-700 ml-1"
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
                  className="text-slate-400 hover:text-slate-700 ml-1"
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
                  className="text-slate-400 hover:text-slate-700 ml-1"
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
                  className="text-slate-400 hover:text-slate-700 ml-1"
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
                  className="text-slate-400 hover:text-slate-700 ml-1"
                >
                  ✕
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={resetAllFilters}
              className="ml-auto text-xs font-black text-rose-600 hover:text-rose-800 hover:underline"
            >
              Clear All ({activeFilterCount})
            </button>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
          TAB 1: BATCH 360° MATRIX (MASTER COMMAND CENTER TABLE)
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'batch-matrix' && (
        <Card className="p-0 overflow-hidden border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-5 py-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900">
                  Batch 360° Comprehensive Journey Matrix
                </h2>
                <Badge label={`${filteredBatchMatrix.length} batches shown`} variant="default" size="sm" />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Exact balance of every batch across every manufacturing stage, customer dispatches, batch aging days, and on-floor status. Click any row to expand chronological audit ledger.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={expandAllRows}
                className="text-xs font-bold text-slate-700"
              >
                {expandedBatchIds.size === batches.length ? 'Collapse All Rows' : 'Expand All Timelines'}
              </Button>
            </div>
          </div>

          {filteredBatchMatrix.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              <AlertCircle className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="font-bold text-slate-700">No batches match the active filters.</p>
              <p className="text-xs text-slate-400 mt-1">Try clearing filters or changing search query.</p>
              {activeFilterCount > 0 && (
                <Button variant="outline" size="sm" onClick={resetAllFilters} className="mt-3 text-xs">
                  Reset All Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-100 text-left text-xs font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 select-none">
                  <tr>
                    <th className="px-3 py-3 w-10 text-center">#</th>
                    {/* Sticky Column: Batch No */}
                    <th className="px-4 py-3 sticky left-0 z-20 bg-slate-100 sticky-col-shadow min-w-[180px]">
                      Brand / Batch
                    </th>
                    <th className="px-4 py-3 min-w-[140px]">Item / Bottle</th>
                    <th className="px-3 py-3 min-w-[120px]">Supplier</th>
                    <th className="px-3 py-3 min-w-[80px]">Rack</th>
                    <th className="px-3 py-3 text-center min-w-[90px]">Floor Aging</th>
                    <th className="px-3 py-3 text-right font-black text-slate-900 min-w-[90px]">
                      Inward Total
                    </th>
                    {processStages.map((s) => (
                      <th
                        key={s.id}
                        className={`px-3 py-3 text-right min-w-[105px] ${
                          selectedStageId === s.id ? 'bg-amber-100 text-amber-950 font-black' : ''
                        }`}
                      >
                        {s.name}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right font-black text-violet-900 min-w-[95px]">
                      Dispatched
                    </th>
                    <th className="px-4 py-3 text-right font-black text-emerald-900 bg-emerald-50/50 min-w-[110px]">
                      On-Floor Balance
                    </th>
                    <th className="px-4 py-3 min-w-[140px]">Customer Link</th>
                    <th className="px-4 py-3 text-right min-w-[110px]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredBatchMatrix.map((item) => {
                    const isExpanded = expandedBatchIds.has(item.batch.id);

                    return (
                      <tr key={item.batch.id} className="group hover:bg-slate-50/90 transition-colors">
                        {/* Expand Button */}
                        <td className="px-3 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleRowAccordion(item.batch.id)}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-200 transition"
                            title={isExpanded ? 'Collapse timeline' : 'Expand full timeline'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-900 font-bold" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>

                        {/* Sticky Column: Batch No & Thumbnail */}
                        <td className="px-4 py-3.5 font-bold text-slate-900 sticky left-0 z-10 bg-white group-hover:bg-slate-50 sticky-col-shadow">
                          <div className="flex items-center gap-2.5">
                            {item.batch.image_url ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setZoomImageUrl({
                                    url: item.batch.image_url!,
                                    title: item.batch.item?.name ?? 'Bottle Photo',
                                    batchNo: item.batch.batch_no,
                                  })
                                }
                                className="relative group/img shrink-0"
                                title="Click to enlarge"
                              >
                                <img
                                  src={item.batch.image_url}
                                  alt={item.batch.batch_no}
                                  className="h-8 w-8 rounded-lg object-cover border border-slate-200 shadow-2xs group-hover/img:scale-105 transition"
                                />
                                <div className="absolute inset-0 bg-black/30 rounded-lg opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition">
                                  <Maximize2 className="h-3 w-3 text-white" />
                                </div>
                              </button>
                            ) : (
                              <div className="h-8 w-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                                IMG
                              </div>
                            )}
                            <div>
                              <p className="font-extrabold text-slate-900 leading-tight">{item.batch.batch_no}</p>
                              <p className="text-[10px] text-slate-400 font-medium">{formatDate(item.batch.received_on)}</p>
                            </div>
                          </div>
                        </td>

                        {/* Item Name */}
                        <td className="px-4 py-3.5 font-bold text-slate-800">
                          {item.batch.item?.name ?? '—'}
                        </td>

                        {/* Supplier */}
                        <td className="px-3 py-3.5 text-xs text-slate-600 font-medium">
                          {item.batch.supplier?.name ?? '—'}
                        </td>

                        {/* Rack Location */}
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            {item.batch.location}
                          </span>
                        </td>

                        {/* Floor Aging Badge */}
                        <td className="px-3 py-3.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              item.isStalled
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : item.ageInDays <= 2
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <Clock className="h-3 w-3" />
                            {item.ageInDays === 0 ? 'Today' : `${item.ageInDays}d`}
                          </span>
                        </td>

                        {/* Inward Total */}
                        <td className="px-3 py-3.5 text-right font-black text-slate-900">
                          {formatNumber(item.batch.qty_received)}
                        </td>

                        {/* Stage Columns */}
                        {processStages.map((s) => {
                          const qty = item.stageQuantities[s.id] ?? 0;

                          return (
                            <td
                              key={s.id}
                              className={`px-3 py-3.5 text-right font-bold transition-colors ${
                                qty > 0
                                  ? 'text-slate-900 bg-emerald-50/40'
                                  : 'text-slate-300'
                              } ${selectedStageId === s.id ? 'bg-amber-100/70 text-amber-950 font-black' : ''}`}
                            >
                              {qty > 0 ? (
                                <span className="font-black text-slate-900">{formatNumber(qty)}</span>
                              ) : (
                                '—'
                              )}
                            </td>
                          );
                        })}

                        {/* Dispatched */}
                        <td className="px-3 py-3.5 text-right font-black text-violet-800">
                          {item.dispatchedQty > 0 ? formatNumber(item.dispatchedQty) : '—'}
                        </td>

                        {/* Factory Balance */}
                        <td className="px-4 py-3.5 text-right font-black text-emerald-800 bg-emerald-50/50 text-base">
                          {formatNumber(item.inFactoryQty)}
                        </td>

                        {/* Customer Link */}
                        <td className="px-4 py-3.5">
                          {item.customerNames.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {item.customerNames.map((c) => (
                                <span
                                  key={c}
                                  className="rounded bg-violet-100 border border-violet-200 text-violet-800 text-[10px] font-bold px-1.5 py-0.5"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No shipments yet</span>
                          )}
                        </td>

                        {/* Quick Action Button */}
                        <td className="px-4 py-3.5 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openQuickModal(item.batch.id)}
                            className="text-xs font-bold text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 border-indigo-200"
                          >
                            <Zap className="h-3 w-3 text-indigo-600" />
                            Move / Ship
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* ═════════════════════════════════════════════════
                  EXPANDABLE ROW ACCORDION (INLINE AUDIT LEDGER)
              ═════════════════════════════════════════════════ */}
              {filteredBatchMatrix
                .filter((item) => expandedBatchIds.has(item.batch.id))
                .map((item) => (
                  <div
                    key={`accordion-${item.batch.id}`}
                    className="p-5 bg-slate-900 text-white border-y border-slate-700 animate-in fade-in duration-150"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
                        <div>
                          <h4 className="text-base font-black flex items-center gap-2">
                            Batch Audit Ledger: <span className="text-amber-400">{item.batch.batch_no}</span>
                            <span className="text-xs font-normal text-slate-400">
                              ({item.batch.item?.name ?? '—'} from {item.batch.supplier?.name ?? '—'})
                            </span>
                          </h4>
                          <p className="text-xs text-slate-400">
                            Received {formatNumber(item.batch.qty_received)} units on {formatDate(item.batch.received_on)} ({item.ageInDays} days on floor) • Storage Rack: {item.batch.location}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openQuickModal(item.batch.id, 'move')}
                          className="text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white border-none"
                        >
                          <Zap className="h-3.5 w-3.5 text-amber-300" />
                          Record Stage Movement
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openQuickModal(item.batch.id, 'dispatch')}
                          className="text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white border-none"
                        >
                          <Truck className="h-3.5 w-3.5" />
                          Record Dispatch
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                      {/* Movement History Stream */}
                      <div className="space-y-2">
                        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <History className="h-4 w-4 text-indigo-400" />
                          Stage Transition Timeline ({item.movements.length})
                        </h5>
                        {item.movements.length === 0 ? (
                          <p className="text-xs text-slate-500 italic py-2">
                            No stage transitions recorded yet. Entire batch is currently in Raw Stock.
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {item.movements.map((m) => (
                              <div
                                key={m.id}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs"
                              >
                                <div>
                                  <div className="flex items-center gap-2 font-bold text-slate-200">
                                    <span>{m.from_stage?.name ?? '—'}</span>
                                    <ArrowRight className="h-3 w-3 text-indigo-400" />
                                    <span className="text-amber-400">{m.to_stage?.name ?? '—'}</span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    {formatDate(m.moved_on)} {m.done_by ? `• by ${m.done_by}` : ''} {m.remarks ? `• "${m.remarks}"` : ''}
                                  </p>
                                  {(m.cap_name || m.atomizer_name) && (
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                      {m.cap_name && (
                                        <span className="inline-flex items-center gap-1 rounded bg-violet-900/60 px-1.5 py-0.5 text-[9px] font-bold text-violet-300 border border-violet-700">
                                          🧴 Cap: {m.cap_name}
                                        </span>
                                      )}
                                      {m.atomizer_name && (
                                        <span className="inline-flex items-center gap-1 rounded bg-sky-900/60 px-1.5 py-0.5 text-[9px] font-bold text-sky-300 border border-sky-700">
                                          💨 Atomizer: {m.atomizer_name}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right">
                                  <span className="font-extrabold text-emerald-400 text-sm">
                                    {formatNumber(m.qty_moved)}
                                  </span>
                                  <p className="text-[10px] text-slate-400">bottles moved</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Dispatch History Stream */}
                      <div className="space-y-2">
                        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Truck className="h-4 w-4 text-violet-400" />
                          Customer Shipments & Invoices ({item.dispatches.length})
                        </h5>
                        {item.dispatches.length === 0 ? (
                          <p className="text-xs text-slate-500 italic py-2">
                            No finished goods dispatched to clients yet from this batch.
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {item.dispatches.map((d) => (
                              <div
                                key={d.id}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs"
                              >
                                <div>
                                  <p className="font-extrabold text-white">{d.customer_name}</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    Invoice: <span className="font-semibold text-slate-300">{d.invoice_no}</span> • {formatDate(d.dispatched_on)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="font-extrabold text-violet-400 text-sm">
                                    {formatNumber(d.qty)}
                                  </span>
                                  <p className="text-[10px] text-slate-400">units shipped</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 2: LIVE STAGES WITH GRANULAR GROUP TABLES
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'stages' && (
        <div className="space-y-5">
          {filteredStageBreakdown.map(({ stage, totalQty, batches: sBatches }) => {
            if (sBatches.length === 0 && selectedStageId !== 'ALL') {
              return (
                <Card key={stage.id} className="p-8 text-center text-sm text-slate-500">
                  No stock currently inside {stage.name} matching active filters.
                </Card>
              );
            }
            if (sBatches.length === 0) return null;

            return (
              <Card key={stage.id} className="p-0 overflow-hidden border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-5 py-3.5 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-white shadow-2xs">
                      {stage.sequence_no}
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        {stage.name} Stage
                        <Badge label={`${formatNumber(totalQty)} units`} variant="emerald" size="sm" />
                      </h3>
                      <p className="text-xs text-slate-500">
                        {sBatches.length} {sBatches.length === 1 ? 'batch' : 'batches'} sitting in this stage
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openQuickModal()}
                    className="text-xs font-bold text-indigo-700 bg-white"
                  >
                    <Zap className="h-3.5 w-3.5 text-indigo-600" />
                    Quick Move Stock
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100/70 text-left text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Brand / Batch</th>
                        <th className="px-4 py-3">Item / Bottle</th>
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3">Warehouse Rack</th>
                        <th className="px-4 py-3">Inward Date</th>
                        <th className="px-4 py-3 text-center">Floor Aging</th>
                        <th className="px-4 py-3">Customer Link</th>
                        <th className="px-4 py-3 text-right font-extrabold text-emerald-800">
                          Qty in {stage.name}
                        </th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sBatches.map((bItem) => (
                        <tr key={bItem.batch.id} className="transition hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              {bItem.batch.image_url ? (
                                <img
                                  src={bItem.batch.image_url}
                                  alt={bItem.batch.batch_no}
                                  className="h-8 w-8 rounded-lg object-cover border border-slate-200 cursor-pointer"
                                  onClick={() =>
                                    setZoomImageUrl({
                                      url: bItem.batch.image_url!,
                                      title: bItem.batch.item?.name ?? 'Photo',
                                      batchNo: bItem.batch.batch_no,
                                    })
                                  }
                                />
                              ) : (
                                <div className="h-8 w-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                  IMG
                                </div>
                              )}
                              <span>{bItem.batch.batch_no}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-800 font-semibold">{bItem.batch.item?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{bItem.batch.supplier?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              {bItem.batch.location}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(bItem.batch.received_on)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                              <Clock className="h-3 w-3" />
                              {bItem.ageInDays === 0 ? 'Today' : `${bItem.ageInDays}d`}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {bItem.customerNames.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {bItem.customerNames.map((c) => (
                                  <span
                                    key={c}
                                    className="rounded-md bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700"
                                  >
                                    {c}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">No shipments yet</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-base font-black text-emerald-700">
                              {formatNumber(bItem.qty)}
                            </span>
                            <span className="text-xs font-semibold text-slate-500 ml-1">units</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openQuickModal(bItem.batch.id)}
                              className="text-xs font-bold text-indigo-700 hover:text-indigo-900"
                            >
                              Transition <ArrowRight className="h-3 w-3 ml-1" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 3: FACTORY TRANSITIONS LEDGER
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'transitions' && (
        <Card className="p-0 overflow-hidden border-slate-200">
          <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Real-Time Factory Transitions Ledger
              </h2>
              <p className="text-xs text-slate-500">
                Immutable audit trail of all bottle movements between manufacturing stages with dates and operator remarks.
              </p>
            </div>
            <Badge label={`${filteredMovements.length} transitions`} variant="indigo" />
          </div>

          {filteredMovements.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No stage transitions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Brand / Batch</th>
                    <th className="px-4 py-3">Item / Bottle</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Stage Transition</th>
                    <th className="px-4 py-3">Cap & Atomizer Spec</th>
                    <th className="px-4 py-3 text-right font-extrabold text-slate-900">Qty Moved</th>
                    <th className="px-4 py-3">Operator Remarks / Done By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMovements.map((m) => (
                    <tr key={m.id} className="transition hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-xs font-medium text-slate-500">{formatDate(m.moved_on)}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{m.batchNo}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{m.itemName}</td>
                      <td className="px-4 py-3 text-slate-600">{m.supplierName}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 text-xs font-bold text-indigo-900">
                          {m.from_stage?.name ?? '—'}
                          <ArrowRight className="h-3 w-3 text-indigo-500" />
                          {m.to_stage?.name ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {m.cap_name || m.atomizer_name ? (
                          <div className="flex flex-col gap-1 text-xs">
                            {m.cap_name && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800 border border-violet-200">
                                🧴 Cap: {m.cap_name}
                              </span>
                            )}
                            {m.atomizer_name && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-800 border border-sky-200">
                                💨 Atomizer: {m.atomizer_name}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-emerald-700">
                        {formatNumber(m.qty_moved)} <span className="text-xs font-normal text-slate-500">units</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {m.remarks || m.done_by ? `${m.remarks ?? ''} ${m.done_by ? `(by ${m.done_by})` : ''}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 4: CUSTOMER DISPATCHES LOG
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'dispatches' && (
        <Card className="p-0 overflow-hidden border-slate-200">
          <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Customer Dispatches & Shipments
              </h2>
              <p className="text-xs text-slate-500">
                All finished goods shipped to clients with customer name, invoice, date, and batch origin.
              </p>
            </div>
            <Badge label={`${filteredDispatches.length} shipments`} variant="sky" />
          </div>

          {filteredDispatches.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No customer dispatches recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Dispatch Date</th>
                    <th className="px-4 py-3">Customer Name</th>
                    <th className="px-4 py-3">Invoice No</th>
                    <th className="px-4 py-3">Origin Brand / Batch</th>
                    <th className="px-4 py-3">Item Shipped</th>
                    <th className="px-4 py-3">Supplier Origin</th>
                    <th className="px-4 py-3 text-right font-extrabold text-violet-800">Dispatched Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDispatches.map((d) => (
                    <tr key={d.id} className="transition hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(d.dispatched_on)}</td>
                      <td className="px-4 py-3 font-black text-slate-900 text-base">{d.customer_name}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold">
                          {d.invoice_no}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-indigo-700">{d.batchNo}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{d.itemName}</td>
                      <td className="px-4 py-3 text-slate-600">{d.supplierName}</td>
                      <td className="px-4 py-3 text-right font-black text-violet-700 text-base">
                        {formatNumber(d.qty)} <span className="text-xs font-normal text-slate-500">units</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 5: LOCATIONS & SUPPLIERS ANALYTICS (NO PERCENTAGES)
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'locations' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Storage Locations */}
          <Card>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 mb-4">
              <MapPin className="h-5 w-5 text-slate-500" />
              Warehouse Storage Racks & Live Unit Load
            </h3>
            {locations.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No location stock recorded.</p>
            ) : (
              <div className="space-y-3">
                {locations.map((loc) => {
                  return (
                    <div
                      key={loc.location}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{loc.location}</p>
                          <p className="text-xs text-slate-500">Active Storage Bay</p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-black text-slate-900">{formatNumber(loc.qty)} <span className="text-xs font-normal text-slate-500">units</span></p>
                          <p className="text-[11px] font-semibold text-slate-600">On-floor balance</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Supplier Breakdown */}
          <Card>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 mb-4">
              <Building2 className="h-5 w-5 text-slate-500" />
              Supplier Inward Contributions
            </h3>
            {batches.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No supplier inward data.</p>
            ) : (
              <div className="space-y-3">
                {Array.from(
                  batches.reduce((acc, b) => {
                    const name = b.supplier?.name ?? 'Unknown Supplier';
                    const cur = acc.get(name) ?? { batches: 0, received: 0 };
                    cur.batches += 1;
                    cur.received += b.qty_received;
                    acc.set(name, cur);
                    return acc;
                  }, new Map<string, { batches: number; received: number }>())
                ).map(([name, data]) => {
                  return (
                    <div
                      key={name}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{name}</p>
                          <p className="text-xs text-slate-500">{data.batches} inward batches</p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-black text-indigo-700">{formatNumber(data.received)} <span className="text-xs font-normal text-slate-500">units</span></p>
                          <p className="text-[11px] font-semibold text-slate-600">Total received</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 1: IN-PLACE QUICK TRANSITION / DISPATCH MODAL
      ═══════════════════════════════════════════════════════ */}
      {quickModalOpen && (
        <Modal
          isOpen={quickModalOpen}
          onClose={() => setQuickModalOpen(false)}
          title="⚡ Quick Factory Operation"
        >
          <div className="space-y-4">
            {quickError && <ErrorBanner message={quickError} />}
            {quickSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {quickSuccess}
              </div>
            )}

            {/* Modal Tabs */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setQuickModalTab('move')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  quickModalTab === 'move'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="inline h-3.5 w-3.5 mr-1 text-amber-500" />
                Stage Transfer
              </button>
              <button
                type="button"
                onClick={() => setQuickModalTab('dispatch')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  quickModalTab === 'dispatch'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Truck className="inline h-3.5 w-3.5 mr-1 text-violet-600" />
                Customer Dispatch
              </button>
            </div>

            <form onSubmit={handleQuickSubmit} className="space-y-4">
              {/* Batch Selector */}
              <Field label="Select Batch / Party" required>
                <select
                  value={quickBatchId}
                  onChange={(e) => {
                    setQuickBatchId(e.target.value);
                    const bItem = calculations.batchMatrix.find((bm) => bm.batch.id === e.target.value);
                    if (bItem && bItem.activeStages.length > 0) {
                      setQuickFromStageId(bItem.activeStages[0].stageId);
                      const currentSeq = bItem.activeStages[0].sequenceNo;
                      const nextStage = processStages.find((s) => s.sequence_no > currentSeq);
                      if (nextStage) setQuickToStageId(nextStage.id);
                    }
                  }}
                  className={inputClass}
                  required
                >
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batch_no} — {b.item?.name ?? 'Item'} ({formatNumber(b.qty_received)} inward)
                    </option>
                  ))}
                </select>
              </Field>

              {/* Stage Move Fields */}
              {quickModalTab === 'move' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="From Stage" required>
                      <select
                        value={quickFromStageId}
                        onChange={(e) => {
                          setQuickFromStageId(e.target.value);
                          const cur = availableStagesForBatch.find((as) => as.stageId === e.target.value);
                          if (cur) {
                            const nextStage = processStages.find((s) => s.sequence_no > cur.sequenceNo);
                            if (nextStage) setQuickToStageId(nextStage.id);
                          }
                        }}
                        className={inputClass}
                        required
                      >
                        {availableStagesForBatch.length === 0 ? (
                          <option value="">No stock in stages</option>
                        ) : (
                          availableStagesForBatch.map((as) => (
                            <option key={as.stageId} value={as.stageId}>
                              {as.stageName} ({formatNumber(as.qty)} available)
                            </option>
                          ))
                        )}
                      </select>
                    </Field>

                    <Field label="To Stage" required>
                      <select
                        value={quickToStageId}
                        onChange={(e) => setQuickToStageId(e.target.value)}
                        className={inputClass}
                        required
                      >
                        <option value="">Select destination…</option>
                        {processStages
                          .filter((s) => s.id !== quickFromStageId)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>

                  <Field
                    label="Quantity to Move"
                    required
                    hint={maxQtyAvailable > 0 ? `Max available in this stage: ${formatNumber(maxQtyAvailable)} units` : undefined}
                  >
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max={maxQtyAvailable}
                        value={quickQty}
                        onChange={(e) => setQuickQty(e.target.value)}
                        placeholder="Enter quantity"
                        className={inputClass}
                        required
                      />
                      {maxQtyAvailable > 0 && (
                        <button
                          type="button"
                          onClick={() => setQuickQty(String(maxQtyAvailable))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[10px] font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md"
                        >
                          MAX
                        </button>
                      )}
                    </div>
                  </Field>

                  {/* Mandatory Filling Specs if moving from Filling */}
                  {isQuickFromFilling && (
                    <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50/80 via-indigo-50/50 to-sky-50/80 p-3.5 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-violet-900 flex items-center gap-1.5">
                          🧴 Mandatory Filling Specifications
                        </span>
                        <Badge label="Required for Filling" variant="violet" size="sm" />
                      </div>
                      <p className="text-[11px] text-violet-700 font-medium leading-relaxed">
                        Bottles completing the Filling stage must have both the cap and atomizer models registered before moving.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Cap Name / Model" required>
                          <input
                            type="text"
                            value={quickCapName}
                            onChange={(e) => setQuickCapName(e.target.value)}
                            placeholder="e.g. Gold Metal Cap 24mm"
                            className={`${inputClass} font-semibold`}
                            required
                          />
                        </Field>
                        <Field label="Atomizer Name / Model" required>
                          <input
                            type="text"
                            value={quickAtomizerName}
                            onChange={(e) => setQuickAtomizerName(e.target.value)}
                            placeholder="e.g. Fine Mist Silver 24/410"
                            className={`${inputClass} font-semibold`}
                            required
                          />
                        </Field>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Remarks">
                      <input
                        type="text"
                        value={quickRemarks}
                        onChange={(e) => setQuickRemarks(e.target.value)}
                        placeholder="e.g. Color batch #2"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Operator Name">
                      <input
                        type="text"
                        value={quickDoneBy}
                        onChange={(e) => setQuickDoneBy(e.target.value)}
                        placeholder="e.g. John"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </>
              ) : (
                /* Customer Dispatch Fields */
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Customer Name" required>
                      <input
                        type="text"
                        value={quickCustomerName}
                        onChange={(e) => setQuickCustomerName(e.target.value)}
                        placeholder="e.g. ACME Corp"
                        className={inputClass}
                        required
                      />
                    </Field>

                    <Field label="Invoice / Challan #" required>
                      <input
                        type="text"
                        value={quickInvoiceNo}
                        onChange={(e) => setQuickInvoiceNo(e.target.value)}
                        placeholder="e.g. INV-2026-001"
                        className={inputClass}
                        required
                      />
                    </Field>
                  </div>

                  <Field
                    label="Dispatch Quantity (from Ready stage)"
                    required
                    hint={maxReadyQtyForDispatch > 0 ? `Max ready for dispatch: ${formatNumber(maxReadyQtyForDispatch)} units` : 'No finished stock in Ready stage'}
                  >
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max={maxReadyQtyForDispatch}
                        value={quickQty}
                        onChange={(e) => setQuickQty(e.target.value)}
                        placeholder="Enter quantity"
                        className={inputClass}
                        required
                      />
                      {maxReadyQtyForDispatch > 0 && (
                        <button
                          type="button"
                          onClick={() => setQuickQty(String(maxReadyQtyForDispatch))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[10px] font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md"
                        >
                          MAX
                        </button>
                      )}
                    </div>
                  </Field>

                  <Field label="Dispatch Date" required>
                    <input
                      type="date"
                      value={quickDispatchDate}
                      onChange={(e) => setQuickDispatchDate(e.target.value)}
                      className={inputClass}
                      required
                    />
                  </Field>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button variant="outline" type="button" onClick={() => setQuickModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  loading={quickSubmitting}
                  disabled={quickModalTab === 'move' && isQuickFromFilling && (!quickCapName.trim() || !quickAtomizerName.trim())}
                >
                  {quickModalTab === 'move' ? 'Confirm Stage Transfer' : 'Confirm Dispatch'}
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 2: HIGH RESOLUTION IMAGE ZOOM MODAL
      ═══════════════════════════════════════════════════════ */}
      {zoomImageUrl && (
        <Modal
          isOpen={Boolean(zoomImageUrl)}
          onClose={() => setZoomImageUrl(null)}
          title={`Bottle Photo — ${zoomImageUrl.batchNo}`}
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

      {/* ═══════════════════════════════════════════════════════
          MODAL 3: GROUND-TRUTH CONTEXT DRILLDOWN MODAL
          (100% RECONCILED DB LEDGER BREAKDOWN - ZERO HALLUCINATION)
      ═══════════════════════════════════════════════════════ */}
      {dynamicContext && calculations && (
        <Modal
          isOpen={Boolean(dynamicContext)}
          onClose={() => setDynamicContext(null)}
          title={dynamicContext.title}
          maxWidthClass="max-w-4xl"
        >
          <div className="space-y-4">
            {/* Context Subtitle & Filter Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <p className="text-xs font-semibold text-slate-700">{dynamicContext.subtitle}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Showing 100% ground-truth live data reconciled from Supabase inventory ledger. Zero assumptions.
                </p>
              </div>
              <Badge label={dynamicContext.badgeLabel} variant={dynamicContext.color} size="md" />
            </div>

            {/* Context Metric Cards */}
            {(() => {
              let scopeBatches: typeof calculations.batchMatrix = [];
              let scopeDispatches: typeof calculations.enrichedDispatches = [];
              let scopeTotalQty = 0;
              let isDispatchScope = false;

              if (dynamicContext.key === 'RAW') {
                scopeBatches = calculations.batchMatrix.filter(
                  (b) => (b.stageQuantities[stages?.find((s) => s.name === 'Raw Stock')?.id ?? ''] ?? 0) > 0
                );
                scopeTotalQty = calculations.rawStockTotal;
              } else if (dynamicContext.key === 'IN_PRODUCTION') {
                scopeBatches = calculations.batchMatrix.filter((b) => b.isInProduction);
                scopeTotalQty = calculations.productionTotal;
              } else if (dynamicContext.key === 'READY') {
                scopeBatches = calculations.batchMatrix.filter(
                  (b) => (b.stageQuantities[stages?.find((s) => s.name === 'Ready')?.id ?? ''] ?? 0) > 0
                );
                scopeTotalQty = calculations.readyStockTotal;
              } else if (dynamicContext.key === 'DISPATCHED') {
                isDispatchScope = true;
                scopeDispatches = calculations.enrichedDispatches;
                scopeTotalQty = calculations.totalDispatched;
              } else if (dynamicContext.key === 'IN_FACTORY') {
                scopeBatches = calculations.batchMatrix.filter((b) => b.inFactoryQty > 0);
                scopeTotalQty = calculations.totalInsideFactory;
              } else if (dynamicContext.key === 'STALLED') {
                scopeBatches = calculations.batchMatrix.filter((b) => b.isStalled);
                scopeTotalQty = scopeBatches.reduce((acc, b) => acc + b.inFactoryQty, 0);
              } else if (dynamicContext.key === 'STAGE' && dynamicContext.stageId) {
                const targetStageId = dynamicContext.stageId;
                scopeBatches = calculations.batchMatrix.filter(
                  (b) => (b.stageQuantities[targetStageId] ?? 0) > 0
                );
                scopeTotalQty = scopeBatches.reduce(
                  (acc, b) => acc + (b.stageQuantities[targetStageId] ?? 0),
                  0
                );
              } else {
                scopeBatches = calculations.batchMatrix;
                scopeTotalQty = calculations.totalReceived;
              }

              const uniqueItemsInScope = isDispatchScope
                ? new Set(scopeDispatches.map((d) => d.itemName)).size
                : new Set(scopeBatches.map((b) => b.batch.item?.name).filter(Boolean)).size;

              const uniqueLocationsInScope = isDispatchScope
                ? new Set(scopeDispatches.map((d) => d.customer_name)).size
                : new Set(scopeBatches.map((b) => b.batch.location).filter(Boolean)).size;

              return (
                <div className="space-y-4">
                  {/* Scope Summary HUD */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Total Reconciled Qty</p>
                      <p className="text-lg font-black text-slate-900 mt-0.5">{formatNumber(scopeTotalQty)}</p>
                      <p className="text-[10px] text-slate-400">units in scope</p>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">
                        {isDispatchScope ? 'Shipments Count' : 'Batches Count'}
                      </p>
                      <p className="text-lg font-black text-slate-900 mt-0.5">
                        {formatNumber(isDispatchScope ? scopeDispatches.length : scopeBatches.length)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {isDispatchScope ? 'dispatches recorded' : 'active batches'}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Distinct SKUs / Items</p>
                      <p className="text-lg font-black text-slate-900 mt-0.5">{uniqueItemsInScope}</p>
                      <p className="text-[10px] text-slate-400">products involved</p>
                    </div>

                    <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">
                        {isDispatchScope ? 'Unique Customers' : 'Storage Rack Bays'}
                      </p>
                      <p className="text-lg font-black text-slate-900 mt-0.5">{uniqueLocationsInScope}</p>
                      <p className="text-[10px] text-slate-400">
                        {isDispatchScope ? 'client accounts' : 'active rack bays'}
                      </p>
                    </div>
                  </div>

                  {/* Ledger Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                    <div className="bg-slate-50 p-2.5 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                        {isDispatchScope ? 'Dispatched Orders Ledger' : 'Ground-Truth Batches Detail'}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {isDispatchScope ? scopeDispatches.length : scopeBatches.length} records found
                      </span>
                    </div>

                    {isDispatchScope ? (
                      scopeDispatches.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          Zero dispatches currently recorded in this context.
                        </div>
                      ) : (
                        <div className="max-h-[350px] overflow-y-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 bg-slate-100 text-[10px] font-extrabold uppercase text-slate-600 border-b border-slate-200">
                              <tr>
                                <th className="p-2.5">Invoice No</th>
                                <th className="p-2.5">Customer</th>
                                <th className="p-2.5">Batch No</th>
                                <th className="p-2.5">Item</th>
                                <th className="p-2.5 text-right">Shipped Qty</th>
                                <th className="p-2.5">Dispatch Date</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {scopeDispatches.map((d) => (
                                <tr key={d.id} className="hover:bg-slate-50">
                                  <td className="p-2.5 font-extrabold text-violet-900">{d.invoice_no}</td>
                                  <td className="p-2.5 font-bold text-slate-800">{d.customer_name}</td>
                                  <td className="p-2.5 font-mono text-slate-700">{d.batchNo}</td>
                                  <td className="p-2.5 text-slate-600">{d.itemName}</td>
                                  <td className="p-2.5 text-right font-black text-slate-900">
                                    {formatNumber(d.qty)}
                                  </td>
                                  <td className="p-2.5 text-slate-500 text-[11px]">
                                    {formatDate(d.dispatched_on)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    ) : scopeBatches.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        Zero batches currently active in this stage/milestone. Reconciled inventory ledger is clean.
                      </div>
                    ) : (
                      <div className="max-h-[350px] overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-100 text-[10px] font-extrabold uppercase text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="p-2.5">Batch / Bay</th>
                              <th className="p-2.5">Item & Supplier</th>
                              <th className="p-2.5 text-right">
                                {dynamicContext.key === 'STAGE' && dynamicContext.stageId
                                  ? 'Stage Qty'
                                  : 'Factory Qty'}
                              </th>
                              <th className="p-2.5">Active Stages</th>
                              <th className="p-2.5">Inward & Age</th>
                              <th className="p-2.5 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {scopeBatches.map((item) => {
                              const targetStageQty =
                                dynamicContext.key === 'STAGE' && dynamicContext.stageId
                                  ? item.stageQuantities[dynamicContext.stageId] ?? 0
                                  : item.inFactoryQty;

                              return (
                                <tr key={item.batch.id} className="hover:bg-slate-50">
                                  <td className="p-2.5">
                                    <div className="font-extrabold font-mono text-slate-900">
                                      {item.batch.batch_no}
                                    </div>
                                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-semibold mt-0.5">
                                      <MapPin className="h-2.5 w-2.5 text-slate-400" />
                                      {item.batch.location || 'Unassigned Bay'}
                                    </span>
                                  </td>
                                  <td className="p-2.5">
                                    <div className="font-bold text-slate-800">{item.batch.item?.name ?? '—'}</div>
                                    <div className="text-[11px] text-slate-500">{item.batch.supplier?.name ?? '—'}</div>
                                  </td>
                                  <td className="p-2.5 text-right">
                                    <span className="font-black text-slate-900 text-sm">
                                      {formatNumber(targetStageQty)}
                                    </span>
                                    <div className="text-[10px] text-slate-400">
                                      of {formatNumber(item.batch.qty_received)} total
                                    </div>
                                  </td>
                                  <td className="p-2.5">
                                    <div className="flex flex-wrap gap-1">
                                      {item.activeStages.map((as) => (
                                        <span
                                          key={as.stageId}
                                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                            dynamicContext.key === 'STAGE' && dynamicContext.stageId === as.stageId
                                              ? 'bg-emerald-600 text-white'
                                              : 'bg-slate-100 text-slate-700'
                                          }`}
                                        >
                                          {as.stageName}: {formatNumber(as.qty)}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-[11px]">
                                    <div className="font-medium text-slate-700">{formatDate(item.batch.received_on)}</div>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <span
                                        className={`font-extrabold ${
                                          item.isStalled ? 'text-rose-600' : 'text-slate-500'
                                        }`}
                                      >
                                        {item.ageInDays} {item.ageInDays === 1 ? 'day' : 'days'}
                                      </span>
                                      {item.isStalled && (
                                        <span className="bg-rose-100 text-rose-800 text-[9px] font-black px-1 py-0.2 rounded uppercase">
                                          Stalled
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-center">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setDynamicContext(null);
                                        openQuickModal(item.batch.id, 'move');
                                      }}
                                      className="text-[11px] py-1 px-2 font-bold"
                                    >
                                      Move Batch
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Modal Actions */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                Data reconciled dynamically from live Postgres database.
              </span>
              <Button variant="secondary" size="sm" onClick={() => setDynamicContext(null)}>
                Close Context Modal
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
