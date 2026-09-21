-- ============================================================
-- Migration: 20260922000000_implement_factory_rbac_and_ledger_protection.sql
-- Description:
--   1. Ledger immutability triggers on batch_allocations and item_stock_receipts
--   2. ON DELETE RESTRICT foreign key protection on item_stock_receipts
--   3. SKU compatibility enforcement in allocate_stock_between_batches RPC
--   4. Atomic reverse_batch_allocation RPC
--   5. Synchronized v_component_stock calculation for bottle warehouse stock
--   6. Factory RBAC user profiles table, operator transition verification, and role policies
-- ============================================================

-- 1. Enforce RESTRICT foreign key on item_stock_receipts
ALTER TABLE item_stock_receipts
  DROP CONSTRAINT IF EXISTS item_stock_receipts_item_id_fkey,
  ADD CONSTRAINT item_stock_receipts_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT;

-- 2. Ledger immutability triggers for batch_allocations and item_stock_receipts
DROP TRIGGER IF EXISTS prevent_ledger_mutation_batch_allocations ON batch_allocations;
CREATE TRIGGER prevent_ledger_mutation_batch_allocations
  BEFORE UPDATE OR DELETE ON batch_allocations
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

DROP TRIGGER IF EXISTS prevent_ledger_mutation_item_stock_receipts ON item_stock_receipts;
CREATE TRIGGER prevent_ledger_mutation_item_stock_receipts
  BEFORE UPDATE OR DELETE ON item_stock_receipts
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

-- 3. SKU compatibility check in allocate_stock_between_batches
CREATE OR REPLACE FUNCTION allocate_stock_between_batches(
  p_source_batch_id uuid,
  p_destination_batch_id uuid,
  p_qty integer,
  p_allocated_by text DEFAULT NULL,
  p_remarks text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_raw_stage_id uuid;
  v_source_available integer;
  v_dest_batch_no text;
  v_source_batch_no text;
  v_source_item_id uuid;
  v_dest_item_id uuid;
  v_allocation_id uuid;
  v_source_new_raw integer;
  v_dest_new_raw integer;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Allocation quantity must be greater than zero.';
  END IF;

  IF p_source_batch_id = p_destination_batch_id THEN
    RAISE EXCEPTION 'Source batch and destination batch cannot be the same.';
  END IF;

  -- Lock batches in deterministic order to prevent deadlocks
  IF p_source_batch_id < p_destination_batch_id THEN
    PERFORM 1 FROM inward_batches WHERE id = p_source_batch_id FOR UPDATE;
    PERFORM 1 FROM inward_batches WHERE id = p_destination_batch_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM inward_batches WHERE id = p_destination_batch_id FOR UPDATE;
    PERFORM 1 FROM inward_batches WHERE id = p_source_batch_id FOR UPDATE;
  END IF;

  SELECT batch_no, item_id INTO v_source_batch_no, v_source_item_id
  FROM inward_batches WHERE id = p_source_batch_id;
  IF v_source_batch_no IS NULL THEN
    RAISE EXCEPTION 'Source batch does not exist.';
  END IF;

  SELECT batch_no, item_id INTO v_dest_batch_no, v_dest_item_id
  FROM inward_batches WHERE id = p_destination_batch_id;
  IF v_dest_batch_no IS NULL THEN
    RAISE EXCEPTION 'Destination batch does not exist.';
  END IF;

  -- ENFORCE EXACT SKU COMPATIBILITY
  IF v_source_item_id <> v_dest_item_id THEN
    RAISE EXCEPTION 'Cannot allocate stock between batches of different items (Source Item: %, Dest Item: %)',
      v_source_item_id, v_dest_item_id;
  END IF;

  SELECT id INTO v_raw_stage_id FROM stages WHERE sequence_no = 1 OR name = 'Raw Stock' LIMIT 1;
  IF v_raw_stage_id IS NULL THEN
    RAISE EXCEPTION 'Raw Stock stage not found in stages catalog.';
  END IF;

  -- Calculate current source available raw stock
  SELECT
    ib.qty_received
    - COALESCE((SELECT SUM(ba.qty) FROM batch_allocations ba WHERE ba.source_batch_id = p_source_batch_id), 0)
    + COALESCE((SELECT SUM(ba.qty) FROM batch_allocations ba WHERE ba.destination_batch_id = p_source_batch_id), 0)
    - COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = p_source_batch_id AND sm.from_stage_id = v_raw_stage_id), 0)
    + COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = p_source_batch_id AND sm.to_stage_id = v_raw_stage_id), 0)
  INTO v_source_available
  FROM inward_batches ib
  WHERE ib.id = p_source_batch_id;

  IF v_source_available < p_qty THEN
    RAISE EXCEPTION 'Insufficient stock in source batch % (Available in Raw Stock: %, Requested: %)',
      v_source_batch_no, v_source_available, p_qty;
  END IF;

  -- Record allocation ledger entry
  INSERT INTO batch_allocations (
    source_batch_id,
    destination_batch_id,
    qty,
    allocation_type,
    item_id,
    allocated_on,
    allocated_by,
    remarks
  ) VALUES (
    p_source_batch_id,
    p_destination_batch_id,
    p_qty,
    'primary',
    v_source_item_id,
    CURRENT_DATE,
    COALESCE(p_allocated_by, 'Warehouse Operator'),
    p_remarks
  ) RETURNING id INTO v_allocation_id;

  -- Recompute balances
  SELECT
    ib.qty_received
    - COALESCE((SELECT SUM(ba.qty) FROM batch_allocations ba WHERE ba.source_batch_id = p_source_batch_id), 0)
    + COALESCE((SELECT SUM(ba.qty) FROM batch_allocations ba WHERE ba.destination_batch_id = p_source_batch_id), 0)
    - COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = p_source_batch_id AND sm.from_stage_id = v_raw_stage_id), 0)
    + COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = p_source_batch_id AND sm.to_stage_id = v_raw_stage_id), 0)
  INTO v_source_new_raw
  FROM inward_batches ib
  WHERE ib.id = p_source_batch_id;

  SELECT
    ib.qty_received
    - COALESCE((SELECT SUM(ba.qty) FROM batch_allocations ba WHERE ba.source_batch_id = p_destination_batch_id), 0)
    + COALESCE((SELECT SUM(ba.qty) FROM batch_allocations ba WHERE ba.destination_batch_id = p_destination_batch_id), 0)
    - COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = p_destination_batch_id AND sm.from_stage_id = v_raw_stage_id), 0)
    + COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = p_destination_batch_id AND sm.to_stage_id = v_raw_stage_id), 0)
  INTO v_dest_new_raw
  FROM inward_batches ib
  WHERE ib.id = p_destination_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'allocation_id', v_allocation_id,
    'allocated_qty', p_qty,
    'source_batch_id', p_source_batch_id,
    'source_batch_no', v_source_batch_no,
    'source_raw_stock', v_source_new_raw,
    'destination_batch_id', p_destination_batch_id,
    'destination_batch_no', v_dest_batch_no,
    'destination_raw_stock', v_dest_new_raw
  );
