import { supabase } from '../supabase';
import { fetchWithCache, invalidateCache, CACHE_TTL } from '../cache';
import type { BatchAllocation, BatchAllocationWithRelations, Item } from '../types/database';
import { getTodayDateString } from '../utils';
import { fetchBatches } from './batches';

/**
 * Executes an atomic stock allocation from one batch to another.
 */
export async function allocateStockBetweenBatches(payload: {
  source_batch_id: string;
  destination_batch_id: string;
  qty: number;
  allocation_type?: string;
  item_id?: string | null;
  remarks?: string | null;
  allocated_by?: string | null;
  allocated_on?: string;
}): Promise<{
  allocation_id: string;
  source_batch_id: string;
  source_batch_no: string;
  destination_batch_id: string;
  destination_batch_no: string;
  qty_allocated: number;
  source_new_raw_qty: number;
  destination_new_raw_qty: number;
  allocated_on: string;
}> {
  // 1. Try atomic database RPC
  const { data, error } = await supabase.rpc('allocate_stock_between_batches', {
    p_source_batch_id: payload.source_batch_id,
    p_destination_batch_id: payload.destination_batch_id,
    p_qty: payload.qty,
    p_allocation_type: payload.allocation_type || 'primary',
    p_item_id: payload.item_id || null,
    p_remarks: payload.remarks?.trim() || null,
    p_allocated_by: payload.allocated_by?.trim() || null,
    p_allocated_on: payload.allocated_on || getTodayDateString(),
  });

  if (!error && data) {
    invalidateCache('allocations');
    invalidateCache('batches');
    return data as {
      allocation_id: string;
      source_batch_id: string;
      source_batch_no: string;
      destination_batch_id: string;
      destination_batch_no: string;
      qty_allocated: number;
      source_new_raw_qty: number;
      destination_new_raw_qty: number;
      allocated_on: string;
    };
  }

  if (error && error.code !== 'PGRST202') {
    throw error;
  }

  // 2. Fallback: direct table insert
  const { data: insertData, error: insertError } = await supabase
    .from('batch_allocations')
    .insert({
      source_batch_id: payload.source_batch_id,
      destination_batch_id: payload.destination_batch_id,
      qty: payload.qty,
      allocation_type: payload.allocation_type || 'primary',
      item_id: payload.item_id || null,
      remarks: payload.remarks?.trim() || null,
      allocated_by: payload.allocated_by?.trim() || null,
      allocated_on: payload.allocated_on || getTodayDateString(),
    })
    .select('id')
    .single();

  if (insertError) throw insertError;
  invalidateCache('allocations');
  invalidateCache('batches');

  return {
    allocation_id: insertData?.id || '',
    source_batch_id: payload.source_batch_id,
    source_batch_no: '',
    destination_batch_id: payload.destination_batch_id,
    destination_batch_no: '',
    qty_allocated: payload.qty,
    source_new_raw_qty: 0,
    destination_new_raw_qty: 0,
    allocated_on: payload.allocated_on || getTodayDateString(),
  };
}

/**
 * Fetches all stock allocations, optionally filtered by a specific batch (source or destination).
 */
export async function fetchBatchAllocations(batchId?: string): Promise<BatchAllocationWithRelations[]> {
  const cacheKey = batchId ? `allocations_${batchId}` : 'allocations';
  return fetchWithCache(cacheKey, async () => {
    try {
      let query = supabase
        .from('batch_allocations')
        .select('*, item:items(*)')
        .order('allocated_on', { ascending: false })
        .order('created_at', { ascending: false });

      if (batchId) {
        query = query.or(`source_batch_id.eq.${batchId},destination_batch_id.eq.${batchId}`);
      }

      const { data, error } = await query;
      if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01') return [];
        throw error;
      }

      if (!data || data.length === 0) return [];

      const batches = await fetchBatches().catch(() => []);
      const batchMap = new Map(batches.map((b) => [b.id, b]));

      return (data as (BatchAllocation & { item: Item | null })[]).map((alloc) => ({
        ...alloc,
        source_batch: batchMap.get(alloc.source_batch_id) || null,
        destination_batch: batchMap.get(alloc.destination_batch_id) || null,
      }));
    } catch (err) {
      console.warn('Failed to fetch batch allocations:', err);
      return [];
    }
  }, CACHE_TTL.SHORT);
}

export async function reverseBatchAllocation(payload: {
  allocationId: string;
  reversedBy?: string;
  reason?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('reverse_batch_allocation', {
    p_allocation_id: payload.allocationId,
    p_reversed_by: payload.reversedBy || null,
    p_reason: payload.reason || null,
  });
  if (error) throw error;
  invalidateCache('allocations');
  invalidateCache('batches');
  return data as string;
}
