import { supabase } from '../supabase';
import { fetchWithCache, invalidateCache, CACHE_TTL } from '../cache';
import type { Item, ItemStockReceipt } from '../types/database';
import { QUERY_SAFETY_LIMIT, checkRowLimitGuard } from './core';

export async function fetchItems(): Promise<Item[]> {
  return fetchWithCache('items', async () => {
    const { data, error } = await supabase.from('items').select('*').order('name');
    if (error) throw error;
    return (data ?? []) as Item[];
  }, CACHE_TTL.ITEMS);
}

/** Items with category = 'Cap' for component selection dropdowns (in-memory fast filter). */
export async function fetchCaps(): Promise<Item[]> {
  const all = await fetchItems().catch(() => []);
  return all.filter((i) =>
    (i.category ?? '').toLowerCase().includes('cap') || i.name.toLowerCase().includes('cap')
  );
}

/** Items with category = 'Atomizer' for component selection dropdowns (in-memory fast filter). */
export async function fetchAtomizers(): Promise<Item[]> {
  const all = await fetchItems().catch(() => []);
  return all.filter((i) =>
    (i.category ?? '').toLowerCase().includes('atomizer') ||
    i.name.toLowerCase().includes('atomizer') ||
    i.name.toLowerCase().includes('pump') ||
    i.name.toLowerCase().includes('spray')
  );
}

/** Items with category = 'Packaging' or box/carton for packaging selection dropdowns (in-memory fast filter). */
export async function fetchBoxes(): Promise<Item[]> {
  const all = await fetchItems().catch(() => []);
  return all.filter((i) =>
    (i.category ?? '').toLowerCase().includes('pack') ||
    (i.category ?? '').toLowerCase().includes('box') ||
    i.name.toLowerCase().includes('box') ||
    i.name.toLowerCase().includes('carton') ||
    i.name.toLowerCase().includes('mono')
  );
}

export async function insertItem(payload: {
  name: string;
  category?: string;
  unit?: string;
  description?: string | null;
  color?: string | null;
}): Promise<Item> {
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
    .select('*')
    .single();

  if (!error && data) {
    invalidateCache('items');
    return data as Item;
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
      .select('*')
      .single();
    if (fallbackRes.error) throw fallbackRes.error;
    invalidateCache('items');
    return fallbackRes.data as Item;
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
    invalidateCache('items');
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
    invalidateCache('items');
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

  if (!error) {
    invalidateCache('items');
    return;
  }

  if (
    error.code === 'PGRST204' ||
    error.message?.toLowerCase().includes('column') ||
    error.message?.toLowerCase().includes('schema cache') ||
    error.code === '42703'
  ) {
    const fallbackRes = await supabase.from('items').update({ name: payload.name.trim() }).eq('id', id);
    if (fallbackRes.error) throw fallbackRes.error;
    invalidateCache('items');
    return;
  }

  throw error;
}

export async function fetchItemStockReceipts(): Promise<ItemStockReceipt[]> {
  return fetchWithCache('item_stock_receipts', async () => {
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
  }, CACHE_TTL.SHORT);
}
