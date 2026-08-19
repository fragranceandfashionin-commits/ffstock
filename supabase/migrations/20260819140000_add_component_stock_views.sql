-- ============================================================
-- Migration: Server-Side Component Stock (BOM) Aggregation View
-- ============================================================

/*
# Server-Side Component Stock (BOM) View

## Why
Components (Caps, Atomizers, Boxes, Labels, Raw Materials) are tracked across
item stock receipts, inward batches, and production stage movements. Computing
component stock inside Postgres via a server-side view reduces payload size,
eliminates 1,000-row client fetch limits, and accelerates dashboard inventory
summaries.

## What this does
Creates `v_component_stock` view with security_invoker = true:
- Reconciles direct stock receipts (item_stock_receipts)
- Direct inward batches (inward_batches where item_id = item.id)
- Attached batch components (cap_qty, atomizer_qty, box_qty on inward_batches)
- Production consumption across stage_movements (cap_qty_used, atomizer_qty_used, box_qty_used)
- Scrap / Defect quantities
- Dispatched quantities in customer orders
- Computes available stock balance per item

Idempotent: safe to re-run.
*/

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
    WHERE atomizer_item_id IS NOT NULL AND (item_id IS NULL OR atomizer_item_id <> item_id)
    GROUP BY atomizer_item_id
  ),
  attached_boxes_agg AS (
    SELECT box_item_id AS item_id, COALESCE(SUM(COALESCE(box_qty, qty_received)), 0) AS qty, COUNT(id) AS batch_count
    FROM inward_batches
    WHERE box_item_id IS NOT NULL AND (item_id IS NULL OR box_item_id <> item_id)
    GROUP BY box_item_id
  ),
  cap_moves_agg AS (
    SELECT 
      sm.cap_item_id AS item_id,
      COALESCE(SUM(CASE WHEN s_to.name <> 'Scrap / Defect' THEN COALESCE(sm.cap_qty_used, sm.qty_moved) ELSE 0 END), 0) AS qty_used,
      COALESCE(SUM(CASE WHEN s_to.name = 'Scrap / Defect' THEN COALESCE(sm.cap_qty_used, sm.qty_moved) ELSE 0 END), 0) AS qty_scrapped,
      COUNT(sm.id) AS movement_count
    FROM stage_movements sm
    LEFT JOIN stages s_to ON s_to.id = sm.to_stage_id
    WHERE sm.cap_item_id IS NOT NULL
    GROUP BY sm.cap_item_id
  ),
  atomizer_moves_agg AS (
    SELECT 
      sm.atomizer_item_id AS item_id,
      COALESCE(SUM(CASE WHEN s_to.name <> 'Scrap / Defect' THEN COALESCE(sm.atomizer_qty_used, sm.qty_moved) ELSE 0 END), 0) AS qty_used,
      COALESCE(SUM(CASE WHEN s_to.name = 'Scrap / Defect' THEN COALESCE(sm.atomizer_qty_used, sm.qty_moved) ELSE 0 END), 0) AS qty_scrapped,
      COUNT(sm.id) AS movement_count
    FROM stage_movements sm
    LEFT JOIN stages s_to ON s_to.id = sm.to_stage_id
    WHERE sm.atomizer_item_id IS NOT NULL
    GROUP BY sm.atomizer_item_id
  ),
  box_moves_agg AS (
    SELECT 
      sm.box_item_id AS item_id,
      COALESCE(SUM(CASE WHEN s_to.name <> 'Scrap / Defect' THEN COALESCE(sm.box_qty_used, sm.qty_moved) ELSE 0 END), 0) AS qty_used,
      COALESCE(SUM(CASE WHEN s_to.name = 'Scrap / Defect' THEN COALESCE(sm.box_qty_used, sm.qty_moved) ELSE 0 END), 0) AS qty_scrapped,
      COUNT(sm.id) AS movement_count
    FROM stage_movements sm
    LEFT JOIN stages s_to ON s_to.id = sm.to_stage_id
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
  (COALESCE(cm.qty_used, 0) + COALESCE(am.qty_used, 0) + COALESCE(bm.qty_used, 0) + (CASE WHEN lower(i.category) = 'bottle' THEN COALESCE(db.qty, 0) ELSE 0 END)) AS total_used,
  (COALESCE(cm.movement_count, 0) + COALESCE(am.movement_count, 0) + COALESCE(bm.movement_count, 0) + (CASE WHEN lower(i.category) = 'bottle' THEN COALESCE(db.batch_count, 0) ELSE 0 END)) AS used_in_batch_count,
  (COALESCE(cm.qty_scrapped, 0) + COALESCE(am.qty_scrapped, 0) + COALESCE(bm.qty_scrapped, 0)) AS total_scrapped,
  COALESCE(dbx.qty, 0) AS total_dispatched,
  GREATEST(0, (COALESCE(r.qty, 0) + COALESCE(db.qty, 0) + COALESCE(ac.qty, 0) + COALESCE(aa.qty, 0) + COALESCE(ab.qty, 0)) 
    - (COALESCE(cm.qty_used, 0) + COALESCE(am.qty_used, 0) + COALESCE(bm.qty_used, 0) + (CASE WHEN lower(i.category) = 'bottle' THEN COALESCE(db.qty, 0) ELSE 0 END))
    - (COALESCE(cm.qty_scrapped, 0) + COALESCE(am.qty_scrapped, 0) + COALESCE(bm.qty_scrapped, 0))) AS available_stock
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
