import { supabase } from '../supabase';
import { fetchWithCache, invalidateCache, CACHE_TTL } from '../cache';
import type { Supplier, ExtendedSupplier } from '../types/database';

export async function fetchSuppliers(): Promise<Supplier[]> {
  return fetchWithCache('suppliers', async () => {
    const { data, error } = await supabase.from('suppliers').select('*').order('name');
    if (error) throw error;
    return data ?? [];
  }, CACHE_TTL.SUPPLIERS);
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
  invalidateCache('suppliers');
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
  invalidateCache('suppliers');
  return (data ?? []) as Supplier[];
}

export async function updateSupplierExtended(
  id: string,
  payload: Partial<Omit<ExtendedSupplier, 'id' | 'created_at'>>
): Promise<ExtendedSupplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  invalidateCache('suppliers');
  return data as ExtendedSupplier;
}
