# 04. Database and API Design

## 1. Relational Schema Analysis

The BOM data model centers on the `material_allocations` table and its parent `production_orders`:

```sql
CREATE TABLE IF NOT EXISTS material_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  component_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'vendor' CHECK (source IN ('vendor', 'stock')),
  description text,
  vendor_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  stock_item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  timeline date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received')),
  received_at timestamptz,
  remarks text,
  qty integer NOT NULL DEFAULT 0 CHECK (qty >= 0),
  qty_received integer CHECK (qty_received IS NULL OR qty_received > 0),
  inward_batch_id uuid REFERENCES inward_batches(id) ON DELETE SET NULL,
  receipt_id uuid REFERENCES item_stock_receipts(id) ON DELETE SET NULL,
  location text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Constraints & Integrity Audit:
1. **Uniqueness:** There is **NO unique constraint** on `(order_id, component_name)` or `(order_id, sort_order)`. Multiple records with the same component name and order id are natively permitted and supported by the database engine.
2. **Cascading Delete:** If a `production_order` is deleted, all child `material_allocations` are deleted automatically via `ON DELETE CASCADE`.
3. **Foreign Key Integrity:** 
   - `vendor_id` -> `suppliers(id)` (`ON DELETE SET NULL`)
   - `stock_item_id` -> `items(id)` (`ON DELETE SET NULL`)
   - `inward_batch_id` -> `inward_batches(id)` (`ON DELETE SET NULL`)
   - `receipt_id` -> `item_stock_receipts(id)` (`ON DELETE SET NULL`)
4. **Triggers:**
   - `prevent_received_allocation_delete_trigger`: Raises an exception if a delete operation is attempted on an allocation where `status = 'received'`, or where an inward batch or stock receipt is attached.

---

## 2. Query Layer Specifications (`src/lib/queries/vendor-portal.ts`)

### Enhancement to `addAllocationRow`:

Currently:
```typescript
export async function addAllocationRow(payload: {
  order_id: string;
  component_name: string;
  sort_order?: number;
  source?: 'vendor' | 'stock';
}): Promise<MaterialAllocation>
```

Updated Signature & Implementation:
```typescript
export async function addAllocationRow(payload: {
  order_id: string;
  component_name: string;
  sort_order?: number;
  source?: 'vendor' | 'stock';
  qty?: number;
  description?: string | null;
  location?: string | null;
  stock_item_id?: string | null;
  vendor_id?: string | null;
}): Promise<MaterialAllocation> {
  const { data, error } = await supabase
    .from('material_allocations')
    .insert({
      order_id: payload.order_id,
      component_name: payload.component_name.trim(),
      sort_order: payload.sort_order ?? 99,
      source: payload.source || 'vendor',
      status: 'pending',
      qty: payload.qty ?? 0,
      description: payload.description?.trim() || null,
      location: payload.location?.trim() || 'Raw Stock Bay A',
      stock_item_id: payload.stock_item_id || null,
      vendor_id: payload.vendor_id || null,
    })
    .select()
    .single();

  if (error) throw error;
  invalidateCache('clients');
  return data as MaterialAllocation;
}
```

### Signature of `deleteAllocation`:
```typescript
export async function deleteAllocation(id: string): Promise<void> {
  const { error } = await supabase.from('material_allocations').delete().eq('id', id);
  if (error) throw error;
  invalidateCache('clients');
}
```

---

## 3. Atomic Order Duplication RPC (`repeat_production_order`)

The database RPC `repeat_production_order` faithfully copies all BOM records:

```sql
FOR v_alloc IN SELECT * FROM material_allocations WHERE order_id = p_source_order_id ORDER BY sort_order ASC, created_at ASC LOOP
  INSERT INTO material_allocations (
    order_id, component_name, sort_order, source, description, vendor_id, stock_item_id, timeline, status, remarks, qty, location
  ) VALUES (
    v_new_order.id, v_alloc.component_name, v_alloc.sort_order, v_alloc.source, v_alloc.description, v_alloc.vendor_id, v_alloc.stock_item_id, NULL, 'pending', v_alloc.remarks, COALESCE(v_alloc.qty, v_source.total_qty), v_alloc.location
  );
END LOOP;
```

---

## 4. Real-time Subscription Contract

The client maintains an active WebSocket subscription to Postgres Changes on table `material_allocations`:
```typescript
const channel = supabase
  .channel('orders-allocations-sync')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'material_allocations' },
    () => {
      loadData(true);
    }
  )
  .subscribe();
```
Any insertion or deletion of a duplicate component immediately propagates to all concurrent users in the plant.
