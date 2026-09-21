-- ============================================================
-- MIGRATION: Add Vendor Portal Schema (w-Vendor → Stock Track)
-- Version: 20260920000000
-- Reversible: Yes (see 20260920000000_revert_vendor_portal_schema.sql)
-- ============================================================

-- NEW TABLE: clients (maps from w-Vendor's `clients` table)
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  company_name text,
  email text,
  phone text,
  preferences text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- NEW TABLE: production_orders (maps from w-Vendor's `orders` table)
CREATE TABLE IF NOT EXISTS production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL UNIQUE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  product_name text NOT NULL CHECK (char_length(trim(product_name)) > 0),
  variants jsonb DEFAULT '[]'::jsonb,
  total_qty integer NOT NULL DEFAULT 0 CHECK (total_qty >= 0),
  due_date date,
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'in_progress', 'completed', 'cancelled')),
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- NEW TABLE: bom_categories (maps from w-Vendor's `category` table)
CREATE TABLE IF NOT EXISTS bom_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(trim(name)) > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the 10 default BOM categories from w-Vendor
INSERT INTO bom_categories (name, sort_order) VALUES
  ('Bottles', 1), ('Raw Material', 2), ('Sticker', 3), ('Box', 4),
  ('Atomizer', 5), ('Cap', 6), ('Coating', 7), ('Printing', 8),
  ('Inner Outer', 9), ('Cellophane', 10)
ON CONFLICT (name) DO NOTHING;

-- NEW TABLE: material_allocations (maps from w-Vendor's `material_allocation` table)
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
  created_at timestamptz NOT NULL DEFAULT now()
);

-- EXTEND: suppliers table — add fields from w-Vendor's `vendors` table
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS categories_supplied text[];
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS specific_materials text;

-- Indexes for high-performance lookups and search
CREATE INDEX IF NOT EXISTS idx_production_orders_client ON production_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_status ON production_orders(status);
CREATE INDEX IF NOT EXISTS idx_production_orders_created ON production_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_allocations_order ON material_allocations(order_id);
CREATE INDEX IF NOT EXISTS idx_material_allocations_vendor ON material_allocations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_material_allocations_status ON material_allocations(status);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company_name);

-- RLS: Shared workspace policies matching existing tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_categories ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','production_orders','material_allocations','bom_categories'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "shared_select_%s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "shared_insert_%s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "shared_update_%s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "shared_delete_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "shared_select_%s" ON %I FOR SELECT TO anon, authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "shared_insert_%s" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "shared_update_%s" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "shared_delete_%s" ON %I FOR DELETE TO anon, authenticated USING (true)', t, t);
  END LOOP;
END $$;

-- CRITICAL FIX: Ensure suppliers table has UPDATE policy (missing in initial setup.sql)
DROP POLICY IF EXISTS "shared_update_suppliers" ON suppliers;
CREATE POLICY "shared_update_suppliers" ON suppliers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Auto-generate robust, year-scoped order number sequence (PO-YYYY-XXX) with advisory locking
CREATE OR REPLACE FUNCTION generate_order_no() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_year text;
  next_no integer;
BEGIN
  current_year := TO_CHAR(NOW(), 'YYYY');

  -- Transaction-scoped advisory lock serializes concurrent order creation without blocking reads
  PERFORM pg_advisory_xact_lock(hashtext('production_orders_seq_' || current_year));

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(order_no, '^PO-[0-9]{4}-([0-9]+)$', '\1'), order_no)::integer
  ), 0) + 1
  INTO next_no
  FROM production_orders
  WHERE order_no LIKE 'PO-' || current_year || '-%';

  NEW.order_no := 'PO-' || current_year || '-' || LPAD(next_no::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_no ON production_orders;
CREATE TRIGGER set_order_no
  BEFORE INSERT ON production_orders
  FOR EACH ROW
  WHEN (NEW.order_no IS NULL OR NEW.order_no = '')
  EXECUTE FUNCTION generate_order_no();

-- ATOMIC RPC: Create production order + seed all 10 default BOM allocations in 1 transaction
-- Uses SECURITY INVOKER to operate within caller's RLS permissions (least-privilege)
CREATE OR REPLACE FUNCTION create_production_order_with_allocations(
  p_client_id uuid,
  p_product_name text,
  p_variants jsonb DEFAULT '[]'::jsonb,
  p_total_qty integer DEFAULT 0,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS production_orders LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_order production_orders;
  v_cat RECORD;
BEGIN
  INSERT INTO production_orders (client_id, product_name, variants, total_qty, due_date, notes)
  VALUES (p_client_id, p_product_name, p_variants, p_total_qty, p_due_date, p_notes)
  RETURNING * INTO v_order;

  FOR v_cat IN SELECT name, sort_order FROM bom_categories ORDER BY sort_order ASC LOOP
    INSERT INTO material_allocations (order_id, component_name, sort_order, source, status)
    VALUES (v_order.id, v_cat.name, v_cat.sort_order, 'vendor', 'pending');
  END LOOP;

  RETURN v_order;
END;
$$;

-- ATOMIC RPC: Repeat Order (clone order + all allocations with status reset to pending)
-- Uses SECURITY INVOKER to operate within caller's RLS permissions (least-privilege)
CREATE OR REPLACE FUNCTION repeat_production_order(
  p_source_order_id uuid
) RETURNS production_orders LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_source production_orders;
  v_new_order production_orders;
  v_alloc RECORD;
BEGIN
  SELECT * INTO v_source FROM production_orders WHERE id = p_source_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source production order not found';
  END IF;

  INSERT INTO production_orders (client_id, product_name, variants, total_qty, due_date, notes)
  VALUES (v_source.client_id, v_source.product_name, v_source.variants, v_source.total_qty, NULL, 'Cloned from ' || v_source.order_no)
  RETURNING * INTO v_new_order;

  FOR v_alloc IN SELECT * FROM material_allocations WHERE order_id = p_source_order_id ORDER BY sort_order ASC LOOP
    INSERT INTO material_allocations (
      order_id, component_name, sort_order, source, description, vendor_id, stock_item_id, timeline, status, remarks
    ) VALUES (
      v_new_order.id, v_alloc.component_name, v_alloc.sort_order, v_alloc.source, v_alloc.description, v_alloc.vendor_id, v_alloc.stock_item_id, NULL, 'pending', v_alloc.remarks
    );
  END LOOP;

  RETURN v_new_order;
END;
$$;

-- Explicit RPC execution grants for anon and authenticated roles
GRANT EXECUTE ON FUNCTION create_production_order_with_allocations TO anon, authenticated;
GRANT EXECUTE ON FUNCTION repeat_production_order TO anon, authenticated;
