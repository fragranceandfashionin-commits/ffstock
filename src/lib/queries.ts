import { supabase } from './supabase';
import type { BatchStock, LocationStock, StageStock } from './types';
import type { Stage, InwardBatch, StageMovement, Dispatch, Item, Supplier, BatchWithRelations, ComponentStockSummary, ItemStockReceipt } from './supabase';
import { getTodayDateString } from './utils';

/**
 * Runs a query against one of the server-side stock views
 * (v_stage_stock / v_batch_stock / v_location_stock). Returns null when the
 * view does not exist yet (migration not applied) so callers can fall back to
 * local computation — the app keeps working before AND after the migration.
 */
type ViewQueryResult<T> = { data: T[] | null; error: { code?: string } | null };

export const QUERY_SAFETY_LIMIT = 50000;

export function checkRowLimitGuard(count: number | undefined, tableName: string) {
  if (typeof count === 'number' && count >= QUERY_SAFETY_LIMIT) {
    console.warn(
      `[Query Guard] Result set for '${tableName}' reached the safety limit (${QUERY_SAFETY_LIMIT} rows). Data may be truncated if total records exceed this threshold.`
    );
  }
}

/**
 * Safely fetches rows from a Supabase table with transparent chunked pagination
 * (1,000 rows per chunk) to overcome PostgREST default max-rows truncation limits.
 */
