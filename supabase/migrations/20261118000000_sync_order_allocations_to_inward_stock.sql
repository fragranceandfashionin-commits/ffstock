-- ============================================================
-- Migration: 20261118000000_sync_order_allocations_to_inward_stock.sql
-- Description: Complete production synchronization between Production Order BOM
--              allocations, Inward Batches (Stage 1 Raw Stock), and Component
--              Receipts with full bidirectional reversibility, zero phantom stock,
--              bulletproof pristine batch matching, and enriched bulk operations.
-- Version: Plan v14 Definitive Production Blueprint
-- ============================================================

-- ============================================================
-- 1. EXTEND material_allocations TABLE & CHECK CONSTRAINTS
-- ============================================================
ALTER TABLE material_allocations
  ADD COLUMN IF NOT EXISTS qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_received integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS inward_batch_id uuid REFERENCES inward_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_id uuid REFERENCES item_stock_receipts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location text DEFAULT 'Raw Stock Bay A';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'material_allocations_qty_check'
  ) THEN
    ALTER TABLE material_allocations ADD CONSTRAINT material_allocations_qty_check CHECK (qty >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'material_allocations_qty_received_check'
  ) THEN
    ALTER TABLE material_allocations ADD CONSTRAINT material_allocations_qty_received_check CHECK (qty_received IS NULL OR qty_received > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_material_allocations_inward_batch ON material_allocations(inward_batch_id);
CREATE INDEX IF NOT EXISTS idx_material_allocations_receipt ON material_allocations(receipt_id);
CREATE INDEX IF NOT EXISTS idx_material_allocations_stock_item ON material_allocations(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_material_allocations_received_at ON material_allocations(received_at DESC);

-- ============================================================
-- 2. EXTEND inward_batches & item_stock_receipts WITH BACKLINKS
-- ============================================================
ALTER TABLE inward_batches
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES production_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allocation_id uuid REFERENCES material_allocations(id) ON DELETE SET NULL;

ALTER TABLE item_stock_receipts
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES production_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allocation_id uuid REFERENCES material_allocations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inward_batches_order ON inward_batches(order_id);
CREATE INDEX IF NOT EXISTS idx_inward_batches_allocation ON inward_batches(allocation_id);
CREATE INDEX IF NOT EXISTS idx_item_stock_receipts_order ON item_stock_receipts(order_id);
CREATE INDEX IF NOT EXISTS idx_item_stock_receipts_allocation ON item_stock_receipts(allocation_id);

-- Safe idempotent insertion of 'In-House / Internal Stock' supplier
INSERT INTO suppliers (name, contact)
SELECT 'In-House / Internal Stock', 'Factory Inventory'
WHERE NOT EXISTS (
  SELECT 1 FROM suppliers WHERE name ILIKE 'In-House / Internal Stock' OR name ILIKE '%Internal Stock%'
);

-- DATA BACKFILL 1: Seed existing allocations with planned order quantity
UPDATE material_allocations ma
SET qty = po.total_qty
FROM production_orders po
WHERE ma.order_id = po.id AND (ma.qty IS NULL OR ma.qty = 0);

-- DATA BACKFILL 2: Backfill qty_received on pre-existing received allocations
UPDATE material_allocations ma
SET qty_received = COALESCE(NULLIF(ma.qty, 0), po.total_qty, 1)
FROM production_orders po
WHERE ma.order_id = po.id AND ma.status = 'received' AND ma.qty_received IS NULL;

-- DATA BACKFILL 3: Backfill order_id on historical item_stock_receipts matching invoice_no
UPDATE item_stock_receipts isr
SET order_id = po.id
FROM production_orders po
WHERE isr.invoice_no = po.order_no AND isr.order_id IS NULL;

-- DATA BACKFILL 4: Backfill inward_batches.order_id and allocation_id from material_allocations
UPDATE inward_batches ib
SET order_id = ma.order_id, allocation_id = ma.id
FROM material_allocations ma
WHERE ma.inward_batch_id = ib.id AND ib.order_id IS NULL;

-- DATA BACKFILL 5: Eliminate phantom stock on batches with attached component SKUs
UPDATE inward_batches
SET
  cap_qty = COALESCE(cap_qty, 0),
  atomizer_qty = COALESCE(atomizer_qty, 0),
  box_qty = COALESCE(box_qty, 0)
WHERE (order_id IS NOT NULL OR allocation_id IS NOT NULL OR cap_item_id IS NOT NULL OR atomizer_item_id IS NOT NULL OR box_item_id IS NOT NULL)
  AND (cap_qty IS NULL OR atomizer_qty IS NULL OR box_qty IS NULL);

-- ============================================================
-- 3. TRIGGER: PREVENT DIRECT DELETION OF RECEIVED ALLOCATIONS
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_received_allocation_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'received' OR OLD.inward_batch_id IS NOT NULL OR OLD.receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete BOM allocation % for %: it has already been received into inventory. Revert the allocation to pending first before deleting.',
      OLD.id, OLD.component_name;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_received_allocation_delete_trigger ON material_allocations;
CREATE TRIGGER prevent_received_allocation_delete_trigger
  BEFORE DELETE ON material_allocations
  FOR EACH ROW EXECUTE FUNCTION prevent_received_allocation_delete();

-- ============================================================
-- 4. TRIGGER: allow_unconsumed_receipt_delete ON item_stock_receipts
-- Uses session context guard 'app.reverting_allocation' to eliminate reversal deadlocks.
-- ============================================================
CREATE OR REPLACE FUNCTION allow_unconsumed_receipt_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_available_stock integer;
  v_is_reverting boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Stock receipt details cannot be edited. Record an adjustment entry instead.';
  END IF;

  -- Check if deletion is part of an authorized atomic reversal RPC
  v_is_reverting := (current_setting('app.reverting_allocation', true) = 'true');

  -- If NOT reverting via RPC, strictly guard against manual/external SQL deletions
  IF NOT v_is_reverting THEN
    IF EXISTS (
      SELECT 1 FROM material_allocations
      WHERE receipt_id = OLD.id AND status = 'received'
    ) OR (
      OLD.allocation_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM material_allocations
        WHERE id = OLD.allocation_id AND status = 'received'
      )
    ) THEN
      RAISE EXCEPTION 'Cannot delete stock receipt: it is actively linked to a Production Order BOM allocation. Revert the allocation in the Order/Vendor portal instead.';
    END IF;
  END IF;

  -- If receipt was created from a material allocation, verify downstream consumption
  IF OLD.allocation_id IS NOT NULL 
     OR OLD.order_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM material_allocations WHERE receipt_id = OLD.id) THEN
    
    SELECT COALESCE(available_stock, 0) INTO v_available_stock
    FROM v_component_stock
    WHERE item_id = OLD.item_id;

    v_available_stock := COALESCE(v_available_stock, 0);

    IF v_available_stock < OLD.qty THEN
      RAISE EXCEPTION 'Cannot delete stock receipt: % units of item % have already been consumed in factory production.',
        (OLD.qty - v_available_stock), OLD.item_id;
    END IF;

    RETURN OLD;
  END IF;

  -- For direct manual receipts with no order connection, reject deletion
  RAISE EXCEPTION 'Manual inventory stock receipts cannot be deleted. Record a reversal or scrap entry instead.';
