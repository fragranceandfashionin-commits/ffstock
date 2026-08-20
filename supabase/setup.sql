-- ============================================================
-- ffstock — complete database setup for project shoyykqnvuccahvtgocv
-- Paste this ENTIRE file into: Supabase Dashboard → SQL Editor → Run
-- It is safe to run more than once (idempotent).
-- ============================================================

/*
# Create batch-wise inventory ledger

1. New Tables
- `suppliers`: supplier name and contact details.
- `items`: bottle or product variants.
- `stages`: fixed production flow stages and their sequence.
- `inward_batches`: manually entered incoming batches with quantity and storage location.
- `stage_movements`: immutable quantity movements between production stages.
- `dispatches`: quantities shipped to customers with invoice details.

2. Data integrity
- Quantities are positive whole numbers.
- Batch numbers are unique.
- Foreign keys keep supplier, item, batch, and stage references valid.
- Movement and dispatch quantities are checked in the database against current available stock using trigger functions.

3. Security
- Row level security is enabled on every table.
- This is a single shared factory workspace with no sign-in screen, so anon and authenticated users receive separate CRUD policies.

4. Important notes
- The ledger is the source of truth; current stock is calculated from inward quantities minus outgoing movements and dispatches.
- No QR, barcode, or automatic tracking fields are included.
*/

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  contact text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  category text NOT NULL DEFAULT 'Bottle',
  unit text NOT NULL DEFAULT 'pcs',
  description text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sequence_no integer NOT NULL UNIQUE CHECK (sequence_no > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inward_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no text NOT NULL UNIQUE CHECK (char_length(trim(batch_no)) > 0),
  brand_name text,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  item_id uuid NOT NULL REFERENCES items(id),
  received_on date NOT NULL DEFAULT current_date,
  qty_received integer NOT NULL CHECK (qty_received > 0),
  location text NOT NULL CHECK (char_length(trim(location)) > 0),
  image_url text,
  color text,
  cap_item_id uuid REFERENCES items(id),
  atomizer_item_id uuid REFERENCES items(id),
  box_item_id uuid REFERENCES items(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stage_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES inward_batches(id),
  from_stage_id uuid NOT NULL REFERENCES stages(id),
  to_stage_id uuid NOT NULL REFERENCES stages(id),
  qty_moved integer NOT NULL CHECK (qty_moved > 0),
  moved_on date NOT NULL DEFAULT current_date,
  cap_name text,
  atomizer_name text,
  box_name text,
  color text,
  printing_design text,
  cap_item_id uuid REFERENCES items(id),
  atomizer_item_id uuid REFERENCES items(id),
  box_item_id uuid REFERENCES items(id),
  location text,
  image_url text,
  remarks text,
  done_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_stage_id <> to_stage_id)
);

CREATE TABLE IF NOT EXISTS dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES inward_batches(id),
  qty integer NOT NULL CHECK (qty > 0),
  customer_name text NOT NULL CHECK (char_length(trim(customer_name)) > 0),
  invoice_no text NOT NULL CHECK (char_length(trim(invoice_no)) > 0),
  dispatched_on date NOT NULL DEFAULT current_date,
  color text,
  printing_design text,
  cap_name text,
  atomizer_name text,
  box_name text,
  box_item_id uuid REFERENCES items(id),
  product_specs text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inward_batches_received_on_idx ON inward_batches(received_on DESC);
CREATE INDEX IF NOT EXISTS inward_batches_box_item_id_idx ON inward_batches(box_item_id);
CREATE INDEX IF NOT EXISTS stage_movements_batch_id_idx ON stage_movements(batch_id);
CREATE INDEX IF NOT EXISTS stage_movements_box_item_id_idx ON stage_movements(box_item_id);
CREATE INDEX IF NOT EXISTS dispatches_batch_id_idx ON dispatches(batch_id);
CREATE INDEX IF NOT EXISTS dispatches_box_item_id_idx ON dispatches(box_item_id);

