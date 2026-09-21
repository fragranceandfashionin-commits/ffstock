import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Boxes, X, Download, FileSpreadsheet } from 'lucide-react';
import {
  Card,
  PageHeader,
  ErrorBanner,
  EmptyState,
  CardSkeleton,
  TableSkeleton,
  Button,
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import { DeliveryChallanModal } from '@/components/DeliveryChallanModal';
import {
  fetchBatches,
  fetchStages,
  fetchBatchStock,
  fetchMovements,
  fetchDispatches,
  insertStageMovement,
  insertScrapMovement,
  insertDispatch,
  insertReversalMovement,
  fetchCaps,
  fetchAtomizers,
  fetchBoxes,
  insertSplitStageMovementAndScrap,
  insertMultiVariantStageMovements,
  insertMultiVariantDispatches,
  fetchComponentStockSummary,
  fetchBatchAllocations,
} from '@/lib/queries';
import { invalidateCache } from '@/lib/cache';
import { supabase, SCRAP_REASONS, COMMON_COLORS, COMMON_PRINTING_DESIGNS } from '@/lib/supabase';
import type { BatchWithRelations, Stage, MovementWithRelations, Dispatch, Item, ComponentStockSummary, BatchAllocationWithRelations } from '@/lib/supabase';
import type { BatchStock } from '@/lib/types';
import { getErrorMessage, getTodayDateString, formatNumber, downloadCSV } from '@/lib/utils';

// Outward Subcomponents & Types
import type { ActiveAction, VariantRow } from './outward/types';
import { deriveStageVariants } from './outward/types';
import { BatchSelectorCard } from './outward/BatchSelectorCard';
import { PipelineVisualizer } from './outward/PipelineVisualizer';
import { SingleMovementForm } from './outward/SingleMovementForm';
import { MultiVariantSplitMatrix } from './outward/MultiVariantSplitMatrix';
import { ScrapForm } from './outward/ScrapForm';
import { DispatchForm } from './outward/DispatchForm';
import { MovementAuditTrail } from './outward/MovementAuditTrail';
import { ReversalModal } from './outward/ReversalModal';
import { useAuth } from '@/lib/auth';

export type OutwardViewProps = {
  initialBatchId?: string;
  initialMovementId?: string;
};

export function OutwardView({ initialBatchId, initialMovementId }: OutwardViewProps = {}) {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [batches, setBatches] = useState<BatchWithRelations[] | null>(null);
  const [batchId, setBatchId] = useState(initialBatchId || '');
  const [stock, setStock] = useState<BatchStock[]>([]);
  const [movements, setMovements] = useState<MovementWithRelations[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [caps, setCaps] = useState<Item[]>([]);
  const [atomizers, setAtomizers] = useState<Item[]>([]);
  const [boxes, setBoxes] = useState<Item[]>([]);
  const [stockSummaryMap, setStockSummaryMap] = useState<Map<string, ComponentStockSummary>>(new Map());
  const [allocations, setAllocations] = useState<BatchAllocationWithRelations[]>([]);

  const lastHandledBatchIdRef = useRef<string | null>(null);
  const actionPanelRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active user action
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

  // Smooth scroll to action panel when activated
  useEffect(() => {
    if (activeAction && actionPanelRef.current) {
      actionPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeAction]);

  // Global Escape key listener to dismiss active action panel
  useEffect(() => {
    const handleGlobalEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeAction) {
        setActiveAction(null);
        resetForm();
      }
    };
    window.addEventListener('keydown', handleGlobalEsc);
    return () => window.removeEventListener('keydown', handleGlobalEsc);
  }, [activeAction]);

  // Movement Form state
  const [moveQty, setMoveQty] = useState('');
  const [moveVariantName, setMoveVariantName] = useState('');
  const [moveColor, setMoveColor] = useState('');
  const [movePrintingDesign, setMovePrintingDesign] = useState('');
  const [capName, setCapName] = useState('');
  const [moveCapItemId, setMoveCapItemId] = useState('');
  const [atomizerName, setAtomizerName] = useState('');
  const [moveAtomizerItemId, setMoveAtomizerItemId] = useState('');
  const [moveBoxName, setMoveBoxName] = useState('');
  const [moveBoxItemId, setMoveBoxItemId] = useState('');
  const { profile, role, roleDefinition, canPerform, canTransitionStage } = useAuth();
  const [moveRemarks, setMoveRemarks] = useState('');
  const [moveDoneBy, setMoveDoneBy] = useState('');
  const [splitScrapEnabled, setSplitScrapEnabled] = useState(false);
  const [splitScrapReason, setSplitScrapReason] = useState<string>(SCRAP_REASONS[0]);

  useEffect(() => {
    if (!moveDoneBy && (profile?.display_name || profile?.email || roleDefinition.name)) {
      setMoveDoneBy(profile?.display_name || profile?.email || roleDefinition.name);
    }
  }, [profile, roleDefinition, moveDoneBy]);

  // Multi-variant split allocation
  const [moveMode, setMoveMode] = useState<'single' | 'multi-split'>('single');
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);

  // Scrap Form state
  const [scrapQty, setScrapQty] = useState('');
  const [scrapReason, setScrapReason] = useState<string>(SCRAP_REASONS[0]);

  // Dispatch Form state
  const [dispatchMode, setDispatchMode] = useState<'single' | 'multi-split'>('single');
  const [dispatchQty, setDispatchQty] = useState('');
  const [dispatchVariantName, setDispatchVariantName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [dispatchDate, setDispatchDate] = useState(getTodayDateString());
  const [dispatchColor, setDispatchColor] = useState('');
  const [dispatchPrintingDesign, setDispatchPrintingDesign] = useState('');
  const [dispatchCapName, setDispatchCapName] = useState('');
  const [dispatchAtomizerName, setDispatchAtomizerName] = useState('');
  const [dispatchBoxName, setDispatchBoxName] = useState('');
  const [dispatchProductSpecs, setDispatchProductSpecs] = useState('');

  // Reversal Modal state
  const [reversalModalOpen, setReversalModalOpen] = useState(false);
  const [reversalTarget, setReversalTarget] = useState<MovementWithRelations | null>(null);
  const [reversalQty, setReversalQty] = useState('');
  const [reversalReason, setReversalReason] = useState('');
  const [reversalDoneBy, setReversalDoneBy] = useState('');
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [reversalSubmitting, setReversalSubmitting] = useState(false);

  // Delivery Challan modal
  const [challanModalOpen, setChallanModalOpen] = useState(false);
  const [challanDispatch, setChallanDispatch] = useState<Dispatch | null>(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const toast = useToast();

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stg, b, c, a, bx] = await Promise.all([
        fetchStages(),
        fetchBatches(),
        fetchCaps(),
        fetchAtomizers(),
        fetchBoxes(),
      ]);
      const summary = await fetchComponentStockSummary(null, { stages: stg, batches: b }).catch(() => [] as ComponentStockSummary[]);

      setStages(stg);
      setBatches(b);
      setCaps(c);
      setAtomizers(a);
      setBoxes(bx);
      const sMap = new Map<string, ComponentStockSummary>();
      for (const sm of summary) sMap.set(sm.item.id, sm);
      setStockSummaryMap(sMap);
      if (b.length > 0 && !batchId) {
        setBatchId(b[0].id);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load outward workflow'));
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const refreshBatchData = useCallback(async () => {
    if (!batchId) {
      setStock([]);
      setMovements([]);
      setDispatches([]);
      setAllocations([]);
      return;
    }
    try {
      const [stk, mov, disp, allocs] = await Promise.all([
        fetchBatchStock(batchId),
        fetchMovements(batchId),
        fetchDispatches(batchId),
        fetchBatchAllocations(batchId).catch(() => [] as BatchAllocationWithRelations[]),
      ]);
      setStock(stk);
      setMovements(mov);
      setDispatches(disp);
      setAllocations(allocs);
    } catch (err) {
      console.error('Error refreshing batch stock data:', err);
    }
  }, [batchId]);

  useEffect(() => {
    refreshBatchData();
  }, [refreshBatchData]);

  // Realtime subscription
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const debouncedRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        invalidateCache();
        refreshBatchData();
      }, 300);
    };

    const debouncedBatchesRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        invalidateCache();
        const b = await fetchBatches().catch(() => []);
        setBatches(b);
        refreshBatchData();
      }, 300);
    };

    const channel = supabase
      .channel(`outward-realtime-sync-${batchId || 'global'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inward_batches' }, debouncedBatchesRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_allocations' }, debouncedBatchesRefresh)
      .on(
        'postgres_changes',
        batchId ? { event: '*', schema: 'public', table: 'stage_movements', filter: `batch_id=eq.${batchId}` } : { event: '*', schema: 'public', table: 'stage_movements' },
        debouncedRefresh
      )
      .on(
        'postgres_changes',
        batchId ? { event: '*', schema: 'public', table: 'dispatches', filter: `batch_id=eq.${batchId}` } : { event: '*', schema: 'public', table: 'dispatches' },
        debouncedRefresh
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [batchId, refreshBatchData]);

  const selectedBatch = useMemo(
    () => batches?.find((b) => b.id === batchId) ?? null,
    [batches, batchId]
  );

  const processStages = useMemo(
    () => stages?.filter((s) => s.name !== 'Scrap / Defect') ?? [],
    [stages]
  );

  const qtyAt = useCallback((stageId: string): number => {
    return stock.find((s) => s.stage_id === stageId)?.qty ?? 0;
  }, [stock]);

  const dispatchedTotal = useMemo(
    () => dispatches.reduce((acc, d) => acc + d.qty, 0),
    [dispatches]
  );

  const allocatedOutQty = useMemo(
    () => allocations.filter((a) => a.source_batch_id === batchId).reduce((acc, a) => acc + a.qty, 0),
    [allocations, batchId]
  );

  const allocatedInQty = useMemo(
    () => allocations.filter((a) => a.destination_batch_id === batchId).reduce((acc, a) => acc + a.qty, 0),
    [allocations, batchId]
  );

  const netReceivedQty = useMemo(() => {
    if (!selectedBatch) return 0;
    return Math.max(0, selectedBatch.qty_received - allocatedOutQty + allocatedInQty);
  }, [selectedBatch, allocatedOutQty, allocatedInQty]);

  const readyQty = useMemo(() => {
    const readyStage = stages?.find((s) => s.name === 'Ready');
    return readyStage ? qtyAt(readyStage.id) : 0;
  }, [stages, qtyAt]);

  const inFactory = useMemo(() => {
    if (!selectedBatch) return 0;
    return processStages.reduce((sum, s) => sum + qtyAt(s.id), 0);
  }, [selectedBatch, processStages, qtyAt]);

  const scrappedTotal = useMemo(() => {
    const scrapStage = stages?.find((s) => s.name === 'Scrap / Defect' || s.name.toLowerCase().includes('scrap'));
    return scrapStage ? qtyAt(scrapStage.id) : 0;
  }, [stages, qtyAt]);

  const unitLabel = selectedBatch?.item?.unit || 'units';

  const resetForm = () => {
    setMoveQty('');
    setMoveVariantName('');
    setMoveColor('');
    setMovePrintingDesign('');
    setCapName('');
    setMoveCapItemId('');
    setAtomizerName('');
    setMoveAtomizerItemId('');
    setMoveBoxName('');
    setMoveBoxItemId('');
    setMoveRemarks('');
    setMoveDoneBy('');
    setSplitScrapEnabled(false);
    setSplitScrapReason(SCRAP_REASONS[0]);
    setScrapQty('');
    setScrapReason(SCRAP_REASONS[0]);
    setDispatchQty('');
    setDispatchVariantName('');
    setCustomerName('');
    setInvoiceNo('');
    setDispatchDate(getTodayDateString());
    setDispatchColor('');
    setDispatchPrintingDesign('');
    setDispatchCapName('');
    setDispatchAtomizerName('');
    setDispatchBoxName('');
    setDispatchProductSpecs('');
    setVariantRows([]);
    setFormError(null);
  };

  // Determine stage flags
  const sourceStage = stages?.find((s) => activeAction?.type === 'stage-move' && s.id === activeAction.fromStageId);
  const targetStage = stages?.find((s) => activeAction?.type === 'stage-move' && s.id === activeAction.toStageId);
  const sourceStageName = sourceStage?.name || '';
  const targetStageName = targetStage?.name || '';

  const isColoringStage = targetStageName.toLowerCase().includes('color') || targetStageName.toLowerCase().includes('coating');
  const isLeavingColoring = sourceStageName.toLowerCase().includes('color') || sourceStageName.toLowerCase().includes('coating');
  const isPrintingStage = targetStageName.toLowerCase().includes('print') || targetStageName.toLowerCase().includes('screen');
  const isLeavingPrinting = sourceStageName.toLowerCase().includes('print') || sourceStageName.toLowerCase().includes('screen');
  const isFillingStage = targetStageName.toLowerCase().includes('fill') || targetStageName.toLowerCase().includes('assembly');
  const isLeavingFilling = sourceStageName.toLowerCase().includes('fill') || sourceStageName.toLowerCase().includes('assembly');
  const isPackagingStage = targetStageName.toLowerCase().includes('pack') || targetStageName.toLowerCase().includes('box') || targetStageName.toLowerCase().includes('monocarton');
  const isLeavingPackaging = sourceStageName.toLowerCase().includes('pack') || sourceStageName.toLowerCase().includes('box') || sourceStageName.toLowerCase().includes('monocarton');

  const allColorSuggestions = useMemo(() => {
    const set = new Set<string>(COMMON_COLORS);
    if (selectedBatch?.color) set.add(selectedBatch.color);
    movements.forEach((m) => {
      if (m.color) set.add(m.color);
    });
    return Array.from(set);
  }, [selectedBatch, movements]);

  const allPrintingSuggestions = useMemo(() => {
    const set = new Set<string>(COMMON_PRINTING_DESIGNS);
    movements.forEach((m) => {
      if (m.printing_design) set.add(m.printing_design);
    });
    return Array.from(set);
  }, [movements]);

  const activeSourceQty = useMemo(() => {
    if (!activeAction) return 0;
    if (activeAction.type === 'stage-move') return qtyAt(activeAction.fromStageId);
    if (activeAction.type === 'scrap') return qtyAt(activeAction.fromStageId);
    if (activeAction.type === 'dispatch') return readyQty;
    return 0;
  }, [activeAction, qtyAt, readyQty]);

  // Variant state synchronization handlers
  const handleUpdateMoveVariantName = (val: string) => {
    setMoveVariantName(val);
    setVariantRows((prev) => {
      if (prev.length === 0) {
        return [
          {
            id: String(Date.now()),
            variant_name: val,
            color: moveColor || selectedBatch?.color || 'Clear',
            printing_design: movePrintingDesign || '',
            cap_name: capName || '',
            cap_item_id: moveCapItemId || '',
            atomizer_name: atomizerName || '',
            atomizer_item_id: moveAtomizerItemId || '',
            box_name: moveBoxName || '',
            box_item_id: moveBoxItemId || '',
            qty: moveQty || String(activeSourceQty),
          },
        ];
      }
      return prev.map((r, idx) => (idx === 0 ? { ...r, variant_name: val } : r));
    });
  };

  const handleUpdateDispatchVariantName = (val: string) => {
    setDispatchVariantName(val);
    setVariantRows((prev) => {
      if (prev.length === 0) {
        return [
          {
            id: String(Date.now()),
            variant_name: val,
            color: dispatchColor || selectedBatch?.color || 'Clear',
            printing_design: dispatchPrintingDesign || '',
            cap_name: dispatchCapName || '',
            atomizer_name: dispatchAtomizerName || '',
            box_name: dispatchBoxName || '',
            qty: dispatchQty || String(readyQty),
          },
        ];
      }
      return prev.map((r, idx) => (idx === 0 ? { ...r, variant_name: val } : r));
    });
  };

  const handleSwitchToSingleMove = () => {
    if (variantRows.length > 0) {
      if (variantRows[0].variant_name !== undefined) setMoveVariantName(variantRows[0].variant_name);
      if (variantRows[0].color) setMoveColor(variantRows[0].color);
      if (variantRows[0].printing_design) setMovePrintingDesign(variantRows[0].printing_design);
      if (variantRows[0].cap_name) setCapName(variantRows[0].cap_name);
      if (variantRows[0].cap_item_id) setMoveCapItemId(variantRows[0].cap_item_id);
      if (variantRows[0].atomizer_name) setAtomizerName(variantRows[0].atomizer_name);
      if (variantRows[0].atomizer_item_id) setMoveAtomizerItemId(variantRows[0].atomizer_item_id);
      if (variantRows[0].box_name) setMoveBoxName(variantRows[0].box_name);
      if (variantRows[0].box_item_id) setMoveBoxItemId(variantRows[0].box_item_id);
    }
    setMoveMode('single');
  };

  const handleSwitchToMultiSplitMove = () => {
    if (variantRows.length === 0 && activeAction?.type === 'stage-move') {
      const derived = deriveStageVariants({
        fromStageId: activeAction.fromStageId,
        movements,
        dispatches,
        selectedBatch,
        availableQty: activeSourceQty,
      });
      setVariantRows(derived);
    } else if (variantRows.length > 0) {
      setVariantRows((prev) =>
        prev.map((r, idx) => {
          const brand = selectedBatch?.brand_name?.trim() || selectedBatch?.item?.name?.trim() || 'Variant';
          const resolvedRowName =
            r.variant_name?.trim() ||
            (idx === 0 && moveVariantName?.trim() ? moveVariantName.trim() : `${brand} - ${r.color || 'Variant'}`);
          return idx === 0
            ? {
                ...r,
                variant_name: resolvedRowName,
                color: moveColor || r.color,
                printing_design: movePrintingDesign || r.printing_design,
                cap_name: capName || r.cap_name,
                cap_item_id: moveCapItemId || r.cap_item_id,
                atomizer_name: atomizerName || r.atomizer_name,
                atomizer_item_id: moveAtomizerItemId || r.atomizer_item_id,
                box_name: moveBoxName || r.box_name,
                box_item_id: moveBoxItemId || r.box_item_id,
              }
            : {
                ...r,
                variant_name: resolvedRowName,
              };
        })
      );
    }
    setMoveMode('multi-split');
  };

  // Variant row manipulations
  const handleAddVariantRow = () => {
    const nextId = String(Date.now() + Math.random());
    const usedColors = new Set(variantRows.map((r) => r.color));
    const availableColor = COMMON_COLORS.find((c) => !usedColors.has(c)) || COMMON_COLORS[0];
    const lastRow = variantRows[variantRows.length - 1];
    const totalAllocated = variantRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
    const unallocated = Math.max(0, activeSourceQty - totalAllocated);
    const brand = selectedBatch?.brand_name?.trim() || selectedBatch?.item?.name?.trim() || 'Variant';
    const autoVariantName = `${brand} - ${availableColor}`;

    setVariantRows((prev) => [
      ...prev,
      {
        id: nextId,
        variant_name: autoVariantName,
        color: availableColor,
        printing_design: lastRow?.printing_design || movePrintingDesign || '',
        box_name: lastRow?.box_name || moveBoxName || '',
        box_item_id: lastRow?.box_item_id || '',
        cap_name: lastRow?.cap_name || capName || '',
        cap_item_id: lastRow?.cap_item_id || moveCapItemId || '',
        atomizer_name: lastRow?.atomizer_name || atomizerName || '',
        atomizer_item_id: lastRow?.atomizer_item_id || moveAtomizerItemId || '',
        qty: unallocated > 0 ? String(unallocated) : '0',
      },
    ]);
  };

  const handleRemoveVariantRow = (id: string) => {
    if (variantRows.length <= 1) return;
    setVariantRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleDistributeEvenly = () => {
    if (variantRows.length === 0 || activeSourceQty <= 0) return;
    const count = variantRows.length;
    const baseQty = Math.floor(activeSourceQty / count);
    const remainder = activeSourceQty % count;
    setVariantRows((prev) =>
      prev.map((row, idx) => ({
        ...row,
        qty: String(baseQty + (idx === 0 ? remainder : 0)),
      }))
    );
  };

  // Triggers
  const startStageMove = (fromStageId: string, toStageId: string) => {
    setFormError(null);
    resetForm();

    const available = qtyAt(fromStageId);

    const derivedVariants = deriveStageVariants({
      fromStageId,
      movements,
      dispatches,
      selectedBatch,
      availableQty: available,
    });

    const primaryVariant = derivedVariants[0];
    setVariantRows(derivedVariants);

    const latestMoveWithVariant = movements.slice().reverse().find((m) => m.variant_name?.trim())?.variant_name?.trim() || '';
    const initialVariant = primaryVariant?.variant_name || latestMoveWithVariant || (selectedBatch?.brand_name ? selectedBatch.brand_name : '');

    setMoveQty(available > 0 ? String(available) : '');
    setMoveVariantName(initialVariant);
    setMoveColor(primaryVariant?.color || selectedBatch?.color || '');
    setMovePrintingDesign(primaryVariant?.printing_design || '');
    setCapName(primaryVariant?.cap_name || selectedBatch?.cap_item?.name || '');
    setMoveCapItemId(primaryVariant?.cap_item_id || selectedBatch?.cap_item_id || '');
    setAtomizerName(primaryVariant?.atomizer_name || selectedBatch?.atomizer_item?.name || '');
    setMoveAtomizerItemId(primaryVariant?.atomizer_item_id || selectedBatch?.atomizer_item_id || '');
    setMoveBoxName(primaryVariant?.box_name || selectedBatch?.box_item?.name || '');
    setMoveBoxItemId(primaryVariant?.box_item_id || selectedBatch?.box_item_id || '');
    setMoveRemarks('');
    setMoveDoneBy('');
    setSplitScrapEnabled(false);
    setSplitScrapReason(SCRAP_REASONS[0]);

    if (derivedVariants.length > 1) {
      setMoveMode('multi-split');
    } else {
      setMoveMode('single');
    }

    setActiveAction({ type: 'stage-move', fromStageId, toStageId });
  };

  const startScrap = (fromStageId: string) => {
    setFormError(null);
    resetForm();
    setActiveAction({ type: 'scrap', fromStageId });
  };

  const startDispatch = () => {
    setFormError(null);
    resetForm();

    const readyStageObj = stages?.find((s) => s.name === 'Ready');
    const readyMoves = movements.filter((m) => m.to_stage_id === readyStageObj?.id);
    const latestReadyMove = readyMoves.slice().reverse()[0] || movements.slice().reverse()[0];

    const derivedVariants = readyStageObj
      ? deriveStageVariants({
          fromStageId: readyStageObj.id,
          movements,
          dispatches,
          selectedBatch,
          availableQty: readyQty,
        })
      : [];

    const primaryVariant = derivedVariants[0];

    const derivedVariantName = primaryVariant?.variant_name || latestReadyMove?.variant_name || selectedBatch?.brand_name || '';
    const derivedColor = primaryVariant?.color || latestReadyMove?.color || selectedBatch?.color || '';
    const derivedPrinting = primaryVariant?.printing_design || latestReadyMove?.printing_design || '';
    const derivedCap = primaryVariant?.cap_name || latestReadyMove?.cap_name || selectedBatch?.cap_item?.name || '';
    const derivedAtomizer = primaryVariant?.atomizer_name || latestReadyMove?.atomizer_name || selectedBatch?.atomizer_item?.name || '';
    const derivedBox = primaryVariant?.box_name || latestReadyMove?.box_name || selectedBatch?.box_item?.name || '';

    const specsList = [
      derivedVariantName ? `Variant: ${derivedVariantName}` : '',
      derivedColor ? `Color: ${derivedColor}` : '',
      derivedPrinting ? `Print: ${derivedPrinting}` : '',
      derivedCap ? `Cap: ${derivedCap}` : '',
      derivedAtomizer ? `Pump: ${derivedAtomizer}` : '',
      derivedBox ? `Box: ${derivedBox}` : '',
    ].filter(Boolean).join(' • ');

    setDispatchQty(readyQty > 0 ? String(readyQty) : '');
    setDispatchVariantName(derivedVariantName);
    setCustomerName('');
    setInvoiceNo('');
    setDispatchDate(getTodayDateString());
    setDispatchColor(derivedColor);
    setDispatchPrintingDesign(derivedPrinting);
    setDispatchCapName(derivedCap);
    setDispatchAtomizerName(derivedAtomizer);
    setDispatchBoxName(derivedBox);
    setDispatchProductSpecs(specsList);

    if (derivedVariants.length > 0) {
      setVariantRows(derivedVariants);
      if (derivedVariants.length > 1) {
        setDispatchMode('multi-split');
      } else {
        setDispatchMode('single');
      }
    }

    setActiveAction({ type: 'dispatch' });
  };

  // Submit Stage Move
  const handleMoveSubmit = async () => {
    setFormError(null);
    if (!activeAction || activeAction.type !== 'stage-move') return;
    const { fromStageId: fId, toStageId: tId } = activeAction;
    if (!fId || !tId) return;

    const available = qtyAt(fId);
    const fromStage = stages?.find((s) => s.id === fId);
    const toStage = stages?.find((s) => s.id === tId);
    const fromName = fromStage?.name ?? '';
    const toName = toStage?.name ?? '';

    if (fromStage && toStage && !canTransitionStage(fromStage.sequence_no, toStage.sequence_no)) {
      setFormError(`Your role (${roleDefinition.name}) is not authorized to transition units from ${fromName} to ${toName}.`);
      return;
    }

    // Multi-split mode
    if (moveMode === 'multi-split') {
      if (variantRows.length === 0) {
        setFormError('Please add at least one variant row.');
        return;
      }
      for (let i = 0; i < variantRows.length; i++) {
        const row = variantRows[i];
        const q = Number(row.qty);
        if (!row.qty || !Number.isInteger(q) || q <= 0) {
          setFormError(`Row #${i + 1} (${row.color || 'Variant'}) must have a valid whole number quantity greater than 0.`);
          return;
        }
        if (!row.color?.trim() && isColoringStage) {
          setFormError(`Row #${i + 1} must have a color variant selected.`);
          return;
        }
        if (!row.printing_design?.trim() && isLeavingPrinting) {
          setFormError(`Row #${i + 1} must have a printing / artwork specification specified when advancing from Printing.`);
          return;
        }
        if (isLeavingFilling) {
          const rowCapId = (row.cap_item_id || moveCapItemId || selectedBatch?.cap_item_id || '').trim();
          const rowCapName = (row.cap_name?.trim() || capName.trim() || selectedBatch?.cap_item?.name || '').trim();
          if (!rowCapId && !rowCapName) {
            setFormError(`Row #${i + 1} (${row.color || 'Variant'}) must have a Cap / Closure specified when advancing from the Filling stage. Bottles cannot move without caps.`);
            return;
          }

          const rowAtomId = (row.atomizer_item_id || moveAtomizerItemId || selectedBatch?.atomizer_item_id || '').trim();
          const rowAtomName = (row.atomizer_name?.trim() || atomizerName.trim() || selectedBatch?.atomizer_item?.name || '').trim();
          if (!rowAtomId && !rowAtomName) {
            setFormError(`Row #${i + 1} (${row.color || 'Variant'}) must have an Atomizer / Pump specified when advancing from the Filling stage. Bottles cannot move without atomizers.`);
            return;
          }
        }
      }

      const totalVariantQty = variantRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
      if (totalVariantQty > available) {
        setFormError(`Total allocated (${formatNumber(totalVariantQty)}) exceeds available stock (${formatNumber(available)} ${unitLabel}) in ${fromName}.`);
        return;
      }

      // Component stock validation (Only when leaving Filling)
      if (isLeavingFilling) {
        const capDemand = new Map<string, number>();
        const atomDemand = new Map<string, number>();
        for (const r of variantRows) {
          const q = Number(r.qty) || 0;
          const cId = r.cap_item_id || moveCapItemId || selectedBatch?.cap_item_id || null;
          const aId = r.atomizer_item_id || moveAtomizerItemId || selectedBatch?.atomizer_item_id || null;
          if (cId && q > 0) capDemand.set(cId, (capDemand.get(cId) ?? 0) + q);
          if (aId && q > 0) atomDemand.set(aId, (atomDemand.get(aId) ?? 0) + q);
        }

        for (const [cId, totalDemand] of capDemand.entries()) {
          const sum = stockSummaryMap.get(cId);
          const avail = sum?.availableStock ?? 0;
          if (avail < totalDemand) {
            setFormError(`Insufficient Cap Stock: "${sum?.item.name || 'Selected Cap'}" has only ${formatNumber(avail)} units available in warehouse, but multi-variant allocation requires ${formatNumber(totalDemand)} units.`);
            return;
          }
        }

        for (const [aId, totalDemand] of atomDemand.entries()) {
          const sum = stockSummaryMap.get(aId);
          const avail = sum?.availableStock ?? 0;
          if (avail < totalDemand) {
            setFormError(`Insufficient Atomizer Stock: "${sum?.item.name || 'Selected Atomizer'}" has only ${formatNumber(avail)} units available in warehouse, but multi-variant allocation requires ${formatNumber(totalDemand)} units.`);
            return;
          }
        }
      }

      // Box stock validation (Only when leaving Packaging or moving direct to Ready)
      if (isLeavingPackaging || (isLeavingFilling && targetStageName.toLowerCase().includes('ready'))) {
        const boxDemand = new Map<string, number>();
        for (const r of variantRows) {
          const q = Number(r.qty) || 0;
          const bId = r.box_item_id || moveBoxItemId || selectedBatch?.box_item_id || null;
          if (bId && q > 0) boxDemand.set(bId, (boxDemand.get(bId) ?? 0) + q);
        }

        for (const [bId, totalDemand] of boxDemand.entries()) {
          const sum = stockSummaryMap.get(bId);
          const avail = sum?.availableStock ?? 0;
          if (avail < totalDemand) {
            setFormError(`Insufficient Box / Packaging Stock: "${sum?.item.name || 'Selected Box'}" has only ${formatNumber(avail)} units available in warehouse, but multi-variant allocation requires ${formatNumber(totalDemand)} units.`);
            return;
          }
        }
      }

      setSubmitting(true);
      try {
        const remainingLoss = available - totalVariantQty;
        const brand = selectedBatch?.brand_name?.trim() || selectedBatch?.item?.name?.trim() || 'Variant';
        const fallbackVariant = moveVariantName.trim() || variantRows[0]?.variant_name?.trim() || brand;

        const variantsPayload = variantRows.map((r) => {
          const resolvedRowVariant =
            r.variant_name?.trim() ||
            (r.color?.trim() ? `${brand} - ${r.color.trim()}` : fallbackVariant) ||
            brand;
          return {
            qty: Number(r.qty),
            variant_name: resolvedRowVariant,
            color: r.color?.trim() || moveColor.trim() || selectedBatch?.color || null,
            printing_design: r.printing_design?.trim() || movePrintingDesign.trim() || null,
            cap_name: r.cap_name?.trim() || capName.trim() || selectedBatch?.cap_item?.name || null,
            atomizer_name: r.atomizer_name?.trim() || atomizerName.trim() || selectedBatch?.atomizer_item?.name || null,
            box_name: r.box_name?.trim() || moveBoxName.trim() || selectedBatch?.box_item?.name || null,
            box_item_id: r.box_item_id || moveBoxItemId || selectedBatch?.box_item_id || null,
            cap_item_id: r.cap_item_id || moveCapItemId || selectedBatch?.cap_item_id || null,
            atomizer_item_id: r.atomizer_item_id || moveAtomizerItemId || selectedBatch?.atomizer_item_id || null,
          };
        });

        await insertMultiVariantStageMovements({
          batch_id: batchId,
          from_stage_id: fId,
          to_stage_id: tId,
          variants: variantsPayload,
          done_by: moveDoneBy.trim() || null,
          general_remarks: moveRemarks.trim() || null,
          scrapped_qty: splitScrapEnabled && remainingLoss > 0 ? remainingLoss : 0,
          scrap_reason: splitScrapReason,
          stages: stages ?? undefined,
        });

        toast.success(
          `Moved ${formatNumber(totalVariantQty)} ${unitLabel} across ${variantRows.length} variants (${fromName} → ${toName})${
            splitScrapEnabled && remainingLoss > 0 ? ` and scrapped ${formatNumber(remainingLoss)} ${unitLabel}` : ''
          }!`,
          'Stage Advance Completed'
        );

        resetForm();
        setActiveAction(null);
        await refreshBatchData();
      } catch (err) {
        const msg = getErrorMessage(err, 'Could not execute multi-variant movement');
        setFormError(msg);
        toast.error(msg, 'Movement Failed');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Single Movement Mode
    const raw = moveQty.trim();
    const qtyNum = Number(raw);
    if (!raw || !Number.isInteger(qtyNum) || qtyNum <= 0) {
      setFormError('Enter a valid whole number above 0.');
      return;
    }

    if (qtyNum > available) {
      setFormError(`Only ${formatNumber(available)} ${unitLabel} available in ${fromName}. Cannot move ${formatNumber(qtyNum)}.`);
      return;
    }

    if (isLeavingPrinting && !movePrintingDesign.trim()) {
      setFormError('Printing / artwork specification is mandatory when advancing from the Printing stage.');
      return;
    }

    if (isLeavingFilling) {
      const hasCap = Boolean(moveCapItemId || capName.trim() || selectedBatch?.cap_item_id || selectedBatch?.cap_item?.name);
      if (!hasCap) {
        setFormError('Cap closure specification or warehouse item selection is mandatory when advancing from the Filling stage. Bottles cannot move without caps.');
        return;
      }

      const hasAtomizer = Boolean(moveAtomizerItemId || atomizerName.trim() || selectedBatch?.atomizer_item_id || selectedBatch?.atomizer_item?.name);
      if (!hasAtomizer) {
        setFormError('Atomizer / pump specification or warehouse item selection is mandatory when advancing from the Filling stage. Bottles cannot move without atomizers.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const remainingLoss = available - qtyNum;
      const latestHistoricalVariant = movements.slice().reverse().find((m) => m.variant_name?.trim())?.variant_name?.trim() || '';
      const resolvedVariantName = moveVariantName.trim() || variantRows[0]?.variant_name?.trim() || latestHistoricalVariant || null;
      const resolvedColor = moveColor.trim() || selectedBatch?.color || null;
      const resolvedPrinting = movePrintingDesign.trim() || null;
      const resolvedCapName = capName.trim() || selectedBatch?.cap_item?.name || null;
      const resolvedCapItemId = moveCapItemId || selectedBatch?.cap_item_id || null;
      const resolvedAtomizerName = atomizerName.trim() || selectedBatch?.atomizer_item?.name || null;
      const resolvedAtomizerItemId = moveAtomizerItemId || selectedBatch?.atomizer_item_id || null;
      const resolvedBoxName = moveBoxName.trim() || selectedBatch?.box_item?.name || null;
      const resolvedBoxItemId = moveBoxItemId || selectedBatch?.box_item_id || null;

      // Component stock validation (Only when leaving Filling)
      if (isLeavingFilling) {
        if (resolvedCapItemId) {
          const capSum = stockSummaryMap.get(resolvedCapItemId);
          const capAvail = capSum?.availableStock ?? 0;
          if (capAvail < qtyNum) {
            setFormError(`Insufficient Cap Stock: "${capSum?.item.name || resolvedCapName || 'Selected Cap'}" has only ${formatNumber(capAvail)} units available in warehouse, but requires ${formatNumber(qtyNum)}.`);
            setSubmitting(false);
            return;
          }
        }

        if (resolvedAtomizerItemId) {
          const atomSum = stockSummaryMap.get(resolvedAtomizerItemId);
          const atomAvail = atomSum?.availableStock ?? 0;
          if (atomAvail < qtyNum) {
            setFormError(`Insufficient Atomizer Stock: "${atomSum?.item.name || resolvedAtomizerName || 'Selected Atomizer'}" has only ${formatNumber(atomAvail)} units available in warehouse, but requires ${formatNumber(qtyNum)}.`);
            setSubmitting(false);
            return;
          }
        }
      }

      // Box stock validation (Only when leaving Packaging or moving direct to Ready)
      if (isLeavingPackaging || (isLeavingFilling && targetStageName.toLowerCase().includes('ready'))) {
        if (resolvedBoxItemId) {
          const boxSum = stockSummaryMap.get(resolvedBoxItemId);
          const boxAvail = boxSum?.availableStock ?? 0;
          if (boxAvail < qtyNum) {
            setFormError(`Insufficient Box Stock: "${boxSum?.item.name || resolvedBoxName || 'Selected Box'}" has only ${formatNumber(boxAvail)} units available in warehouse, but requires ${formatNumber(qtyNum)}.`);
            setSubmitting(false);
            return;
          }
        }
      }

      if (splitScrapEnabled && remainingLoss > 0 && stages) {
        await insertSplitStageMovementAndScrap({
          batch_id: batchId,
          from_stage_id: fId,
          to_stage_id: tId,
          qty_forward: qtyNum,
          qty_scrapped: remainingLoss,
          scrap_reason: splitScrapReason,
          variant_name: resolvedVariantName,
          cap_name: resolvedCapName,
          atomizer_name: resolvedAtomizerName,
          box_name: resolvedBoxName,
          color: resolvedColor,
          printing_design: resolvedPrinting,
          cap_item_id: resolvedCapItemId,
          atomizer_item_id: resolvedAtomizerItemId,
          box_item_id: resolvedBoxItemId,
          remarks: moveRemarks.trim() || null,
          done_by: moveDoneBy.trim() || null,
          stages,
        });

        toast.success(
          `Moved ${formatNumber(qtyNum)} ${unitLabel} (${fromName} → ${toName}) and recorded ${formatNumber(remainingLoss)} ${unitLabel} scrapped (${splitScrapReason}). Zero ghost stock left!`,
          'Stage Advance Completed'
        );
      } else {
        await insertStageMovement({
          batch_id: batchId,
          from_stage_id: fId,
          to_stage_id: tId,
          qty_moved: qtyNum,
          moved_on: getTodayDateString(),
          variant_name: resolvedVariantName,
          cap_name: resolvedCapName,
          atomizer_name: resolvedAtomizerName,
          box_name: resolvedBoxName,
          color: resolvedColor,
          printing_design: resolvedPrinting,
          cap_item_id: resolvedCapItemId,
          atomizer_item_id: resolvedAtomizerItemId,
          box_item_id: resolvedBoxItemId,
          cap_qty_used: resolvedCapItemId ? qtyNum : null,
          atomizer_qty_used: resolvedAtomizerItemId ? qtyNum : null,
          box_qty_used: resolvedBoxItemId ? qtyNum : null,
          remarks: moveRemarks.trim() || null,
          done_by: moveDoneBy.trim() || null,
        });

        toast.success(
          `Moved ${formatNumber(qtyNum)} ${unitLabel}: ${fromName} → ${toName}`,
          'Stage Advance Completed'
        );
      }

      resetForm();
      setActiveAction(null);
      await refreshBatchData();
    } catch (err) {
      const msg = getErrorMessage(err, 'Could not move stock items');
      setFormError(msg);
      toast.error(msg, 'Movement Failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Scrap
  const handleScrapSubmit = async () => {
    setFormError(null);
    if (!activeAction || activeAction.type !== 'scrap') return;
    const { fromStageId: fId } = activeAction;
    if (!fId) return;

    const raw = scrapQty.trim();
    const qtyNum = Number(raw);
    if (!raw || !Number.isInteger(qtyNum) || qtyNum <= 0) {
      setFormError('Enter a valid whole number above 0.');
      return;
    }

    const available = qtyAt(fId);
    const scrapStage = stages?.find((s) => s.id === fId);
    const fromName = scrapStage?.name ?? '';

    if (scrapStage && role !== 'admin' && !canTransitionStage(scrapStage.sequence_no, 8)) {
      setFormError(`Your role (${roleDefinition.name}) is not authorized to record scrap defects at ${fromName}.`);
      return;
    }

    if (qtyNum > available) {
      setFormError(`Only ${formatNumber(available)} ${unitLabel} available in ${fromName}. Cannot scrap ${formatNumber(qtyNum)}.`);
      return;
    }

    if (!stages) return;

    setSubmitting(true);
    try {
      const latestHistoricalVariant = movements.slice().reverse().find((m) => m.variant_name?.trim())?.variant_name?.trim() || '';
      const resolvedVariantName = moveVariantName.trim() || variantRows[0]?.variant_name?.trim() || latestHistoricalVariant || null;

      await insertScrapMovement({
        batch_id: batchId,
        from_stage_id: fId,
        qty_scrapped: qtyNum,
        reason: scrapReason,
        variant_name: resolvedVariantName,
        color: moveColor.trim() || selectedBatch?.color || null,
        printing_design: movePrintingDesign.trim() || null,
        remarks: moveRemarks.trim() || null,
        done_by: moveDoneBy.trim() || null,
        stages,
      });

      toast.success(`Recorded ${formatNumber(qtyNum)} ${unitLabel} scrapped from ${fromName} (${scrapReason}).`, 'Scrap Logged');
      resetForm();
      setActiveAction(null);
      await refreshBatchData();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to record scrap defect');
      setFormError(msg);
      toast.error(msg, 'Scrap Error');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Dispatch
  const handleDispatchSubmit = async () => {
    setFormError(null);
    if (!canPerform('dispatch')) {
      setFormError(`Your role (${roleDefinition.name}) is not authorized to dispatch stock.`);
      return;
    }
    if (!customerName.trim() || !invoiceNo.trim()) {
      setFormError('Please fill all required fields (Customer Name and Invoice / Challan Number).');
      return;
    }

    const latestHistoricalVariant = movements.slice().reverse().find((m) => m.variant_name?.trim())?.variant_name?.trim() || '';
    const resolvedDispatchVariant = dispatchVariantName.trim() || latestHistoricalVariant || null;

    // Multi-Variant Dispatch Mode
    if (dispatchMode === 'multi-split') {
      if (variantRows.length === 0) {
        setFormError('Please add at least one variant row to dispatch.');
        return;
      }
      for (let i = 0; i < variantRows.length; i++) {
        const row = variantRows[i];
        const q = Number(row.qty);
        if (!row.qty || !Number.isInteger(q) || q <= 0) {
          setFormError(`Row #${i + 1} (${row.color || 'Variant'}) must have a valid whole number quantity greater than 0.`);
          return;
        }
      }

      const totalVariantQty = variantRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
      if (totalVariantQty > readyQty) {
        setFormError(`Total allocated dispatch (${formatNumber(totalVariantQty)}) exceeds available Ready stock (${formatNumber(readyQty)} ${unitLabel}).`);
        return;
      }

      setSubmitting(true);
      try {
        const variantsPayload = variantRows.map((r) => {
          const rowVariant = r.variant_name?.trim() || resolvedDispatchVariant;
          const variantSpecs = [
            rowVariant ? `Variant: ${rowVariant}` : '',
            r.color ? `Color: ${r.color}` : '',
            r.printing_design ? `Print: ${r.printing_design}` : '',
            r.cap_name ? `Cap: ${r.cap_name}` : '',
            r.atomizer_name ? `Pump: ${r.atomizer_name}` : '',
            r.box_name ? `Box: ${r.box_name}` : '',
          ].filter(Boolean).join(' • ');

          return {
            qty: Number(r.qty),
            variant_name: rowVariant,
            color: r.color?.trim() || null,
            printing_design: r.printing_design?.trim() || null,
            cap_name: r.cap_name?.trim() || null,
            atomizer_name: r.atomizer_name?.trim() || null,
            box_name: r.box_name?.trim() || null,
            box_item_id: r.box_item_id || null,
            product_specs: variantSpecs || null,
          };
        });

        await insertMultiVariantDispatches({
          batch_id: batchId,
          customer_name: customerName.trim(),
          invoice_no: invoiceNo.trim(),
          dispatched_on: dispatchDate,
          variants: variantsPayload,
        });

        toast.success(
          `Dispatched ${formatNumber(totalVariantQty)} ${unitLabel} across ${variantRows.length} variants to ${customerName.trim()} (Inv #${invoiceNo.trim()}).`,
          'Dispatch Recorded'
        );
        resetForm();
        setActiveAction(null);
        await refreshBatchData();
      } catch (err) {
        const msg = getErrorMessage(err, 'Failed to record multi-variant dispatch');
        setFormError(msg);
        toast.error(msg, 'Dispatch Error');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Single Dispatch Mode
    if (!dispatchQty) {
      setFormError('Please enter dispatch quantity.');
      return;
    }
    const qtyNum = Number(dispatchQty);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      setFormError('Quantity must be a positive whole number.');
      return;
    }
    if (qtyNum > readyQty) {
      setFormError(`Only ${formatNumber(readyQty)} ${unitLabel} are Ready. Cannot ship ${formatNumber(qtyNum)}.`);
      return;
    }

    setSubmitting(true);
    try {
      await insertDispatch({
        batch_id: batchId,
        qty: qtyNum,
        customer_name: customerName.trim(),
        invoice_no: invoiceNo.trim(),
        dispatched_on: dispatchDate,
        variant_name: resolvedDispatchVariant,
        color: dispatchColor.trim() || selectedBatch?.color || null,
        printing_design: dispatchPrintingDesign.trim() || null,
        cap_name: dispatchCapName.trim() || null,
        atomizer_name: dispatchAtomizerName.trim() || null,
        box_name: dispatchBoxName.trim() || null,
        product_specs: dispatchProductSpecs.trim() || null,
      });

      toast.success(`Dispatched ${formatNumber(qtyNum)} ${unitLabel} to ${customerName.trim()} (Inv #${invoiceNo.trim()}).`, 'Dispatch Recorded');
      resetForm();
      setActiveAction(null);
      await refreshBatchData();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to record dispatch');
      setFormError(msg);
      toast.error(msg, 'Dispatch Error');
    } finally {
      setSubmitting(false);
    }
  };

  // Reversal Handlers
  const openReversalModal = (m: MovementWithRelations) => {
    setReversalTarget(m);
    setReversalReason(`Correction of movement in ${selectedBatch?.batch_no || ''}`.trim());
    setReversalDoneBy(profile?.display_name || profile?.email || roleDefinition.name);
    setReversalError(null);

    const availableInStage = stock.find((s) => s.stage_id === m.to_stage_id)?.qty ?? 0;
    const maxReversible = Math.min(m.qty_moved, Math.max(0, availableInStage));

    setReversalQty(maxReversible > 0 ? String(maxReversible) : String(m.qty_moved));
    setReversalModalOpen(true);
  };

  const handleReversalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalTarget) return;
    setReversalError(null);

    if (!canPerform('reverse_allocation') && role !== 'admin') {
      setReversalError(`Your role (${roleDefinition.name}) is not authorized to reverse stage movements.`);
      return;
    }

    if (!reversalReason.trim()) {
      setReversalError('Please provide a reason for reversing this transaction.');
      return;
    }

    const qtyNum = Number(reversalQty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setReversalError('Please enter a valid positive quantity to reverse.');
      return;
    }

    const availableInStage = stock.find((s) => s.stage_id === reversalTarget.to_stage_id)?.qty ?? 0;
    if (availableInStage <= 0) {
      setReversalError(`Cannot reverse: 0 units currently remain in ${reversalTarget.to_stage?.name ?? 'the current stage'}.`);
      return;
    }
    if (qtyNum > availableInStage) {
      setReversalError(`Cannot reverse ${qtyNum} units: Only ${availableInStage} units are currently available in ${reversalTarget.to_stage?.name ?? 'the current stage'}.`);
      return;
    }
    if (qtyNum > reversalTarget.qty_moved) {
      setReversalError(`Cannot reverse more than the original movement quantity (${reversalTarget.qty_moved} ${unitLabel}).`);
      return;
    }

    setReversalSubmitting(true);
    try {
      await insertReversalMovement(
        reversalTarget,
        reversalReason.trim(),
        reversalDoneBy.trim() || undefined,
        qtyNum
      );
      toast.success(`Ledger Reversal of ${formatNumber(qtyNum)} ${unitLabel} logged successfully.`, 'Reversal Recorded');
      setReversalModalOpen(false);
      setReversalTarget(null);
      setReversalReason('');
      setReversalDoneBy('');
      setReversalQty('');
      await refreshBatchData();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to execute ledger reversal');
      setReversalError(msg);
      toast.error(msg, 'Reversal Failed');
    } finally {
      setReversalSubmitting(false);
    }
  };

  useEffect(() => {
    if (initialBatchId && batches && batches.some((b) => b.id === initialBatchId)) {
      if (lastHandledBatchIdRef.current !== initialBatchId || batchId !== initialBatchId) {
        lastHandledBatchIdRef.current = initialBatchId;
        setBatchId(initialBatchId);
      }
    }
  }, [initialBatchId, batches, batchId]);

  // CSV Export Handlers
  const exportBatchMovementsCSV = () => {
    if (!movements || movements.length === 0) return;
    try {
      const headers = [
        'Movement Date',
        'Brand Name',
        'Batch No',
        'Item Name',
        'From Stage',
        'To Stage',
        'Qty Moved',
        'Variant Name',
        'Color',
        'Printing Design',
        'Cap Used',
        'Atomizer Used',
        'Box Used',
        'Operator',
        'Remarks',
      ];
      const rows = movements.map((m) => [
        m.moved_on,
        selectedBatch?.brand_name || '—',
        selectedBatch?.batch_no || 'Batch',
        selectedBatch?.item?.name || 'Product',
        m.from_stage?.name ?? '',
        m.to_stage?.name ?? '',
        m.qty_moved,
        m.variant_name || '',
        m.color || '',
        m.printing_design || '',
        m.cap_name || '',
        m.atomizer_name || '',
        m.box_name || '',
        m.done_by || '',
        m.remarks || '',
      ]);

      const filename = `ffstock_batch_${selectedBatch?.batch_no || 'all'}_movements_${getTodayDateString()}`;
      downloadCSV(filename, headers, rows);
      toast.success('Movement audit history CSV exported successfully', 'Export Complete');
    } catch (err) {
      toast.error(getErrorMessage(err), 'Export Failed');
    }
  };

  const exportBatchDispatchesCSV = () => {
    if (!dispatches || dispatches.length === 0) return;
    try {
      const headers = [
        'Invoice No',
        'Customer Name',
        'Dispatch Date',
        'Brand Name',
        'Batch No',
        'Item SKU',
        'Dispatched Qty',
        'Variant Name',
        'Color',
        'Printing Design',
        'Cap Name',
        'Atomizer Name',
        'Box Name',
        'Product Specifications',
      ];
      const rows = dispatches.map((d) => [
        d.invoice_no,
        d.customer_name,
        d.dispatched_on,
        selectedBatch?.brand_name || '—',
        selectedBatch?.batch_no || 'Batch',
        selectedBatch?.item?.name || 'Product',
        d.qty,
        d.variant_name || '',
        d.color || '',
        d.printing_design || '',
        d.cap_name || '',
        d.atomizer_name || '',
        d.box_name || '',
        d.product_specs || '',
      ]);

      const filename = `ffstock_batch_${selectedBatch?.batch_no || 'all'}_dispatches_${getTodayDateString()}`;
      downloadCSV(filename, headers, rows);
      toast.success('Dispatches register CSV exported successfully', 'Export Complete');
    } catch (err) {
      toast.error(getErrorMessage(err), 'Export Failed');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Outward Journey & Pipeline"
          subtitle="Live multi-stage manufacturing and assembly pipeline. Advance stock items and batches through processing stages or customer dispatches."
        />
        <CardSkeleton />
        <TableSkeleton rows={6} cols={5} />
      </div>
    );
  }

  if (error) return <ErrorBanner message={error} />;
  if (!stages || !batches) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outward Journey & Pipeline"
        subtitle="Live multi-stage manufacturing and assembly pipeline. Advance stock items and batches through processing stages or customer dispatches."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {movements.length > 0 && (
              <Button
                variant="outline"
                onClick={exportBatchMovementsCSV}
                className="text-xs font-bold text-slate-700 bg-white shadow-2xs hover:bg-slate-50 cursor-pointer"
                title="Download movement audit trail CSV"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                Movements CSV
              </Button>
            )}
            {dispatches.length > 0 && (
              <Button
                variant="outline"
                onClick={exportBatchDispatchesCSV}
                className="text-xs font-bold text-slate-700 bg-white shadow-2xs hover:bg-slate-50 cursor-pointer"
                title="Download dispatches register CSV"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
                Dispatches CSV
              </Button>
            )}
          </div>
        }
      />

      {batches.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No batches found"
          description="Record an inward entry first to start moving stock through the pipeline."
        />
      ) : (
        <>
          {/* Step 1: Batch Selection & Summary KPIs */}
          <BatchSelectorCard
            batches={batches}
            batchId={batchId}
            onBatchChange={setBatchId}
            selectedBatch={selectedBatch}
            inFactory={inFactory}
            readyQty={readyQty}
            dispatchedTotal={dispatchedTotal}
            unitLabel={unitLabel}
            onStartDispatch={startDispatch}
            allocatedInQty={allocatedInQty}
            allocatedOutQty={allocatedOutQty}
            netReceivedQty={netReceivedQty}
            scrappedTotal={scrappedTotal}
          />

          {!batchId ? (
            <Card className="text-center py-12 border-dashed">
              <Boxes className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">Select a batch above to view its live pipeline</p>
              <p className="text-xs text-slate-400 mt-1">You will see each stage balance and 1-click advance buttons for that stock item.</p>
            </Card>
          ) : (
            selectedBatch && (
              <>
                {/* Step 2: Interactive Production Pipeline Visualizer */}
                <PipelineVisualizer
                  processStages={processStages}
                  qtyAt={qtyAt}
                  activeAction={activeAction}
                  onStartStageMove={startStageMove}
                  onStartDispatch={startDispatch}
                  onStartScrap={startScrap}
                  unitLabel={unitLabel}
                />

                {/* Step 3: Active Action Panel */}
                {activeAction && (
                  <div ref={actionPanelRef} className="grid grid-cols-1 gap-6 lg:grid-cols-12 animate-in fade-in slide-in-from-top-2 duration-200 scroll-mt-6">
                    <Card className="lg:col-span-8 xl:col-span-7 border-indigo-200 bg-white shadow-md">
                      {/* Stage Movement Action */}
                      {activeAction.type === 'stage-move' && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white shadow-2xs">
                                3
                              </span>
                              <h3 className="font-extrabold text-slate-900 text-sm">
                                Advance: {sourceStageName} → {targetStageName}
                              </h3>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveAction(null);
                                resetForm();
                              }}
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Mode Switcher */}
                          {(isColoringStage || isPrintingStage || isFillingStage || isPackagingStage || isLeavingColoring || isLeavingPrinting || isLeavingFilling || isLeavingPackaging) && (
                            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                              <button
                                type="button"
                                onClick={handleSwitchToSingleMove}
                                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                  moveMode === 'single'
                                    ? 'bg-white text-slate-900 shadow-2xs'
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                <span>⚡ Single Batch Advance</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleSwitchToMultiSplitMove}
                                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                  moveMode === 'multi-split'
                                    ? 'bg-indigo-600 text-white shadow-2xs'
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                <span>🎨 Multi-Variant Split & Matrix</span>
                              </button>
                            </div>
                          )}

                          {moveMode === 'multi-split' ? (
                            <MultiVariantSplitMatrix
                              variantRows={variantRows}
                              setVariantRows={setVariantRows}
                              activeSourceQty={activeSourceQty}
                              targetStageName={targetStageName}
                              unitLabel={unitLabel}
                              allColorSuggestions={allColorSuggestions}
                              allPrintingSuggestions={allPrintingSuggestions}
                              caps={caps}
                              atomizers={atomizers}
                              boxes={boxes}
                              stockSummaryMap={stockSummaryMap}
                              isColoringStage={isColoringStage}
                              isLeavingColoring={isLeavingColoring}
                              isPrintingStage={isPrintingStage}
                              isLeavingPrinting={isLeavingPrinting}
                              isFillingStage={isFillingStage}
                              isLeavingFilling={isLeavingFilling}
                              isPackagingStage={isPackagingStage}
                              isLeavingPackaging={isLeavingPackaging}
                              moveDoneBy={moveDoneBy}
                              setMoveDoneBy={setMoveDoneBy}
                              moveRemarks={moveRemarks}
                              setMoveRemarks={setMoveRemarks}
                              onAddRow={handleAddVariantRow}
                              onRemoveRow={handleRemoveVariantRow}
                              onDistributeEvenly={handleDistributeEvenly}
                              onCancel={() => {
                                setActiveAction(null);
                                resetForm();
                              }}
                              onSubmit={handleMoveSubmit}
                              submitting={submitting}
                              formError={formError}
                            />
                          ) : (
                            <SingleMovementForm
                              activeSourceQty={activeSourceQty}
                              fromStageName={sourceStageName}
                              toStageName={targetStageName}
                              isColoringStage={isColoringStage}
                              isLeavingColoring={isLeavingColoring}
                              isPrintingStage={isPrintingStage}
                              isLeavingPrinting={isLeavingPrinting}
                              isFillingStage={isFillingStage}
                              isLeavingFilling={isLeavingFilling}
                              isPackagingStage={isPackagingStage}
                              isLeavingPackaging={isLeavingPackaging}
                              moveQty={moveQty}
                              setMoveQty={setMoveQty}
                              moveVariantName={moveVariantName}
                              setMoveVariantName={handleUpdateMoveVariantName}
                              moveColor={moveColor}
                              setMoveColor={setMoveColor}
                              movePrintingDesign={movePrintingDesign}
                              setMovePrintingDesign={setMovePrintingDesign}
                              moveCapItemId={moveCapItemId}
                              setMoveCapItemId={setMoveCapItemId}
                              capName={capName}
                              setCapName={setCapName}
                              moveAtomizerItemId={moveAtomizerItemId}
                              setMoveAtomizerItemId={setMoveAtomizerItemId}
                              atomizerName={atomizerName}
                              setAtomizerName={setAtomizerName}
                              moveBoxItemId={moveBoxItemId}
                              setMoveBoxItemId={setMoveBoxItemId}
                              moveBoxName={moveBoxName}
                              setMoveBoxName={setMoveBoxName}
                              splitScrapEnabled={splitScrapEnabled}
                              setSplitScrapEnabled={setSplitScrapEnabled}
                              splitScrapReason={splitScrapReason}
                              setSplitScrapReason={setSplitScrapReason}
                              moveDoneBy={moveDoneBy}
                              setMoveDoneBy={setMoveDoneBy}
                              moveRemarks={moveRemarks}
                              setMoveRemarks={setMoveRemarks}
                              caps={caps}
                              atomizers={atomizers}
                              boxes={boxes}
                              stockSummaryMap={stockSummaryMap}
                              submitting={submitting}
                              unitLabel={unitLabel}
                              onCancel={() => {
                                setActiveAction(null);
                                resetForm();
                              }}
                              onSubmit={handleMoveSubmit}
                              formError={formError}
                            />
                          )}
                        </div>
                      )}

                      {/* Scrap Action */}
                      {activeAction.type === 'scrap' && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white shadow-2xs">
                                3
                              </span>
                              <h3 className="font-extrabold text-slate-900 text-sm">Record Production Scrap / Defect</h3>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveAction(null);
                                resetForm();
                              }}
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <ScrapForm
                            activeSourceQty={activeSourceQty}
                            fromStageName={stages?.find((s) => s.id === activeAction.fromStageId)?.name || 'Current Stage'}
                            scrapQty={scrapQty}
                            setScrapQty={setScrapQty}
                            scrapReason={scrapReason}
                            setScrapReason={setScrapReason}
                            moveDoneBy={moveDoneBy}
                            setMoveDoneBy={setMoveDoneBy}
                            moveRemarks={moveRemarks}
                            setMoveRemarks={setMoveRemarks}
                            submitting={submitting}
                            unitLabel={unitLabel}
                            onCancel={() => {
                              setActiveAction(null);
                              resetForm();
                            }}
                            onSubmit={handleScrapSubmit}
                            formError={formError}
                          />
                        </div>
                      )}

                      {/* Dispatch Action */}
                      {activeAction.type === 'dispatch' && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white shadow-2xs">
                                3
                              </span>
                              <h3 className="font-extrabold text-slate-900 text-sm">Record Customer Dispatch</h3>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveAction(null);
                                resetForm();
                              }}
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <DispatchForm
                            dispatchMode={dispatchMode}
                            setDispatchMode={setDispatchMode}
                            readyQty={readyQty}
                            unitLabel={unitLabel}
                            customerName={customerName}
                            setCustomerName={setCustomerName}
                            invoiceNo={invoiceNo}
                            setInvoiceNo={setInvoiceNo}
                            dispatchDate={dispatchDate}
                            setDispatchDate={setDispatchDate}
                            dispatchQty={dispatchQty}
                            setDispatchQty={setDispatchQty}
                            dispatchVariantName={dispatchVariantName}
                            setDispatchVariantName={handleUpdateDispatchVariantName}
                            dispatchColor={dispatchColor}
                            setDispatchColor={setDispatchColor}
                            dispatchCapName={dispatchCapName}
                            setDispatchCapName={setDispatchCapName}
                            dispatchAtomizerName={dispatchAtomizerName}
                            setDispatchAtomizerName={setDispatchAtomizerName}
                            dispatchBoxName={dispatchBoxName}
                            setDispatchBoxName={setDispatchBoxName}
                            dispatchProductSpecs={dispatchProductSpecs}
                            setDispatchProductSpecs={setDispatchProductSpecs}
                            variantRows={variantRows}
                            setVariantRows={setVariantRows}
                            allColorSuggestions={allColorSuggestions}
                            allPrintingSuggestions={allPrintingSuggestions}
                            caps={caps}
                            atomizers={atomizers}
                            boxes={boxes}
                            stockSummaryMap={stockSummaryMap}
                            onAddVariantRow={handleAddVariantRow}
                            onRemoveVariantRow={handleRemoveVariantRow}
                            onDistributeEvenly={handleDistributeEvenly}
                            onCancel={() => {
                              setActiveAction(null);
                              resetForm();
                            }}
                            onSubmit={handleDispatchSubmit}
                            submitting={submitting}
                            formError={formError}
                          />
                        </div>
                      )}
                    </Card>
                  </div>
                )}

                {/* Step 4: Audit Trails (Movements & Dispatches) */}
                <MovementAuditTrail
                  movements={movements}
                  dispatches={dispatches}
                  unitLabel={unitLabel}
                  highlightMovementId={initialMovementId}
                  onOpenReversalModal={openReversalModal}
                  onOpenChallanModal={(d) => {
                    setChallanDispatch(d);
                    setChallanModalOpen(true);
                  }}
                />
              </>
            )
          )}
        </>
      )}

      {/* Reversal Modal */}
      <ReversalModal
        isOpen={reversalModalOpen}
        onClose={() => {
          setReversalModalOpen(false);
          setReversalTarget(null);
        }}
        reversalTarget={reversalTarget}
        selectedBatch={selectedBatch}
        stock={stock}
        reversalQty={reversalQty}
        setReversalQty={setReversalQty}
        reversalReason={reversalReason}
        setReversalReason={setReversalReason}
        reversalDoneBy={reversalDoneBy}
        setReversalDoneBy={setReversalDoneBy}
        reversalError={reversalError}
        reversalSubmitting={reversalSubmitting}
        onSubmit={handleReversalSubmit}
        unitLabel={unitLabel}
      />

      {/* Delivery Challan Modal */}
      <DeliveryChallanModal
        isOpen={challanModalOpen}
        onClose={() => {
          setChallanModalOpen(false);
          setChallanDispatch(null);
        }}
        dispatch={challanDispatch}
        batch={selectedBatch}
      />
    </div>
  );
}