END;
$$;

DROP TRIGGER IF EXISTS prevent_ledger_mutation_item_stock_receipts ON item_stock_receipts;
DROP TRIGGER IF EXISTS allow_unconsumed_receipt_delete_trigger ON item_stock_receipts;
CREATE TRIGGER allow_unconsumed_receipt_delete_trigger
  BEFORE UPDATE OR DELETE ON item_stock_receipts
  FOR EACH ROW EXECUTE FUNCTION allow_unconsumed_receipt_delete();

-- ============================================================
-- 5. UPGRADE allow_empty_batch_delete ON inward_batches
-- Uses session context guard 'app.reverting_allocation' to eliminate reversal deadlocks.
-- ============================================================
CREATE OR REPLACE FUNCTION allow_empty_batch_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_reverting boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Prevent altering immutable financial and intake ledger columns
    IF NEW.qty_received <> OLD.qty_received
       OR NEW.item_id <> OLD.item_id
       OR NEW.supplier_id <> OLD.supplier_id
       OR NEW.received_on <> OLD.received_on
       OR NEW.id <> OLD.id THEN
      RAISE EXCEPTION 'Core batch ledger quantities, item, supplier, and received date cannot be edited. The batch is the source of truth for its intake quantity.';
    END IF;
    -- Non-financial metadata updates are permitted
    RETURN NEW;
  END IF;

  -- Check if deletion is part of an authorized atomic reversal RPC
  v_is_reverting := (current_setting('app.reverting_allocation', true) = 'true');

  -- DELETE: Block if batch has moved, been dispatched, or has inter-batch allocations
  IF EXISTS (SELECT 1 FROM stage_movements sm WHERE sm.batch_id = OLD.id)
     OR EXISTS (SELECT 1 FROM dispatches d WHERE d.batch_id = OLD.id)
     OR EXISTS (SELECT 1 FROM batch_allocations ba WHERE ba.source_batch_id = OLD.id OR ba.destination_batch_id = OLD.id) THEN
    RAISE EXCEPTION 'This batch has movements, dispatches, or allocation history and cannot be deleted. The ledger keeps history — record a reversal entry instead.';
  END IF;

  -- If NOT reverting via RPC, strictly guard against manual/external SQL deletions
  IF NOT v_is_reverting THEN
    IF EXISTS (
      SELECT 1 FROM material_allocations
      WHERE inward_batch_id = OLD.id AND status = 'received'
    ) OR (
      OLD.allocation_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM material_allocations
        WHERE id = OLD.allocation_id AND status = 'received'
      )
    ) THEN
      RAISE EXCEPTION 'Cannot delete batch %: it is actively linked to a Production Order BOM allocation. Revert the allocation in the Order/Vendor portal instead.',
        OLD.batch_no;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS allow_empty_batch_delete_inward_batches ON inward_batches;
