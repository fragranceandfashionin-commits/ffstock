-- ============================================================
-- Migration: Add Batch Allocations & Synchronize Stock Views
-- Allows allocating stock quantities between batches (e.g. from Batch A to Batch B)
-- while preserving immutable inward intake ledger integrity.
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Create batch_allocations table
CREATE TABLE IF NOT EXISTS batch_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_batch_id uuid NOT NULL REFERENCES inward_batches(id) ON DELETE CASCADE,
  destination_batch_id uuid NOT NULL REFERENCES inward_batches(id) ON DELETE CASCADE,
  qty integer NOT NULL CHECK (qty > 0),
  allocation_type text NOT NULL DEFAULT 'primary',
  item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  allocated_on date NOT NULL DEFAULT current_date,
  remarks text,
  allocated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_batch_id <> destination_batch_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_allocations_source ON batch_allocations(source_batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_allocations_dest ON batch_allocations(destination_batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_allocations_date ON batch_allocations(allocated_on DESC);

ALTER TABLE batch_allocations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "shared_select_batch_allocations" ON batch_allocations;
  DROP POLICY IF EXISTS "shared_insert_batch_allocations" ON batch_allocations;
  DROP POLICY IF EXISTS "shared_update_batch_allocations" ON batch_allocations;
  DROP POLICY IF EXISTS "shared_delete_batch_allocations" ON batch_allocations;

  CREATE POLICY "shared_select_batch_allocations" ON batch_allocations FOR SELECT TO anon, authenticated USING (true);
  CREATE POLICY "shared_insert_batch_allocations" ON batch_allocations FOR INSERT TO anon, authenticated WITH CHECK (true);
  CREATE POLICY "shared_update_batch_allocations" ON batch_allocations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "shared_delete_batch_allocations" ON batch_allocations FOR DELETE TO anon, authenticated USING (true);
END $$;

-- 2. Update allow_empty_batch_delete trigger to guard batches with allocations
CREATE OR REPLACE FUNCTION allow_empty_batch_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
    -- Non-financial metadata updates (brand_name, location, image_url, color, component item IDs) are permitted
    RETURN NEW;
  END IF;

  -- DELETE: only while nothing downstream references this batch
  IF EXISTS (SELECT 1 FROM stage_movements sm WHERE sm.batch_id = OLD.id)
     OR EXISTS (SELECT 1 FROM dispatches d WHERE d.batch_id = OLD.id)
     OR EXISTS (SELECT 1 FROM batch_allocations ba WHERE ba.source_batch_id = OLD.id OR ba.destination_batch_id = OLD.id) THEN
    RAISE EXCEPTION 'This batch has movements, dispatches, or allocation history and cannot be deleted. The ledger keeps history.';
  END IF;
  RETURN OLD;
END;
$$;

-- 3. Update validate_stage_movement to incorporate allocation deltas at Raw Stock
CREATE OR REPLACE FUNCTION validate_stage_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  available integer;
BEGIN
  -- Serialize concurrent inserts for the same batch
  PERFORM 1 FROM inward_batches WHERE id = NEW.batch_id FOR UPDATE;

  SELECT
      -- Units that entered this stage
      COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm
                WHERE sm.batch_id = NEW.batch_id AND sm.to_stage_id = NEW.from_stage_id), 0)
      -- The first stage starts with the received quantity +/- allocations
      + CASE WHEN EXISTS (SELECT 1 FROM stages s WHERE s.id = NEW.from_stage_id AND s.sequence_no = 1)
             THEN (
               ib.qty_received
               - COALESCE((SELECT SUM(ba.qty) FROM batch_allocations ba WHERE ba.source_batch_id = NEW.batch_id), 0)
               + COALESCE((SELECT SUM(ba.qty) FROM batch_allocations ba WHERE ba.destination_batch_id = NEW.batch_id), 0)
             )
             ELSE 0 END
      -- Units that already left this stage
      - COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm
                  WHERE sm.batch_id = NEW.batch_id AND sm.from_stage_id = NEW.from_stage_id), 0)
      -- Units already dispatched (only relevant when moving out of Ready)
      - CASE WHEN EXISTS (SELECT 1 FROM stages s WHERE s.id = NEW.from_stage_id AND s.name = 'Ready')
             THEN COALESCE((SELECT SUM(d.qty) FROM dispatches d WHERE d.batch_id = NEW.batch_id), 0)
             ELSE 0 END
  INTO available
  FROM inward_batches ib WHERE ib.id = NEW.batch_id;

  IF available IS NULL OR NEW.qty_moved > available THEN
    RAISE EXCEPTION 'Not enough stock available for this batch at the selected stage (Available: %)', COALESCE(available, 0);
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Update v_batch_stock view with allocation deltas
CREATE OR REPLACE VIEW v_batch_stock
WITH (security_invoker = true) AS
SELECT
  ib.id AS batch_id,
  s.id AS stage_id,
  s.name AS stage_name,
  s.sequence_no,
  (CASE 
     WHEN s.sequence_no = 1 THEN (
       ib.qty_received 
       - COALESCE(alloc_out.qty, 0) 
       + COALESCE(alloc_in.qty, 0)
     )
     ELSE 0 
   END
   + COALESCE(m_in.qty, 0)
   - COALESCE(m_out.qty, 0)
   - CASE WHEN s.name = 'Ready' THEN COALESCE(d.qty, 0) ELSE 0 END) AS qty
