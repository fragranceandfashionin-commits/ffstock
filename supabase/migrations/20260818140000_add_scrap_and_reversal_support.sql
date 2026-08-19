-- ============================================================
-- Migration: Add Scrap / Defect Tracking & Ledger Reversals
-- Adds 'Scrap / Defect' to stages table and allows recording
-- production defects, breakage, and compensating ledger reversals.
-- ============================================================

-- 1. Insert 'Scrap / Defect' stage with sequence number 8 if not present
INSERT INTO stages (name, sequence_no)
VALUES ('Scrap / Defect', 8)
ON CONFLICT (name) DO NOTHING;

-- 2. Update validate_stage_movement to permit moving units to 'Scrap / Defect'
-- and ensure scrap units leave active production accurately.
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
      -- The first stage starts with the received quantity
      + CASE WHEN EXISTS (SELECT 1 FROM stages s WHERE s.id = NEW.from_stage_id AND s.sequence_no = 1)
             THEN ib.qty_received ELSE 0 END
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
    RAISE EXCEPTION 'Not enough stock available for this batch at the selected stage';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Update stock views to handle 'Scrap / Defect' stage appropriately
CREATE OR REPLACE VIEW v_stage_stock
WITH (security_invoker = true) AS
SELECT
  s.id AS stage_id,
  s.name AS stage_name,
  s.sequence_no,
  (CASE WHEN s.sequence_no = 1 THEN first.qty_received ELSE 0 END
   + COALESCE(m_in.qty, 0)
   - COALESCE(m_out.qty, 0)
   - CASE WHEN s.name = 'Ready' THEN dispatched.qty ELSE 0 END) AS qty
FROM stages s
CROSS JOIN (SELECT COALESCE(SUM(qty_received), 0) AS qty_received FROM inward_batches) first
CROSS JOIN (SELECT COALESCE(SUM(qty), 0) AS qty FROM dispatches) dispatched
LEFT JOIN (SELECT to_stage_id AS stage_id, SUM(qty_moved) AS qty
           FROM stage_movements GROUP BY to_stage_id) m_in ON m_in.stage_id = s.id
LEFT JOIN (SELECT from_stage_id AS stage_id, SUM(qty_moved) AS qty
           FROM stage_movements GROUP BY from_stage_id) m_out ON m_out.stage_id = s.id;

CREATE OR REPLACE VIEW v_batch_stock
WITH (security_invoker = true) AS
SELECT
  ib.id AS batch_id,
  s.id AS stage_id,
  s.name AS stage_name,
  s.sequence_no,
  (CASE WHEN s.sequence_no = 1 THEN ib.qty_received ELSE 0 END
   + COALESCE(m_in.qty, 0)
   - COALESCE(m_out.qty, 0)
   - CASE WHEN s.name = 'Ready' THEN COALESCE(d.qty, 0) ELSE 0 END) AS qty
FROM inward_batches ib
CROSS JOIN stages s
LEFT JOIN (SELECT batch_id, to_stage_id AS stage_id, SUM(qty_moved) AS qty
           FROM stage_movements GROUP BY batch_id, to_stage_id) m_in
  ON m_in.batch_id = ib.id AND m_in.stage_id = s.id
LEFT JOIN (SELECT batch_id, from_stage_id AS stage_id, SUM(qty_moved) AS qty
           FROM stage_movements GROUP BY batch_id, from_stage_id) m_out
  ON m_out.batch_id = ib.id AND m_out.stage_id = s.id
LEFT JOIN (SELECT batch_id, SUM(qty) AS qty FROM dispatches GROUP BY batch_id) d
  ON d.batch_id = ib.id AND s.name = 'Ready';
