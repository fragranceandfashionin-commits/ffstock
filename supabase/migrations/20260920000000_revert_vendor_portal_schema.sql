-- ============================================================
-- REVERT MIGRATION: 100% CLEAN ROLLBACK FOR VENDOR PORTAL SCHEMA
-- Version: 20260920000000
-- ============================================================

-- Drop RPC functions
DROP FUNCTION IF EXISTS repeat_production_order(uuid);
DROP FUNCTION IF EXISTS create_production_order_with_allocations(uuid, text, jsonb, integer, date, text);

-- Drop triggers and trigger functions
DROP TRIGGER IF EXISTS set_order_no ON production_orders;
DROP FUNCTION IF EXISTS generate_order_no();

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS material_allocations CASCADE;
DROP TABLE IF EXISTS production_orders CASCADE;
DROP TABLE IF EXISTS bom_categories CASCADE;
DROP TABLE IF EXISTS clients CASCADE;

-- Drop added columns from suppliers
ALTER TABLE suppliers DROP COLUMN IF EXISTS phone;
ALTER TABLE suppliers DROP COLUMN IF EXISTS email;
ALTER TABLE suppliers DROP COLUMN IF EXISTS contact_person;
ALTER TABLE suppliers DROP COLUMN IF EXISTS categories_supplied;
ALTER TABLE suppliers DROP COLUMN IF EXISTS specific_materials;

-- NOTE: The "shared_update_suppliers" RLS policy is INTENTIONALLY PRESERVED.
-- It fixes a pre-existing bug in setup.sql (lines 244-247) where suppliers
-- had SELECT/INSERT/DELETE but NOT UPDATE. Removing it would re-introduce
-- the RLS blocking bug even for the original contact field editing.
