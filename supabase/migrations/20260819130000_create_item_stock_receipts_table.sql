-- ============================================================
-- Migration: Create Item Stock Receipts Table (Intake Ledger)
-- Dedicated table for direct inventory stock intake of components
-- (Caps, Atomizers, Boxes, Labels, Raw Materials, Bottles).
-- Idempotent: safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS item_stock_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  qty integer NOT NULL CHECK (qty > 0),
  received_on date NOT NULL DEFAULT current_date,
  invoice_no text,
  location text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS item_stock_receipts_item_id_idx ON item_stock_receipts(item_id);
CREATE INDEX IF NOT EXISTS item_stock_receipts_received_on_idx ON item_stock_receipts(received_on DESC);

ALTER TABLE item_stock_receipts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "shared_select_item_stock_receipts" ON item_stock_receipts;
  DROP POLICY IF EXISTS "shared_insert_item_stock_receipts" ON item_stock_receipts;
  DROP POLICY IF EXISTS "shared_update_item_stock_receipts" ON item_stock_receipts;
  DROP POLICY IF EXISTS "shared_delete_item_stock_receipts" ON item_stock_receipts;

  CREATE POLICY "shared_select_item_stock_receipts" ON item_stock_receipts FOR SELECT TO anon, authenticated USING (true);
  CREATE POLICY "shared_insert_item_stock_receipts" ON item_stock_receipts FOR INSERT TO anon, authenticated WITH CHECK (true);
  CREATE POLICY "shared_update_item_stock_receipts" ON item_stock_receipts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  CREATE POLICY "shared_delete_item_stock_receipts" ON item_stock_receipts FOR DELETE TO anon, authenticated USING (true);
END $$;
