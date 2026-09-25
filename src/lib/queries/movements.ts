import { supabase } from '../supabase';
import { fetchWithCache, invalidateCache, CACHE_TTL } from '../cache';
import type { Stage, MovementWithRelations } from '../types/database';
import { getTodayDateString } from '../utils';
import {
  QUERY_SAFETY_LIMIT,
  checkRowLimitGuard,
  resilientInsert,
  resilientBatchInsert,
  normalizeRawMovementRecord,
} from './core';
import { fetchStages, ensureScrapStage } from './stages';

export async function insertStageMovement(payload: {
  batch_id: string;
  from_stage_id: string;
  to_stage_id: string;
  qty_moved: number;
  moved_on?: string;
  variant_name?: string | null;
  cap_name?: string | null;
  atomizer_name?: string | null;
  box_name?: string | null;
  color?: string | null;
  printing_design?: string | null;
  cap_item_id?: string | null;
  atomizer_item_id?: string | null;
  box_item_id?: string | null;
  cap_qty_used?: number | null;
  atomizer_qty_used?: number | null;
  box_qty_used?: number | null;
  remarks?: string | null;
  done_by?: string | null;
}) {
  const fullPayload: Record<string, unknown> = {
    batch_id: payload.batch_id,
    from_stage_id: payload.from_stage_id,
    to_stage_id: payload.to_stage_id,
    qty_moved: payload.qty_moved,
    moved_on: payload.moved_on || getTodayDateString(),
    variant_name: payload.variant_name?.trim() || null,
    cap_name: payload.cap_name?.trim() || null,
    atomizer_name: payload.atomizer_name?.trim() || null,
    box_name: payload.box_name?.trim() || null,
    color: payload.color?.trim() || null,
    printing_design: payload.printing_design?.trim() || null,
    cap_item_id: payload.cap_item_id || null,
    atomizer_item_id: payload.atomizer_item_id || null,
    box_item_id: payload.box_item_id || null,
    cap_qty_used: payload.cap_qty_used || null,
    atomizer_qty_used: payload.atomizer_qty_used || null,
    box_qty_used: payload.box_qty_used || null,
    remarks: payload.remarks?.trim() || null,
    done_by: payload.done_by?.trim() || null,
  };

  const res = await resilientInsert(
    'stage_movements',
    fullPayload,
    ['batch_id', 'from_stage_id', 'to_stage_id', 'qty_moved', 'moved_on']
  );

  if (res.error) {
    throw res.error;
  }
  invalidateCache('movements');
  invalidateCache('location_stock');
  return res.data;
}

export async function insertScrapMovement(payload: {
  batch_id: string;
  from_stage_id: string;
  qty_scrapped: number;
  reason: string;
  variant_name?: string | null;
  color?: string | null;
  printing_design?: string | null;
  cap_name?: string | null;
  atomizer_name?: string | null;
  box_name?: string | null;
  remarks?: string | null;
  done_by?: string | null;
  stages: Stage[];
}) {
  let scrapStage = payload.stages.find((s) => s.name === 'Scrap / Defect' || s.name.toLowerCase().includes('scrap'));
  if (!scrapStage) {
    scrapStage = (await ensureScrapStage(payload.stages)) ?? undefined;
  }
  if (!scrapStage) {
    throw new Error('Scrap / Defect stage not found. Please ensure the migration is applied.');
  }

  const scrapRemark = `[SCRAP: ${payload.reason}] ${payload.remarks ? payload.remarks.trim() : ''}`.trim();

  return insertStageMovement({
    batch_id: payload.batch_id,
    from_stage_id: payload.from_stage_id,
    to_stage_id: scrapStage.id,
    qty_moved: payload.qty_scrapped,
    variant_name: payload.variant_name?.trim() || null,
    color: payload.color?.trim() || null,
    printing_design: payload.printing_design?.trim() || null,
    cap_name: payload.cap_name?.trim() || null,
    atomizer_name: payload.atomizer_name?.trim() || null,
    box_name: payload.box_name?.trim() || null,
    remarks: scrapRemark,
    done_by: payload.done_by,
  });
}

/**
 * Splits a stage movement: Moves the specified forward quantity,
 * and simultaneously records the remaining defect/scrap quantity into Scrap / Defect stage.
 * Executes atomically in a single PostgreSQL transaction if stored procedure is available.
 */