FROM inward_batches ib
CROSS JOIN stages s
LEFT JOIN (
  SELECT source_batch_id, SUM(qty) AS qty
  FROM batch_allocations
  GROUP BY source_batch_id
) alloc_out ON alloc_out.source_batch_id = ib.id
LEFT JOIN (
  SELECT destination_batch_id, SUM(qty) AS qty
  FROM batch_allocations
  GROUP BY destination_batch_id
) alloc_in ON alloc_in.destination_batch_id = ib.id
LEFT JOIN (
  SELECT batch_id, to_stage_id AS stage_id, SUM(qty_moved) AS qty
  FROM stage_movements 
  GROUP BY batch_id, to_stage_id
) m_in ON m_in.batch_id = ib.id AND m_in.stage_id = s.id
LEFT JOIN (
  SELECT batch_id, from_stage_id AS stage_id, SUM(qty_moved) AS qty
  FROM stage_movements 
  GROUP BY batch_id, from_stage_id
) m_out ON m_out.batch_id = ib.id AND m_out.stage_id = s.id
LEFT JOIN (
  SELECT batch_id, SUM(qty) AS qty 
  FROM dispatches 
  GROUP BY batch_id
) d ON d.batch_id = ib.id AND s.name = 'Ready';

-- 5. Update v_location_stock view with allocation deltas
CREATE OR REPLACE VIEW v_location_stock
WITH (security_invoker = true) AS
SELECT
  ib.location,
  SUM(
    ib.qty_received 
    - COALESCE(alloc_out.qty, 0) 
    + COALESCE(alloc_in.qty, 0) 
    - COALESCE(d.qty, 0)
  ) AS qty
FROM inward_batches ib
LEFT JOIN (
  SELECT source_batch_id, SUM(qty) AS qty 
  FROM batch_allocations 
  GROUP BY source_batch_id
) alloc_out ON alloc_out.source_batch_id = ib.id
LEFT JOIN (
  SELECT destination_batch_id, SUM(qty) AS qty 
  FROM batch_allocations 
  GROUP BY destination_batch_id
) alloc_in ON alloc_in.destination_batch_id = ib.id
LEFT JOIN (
  SELECT batch_id, SUM(qty) AS qty 
  FROM dispatches 
  GROUP BY batch_id
) d ON d.batch_id = ib.id
GROUP BY ib.location
HAVING SUM(
  ib.qty_received 
  - COALESCE(alloc_out.qty, 0) 
  + COALESCE(alloc_in.qty, 0) 
  - COALESCE(d.qty, 0)
) > 0;

