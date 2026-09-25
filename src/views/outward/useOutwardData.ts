import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchBatches,
  fetchStages,
  fetchBatchesStock,
  fetchMovements,
  fetchDispatches,
  fetchCaps,
  fetchAtomizers,
  fetchBoxes,
  fetchComponentStockSummary,
  fetchBatchAllocations,
} from '@/lib/queries';
import { invalidateCache } from '@/lib/cache';
import { supabase } from '@/lib/supabase';
import type {
  BatchWithRelations,
  Stage,
  MovementWithRelations,
  Dispatch,
  Item,
  ComponentStockSummary,
  BatchAllocationWithRelations,
} from '@/lib/supabase';
import type { BatchStock } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';
import type {
  ItemGroup,
  AggregatedStageStock,
  BatchSplit,
  BatchStageDetail,
} from './types';
import {
  sortBatchesByFIFO,
  calculateFIFOSplits,
  calculateFIFOSplitsFromRemaining,
} from '@/lib/fifo';

export function useOutwardData(initialBatchId?: string) {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [batches, setBatches] = useState<BatchWithRelations[] | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(initialBatchId || null);

  const [perBatchStock, setPerBatchStock] = useState<Map<string, BatchStock[]>>(new Map());
  const [movements, setMovements] = useState<MovementWithRelations[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [caps, setCaps] = useState<Item[]>([]);
  const [atomizers, setAtomizers] = useState<Item[]>([]);
  const [boxes, setBoxes] = useState<Item[]>([]);
  const [stockSummaryMap, setStockSummaryMap] = useState<Map<string, ComponentStockSummary>>(new Map());
  const [allocations, setAllocations] = useState<BatchAllocationWithRelations[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Group all batches by item_id
  const itemGroups = useMemo<ItemGroup[]>(() => {
    if (!batches || batches.length === 0) return [];
    const groupMap = new Map<
      string,
      {
        item: Item;
        batches: BatchWithRelations[];
        supplierNames: Set<string>;
        locations: Set<string>;
        totalIntake: number;
      }
    >();

    for (const b of batches) {
      if (!b.item) continue;
      const itemId = b.item_id;
      if (!groupMap.has(itemId)) {
        groupMap.set(itemId, {
          item: b.item,
          batches: [],
          supplierNames: new Set<string>(),
          locations: new Set<string>(),
          totalIntake: 0,
        });
      }
      const grp = groupMap.get(itemId)!;
      grp.batches.push(b);
      if (b.supplier?.name) grp.supplierNames.add(b.supplier.name);
      if (b.location) grp.locations.add(b.location);
      grp.totalIntake += b.qty_received || 0;
    }

    const groups: ItemGroup[] = [];
    for (const [itemId, data] of groupMap.entries()) {
      groups.push({
        item_id: itemId,
        item: data.item,
        batches: sortBatchesByFIFO(data.batches),
        supplierNames: Array.from(data.supplierNames),
        locations: Array.from(data.locations),
        totalIntake: data.totalIntake,
      });
    }

    return groups;
  }, [batches]);

  // Initial load of global entities
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
      const summary = await fetchComponentStockSummary(null, { stages: stg, batches: b }).catch(
        () => [] as ComponentStockSummary[]
      );

      setStages(stg);
      setBatches(b);
      setCaps(c);
      setAtomizers(a);
      setBoxes(bx);
      const sMap = new Map<string, ComponentStockSummary>();
      for (const sm of summary) sMap.set(sm.item.id, sm);
      setStockSummaryMap(sMap);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load outward workflow'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Automatically determine or resolve selectedItemId when batches load
  useEffect(() => {
    if (!batches || batches.length === 0) return;

    if (initialBatchId) {
      const found = batches.find((b) => b.id === initialBatchId);
      if (found) {
        setSelectedItemId(found.item_id);
        setActiveBatchId(found.id);
        return;
      }
    }

    setSelectedItemId((prev) => {
      if (prev && itemGroups.some((g) => g.item_id === prev)) {
        return prev;
      }
      return itemGroups[0]?.item_id || batches[0]?.item_id || null;
    });
  }, [batches, initialBatchId, itemGroups]);

  // Active item group and batch resolutions
  const selectedGroup = useMemo(
    () => itemGroups.find((g) => g.item_id === selectedItemId) ?? null,
    [itemGroups, selectedItemId]
  );

  const selectedItem = useMemo(() => selectedGroup?.item ?? null, [selectedGroup]);

  const itemBatches = useMemo(() => selectedGroup?.batches ?? [], [selectedGroup]);

  const itemBatchIds = useMemo(() => itemBatches.map((b) => b.id), [itemBatches]);

  const fifoLeaderBatch = useMemo(() => itemBatches[0] ?? null, [itemBatches]);

  const activeBatch = useMemo(() => {
    if (activeBatchId) {
      const found = itemBatches.find((b) => b.id === activeBatchId);
      if (found) return found;
    }
    return fifoLeaderBatch;
  }, [activeBatchId, itemBatches, fifoLeaderBatch]);

  // Backward compatibility alias: selectedBatch and batchId
  const batchId = activeBatch?.id || '';
  const selectedBatch = activeBatch;

  const setBatchId = useCallback(
    (id: string) => {
      setActiveBatchId(id);
      const found = batches?.find((b) => b.id === id);
      if (found && found.item_id !== selectedItemId) {
        setSelectedItemId(found.item_id);
      }
    },
    [batches, selectedItemId]
  );

  // Refresh data for all batches of the selected item
  const refreshItemData = useCallback(async () => {
    if (itemBatchIds.length === 0) {
      setPerBatchStock(new Map());
      setMovements([]);
      setDispatches([]);
      setAllocations([]);
      return;
    }

    try {
      const [stkMap, rawMovs, rawDisps, rawAllocs] = await Promise.all([
        fetchBatchesStock(itemBatchIds),
        Promise.all(itemBatchIds.map((id) => fetchMovements(id).catch(() => []))),
        Promise.all(itemBatchIds.map((id) => fetchDispatches(id).catch(() => []))),
        Promise.all(itemBatchIds.map((id) => fetchBatchAllocations(id).catch(() => []))),
      ]);

      setPerBatchStock(stkMap);

      // Merge and deduplicate movements across all batches of the selected item
      const movMap = new Map<string, MovementWithRelations>();
      for (const movList of rawMovs) {
        for (const m of movList) {
          movMap.set(m.id, m);
        }
      }
      const sortedMovs = Array.from(movMap.values()).sort((a, b) => {
        const timeA = new Date(a.moved_on || a.created_at || 0).getTime();
        const timeB = new Date(b.moved_on || b.created_at || 0).getTime();
        return timeB - timeA;
      });
      setMovements(sortedMovs);

      // Merge and deduplicate dispatches
      const dispMap = new Map<string, Dispatch>();
      for (const dispList of rawDisps) {
        for (const d of dispList) {
          dispMap.set(d.id, d);
        }
      }
      const sortedDisps = Array.from(dispMap.values()).sort((a, b) => {
        const timeA = new Date(a.dispatched_on || a.created_at || 0).getTime();
        const timeB = new Date(b.dispatched_on || b.created_at || 0).getTime();
        return timeB - timeA;
      });
      setDispatches(sortedDisps);

      // Merge and deduplicate allocations
      const allocMap = new Map<string, BatchAllocationWithRelations>();
      for (const allocList of rawAllocs) {
        for (const a of allocList) {
          allocMap.set(a.id, a);
        }
      }
      setAllocations(Array.from(allocMap.values()));
    } catch (err) {
      console.error('Error refreshing item outward data:', err);
    }
  }, [itemBatchIds]);

  useEffect(() => {
    refreshItemData();
  }, [refreshItemData]);

  // Realtime subscription across outward-related tables
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const debouncedRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        invalidateCache();
        refreshItemData();
      }, 300);
    };

    const debouncedBatchesRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        invalidateCache();
        const b = await fetchBatches().catch(() => []);
        setBatches(b);
        refreshItemData();
      }, 300);
    };

    const channel = supabase
      .channel('outward-realtime-sync-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inward_batches' }, debouncedBatchesRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_allocations' }, debouncedBatchesRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_movements' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches' }, debouncedRefresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [refreshItemData]);

  const processStages = useMemo(
    () => stages?.filter((s) => s.name !== 'Scrap / Defect' && s.name !== 'Dispatched') ?? [],
    [stages]
  );

  // Aggregated stage stock across all batches of the selected item
  const aggregatedStock = useMemo<AggregatedStageStock[]>(() => {
    if (!stages) return [];
    return stages
      .filter((st) => st.name !== 'Dispatched')
      .map((st) => {
        let total = 0;
        for (const bId of itemBatchIds) {
          const batchStocks = perBatchStock.get(bId) || [];
          const entry = batchStocks.find((s) => s.stage_id === st.id);
          total += Math.max(0, entry?.qty ?? 0);
        }
        return {
          stage_id: st.id,
          stage_name: st.name,
          sequence_no: st.sequence_no,
          qty: total,
        };
      });
  }, [stages, itemBatchIds, perBatchStock]);

  const qtyAt = useCallback(
    (stageId: string): number => {
      return aggregatedStock.find((s) => s.stage_id === stageId)?.qty ?? 0;
    },
    [aggregatedStock]
  );

  // Backward-compatible stock array
  const stock = useMemo<BatchStock[]>(() => {
    return aggregatedStock.map((s) => ({
      batch_id: activeBatch?.id || '',
      stage_id: s.stage_id,
      stage_name: s.stage_name,
      sequence_no: s.sequence_no,
      qty: s.qty,
    }));
  }, [aggregatedStock, activeBatch]);

  // FIFO Calculation helpers
  const computeFIFOSplits = useCallback(
    (requestedQty: number, stageId: string): BatchSplit[] => {
      return calculateFIFOSplits({
        requestedQty,
        stageId,
        batches: itemBatches,
        perBatchStock,
      });
    },
    [itemBatches, perBatchStock]
  );

  const computeFIFOSplitsFromRemaining = useCallback(
    (scrapQty: number, stageId: string, usedSplits: BatchSplit[]): BatchSplit[] => {
      return calculateFIFOSplitsFromRemaining({
        scrapQty,
        stageId,
        batches: itemBatches,
        perBatchStock,
        usedSplits,
      });
    },
    [itemBatches, perBatchStock]
  );

  // Dispatched units by batch (synthesizes formal dispatches + historical stage moves to Dispatched)
  const dispatchedByBatchMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of dispatches) {
      map.set(d.batch_id, (map.get(d.batch_id) ?? 0) + d.qty);
    }
    const dispStageId = stages?.find((s) => s.name === 'Dispatched')?.id;
    if (dispStageId) {
      for (const m of movements) {
        if (m.to_stage_id === dispStageId) {
          map.set(m.batch_id, (map.get(m.batch_id) ?? 0) + m.qty_moved);
        }
      }
    }
    return map;
  }, [dispatches, movements, stages]);

  // Scrapped units by batch (synthesizes movements to Scrap stage or with [SCRAP remarks)
  const scrappedByBatchMap = useMemo(() => {
    const map = new Map<string, number>();
    const scrapStageId = stages?.find((s) => s.name === 'Scrap / Defect' || s.name.toLowerCase().includes('scrap'))?.id;
    for (const m of movements) {
      if ((scrapStageId && m.to_stage_id === scrapStageId) || (m.remarks ?? '').startsWith('[SCRAP')) {
        map.set(m.batch_id, (map.get(m.batch_id) ?? 0) + m.qty_moved);
      }
    }
    return map;
  }, [movements, stages]);

  // Detailed per-batch breakdown for the Date-Wise Batch & Location Drawer
  const batchStageDetails = useMemo<BatchStageDetail[]>(() => {
    if (!stages) return [];
    const readyStage = stages.find((s) => s.name === 'Ready');

    return itemBatches.map((b, index) => {
      const bStocks = perBatchStock.get(b.id) || [];
      const stageStock = processStages.map((st) => ({
        stage_id: st.id,
        stage_name: st.name,
        qty: bStocks.find((s) => s.stage_id === st.id)?.qty ?? 0,
      }));

      const totalInFactory = processStages.reduce((sum, st) => {
        const entry = bStocks.find((s) => s.stage_id === st.id);
        return sum + Math.max(0, entry?.qty ?? 0);
      }, 0);

      const readyQty = readyStage
        ? Math.max(0, bStocks.find((s) => s.stage_id === readyStage.id)?.qty ?? 0)
        : 0;

      return {
        batch_id: b.id,
        batch_no: b.batch_no,
        received_on: b.received_on || b.created_at,
        location: b.location,
        brand_name: b.brand_name,
        supplier_name: b.supplier?.name,
        color: b.color,
        qty_received: b.qty_received,
        fifo_rank: index + 1,
        stageStock,
        totalInFactory,
        readyQty,
        dispatchedQty: dispatchedByBatchMap.get(b.id) ?? 0,
        scrappedQty: scrappedByBatchMap.get(b.id) ?? 0,
      };
    });
  }, [stages, processStages, itemBatches, perBatchStock, dispatchedByBatchMap, scrappedByBatchMap]);

  const dispatchedTotal = useMemo(() => {
    let total = dispatches.reduce((acc, d) => acc + d.qty, 0);
    const dispStageId = stages?.find((s) => s.name === 'Dispatched')?.id;
    if (dispStageId) {
      const legacyMoves = movements.filter((m) => m.to_stage_id === dispStageId);
      total += legacyMoves.reduce((acc, m) => acc + m.qty_moved, 0);
    }
    return total;
  }, [dispatches, movements, stages]);

  const allocatedOutQty = useMemo(
    () =>
      allocations
        .filter((a) => itemBatchIds.includes(a.source_batch_id))
        .reduce((acc, a) => acc + a.qty, 0),
    [allocations, itemBatchIds]
  );

  const allocatedInQty = useMemo(
    () =>
      allocations
        .filter((a) => itemBatchIds.includes(a.destination_batch_id))
        .reduce((acc, a) => acc + a.qty, 0),
    [allocations, itemBatchIds]
  );

  const totalIntakeQty = useMemo(
    () => itemBatches.reduce((acc, b) => acc + (b.qty_received || 0), 0),
    [itemBatches]
  );

  const netReceivedQty = useMemo(() => {
    return Math.max(0, totalIntakeQty - allocatedOutQty + allocatedInQty);
  }, [totalIntakeQty, allocatedOutQty, allocatedInQty]);

  const readyQty = useMemo(() => {
    const readyStage = stages?.find((s) => s.name === 'Ready');
    return readyStage ? qtyAt(readyStage.id) : 0;
  }, [stages, qtyAt]);

  const inFactory = useMemo(() => {
    return processStages.reduce((sum, s) => sum + qtyAt(s.id), 0);
  }, [processStages, qtyAt]);

  const scrappedTotal = useMemo(() => {
    const scrapStage = stages?.find(
      (s) => s.name === 'Scrap / Defect' || s.name.toLowerCase().includes('scrap')
    );
    return scrapStage ? qtyAt(scrapStage.id) : 0;
  }, [stages, qtyAt]);

  const unitLabel = selectedItem?.unit || 'units';

  return {
    stages,
    batches,
    setBatches,
    batchId,
    setBatchId,
    stock,
    movements,
    dispatches,
    caps,
    atomizers,
    boxes,
    stockSummaryMap,
    allocations,
    loading,
    error,
    selectedBatch,
    processStages,
    qtyAt,
    dispatchedTotal,
    allocatedOutQty,
    allocatedInQty,
    netReceivedQty,
    readyQty,
    inFactory,
    scrappedTotal,
    unitLabel,
    refreshBatchData: refreshItemData,
    loadInitial,

    // Item-first and multi-batch properties
    selectedItemId,
    setSelectedItemId,
    selectedItem,
    itemGroups,
    itemBatches,
    itemBatchIds,
    fifoLeaderBatch,
    activeBatchId,
    setActiveBatchId,
    perBatchStock,
    aggregatedStock,
    batchStageDetails,
    computeFIFOSplits,
    computeFIFOSplitsFromRemaining,
  };
}
