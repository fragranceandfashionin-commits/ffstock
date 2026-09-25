import { supabase } from '../supabase';
import { fetchWithCache, CACHE_TTL } from '../cache';
import type { Stage, StageMovement, Dispatch, InwardBatch } from '../types/database';
import type { StageStock, BatchStock } from '../types';
import { viewQuery } from './core';
import { fetchBatches } from './batches';

export async function fetchStages(): Promise<Stage[]> {
  return fetchWithCache('stages', async () => {
    const { data, error } = await supabase.from('stages').select('*').order('sequence_no');
    if (error) throw error;
    return data ?? [];
  }, CACHE_TTL.STAGES);
}

export async function ensureScrapStage(stages: Stage[]): Promise<Stage | null> {
  const existing = stages.find((s) => s.name === 'Scrap / Defect' || s.name.toLowerCase().includes('scrap'));
  if (existing) return existing;
  try {
    const { data, error } = await supabase
      .from('stages')
      .insert({ name: 'Scrap / Defect', sequence_no: 8 })
      .select('*')
      .single();
    if (!error && data) return data as Stage;

    // Fallback: If insert had a unique constraint conflict (e.g. created concurrently), fetch it
    const { data: fallback } = await supabase
      .from('stages')
      .select('*')
      .or('name.eq.Scrap / Defect,name.ilike.%scrap%')
      .limit(1)
      .maybeSingle();
    if (fallback) return fallback as Stage;
  } catch {
    const { data: fallback } = await supabase
      .from('stages')
      .select('*')
      .or('name.eq.Scrap / Defect,name.ilike.%scrap%')
      .limit(1)
      .maybeSingle();
    if (fallback) return fallback as Stage;
  }
  return null;
}

export async function fetchStageStock(): Promise<StageStock[]> {
  const fromView = await viewQuery<StageStock>(() =>
    supabase.from('v_stage_stock').select('stage_id, stage_name, sequence_no, qty'),
  );
  if (fromView) {
    return fromView
      .filter((s) => s.stage_name !== 'Dispatched')
      .map((s) => ({ ...s, qty: Math.max(0, s.qty) }));
  }

  // Fallback: stock computed locally (used until the migration that creates
  // the views is applied). Mirrors the views' math exactly.
  const [stages, batches, movements, dispatches] = await Promise.all([
    fetchStages(),
    fetchBatches(),
    supabase.from('stage_movements').select('batch_id, from_stage_id, to_stage_id, qty_moved'),
    supabase.from('dispatches').select('batch_id, qty'),
  ]);

  if (movements.error) throw movements.error;
  if (dispatches.error) throw dispatches.error;

  const rawMovements = (movements.data ?? []) as Pick<StageMovement, 'batch_id' | 'from_stage_id' | 'to_stage_id' | 'qty_moved'>[];
  const rawDispatches = (dispatches.data ?? []) as Pick<Dispatch, 'batch_id' | 'qty'>[];

  const stockByStage = new Map<string, number>();
  for (const stage of stages) stockByStage.set(stage.id, 0);

  for (const batch of batches as InwardBatch[]) {
    const rawStage = stages.find((s) => s.name === 'Raw Stock');
    if (rawStage) {
      stockByStage.set(rawStage.id, (stockByStage.get(rawStage.id) ?? 0) + batch.qty_received);
    }
  }

  for (const m of rawMovements) {
    stockByStage.set(m.from_stage_id, (stockByStage.get(m.from_stage_id) ?? 0) - m.qty_moved);
    stockByStage.set(m.to_stage_id, (stockByStage.get(m.to_stage_id) ?? 0) + m.qty_moved);
  }

  const readyStage = stages.find((s) => s.name === 'Ready');
  if (readyStage) {
    for (const d of rawDispatches) {
      stockByStage.set(readyStage.id, (stockByStage.get(readyStage.id) ?? 0) - d.qty);
    }
  }

  return stages
    .filter((s) => s.name !== 'Dispatched')
    .map((s) => ({
      stage_id: s.id,
      stage_name: s.name,
      sequence_no: s.sequence_no,
      qty: Math.max(0, stockByStage.get(s.id) ?? 0),
    }));
}

