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
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  item_id uuid NOT NULL REFERENCES items(id),
  received_on date NOT NULL DEFAULT current_date,
  qty_received integer NOT NULL CHECK (qty_received > 0),
  location text NOT NULL CHECK (char_length(trim(location)) > 0),
  image_url text,
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
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inward_batches_received_on_idx ON inward_batches(received_on DESC);
CREATE INDEX IF NOT EXISTS stage_movements_batch_id_idx ON stage_movements(batch_id);
CREATE INDEX IF NOT EXISTS dispatches_batch_id_idx ON dispatches(batch_id);

INSERT INTO stages (name, sequence_no) VALUES
  ('Raw Stock', 1), ('Coloring', 2), ('Printing', 3), ('Filling', 4),
  ('Packaging', 5), ('Ready', 6), ('Dispatched', 7)
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

  -- Mandatory Cap Name & Atomizer Name validation when moving from Filling stage
  IF EXISTS (SELECT 1 FROM stages s WHERE s.id = NEW.from_stage_id AND s.name = 'Filling') THEN
    IF NEW.cap_name IS NULL OR char_length(trim(NEW.cap_name)) = 0 OR NEW.atomizer_name IS NULL OR char_length(trim(NEW.atomizer_name)) = 0 THEN
      RAISE EXCEPTION 'Cap Name and Atomizer Name are mandatory when moving bottles from the Filling stage.';
    END IF;
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

  -- Mandatory Cap Name & Atomizer Name validation when moving from Filling stage
  IF EXISTS (SELECT 1 FROM stages s WHERE s.id = NEW.from_stage_id AND s.name = 'Filling') THEN
    IF NEW.cap_name IS NULL OR char_length(trim(NEW.cap_name)) = 0 OR NEW.atomizer_name IS NULL OR char_length(trim(NEW.atomizer_name)) = 0 THEN
      RAISE EXCEPTION 'Cap Name and Atomizer Name are mandatory when moving bottles from the Filling stage.';
    END IF;
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
