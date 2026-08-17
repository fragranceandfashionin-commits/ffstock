/*
# Fix quantity validation + server-side stock views

## Why
1. `validate_stage_movement` and `validate_dispatch` used `qty_received` as the
   base for EVERY stage. `qty_received` only belongs to the FIRST stage
   (Raw Stock). For downstream stages the "available" number was inflated by
   the full received quantity, allowing over-allocation (e.g. moving 1,100
   bottles out of Coloring when only 100 were ever moved in).
2. Neither trigger locked the batch row, so two concurrent inserts for the same
   batch could both read the same totals and pass validation (race condition).
3. Stock was computed by pulling every movement into the browser. Supabase
   caps responses at 1,000 rows per request, so once any table passed 1,000
   rows the app would silently compute wrong numbers. The views below compute
   stock inside Postgres instead.

## What this does
- Rewrites `validate_stage_movement`:
  available = moved_in - moved_out (+ qty_received only for the first stage;
  - dispatched only when the stage is Ready).
- Rewrites `validate_dispatch`:
  available = moved_into_Ready - moved_out_of_Ready - already_dispatched.
- Locks the batch row (`SELECT ... FOR UPDATE`) in both triggers so concurrent
  inserts on the same batch serialize instead of double-spending.
- Creates `v_stage_stock`, `v_batch_stock`, `v_location_stock` views that
  compute stock server-side (SUM/GROUP BY). The app can read these instead of
  scanning whole tables. `security_invoker` keeps the views subject to RLS.

Idempotent: safe to re-run.
*/

-- ─────────────────────────────────────────────────────────────
-- 1. Correct movement validation + row lock
-- ─────────────────────────────────────────────────────────────

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
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Correct dispatch validation + row lock
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION validate_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  available integer;
  ready_stage uuid;
BEGIN
  SELECT id INTO ready_stage FROM stages WHERE name = 'Ready';
  PERFORM 1 FROM inward_batches WHERE id = NEW.batch_id FOR UPDATE;

  SELECT
      -- Units that reached Ready
      COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm
                WHERE sm.batch_id = NEW.batch_id AND sm.to_stage_id = ready_stage), 0)
      -- Units that left Ready again
      - COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm
                  WHERE sm.batch_id = NEW.batch_id AND sm.from_stage_id = ready_stage), 0)
      -- Units already dispatched
      - COALESCE((SELECT SUM(d.qty) FROM dispatches d WHERE d.batch_id = NEW.batch_id), 0)
  INTO available
  FROM inward_batches ib WHERE ib.id = NEW.batch_id;

  IF available IS NULL OR NEW.qty > available THEN
    RAISE EXCEPTION 'Not enough Ready stock available for dispatch';
  END IF;
  RETURN NEW;
END;
$$;

-- Re-apply triggers (function bodies are replaced above; triggers just point
-- at the same function names, but drop/create keeps them consistent).
DROP TRIGGER IF EXISTS validate_stage_movement_trigger ON stage_movements;
CREATE TRIGGER validate_stage_movement_trigger
  BEFORE INSERT ON stage_movements FOR EACH ROW EXECUTE FUNCTION validate_stage_movement();

DROP TRIGGER IF EXISTS validate_dispatch_trigger ON dispatches;
CREATE TRIGGER validate_dispatch_trigger
  BEFORE INSERT ON dispatches FOR EACH ROW EXECUTE FUNCTION validate_dispatch();

-- ─────────────────────────────────────────────────────────────
-- 3. Server-side stock views (no more scanning whole tables)
-- ─────────────────────────────────────────────────────────────

-- Total stock at each stage across all batches.
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

-- Stock at each stage for one batch.
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
   - CASE WHEN s.name = 'Ready' THEN d.qty ELSE 0 END) AS qty
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

-- In-factory units per storage location.
CREATE OR REPLACE VIEW v_location_stock
WITH (security_invoker = true) AS
SELECT
  ib.location,
  SUM(ib.qty_received - COALESCE(d.qty, 0)) AS qty
FROM inward_batches ib
LEFT JOIN (SELECT batch_id, SUM(qty) AS qty FROM dispatches GROUP BY batch_id) d
  ON d.batch_id = ib.id
GROUP BY ib.location
HAVING SUM(ib.qty_received - COALESCE(d.qty, 0)) > 0;
