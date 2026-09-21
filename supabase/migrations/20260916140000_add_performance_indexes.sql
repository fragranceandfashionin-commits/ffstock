-- Migration: 20260916140000_add_performance_indexes.sql
-- Description: Adds essential foreign-key and filter-ordering indexes to eliminate sequential scans on high-traffic tables.

-- Inward Batches
CREATE INDEX IF NOT EXISTS inward_batches_item_id_idx ON inward_batches(item_id);
CREATE INDEX IF NOT EXISTS inward_batches_supplier_id_idx ON inward_batches(supplier_id);

-- Stage Movements
CREATE INDEX IF NOT EXISTS stage_movements_from_stage_idx ON stage_movements(from_stage_id);
CREATE INDEX IF NOT EXISTS stage_movements_to_stage_idx ON stage_movements(to_stage_id);
CREATE INDEX IF NOT EXISTS stage_movements_moved_on_idx ON stage_movements(moved_on DESC);

-- Dispatches
CREATE INDEX IF NOT EXISTS dispatches_dispatched_on_idx ON dispatches(dispatched_on DESC);

-- Items & Suppliers
CREATE INDEX IF NOT EXISTS items_category_idx ON items(category);
CREATE INDEX IF NOT EXISTS items_name_idx ON items(name);
CREATE INDEX IF NOT EXISTS suppliers_name_idx ON suppliers(name);