CREATE TRIGGER allow_empty_batch_delete_inward_batches
  BEFORE UPDATE OR DELETE ON inward_batches
  FOR EACH ROW EXECUTE FUNCTION allow_empty_batch_delete();

-- ============================================================
-- 6. ORDER CREATION & CLONING RPCs (SECURITY DEFINER for Terminal Access)
-- ============================================================
CREATE OR REPLACE FUNCTION create_production_order_with_allocations(
  p_client_id uuid,
  p_product_name text,
  p_variants jsonb DEFAULT '[]'::jsonb,
  p_total_qty integer DEFAULT 0,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS production_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_order production_orders;
  v_cat RECORD;
BEGIN
  INSERT INTO production_orders (client_id, product_name, variants, total_qty, due_date, notes)
  VALUES (p_client_id, p_product_name, p_variants, p_total_qty, p_due_date, p_notes)
  RETURNING * INTO v_order;

  FOR v_cat IN SELECT name, sort_order FROM bom_categories ORDER BY sort_order ASC LOOP
    INSERT INTO material_allocations (order_id, component_name, sort_order, source, status, qty)
    VALUES (v_order.id, v_cat.name, v_cat.sort_order, 'vendor', 'pending', COALESCE(p_total_qty, 0));
  END LOOP;

  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION repeat_production_order(
  p_source_order_id uuid
) RETURNS production_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
      order_id, component_name, sort_order, source, description, vendor_id, stock_item_id, timeline, status, remarks, qty
    ) VALUES (
      v_new_order.id, v_alloc.component_name, v_alloc.sort_order, v_alloc.source, v_alloc.description, v_alloc.vendor_id, v_alloc.stock_item_id, NULL, 'pending', v_alloc.remarks, COALESCE(v_alloc.qty, v_source.total_qty)
    );
  END LOOP;

  RETURN v_new_order;
END;
$$;

GRANT EXECUTE ON FUNCTION create_production_order_with_allocations TO anon, authenticated;
GRANT EXECUTE ON FUNCTION repeat_production_order TO anon, authenticated;

