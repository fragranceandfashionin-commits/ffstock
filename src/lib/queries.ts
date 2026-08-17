import { supabase } from './supabase';
import type { BatchStock, LocationStock, StageStock } from './types';
import type { Stage, InwardBatch, StageMovement, Dispatch } from './supabase';

/**
 * Runs a query against one of the server-side stock views
 * (v_stage_stock / v_batch_stock / v_location_stock). Returns null when the
 * view does not exist yet (migration not applied) so callers can fall back to
 * local computation — the app keeps working before AND after the migration.
 */
type ViewQueryResult<T> = { data: T[] | null; error: { code?: string } | null };

async function viewQuery<T>(run: () => PromiseLike<ViewQueryResult<T>>): Promise<T[] | null> {
  const { data, error } = await run();
  if (error && error.code === 'PGRST205') return null; // relation does not exist yet
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function fetchStages(): Promise<Stage[]> {
  const { data, error } = await supabase.from('stages').select('*').order('sequence_no');
  if (error) throw error;
  return data ?? [];
}

export async function fetchSuppliers() {
  const { data, error } = await supabase.from('suppliers').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchItems() {
  const { data, error } = await supabase.from('items').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchBatches() {
  const { data, error } = await supabase
    .from('inward_batches')
    .select('*, supplier:suppliers(*), item:items(*)')
    .order('received_on', { ascending: false })
    .limit(50000);
  if (error) throw error;
  return data ?? [];
}

export async function fetchMovements(batchId?: string) {
  let query = supabase
    .from('stage_movements')
    .select('*, from_stage:stages!from_stage_id(*), to_stage:stages!to_stage_id(*)')
    .order('moved_on', { ascending: true })
    .limit(50000);
  if (batchId) query = query.eq('batch_id', batchId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchDispatches(batchId?: string) {
  let query = supabase
    .from('dispatches')
    .select('*')
    .order('dispatched_on', { ascending: false })
    .limit(50000);
  if (batchId) query = query.eq('batch_id', batchId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
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
  const [stagesResult, batchResult, movementsResult, dispatchesResult] = await Promise.all([
    fetchStages(),
    supabase.from('inward_batches').select('qty_received').eq('id', batchId).maybeSingle(),
    supabase
      .from('stage_movements')
      .select('from_stage_id, to_stage_id, qty_moved')
      .eq('batch_id', batchId),
    supabase.from('dispatches').select('qty').eq('batch_id', batchId),
  ]);

  if (batchResult.error) throw batchResult.error;
  if (movementsResult.error) throw movementsResult.error;
  if (dispatchesResult.error) throw dispatchesResult.error;

  const batch = batchResult.data as { qty_received: number } | null;
  if (!batch) return [];

  const stockByStage = new Map<string, number>();
  for (const stage of stagesResult) stockByStage.set(stage.id, 0);

  const rawStage = stagesResult.find((s) => s.name === 'Raw Stock');
  if (rawStage) stockByStage.set(rawStage.id, batch.qty_received);

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

/**
 * Batch ids that already have ledger history (movements or dispatches).
 * Used to decide which inward batches can still be deleted: a batch is only
 * deletable while nothing downstream references it (see migration
 * 20260813150000).
 */
export async function fetchUsedBatchIds(): Promise<Set<string>> {
  const [moves, disps] = await Promise.all([
    supabase.from('stage_movements').select('batch_id'),
    supabase.from('dispatches').select('batch_id'),
  ]);
  if (moves.error) throw moves.error;
  if (disps.error) throw disps.error;
  const used = new Set<string>();
  for (const m of (moves.data ?? []) as Pick<StageMovement, 'batch_id'>[]) used.add(m.batch_id);
  for (const d of (disps.data ?? []) as Pick<Dispatch, 'batch_id'>[]) used.add(d.batch_id);
  return used;
}

export async function fetchBatchAvailableAtStage(batchId: string, stageId: string): Promise<number> {
  const stock = await fetchBatchStock(batchId);
  const entry = stock.find((s) => s.stage_id === stageId);
  return entry?.qty ?? 0;
}

/**
 * How many units are currently sitting in each storage location.
 * A batch's location is recorded on the inward entry; its in-factory quantity
 * is what was received minus what has already been dispatched.
 */
export async function fetchLocationStock(): Promise<LocationStock[]> {
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
}
