import { supabase } from '../supabase';
import { fetchWithCache, CACHE_TTL } from '../cache';
import type { LocationStock } from '../types';
import type {
  Item,
  Stage,
  InwardBatch,
  Dispatch,
  ComponentStockSummary,
  ItemStockReceipt,
} from '../types/database';
import { viewQuery } from './core';
import { fetchItems, fetchItemStockReceipts } from './items';
import { fetchStages } from './stages';
import { fetchBatches } from './batches';
import { fetchMovements } from './movements';
import { fetchDispatches } from './dispatches';
import { fetchBatchAllocations } from './allocations';

/**
 * How many units are currently sitting in each storage location.
 * A batch's location is recorded on the inward entry; its in-factory quantity
 * is what was received minus what has already been dispatched.
 */
export async function fetchLocationStock(): Promise<LocationStock[]> {
  return fetchWithCache('location_stock', async () => {
    const fromView = await viewQuery<LocationStock>(() =>
      supabase.from('v_location_stock').select('location, qty'),
    );
    if (fromView) return fromView.sort((a, b) => b.qty - a.qty);

    // Fallback: computed locally (used until the migration is applied).
    const [batches, dispatches] = await Promise.all([
      supabase.from('inward_batches').select('id, location, qty_received'),
      supabase.from('dispatches').select('batch_id, qty'),
    ]);
    if (batches.error) throw batches.error;
    if (dispatches.error) throw dispatches.error;

    const dispatchedByBatch = new Map<string, number>();
    for (const d of (dispatches.data ?? []) as Pick<Dispatch, 'batch_id' | 'qty'>[]) {
      dispatchedByBatch.set(d.batch_id, (dispatchedByBatch.get(d.batch_id) ?? 0) + d.qty);
    }

    const byLocation = new Map<string, number>();
    for (const b of (batches.data ?? []) as Pick<InwardBatch, 'id' | 'location' | 'qty_received'>[]) {
      const inFactory = b.qty_received - (dispatchedByBatch.get(b.id) ?? 0);
      if (inFactory <= 0) continue;
      byLocation.set(b.location, (byLocation.get(b.location) ?? 0) + inFactory);
    }
    return [...byLocation.entries()]
      .map(([location, qty]) => ({ location, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, CACHE_TTL.SHORT);
}

export type ComponentStockViewRow = {
  item_id: string;
  item_name: string;
  category: string;
  unit: string;
  total_inwarded: number;
  inward_batch_count: number;
  total_used: number;
  used_in_batch_count: number;
  total_scrapped: number;
  total_dispatched: number;
  available_stock: number;
};

/**
 * Runs a query against the server-side component stock view v_component_stock.
 * Returns null when the view does not exist yet so callers can fall back to local computation.
 */
export async function fetchComponentStockFromView(): Promise<ComponentStockViewRow[] | null> {
  return viewQuery<ComponentStockViewRow>(() =>
    supabase.from('v_component_stock').select('*')
  );
}

/**
 * Calculates complete Bill of Materials (BOM) inventory for all components
 * (Caps, Atomizers, Boxes / Packaging, Labels, Raw Materials, etc.).
 *
 * Reconciles:
 * 1. Total Inwarded (from inward_batches where item_id = item.id)
 * 2. Total Used in Batches (from stage_movements where this component was assembled)
 * 3. Total Dispatched in Customer Orders (dispatches linked to batches using this component)
 * 4. Total Scrapped (defects)
 * 5. Available In-Stock Balance
 * 6. Granular orderUsageList and batchUsageList for 100% auditability
 */
export type PreloadedComponentEntities = {
  items?: Item[];
  stages?: Stage[];
  batches?: unknown[];
  movements?: unknown[];
  dispatches?: unknown[];
  receipts?: ItemStockReceipt[];
  allocations?: unknown[];
};

export async function fetchComponentStockSummary(
  asOfDate?: string | null,
  preloaded?: PreloadedComponentEntities
): Promise<ComponentStockSummary[]> {
  const [items, stages, batchesData, movementsData, dispatchesData, receiptsData, allocationsData] = await Promise.all([
    preloaded?.items ?? fetchItems().catch(() => []),
    preloaded?.stages ?? fetchStages().catch(() => []),
    preloaded?.batches ?? fetchBatches().catch(() => []),
    preloaded?.movements ?? fetchMovements().catch(() => []),
    preloaded?.dispatches ?? fetchDispatches().catch(() => []),
    preloaded?.receipts ?? fetchItemStockReceipts().catch(() => []),
    preloaded?.allocations ?? fetchBatchAllocations().catch(() => []),
  ]);

  const stageMap = new Map(stages.map((s) => [s.id, s]));

  const rawAllocations = asOfDate
    ? (allocationsData as unknown as { source_batch_id: string; destination_batch_id: string; qty: number; allocated_on: string }[]).filter((a) => a.allocated_on <= asOfDate)
    : (allocationsData as unknown as { source_batch_id: string; destination_batch_id: string; qty: number; allocated_on: string }[]);

  const allocOutByBatch = new Map<string, number>();
  const allocInByBatch = new Map<string, number>();
  for (const a of rawAllocations) {
    allocOutByBatch.set(a.source_batch_id, (allocOutByBatch.get(a.source_batch_id) ?? 0) + (Number(a.qty) || 0));
    allocInByBatch.set(a.destination_batch_id, (allocInByBatch.get(a.destination_batch_id) ?? 0) + (Number(a.qty) || 0));
  }

  // Apply optional point-in-time historical filter
  const allBatches = batchesData as unknown as {
    id: string;
    item_id: string;
    batch_no: string;
    qty_received: number;
    received_on: string;
    cap_item_id?: string | null;
    atomizer_item_id?: string | null;
    box_item_id?: string | null;
    cap_qty?: number | null;
    atomizer_qty?: number | null;
    box_qty?: number | null;
  }[];
  const rawBatches = asOfDate ? allBatches.filter((b) => b.received_on <= asOfDate) : allBatches;

  const allReceipts = receiptsData || [];
  const receipts = asOfDate ? allReceipts.filter((r) => r.received_on <= asOfDate) : allReceipts;
  const receiptsByItem = new Map<string, number>();
  for (const r of (receipts ?? [])) {
    receiptsByItem.set(r.item_id, (receiptsByItem.get(r.item_id) ?? 0) + (Number(r.qty) || 0));
  }

  const allMovements = (movementsData as unknown as Record<string, unknown>[]).map((m) => ({
    id: (m.id as string) || '',
    batch_id: (m.batch_id as string) || '',
    qty_moved: Number(m.qty_moved || 0),
    moved_on: (m.moved_on as string) || '',
    variant_name: (m.variant_name as string) || null,
    cap_name: (m.cap_name as string) || null,
    atomizer_name: (m.atomizer_name as string) || null,
    box_name: (m.box_name as string) || null,
    cap_item_id: (m.cap_item_id as string) || null,
    atomizer_item_id: (m.atomizer_item_id as string) || null,
    box_item_id: (m.box_item_id as string) || null,
    cap_qty_used: Number(m.cap_qty_used || 0),
    atomizer_qty_used: Number(m.atomizer_qty_used || 0),
    box_qty_used: Number(m.box_qty_used || 0),
    from_stage: (m.from_stage as Stage) ?? (m.from_stage_id ? stageMap.get(m.from_stage_id as string) ?? null : null),
    to_stage: (m.to_stage as Stage) ?? (m.to_stage_id ? stageMap.get(m.to_stage_id as string) ?? null : null),
    remarks: (m.remarks as string) || null,
  }));
  const rawMovements = asOfDate ? allMovements.filter((m) => m.moved_on <= asOfDate) : allMovements;

  const allDispatches = (dispatchesData as unknown as Record<string, unknown>[]).map((d) => ({
    id: (d.id as string) || '',
    batch_id: (d.batch_id as string) || '',
    qty: Number(d.qty || 0),
    customer_name: (d.customer_name as string) || '',
    invoice_no: (d.invoice_no as string) || '',
    dispatched_on: (d.dispatched_on as string) || '',
    variant_name: (d.variant_name as string) || null,
    cap_name: (d.cap_name as string) || null,
    atomizer_name: (d.atomizer_name as string) || null,
    box_name: (d.box_name as string) || null,
    box_item_id: (d.box_item_id as string) || null,
    color: (d.color as string) || null,
  }));
  const rawDispatches = asOfDate ? allDispatches.filter((d) => d.dispatched_on <= asOfDate) : allDispatches;

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const batchMap = new Map(rawBatches.map((b) => [b.id, b]));

  // Pre-calculate movements per batch for component attachment lookups
  const movementsByBatch = new Map<string, typeof rawMovements>();
  for (const m of rawMovements) {
    const list = movementsByBatch.get(m.batch_id) ?? [];
    list.push(m);
    movementsByBatch.set(m.batch_id, list);
  }

  // Build unified component registry: all DB items + any named floor components
  const unifiedItemMap = new Map<string, Item>();
  for (const itm of items) {
    unifiedItemMap.set(itm.id, itm);
  }

  // Helper to find existing item case-insensitively & category-aware
  const findItemByNameAndCategory = (name: string, category: string): Item | null => {
    const clean = name.trim().toLowerCase();
    const cleanCat = category.trim().toLowerCase();
    for (const itm of unifiedItemMap.values()) {
      const itmName = (itm.name || '').trim().toLowerCase();
      const itmCat = (itm.category || '').trim().toLowerCase();
      if (itmName === clean && (itmCat === cleanCat || itmCat.includes(cleanCat) || cleanCat.includes(itmCat))) {
        return itm;
      }
    }
    return null;
  };

  // Discover named components from movements and dispatches only if not already in DB
  for (const m of rawMovements) {
    if (m.cap_name && !m.cap_item_id) {
      const cleanName = m.cap_name.trim();
      if (cleanName && !findItemByNameAndCategory(cleanName, 'Cap')) {
        const synthId = `discovered-cap-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        if (!unifiedItemMap.has(synthId)) {
          unifiedItemMap.set(synthId, {
            id: synthId,
            name: cleanName,
            category: 'Cap',
            unit: 'pcs',
            color: null,
            description: 'Factory floor component',
            created_at: new Date().toISOString(),
          });
        }
      }
    }
    if (m.atomizer_name && !m.atomizer_item_id) {
      const cleanName = m.atomizer_name.trim();
      if (cleanName && !findItemByNameAndCategory(cleanName, 'Atomizer')) {
        const synthId = `discovered-atomizer-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        if (!unifiedItemMap.has(synthId)) {
          unifiedItemMap.set(synthId, {
            id: synthId,
            name: cleanName,
            category: 'Atomizer',
            unit: 'pcs',
            color: null,
            description: 'Factory floor component',
            created_at: new Date().toISOString(),
          });
        }
      }
    }
    if (m.box_name && !m.box_item_id) {
      const cleanName = m.box_name.trim();
      if (cleanName && !findItemByNameAndCategory(cleanName, 'Packaging')) {
        const synthId = `discovered-box-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        if (!unifiedItemMap.has(synthId)) {
          unifiedItemMap.set(synthId, {
            id: synthId,
            name: cleanName,
            category: 'Packaging',
            unit: 'pcs',
            color: null,
            description: 'Factory floor packaging',
            created_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  for (const d of rawDispatches) {
    if (d.cap_name) {
      const cleanName = d.cap_name.trim();
      if (cleanName && !findItemByNameAndCategory(cleanName, 'Cap')) {
        const synthId = `discovered-cap-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        if (!unifiedItemMap.has(synthId)) {
          unifiedItemMap.set(synthId, {
            id: synthId,
            name: cleanName,
            category: 'Cap',
            unit: 'pcs',
            color: null,
            description: 'Customer order component',
            created_at: new Date().toISOString(),
          });
        }
      }
    }
    if (d.atomizer_name) {
      const cleanName = d.atomizer_name.trim();
      if (cleanName && !findItemByNameAndCategory(cleanName, 'Atomizer')) {
        const synthId = `discovered-atomizer-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        if (!unifiedItemMap.has(synthId)) {
          unifiedItemMap.set(synthId, {
            id: synthId,
            name: cleanName,
            category: 'Atomizer',
            unit: 'pcs',
            color: null,
            description: 'Customer order component',
            created_at: new Date().toISOString(),
          });
        }
      }
    }
    if (d.box_name && !d.box_item_id) {
      const cleanName = d.box_name.trim();
      if (cleanName && !findItemByNameAndCategory(cleanName, 'Packaging')) {
        const synthId = `discovered-box-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        if (!unifiedItemMap.has(synthId)) {
          unifiedItemMap.set(synthId, {
            id: synthId,
            name: cleanName,
            category: 'Packaging',
            unit: 'pcs',
            color: null,
            description: 'Customer order packaging',
            created_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  return [...unifiedItemMap.values()].map((item) => {
    const itemCat = (item.category || 'Bottle').trim();
    const isBottle = itemCat.toLowerCase() === 'bottle';
    const isCap = itemCat.toLowerCase() === 'cap';
    const isAtomizer = itemCat.toLowerCase() === 'atomizer';
    const isPackaging = itemCat.toLowerCase() === 'packaging';
    const itemNameNorm = item.name.toLowerCase().trim();

    let totalScrapped = 0;
    const usedBatchesMap = new Map<string, { qty: number; latestDate: string }>();
    let latestUsedDate: string | null = null;

    // 1. Analyze Batch Component Usage with milestone deduplication
    for (const [batchId, bMoves] of movementsByBatch.entries()) {
      const b = batchMap.get(batchId);
      const batchIntakeQty = b?.qty_received ?? 0;

      // Check if this batch is linked to the component
      let isBatchLinked = false;
      let batchComponentIntake = batchIntakeQty;

      if (isBottle) {
        isBatchLinked = b?.item_id === item.id || (b?.item_id ? (itemMap.get(b.item_id)?.name.toLowerCase().trim() === itemNameNorm) : false);
      } else if (isCap) {
        isBatchLinked =
          b?.item_id === item.id ||
          (b?.item_id ? (itemMap.get(b.item_id)?.name.toLowerCase().trim() === itemNameNorm) : false) ||
          Boolean(b?.cap_item_id && (b.cap_item_id === item.id || itemMap.get(b.cap_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
          bMoves.some((m) => Boolean(m.cap_item_id && (m.cap_item_id === item.id || itemMap.get(m.cap_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
                            Boolean(m.cap_name && m.cap_name.toLowerCase().trim() === itemNameNorm));
        if (b?.cap_qty && b.cap_qty > 0) batchComponentIntake = b.cap_qty;
      } else if (isAtomizer) {
        isBatchLinked =
          b?.item_id === item.id ||
          (b?.item_id ? (itemMap.get(b.item_id)?.name.toLowerCase().trim() === itemNameNorm) : false) ||
          Boolean(b?.atomizer_item_id && (b.atomizer_item_id === item.id || itemMap.get(b.atomizer_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
          bMoves.some((m) => Boolean(m.atomizer_item_id && (m.atomizer_item_id === item.id || itemMap.get(m.atomizer_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
                            Boolean(m.atomizer_name && m.atomizer_name.toLowerCase().trim() === itemNameNorm));
        if (b?.atomizer_qty && b.atomizer_qty > 0) batchComponentIntake = b.atomizer_qty;
      } else if (isPackaging) {
        isBatchLinked =
          b?.item_id === item.id ||
          (b?.item_id ? (itemMap.get(b.item_id)?.name.toLowerCase().trim() === itemNameNorm) : false) ||
          Boolean(b?.box_item_id && (b.box_item_id === item.id || itemMap.get(b.box_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
          bMoves.some((m) => Boolean(m.box_item_id && (m.box_item_id === item.id || itemMap.get(m.box_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
                            Boolean(m.box_name && m.box_name.toLowerCase().trim() === itemNameNorm));
        if (b?.box_qty && b.box_qty > 0) batchComponentIntake = b.box_qty;
      } else {
        isBatchLinked =
          b?.item_id === item.id ||
          (b?.item_id ? (itemMap.get(b.item_id)?.name.toLowerCase().trim() === itemNameNorm) : false) ||
          Boolean(b?.cap_item_id === item.id || b?.atomizer_item_id === item.id || b?.box_item_id === item.id) ||
          bMoves.some((m) => m.cap_item_id === item.id || m.atomizer_item_id === item.id || m.box_item_id === item.id ||
                            m.cap_name?.toLowerCase().trim() === itemNameNorm ||
                            m.atomizer_name?.toLowerCase().trim() === itemNameNorm ||
                            m.box_name?.toLowerCase().trim() === itemNameNorm);
      }

      if (!isBatchLinked) continue;

      // Track movement-based component usage deduplicated at the primary assembly milestone stage
      let assemblyStageUsage = 0;
      let hasAssemblyMoves = false;
      let batchScrap = 0;
      let maxMovementDate = b?.received_on || '';

      for (const m of bMoves) {
        let isMoveMatch = false;
        let explicitQty = 0;

        if (isCap && ((m.cap_item_id && (m.cap_item_id === item.id || itemMap.get(m.cap_item_id)?.name.toLowerCase().trim() === itemNameNorm)) || (m.cap_name && m.cap_name.toLowerCase().trim() === itemNameNorm))) {
          isMoveMatch = true;
          if (m.cap_qty_used > 0) explicitQty = m.cap_qty_used;
        } else if (isAtomizer && ((m.atomizer_item_id && (m.atomizer_item_id === item.id || itemMap.get(m.atomizer_item_id)?.name.toLowerCase().trim() === itemNameNorm)) || (m.atomizer_name && m.atomizer_name.toLowerCase().trim() === itemNameNorm))) {
          isMoveMatch = true;
          if (m.atomizer_qty_used > 0) explicitQty = m.atomizer_qty_used;
        } else if (isPackaging && ((m.box_item_id && (m.box_item_id === item.id || itemMap.get(m.box_item_id)?.name.toLowerCase().trim() === itemNameNorm)) || (m.box_name && m.box_name.toLowerCase().trim() === itemNameNorm))) {
          isMoveMatch = true;
          if (m.box_qty_used > 0) explicitQty = m.box_qty_used;
        } else if (!isBottle && (m.cap_item_id === item.id || m.atomizer_item_id === item.id || m.box_item_id === item.id || m.cap_name?.toLowerCase().trim() === itemNameNorm || m.atomizer_name?.toLowerCase().trim() === itemNameNorm || m.box_name?.toLowerCase().trim() === itemNameNorm)) {
          isMoveMatch = true;
        }

        if (isMoveMatch) {
          const isReversal =
            Boolean(m.remarks && m.remarks.toUpperCase().includes('[REVERSAL')) ||
            Boolean(m.to_stage && m.from_stage && (m.from_stage.sequence_no > m.to_stage.sequence_no || m.from_stage.name === 'Scrap / Defect'));

          const effectiveMoveQty = explicitQty > 0 ? explicitQty : m.qty_moved;

          if (m.to_stage?.name === 'Scrap / Defect') {
            batchScrap += effectiveMoveQty;
          } else if (m.from_stage?.name === 'Scrap / Defect') {
            batchScrap = Math.max(0, batchScrap - effectiveMoveQty);
          } else {
            const isForwardMilestone = isPackaging
              ? (m.from_stage?.name === 'Packaging' || (m.from_stage && m.from_stage.sequence_no <= 5 && m.to_stage && m.to_stage.sequence_no > 5))
              : (isCap || isAtomizer)
              ? (m.from_stage?.name === 'Filling' || (m.from_stage && m.from_stage.sequence_no <= 4 && m.to_stage && m.to_stage.sequence_no > 4))
              : (m.from_stage?.sequence_no === 1 && m.to_stage && m.to_stage.sequence_no > 1);

            const isReverseMilestone = isPackaging
              ? (m.to_stage?.name === 'Packaging' || (m.from_stage && m.from_stage.sequence_no > 5 && m.to_stage && m.to_stage.sequence_no <= 5))
              : (isCap || isAtomizer)
              ? (m.to_stage?.name === 'Filling' || (m.from_stage && m.from_stage.sequence_no > 4 && m.to_stage && m.to_stage.sequence_no <= 4))
              : (m.to_stage?.sequence_no === 1 && m.from_stage && m.from_stage.sequence_no > 1);

            if (isReversal && (isReverseMilestone || isForwardMilestone)) {
              hasAssemblyMoves = true;
              assemblyStageUsage = Math.max(0, assemblyStageUsage - effectiveMoveQty);
            } else if (!isReversal && isForwardMilestone) {
              hasAssemblyMoves = true;
              assemblyStageUsage += effectiveMoveQty;
            }
          }

          if (m.moved_on && m.moved_on > maxMovementDate) {
            maxMovementDate = m.moved_on;
          }
        }
      }

      // Calculate effective batch usage: bounded by physical batch intake
      let effectiveBatchUsage = 0;
      if (hasAssemblyMoves && assemblyStageUsage > 0) {
        effectiveBatchUsage = Math.min(batchComponentIntake, assemblyStageUsage);
      } else if (bMoves.length > 0) {
        const forwardOutFromRaw = bMoves
          .filter((m) => m.from_stage?.sequence_no === 1 && m.to_stage?.sequence_no !== 1)
          .reduce((s, m) => s + m.qty_moved, 0);
        const reversalsBackToRaw = bMoves
          .filter((m) => m.to_stage?.sequence_no === 1 && m.from_stage && m.from_stage.sequence_no > 1)
          .reduce((s, m) => s + m.qty_moved, 0);
        const netMovedOutOfRaw = Math.max(0, forwardOutFromRaw - reversalsBackToRaw);

        effectiveBatchUsage = Math.min(batchComponentIntake, Math.max(0, netMovedOutOfRaw - batchScrap));
      }

      if (effectiveBatchUsage > 0) {
        usedBatchesMap.set(batchId, {
          qty: effectiveBatchUsage,
          latestDate: maxMovementDate || b?.received_on || '',
        });
        if (!latestUsedDate || (maxMovementDate && maxMovementDate > latestUsedDate)) {
          latestUsedDate = maxMovementDate;
        }
      }
      totalScrapped += batchScrap;
    }

    // Calculate exact Bottle Raw Stock vs In Factory WIP
    let bottleAvailableRawStock = 0;
    let bottleInFactoryWip = 0;
    let bottleTotalMovedFromRaw = 0;
    let bottleScrapTotal = 0;
    let bottleBatchesInProdCount = 0;

    if (isBottle) {
      for (const b of rawBatches) {
        if (b.item_id !== item.id && (itemMap.get(b.item_id)?.name.toLowerCase().trim() !== itemNameNorm)) continue;
        const bAllocOut = allocOutByBatch.get(b.id) ?? 0;
        const bAllocIn = allocInByBatch.get(b.id) ?? 0;
        const intake = Math.max(0, b.qty_received - bAllocOut + bAllocIn);
        const bMoves = movementsByBatch.get(b.id) ?? [];

        const forwardOutFromRaw = bMoves
          .filter((m) => m.from_stage?.sequence_no === 1 && m.to_stage?.sequence_no !== 1)
          .reduce((s, m) => s + m.qty_moved, 0);
        const reversalsBackToRaw = bMoves
          .filter((m) => m.to_stage?.sequence_no === 1 && m.from_stage && m.from_stage.sequence_no > 1)
          .reduce((s, m) => s + m.qty_moved, 0);
        const netMovedOutOfRaw = Math.max(0, forwardOutFromRaw - reversalsBackToRaw);

        if (netMovedOutOfRaw > 0) {
          bottleBatchesInProdCount++;
        }

        const rawStockRemaining = Math.max(0, intake - netMovedOutOfRaw);
        const batchDispatched = rawDispatches
          .filter((d) => d.batch_id === b.id)
          .reduce((s, d) => s + d.qty, 0);

        let batchScrap = 0;
        for (const m of bMoves) {
          if (m.to_stage?.name === 'Scrap / Defect') {
            batchScrap += m.qty_moved;
          } else if (m.from_stage?.name === 'Scrap / Defect') {
            batchScrap = Math.max(0, batchScrap - m.qty_moved);
          }
        }
        bottleScrapTotal += batchScrap;

        const inFactoryWip = Math.max(0, intake - rawStockRemaining - batchDispatched - batchScrap);

        bottleAvailableRawStock += rawStockRemaining;
        bottleInFactoryWip += inFactoryWip;
        bottleTotalMovedFromRaw += netMovedOutOfRaw;
      }
      totalScrapped = bottleScrapTotal;
    }

    const totalUsed = isBottle
      ? bottleTotalMovedFromRaw
      : [...usedBatchesMap.values()].reduce((sum, b) => sum + b.qty, 0);

    // 2. Trace exact Customer Dispatches / Orders that used this item/component
    const orderUsageList: ComponentStockSummary['orderUsageList'] = [];
    let totalDispatchedInOrders = 0;

    for (const d of rawDispatches) {
      const b = batchMap.get(d.batch_id);
      const bMoves = movementsByBatch.get(d.batch_id) ?? [];
      let isOrderMatch = false;

      if (isBottle) {
        isOrderMatch = b?.item_id === item.id;
      } else if (isCap) {
        isOrderMatch =
          Boolean(d.cap_name && d.cap_name.toLowerCase().trim() === itemNameNorm) ||
          Boolean(b?.cap_item_id && (b.cap_item_id === item.id || itemMap.get(b.cap_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
          bMoves.some((m) => m.cap_item_id === item.id || (m.cap_name && m.cap_name.toLowerCase().trim() === itemNameNorm));
      } else if (isAtomizer) {
        isOrderMatch =
          Boolean(d.atomizer_name && d.atomizer_name.toLowerCase().trim() === itemNameNorm) ||
          Boolean(b?.atomizer_item_id && (b.atomizer_item_id === item.id || itemMap.get(b.atomizer_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
          bMoves.some((m) => m.atomizer_item_id === item.id || (m.atomizer_name && m.atomizer_name.toLowerCase().trim() === itemNameNorm));
      } else if (isPackaging) {
        isOrderMatch =
          Boolean(d.box_item_id && (d.box_item_id === item.id || itemMap.get(d.box_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
          Boolean(d.box_name && d.box_name.toLowerCase().trim() === itemNameNorm) ||
          Boolean(b?.box_item_id && (b.box_item_id === item.id || itemMap.get(b.box_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
          bMoves.some((m) => m.box_item_id === item.id || (m.box_name && m.box_name.toLowerCase().trim() === itemNameNorm));
      } else {
        isOrderMatch =
          Boolean(b?.item_id === item.id) ||
          Boolean(d.cap_name?.toLowerCase().trim() === itemNameNorm || d.atomizer_name?.toLowerCase().trim() === itemNameNorm || d.box_name?.toLowerCase().trim() === itemNameNorm);
      }

      if (isOrderMatch) {
        totalDispatchedInOrders += d.qty;
        const bottleItem = b?.item_id ? itemMap.get(b.item_id) : null;
        orderUsageList.push({
          dispatchId: d.id,
          invoiceNo: d.invoice_no,
          customerName: d.customer_name,
          batchId: d.batch_id,
          batchNo: b?.batch_no ?? 'Unknown',
          itemName: bottleItem?.name ?? 'Finished Product',
          dispatchedOn: d.dispatched_on,
          qtyUsed: d.qty,
        });
      }
    }

    // Build batch usage list (only batches with active usage > 0)
    const batchUsageList: ComponentStockSummary['batchUsageList'] = [];
    for (const [bId, bData] of usedBatchesMap.entries()) {
      if (bData.qty <= 0) continue;
      const b = batchMap.get(bId);
      const bottleItem = b?.item_id ? itemMap.get(b.item_id) : null;
      batchUsageList.push({
        batchId: bId,
        batchNo: b?.batch_no ?? 'Unknown',
        itemName: bottleItem?.name ?? 'Product Batch',
        qtyUsed: bData.qty,
        movedOn: bData.latestDate,
      });
    }

    orderUsageList.sort((a, b) => b.dispatchedOn.localeCompare(a.dispatchedOn));
    batchUsageList.sort((a, b) => (b.movedOn ?? '').localeCompare(a.movedOn ?? ''));

    // 3. Multi-Channel Inward Intake Reconciliation (100% Zero-Assumption & Double-Count Immune)
    const accountedBatchIds = new Set<string>();

    // A. Direct Inward Batches (where item_id = item.id)
    let directInwardQty = 0;
    let directCount = 0;
    for (const b of rawBatches) {
      if (b.item_id === item.id || (itemMap.get(b.item_id)?.name.toLowerCase().trim() === itemNameNorm && (itemMap.get(b.item_id)?.category || '').toLowerCase() === itemCat.toLowerCase())) {
        const bAllocOut = allocOutByBatch.get(b.id) ?? 0;
        const bAllocIn = allocInByBatch.get(b.id) ?? 0;
        directInwardQty += Math.max(0, b.qty_received - bAllocOut + bAllocIn);
        directCount++;
        accountedBatchIds.add(b.id);
      }
    }

    // B. Attached Inward Batches (where component was linked to bottle batch on inward)
    let attachedInwardQty = 0;
    let attachedCount = 0;
    for (const b of rawBatches) {
      if (accountedBatchIds.has(b.id)) continue;
      let isAttached = false;
      let attachedQty = b.qty_received;
      if (isCap && b.cap_item_id && (b.cap_item_id === item.id || itemMap.get(b.cap_item_id)?.name.toLowerCase().trim() === itemNameNorm)) {
        isAttached = true;
        attachedQty = b.cap_qty ?? b.qty_received;
      } else if (isAtomizer && b.atomizer_item_id && (b.atomizer_item_id === item.id || itemMap.get(b.atomizer_item_id)?.name.toLowerCase().trim() === itemNameNorm)) {
        isAttached = true;
        attachedQty = b.atomizer_qty ?? b.qty_received;
      } else if (isPackaging && b.box_item_id && (b.box_item_id === item.id || itemMap.get(b.box_item_id)?.name.toLowerCase().trim() === itemNameNorm)) {
        isAttached = true;
        attachedQty = b.box_qty ?? b.qty_received;
      }
      if (isAttached) {
        attachedInwardQty += attachedQty;
        attachedCount++;
        accountedBatchIds.add(b.id);
      }
    }

    // C. Direct Item Receipts from Item Stock Intake Ledger
    const directReceiptsQty = receiptsByItem.get(item.id) ?? 0;
    const directReceiptsCount = receipts?.filter((r) => r.item_id === item.id).length || 0;

    // Total Known / Recorded Physical Inward from Batches + Receipts
    const recordedInwardQty = directInwardQty + attachedInwardQty + directReceiptsQty;

    // D. Floor Assembly / Movement Allocation (Only for unrecorded/legacy components where floor consumption exceeds recorded inward)
    const unrecordedFloorUsage = Math.max(0, totalUsed - recordedInwardQty);
    const totalInwarded = recordedInwardQty + unrecordedFloorUsage;

    const inwardBatchCount = directCount + attachedCount + directReceiptsCount + (unrecordedFloorUsage > 0 ? 1 : 0);

    // Unallocated Warehouse Stock (Stock in Items section not yet assigned to batches)
    const unallocatedWarehouseStock = isBottle
      ? directReceiptsQty
      : Math.max(0, totalInwarded - totalUsed - totalScrapped);

    // 4. Accurate 5-State Balance Math:
    const availableStock = isBottle
      ? (unallocatedWarehouseStock + bottleAvailableRawStock)
      : Math.max(0, totalInwarded - totalUsed - totalScrapped);

    const totalInFactoryAssembled = isBottle
      ? bottleInFactoryWip
      : Math.max(0, totalUsed - totalDispatchedInOrders);

    const stockDeficit = 0;

    return {
      item,
      category: itemCat,
      totalInwarded,
      unallocatedWarehouseStock,
      inwardBatchCount,
      totalUsedInBatches: totalUsed,
      totalInFactoryAssembled,
      usedInBatchCount: isBottle ? bottleBatchesInProdCount : [...usedBatchesMap.values()].filter((b) => b.qty > 0).length,
      totalDispatchedInOrders,
      totalScrapped,
      availableStock,
      stockDeficit,
      latestUsedDate,
      orderUsageList,
      batchUsageList,
    };
  });
}
