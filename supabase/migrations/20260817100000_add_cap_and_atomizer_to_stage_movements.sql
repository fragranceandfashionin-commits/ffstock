-- ============================================================
-- Migration: Add cap_name and atomizer_name to stage_movements
-- and enforce mandatory validation when moving from Filling stage
-- ============================================================

ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS cap_name text;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS atomizer_name text;

CREATE OR REPLACE FUNCTION validate_stage_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  available integer;
BEGIN
  -- Serialize concurrent inserts for the same batch: the row lock is held
  -- until this transaction commits, so the aggregates below are read after
  -- any earlier concurrent insert has committed.
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

  -- Mandatory Cap Name & Atomizer Name validation when moving from Filling stage
  IF EXISTS (SELECT 1 FROM stages s WHERE s.id = NEW.from_stage_id AND s.name = 'Filling') THEN
    IF NEW.cap_name IS NULL OR char_length(trim(NEW.cap_name)) = 0 OR NEW.atomizer_name IS NULL OR char_length(trim(NEW.atomizer_name)) = 0 THEN
      RAISE EXCEPTION 'Cap Name and Atomizer Name are mandatory when moving bottles from the Filling stage.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
