-- ============================================================
-- Migration: Allow Batch Metadata Updates & Sync Component Stock View
-- ============================================================

/*
# Batch Metadata Updates & View Sync

1. Changes
- Update `allow_empty_batch_delete` trigger on `inward_batches` to permit updates
  to non-financial descriptive metadata (brand_name, location, image_url, color, cap_item_id, atomizer_item_id, box_item_id)
  while strictly preserving ledger integrity on (qty_received, item_id, supplier_id, received_on).
- Deletion logic remains 100% untouched: unused batches can be deleted; batches with history remain append-only.
- Ensure RLS UPDATE policy on `inward_batches` is explicitly enabled.
- Synchronize `v_component_stock` view with milestone deduplication & bidirectional reversals.

Idempotent: safe to re-run.
*/

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

  -- DELETE: only while nothing downstream references this batch (untouched)
  IF EXISTS (SELECT 1 FROM stage_movements sm WHERE sm.batch_id = OLD.id)
     OR EXISTS (SELECT 1 FROM dispatches d WHERE d.batch_id = OLD.id) THEN
    RAISE EXCEPTION 'This batch has movements or dispatches and cannot be deleted. The ledger keeps history — record a reversal entry instead.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS allow_empty_batch_delete_inward_batches ON inward_batches;
CREATE TRIGGER allow_empty_batch_delete_inward_batches
  BEFORE UPDATE OR DELETE ON inward_batches
  FOR EACH ROW EXECUTE FUNCTION allow_empty_batch_delete();

DROP POLICY IF EXISTS "shared_update_inward_batches" ON inward_batches;
CREATE POLICY "shared_update_inward_batches"
  ON inward_batches FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Ensure brand_name column and index exist
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS brand_name text;
CREATE INDEX IF NOT EXISTS idx_inward_batches_brand_name ON inward_batches(brand_name);

-- Synchronize v_component_stock view
CREATE OR REPLACE VIEW v_component_stock
WITH (security_invoker = true) AS
WITH
  receipts_agg AS (
    SELECT item_id, COALESCE(SUM(qty), 0) AS qty, COUNT(id) AS receipt_count
    FROM item_stock_receipts
    GROUP BY item_id
  ),
  direct_batches_agg AS (
    SELECT item_id, COALESCE(SUM(qty_received), 0) AS qty, COUNT(id) AS batch_count
    FROM inward_batches
    GROUP BY item_id
  ),
  attached_caps_agg AS (
    SELECT cap_item_id AS item_id, COALESCE(SUM(COALESCE(cap_qty, qty_received)), 0) AS qty, COUNT(id) AS batch_count
    FROM inward_batches
    WHERE cap_item_id IS NOT NULL AND (item_id IS NULL OR cap_item_id <> item_id)
    GROUP BY cap_item_id
  ),
  attached_atomizers_agg AS (
    SELECT atomizer_item_id AS item_id, COALESCE(SUM(COALESCE(atomizer_qty, qty_received)), 0) AS qty, COUNT(id) AS batch_count
    FROM inward_batches
    WHERE atomizer_item_id IS NOT NULL 
      AND (item_id IS NULL OR atomizer_item_id <> item_id)
      AND (cap_item_id IS NULL OR atomizer_item_id <> cap_item_id)
    GROUP BY atomizer_item_id
  ),
  attached_boxes_agg AS (
    SELECT box_item_id AS item_id, COALESCE(SUM(COALESCE(box_qty, qty_received)), 0) AS qty, COUNT(id) AS batch_count
    FROM inward_batches
    WHERE box_item_id IS NOT NULL 
      AND (item_id IS NULL OR box_item_id <> item_id)
      AND (cap_item_id IS NULL OR box_item_id <> cap_item_id)
      AND (atomizer_item_id IS NULL OR box_item_id <> atomizer_item_id)
    GROUP BY box_item_id
  ),
  cap_moves_agg AS (
    SELECT 
      sm.cap_item_id AS item_id,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' OR s_from.name = 'Scrap / Defect' THEN 0
          -- Forward milestone assembly
          WHEN (s_from.name = 'Filling' OR (s_from.sequence_no <= 4 AND s_to.sequence_no > 4))
               AND NOT (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN COALESCE(sm.cap_qty_used, sm.qty_moved)
          -- Reverse milestone return
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
          -- Forward milestone assembly
          WHEN (s_from.name = 'Filling' OR (s_from.sequence_no <= 4 AND s_to.sequence_no > 4))
               AND NOT (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN COALESCE(sm.atomizer_qty_used, sm.qty_moved)
          -- Reverse milestone return
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
          -- Forward milestone packaging
          WHEN (s_from.name = 'Packaging' OR (s_from.sequence_no <= 5 AND s_to.sequence_no > 5))
               AND NOT (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN COALESCE(sm.box_qty_used, sm.qty_moved)
          -- Reverse milestone return
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
  GREATEST(0, (COALESCE(cm.qty_used, 0) + COALESCE(am.qty_used, 0) + COALESCE(bm.qty_used, 0) + (CASE WHEN lower(i.category) = 'bottle' THEN COALESCE(db.qty, 0) ELSE 0 END))) AS total_used,
  (COALESCE(cm.movement_count, 0) + COALESCE(am.movement_count, 0) + COALESCE(bm.movement_count, 0) + (CASE WHEN lower(i.category) = 'bottle' THEN COALESCE(db.batch_count, 0) ELSE 0 END)) AS used_in_batch_count,
  GREATEST(0, (COALESCE(cm.qty_scrapped, 0) + COALESCE(am.qty_scrapped, 0) + COALESCE(bm.qty_scrapped, 0))) AS total_scrapped,
  COALESCE(dbx.qty, 0) AS total_dispatched,
  GREATEST(0, (COALESCE(r.qty, 0) + COALESCE(db.qty, 0) + COALESCE(ac.qty, 0) + COALESCE(aa.qty, 0) + COALESCE(ab.qty, 0)) 
    - GREATEST(0, (COALESCE(cm.qty_used, 0) + COALESCE(am.qty_used, 0) + COALESCE(bm.qty_used, 0) + (CASE WHEN lower(i.category) = 'bottle' THEN COALESCE(db.qty, 0) ELSE 0 END)))
    - GREATEST(0, (COALESCE(cm.qty_scrapped, 0) + COALESCE(am.qty_scrapped, 0) + COALESCE(bm.qty_scrapped, 0)))) AS available_stock
FROM items i
LEFT JOIN receipts_agg r ON r.item_id = i.id
LEFT JOIN direct_batches_agg db ON db.item_id = i.id
LEFT JOIN attached_caps_agg ac ON ac.item_id = i.id
LEFT JOIN attached_atomizers_agg aa ON aa.item_id = i.id
LEFT JOIN attached_boxes_agg ab ON ab.item_id = i.id
LEFT JOIN cap_moves_agg cm ON cm.item_id = i.id
LEFT JOIN atomizer_moves_agg am ON am.item_id = i.id
LEFT JOIN box_moves_agg bm ON bm.item_id = i.id
LEFT JOIN dispatches_box_agg dbx ON dbx.item_id = i.id;
