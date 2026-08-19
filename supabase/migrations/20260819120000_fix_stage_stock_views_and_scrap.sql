-- ============================================================
-- Migration: Fix Stage Stock Views and Scrap / Defect Classification
-- ============================================================

-- 1. Ensure Scrap / Defect stage exists with high sequence number
INSERT INTO stages (name, sequence_no)
VALUES ('Scrap / Defect', 8)
ON CONFLICT (name) DO NOTHING;

-- 2. Stage stock view (with security_invoker for RLS compliance)
CREATE OR REPLACE VIEW v_stage_stock
WITH (security_invoker = true) AS
SELECT
  s.id AS stage_id,
  s.name AS stage_name,
  s.sequence_no,
  (CASE 
     WHEN s.sequence_no = 1 THEN first.qty_received ELSE 0 END
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

-- 3. Batch stock view
CREATE OR REPLACE VIEW v_batch_stock
WITH (security_invoker = true) AS
SELECT
  ib.id AS batch_id,
  s.id AS stage_id,
  s.name AS stage_name,
  s.sequence_no,
  (CASE 
     WHEN s.sequence_no = 1 THEN ib.qty_received ELSE 0 END
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