-- 6. Atomic Stored Function (RPC) to allocate stock between batches
CREATE OR REPLACE FUNCTION allocate_stock_between_batches(
  p_source_batch_id uuid,
  p_destination_batch_id uuid,
  p_qty integer,
  p_allocation_type text DEFAULT 'primary',
  p_item_id uuid DEFAULT NULL,
  p_remarks text DEFAULT NULL,
  p_allocated_by text DEFAULT NULL,
  p_allocated_on date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_raw_stage_id uuid;
  v_source_available integer;
  v_dest_batch_no text;
  v_source_batch_no text;
  v_source_item_id uuid;
  v_allocation_id uuid;
  v_source_new_raw integer;
  v_dest_new_raw integer;
BEGIN
  -- Basic parameter validation
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Allocation quantity must be greater than zero.';
  END IF;

  IF p_source_batch_id = p_destination_batch_id THEN
    RAISE EXCEPTION 'Source batch and destination batch cannot be the same.';
  END IF;

  -- 1. Lock rows in order to avoid deadlocks
  IF p_source_batch_id < p_destination_batch_id THEN
    PERFORM 1 FROM inward_batches WHERE id = p_source_batch_id FOR UPDATE;
    PERFORM 1 FROM inward_batches WHERE id = p_destination_batch_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM inward_batches WHERE id = p_destination_batch_id FOR UPDATE;
    PERFORM 1 FROM inward_batches WHERE id = p_source_batch_id FOR UPDATE;
  END IF;

  -- 2. Verify both batches exist
  SELECT batch_no, item_id INTO v_source_batch_no, v_source_item_id
  FROM inward_batches WHERE id = p_source_batch_id;
  IF v_source_batch_no IS NULL THEN
    RAISE EXCEPTION 'Source batch does not exist.';
  END IF;

  SELECT batch_no INTO v_dest_batch_no
  FROM inward_batches WHERE id = p_destination_batch_id;
  IF v_dest_batch_no IS NULL THEN
    RAISE EXCEPTION 'Destination batch does not exist.';
  END IF;

  -- 3. Find Raw Stock stage ID
  SELECT id INTO v_raw_stage_id FROM stages WHERE sequence_no = 1 OR name = 'Raw Stock' LIMIT 1;
  IF v_raw_stage_id IS NULL THEN
    RAISE EXCEPTION 'Raw Stock stage not found in stages catalog.';
  END IF;

  -- 4. Calculate available raw stock in source batch
  SELECT
    ib.qty_received
    - COALESCE((SELECT SUM(ba.qty) FROM batch_allocations ba WHERE ba.source_batch_id = p_source_batch_id), 0)
    + COALESCE((SELECT SUM(ba.qty) FROM batch_allocations ba WHERE ba.destination_batch_id = p_source_batch_id), 0)
    - COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = p_source_batch_id AND sm.from_stage_id = v_raw_stage_id), 0)
    + COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = p_source_batch_id AND sm.to_stage_id = v_raw_stage_id), 0)
  INTO v_source_available
  FROM inward_batches ib
  WHERE ib.id = p_source_batch_id;

  IF v_source_available IS NULL OR v_source_available < p_qty THEN
    RAISE EXCEPTION 'Insufficient Raw Stock in source batch % (Available: %, Requested: %)', 
      v_source_batch_no, COALESCE(v_source_available, 0), p_qty;
  END IF;

  -- 5. Insert allocation record
  INSERT INTO batch_allocations (
    source_batch_id,
    destination_batch_id,
    qty,
    allocation_type,
    item_id,
    allocated_on,
    remarks,
    allocated_by
  ) VALUES (
    p_source_batch_id,
    p_destination_batch_id,
    p_qty,
    COALESCE(p_allocation_type, 'primary'),
    COALESCE(p_item_id, v_source_item_id),
    COALESCE(p_allocated_on, current_date),
    p_remarks,
    p_allocated_by
  ) RETURNING id INTO v_allocation_id;

  -- 6. Calculate post-allocation Raw Stock for response
  v_source_new_raw := v_source_available - p_qty;

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
    'allocation_id', v_allocation_id,
    'source_batch_id', p_source_batch_id,
    'source_batch_no', v_source_batch_no,
    'destination_batch_id', p_destination_batch_id,
    'destination_batch_no', v_dest_batch_no,
    'qty_allocated', p_qty,
    'source_new_raw_qty', v_source_new_raw,
    'destination_new_raw_qty', v_dest_new_raw,
    'allocated_on', COALESCE(p_allocated_on, current_date)
  );
END;
$$;
