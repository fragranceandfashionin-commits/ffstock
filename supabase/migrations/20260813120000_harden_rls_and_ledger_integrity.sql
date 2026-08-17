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
