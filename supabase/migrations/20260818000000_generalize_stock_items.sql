-- ============================================================
-- Migration: Generalize items table for all stock items (Bottles, Caps, Atomizers, Packaging, etc.)
-- and enable item editing + generalized stage movement validation
-- ============================================================

-- 1. Add category, unit, and description columns to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Bottle';
ALTER TABLE items ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'pcs';
ALTER TABLE items ADD COLUMN IF NOT EXISTS description text;

-- 2. Allow UPDATE on items so user can edit item names, categories, units, and descriptions
DROP POLICY IF EXISTS "shared_update_items" ON items;
CREATE POLICY "shared_update_items"
  ON items FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Update stage movement validation function so any stock item can move through stages
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