export async function fetchBatchStock(batchId: string): Promise<BatchStock[]> {
  const fromView = await viewQuery<BatchStock>(() =>
    supabase
      .from('v_batch_stock')
      .select('batch_id, stage_id, stage_name, sequence_no, qty')
      .eq('batch_id', batchId),
  );
  if (fromView) {
    return fromView
      .filter((s) => s.stage_name !== 'Dispatched')
      .map((s) => ({ ...s, qty: Math.max(0, s.qty) }));
  }

  // Fallback: stock computed locally (used until the migration is applied).
  const [stagesResult, batchResult, movementsResult, dispatchesResult, allocsOutRes, allocsInRes] = await Promise.all([
    fetchStages(),
    supabase.from('inward_batches').select('qty_received').eq('id', batchId).maybeSingle(),
    supabase
      .from('stage_movements')
      .select('from_stage_id, to_stage_id, qty_moved')
      .eq('batch_id', batchId),
    supabase.from('dispatches').select('qty').eq('batch_id', batchId),
    Promise.resolve(
      supabase.from('batch_allocations').select('qty').eq('source_batch_id', batchId)
    ).catch(() => ({ data: [] as { qty: number }[], error: null })),
    Promise.resolve(
      supabase.from('batch_allocations').select('qty').eq('destination_batch_id', batchId)
    ).catch(() => ({ data: [] as { qty: number }[], error: null })),
  ]);

  if (batchResult.error) throw batchResult.error;
  if (movementsResult.error) throw movementsResult.error;
  if (dispatchesResult.error) throw dispatchesResult.error;

  const batch = batchResult.data as { qty_received: number } | null;
  if (!batch) return [];

  const allocOutTotal = ((allocsOutRes.data || []) as { qty: number }[]).reduce((acc, a) => acc + (Number(a.qty) || 0), 0);
  const allocInTotal = ((allocsInRes.data || []) as { qty: number }[]).reduce((acc, a) => acc + (Number(a.qty) || 0), 0);
  const netReceived = Math.max(0, batch.qty_received - allocOutTotal + allocInTotal);

  const stockByStage = new Map<string, number>();
  for (const stage of stagesResult) stockByStage.set(stage.id, 0);

  const rawStage = stagesResult.find((s) => s.name === 'Raw Stock');
  if (rawStage) stockByStage.set(rawStage.id, netReceived);

  for (const m of (movementsResult.data ?? []) as Pick<StageMovement, 'from_stage_id' | 'to_stage_id' | 'qty_moved'>[]) {
    stockByStage.set(m.from_stage_id, (stockByStage.get(m.from_stage_id) ?? 0) - m.qty_moved);
    stockByStage.set(m.to_stage_id, (stockByStage.get(m.to_stage_id) ?? 0) + m.qty_moved);
  }

  const readyStage = stagesResult.find((s) => s.name === 'Ready');
  if (readyStage) {
    for (const d of (dispatchesResult.data ?? []) as Pick<Dispatch, 'qty'>[]) {
      stockByStage.set(readyStage.id, (stockByStage.get(readyStage.id) ?? 0) - d.qty);
    }
  }

  return stagesResult
    .filter((s) => s.name !== 'Dispatched')
    .map((s) => ({
      batch_id: batchId,
      stage_id: s.id,
      stage_name: s.name,
      sequence_no: s.sequence_no,
      qty: Math.max(0, stockByStage.get(s.id) ?? 0),
    }));
}

export async function fetchBatchesStock(batchIds: string[]): Promise<Map<string, BatchStock[]>> {
  const stockMap = new Map<string, BatchStock[]>();
  if (!batchIds || batchIds.length === 0) return stockMap;

  // Initialize all requested batchIds with empty array
  for (const bId of batchIds) {
    stockMap.set(bId, []);
  }

  // 1. Try querying v_batch_stock for all batches in a single roundtrip
  const fromView = await viewQuery<BatchStock>(() =>
    supabase
      .from('v_batch_stock')
      .select('batch_id, stage_id, stage_name, sequence_no, qty')
      .in('batch_id', batchIds)
  );

  if (fromView !== null) {
    for (const row of fromView) {
      if (row.stage_name === 'Dispatched') continue;
      const bId = row.batch_id;
      if (!stockMap.has(bId)) stockMap.set(bId, []);
      stockMap.get(bId)!.push({ ...row, qty: Math.max(0, row.qty) });
    }
    return stockMap;
  }

  // 2. Resilient fallback: Query via fetchBatchStock in parallel
  const results = await Promise.all(batchIds.map((id) => fetchBatchStock(id).catch(() => [])));
  batchIds.forEach((id, idx) => {
    stockMap.set(id, results[idx]);
  });
  return stockMap;
}