export async function fetchPagedRows<T = Record<string, unknown>>(
  tableName: string,
  options?: {
    select?: string;
    order?: { column: string; ascending?: boolean };
    eq?: { column: string; value: unknown };
    limit?: number;
  }
): Promise<T[]> {
  const selectClause = options?.select || '*';
  const orderCol = options?.order?.column;
  const ascending = options?.order?.ascending ?? true;
  const eqCol = options?.eq?.column;
  const eqVal = options?.eq?.value;
  const maxRows = options?.limit || QUERY_SAFETY_LIMIT;

  const PAGE_SIZE = 1000;
  const allRows: T[] = [];
  let from = 0;

  while (from < maxRows) {
    const to = Math.min(from + PAGE_SIZE - 1, maxRows - 1);
    let query = supabase.from(tableName).select(selectClause).range(from, to);

    if (orderCol) {
      query = query.order(orderCol, { ascending });
    }
    if (eqCol && eqVal !== undefined) {
      query = query.eq(eqCol, eqVal);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  checkRowLimitGuard(allRows.length, tableName);
  return allRows;
}

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

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase.from('suppliers').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function insertSupplier(payload: {
  name: string;
  contact?: string | null;
}): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      name: payload.name.trim(),
      contact: payload.contact?.trim() || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Supplier;
}

export async function insertSuppliers(
  payloads: Array<{
    name: string;
    contact?: string | null;
  }>
): Promise<Supplier[]> {
  if (!payloads || payloads.length === 0) return [];
  const cleaned = payloads
    .map((p) => ({
      name: p.name.trim(),
      contact: p.contact?.trim() || null,
    }))
    .filter((p) => p.name.length > 0);

  if (cleaned.length === 0) return [];

  const { data, error } = await supabase.from('suppliers').insert(cleaned).select('*');
  if (error) throw error;
  return (data ?? []) as Supplier[];
}

export async function fetchItems() {
  const { data, error } = await supabase.from('items').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

/** Items with category = 'Cap' for component selection dropdowns. */
export async function fetchCaps(): Promise<Item[]> {
  try {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .ilike('category', '%Cap%')
      .order('name');
    if (!error && data) return data as Item[];

    const fallback = await supabase.from('items').select('*').order('name');
    return (fallback.data ?? []).filter((i: Item) =>
      (i.category ?? '').toLowerCase().includes('cap') || i.name.toLowerCase().includes('cap')
    ) as Item[];
  } catch {
    return [];
  }
}

/** Items with category = 'Atomizer' for component selection dropdowns. */
export async function fetchAtomizers(): Promise<Item[]> {
  try {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .ilike('category', '%Atomizer%')
      .order('name');
    if (!error && data) return data as Item[];

    const fallback = await supabase.from('items').select('*').order('name');
    return (fallback.data ?? []).filter((i: Item) =>
      (i.category ?? '').toLowerCase().includes('atomizer') ||
      i.name.toLowerCase().includes('atomizer') ||
      i.name.toLowerCase().includes('pump') ||
      i.name.toLowerCase().includes('spray')
    ) as Item[];
  } catch {
    return [];
  }
}

/** Items with category = 'Packaging' or box/carton for packaging selection dropdowns. */
export async function fetchBoxes(): Promise<Item[]> {
  try {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .ilike('category', '%Packaging%')
      .order('name');
    if (!error && data && data.length > 0) return data as Item[];

    const fallback = await supabase.from('items').select('*').order('name');
    return (fallback.data ?? []).filter((i: Item) =>
      (i.category ?? '').toLowerCase().includes('pack') ||
      (i.category ?? '').toLowerCase().includes('box') ||
      i.name.toLowerCase().includes('box') ||
      i.name.toLowerCase().includes('carton') ||
      i.name.toLowerCase().includes('mono')
    ) as Item[];
  } catch {
    return [];
  }
}


export async function insertItem(payload: {
  name: string;
  category?: string;
  unit?: string;
  description?: string | null;
  color?: string | null;
}): Promise<{ id: string }> {
  const fullPayload: Record<string, unknown> = {
    name: payload.name.trim(),
    category: payload.category?.trim() || 'Bottle',
    unit: payload.unit?.trim() || 'pcs',
    description: payload.description?.trim() || null,
    color: payload.color?.trim() || null,
  };

  const { data, error } = await supabase
    .from('items')
    .insert(fullPayload)
    .select('id')
    .single();

  if (!error && data) {
    return data as { id: string };
  }

  // Graceful fallback: If migration hasn't been executed in Supabase yet,
  // insert name-only so operations never crash.
  if (
    error &&
    (error.code === 'PGRST204' ||
      error.message?.toLowerCase().includes('column') ||
      error.message?.toLowerCase().includes('schema cache') ||
      error.code === '42703')
  ) {
    const fallbackRes = await supabase
      .from('items')
      .insert({ name: payload.name.trim() })
      .select('id')
      .single();
    if (fallbackRes.error) throw fallbackRes.error;
    return fallbackRes.data as { id: string };
  }

  throw error;
}

export async function insertItems(
  payloads: Array<{
    name: string;
    category?: string;
    unit?: string;
    description?: string | null;
    color?: string | null;
  }>
): Promise<Item[]> {
  if (!payloads || payloads.length === 0) return [];
  const cleaned = payloads
    .map((p) => ({
      name: p.name.trim(),
      category: p.category?.trim() || 'Bottle',
      unit: p.unit?.trim() || 'pcs',
      description: p.description?.trim() || null,
      color: p.color?.trim() || null,
    }))
    .filter((p) => p.name.length > 0);

  if (cleaned.length === 0) return [];

  const { data, error } = await supabase.from('items').insert(cleaned).select('*');
  if (!error && data) {
    return data as Item[];
  }

  // Graceful fallback if any columns are missing in legacy schemas
  if (
    error &&
    (error.code === 'PGRST204' ||
      error.message?.toLowerCase().includes('column') ||
      error.message?.toLowerCase().includes('schema cache') ||
      error.code === '42703')
  ) {
    const fallbackRes = await supabase
      .from('items')
      .insert(cleaned.map((p) => ({ name: p.name })))
      .select('*');
    if (fallbackRes.error) throw fallbackRes.error;
    return (fallbackRes.data ?? []) as Item[];
  }

  throw error;
}

export async function updateItem(
  id: string,
  payload: {
    name: string;
    category?: string;
    unit?: string;
    description?: string | null;
    color?: string | null;
  }
) {
  const fullPayload: Record<string, unknown> = {
    name: payload.name.trim(),
    category: payload.category?.trim() || 'Bottle',
    unit: payload.unit?.trim() || 'pcs',
    description: payload.description?.trim() || null,
    color: payload.color?.trim() || null,
  };

  const { error } = await supabase.from('items').update(fullPayload).eq('id', id);

  if (!error) return;

  if (
    error.code === 'PGRST204' ||
    error.message?.toLowerCase().includes('column') ||
    error.message?.toLowerCase().includes('schema cache') ||
    error.code === '42703'
  ) {
    const fallbackRes = await supabase.from('items').update({ name: payload.name.trim() }).eq('id', id);
    if (fallbackRes.error) throw fallbackRes.error;
    return;
  }

  throw error;
}

export async function fetchItemStockReceipts(): Promise<ItemStockReceipt[]> {
  try {
    const { data, error } = await supabase
      .from('item_stock_receipts')
      .select('*, item:items(*), supplier:suppliers(*)')
      .order('received_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(QUERY_SAFETY_LIMIT);
    if (!error && data) {
      checkRowLimitGuard(data.length, 'item_stock_receipts');
      return data as ItemStockReceipt[];
    }
  } catch {
    // Graceful fallback if table does not exist yet
  }
  return [];
}

export async function fetchBatches(): Promise<BatchWithRelations[]> {
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
}

/**
 * Safely inserts a record into a Supabase table with automatic schema-cache pruning.
 * If Supabase reports that any column is missing from the remote database schema cache
 * (e.g. box_name, printing_design, box_item_id, etc.), the missing column is dynamically
 * stripped, preserved in remarks if possible, and retried seamlessly.
 */
async function resilientInsert(
  table: string,
  initialPayload: Record<string, unknown>,
  coreRequiredColumns: string[]
): Promise<{ data: unknown; error: unknown }> {
  const currentPayload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(initialPayload)) {
    if (v !== undefined) {
      currentPayload[k] = v;
    }
  }

  const preservedNotes: string[] = [];

  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await supabase.from(table).insert(currentPayload).select('id').maybeSingle();
    if (!res.error) {
      return res;
    }

    const err = res.error;
    const isColumnError =
      err.code === 'PGRST204' ||
      err.code === '42703' ||
      err.message?.toLowerCase().includes('column') ||
      err.message?.toLowerCase().includes('schema cache');

    if (!isColumnError) {
      return res;
    }

    // Extract missing column name from PostgREST / Postgres error
    // e.g. "Could not find the 'box_name' column of 'stage_movements' in the schema cache"
    // e.g. 'column "box_name" of relation "stage_movements" does not exist'
    const match =
      err.message.match(/Could not find the ['"]([^'"]+)['"] column/i) ||
      err.message.match(/column ['"]([^'"]+)['"] of relation/i) ||
      err.message.match(/column ['"]([^'"]+)['"] does not exist/i);

    if (match && match[1]) {
      const colName = match[1];
      if (colName in currentPayload) {
        const val = currentPayload[colName];
        if (val !== undefined && val !== null && String(val).trim()) {
          preservedNotes.push(`${colName}: ${val}`);
        }
        delete currentPayload[colName];

        // If remarks column exists in currentPayload, preserve note
        if ('remarks' in currentPayload) {
          const originalRemarks = (initialPayload.remarks as string) || '';
          currentPayload.remarks = [originalRemarks, `[${preservedNotes.join(' | ')}]`]
            .filter(Boolean)
            .join(' • ');
        }
        continue;
      }
    }

    // If specific column regex didn't catch it, progressively remove non-core keys
    const nonCoreKeys = Object.keys(currentPayload).filter((k) => !coreRequiredColumns.includes(k));
    if (nonCoreKeys.length > 0) {
      const keyToRemove = nonCoreKeys[nonCoreKeys.length - 1];
      delete currentPayload[keyToRemove];
      continue;
    }

    return res;
  }

  // Final fallback to strictly core required columns
  const minimalPayload: Record<string, unknown> = {};
  for (const col of coreRequiredColumns) {
    if (col in initialPayload && initialPayload[col] !== undefined) {
      minimalPayload[col] = initialPayload[col];
    }
  }
  return await supabase.from(table).insert(minimalPayload).select('id').maybeSingle();
}

/**
 * Atomically inserts an array of records into a Supabase table with schema-cache resilience.
 * All rows are inserted together in a single PostgREST transaction.
 */
async function resilientBatchInsert(
  table: string,
  initialPayloads: Record<string, unknown>[],
  coreRequiredColumns: string[]
): Promise<{ data: unknown; error: unknown }> {
  if (!initialPayloads || initialPayloads.length === 0) {
    return { data: [], error: null };
  }

  let currentPayloads = initialPayloads.map((row) => {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v !== undefined) cleaned[k] = v;
    }
    return cleaned;
  });

  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await supabase.from(table).insert(currentPayloads).select('id');
    if (!res.error) {
      return res;
    }

    const err = res.error;
    const isColumnError =
      err.code === 'PGRST204' ||
      err.code === '42703' ||
      err.message?.toLowerCase().includes('column') ||
      err.message?.toLowerCase().includes('schema cache');

    if (!isColumnError) {
      return res;
    }

    const match =
      err.message.match(/Could not find the ['"]([^'"]+)['"] column/i) ||
      err.message.match(/column ['"]([^'"]+)['"] of relation/i) ||
      err.message.match(/column ['"]([^'"]+)['"] does not exist/i);

    if (match && match[1]) {
      const colName = match[1];
      currentPayloads = currentPayloads.map((row, idx) => {
        const nextRow = { ...row };
        if (colName in nextRow) {
          const val = nextRow[colName];
          delete nextRow[colName];
          if ('remarks' in nextRow && val !== undefined && val !== null && String(val).trim()) {
            const originalRemarks = (initialPayloads[idx]?.remarks as string) || '';
            nextRow.remarks = [originalRemarks, `[${colName}: ${val}]`].filter(Boolean).join(' • ');
          }
        }
        return nextRow;
      });
      continue;
    }

    // Progressively remove non-core keys across all rows
    const firstRow = currentPayloads[0] || {};
    const nonCoreKeys = Object.keys(firstRow).filter((k) => !coreRequiredColumns.includes(k));
    if (nonCoreKeys.length > 0) {
      const keyToRemove = nonCoreKeys[nonCoreKeys.length - 1];
      currentPayloads = currentPayloads.map((row) => {
        const nextRow = { ...row };
        delete nextRow[keyToRemove];
        return nextRow;
      });
      continue;
    }

    return res;
  }

  // Final fallback to strictly core required columns
  const minimalPayloads = initialPayloads.map((init) => {
    const minimal: Record<string, unknown> = {};
    for (const col of coreRequiredColumns) {
      if (col in init && init[col] !== undefined) {
        minimal[col] = init[col];
      }
    }
    return minimal;
  });
  return await supabase.from(table).insert(minimalPayloads).select('id');
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
  return res.data;
}