END;
$$;

-- 4. Atomic Reversal RPC
CREATE OR REPLACE FUNCTION reverse_batch_allocation(
  p_allocation_id uuid,
  p_reversed_by text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orig record;
  v_raw_stage_id uuid;
  v_dest_available integer;
  v_new_allocation_id uuid;
  v_reason_text text;
BEGIN
  -- 1. Fetch original allocation
  SELECT * INTO v_orig FROM batch_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF v_orig.id IS NULL THEN
    RAISE EXCEPTION 'Allocation record % does not exist.', p_allocation_id;
  END IF;

  IF v_orig.allocation_type = 'reversal' THEN
    RAISE EXCEPTION 'Cannot reverse an allocation that is already a reversal entry.';
  END IF;

  -- Check if already reversed
  IF EXISTS (
    SELECT 1 FROM batch_allocations
    WHERE allocation_type = 'reversal'
      AND source_batch_id = v_orig.destination_batch_id
      AND destination_batch_id = v_orig.source_batch_id
      AND remarks LIKE '%' || p_allocation_id::text || '%'
  ) THEN
    RAISE EXCEPTION 'Allocation % has already been reversed.', p_allocation_id;
  END IF;

  -- 2. Lock batches in deterministic order to prevent deadlocks
  IF v_orig.source_batch_id < v_orig.destination_batch_id THEN
    PERFORM 1 FROM inward_batches WHERE id = v_orig.source_batch_id FOR UPDATE;
    PERFORM 1 FROM inward_batches WHERE id = v_orig.destination_batch_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM inward_batches WHERE id = v_orig.destination_batch_id FOR UPDATE;
    PERFORM 1 FROM inward_batches WHERE id = v_orig.source_batch_id FOR UPDATE;
  END IF;

  -- 3. Verify Raw Stock stage exists
  SELECT id INTO v_raw_stage_id FROM stages WHERE sequence_no = 1 OR name = 'Raw Stock' LIMIT 1;
  IF v_raw_stage_id IS NULL THEN
    RAISE EXCEPTION 'Raw Stock stage not found in stages catalog.';
  END IF;

  -- 4. Calculate available stock in destination batch's Raw Stock
  SELECT
    ib.qty_received
    - COALESCE((SELECT SUM(ba.qty) FROM batch_allocations ba WHERE ba.source_batch_id = v_orig.destination_batch_id), 0)
    + COALESCE((SELECT SUM(ba.qty) FROM batch_allocations ba WHERE ba.destination_batch_id = v_orig.destination_batch_id), 0)
    - COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = v_orig.destination_batch_id AND sm.from_stage_id = v_raw_stage_id), 0)
    + COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = v_orig.destination_batch_id AND sm.to_stage_id = v_raw_stage_id), 0)
  INTO v_dest_available
  FROM inward_batches ib
  WHERE ib.id = v_orig.destination_batch_id;

  IF v_dest_available < v_orig.qty THEN
    RAISE EXCEPTION 'Destination batch has insufficient available raw stock (% units) to reverse % units.',
      v_dest_available, v_orig.qty;
  END IF;

  -- 5. Insert inverse allocation record
  v_reason_text := COALESCE(p_reason, 'Manual allocation reversal');
  INSERT INTO batch_allocations (
    source_batch_id,
    destination_batch_id,
    qty,
    allocation_type,
    item_id,
    allocated_on,
    allocated_by,
    remarks
  ) VALUES (
    v_orig.destination_batch_id,
    v_orig.source_batch_id,
    v_orig.qty,
    'reversal',
    v_orig.item_id,
    CURRENT_DATE,
    COALESCE(p_reversed_by, 'Supervisor'),
    'REVERSAL [' || p_allocation_id::text || ']: ' || v_reason_text
  ) RETURNING id INTO v_new_allocation_id;

  RETURN v_new_allocation_id;
