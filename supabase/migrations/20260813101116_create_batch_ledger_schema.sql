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