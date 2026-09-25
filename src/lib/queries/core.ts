import { supabase } from '../supabase';

export const QUERY_SAFETY_LIMIT = 50000;

export type ViewQueryResult<T> = { data: T[] | null; error: { code?: string } | null };

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

/**
 * Runs a query against one of the server-side stock views
 * (v_stage_stock / v_batch_stock / v_location_stock). Returns null when the
 * view does not exist yet (migration not applied) so callers can fall back to
 * local computation — the app keeps working before AND after the migration.
 */
export async function viewQuery<T>(run: () => PromiseLike<ViewQueryResult<T>>): Promise<T[] | null> {
  const { data, error } = await run();
  if (error && error.code === 'PGRST205') return null; // relation does not exist yet
  if (error) throw error;
  return (data ?? []) as T[];
}

/**
 * Safely inserts a record into a Supabase table with automatic schema-cache pruning.
 * If Supabase reports that any column is missing from the remote database schema cache
 * (e.g. box_name, printing_design, box_item_id, etc.), the missing column is dynamically
 * stripped, preserved in remarks if possible, and retried seamlessly.
 */
export async function resilientInsert(
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

    const err = res.error as { code?: string; message?: string };
    const isColumnError =
      err.code === 'PGRST204' ||
      err.code === '42703' ||
      err.message?.toLowerCase().includes('column') ||
      err.message?.toLowerCase().includes('schema cache');

    if (!isColumnError) {
      return res;
    }

    // Extract missing column name from PostgREST / Postgres error
    const match =
      err.message?.match(/Could not find the ['"]([^'"]+)['"] column/i) ||
      err.message?.match(/column ['"]([^'"]+)['"] of relation/i) ||
      err.message?.match(/column ['"]([^'"]+)['"] does not exist/i);

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
export async function resilientBatchInsert(
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

    const err = res.error as { code?: string; message?: string };
    const isColumnError =
      err.code === 'PGRST204' ||
      err.code === '42703' ||
      err.message?.toLowerCase().includes('column') ||
      err.message?.toLowerCase().includes('schema cache');

    if (!isColumnError) {
      return res;
    }

    const match =
      err.message?.match(/Could not find the ['"]([^'"]+)['"] column/i) ||
      err.message?.match(/column ['"]([^'"]+)['"] of relation/i) ||
      err.message?.match(/column ['"]([^'"]+)['"] does not exist/i);

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

export function extractRemarksMetadata(remarks?: string | null): Record<string, string> {
  if (!remarks) return {};
  const meta: Record<string, string> = {};
  const regex = /\[([a-zA-Z0-9_]+):\s*([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(remarks)) !== null) {
    const key = match[1].toLowerCase().trim();
    const val = match[2].trim();
    if (key && val) meta[key] = val;
  }
  return meta;
}

export function normalizeRawMovementRecord(m: Record<string, unknown>): Record<string, unknown> {
  const remarks = (m.remarks as string) || '';
  const meta = extractRemarksMetadata(remarks);
  return {
    ...m,
    variant_name: (m.variant_name as string)?.trim() || meta.variant_name || meta.variant || null,
    color: (m.color as string)?.trim() || meta.color || null,
    printing_design: (m.printing_design as string)?.trim() || meta.printing_design || meta.print || null,
    cap_name: (m.cap_name as string)?.trim() || meta.cap_name || meta.cap || null,
    atomizer_name: (m.atomizer_name as string)?.trim() || meta.atomizer_name || meta.atomizer || meta.pump || null,
    box_name: (m.box_name as string)?.trim() || meta.box_name || meta.box || meta.carton || null,
  };
}

export function normalizeRawDispatchRecord(d: Record<string, unknown>): Record<string, unknown> {
  const specs = (d.product_specs as string) || '';
  const meta = extractRemarksMetadata(specs);
  return {
    ...d,
    variant_name: (d.variant_name as string)?.trim() || meta.variant_name || meta.variant || null,
    color: (d.color as string)?.trim() || meta.color || null,
    printing_design: (d.printing_design as string)?.trim() || meta.printing_design || meta.print || null,
    cap_name: (d.cap_name as string)?.trim() || meta.cap_name || meta.cap || null,
    atomizer_name: (d.atomizer_name as string)?.trim() || meta.atomizer_name || meta.atomizer || meta.pump || null,
    box_name: (d.box_name as string)?.trim() || meta.box_name || meta.box || null,
  };
}