export async function insertSplitStageMovementAndScrap(payload: {
  batch_id: string;
  from_stage_id: string;
  to_stage_id: string;
  qty_forward: number;
  qty_scrapped: number;
  scrap_reason: string;
  variant_name?: string | null;
  cap_name?: string | null;
  atomizer_name?: string | null;
  box_name?: string | null;
  color?: string | null;
  printing_design?: string | null;
  cap_item_id?: string | null;
  atomizer_item_id?: string | null;
  box_item_id?: string | null;
  remarks?: string | null;
  done_by?: string | null;
  stages: Stage[];
}) {
  let scrapStageId: string | null = null;
  if (payload.qty_scrapped > 0) {
    const stage =
      payload.stages.find((s) => s.name === 'Scrap / Defect' || s.name.toLowerCase().includes('scrap')) ||
      (await ensureScrapStage(payload.stages));
    scrapStageId = stage?.id || null;
  }

  // 1. Try atomic PostgreSQL stored procedure first
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('record_split_movement_and_scrap', {
      p_batch_id: payload.batch_id,
      p_from_stage_id: payload.from_stage_id,
      p_to_stage_id: payload.to_stage_id,
      p_qty_forward: payload.qty_forward,
      p_qty_scrapped: payload.qty_scrapped,
      p_scrap_reason: payload.scrap_reason || 'Defect / Damage on transfer',
      p_scrap_stage_id: scrapStageId,
      p_variant_name: payload.variant_name?.trim() || null,
      p_cap_name: payload.cap_name?.trim() || null,
      p_atomizer_name: payload.atomizer_name?.trim() || null,
      p_box_name: payload.box_name?.trim() || null,
      p_color: payload.color?.trim() || null,
      p_printing_design: payload.printing_design?.trim() || null,
      p_cap_item_id: payload.cap_item_id || null,
      p_atomizer_item_id: payload.atomizer_item_id || null,
      p_box_item_id: payload.box_item_id || null,
      p_cap_qty_used: payload.cap_item_id ? payload.qty_forward : null,
      p_atomizer_qty_used: payload.atomizer_item_id ? payload.qty_forward : null,
      p_box_qty_used: payload.box_item_id ? payload.qty_forward : null,
      p_remarks: payload.remarks?.trim() || null,
      p_done_by: payload.done_by?.trim() || null,
      p_moved_on: getTodayDateString(),
    });

    if (!rpcError && rpcData) {
      invalidateCache('movements');
      invalidateCache('location_stock');
      return rpcData;
    }
  } catch {
    // Graceful fallback to client sequential inserts if RPC is not yet present
  }

  // 2. Sequential fallback execution
  await insertStageMovement({
    batch_id: payload.batch_id,
    from_stage_id: payload.from_stage_id,
    to_stage_id: payload.to_stage_id,
    qty_moved: payload.qty_forward,
    variant_name: payload.variant_name,
    cap_name: payload.cap_name,
    atomizer_name: payload.atomizer_name,
    box_name: payload.box_name,
    color: payload.color,
    printing_design: payload.printing_design,
    cap_item_id: payload.cap_item_id,
    atomizer_item_id: payload.atomizer_item_id,
    box_item_id: payload.box_item_id,
    cap_qty_used: payload.cap_item_id ? payload.qty_forward : null,
    atomizer_qty_used: payload.atomizer_item_id ? payload.qty_forward : null,
    box_qty_used: payload.box_item_id ? payload.qty_forward : null,
    remarks: payload.remarks,
    done_by: payload.done_by,
  });

  if (payload.qty_scrapped > 0) {
    await insertScrapMovement({
      batch_id: payload.batch_id,
      from_stage_id: payload.from_stage_id,
      qty_scrapped: payload.qty_scrapped,
      reason: payload.scrap_reason,
      remarks: payload.remarks ? `Split loss on transfer: ${payload.remarks}` : 'Recorded on stage split',
      done_by: payload.done_by,
      stages: payload.stages,
    });
  }
}

export type VariantMovementItem = {
  qty: number;
  variant_name?: string | null;
  color?: string | null;
  printing_design?: string | null;
  cap_name?: string | null;
  atomizer_name?: string | null;
  box_name?: string | null;
  cap_item_id?: string | null;
  atomizer_item_id?: string | null;
  box_item_id?: string | null;
  remarks?: string | null;
};

/**
 * Inserts multiple variant stage movements in a single coordinated atomic batch operation.
 * Used when splitting into N color or printing variants (e.g. 20 Red, 20 Green, 20 Orange, 20 Blue, 20 Black).
 * Uses atomic stored procedure when available.
 */