-- ============================================================
-- 7. ATOMIC INWARD INTAKE RPC (receive_material_allocation_rpc)
-- ============================================================
CREATE OR REPLACE FUNCTION receive_material_allocation_rpc(
  p_allocation_id uuid,
  p_stock_item_id uuid DEFAULT NULL,
  p_qty_received integer DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_received_on date DEFAULT CURRENT_DATE,
  p_batch_no text DEFAULT NULL,
  p_inward_batch_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_alloc material_allocations;
  v_order production_orders;
  v_client clients;
  v_target_item_id uuid := p_stock_item_id;
  v_target_vendor_id uuid := p_vendor_id;
  v_item items;
  v_effective_qty integer;
  v_effective_location text;
  v_inward_batch_id uuid := p_inward_batch_id;
  v_receipt_id uuid := NULL;
  v_generated_batch_no text := p_batch_no;
  v_current_year text;
  v_next_no integer;
  v_all_received boolean;
  v_is_bottle boolean := false;
  v_is_service boolean := false;
  v_internal_supplier_id uuid;
  v_stock_avail integer := 0;
  v_stock_warning text := NULL;
  -- BOM attachment helpers
  v_cap_id uuid;
  v_atomizer_id uuid;
  v_box_id uuid;
BEGIN
  -- 1. Pessimistic Row Lock on Allocation
  SELECT * INTO v_alloc FROM material_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material allocation record % not found', p_allocation_id;
  END IF;

  -- Idempotency check
  IF v_alloc.status = 'received' THEN
    IF v_alloc.inward_batch_id IS NOT NULL THEN
      SELECT batch_no INTO v_generated_batch_no FROM inward_batches WHERE id = v_alloc.inward_batch_id;
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'already_received', true,
      'message', 'Allocation is already marked as received',
      'allocation_id', v_alloc.id,
      'inward_batch_id', v_alloc.inward_batch_id,
      'batch_no', v_generated_batch_no,
      'receipt_id', v_alloc.receipt_id
    );
  END IF;

  -- 2. Fetch Order and Client Details + Guard Finalized Orders
  SELECT * INTO v_order FROM production_orders WHERE id = v_alloc.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated production order % not found', v_alloc.order_id;
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot modify allocations for Order % because it is already %.',
      v_order.order_no, v_order.status;
  END IF;

  SELECT * INTO v_client FROM clients WHERE id = v_order.client_id;

  -- 3. Resolve Effective Quantity and Location (Preserving custom bay if not passed)
  v_effective_qty := COALESCE(p_qty_received, NULLIF(v_alloc.qty, 0), NULLIF(v_order.total_qty, 0), 1);
  IF v_effective_qty <= 0 THEN
    v_effective_qty := 1;
  END IF;

  v_effective_location := COALESCE(NULLIF(TRIM(p_location), ''), NULLIF(TRIM(v_alloc.location), ''), 'Raw Stock Bay A');

  -- 4. Hybrid Service Milestone Detection
  IF LOWER(v_alloc.component_name) ~* '(printing|coating|stamping|metalliz|emboss)' THEN
    IF v_target_item_id IS NULL THEN
      v_target_item_id := v_alloc.stock_item_id;
    END IF;

    IF v_target_item_id IS NOT NULL THEN
      SELECT * INTO v_item FROM items WHERE id = v_target_item_id;
      IF LOWER(COALESCE(v_item.category, '')) IN ('service', 'labor', 'milestone') THEN
        v_is_service := true;
      ELSE
        v_is_service := false;
      END IF;
    ELSE
      v_is_service := true;
    END IF;
  END IF;

  -- 5. Resolve Physical SKU if not a pure service milestone
  IF NOT v_is_service THEN
    IF v_target_item_id IS NULL THEN
      v_target_item_id := v_alloc.stock_item_id;
    END IF;

    IF v_target_item_id IS NULL AND v_alloc.description IS NOT NULL AND TRIM(v_alloc.description) <> '' THEN
      SELECT id INTO v_target_item_id FROM items WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_alloc.description)) LIMIT 1;
    END IF;

    IF v_target_item_id IS NULL THEN
      SELECT id INTO v_target_item_id FROM items WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_alloc.component_name)) LIMIT 1;
    END IF;

    IF v_target_item_id IS NOT NULL THEN
      SELECT * INTO v_item FROM items WHERE id = v_target_item_id;
      IF LOWER(COALESCE(v_item.category, '')) LIKE '%bottle%' 
         OR LOWER(COALESCE(v_item.category, '')) LIKE '%glass%' 
         OR LOWER(v_alloc.component_name) LIKE '%bottle%' THEN
        v_is_bottle := true;
      END IF;
    ELSE
      IF LOWER(v_alloc.component_name) LIKE '%bottle%' THEN
        v_is_bottle := true;
        RAISE EXCEPTION 'SKU_REQUIRED: Please select a Glass Bottle SKU before inwarding bottles for %', v_order.order_no;
      ELSE
        RAISE EXCEPTION 'SKU_REQUIRED: Please select or link an inventory SKU for % (Order %)', v_alloc.component_name, v_order.order_no;
      END IF;
    END IF;
  END IF;

  -- Resolve Internal Supplier ID for In-House operations
  SELECT id INTO v_internal_supplier_id FROM suppliers WHERE name ILIKE '%Internal%' OR name ILIKE '%In-House%' LIMIT 1;
  IF v_internal_supplier_id IS NULL THEN
    SELECT id INTO v_internal_supplier_id FROM suppliers ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Pre-fetch any already configured BOM components for this order
  SELECT stock_item_id INTO v_cap_id FROM material_allocations
  WHERE order_id = v_order.id AND LOWER(component_name) LIKE '%cap%' AND stock_item_id IS NOT NULL LIMIT 1;

  SELECT stock_item_id INTO v_atomizer_id FROM material_allocations
  WHERE order_id = v_order.id AND (LOWER(component_name) LIKE '%atomizer%' OR LOWER(component_name) LIKE '%pump%') AND stock_item_id IS NOT NULL LIMIT 1;

  SELECT stock_item_id INTO v_box_id FROM material_allocations
  WHERE order_id = v_order.id AND (LOWER(component_name) LIKE '%box%' OR LOWER(component_name) LIKE '%packaging%') AND stock_item_id IS NOT NULL LIMIT 1;

  -- 6. Route Execution Based on Sourcing Mode (vendor vs stock)
  IF v_alloc.source = 'stock' THEN
    -- ========================================================
    -- IN-HOUSE WAREHOUSE ALLOCATION (source = 'stock')
    -- ========================================================
    IF v_is_bottle THEN
      -- Auto-find pristine unassigned batch matching item and brand, with zero movements/allocations
      IF v_inward_batch_id IS NULL AND v_target_item_id IS NOT NULL THEN
        SELECT ib.id INTO v_inward_batch_id
        FROM inward_batches ib
        WHERE ib.item_id = v_target_item_id
          AND (ib.order_id IS NULL OR ib.order_id = v_order.id)
          AND (ib.brand_name IS NULL OR TRIM(ib.brand_name) = '' OR LOWER(TRIM(ib.brand_name)) = LOWER(TRIM(COALESCE(v_client.name, ''))))
          AND NOT EXISTS (SELECT 1 FROM stage_movements sm WHERE sm.batch_id = ib.id)
          AND NOT EXISTS (SELECT 1 FROM dispatches d WHERE d.batch_id = ib.id)
          AND NOT EXISTS (SELECT 1 FROM batch_allocations ba WHERE ba.source_batch_id = ib.id OR ba.destination_batch_id = ib.id)
        ORDER BY 
          CASE WHEN LOWER(TRIM(COALESCE(ib.brand_name, ''))) = LOWER(TRIM(COALESCE(v_client.name, ''))) THEN 0 ELSE 1 END,
          ib.received_on ASC
        LIMIT 1;
      END IF;

      IF v_inward_batch_id IS NOT NULL THEN
        -- Guard against stealing an existing batch assigned to another order
        IF EXISTS (
          SELECT 1 FROM inward_batches
          WHERE id = v_inward_batch_id
            AND order_id IS NOT NULL
            AND order_id <> v_order.id
        ) THEN
          RAISE EXCEPTION 'Batch is already assigned to another production order. Please choose an unassigned batch or perform an inter-batch stock allocation.';
        END IF;

        -- Plan v14 Fix: Auto-attach configured order component SKUs when linking existing pristine batch!
        UPDATE inward_batches
        SET
          order_id = v_order.id,
          allocation_id = v_alloc.id,
          cap_item_id = COALESCE(v_cap_id, cap_item_id),
          atomizer_item_id = COALESCE(v_atomizer_id, atomizer_item_id),
          box_item_id = COALESCE(v_box_id, box_item_id)
        WHERE id = v_inward_batch_id;

        SELECT batch_no INTO v_generated_batch_no FROM inward_batches WHERE id = v_inward_batch_id;
      ELSE
        -- No unassigned pristine raw batch exists: automatically create an In-House Inward Batch
        v_current_year := TO_CHAR(NOW(), 'YYYY');
        PERFORM pg_advisory_xact_lock(14022026, v_current_year::integer);

        SELECT COALESCE(MAX(
          NULLIF(regexp_replace(batch_no, '^BAT-[0-9]{4}-([0-9]+)$', '\1'), batch_no)::integer
        ), 0) + 1
        INTO v_next_no
        FROM inward_batches
        WHERE batch_no LIKE 'BAT-' || v_current_year || '-%';

        v_generated_batch_no := 'BAT-' || v_current_year || '-' || LPAD(v_next_no::text, 3, '0');

        WHILE EXISTS (SELECT 1 FROM inward_batches WHERE batch_no = v_generated_batch_no) LOOP
          v_next_no := v_next_no + 1;
          v_generated_batch_no := 'BAT-' || v_current_year || '-' || LPAD(v_next_no::text, 3, '0');
        END LOOP;

        INSERT INTO inward_batches (
          batch_no, brand_name, supplier_id, item_id, received_on, qty_received, location, color,
          cap_item_id, atomizer_item_id, box_item_id, cap_qty, atomizer_qty, box_qty, order_id, allocation_id
        ) VALUES (
          v_generated_batch_no,
          COALESCE(v_client.name, 'Client Order'),
          v_internal_supplier_id,
          v_target_item_id,
          COALESCE(p_received_on, CURRENT_DATE),
          v_effective_qty,
          v_effective_location,
          v_item.color,
          v_cap_id,
          v_atomizer_id,
          v_box_id,
          0, 0, 0,
          v_order.id,
          v_alloc.id
        ) RETURNING id INTO v_inward_batch_id;

        -- Check warehouse component stock deficit
        SELECT COALESCE(available_stock, 0) INTO v_stock_avail
        FROM v_component_stock
        WHERE item_id = v_target_item_id;

        IF v_stock_avail < v_effective_qty THEN
          v_stock_warning := format('Low stock warning: %s units available in warehouse, allocated %s units for %s.',
            v_stock_avail, v_effective_qty, v_alloc.component_name);
        END IF;
      END IF;

    ELSIF NOT v_is_service AND v_target_item_id IS NOT NULL THEN
      -- Verify physical component stock in warehouse
      SELECT COALESCE(available_stock, 0) INTO v_stock_avail
      FROM v_component_stock
      WHERE item_id = v_target_item_id;

      v_stock_avail := COALESCE(v_stock_avail, 0);

      IF v_stock_avail < v_effective_qty THEN
        v_stock_warning := format('Low stock warning: %s units available, allocated %s units for %s.',
          v_stock_avail, v_effective_qty, v_alloc.component_name);
      END IF;
    END IF;

  ELSIF v_alloc.source = 'vendor' THEN
    -- ========================================================
    -- PHYSICAL VENDOR SHIPMENT INTAKE (source = 'vendor')
    -- ========================================================
    IF v_target_vendor_id IS NULL THEN
      v_target_vendor_id := v_alloc.vendor_id;
    END IF;

    IF v_target_vendor_id IS NULL THEN
      v_target_vendor_id := v_internal_supplier_id;
    END IF;

    IF v_is_bottle THEN
      -- A. BOTTLES: Inward Batch into Stage 1 Raw Stock
      IF v_generated_batch_no IS NULL OR TRIM(v_generated_batch_no) = '' THEN
        v_current_year := TO_CHAR(NOW(), 'YYYY');
        PERFORM pg_advisory_xact_lock(14022026, v_current_year::integer);

        SELECT COALESCE(MAX(
          NULLIF(regexp_replace(batch_no, '^BAT-[0-9]{4}-([0-9]+)$', '\1'), batch_no)::integer
        ), 0) + 1
        INTO v_next_no
        FROM inward_batches
        WHERE batch_no LIKE 'BAT-' || v_current_year || '-%';

        v_generated_batch_no := 'BAT-' || v_current_year || '-' || LPAD(v_next_no::text, 3, '0');

        WHILE EXISTS (SELECT 1 FROM inward_batches WHERE batch_no = v_generated_batch_no) LOOP
          v_next_no := v_next_no + 1;
          v_generated_batch_no := 'BAT-' || v_current_year || '-' || LPAD(v_next_no::text, 3, '0');
        END LOOP;
      END IF;

      INSERT INTO inward_batches (
        batch_no, brand_name, supplier_id, item_id, received_on, qty_received, location, color,
        cap_item_id, atomizer_item_id, box_item_id, cap_qty, atomizer_qty, box_qty, order_id, allocation_id
      ) VALUES (
        v_generated_batch_no,
        COALESCE(v_client.name, 'Client Order'),
        v_target_vendor_id,
        v_target_item_id,
        COALESCE(p_received_on, CURRENT_DATE),
        v_effective_qty,
        v_effective_location,
        v_item.color,
        v_cap_id,
        v_atomizer_id,
        v_box_id,
        0, 0, 0,
        v_order.id,
        v_alloc.id
      ) RETURNING id INTO v_inward_batch_id;

    ELSIF NOT v_is_service AND v_target_item_id IS NOT NULL THEN
      -- B. PHYSICAL COMPONENTS (Caps, Atomizers, Boxes, Labels, Fragrance Oils, Raw Materials)
      INSERT INTO item_stock_receipts (
        item_id, supplier_id, qty, received_on, invoice_no, location, remarks, order_id, allocation_id
      ) VALUES (
        v_target_item_id,
        v_target_vendor_id,
        v_effective_qty,
        COALESCE(p_received_on, CURRENT_DATE),
        v_order.order_no,
        v_effective_location,
        'Order ' || v_order.order_no || ' (' || v_alloc.component_name || ')',
        v_order.id,
        v_alloc.id
      ) RETURNING id INTO v_receipt_id;
    END IF;
  END IF;

  -- 7. Universal Forward Auto-Sync
  IF NOT v_is_service AND v_target_item_id IS NOT NULL AND NOT v_is_bottle THEN
    IF LOWER(v_alloc.component_name) LIKE '%cap%' THEN
      UPDATE inward_batches
      SET cap_item_id = v_target_item_id, cap_qty = 0
      WHERE order_id = v_order.id;
    ELSIF LOWER(v_alloc.component_name) LIKE '%atomizer%' OR LOWER(v_alloc.component_name) LIKE '%pump%' THEN
      UPDATE inward_batches
      SET atomizer_item_id = v_target_item_id, atomizer_qty = 0
      WHERE order_id = v_order.id;
    ELSIF LOWER(v_alloc.component_name) LIKE '%box%' OR LOWER(v_alloc.component_name) LIKE '%packaging%' THEN
      UPDATE inward_batches
      SET box_item_id = v_target_item_id, box_qty = 0
      WHERE order_id = v_order.id;
    END IF;
  END IF;

  -- 8. Update Allocation Record (Preserving planned qty!)
  UPDATE material_allocations
  SET
    status = 'received',
    received_at = NOW(),
    qty = CASE WHEN COALESCE(v_alloc.qty, 0) > 0 THEN v_alloc.qty ELSE v_effective_qty END,
    qty_received = v_effective_qty,
    vendor_id = COALESCE(v_target_vendor_id, vendor_id),
    stock_item_id = COALESCE(v_target_item_id, stock_item_id),
    inward_batch_id = v_inward_batch_id,
    receipt_id = v_receipt_id,
    location = v_effective_location
  WHERE id = v_alloc.id;

  -- 9. Order Lifecycle Progression
  SELECT (COUNT(*) = 0) INTO v_all_received
  FROM material_allocations
  WHERE order_id = v_order.id AND status = 'pending';

  IF v_all_received AND v_order.status = 'planning' THEN
    UPDATE production_orders
    SET status = 'in_progress'
    WHERE id = v_order.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'allocation_id', v_alloc.id,
    'component_name', v_alloc.component_name,
    'source', v_alloc.source,
    'qty_received', v_effective_qty,
    'inward_batch_id', v_inward_batch_id,
    'batch_no', v_generated_batch_no,
    'receipt_id', v_receipt_id,
    'stock_warning', v_stock_warning,
    'order_status', CASE WHEN v_all_received AND v_order.status = 'planning' THEN 'in_progress' ELSE v_order.status END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION receive_material_allocation_rpc TO anon, authenticated;

