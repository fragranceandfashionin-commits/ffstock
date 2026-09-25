import { supabase } from '../supabase';
import { fetchWithCache, invalidateCache, CACHE_TTL } from '../cache';
import type {
  InwardBatch,
  BatchWithRelations,
  StageMovement,
  Dispatch,
  Supplier,
  Item,
} from '../types/database';
import {
  QUERY_SAFETY_LIMIT,
  checkRowLimitGuard,
  resilientInsert,
  resilientBatchInsert,
} from './core';
import { fetchItems } from './items';
import { fetchSuppliers } from './suppliers';
import { fetchBatchStock } from './stages';

export async function fetchBatches(): Promise<BatchWithRelations[]> {
  return fetchWithCache('batches', async () => {
    // 1. Try relational query
    const res = await supabase
      .from('inward_batches')
      .select('*, supplier:suppliers(*), item:items!item_id(*)')
      .order('received_on', { ascending: false })
      .limit(QUERY_SAFETY_LIMIT);

    if (!res.error && res.data) {
      checkRowLimitGuard(res.data.length, 'inward_batches');
      const rawBatches = res.data as (InwardBatch & { supplier: Supplier | null; item: Item | null; [key: string]: unknown })[];

      // Check if any batch has cap_item_id, atomizer_item_id, or box_item_id to enrich in-memory
      const hasComponents = rawBatches.some((b) => b.cap_item_id || b.atomizer_item_id || b.box_item_id);
      if (hasComponents) {
        try {
          const items = await fetchItems();
          const itemMap = new Map(items.map((i) => [i.id, i]));
          return rawBatches.map((b) => ({
            ...b,
            cap_item: b.cap_item_id ? itemMap.get(b.cap_item_id as string) ?? null : null,
            atomizer_item: b.atomizer_item_id ? itemMap.get(b.atomizer_item_id as string) ?? null : null,
            box_item: b.box_item_id ? itemMap.get(b.box_item_id as string) ?? null : null,
          })) as BatchWithRelations[];
        } catch {
          return rawBatches as BatchWithRelations[];
        }
      }
      return rawBatches as BatchWithRelations[];
    }

    // 2. Fallback: If `items!item_id` hint fails or schema cache issue, try standard join
    const fallbackJoinRes = await supabase
      .from('inward_batches')
      .select('*, supplier:suppliers(*), item:items(*)')
      .order('received_on', { ascending: false })
      .limit(QUERY_SAFETY_LIMIT);

    if (!fallbackJoinRes.error && fallbackJoinRes.data) {
      checkRowLimitGuard(fallbackJoinRes.data.length, 'inward_batches');
      const rawBatches = fallbackJoinRes.data as (InwardBatch & { supplier: Supplier | null; item: Item | null; [key: string]: unknown })[];
      try {
        const items = await fetchItems();
        const itemMap = new Map(items.map((i) => [i.id, i]));
        return rawBatches.map((b) => ({
          ...b,
          cap_item: b.cap_item_id ? itemMap.get(b.cap_item_id as string) ?? null : null,
          atomizer_item: b.atomizer_item_id ? itemMap.get(b.atomizer_item_id as string) ?? null : null,
          box_item: b.box_item_id ? itemMap.get(b.box_item_id as string) ?? null : null,
        })) as BatchWithRelations[];
      } catch {
        return rawBatches as BatchWithRelations[];
      }
    }

    // 3. Fallback: Manual in-memory join
    const [rawRes, suppliers, items] = await Promise.all([
      supabase.from('inward_batches').select('*').order('received_on', { ascending: false }).limit(QUERY_SAFETY_LIMIT),
      fetchSuppliers().catch(() => []),
      fetchItems().catch(() => []),
    ]);

    if (rawRes.error) throw rawRes.error;
    checkRowLimitGuard(rawRes.data?.length, 'inward_batches');

    const suppMap = new Map(suppliers.map((s) => [s.id, s]));
    const itemMap = new Map(items.map((i) => [i.id, i]));

    return (rawRes.data ?? []).map((b: Record<string, unknown>) => ({
      ...b,
      supplier: suppMap.get(b.supplier_id as string) ?? null,
      item: itemMap.get(b.item_id as string) ?? null,
      cap_item: b.cap_item_id ? itemMap.get(b.cap_item_id as string) ?? null : null,
      atomizer_item: b.atomizer_item_id ? itemMap.get(b.atomizer_item_id as string) ?? null : null,
      box_item: b.box_item_id ? itemMap.get(b.box_item_id as string) ?? null : null,
    })) as BatchWithRelations[];
  }, CACHE_TTL.SHORT);
}

export async function insertInwardBatch(payload: {
  batch_no: string;
  brand_name?: string | null;
  supplier_id: string;
  item_id: string;
  received_on: string;
  qty_received: number;
  location: string;
  image_url?: string | null;
  color?: string | null;
  cap_item_id?: string | null;
  atomizer_item_id?: string | null;
  box_item_id?: string | null;
  cap_qty?: number | null;
  atomizer_qty?: number | null;
  box_qty?: number | null;
}) {
  const fullPayload: Record<string, unknown> = {
    batch_no: payload.batch_no.trim(),
    brand_name: payload.brand_name?.trim() || null,
    supplier_id: payload.supplier_id,
    item_id: payload.item_id,
    received_on: payload.received_on,
    qty_received: payload.qty_received,
    location: payload.location.trim(),
    image_url: payload.image_url || null,
    color: payload.color?.trim() || null,
    cap_item_id: payload.cap_item_id || null,
    atomizer_item_id: payload.atomizer_item_id || null,
    box_item_id: payload.box_item_id || null,
    cap_qty: payload.cap_qty || null,
    atomizer_qty: payload.atomizer_qty || null,
    box_qty: payload.box_qty || null,
  };

  const res = await resilientInsert(
    'inward_batches',
    fullPayload,
    ['batch_no', 'supplier_id', 'item_id', 'received_on', 'qty_received', 'location']
  );

  if (res.error) {
    throw res.error;
  }
  invalidateCache('batches');
  invalidateCache('location_stock');
  return res.data;
}