export async function insertMultiVariantStageMovements(payload: {
  batch_id: string;
  from_stage_id: string;
  to_stage_id: string;
  variants: VariantMovementItem[];
  done_by?: string | null;
  general_remarks?: string | null;
  scrapped_qty?: number;
  scrap_reason?: string;
  stages?: Stage[];
}) {
  const today = getTodayDateString();
  const validVariants = payload.variants.filter((v) => v.qty && v.qty > 0);

  let scrapStageId: string | null = null;
  if (payload.scrapped_qty && payload.scrapped_qty > 0 && payload.stages) {
    const stage =
      payload.stages.find((s) => s.name === 'Scrap / Defect' || s.name.toLowerCase().includes('scrap')) ||
      (await ensureScrapStage(payload.stages));
    scrapStageId = stage?.id || null;
  }

  // 1. Try atomic PostgreSQL stored procedure first
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('record_multi_variant_movements', {
      p_batch_id: payload.batch_id,
      p_from_stage_id: payload.from_stage_id,
      p_to_stage_id: payload.to_stage_id,
      p_variants: validVariants,
      p_scrapped_qty: payload.scrapped_qty || 0,
      p_scrap_reason: payload.scrap_reason || 'Multi-variant split loss',
      p_scrap_stage_id: scrapStageId,
      p_general_remarks: payload.general_remarks || null,
      p_done_by: payload.done_by || null,
      p_moved_on: today,
    });

    if (!rpcError && rpcData) {
      invalidateCache('movements');
      invalidateCache('location_stock');
      return rpcData;
    }
  } catch {
    // Graceful fallback to client batch insert
  }

  // 2. Sequential fallback execution
  if (validVariants.length > 0) {
    const movementRows = validVariants.map((v) => {
      const combinedRemarks = [v.remarks, payload.general_remarks].filter(Boolean).join(' • ') || null;
      return {
        batch_id: payload.batch_id,
        from_stage_id: payload.from_stage_id,
        to_stage_id: payload.to_stage_id,
        qty_moved: v.qty,
        moved_on: today,
        variant_name: v.variant_name?.trim() || null,
        color: v.color?.trim() || null,
        printing_design: v.printing_design?.trim() || null,
        cap_name: v.cap_name?.trim() || null,
        atomizer_name: v.atomizer_name?.trim() || null,
        box_name: v.box_name?.trim() || null,
        cap_item_id: v.cap_item_id || null,
        atomizer_item_id: v.atomizer_item_id || null,
        box_item_id: v.box_item_id || null,
        cap_qty_used: v.cap_item_id ? v.qty : null,
        atomizer_qty_used: v.atomizer_item_id ? v.qty : null,
        box_qty_used: v.box_item_id ? v.qty : null,
        remarks: combinedRemarks,
        done_by: payload.done_by?.trim() || null,
      };
    });

    const res = await resilientBatchInsert(
      'stage_movements',
      movementRows,
      ['batch_id', 'from_stage_id', 'to_stage_id', 'qty_moved', 'moved_on']
    );

    if (res.error) {
      throw res.error;
    }
    invalidateCache('movements');
    invalidateCache('location_stock');
  }

  if (payload.scrapped_qty && payload.scrapped_qty > 0 && payload.stages) {
    await insertScrapMovement({
      batch_id: payload.batch_id,
      from_stage_id: payload.from_stage_id,
      qty_scrapped: payload.scrapped_qty,
      reason: payload.scrap_reason || 'Other / Unspecified Loss',
      remarks: payload.general_remarks ? `Multi-variant split loss: ${payload.general_remarks}` : 'Recorded on multi-variant split',
      done_by: payload.done_by || null,
      stages: payload.stages,
    });
  }
}

/**
 * Inserts a compensating reversal movement to correct an erroneous stage transfer.
 */