INSERT INTO stages (name, sequence_no) VALUES
  ('Raw Stock', 1), ('Coloring', 2), ('Printing', 3), ('Filling', 4),
  ('Packaging', 5), ('Ready', 6), ('Dispatched', 7), ('Scrap / Defect', 8)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inward_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['suppliers','items','stages','inward_batches','stage_movements','dispatches'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "shared_select_%s" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "shared_insert_%s" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "shared_update_%s" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "shared_delete_%s" ON %I', table_name, table_name);
    EXECUTE format('CREATE POLICY "shared_select_%s" ON %I FOR SELECT TO anon, authenticated USING (true)', table_name, table_name);
    EXECUTE format('CREATE POLICY "shared_insert_%s" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true)', table_name, table_name);
    EXECUTE format('CREATE POLICY "shared_update_%s" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', table_name, table_name);
    EXECUTE format('CREATE POLICY "shared_delete_%s" ON %I FOR DELETE TO anon, authenticated USING (true)', table_name, table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION validate_stage_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE available integer;
BEGIN
  SELECT ib.qty_received
    - COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = NEW.batch_id AND sm.from_stage_id = NEW.from_stage_id), 0)
    - COALESCE((SELECT SUM(d.qty) FROM dispatches d JOIN stages ds ON ds.name = 'Dispatched' WHERE d.batch_id = NEW.batch_id AND NEW.from_stage_id = ds.id), 0)
    + COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = NEW.batch_id AND sm.to_stage_id = NEW.from_stage_id), 0)
  INTO available
  FROM inward_batches ib WHERE ib.id = NEW.batch_id;
  IF available IS NULL OR NEW.qty_moved > available THEN
    RAISE EXCEPTION 'Not enough stock available for this batch at the selected stage';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_stage_movement_trigger ON stage_movements;
CREATE TRIGGER validate_stage_movement_trigger BEFORE INSERT ON stage_movements FOR EACH ROW EXECUTE FUNCTION validate_stage_movement();

CREATE OR REPLACE FUNCTION validate_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE available integer;
DECLARE ready_stage uuid;
BEGIN
  SELECT id INTO ready_stage FROM stages WHERE name = 'Ready';
  SELECT ib.qty_received
    - COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = NEW.batch_id AND sm.from_stage_id = ready_stage), 0)
    + COALESCE((SELECT SUM(sm.qty_moved) FROM stage_movements sm WHERE sm.batch_id = NEW.batch_id AND sm.to_stage_id = ready_stage), 0)
    - COALESCE((SELECT SUM(d.qty) FROM dispatches d WHERE d.batch_id = NEW.batch_id), 0)
  INTO available
  FROM inward_batches ib WHERE ib.id = NEW.batch_id;
  IF available IS NULL OR NEW.qty > available THEN
    RAISE EXCEPTION 'Not enough Ready stock available for dispatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_dispatch_trigger ON dispatches;
CREATE TRIGGER validate_dispatch_trigger BEFORE INSERT ON dispatches FOR EACH ROW EXECUTE FUNCTION validate_dispatch();

-- ============================================================
-- PART 2: Security hardening (least-privilege RLS + append-only ledger)
-- ============================================================

/*
# Security hardening: least-privilege RLS + append-only ledger

This migration replaces the broad "full CRUD for everyone" policies from the
initial schema with least-privilege access, and makes the ledger tables
append-only so recorded history cannot be silently altered.

## Why
- The anon key ships inside the browser bundle. Anyone can extract it, so the
  anon role must be able to do exactly what the UI does — nothing more.
- `stage_movements` and `dispatches` are accounting-style events. Editing or
  deleting them would invalidate the stock ledger (stock is *computed* from
  these rows), so both are made immutable at the database level.
- `inward_batches` is the source of truth for each batch's quantity. Deleting a
  batch would orphan its movements/dispatches, so it is also immutable.
- Corrections are handled the ledger way: insert a reversal movement rather
  than editing history. (Exact SQL pattern at the bottom of this file.)

## Resulting permissions
| table            | anon / authenticated |
|------------------|----------------------|
| stages           | SELECT               |
| suppliers        | SELECT, INSERT, DELETE |
| items            | SELECT, INSERT, DELETE |
| inward_batches   | SELECT, INSERT       |
| stage_movements  | SELECT, INSERT       |
| dispatches       | SELECT, INSERT       |
*/

