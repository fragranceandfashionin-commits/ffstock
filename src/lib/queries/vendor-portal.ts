import { supabase } from '../supabase';
import { fetchWithCache, invalidateCache, CACHE_TTL } from '../cache';
import type {
  Client,
  BomCategory,
  ProductionOrder,
  ProductionOrderWithRelations,
  MaterialAllocation,
  MaterialAllocationWithVendorRelations,
} from '../types/database';

// --------------- CLIENTS ---------------

export async function fetchClients(): Promise<Client[]> {
  return fetchWithCache('clients', async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name');
    if (error) throw error;
    return (data ?? []) as Client[];
  }, CACHE_TTL.SHORT);
}

export async function createClient(payload: {
  name: string;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  preferences?: string | null;
  status?: 'active' | 'inactive';
}): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: payload.name.trim(),
      company_name: payload.company_name?.trim() || null,
      email: payload.email?.trim() || null,
      phone: payload.phone?.trim() || null,
      preferences: payload.preferences?.trim() || null,
      status: payload.status || 'active',
    })
    .select()
    .single();
  if (error) throw error;
  invalidateCache('clients');
  return data as Client;
}

export async function updateClient(
  id: string,
  payload: Partial<Omit<Client, 'id' | 'created_at'>>
): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  invalidateCache('clients');
  return data as Client;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('clients');
}

// --------------- BOM CATEGORIES ---------------

export async function fetchBomCategories(): Promise<BomCategory[]> {
  return fetchWithCache('bom_categories', async () => {
    const { data, error } = await supabase
      .from('bom_categories')
      .select('*')
      .order('sort_order');
    if (error) throw error;
    return (data ?? []) as BomCategory[];
  }, CACHE_TTL.STAGES);
}

// --------------- PRODUCTION ORDERS ---------------

export async function fetchProductionOrders(
  statusFilter?: string
): Promise<ProductionOrderWithRelations[]> {
  let query = supabase
    .from('production_orders')
    .select('*, client:clients(*), material_allocations(*)')
    .order('created_at', { ascending: false });

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProductionOrderWithRelations[];
}

export async function createProductionOrder(payload: {
  client_id: string;
  product_name: string;
  variants?: unknown[];
  total_qty?: number;
  due_date?: string | null;
  notes?: string | null;
}): Promise<ProductionOrder> {
  const { data, error } = await supabase.rpc('create_production_order_with_allocations', {
    p_client_id: payload.client_id,
    p_product_name: payload.product_name.trim(),
    p_variants: JSON.stringify(payload.variants || []),
    p_total_qty: payload.total_qty || 0,
    p_due_date: payload.due_date || null,
    p_notes: payload.notes?.trim() || null,
  });
  if (error) throw error;
  invalidateCache('clients');
  return data as ProductionOrder;
}

export async function updateProductionOrder(
  id: string,
  payload: Partial<Omit<ProductionOrder, 'id' | 'order_no' | 'created_at'>>
): Promise<ProductionOrder> {
  const { data, error } = await supabase
    .from('production_orders')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ProductionOrder;
}

export async function completeProductionOrder(id: string): Promise<ProductionOrder> {
  const { data, error } = await supabase
    .from('production_orders')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ProductionOrder;
}

export async function reopenProductionOrder(id: string): Promise<ProductionOrder> {
  const { data, error } = await supabase
    .from('production_orders')
    .update({ status: 'in_progress', completed_at: null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ProductionOrder;
}

export async function deleteProductionOrder(id: string): Promise<void> {
  const { error } = await supabase.from('production_orders').delete().eq('id', id);
  if (error) throw error;
}

// --------------- MATERIAL ALLOCATIONS ---------------

export async function updateMaterialAllocation(
  id: string,
  payload: Partial<Omit<MaterialAllocation, 'id' | 'order_id' | 'created_at'>>
): Promise<MaterialAllocation> {
  const { data, error } = await supabase
    .from('material_allocations')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as MaterialAllocation;
}

export async function markAllocationReceived(id: string): Promise<MaterialAllocation> {
  const { data, error } = await supabase
    .from('material_allocations')
    .update({ status: 'received', received_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as MaterialAllocation;
}

export async function revertAllocationToPending(id: string): Promise<MaterialAllocation> {
  const { data, error } = await supabase
    .from('material_allocations')
    .update({ status: 'pending', received_at: null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as MaterialAllocation;
}

export async function deleteAllocation(id: string): Promise<void> {
  const { error } = await supabase.from('material_allocations').delete().eq('id', id);
  if (error) throw error;
}

export async function addAllocationRow(payload: {
  order_id: string;
  component_name: string;
  sort_order?: number;
  source?: 'vendor' | 'stock';
}): Promise<MaterialAllocation> {
  const { data, error } = await supabase
    .from('material_allocations')
    .insert({
      order_id: payload.order_id,
      component_name: payload.component_name.trim(),
      sort_order: payload.sort_order ?? 99,
      source: payload.source || 'vendor',
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data as MaterialAllocation;
}

// --------------- VENDOR PENDING BOARD ---------------

export async function fetchVendorPendingList(): Promise<MaterialAllocationWithVendorRelations[]> {
  const { data, error } = await supabase
    .from('material_allocations')
    .select(`
      *,
      order:production_orders(*),
      vendor:suppliers(*),
      stock_item:items(*)
    `)
    .eq('status', 'pending')
    .eq('source', 'vendor')
    .order('sort_order');
  if (error) throw error;

  // Enrich with client data from orders
  const enriched = (data ?? []).map((row: Record<string, unknown>) => {
    return {
      ...row,
      client: null, // Client fetched separately if needed
    } as MaterialAllocationWithVendorRelations;
  });

  return enriched;
}

// --------------- ORDER HISTORY ---------------

export async function fetchCompletedOrders(): Promise<ProductionOrderWithRelations[]> {
  const { data, error } = await supabase
    .from('production_orders')
    .select('*, client:clients(*), material_allocations(*)')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProductionOrderWithRelations[];
}

export async function repeatOrder(sourceOrderId: string): Promise<ProductionOrder> {
  const { data, error } = await supabase.rpc('repeat_production_order', {
    p_source_order_id: sourceOrderId,
  });
  if (error) throw error;
  return data as ProductionOrder;
}