export async function insertInwardBatches(
  payloads: Array<{
    batch_no: string;
    brand_name?: string | null;
    supplier_id: string;
    item_id: string;
    received_on: string;
    qty_received: number;
    location: string;
    image_url?: string | null;
    color?: string | null;
    cap_item_id?: string | null;
    atomizer_item_id?: string | null;
    box_item_id?: string | null;
    cap_qty?: number | null;
    atomizer_qty?: number | null;
    box_qty?: number | null;
  }>
) {
  if (!payloads || payloads.length === 0) return [];
  const fullPayloads: Record<string, unknown>[] = payloads.map((payload) => ({
    batch_no: payload.batch_no.trim(),
    brand_name: payload.brand_name?.trim() || null,
    supplier_id: payload.supplier_id,
    item_id: payload.item_id,
    received_on: payload.received_on,
    qty_received: payload.qty_received,
    location: payload.location.trim(),
    image_url: payload.image_url || null,
    color: payload.color?.trim() || null,
    cap_item_id: payload.cap_item_id || null,
    atomizer_item_id: payload.atomizer_item_id || null,
    box_item_id: payload.box_item_id || null,
    cap_qty: payload.cap_qty || null,
    atomizer_qty: payload.atomizer_qty || null,
    box_qty: payload.box_qty || null,
  }));

  const res = await resilientBatchInsert(
    'inward_batches',
    fullPayloads,
    ['batch_no', 'supplier_id', 'item_id', 'received_on', 'qty_received', 'location']
  );

  if (res.error) {
    throw res.error;
  }
  invalidateCache('batches');
  invalidateCache('location_stock');
  return res.data;
}

export async function updateInwardBatchBrand(batchId: string, brandName: string | null): Promise<void> {
  const { error } = await supabase
    .from('inward_batches')
    .update({ brand_name: brandName?.trim() || null })
    .eq('id', batchId);
  if (error) throw error;
  invalidateCache('batches');
}

export async function deleteInwardBatch(id: string): Promise<void> {
  const { error } = await supabase.from('inward_batches').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('batches');
  invalidateCache('location_stock');
}

/**
 * Batch ids that already have ledger history (movements, dispatches, or allocations).
 * Used to decide which inward batches can still be deleted: a batch is only
 * deletable while nothing downstream references it.
 */
export async function fetchUsedBatchIds(preloaded?: {
  movements?: Pick<StageMovement, 'batch_id'>[];
  dispatches?: Pick<Dispatch, 'batch_id'>[];
  allocations?: { source_batch_id?: string; destination_batch_id?: string }[];
}): Promise<Set<string>> {
  if (preloaded?.movements && preloaded?.dispatches) {
    const used = new Set<string>();
    for (const m of preloaded.movements) used.add(m.batch_id);
    for (const d of preloaded.dispatches) used.add(d.batch_id);
    if (preloaded.allocations) {
      for (const a of preloaded.allocations) {
        if (a.source_batch_id) used.add(a.source_batch_id);
        if (a.destination_batch_id) used.add(a.destination_batch_id);
      }
    }
    return used;
  }

  const [moves, disps, allocs] = await Promise.all([
    supabase.from('stage_movements').select('batch_id'),
    supabase.from('dispatches').select('batch_id'),
    Promise.resolve(
      supabase.from('batch_allocations').select('source_batch_id, destination_batch_id')
    ).catch(() => ({ data: [] as { source_batch_id?: string; destination_batch_id?: string }[], error: null })),
  ]);
  if (moves.error) throw moves.error;
  if (disps.error) throw disps.error;
  const used = new Set<string>();
  for (const m of (moves.data ?? []) as Pick<StageMovement, 'batch_id'>[]) used.add(m.batch_id);
  for (const d of (disps.data ?? []) as Pick<Dispatch, 'batch_id'>[]) used.add(d.batch_id);
  for (const a of (allocs.data ?? []) as { source_batch_id?: string; destination_batch_id?: string }[]) {
    if (a.source_batch_id) used.add(a.source_batch_id);
    if (a.destination_batch_id) used.add(a.destination_batch_id);
  }
  return used;
}

export async function fetchBatchAvailableAtStage(batchId: string, stageId: string): Promise<number> {
  const stock = await fetchBatchStock(batchId);
  const entry = stock.find((s) => s.stage_id === stageId);
  return entry?.qty ?? 0;
}

export async function fetchBatchAvailableRawStock(batchId: string): Promise<number> {
  const stock = await fetchBatchStock(batchId);
  const rawEntry = stock.find((s) => s.sequence_no === 1 || s.stage_name === 'Raw Stock');
  return rawEntry?.qty ?? 0;
}
