import { supabase } from '../supabase';
import { fetchWithCache, invalidateCache, CACHE_TTL } from '../cache';
import type { Dispatch } from '../types/database';
import { getTodayDateString } from '../utils';
import {
  QUERY_SAFETY_LIMIT,
  checkRowLimitGuard,
  resilientInsert,
  resilientBatchInsert,
  normalizeRawDispatchRecord,
} from './core';
import type { BatchSplit } from './movements';

export async function insertDispatch(payload: {
  batch_id: string;
  customer_name: string;
  invoice_no: string;
  qty: number;
  dispatched_on?: string;
  variant_name?: string | null;
  color?: string | null;
  printing_design?: string | null;
  cap_name?: string | null;
  atomizer_name?: string | null;
  box_name?: string | null;
  box_item_id?: string | null;
  product_specs?: string | null;
}) {
  const fullPayload: Record<string, unknown> = {
    batch_id: payload.batch_id,
    customer_name: payload.customer_name.trim(),
    invoice_no: payload.invoice_no.trim(),
    qty: payload.qty,
    dispatched_on: payload.dispatched_on || getTodayDateString(),
    variant_name: payload.variant_name?.trim() || null,
    color: payload.color?.trim() || null,
    printing_design: payload.printing_design?.trim() || null,
    cap_name: payload.cap_name?.trim() || null,
    atomizer_name: payload.atomizer_name?.trim() || null,
    box_name: payload.box_name?.trim() || null,
    box_item_id: payload.box_item_id || null,
    product_specs: payload.product_specs?.trim() || null,
  };

  const res = await resilientInsert(
    'dispatches',
    fullPayload,
    ['batch_id', 'customer_name', 'invoice_no', 'qty', 'dispatched_on']
  );

  if (res.error) {
    throw res.error;
  }
  invalidateCache('dispatches');
  invalidateCache('location_stock');
  return res.data;
}

export type VariantDispatchItem = {
  qty: number;
  variant_name?: string | null;
  color?: string | null;
  printing_design?: string | null;
  cap_name?: string | null;
  atomizer_name?: string | null;
  box_name?: string | null;
  box_item_id?: string | null;
  product_specs?: string | null;
};

/**
 * Inserts multiple variant dispatch records (e.g. 200 Ruby Red + 200 Emerald Green) in a coordinated atomic batch.
 */
export async function insertMultiVariantDispatches(payload: {
  batch_id: string;
  customer_name: string;
  invoice_no: string;
  dispatched_on?: string;
  variants: VariantDispatchItem[];
}) {
  const dispatchedOn = payload.dispatched_on || getTodayDateString();
  const validVariants = payload.variants.filter((v) => v.qty && v.qty > 0);
  if (validVariants.length === 0) return [];

  const dispatchRows = validVariants.map((v) => ({
    batch_id: payload.batch_id,
    customer_name: payload.customer_name.trim(),
    invoice_no: payload.invoice_no.trim(),
    qty: v.qty,
    dispatched_on: dispatchedOn,
    variant_name: v.variant_name?.trim() || null,
    color: v.color?.trim() || null,
    printing_design: v.printing_design?.trim() || null,
    cap_name: v.cap_name?.trim() || null,
    atomizer_name: v.atomizer_name?.trim() || null,
    box_name: v.box_name?.trim() || null,
    box_item_id: v.box_item_id || null,
    product_specs: v.product_specs?.trim() || null,
  }));

  const res = await resilientBatchInsert(
    'dispatches',
    dispatchRows,
    ['batch_id', 'customer_name', 'invoice_no', 'qty', 'dispatched_on']
  );

  if (res.error) {
    throw res.error;
  }
  invalidateCache('dispatches');
  invalidateCache('location_stock');
  return res.data;
}

export async function fetchDispatches(batchId?: string): Promise<Dispatch[]> {
  const cacheKey = batchId ? `dispatches_${batchId}` : 'dispatches';
  return fetchWithCache(cacheKey, async () => {
    let query = supabase
      .from('dispatches')
      .select('*')
      .order('dispatched_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(QUERY_SAFETY_LIMIT);
    if (batchId) query = query.eq('batch_id', batchId);
    const { data, error } = await query;
    if (error) throw error;
    checkRowLimitGuard(data?.length, 'dispatches');
    return (data ?? []).map((d: Record<string, unknown>) => normalizeRawDispatchRecord(d)) as Dispatch[];
  }, CACHE_TTL.SHORT);
}

export async function insertMultiBatchDispatches(payload: {
  splits: BatchSplit[];
  customer_name: string;
  invoice_no: string;
  dispatched_on?: string;
  variant_name?: string | null;
  color?: string | null;
  printing_design?: string | null;
  cap_name?: string | null;
  atomizer_name?: string | null;
  box_name?: string | null;
  box_item_id?: string | null;
  product_specs?: string | null;
}) {
  const dispatchedOn = payload.dispatched_on || getTodayDateString();
  const dispatchRows = payload.splits.map((s) => ({
    batch_id: s.batch_id,
    customer_name: payload.customer_name.trim(),
    invoice_no: payload.invoice_no.trim(),
    qty: s.qty,
    dispatched_on: dispatchedOn,
    variant_name: payload.variant_name?.trim() || null,
    color: payload.color?.trim() || null,
    printing_design: payload.printing_design?.trim() || null,
    cap_name: payload.cap_name?.trim() || null,
    atomizer_name: payload.atomizer_name?.trim() || null,
    box_name: payload.box_name?.trim() || null,
    box_item_id: payload.box_item_id || null,
    product_specs: payload.product_specs?.trim() || null,
  }));

  const res = await resilientBatchInsert(
    'dispatches',
    dispatchRows,
    ['batch_id', 'customer_name', 'invoice_no', 'qty', 'dispatched_on']
  );

  if (res.error) throw res.error;
  invalidateCache('dispatches');
  invalidateCache('location_stock');
  return res.data;
}

