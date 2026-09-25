import type { BatchSplit } from '@/views/outward/types';

export type FIFOStockSource = {
  id: string;
  batch_no: string;
  location?: string;
  received_on?: string | null;
  created_at?: string | null;
};

export type StageStockItem = {
  stage_id: string;
  qty: number;
};

/**
 * Sorts batches by receipt date (received_on ASC), then created_at ASC.
 * Oldest inventory is prioritized first for FIFO.
 */
export function sortBatchesByFIFO<T extends FIFOStockSource>(batches: T[]): T[] {
  return [...batches].sort((a, b) => {
    const dateA = a.received_on ? new Date(a.received_on).getTime() : 0;
    const dateB = b.received_on ? new Date(b.received_on).getTime() : 0;

    if (dateA !== dateB) {
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA - dateB;
    }

    const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return createdA - createdB;
  });
}

/**
 * Computes FIFO batch deduction splits for a requested quantity at a specific stage.
 * Returns an array of BatchSplit allocating stock from oldest batches first.
 * If total available stock across all batches is less than requestedQty, returns an empty array.
 */
export function calculateFIFOSplits(params: {
  requestedQty: number;
  stageId: string;
  batches: FIFOStockSource[];
  perBatchStock: Map<string, StageStockItem[]>;
}): BatchSplit[] {
  const { requestedQty, stageId, batches, perBatchStock } = params;
  if (!requestedQty || requestedQty <= 0) return [];

  const sorted = sortBatchesByFIFO(batches);
  let remaining = requestedQty;
  const splits: BatchSplit[] = [];

  for (const batch of sorted) {
    const stockList = perBatchStock.get(batch.id) || [];
    const stageEntry = stockList.find((s) => s.stage_id === stageId);
    const available = Math.max(0, stageEntry?.qty ?? 0);

    if (available <= 0) continue;

    const take = Math.min(remaining, available);
    splits.push({
      batch_id: batch.id,
      batch_no: batch.batch_no,
      location: batch.location,
      qty: take,
    });

    remaining -= take;
    if (remaining === 0) break;
  }

  // If there wasn't enough total stock across batches, return empty array
  if (remaining > 0) {
    return [];
  }

  return splits;
}

/**
 * Computes FIFO batch deduction splits for scrap loss from residual balances
 * after forward splits have been deducted.
 * Guarantees that (q_forward + s_scrap <= available) for every batch, preventing trigger crashes.
 */
export function calculateFIFOSplitsFromRemaining(params: {
  scrapQty: number;
  stageId: string;
  batches: FIFOStockSource[];
  perBatchStock: Map<string, StageStockItem[]>;
  usedSplits: BatchSplit[];
}): BatchSplit[] {
  const { scrapQty, stageId, batches, perBatchStock, usedSplits } = params;
  if (!scrapQty || scrapQty <= 0) return [];

  const sorted = sortBatchesByFIFO(batches);
  let remaining = scrapQty;
  const splits: BatchSplit[] = [];

  // Build a map of used quantities per batch
  const usedMap = new Map<string, number>();
  for (const u of usedSplits) {
    usedMap.set(u.batch_id, (usedMap.get(u.batch_id) || 0) + u.qty);
  }

  for (const batch of sorted) {
    const stockList = perBatchStock.get(batch.id) || [];
    const stageEntry = stockList.find((s) => s.stage_id === stageId);
    const totalAvail = Math.max(0, stageEntry?.qty ?? 0);
    const usedInForward = usedMap.get(batch.id) || 0;
    const residual = Math.max(0, totalAvail - usedInForward);

    if (residual <= 0) continue;

    const take = Math.min(remaining, residual);
    splits.push({
      batch_id: batch.id,
      batch_no: batch.batch_no,
      location: batch.location,
      qty: take,
    });

    remaining -= take;
    if (remaining === 0) break;
  }

  if (remaining > 0) {
    return [];
  }

  return splits;
}