export async function insertStageMovement(payload: {
  batch_id: string;
  from_stage_id: string;
  to_stage_id: string;
  qty_moved: number;
  moved_on?: string;
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
  return res.data;
}

export async function insertDispatch(payload: {
  batch_id: string;
  customer_name: string;
  invoice_no: string;
  qty: number;
  dispatched_on?: string;
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
  return res.data;
}

export type VariantDispatchItem = {
  qty: number;
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
  return res.data;
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

export async function insertScrapMovement(payload: {
  batch_id: string;
  from_stage_id: string;
  qty_scrapped: number;
  reason: string;
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
    cap_name: originalMovement.cap_name,
    atomizer_name: originalMovement.atomizer_name,
    box_name: originalMovement.box_name,
    color: originalMovement.color,
    printing_design: originalMovement.printing_design,
    cap_item_id: originalMovement.cap_item_id,
    atomizer_item_id: originalMovement.atomizer_item_id,
    box_item_id: originalMovement.box_item_id,
    cap_qty_used: originalMovement.cap_qty_used ? qty : null,
    atomizer_qty_used: originalMovement.atomizer_qty_used ? qty : null,
    box_qty_used: originalMovement.box_qty_used ? qty : null,
    remarks: reversalRemark,
    done_by: doneBy || null,
  });
}


export async function fetchMovements(batchId?: string) {
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
      return data;
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
  return (rawMovesRes.data ?? []).map((m: Record<string, unknown>) => ({
    ...m,
    from_stage: stageMap.get(m.from_stage_id as string) ?? null,
    to_stage: stageMap.get(m.to_stage_id as string) ?? null,
  }));
}

export async function fetchDispatches(batchId?: string) {
  let query = supabase
    .from('dispatches')
    .select('*')
    .order('dispatched_on', { ascending: false })
    .limit(QUERY_SAFETY_LIMIT);
  if (batchId) query = query.eq('batch_id', batchId);
  const { data, error } = await query;
  if (error) throw error;
  checkRowLimitGuard(data?.length, 'dispatches');
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
export async function fetchComponentStockSummary(): Promise<ComponentStockSummary[]> {
  const [items, stages, batchesData, movementsData, dispatchesData, receipts] = await Promise.all([
    fetchItems().catch(() => []),
    fetchStages().catch(() => []),
    fetchPagedRows<Record<string, unknown>>('inward_batches').catch(() => []),
    fetchPagedRows<Record<string, unknown>>('stage_movements').catch(() => []),
    fetchPagedRows<Record<string, unknown>>('dispatches').catch(() => []),
    fetchItemStockReceipts().catch(() => []),
  ]);

  const stageMap = new Map(stages.map((s) => [s.id, s]));

  const rawBatches = batchesData as unknown as {
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

  const receiptsByItem = new Map<string, number>();
  for (const r of (receipts ?? [])) {
    receiptsByItem.set(r.item_id, (receiptsByItem.get(r.item_id) ?? 0) + (Number(r.qty) || 0));
  }

  const rawMovements = movementsData.map((m: Record<string, unknown>) => ({
    id: (m.id as string) || '',
    batch_id: (m.batch_id as string) || '',
    qty_moved: Number(m.qty_moved || 0),
    moved_on: (m.moved_on as string) || '',
    cap_name: (m.cap_name as string) || null,
    atomizer_name: (m.atomizer_name as string) || null,
    box_name: (m.box_name as string) || null,
    cap_item_id: (m.cap_item_id as string) || null,
    atomizer_item_id: (m.atomizer_item_id as string) || null,
    box_item_id: (m.box_item_id as string) || null,
    cap_qty_used: Number(m.cap_qty_used || 0),
    atomizer_qty_used: Number(m.atomizer_qty_used || 0),
    box_qty_used: Number(m.box_qty_used || 0),
    from_stage: stageMap.get(m.from_stage_id as string) ?? null,
    to_stage: stageMap.get(m.to_stage_id as string) ?? null,
    remarks: (m.remarks as string) || null,
  }));

  const rawDispatches = dispatchesData.map((d: Record<string, unknown>) => ({
    id: (d.id as string) || '',
    batch_id: (d.batch_id as string) || '',
    qty: Number(d.qty || 0),
    customer_name: (d.customer_name as string) || '',
    invoice_no: (d.invoice_no as string) || '',
    dispatched_on: (d.dispatched_on as string) || '',
    cap_name: (d.cap_name as string) || null,
    atomizer_name: (d.atomizer_name as string) || null,
    box_name: (d.box_name as string) || null,
    box_item_id: (d.box_item_id as string) || null,
    color: (d.color as string) || null,
  }));

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const batchMap = new Map(rawBatches.map((b) => [b.id, b]));

  // Inward received per item
  const inwardSummaryByItem = new Map<string, { totalQty: number; count: number }>();
  for (const b of rawBatches) {
    const prev = inwardSummaryByItem.get(b.item_id) ?? { totalQty: 0, count: 0 };
    inwardSummaryByItem.set(b.item_id, {
      totalQty: prev.totalQty + b.qty_received,
      count: prev.count + 1,
    });
  }

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

    // 1. Analyze Batch Component Usage without multi-stage duplication.
    // For each batch, calculate the exact component consumption.
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
          Boolean(b?.cap_item_id && (b.cap_item_id === item.id || itemMap.get(b.cap_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
          bMoves.some((m) => Boolean(m.cap_item_id && (m.cap_item_id === item.id || itemMap.get(m.cap_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
                            Boolean(m.cap_name && m.cap_name.toLowerCase().trim() === itemNameNorm));
        if (b?.cap_qty && b.cap_qty > 0) batchComponentIntake = b.cap_qty;
      } else if (isAtomizer) {
        isBatchLinked =
          Boolean(b?.atomizer_item_id && (b.atomizer_item_id === item.id || itemMap.get(b.atomizer_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
          bMoves.some((m) => Boolean(m.atomizer_item_id && (m.atomizer_item_id === item.id || itemMap.get(m.atomizer_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
                            Boolean(m.atomizer_name && m.atomizer_name.toLowerCase().trim() === itemNameNorm));
        if (b?.atomizer_qty && b.atomizer_qty > 0) batchComponentIntake = b.atomizer_qty;
      } else if (isPackaging) {
        isBatchLinked =
          Boolean(b?.box_item_id && (b.box_item_id === item.id || itemMap.get(b.box_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
          bMoves.some((m) => Boolean(m.box_item_id && (m.box_item_id === item.id || itemMap.get(m.box_item_id)?.name.toLowerCase().trim() === itemNameNorm)) ||
                            Boolean(m.box_name && m.box_name.toLowerCase().trim() === itemNameNorm));
        if (b?.box_qty && b.box_qty > 0) batchComponentIntake = b.box_qty;
      } else {
        isBatchLinked =
          Boolean(b?.cap_item_id === item.id || b?.atomizer_item_id === item.id || b?.box_item_id === item.id) ||
          bMoves.some((m) => m.cap_item_id === item.id || m.atomizer_item_id === item.id || m.box_item_id === item.id ||
                            m.cap_name?.toLowerCase().trim() === itemNameNorm ||
                            m.atomizer_name?.toLowerCase().trim() === itemNameNorm ||
                            m.box_name?.toLowerCase().trim() === itemNameNorm);
      }

      if (!isBatchLinked) continue;

      // Track movement-based component usage and explicit quantity overrides
      let explicitUsage = 0;
      let hasExplicitUsage = false;
      let moveBasedUsage = 0;
      let hasMoveBasedUsage = false;
      let batchScrap = 0;
      let maxMovementDate = b?.received_on || '';

      for (const m of bMoves) {
        let isMoveMatch = false;
        let explicitQty = 0;

        if (isCap && ((m.cap_item_id && (m.cap_item_id === item.id || itemMap.get(m.cap_item_id)?.name.toLowerCase().trim() === itemNameNorm)) || (m.cap_name && m.cap_name.toLowerCase().trim() === itemNameNorm))) {
          isMoveMatch = true;
          if (m.cap_qty_used > 0) { explicitQty = m.cap_qty_used; hasExplicitUsage = true; }
        } else if (isAtomizer && ((m.atomizer_item_id && (m.atomizer_item_id === item.id || itemMap.get(m.atomizer_item_id)?.name.toLowerCase().trim() === itemNameNorm)) || (m.atomizer_name && m.atomizer_name.toLowerCase().trim() === itemNameNorm))) {
          isMoveMatch = true;
          if (m.atomizer_qty_used > 0) { explicitQty = m.atomizer_qty_used; hasExplicitUsage = true; }
        } else if (isPackaging && ((m.box_item_id && (m.box_item_id === item.id || itemMap.get(m.box_item_id)?.name.toLowerCase().trim() === itemNameNorm)) || (m.box_name && m.box_name.toLowerCase().trim() === itemNameNorm))) {
          isMoveMatch = true;
          if (m.box_qty_used > 0) { explicitQty = m.box_qty_used; hasExplicitUsage = true; }
        } else if (!isBottle && (m.cap_item_id === item.id || m.atomizer_item_id === item.id || m.box_item_id === item.id || m.cap_name?.toLowerCase().trim() === itemNameNorm || m.atomizer_name?.toLowerCase().trim() === itemNameNorm || m.box_name?.toLowerCase().trim() === itemNameNorm)) {
          isMoveMatch = true;
        }

        if (isMoveMatch) {
          hasMoveBasedUsage = true;
          const isReversal =
            Boolean(m.remarks && m.remarks.toUpperCase().includes('[REVERSAL')) ||
            Boolean(m.to_stage && m.from_stage && (m.from_stage.sequence_no > m.to_stage.sequence_no || m.from_stage.name === 'Scrap / Defect'));

          const effectiveMoveQty = explicitQty > 0 ? explicitQty : m.qty_moved;

          if (m.to_stage?.name === 'Scrap / Defect') {
            batchScrap += effectiveMoveQty;
          } else if (m.from_stage?.name === 'Scrap / Defect') {
            batchScrap = Math.max(0, batchScrap - effectiveMoveQty);
          } else if (isReversal) {
            explicitUsage = Math.max(0, explicitUsage - explicitQty);
            moveBasedUsage = Math.max(0, moveBasedUsage - m.qty_moved);
          } else {
            explicitUsage += explicitQty;
            moveBasedUsage += m.qty_moved;
          }
          if (m.moved_on && m.moved_on > maxMovementDate) {
            maxMovementDate = m.moved_on;
          }
        }
      }

      // Calculate effective batch usage:
      // 1. If explicit component quantities were logged, use that.
      // 2. If movements specified this component without explicit quantity, use the sum of moved units with this component (e.g. 600 of 1000).
      // 3. If component was attached at the batch level (and not overridden per-movement), consume the net units moved into production.
      let effectiveBatchUsage = 0;
      if (hasExplicitUsage) {
        effectiveBatchUsage = Math.max(0, explicitUsage);
      } else if (hasMoveBasedUsage) {
        effectiveBatchUsage = Math.max(0, moveBasedUsage);
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
        const intake = b.qty_received;
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
        directInwardQty += b.qty_received;
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
    // If an item was recorded as 1,000 received and 1,000 used, floor intake is 0 (it came from the 1,000 recorded).
    // If an item was used for 1,200 but only 1,000 recorded (or 0 recorded for discovered items), floor intake is 200.
    const unrecordedFloorUsage = Math.max(0, totalUsed - recordedInwardQty);
    const totalInwarded = recordedInwardQty + unrecordedFloorUsage;

    const inwardBatchCount = directCount + attachedCount + directReceiptsCount + (unrecordedFloorUsage > 0 ? 1 : 0);

    // Unallocated Warehouse Stock (Stock in Items section not yet assigned to batches)
    const unallocatedWarehouseStock = isBottle
      ? directReceiptsQty
      : Math.max(0, totalInwarded - totalUsed - totalScrapped);

    // 4. Accurate 5-State Balance Math:
    // Available Loose Stock = Unallocated in Items section + Bottle Raw Stock in Stage 1
    // In Factory Assembled = Consumed - Dispatched - Scrapped (for Bottles: WIP in downstream stages + Ready)
    // Dispatched = Dispatched in customer orders
    const availableStock = isBottle
      ? (unallocatedWarehouseStock + bottleAvailableRawStock)
      : Math.max(0, totalInwarded - totalUsed - totalScrapped);

    const totalInFactoryAssembled = isBottle
      ? bottleInFactoryWip
      : Math.max(0, totalUsed - totalDispatchedInOrders - totalScrapped);

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

