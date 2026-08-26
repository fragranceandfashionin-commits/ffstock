import type { BatchWithRelations, Dispatch, MovementWithRelations, Stage, ComponentStockSummary } from '@/lib/supabase';
import type { BatchMatrixRow } from './types';

export function calculateDashboardMetrics({
  stages,
  batches: rawBatches,
  movements: rawMovements,
  dispatches: rawDispatches,
  componentStocks,
  asOfDate,
}: {
  stages: Stage[] | null;
  batches: BatchWithRelations[] | null;
  movements: MovementWithRelations[];
  dispatches: Dispatch[];
  componentStocks: ComponentStockSummary[];
  asOfDate?: string | null;
}) {
  if (!stages || !rawBatches) return null;

  // Filter entities strictly up to asOfDate if point-in-time mode is active
  const batches = asOfDate
    ? rawBatches.filter((b) => b.received_on <= asOfDate)
    : rawBatches;

  const movements = asOfDate
    ? rawMovements.filter((m) => m.moved_on <= asOfDate)
    : rawMovements;

  const dispatches = asOfDate
    ? rawDispatches.filter((d) => d.dispatched_on <= asOfDate)
    : rawDispatches;

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

  const referenceDate = asOfDate ? new Date(`${asOfDate}T23:59:59`) : new Date();


  // Helper to determine if a category/batch is a primary Bottle batch vs a Component batch
  const isBottleCategory = (categoryStr?: string | null) => {
    const cat = (categoryStr || 'Bottle').toLowerCase().trim();
    return (
      cat === 'bottle' ||
      (!cat.includes('cap') &&
        !cat.includes('atomizer') &&
        !cat.includes('pump') &&
        !cat.includes('spray') &&
        !cat.includes('pack') &&
        !cat.includes('box') &&
        !cat.includes('carton') &&
        !cat.includes('closure') &&
        !cat.includes('label'))
    );
  };

  const isBottleBatch = (b: BatchWithRelations) => {
    return isBottleCategory(b.item?.category);
  };

  // Build fast lookup maps for ComponentStockSummary
  const csMapByItemId = new Map<string, ComponentStockSummary>();
  const csMapByNameAndCategory = new Map<string, ComponentStockSummary>();
  for (const cs of componentStocks) {
    if (cs.item?.id) {
      csMapByItemId.set(cs.item.id, cs);
    }
    const key = `${(cs.item?.name || '').toLowerCase().trim()}:::${(cs.category || '').toLowerCase().trim()}`;
    if (!csMapByNameAndCategory.has(key)) {
      csMapByNameAndCategory.set(key, cs);
    }
  }

  const findComponentSummaryForBatch = (b: BatchWithRelations): ComponentStockSummary | null => {
    if (b.item_id && csMapByItemId.has(b.item_id)) {
      return csMapByItemId.get(b.item_id)!;
    }
    const bName = (b.item?.name || '').toLowerCase().trim();
    const bCat = (b.item?.category || '').toLowerCase().trim();
    const key = `${bName}:::${bCat}`;
    if (csMapByNameAndCategory.has(key)) {
      return csMapByNameAndCategory.get(key)!;
    }
    for (const cs of componentStocks) {
      if ((cs.item?.name || '').toLowerCase().trim() === bName) {
        return cs;
      }
    }
    return null;
  };

  // Group component batches by matched ComponentStockSummary for FIFO allocation
  const componentBatchesBySummary = new Map<string, BatchWithRelations[]>();
  for (const b of batches) {
    if (isBottleBatch(b)) continue;
    const cs = findComponentSummaryForBatch(b);
    const csKey = cs ? cs.item.id : `fallback-${b.item_id || b.id}`;
    const list = componentBatchesBySummary.get(csKey) ?? [];
    list.push(b);
    componentBatchesBySummary.set(csKey, list);
  }

  // Pre-calculate allocated usage for each component batch using strict FIFO
  type ComponentBatchAllocation = {
    dispatchedQty: number;
    inFactoryAssembledQty: number;
    scrappedQty: number;
    availableRawQty: number;
    allocatedDispatches: Dispatch[];
    allocatedCustomerNames: string[];
  };

  const componentBatchAllocations = new Map<string, ComponentBatchAllocation>();

  for (const [csKey, compBatches] of componentBatchesBySummary.entries()) {
    const cs = csMapByItemId.get(csKey) || componentStocks.find((c) => c.item.id === csKey);
    if (!cs) continue;

    // Sort batches in chronological FIFO order (received_on ASC, created_at ASC)
    const sortedCompBatches = [...compBatches].sort((a, b) => {
      const dateDiff = (a.received_on || '').localeCompare(b.received_on || '');
      if (dateDiff !== 0) return dateDiff;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

    const dispatchOrderQueue = [...(cs.orderUsageList || [])].map((order) => ({
      ...order,
      remainingQty: order.qtyUsed,
    }));
    let remainingAssembled = cs.totalInFactoryAssembled;
    let remainingScrap = cs.totalScrapped;

    for (const b of sortedCompBatches) {
      const bDirectMoves = movementsByBatch.get(b.id) ?? [];
      const bDirectDispatches = dispatchesByBatch.get(b.id) ?? [];
      const hasDirectActivity = bDirectMoves.length > 0 || bDirectDispatches.length > 0;

      // If user directly moved/dispatched this batch explicitly, respect direct activity
      if (hasDirectActivity) continue;

      let remainingBatchCapacity = b.qty_received;
      let batchDispatchedQty = 0;
      const allocatedDispatches: Dispatch[] = [];
      const customerNamesSet = new Set<string>();

      // 1. Allocate from FIFO Dispatch Orders
      for (const order of dispatchOrderQueue) {
        if (remainingBatchCapacity <= 0) break;
        if (order.remainingQty <= 0) continue;

        const takeQty = Math.min(remainingBatchCapacity, order.remainingQty);
        batchDispatchedQty += takeQty;
        remainingBatchCapacity -= takeQty;
        order.remainingQty -= takeQty;

        if (order.customerName) {
          customerNamesSet.add(order.customerName);
        }

        allocatedDispatches.push({
          id: `comp-disp-${order.dispatchId}-${b.id}`,
          batch_id: b.id,
          qty: takeQty,
          customer_name: order.customerName,
          invoice_no: order.invoiceNo,
          dispatched_on: order.dispatchedOn,
          variant_name: null,
          color: null,
          printing_design: null,
          cap_name: null,
          atomizer_name: null,
          box_name: null,
          box_item_id: null,
          product_specs: `Component attached on dispatched batch ${order.batchNo}`,
          created_at: order.dispatchedOn,
        });
      }

      // 2. Allocate from Assembled in Factory WIP
      let batchAssembledQty = 0;
      if (remainingBatchCapacity > 0 && remainingAssembled > 0) {
        batchAssembledQty = Math.min(remainingBatchCapacity, remainingAssembled);
        remainingBatchCapacity -= batchAssembledQty;
        remainingAssembled -= batchAssembledQty;
      }

      // 3. Allocate from Scrapped Defect
      let batchScrappedQty = 0;
      if (remainingBatchCapacity > 0 && remainingScrap > 0) {
        batchScrappedQty = Math.min(remainingBatchCapacity, remainingScrap);
        remainingBatchCapacity -= batchScrappedQty;
        remainingScrap -= batchScrappedQty;
      }

      // 4. Remaining capacity is live available Raw Stock on the shelf
      const batchAvailableRaw = Math.max(0, remainingBatchCapacity);

      componentBatchAllocations.set(b.id, {
        dispatchedQty: batchDispatchedQty,
        inFactoryAssembledQty: batchAssembledQty,
        scrappedQty: batchScrappedQty,
        availableRawQty: batchAvailableRaw,
        allocatedDispatches,
        allocatedCustomerNames: Array.from(customerNamesSet),
      });
    }
  }

  // For every batch, calculate its exact stock in each stage and aging
  const batchMatrix: BatchMatrixRow[] = batches.map((b) => {
    const stockByStage = new Map<string, number>();
    for (const s of stages) stockByStage.set(s.id, 0);

    const isBottle = isBottleBatch(b);
    const compAlloc = !isBottle ? componentBatchAllocations.get(b.id) : null;

    if (compAlloc) {
      // Component batch: populate stage quantities from allocation
      if (rawStage) stockByStage.set(rawStage.id, compAlloc.availableRawQty);
      if (readyStage && compAlloc.inFactoryAssembledQty > 0) {
        stockByStage.set(readyStage.id, compAlloc.inFactoryAssembledQty);
      }
      const scrapStage = stages.find((s) => s.name === 'Scrap / Defect' || s.name.toLowerCase().includes('scrap'));
      if (scrapStage && compAlloc.scrappedQty > 0) {
        stockByStage.set(scrapStage.id, compAlloc.scrappedQty);
      }

      const dispatchedQty = compAlloc.dispatchedQty;
      const inFactoryQty = Math.max(0, compAlloc.availableRawQty + compAlloc.inFactoryAssembledQty);
      const bDispatches = compAlloc.allocatedDispatches;
      const bMovements = movementsByBatch.get(b.id) ?? [];
      const customerNames = compAlloc.allocatedCustomerNames;

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

      const isRawOnly = (stageQuantities[rawStage?.id ?? ''] ?? 0) === inFactoryQty && inFactoryQty > 0;
      const isReadyOnly = (stageQuantities[readyStage?.id ?? ''] ?? 0) === inFactoryQty && inFactoryQty > 0;
      const isInProduction = activeStages.some(
        (as) => as.stageName !== 'Raw Stock' && as.stageName !== 'Ready' && as.qty > 0
      );

      const receivedDate = new Date(b.received_on);
      const ageInDays = Math.max(0, Math.floor((referenceDate.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24)));
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
        resolvedCapName: null,
        resolvedAtomizerName: null,
        resolvedBoxName: null,
      };
    }

    // Standard carrier batch processing (Bottles & directly moved items)
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

    // Real Aging Calculation
    const receivedDate = new Date(b.received_on);
    const ageInDays = Math.max(0, Math.floor((referenceDate.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24)));
    const isStalled = inFactoryQty > 0 && ageInDays >= 7;

    const resolvedCapName =
      b.cap_item?.name ||
      bMovements.slice().reverse().find((m) => m.cap_name)?.cap_name ||
      null;
    const resolvedAtomizerName =
      b.atomizer_item?.name ||
      bMovements.slice().reverse().find((m) => m.atomizer_name)?.atomizer_name ||
      null;
    const resolvedBoxName =
      b.box_item?.name ||
      bMovements.slice().reverse().find((m) => m.box_name)?.box_name ||
      null;

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
      resolvedCapName,
      resolvedAtomizerName,
      resolvedBoxName,
    };
  });

  // Stage-wise aggregation and multi-category breakdown for each stage
  const stageBreakdown = processStages.map((s) => {
    const batchesAtStage = batchMatrix
      .filter((item) => (item.stageQuantities[s.id] ?? 0) > 0)
      .map((item) => ({
        batch: item.batch,
        qty: item.stageQuantities[s.id] ?? 0,
        customerNames: item.customerNames,
        ageInDays: item.ageInDays,
        resolvedCapName: item.resolvedCapName,
        resolvedAtomizerName: item.resolvedAtomizerName,
        resolvedBoxName: item.resolvedBoxName,
        category: item.batch.item?.category || 'Bottle',
      }));

    const totalStageQty = batchesAtStage.reduce((sum, item) => sum + item.qty, 0);
    const bottlesQty = batchesAtStage
      .filter((item) => isBottleCategory(item.category))
      .reduce((sum, item) => sum + item.qty, 0);
    const capsQty = batchesAtStage
      .filter((item) => {
        const cat = (item.category || '').toLowerCase().trim();
        return cat.includes('cap') || cat.includes('closure');
      })
      .reduce((sum, item) => sum + item.qty, 0);
    const atomizersQty = batchesAtStage
      .filter((item) => {
        const cat = (item.category || '').toLowerCase().trim();
        return cat.includes('atomizer') || cat.includes('pump') || cat.includes('spray');
      })
      .reduce((sum, item) => sum + item.qty, 0);
    const boxesQty = batchesAtStage
      .filter((item) => {
        const cat = (item.category || '').toLowerCase().trim();
        return cat.includes('packaging') || cat.includes('pack') || cat.includes('box') || cat.includes('carton') || cat.includes('mono');
      })
      .reduce((sum, item) => sum + item.qty, 0);

    return {
      stage: s,
      totalQty: totalStageQty,
      bottlesQty,
      capsQty,
      atomizersQty,
      boxesQty,
      batches: batchesAtStage,
    };
  });

  // Overall Factory Hard-Count Metrics
  const totalReceived = batches.reduce((sum, b) => sum + b.qty_received, 0);
  const totalDispatched = batchMatrix.reduce((sum, bm) => sum + bm.dispatchedQty, 0);
  const totalInsideFactory = batchMatrix.reduce((sum, bm) => sum + bm.inFactoryQty, 0);
  const rawStockTotal = stageBreakdown.find((s) => s.stage.name === 'Raw Stock')?.totalQty ?? 0;
  const readyStockTotal = stageBreakdown.find((s) => s.stage.name === 'Ready')?.totalQty ?? 0;
  const scrapTotal = stageBreakdown.find((s) => s.stage.name === 'Scrap / Defect')?.totalQty ?? 0;
  const productionTotal = stageBreakdown
    .filter((s) => s.stage.name !== 'Raw Stock' && s.stage.name !== 'Ready' && s.stage.name !== 'Scrap / Defect' && s.stage.name !== 'Dispatched')
    .reduce((sum, s) => sum + s.totalQty, 0);

  // Entity Hard Counts
  const batchesInFactoryCount = batchMatrix.filter((b) => b.inFactoryQty > 0).length;
  const rawBatchesCount = batchMatrix.filter((b) => (b.stageQuantities[rawStage?.id ?? ''] ?? 0) > 0).length;
  const productionBatchesCount = batchMatrix.filter((b) => b.isInProduction).length;
  const readyBatchesCount = batchMatrix.filter((b) => (b.stageQuantities[readyStage?.id ?? ''] ?? 0) > 0).length;
  const dispatchedBatchesCount = batchMatrix.filter((b) => b.dispatchedQty > 0).length;
  const stalledBatches = batchMatrix.filter((b) => b.isStalled);

  const uniqueCustomers = Array.from(
    new Set([
      ...dispatches.map((d) => d.customer_name),
      ...batchMatrix.flatMap((bm) => bm.customerNames),
    ].filter(Boolean))
  );
  const uniqueCustomersCount = uniqueCustomers.length;

  const activeRacks = Array.from(new Set(batchMatrix.filter((b) => b.inFactoryQty > 0).map((b) => b.batch.location).filter(Boolean)));
  const activeRacksCount = activeRacks.length;

  const uniqueItemsCount = new Set(batches.map((b) => b.item_id).filter(Boolean)).size;
  const uniqueSuppliersCount = new Set(batches.map((b) => b.supplier_id).filter(Boolean)).size;

  // Timeline Boundaries
  const earliestInwardDate = batches.length > 0 ? batches.reduce((min, b) => (b.received_on < min ? b.received_on : min), batches[0].received_on) : null;
  const latestInwardDate = batches.length > 0 ? batches.reduce((max, b) => (b.received_on > max ? b.received_on : max), batches[0].received_on) : null;
  const latestMovementDate = movements.length > 0 ? movements.reduce((max, m) => (m.moved_on > max ? m.moved_on : max), movements[0].moved_on) : null;
  const latestDispatchDate = dispatches.length > 0 ? dispatches.reduce((max, d) => (d.dispatched_on > max ? d.dispatched_on : max), dispatches[0].dispatched_on) : null;

  // Enriched Movements
  const enrichedMovements = movements.map((m) => {
    const b = batchMap.get(m.batch_id);
    return {
      ...m,
      batch: b,
      batchNo: b?.batch_no ?? 'Unknown',
      brandName: b?.brand_name || null,
      itemName: b?.item?.name ?? 'Unknown Item',
      supplierName: b?.supplier?.name ?? 'Unknown Supplier',
    };
  });

  // Enriched Dispatches
  const enrichedDispatches = dispatches.map((d) => {
    const b = batchMap.get(d.batch_id);
    const bMoves = movementsByBatch.get(d.batch_id) ?? [];

    const resolvedCapName =
      d.cap_name ||
      b?.cap_item?.name ||
      bMoves.slice().reverse().find((m) => m.cap_name)?.cap_name ||
      null;

    const resolvedAtomizerName =
      d.atomizer_name ||
      b?.atomizer_item?.name ||
      bMoves.slice().reverse().find((m) => m.atomizer_name)?.atomizer_name ||
      null;

    const resolvedBoxName =
      d.box_name ||
      b?.box_item?.name ||
      bMoves.slice().reverse().find((m) => m.box_name)?.box_name ||
      null;

    const resolvedColor =
      d.color ||
      b?.color ||
      bMoves.slice().reverse().find((m) => m.color)?.color ||
      null;

    return {
      ...d,
      batch: b,
      batchNo: b?.batch_no ?? 'Unknown',
      brandName: b?.brand_name || null,
      itemName: b?.item?.name ?? 'Unknown Item',
      supplierName: b?.supplier?.name ?? 'Unknown Supplier',
      resolvedCapName,
      resolvedAtomizerName,
      resolvedBoxName,
      resolvedColor,
      capsUsed: resolvedCapName ? d.qty : 0,
      atomizersUsed: resolvedAtomizerName ? d.qty : 0,
      boxesUsed: resolvedBoxName ? d.qty : 0,
    };
  });

  // 4-Pillar Inventory Totals
  const bottleBatches = batches.filter(isBottleBatch);
  const totalBottlesInwarded = bottleBatches.reduce((s, b) => s + b.qty_received, 0);
  const totalBottlesDispatched = enrichedDispatches
    .filter((d) => isBottleCategory(d.batch?.item?.category))
    .reduce((s, d) => s + d.qty, 0);
  const totalBottlesInsideFactory = Math.max(0, totalBottlesInwarded - totalBottlesDispatched);
  const totalBottlesRaw = batchMatrix
    .filter((bm) => isBottleBatch(bm.batch))
    .reduce((s, bm) => s + (bm.stageQuantities[rawStage?.id ?? ''] ?? 0), 0);
  const totalBottlesReady = batchMatrix
    .filter((bm) => isBottleBatch(bm.batch))
    .reduce((s, bm) => s + (bm.stageQuantities[readyStage?.id ?? ''] ?? 0), 0);
  
  const scrapStage = stages.find((s) => s.name === 'Scrap / Defect' || s.name.toLowerCase().includes('scrap'));
  const totalBottlesScrapped = batchMatrix
    .filter((bm) => isBottleBatch(bm.batch))
    .reduce((s, bm) => s + (scrapStage ? (bm.stageQuantities[scrapStage.id] ?? 0) : 0), 0);
  
  const totalBottlesInProduction = Math.max(0, totalBottlesInsideFactory - totalBottlesRaw - totalBottlesReady - totalBottlesScrapped);

  const capComponentList = componentStocks.filter((c) => {
    const cat = (c.category || '').toLowerCase().trim();
    return cat.includes('cap') || cat.includes('closure');
  });
  const totalCapsInwarded = capComponentList.reduce((s, c) => s + c.totalInwarded, 0);
  const totalCapsUsed = capComponentList.reduce((s, c) => s + c.totalUsedInBatches, 0);
  const totalCapsInFactoryAssembled = capComponentList.reduce((s, c) => s + c.totalInFactoryAssembled, 0);
  const totalCapsDispatched = capComponentList.reduce((s, c) => s + c.totalDispatchedInOrders, 0);
  const totalCapsScrapped = capComponentList.reduce((s, c) => s + c.totalScrapped, 0);
  const totalCapsAvailable = capComponentList.reduce((s, c) => s + c.availableStock, 0);

  const atomizerComponentList = componentStocks.filter((c) => {
    const cat = (c.category || '').toLowerCase().trim();
    return cat.includes('atomizer') || cat.includes('pump') || cat.includes('spray');
  });
  const totalAtomizersInwarded = atomizerComponentList.reduce((s, c) => s + c.totalInwarded, 0);
  const totalAtomizersUsed = atomizerComponentList.reduce((s, c) => s + c.totalUsedInBatches, 0);
  const totalAtomizersInFactoryAssembled = atomizerComponentList.reduce((s, c) => s + c.totalInFactoryAssembled, 0);
  const totalAtomizersDispatched = atomizerComponentList.reduce((s, c) => s + c.totalDispatchedInOrders, 0);
  const totalAtomizersScrapped = atomizerComponentList.reduce((s, c) => s + c.totalScrapped, 0);
  const totalAtomizersAvailable = atomizerComponentList.reduce((s, c) => s + c.availableStock, 0);

  const boxComponentList = componentStocks.filter((c) => {
    const cat = (c.category || '').toLowerCase().trim();
    return cat.includes('packaging') || cat.includes('pack') || cat.includes('box') || cat.includes('carton') || cat.includes('mono');
  });
  const totalBoxesInwarded = boxComponentList.reduce((s, c) => s + c.totalInwarded, 0);
  const totalBoxesUsed = boxComponentList.reduce((s, c) => s + c.totalUsedInBatches, 0);
  const totalBoxesInFactoryAssembled = boxComponentList.reduce((s, c) => s + c.totalInFactoryAssembled, 0);
  const totalBoxesDispatched = boxComponentList.reduce((s, c) => s + c.totalDispatchedInOrders, 0);
  const totalBoxesScrapped = boxComponentList.reduce((s, c) => s + c.totalScrapped, 0);
  const totalBoxesAvailable = boxComponentList.reduce((s, c) => s + c.availableStock, 0);

  return {
    processStages,
    batchMatrix,
    stageBreakdown,
    totalReceived,
    totalDispatched,
    totalInsideFactory,
    rawStockTotal,
    readyStockTotal,
    scrapTotal,
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
    totalBottlesInwarded,
    totalBottlesDispatched,
    totalBottlesInsideFactory,
    totalBottlesRaw,
    totalBottlesReady,
    totalBottlesScrapped,
    totalBottlesInProduction,
    totalCapsInwarded,
    totalCapsUsed,
    totalCapsInFactoryAssembled,
    totalCapsDispatched,
    totalCapsScrapped,
    totalCapsAvailable,
    totalAtomizersInwarded,
    totalAtomizersUsed,
    totalAtomizersInFactoryAssembled,
    totalAtomizersDispatched,
    totalAtomizersScrapped,
    totalAtomizersAvailable,
    totalBoxesInwarded,
    totalBoxesUsed,
    totalBoxesInFactoryAssembled,
    totalBoxesDispatched,
    totalBoxesScrapped,
    totalBoxesAvailable,
    componentStocks,
    asOfDate: asOfDate || null,
  };
}

export type DashboardCalculations = NonNullable<ReturnType<typeof calculateDashboardMetrics>>;