END;
$$;

-- 5. Synchronized v_component_stock View (Accurate Bottle Raw Stock)
CREATE OR REPLACE VIEW v_component_stock AS
WITH 
  receipts_agg AS (
    SELECT 
      item_id,
      COALESCE(SUM(qty), 0) AS qty,
      COUNT(id) AS receipt_count
    FROM item_stock_receipts
    GROUP BY item_id
  ),
  direct_batches_agg AS (
    SELECT 
      item_id,
      COALESCE(SUM(qty_received), 0) AS qty,
      COUNT(id) AS batch_count
    FROM inward_batches
    GROUP BY item_id
  ),
  attached_caps_agg AS (
    SELECT 
      cap_item_id AS item_id,
      COALESCE(SUM(COALESCE(cap_qty, qty_received)), 0) AS qty,
      COUNT(id) AS batch_count
    FROM inward_batches
    WHERE cap_item_id IS NOT NULL
    GROUP BY cap_item_id
  ),
  attached_atomizers_agg AS (
    SELECT 
      atomizer_item_id AS item_id,
      COALESCE(SUM(COALESCE(atomizer_qty, qty_received)), 0) AS qty,
      COUNT(id) AS batch_count
    FROM inward_batches
    WHERE atomizer_item_id IS NOT NULL
    GROUP BY atomizer_item_id
  ),
  attached_boxes_agg AS (
    SELECT 
      box_item_id AS item_id,
      COALESCE(SUM(COALESCE(box_qty, qty_received)), 0) AS qty,
      COUNT(id) AS batch_count
    FROM inward_batches
    WHERE box_item_id IS NOT NULL
    GROUP BY box_item_id
  ),
  cap_moves_agg AS (
    SELECT 
      sm.cap_item_id AS item_id,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' OR s_from.name = 'Scrap / Defect' THEN 0
          WHEN (s_from.name = 'Filling' OR (s_from.sequence_no <= 4 AND s_to.sequence_no > 4))
               AND NOT (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN COALESCE(sm.cap_qty_used, sm.qty_moved)
          WHEN (s_to.name = 'Filling' OR (s_from.sequence_no > 4 AND s_to.sequence_no <= 4))
               AND (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN -COALESCE(sm.cap_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_used,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' THEN COALESCE(sm.cap_qty_used, sm.qty_moved)
          WHEN s_from.name = 'Scrap / Defect' THEN -COALESCE(sm.cap_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_scrapped,
      COUNT(DISTINCT sm.batch_id) AS movement_count
    FROM stage_movements sm
    LEFT JOIN stages s_to ON s_to.id = sm.to_stage_id
    LEFT JOIN stages s_from ON s_from.id = sm.from_stage_id
    WHERE sm.cap_item_id IS NOT NULL
    GROUP BY sm.cap_item_id
  ),
  atomizer_moves_agg AS (
    SELECT 
      sm.atomizer_item_id AS item_id,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' OR s_from.name = 'Scrap / Defect' THEN 0
          WHEN (s_from.name = 'Filling' OR (s_from.sequence_no <= 4 AND s_to.sequence_no > 4))
               AND NOT (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN COALESCE(sm.atomizer_qty_used, sm.qty_moved)
          WHEN (s_to.name = 'Filling' OR (s_from.sequence_no > 4 AND s_to.sequence_no <= 4))
               AND (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN -COALESCE(sm.atomizer_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_used,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' THEN COALESCE(sm.atomizer_qty_used, sm.qty_moved)
          WHEN s_from.name = 'Scrap / Defect' THEN -COALESCE(sm.atomizer_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_scrapped,
      COUNT(DISTINCT sm.batch_id) AS movement_count
    FROM stage_movements sm
    LEFT JOIN stages s_to ON s_to.id = sm.to_stage_id
    LEFT JOIN stages s_from ON s_from.id = sm.from_stage_id
    WHERE sm.atomizer_item_id IS NOT NULL
    GROUP BY sm.atomizer_item_id
  ),
  box_moves_agg AS (
    SELECT 
      sm.box_item_id AS item_id,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' OR s_from.name = 'Scrap / Defect' THEN 0
          WHEN (s_from.name = 'Packaging' OR (s_from.sequence_no <= 5 AND s_to.sequence_no > 5))
               AND NOT (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN COALESCE(sm.box_qty_used, sm.qty_moved)
          WHEN (s_to.name = 'Packaging' OR (s_from.sequence_no > 5 AND s_to.sequence_no <= 5))
               AND (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN -COALESCE(sm.box_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_used,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' THEN COALESCE(sm.box_qty_used, sm.qty_moved)
          WHEN s_from.name = 'Scrap / Defect' THEN -COALESCE(sm.box_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_scrapped,
      COUNT(DISTINCT sm.batch_id) AS movement_count
    FROM stage_movements sm
    LEFT JOIN stages s_to ON s_to.id = sm.to_stage_id
    LEFT JOIN stages s_from ON s_from.id = sm.from_stage_id
    WHERE sm.box_item_id IS NOT NULL
    GROUP BY sm.box_item_id
  ),
  bottle_moves_agg AS (
    SELECT
      ib.item_id,
      COALESCE(SUM(
        CASE
          WHEN s_from.name = 'Raw Stock' AND s_to.name <> 'Raw Stock' THEN sm.qty_moved
          WHEN s_to.name = 'Raw Stock' AND s_from.name <> 'Raw Stock' THEN -sm.qty_moved
          ELSE 0
        END
      ), 0) AS qty_moved_from_raw,
      COALESCE(SUM(
        CASE
          WHEN s_to.name = 'Scrap / Defect' THEN sm.qty_moved
          WHEN s_from.name = 'Scrap / Defect' THEN -sm.qty_moved
          ELSE 0
        END
      ), 0) AS qty_scrapped,
      COUNT(DISTINCT sm.batch_id) FILTER (WHERE s_from.name = 'Raw Stock') AS batches_in_prod
    FROM stage_movements sm
    JOIN inward_batches ib ON ib.id = sm.batch_id
    LEFT JOIN stages s_to ON s_to.id = sm.to_stage_id
    LEFT JOIN stages s_from ON s_from.id = sm.from_stage_id
    GROUP BY ib.item_id
  ),
  dispatches_box_agg AS (
    SELECT box_item_id AS item_id, COALESCE(SUM(qty), 0) AS qty
    FROM dispatches
    WHERE box_item_id IS NOT NULL
    GROUP BY box_item_id
  )
SELECT
  i.id AS item_id,
  i.name AS item_name,
  i.category,
  i.unit,
  (COALESCE(r.qty, 0) + COALESCE(db.qty, 0) + COALESCE(ac.qty, 0) + COALESCE(aa.qty, 0) + COALESCE(ab.qty, 0)) AS total_inwarded,
  (COALESCE(r.receipt_count, 0) + COALESCE(db.batch_count, 0) + COALESCE(ac.batch_count, 0) + COALESCE(aa.batch_count, 0) + COALESCE(ab.batch_count, 0)) AS inward_batch_count,
  CASE 
    WHEN lower(i.category) = 'bottle' THEN GREATEST(0, COALESCE(btm.qty_moved_from_raw, 0))
    ELSE GREATEST(0, (COALESCE(cm.qty_used, 0) + COALESCE(am.qty_used, 0) + COALESCE(bm.qty_used, 0)))
  END AS total_used,
  CASE
    WHEN lower(i.category) = 'bottle' THEN COALESCE(btm.batches_in_prod, 0)
    ELSE (COALESCE(cm.movement_count, 0) + COALESCE(am.movement_count, 0) + COALESCE(bm.movement_count, 0))
  END AS used_in_batch_count,
  CASE
    WHEN lower(i.category) = 'bottle' THEN GREATEST(0, COALESCE(btm.qty_scrapped, 0))
    ELSE GREATEST(0, (COALESCE(cm.qty_scrapped, 0) + COALESCE(am.qty_scrapped, 0) + COALESCE(bm.qty_scrapped, 0)))
  END AS total_scrapped,
  COALESCE(dbx.qty, 0) AS total_dispatched,
  CASE
    WHEN lower(i.category) = 'bottle' THEN
      GREATEST(0, (COALESCE(r.qty, 0) + COALESCE(db.qty, 0)) - GREATEST(0, COALESCE(btm.qty_moved_from_raw, 0)) - GREATEST(0, COALESCE(btm.qty_scrapped, 0)))
    ELSE
      GREATEST(0, (COALESCE(r.qty, 0) + COALESCE(db.qty, 0) + COALESCE(ac.qty, 0) + COALESCE(aa.qty, 0) + COALESCE(ab.qty, 0)) 
        - GREATEST(0, (COALESCE(cm.qty_used, 0) + COALESCE(am.qty_used, 0) + COALESCE(bm.qty_used, 0)))
        - GREATEST(0, (COALESCE(cm.qty_scrapped, 0) + COALESCE(am.qty_scrapped, 0) + COALESCE(bm.qty_scrapped, 0))))
  END AS available_stock
FROM items i
LEFT JOIN receipts_agg r ON r.item_id = i.id
LEFT JOIN direct_batches_agg db ON db.item_id = i.id
LEFT JOIN attached_caps_agg ac ON ac.item_id = i.id
LEFT JOIN attached_atomizers_agg aa ON aa.item_id = i.id
LEFT JOIN attached_boxes_agg ab ON ab.item_id = i.id
LEFT JOIN cap_moves_agg cm ON cm.item_id = i.id
LEFT JOIN atomizer_moves_agg am ON am.item_id = i.id
LEFT JOIN box_moves_agg bm ON bm.item_id = i.id
LEFT JOIN bottle_moves_agg btm ON btm.item_id = i.id
LEFT JOIN dispatches_box_agg dbx ON dbx.item_id = i.id;

-- 6. Factory RBAC: User Profiles & Operator Stage Transition Checks
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY,
  email text,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN (
    'admin',
    'inward_manager',
    'coloring_operator',
    'printing_operator',
    'filling_operator',
    'packaging_operator',
    'stock_manager',
    'dispatch_manager',
    'vendor_manager',
    'viewer'
  )),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_select_user_profiles" ON user_profiles;
CREATE POLICY "shared_select_user_profiles" ON user_profiles
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_user_profiles" ON user_profiles;
CREATE POLICY "admin_manage_user_profiles" ON user_profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Explicit Operator Transition Verification
CREATE OR REPLACE FUNCTION is_operator_transition_allowed(
  p_role text,
  p_from_seq integer,
  p_to_seq integer
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_role = 'admin' THEN
    RETURN true;
  END IF;

  CASE p_role
    WHEN 'coloring_operator' THEN
      -- Raw(1)->Coloring(2), Coloring(2)->Printing(3), Coloring(2)->Scrap(8), Coloring(2)->Raw(1) [Reversal]
      RETURN (p_from_seq = 1 AND p_to_seq = 2)
          OR (p_from_seq = 2 AND p_to_seq IN (1, 3, 8));

    WHEN 'printing_operator' THEN
      -- Printing(3)->Filling(4), Printing(3)->Scrap(8), Printing(3)->Coloring(2) [Reversal]
      RETURN (p_from_seq = 3 AND p_to_seq IN (2, 4, 8));

    WHEN 'filling_operator' THEN
      -- Filling(4)->Packaging(5), Filling(4)->Scrap(8), Filling(4)->Printing(3) [Reversal]
      RETURN (p_from_seq = 4 AND p_to_seq IN (3, 5, 8));

    WHEN 'packaging_operator' THEN
      -- Packaging(5)->Ready(6), Packaging(5)->Scrap(8), Packaging(5)->Filling(4) [Reversal]
      RETURN (p_from_seq = 5 AND p_to_seq IN (4, 6, 8));

    ELSE
      RETURN false;
  END CASE;
END;
$$;