export async function insertReversalMovement(originalMovement: {
  id: string;
  batch_id: string;
  from_stage_id: string;
  to_stage_id: string;
  qty_moved: number;
  variant_name?: string | null;
  cap_name?: string | null;
  atomizer_name?: string | null;
  box_name?: string | null;
  color?: string | null;
  printing_design?: string | null;
  cap_item_id?: string | null;
  atomizer_item_id?: string | null;
  box_item_id?: string | null;
  cap_qty_used?: number | null;
  atomizer_qty_used?: number | null;
  box_qty_used?: number | null;
}, reason: string, doneBy?: string, qtyToReverse?: number) {
  const qty = (typeof qtyToReverse === 'number' && qtyToReverse > 0) ? qtyToReverse : originalMovement.qty_moved;
  const reversalRemark = `[REVERSAL of Movement ${originalMovement.id.slice(0, 8)}] ${reason.trim()}`.trim();

  return insertStageMovement({
    batch_id: originalMovement.batch_id,
    from_stage_id: originalMovement.to_stage_id, // inverted!
    to_stage_id: originalMovement.from_stage_id, // inverted!
    qty_moved: qty,
    variant_name: originalMovement.variant_name,
    cap_name: originalMovement.cap_name,
    atomizer_name: originalMovement.atomizer_name,
    box_name: originalMovement.box_name,
    color: originalMovement.color,
    printing_design: originalMovement.printing_design,
    cap_item_id: originalMovement.cap_item_id,
    atomizer_item_id: originalMovement.atomizer_item_id,
    box_item_id: originalMovement.box_item_id,
    cap_qty_used: (originalMovement.cap_item_id || originalMovement.cap_qty_used) ? qty : null,
    atomizer_qty_used: (originalMovement.atomizer_item_id || originalMovement.atomizer_qty_used) ? qty : null,
    box_qty_used: (originalMovement.box_item_id || originalMovement.box_qty_used) ? qty : null,
    remarks: reversalRemark,
    done_by: doneBy || null,
  });
}