-- ============================================================
-- 8. ATOMIC REVERSAL RPC (revert_material_allocation_rpc)
-- ============================================================
CREATE OR REPLACE FUNCTION revert_material_allocation_rpc(
  p_allocation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_alloc material_allocations;
  v_order production_orders;
  v_movement_count integer := 0;
  v_dispatch_count integer := 0;
  v_alloc_history_count integer := 0;
  v_batch_no text;
  v_available_stock integer;
  v_has_active_batches boolean := false;
  v_batch_to_delete uuid := NULL;
  v_receipt_to_delete uuid := NULL;
  v_batch_created_by_alloc boolean := false;
BEGIN
  -- 1. Pessimistic Lock
  SELECT * INTO v_alloc FROM material_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation record % not found', p_allocation_id;
  END IF;

  IF v_alloc.status = 'pending' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Allocation is already pending');
  END IF;

  SELECT * INTO v_order FROM production_orders WHERE id = v_alloc.order_id;
  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot revert allocations for Order % because it is already %.',
      v_order.order_no, v_order.status;
  END IF;

  -- 2. Guard: Check Batch Movement, Dispatches & Allocations in Factory Pipeline
  IF v_alloc.inward_batch_id IS NOT NULL THEN
    SELECT batch_no INTO v_batch_no FROM inward_batches WHERE id = v_alloc.inward_batch_id;
    SELECT COUNT(*) INTO v_movement_count FROM stage_movements WHERE batch_id = v_alloc.inward_batch_id;
    SELECT COUNT(*) INTO v_dispatch_count FROM dispatches WHERE batch_id = v_alloc.inward_batch_id;
    SELECT COUNT(*) INTO v_alloc_history_count FROM batch_allocations WHERE source_batch_id = v_alloc.inward_batch_id OR destination_batch_id = v_alloc.inward_batch_id;

    IF v_movement_count > 0 THEN
      RAISE EXCEPTION 'Cannot revert allocation: Inward Batch "%" has already undergone % stage movement(s) in factory production.',
        v_batch_no, v_movement_count;
    END IF;

    IF v_dispatch_count > 0 THEN
      RAISE EXCEPTION 'Cannot revert allocation: Inward Batch "%" has already been dispatched (% dispatch records).',
        v_batch_no, v_dispatch_count;
    END IF;

    IF v_alloc_history_count > 0 THEN
      RAISE EXCEPTION 'Cannot revert allocation: Inward Batch "%" has inter-batch stock allocation history.',
        v_batch_no;
    END IF;

    SELECT (allocation_id = v_alloc.id) INTO v_batch_created_by_alloc
    FROM inward_batches
    WHERE id = v_alloc.inward_batch_id;

    IF v_batch_created_by_alloc THEN
      v_batch_to_delete := v_alloc.inward_batch_id;
    ELSE
      -- Plan v14 Fix: Cleanly unlink from order AND clear attached order components!
      UPDATE inward_batches
      SET
        order_id = NULL,
        allocation_id = NULL,
        cap_item_id = NULL,
        atomizer_item_id = NULL,
        box_item_id = NULL
      WHERE id = v_alloc.inward_batch_id;
    END IF;
  END IF;

  -- 3. Guard: Check Component Consumption in Factory Production
  IF v_alloc.receipt_id IS NOT NULL THEN
    IF v_alloc.stock_item_id IS NOT NULL THEN
      SELECT COALESCE(available_stock, 0) INTO v_available_stock
      FROM v_component_stock
      WHERE item_id = v_alloc.stock_item_id;

      v_available_stock := COALESCE(v_available_stock, 0);

      IF v_available_stock < COALESCE(v_alloc.qty_received, 1) THEN
        RAISE EXCEPTION 'Cannot revert allocation: % units of component "%" have already been consumed in factory production.',
          (COALESCE(v_alloc.qty_received, 1) - v_available_stock), v_alloc.component_name;
      END IF;
    END IF;

    v_receipt_to_delete := v_alloc.receipt_id;
  END IF;

  -- 4. Universal Symmetric SKU Detachment
  IF v_alloc.stock_item_id IS NOT NULL THEN
    IF LOWER(v_alloc.component_name) LIKE '%cap%' THEN
      UPDATE inward_batches
      SET cap_item_id = NULL
      WHERE order_id = v_order.id AND cap_item_id = v_alloc.stock_item_id;
    ELSIF LOWER(v_alloc.component_name) LIKE '%atomizer%' OR LOWER(v_alloc.component_name) LIKE '%pump%' THEN
      UPDATE inward_batches
      SET atomizer_item_id = NULL
      WHERE order_id = v_order.id AND atomizer_item_id = v_alloc.stock_item_id;
    ELSIF LOWER(v_alloc.component_name) LIKE '%box%' OR LOWER(v_alloc.component_name) LIKE '%packaging%' THEN
      UPDATE inward_batches
      SET box_item_id = NULL
      WHERE order_id = v_order.id AND box_item_id = v_alloc.stock_item_id;
    END IF;
  END IF;

  -- 5. Set Local Session Context Flag for Authorized Reversal
  PERFORM set_config('app.reverting_allocation', 'true', true);

  -- 6. Safely Delete Linked Batches and Receipts (Bypasses active-link trigger, enforces unconsumed check)
  IF v_batch_to_delete IS NOT NULL THEN
    UPDATE material_allocations SET inward_batch_id = NULL WHERE id = v_alloc.id;
    DELETE FROM inward_batches WHERE id = v_batch_to_delete;
  END IF;

  IF v_receipt_to_delete IS NOT NULL THEN
    UPDATE material_allocations SET receipt_id = NULL WHERE id = v_alloc.id;
    DELETE FROM item_stock_receipts WHERE id = v_receipt_to_delete;
  END IF;

  -- 7. Reset Allocation State to Pending
  UPDATE material_allocations
  SET
    status = 'pending',
    received_at = NULL,
    qty_received = NULL,
    inward_batch_id = NULL,
    receipt_id = NULL
  WHERE id = v_alloc.id;

  -- 8. Symmetric Lifecycle Reset
  IF v_order.status = 'in_progress' THEN
    SELECT EXISTS (
      SELECT 1 FROM inward_batches ib
      JOIN stage_movements sm ON sm.batch_id = ib.id
      WHERE ib.order_id = v_order.id
    ) INTO v_has_active_batches;

    IF NOT v_has_active_batches THEN
      UPDATE production_orders
      SET status = 'planning'
      WHERE id = v_order.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'allocation_id', v_alloc.id,
    'status', 'pending',
    'order_status', CASE WHEN NOT v_has_active_batches AND v_order.status = 'in_progress' THEN 'planning' ELSE v_order.status END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION revert_material_allocation_rpc TO anon, authenticated;

-- ============================================================
-- 9. HIGH-PERFORMANCE BATCH RECEIVE & REVERT RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION batch_receive_material_allocations_rpc(
  p_allocation_ids uuid[],
  p_location text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_alloc_id uuid;
  v_alloc material_allocations;
  v_order production_orders;
  v_result jsonb;
  v_success_count integer := 0;
  v_batch_numbers text[] := '{}';
  v_results jsonb[] := '{}';
BEGIN
  IF p_allocation_ids IS NULL OR array_length(p_allocation_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'received_count', 0,
      'batch_numbers', '[]'::jsonb,
      'allocations', '[]'::jsonb
    );
  END IF;

  FOREACH v_alloc_id IN ARRAY p_allocation_ids LOOP
    BEGIN
      v_result := receive_material_allocation_rpc(
        p_allocation_id := v_alloc_id,
        p_location := p_location
      );
      v_success_count := v_success_count + 1;
      v_results := array_append(v_results, v_result);
      IF v_result->>'batch_no' IS NOT NULL THEN
        v_batch_numbers := array_append(v_batch_numbers, v_result->>'batch_no');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      SELECT * INTO v_alloc FROM material_allocations WHERE id = v_alloc_id;
      SELECT * INTO v_order FROM production_orders WHERE id = v_alloc.order_id;
      RAISE EXCEPTION 'Failed processing "%" for Order %: %',
        COALESCE(v_alloc.component_name, 'Component'),
        COALESCE(v_order.order_no, 'N/A'),
        SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'received_count', v_success_count,
    'batch_numbers', to_jsonb(v_batch_numbers),
    'allocations', to_jsonb(v_results)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION batch_receive_material_allocations_rpc TO anon, authenticated;

CREATE OR REPLACE FUNCTION batch_revert_material_allocations_rpc(
  p_allocation_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_alloc_id uuid;
  v_alloc material_allocations;
  v_order production_orders;
  v_revert_count integer := 0;
BEGIN
  IF p_allocation_ids IS NULL OR array_length(p_allocation_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'reverted_count', 0
    );
  END IF;

  FOREACH v_alloc_id IN ARRAY p_allocation_ids LOOP
    BEGIN
      PERFORM revert_material_allocation_rpc(p_allocation_id := v_alloc_id);
      v_revert_count := v_revert_count + 1;
    EXCEPTION WHEN OTHERS THEN
      SELECT * INTO v_alloc FROM material_allocations WHERE id = v_alloc_id;
      SELECT * INTO v_order FROM production_orders WHERE id = v_alloc.order_id;
      RAISE EXCEPTION 'Failed reverting "%" for Order %: %',
        COALESCE(v_alloc.component_name, 'Component'),
        COALESCE(v_order.order_no, 'N/A'),
        SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'reverted_count', v_revert_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION batch_revert_material_allocations_rpc TO anon, authenticated;