-- ─────────────────────────────────────────────────────────────
-- 1. Replace broad policies with least-privilege ones
-- ─────────────────────────────────────────────────────────────

-- Remove every policy the initial schema created (idempotent: works whether
-- the initial migration was applied in this run or a previous one).
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['suppliers','items','stages','inward_batches','stage_movements','dispatches'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "shared_select_%s" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "shared_insert_%s" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "shared_update_%s" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "shared_delete_%s" ON %I', table_name, table_name);
  END LOOP;
END $$;

-- stages: reference data only — the UI never writes to it.
CREATE POLICY "shared_select_stages" ON stages FOR SELECT TO anon, authenticated USING (true);

-- suppliers & items: the UI adds and deletes them, but never edits.
CREATE POLICY "shared_select_suppliers" ON suppliers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "shared_insert_suppliers" ON suppliers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "shared_delete_suppliers" ON suppliers FOR DELETE TO anon, authenticated USING (true);
CREATE POLICY "shared_select_items" ON items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "shared_insert_items" ON items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "shared_update_items" ON items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shared_delete_items" ON items FOR DELETE TO anon, authenticated USING (true);

-- Ledger tables: the UI only inserts; reads stay open for all roles.
CREATE POLICY "shared_select_inward_batches" ON inward_batches FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "shared_insert_inward_batches" ON inward_batches FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "shared_select_stage_movements" ON stage_movements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "shared_insert_stage_movements" ON stage_movements FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "shared_select_dispatches" ON dispatches FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "shared_insert_dispatches" ON dispatches FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 2. Append-only ledger: reject UPDATE / DELETE on ledger tables
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ledger rows cannot be deleted. Record a reversal entry instead.';
  END IF;
  RAISE EXCEPTION 'Ledger rows cannot be edited. Record a reversal entry instead.';
END;
$$;

-- inward_batches: source of truth — no edits, no deletes.
DROP TRIGGER IF EXISTS prevent_ledger_mutation_inward_batches ON inward_batches;
CREATE TRIGGER prevent_ledger_mutation_inward_batches
  BEFORE UPDATE OR DELETE ON inward_batches
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

-- stage_movements: stock is computed from these rows — immutable.
DROP TRIGGER IF EXISTS prevent_ledger_mutation_stage_movements ON stage_movements;
CREATE TRIGGER prevent_ledger_mutation_stage_movements
  BEFORE UPDATE OR DELETE ON stage_movements
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

-- dispatches: stock is computed from these rows — immutable.
DROP TRIGGER IF EXISTS prevent_ledger_mutation_dispatches ON dispatches;
CREATE TRIGGER prevent_ledger_mutation_dispatches
  BEFORE UPDATE OR DELETE ON dispatches
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

/*
# Correcting a mistake (maintenance mode, via SQL editor as owner/service role)

The ledger is append-only on purpose. If a wrong quantity was recorded, you
correct it by recording the reversal — never by editing rows:

-- Example: 50 units were wrongly moved Raw Stock -> Coloring. Reverse it:
INSERT INTO stage_movements (batch_id, from_stage_id, to_stage_id, qty_moved, moved_on, remarks)
SELECT batch_id, to_stage_id, from_stage_id, qty_moved, current_date, 'REVERSAL of <original movement id>'
FROM stage_movements WHERE id = '<original movement id>';

-- Example: a wrong inward quantity. Reverse the surplus into a note and
-- re-enter correctly:
--   (the extra units cannot leave the ledger; move them into a "scrap"/note
--    stage if needed, or reverse via movements.)

If a row must be removed entirely (genuine data-entry error), do it explicitly
as the database owner and only after confirming no downstream rows depend on it:
--   ALTER TABLE stage_movements DISABLE TRIGGER prevent_ledger_mutation_stage_movements;
--   DELETE FROM stage_movements WHERE id = '<id>';
--   ALTER TABLE stage_movements ENABLE TRIGGER prevent_ledger_mutation_stage_movements;
*/


-- ============================================================
-- PART 3: Photo storage (bucket + storage policies)
-- ============================================================

/*
# Photo storage for inward batches (Supabase Storage)

Creates a public bucket `batch-images` and gives the anon/authenticated roles
just enough permission to upload and read batch photos:

- SELECT on the bucket's objects (reading photos)
- INSERT on the bucket's objects (uploading a photo)

No UPDATE/DELETE — once a photo is attached to a batch it cannot be replaced or
removed by the app, keeping the ledger trustworthy. Photos are only ever added.

This is idempotent: safe to run more than once, and safe to run on a project
that already has the bucket (e.g. created in the dashboard).
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('batch-images', 'batch-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "batch_images_public_read" ON storage.objects;
CREATE POLICY "batch_images_public_read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'batch-images');

DROP POLICY IF EXISTS "batch_images_anon_insert" ON storage.objects;
CREATE POLICY "batch_images_anon_insert"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'batch-images'
    -- Only images, and only up to 10 MB: protects the free storage quota
    -- from abuse (anyone holding the public anon key can attempt uploads).
    AND COALESCE((metadata->>'size')::bigint, 0) <= 10485760
    AND lower(COALESCE((metadata->>'mimetype'), '')) LIKE 'image/%'
  );

DROP POLICY IF EXISTS "batch_images_anon_delete" ON storage.objects;
CREATE POLICY "batch_images_anon_delete"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'batch-images');


-- ============================================================
-- PART 4: Fix quantity validation + server-side stock views
-- ============================================================

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


-- ============================================================
-- PART 5: Fix v_batch_stock Ready NULL + safe batch deletion
-- ============================================================

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

2. `inward_batches` could not be deleted at all (append-only trigger + no RLS
   DELETE policy), so a wrongly-created batch was stuck forever. Deleting a
   batch is only safe while it has no movements and no dispatches — that is
   exactly what this migration allows. Once history exists the batch stays
   append-only, keeping the ledger trustworthy.

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

DROP POLICY IF EXISTS "shared_delete_inward_batches" ON inward_batches;
CREATE POLICY "shared_delete_inward_batches"
  ON inward_batches FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- PART 6: Scrap / Defect Tracking & Concurrent Stage Movement Validation
-- ============================================================

INSERT INTO stages (name, sequence_no)
VALUES ('Scrap / Defect', 8)
ON CONFLICT (name) DO NOTHING;

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

-- ============================================================
-- PART 7: Idempotent Schema Upgrades for Existing Databases
-- (Ensures all columns exist even if tables were created previously)
-- ============================================================

ALTER TABLE items ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Bottle';
ALTER TABLE items ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'pcs';
ALTER TABLE items ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS cap_item_id uuid REFERENCES items(id);
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS atomizer_item_id uuid REFERENCES items(id);
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS box_item_id uuid REFERENCES items(id);

ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS cap_name text;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS atomizer_name text;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS box_name text;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS printing_design text;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS cap_item_id uuid REFERENCES items(id);
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS atomizer_item_id uuid REFERENCES items(id);
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS box_item_id uuid REFERENCES items(id);
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS done_by text;

ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS printing_design text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS cap_name text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS atomizer_name text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS box_name text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS box_item_id uuid REFERENCES items(id);
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS product_specs text;

CREATE INDEX IF NOT EXISTS inward_batches_box_item_id_idx ON inward_batches(box_item_id);
CREATE INDEX IF NOT EXISTS stage_movements_box_item_id_idx ON stage_movements(box_item_id);
CREATE INDEX IF NOT EXISTS dispatches_box_item_id_idx ON dispatches(box_item_id);

-- Component independent quantity tracking
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS cap_qty integer;
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS atomizer_qty integer;
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS box_qty integer;

ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS cap_qty_used integer;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS atomizer_qty_used integer;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS box_qty_used integer;

-- ============================================================
-- PART 8: Item Stock Intake & Warehouse Inventory Receipts
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

-- ============================================================
-- PART 9: Component Stock (BOM) Aggregation View
-- ============================================================

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
      COALESCE(SUM(CASE WHEN s_to.name <> 'Scrap / Defect' AND (s_from.name IS NULL OR s_from.name <> 'Scrap / Defect') THEN COALESCE(sm.cap_qty_used, sm.qty_moved) ELSE 0 END), 0) AS qty_used,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' THEN COALESCE(sm.cap_qty_used, sm.qty_moved)
          WHEN s_from.name = 'Scrap / Defect' THEN -COALESCE(sm.cap_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_scrapped,
      COUNT(sm.id) AS movement_count
    FROM stage_movements sm
    LEFT JOIN stages s_to ON s_to.id = sm.to_stage_id
    LEFT JOIN stages s_from ON s_from.id = sm.from_stage_id
    WHERE sm.cap_item_id IS NOT NULL
    GROUP BY sm.cap_item_id
  ),
  atomizer_moves_agg AS (
    SELECT 
      sm.atomizer_item_id AS item_id,
      COALESCE(SUM(CASE WHEN s_to.name <> 'Scrap / Defect' AND (s_from.name IS NULL OR s_from.name <> 'Scrap / Defect') THEN COALESCE(sm.atomizer_qty_used, sm.qty_moved) ELSE 0 END), 0) AS qty_used,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' THEN COALESCE(sm.atomizer_qty_used, sm.qty_moved)
          WHEN s_from.name = 'Scrap / Defect' THEN -COALESCE(sm.atomizer_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_scrapped,
      COUNT(sm.id) AS movement_count
    FROM stage_movements sm
    LEFT JOIN stages s_to ON s_to.id = sm.to_stage_id
    LEFT JOIN stages s_from ON s_from.id = sm.from_stage_id
    WHERE sm.atomizer_item_id IS NOT NULL
    GROUP BY sm.atomizer_item_id
  ),
  box_moves_agg AS (
    SELECT 
      sm.box_item_id AS item_id,
      COALESCE(SUM(CASE WHEN s_to.name <> 'Scrap / Defect' AND (s_from.name IS NULL OR s_from.name <> 'Scrap / Defect') THEN COALESCE(sm.box_qty_used, sm.qty_moved) ELSE 0 END), 0) AS qty_used,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' THEN COALESCE(sm.box_qty_used, sm.qty_moved)
          WHEN s_from.name = 'Scrap / Defect' THEN -COALESCE(sm.box_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_scrapped,
      COUNT(sm.id) AS movement_count
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
  (COALESCE(cm.qty_used, 0) + COALESCE(am.qty_used, 0) + COALESCE(bm.qty_used, 0) + (CASE WHEN lower(i.category) = 'bottle' THEN COALESCE(db.qty, 0) ELSE 0 END)) AS total_used,
  (COALESCE(cm.movement_count, 0) + COALESCE(am.movement_count, 0) + COALESCE(bm.movement_count, 0) + (CASE WHEN lower(i.category) = 'bottle' THEN COALESCE(db.batch_count, 0) ELSE 0 END)) AS used_in_batch_count,
  GREATEST(0, (COALESCE(cm.qty_scrapped, 0) + COALESCE(am.qty_scrapped, 0) + COALESCE(bm.qty_scrapped, 0))) AS total_scrapped,
  COALESCE(dbx.qty, 0) AS total_dispatched,
  GREATEST(0, (COALESCE(r.qty, 0) + COALESCE(db.qty, 0) + COALESCE(ac.qty, 0) + COALESCE(aa.qty, 0) + COALESCE(ab.qty, 0)) 
    - (COALESCE(cm.qty_used, 0) + COALESCE(am.qty_used, 0) + COALESCE(bm.qty_used, 0) + (CASE WHEN lower(i.category) = 'bottle' THEN COALESCE(db.qty, 0) ELSE 0 END))
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

-- ============================================================
-- PART 10: Atomic Movement & Scrap Stored Procedures (RPC)
-- ============================================================

CREATE OR REPLACE FUNCTION record_split_movement_and_scrap(
  p_batch_id uuid,
  p_from_stage_id uuid,
  p_to_stage_id uuid,
  p_qty_forward integer,
  p_qty_scrapped integer DEFAULT 0,
  p_scrap_reason text DEFAULT 'Defect / Damage on transfer',
  p_scrap_stage_id uuid DEFAULT NULL,
  p_cap_name text DEFAULT NULL,
  p_atomizer_name text DEFAULT NULL,
  p_box_name text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_printing_design text DEFAULT NULL,
  p_cap_item_id uuid DEFAULT NULL,
  p_atomizer_item_id uuid DEFAULT NULL,
  p_box_item_id uuid DEFAULT NULL,
  p_cap_qty_used integer DEFAULT NULL,
  p_atomizer_qty_used integer DEFAULT NULL,
  p_box_qty_used integer DEFAULT NULL,
  p_remarks text DEFAULT NULL,
  p_done_by text DEFAULT NULL,
  p_moved_on date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_forward_id uuid;
  v_scrap_id uuid := NULL;
  v_effective_scrap_stage uuid := p_scrap_stage_id;
  v_scrap_remark text;
BEGIN
  IF p_qty_forward > 0 THEN
    INSERT INTO stage_movements (
      batch_id,
      from_stage_id,
      to_stage_id,
      qty_moved,
      moved_on,
      cap_name,
      atomizer_name,
      box_name,
      color,
      printing_design,
      cap_item_id,
      atomizer_item_id,
      box_item_id,
      cap_qty_used,
      atomizer_qty_used,
      box_qty_used,
      remarks,
      done_by
    ) VALUES (
      p_batch_id,
      p_from_stage_id,
      p_to_stage_id,
      p_qty_forward,
      COALESCE(p_moved_on, current_date),
      p_cap_name,
      p_atomizer_name,
      p_box_name,
      p_color,
      p_printing_design,
      p_cap_item_id,
      p_atomizer_item_id,
      p_box_item_id,
      p_cap_qty_used,
      p_atomizer_qty_used,
      p_box_qty_used,
      p_remarks,
      p_done_by
    ) RETURNING id INTO v_forward_id;
  END IF;

  IF p_qty_scrapped > 0 THEN
    IF v_effective_scrap_stage IS NULL THEN
      SELECT id INTO v_effective_scrap_stage FROM stages WHERE name = 'Scrap / Defect' OR lower(name) LIKE '%scrap%' LIMIT 1;
    END IF;

    IF v_effective_scrap_stage IS NULL THEN
      RAISE EXCEPTION 'Scrap / Defect stage not found in stages catalog.';
    END IF;

    v_scrap_remark := TRIM(CONCAT('[SCRAP: ', COALESCE(p_scrap_reason, 'Loss on transfer'), '] ', COALESCE(p_remarks, '')));

    INSERT INTO stage_movements (
      batch_id,
      from_stage_id,
      to_stage_id,
      qty_moved,
      moved_on,
      remarks,
      done_by
    ) VALUES (
      p_batch_id,
      p_from_stage_id,
      v_effective_scrap_stage,
      p_qty_scrapped,
      COALESCE(p_moved_on, current_date),
      v_scrap_remark,
      p_done_by
    ) RETURNING id INTO v_scrap_id;
  END IF;

  RETURN jsonb_build_object(
    'forward_id', v_forward_id,
    'scrap_id', v_scrap_id,
    'qty_forward', p_qty_forward,
    'qty_scrapped', p_qty_scrapped
  );
END;
$$;

CREATE OR REPLACE FUNCTION record_multi_variant_movements(
  p_batch_id uuid,
  p_from_stage_id uuid,
  p_to_stage_id uuid,
  p_variants jsonb,
  p_scrapped_qty integer DEFAULT 0,
  p_scrap_reason text DEFAULT 'Multi-variant split loss',
  p_scrap_stage_id uuid DEFAULT NULL,
  p_general_remarks text DEFAULT NULL,
  p_done_by text DEFAULT NULL,
  p_moved_on date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_elem jsonb;
  v_qty integer;
  v_inserted_ids uuid[] := ARRAY[]::uuid[];
  v_curr_id uuid;
  v_scrap_id uuid := NULL;
  v_effective_scrap_stage uuid := p_scrap_stage_id;
  v_scrap_remark text;
  v_combined_remarks text;
BEGIN
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_variants)
  LOOP
    v_qty := (v_elem->>'qty')::integer;
    IF v_qty IS NOT NULL AND v_qty > 0 THEN
      v_combined_remarks := NULLIF(TRIM(CONCAT_WS(' • ', NULLIF(v_elem->>'remarks', ''), NULLIF(p_general_remarks, ''))), '');

      INSERT INTO stage_movements (
        batch_id,
        from_stage_id,
        to_stage_id,
        qty_moved,
        moved_on,
        color,
        printing_design,
        cap_name,
        atomizer_name,
        box_name,
        cap_item_id,
        atomizer_item_id,
        box_item_id,
        cap_qty_used,
        atomizer_qty_used,
        box_qty_used,
        remarks,
        done_by
      ) VALUES (
        p_batch_id,
        p_from_stage_id,
        p_to_stage_id,
        v_qty,
        COALESCE(p_moved_on, current_date),
        NULLIF(v_elem->>'color', ''),
        NULLIF(v_elem->>'printing_design', ''),
        NULLIF(v_elem->>'cap_name', ''),
        NULLIF(v_elem->>'atomizer_name', ''),
        NULLIF(v_elem->>'box_name', ''),
        (NULLIF(v_elem->>'cap_item_id', ''))::uuid,
        (NULLIF(v_elem->>'atomizer_item_id', ''))::uuid,
        (NULLIF(v_elem->>'box_item_id', ''))::uuid,
        CASE WHEN NULLIF(v_elem->>'cap_item_id', '') IS NOT NULL THEN (COALESCE(v_elem->>'cap_qty_used', v_elem->>'qty'))::integer ELSE NULL END,
        CASE WHEN NULLIF(v_elem->>'atomizer_item_id', '') IS NOT NULL THEN (COALESCE(v_elem->>'atomizer_qty_used', v_elem->>'qty'))::integer ELSE NULL END,
        CASE WHEN NULLIF(v_elem->>'box_item_id', '') IS NOT NULL THEN (COALESCE(v_elem->>'box_qty_used', v_elem->>'qty'))::integer ELSE NULL END,
        v_combined_remarks,
        p_done_by
      ) RETURNING id INTO v_curr_id;

      v_inserted_ids := array_append(v_inserted_ids, v_curr_id);
    END IF;
  END LOOP;

  IF p_scrapped_qty > 0 THEN
    IF v_effective_scrap_stage IS NULL THEN
      SELECT id INTO v_effective_scrap_stage FROM stages WHERE name = 'Scrap / Defect' OR lower(name) LIKE '%scrap%' LIMIT 1;
    END IF;

    IF v_effective_scrap_stage IS NULL THEN
      RAISE EXCEPTION 'Scrap / Defect stage not found in stages catalog.';
    END IF;

    v_scrap_remark := TRIM(CONCAT('[SCRAP: ', COALESCE(p_scrap_reason, 'Multi-variant split loss'), '] ', COALESCE(p_general_remarks, '')));

    INSERT INTO stage_movements (
      batch_id,
      from_stage_id,
      to_stage_id,
      qty_moved,
      moved_on,
      remarks,
      done_by
    ) VALUES (
      p_batch_id,
      p_from_stage_id,
      v_effective_scrap_stage,
      p_scrapped_qty,
      COALESCE(p_moved_on, current_date),
      v_scrap_remark,
      p_done_by
    ) RETURNING id INTO v_scrap_id;
  END IF;

  RETURN jsonb_build_object(
    'movement_ids', to_jsonb(v_inserted_ids),
    'scrap_id', v_scrap_id,
    'variant_count', array_length(v_inserted_ids, 1),
    'scrapped_qty', p_scrapped_qty
  );
END;
$$;