export async function fetchMovements(batchId?: string): Promise<MovementWithRelations[]> {
  const cacheKey = batchId ? `movements_${batchId}` : 'movements';
  return fetchWithCache(cacheKey, async () => {
    try {
      let query = supabase
        .from('stage_movements')
        .select('*, from_stage:stages!from_stage_id(*), to_stage:stages!to_stage_id(*)')
        .order('moved_on', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(QUERY_SAFETY_LIMIT);
      if (batchId) query = query.eq('batch_id', batchId);
      const { data, error } = await query;
      if (!error && data) {
        checkRowLimitGuard(data.length, 'stage_movements');
        return (data as Record<string, unknown>[]).map(normalizeRawMovementRecord) as MovementWithRelations[];
      }
    } catch {
      // Fall back to in-memory join
    }

    // Graceful fallback: Manual in-memory join
    const [stages, rawMovesRes] = await Promise.all([
      fetchStages().catch(() => []),
      batchId
        ? supabase.from('stage_movements').select('*').eq('batch_id', batchId).order('moved_on', { ascending: true }).limit(QUERY_SAFETY_LIMIT)
        : supabase.from('stage_movements').select('*').order('moved_on', { ascending: true }).limit(QUERY_SAFETY_LIMIT),
    ]);

    if (rawMovesRes.error) throw rawMovesRes.error;
    checkRowLimitGuard(rawMovesRes.data?.length, 'stage_movements');
    const stageMap = new Map(stages.map((s) => [s.id, s]));
    return (rawMovesRes.data ?? []).map((m: Record<string, unknown>) => {
      const normalized = normalizeRawMovementRecord(m);
      return {
        ...normalized,
        from_stage: stageMap.get(m.from_stage_id as string) ?? null,
        to_stage: stageMap.get(m.to_stage_id as string) ?? null,
      };
    }) as MovementWithRelations[];
  }, CACHE_TTL.SHORT);
}

export type BatchSplit = {
  batch_id: string;
  batch_no: string;
  location?: string;
  qty: number;
};

export async function insertMultiBatchStageMovement(payload: {
  splits: BatchSplit[];
  from_stage_id: string;
  to_stage_id: string;
  moved_on?: string;
  variant_name?: string | null;
  color?: string | null;
  printing_design?: string | null;
  cap_name?: string | null;
  atomizer_name?: string | null;
  box_name?: string | null;
  cap_item_id?: string | null;
  atomizer_item_id?: string | null;
  box_item_id?: string | null;
  remarks?: string | null;
  done_by?: string | null;
  scrap_splits?: BatchSplit[];
  scrap_reason?: string;
  scrap_stage_id?: string;
  stages?: Stage[];
}) {
  const today = payload.moved_on || getTodayDateString();

  // 1. Try atomic PostgreSQL RPC
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('execute_multi_batch_stage_movement', {
      p_batch_splits: payload.splits.map((s) => ({ batch_id: s.batch_id, qty: s.qty })),
      p_from_stage_id: payload.from_stage_id,
      p_to_stage_id: payload.to_stage_id,
      p_moved_on: today,
      p_variant_name: payload.variant_name || null,
      p_color: payload.color || null,
      p_printing_design: payload.printing_design || null,
      p_cap_name: payload.cap_name || null,
      p_atomizer_name: payload.atomizer_name || null,
      p_box_name: payload.box_name || null,
      p_cap_item_id: payload.cap_item_id || null,
      p_atomizer_item_id: payload.atomizer_item_id || null,
      p_box_item_id: payload.box_item_id || null,
      p_remarks: payload.remarks || null,
      p_done_by: payload.done_by || null,
      p_scrap_splits: payload.scrap_splits?.length
        ? payload.scrap_splits.map((s) => ({ batch_id: s.batch_id, qty: s.qty }))
        : null,
      p_scrap_reason: payload.scrap_reason || null,
      p_scrap_stage_id: payload.scrap_stage_id || null,
    });

    if (!rpcError && rpcData) {
      if (typeof rpcData === 'object' && rpcData !== null && 'success' in rpcData && !(rpcData as { success?: boolean }).success) {
        throw new Error((rpcData as { error?: string }).error || 'Multi-batch movement failed.');
      }
      invalidateCache('movements');
      invalidateCache('location_stock');
      return rpcData;
    }

    if (rpcError) {
      const isRecoverableRpcError =
        rpcError.code === 'PGRST202' ||
        rpcError.code === '42883' ||
        rpcError.code === 'P0001' ||
        rpcError.message?.toLowerCase().includes('schema cache') ||
        rpcError.message?.toLowerCase().includes('not found') ||
        rpcError.message?.toLowerCase().includes('function public.execute_multi_batch_stage_movement');
      if (!isRecoverableRpcError) {
        throw rpcError;
      }
      console.warn('execute_multi_batch_stage_movement RPC unavailable or encountered ledger RLS lock error. Using client sequential fallback:', rpcError.message);
    }
  } catch (err: unknown) {
    const postgrestErr = err as { code?: string; message?: string };
    const isRecoverableRpcError =
      postgrestErr?.code === 'PGRST202' ||
      postgrestErr?.code === '42883' ||
      postgrestErr?.code === 'P0001' ||
      postgrestErr?.message?.toLowerCase().includes('schema cache') ||
      postgrestErr?.message?.toLowerCase().includes('not found') ||
      postgrestErr?.message?.toLowerCase().includes('function public.execute_multi_batch_stage_movement');
    if (!isRecoverableRpcError && (postgrestErr?.message || postgrestErr?.code)) {
      throw err;
    }
    console.warn('Falling back to client sequential inserts for multi-batch movement:', postgrestErr?.message);
    // Fall back to client sequential inserts if migration pending
  }

  // 2. Sequential fallback execution
  const createdMovements = [];
  for (const split of payload.splits) {
    const m = await insertStageMovement({
      batch_id: split.batch_id,
      from_stage_id: payload.from_stage_id,
      to_stage_id: payload.to_stage_id,
      qty_moved: split.qty,
      moved_on: today,
      variant_name: payload.variant_name,
      color: payload.color,
      printing_design: payload.printing_design,
      cap_name: payload.cap_name,
      atomizer_name: payload.atomizer_name,
      box_name: payload.box_name,
      cap_item_id: payload.cap_item_id,
      atomizer_item_id: payload.atomizer_item_id,
      box_item_id: payload.box_item_id,
      cap_qty_used: payload.cap_item_id ? split.qty : null,
      atomizer_qty_used: payload.atomizer_item_id ? split.qty : null,
      box_qty_used: payload.box_item_id ? split.qty : null,
      remarks: payload.remarks,
      done_by: payload.done_by,
    });
    createdMovements.push(m);
  }

  if (payload.scrap_splits && payload.scrap_splits.length > 0 && payload.stages) {
    for (const sSplit of payload.scrap_splits) {
      const sm = await insertScrapMovement({
        batch_id: sSplit.batch_id,
        from_stage_id: payload.from_stage_id,
        qty_scrapped: sSplit.qty,
        reason: payload.scrap_reason || 'Defect loss on transfer',
        remarks: payload.remarks,
        done_by: payload.done_by,
        stages: payload.stages,
      });
      createdMovements.push(sm);
    }
  }

  return { success: true, movements: createdMovements };
}

