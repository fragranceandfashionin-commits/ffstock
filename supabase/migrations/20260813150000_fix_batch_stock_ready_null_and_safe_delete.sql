/*
# Fix Ready stock showing as 0, and allow deleting unused batches

## Why
1. `v_batch_stock` computed Ready qty as
   `... - CASE WHEN s.name = 'Ready' THEN d.qty ELSE 0 END` where `d` is a
   LEFT JOIN on dispatches. For any batch with ZERO dispatches the join yields
   NULL, so the whole Ready qty became NULL. The app's `Math.max(0, NULL)`
   then displayed Ready stock as **0** even when bottles were sitting in
   Ready. That broke the Batch Journey page (Ready always shows 0) and made
   the **first dispatch of every batch impossible** (the UI guard blocks
   "Only 0 units are Ready for dispatch"). The dashboard's `v_stage_stock`
   computed the same number correctly, so pages disagreed with each other.
   (Verified live: batches in Ready stock showed `Ready=null`.)

2. `inward_batches` could not be deleted at all (append-only trigger + no RLS
   DELETE policy), so a wrongly-created batch was stuck forever. Deleting a
   batch is only safe while it has no movements and no dispatches — that is
   exactly what this migration allows. Once history exists the batch stays
   append-only, keeping the ledger trustworthy.

## What this does
- Rewrites `v_batch_stock` with `COALESCE(d.qty, 0)` so Ready qty is always a
  real number (0 when nothing has been dispatched).
- Replaces the inward_batches append-only trigger with one that:
  - still blocks UPDATE (a batch's source-of-truth quantity is never edited),
  - allows DELETE **only when the batch has no movements and no dispatches**
    (clean error otherwise, instead of a raw FK error),
  - leaves `stage_movements` / `dispatches` fully append-only (unchanged).
- Adds the missing RLS DELETE policy for `inward_batches` (the UI can delete
  an unused batch; the trigger above is the safety net).

Idempotent: safe to re-run.
*/

-- ─────────────────────────────────────────────────────────────
-- 1. Fix v_batch_stock: Ready qty must never be NULL
-- ─────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────
-- 2. Safe deletion of unused inward batches
-- ─────────────────────────────────────────────────────────────

-- Replaces prevent_ledger_mutation for inward_batches: UPDATE is always
-- blocked; DELETE is allowed only while the batch has no ledger history.
CREATE OR REPLACE FUNCTION allow_empty_batch_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Batch details cannot be edited. The batch is the source of truth for its quantity.';
  END IF;
  -- DELETE: only while nothing downstream references this batch.
  IF EXISTS (SELECT 1 FROM stage_movements sm WHERE sm.batch_id = OLD.id)
     OR EXISTS (SELECT 1 FROM dispatches d WHERE d.batch_id = OLD.id) THEN
    RAISE EXCEPTION 'This batch has movements or dispatches and cannot be deleted. The ledger keeps history — record a reversal entry instead.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_ledger_mutation_inward_batches ON inward_batches;
DROP TRIGGER IF EXISTS allow_empty_batch_delete_inward_batches ON inward_batches;
CREATE TRIGGER allow_empty_batch_delete_inward_batches
  BEFORE UPDATE OR DELETE ON inward_batches
  FOR EACH ROW EXECUTE FUNCTION allow_empty_batch_delete();

-- The UI may delete an unused batch; the trigger above is the safety net.
DROP POLICY IF EXISTS "shared_delete_inward_batches" ON inward_batches;
CREATE POLICY "shared_delete_inward_batches"
  ON inward_batches FOR DELETE TO anon, authenticated USING (true);
