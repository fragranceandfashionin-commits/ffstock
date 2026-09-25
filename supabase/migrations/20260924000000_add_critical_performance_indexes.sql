-- Migration: 20260924000000_add_critical_performance_indexes.sql
-- Description: Adds missing high-traffic foreign-key, composite, and sort-order indexes to eliminate sequential scans and in-memory sorting.

-- 1. Stage Movements: High-frequency queries filter by batch_id and sort chronologically
CREATE INDEX IF NOT EXISTS stage_movements_batch_id_idx ON stage_movements(batch_id);
CREATE INDEX IF NOT EXISTS stage_movements_batch_moved_idx ON stage_movements(batch_id, moved_on ASC, created_at ASC);

-- 2. Dispatches: High-frequency queries filter by batch_id and sort descending
CREATE INDEX IF NOT EXISTS dispatches_batch_id_idx ON dispatches(batch_id);
CREATE INDEX IF NOT EXISTS dispatches_batch_dispatched_idx ON dispatches(batch_id, dispatched_on DESC, created_at DESC);

-- 3. Inward Batches: Primary query orders by received_on DESC
CREATE INDEX IF NOT EXISTS inward_batches_received_on_idx ON inward_batches(received_on DESC);

-- 4. Batch Allocations: High-frequency lookups by source and destination batch IDs
CREATE INDEX IF NOT EXISTS batch_allocations_source_batch_idx ON batch_allocations(source_batch_id);
CREATE INDEX IF NOT EXISTS batch_allocations_destination_batch_idx ON batch_allocations(destination_batch_id);

-- 5. Item Stock Receipts: High-frequency lookups by item_id and received_on
CREATE INDEX IF NOT EXISTS item_stock_receipts_item_id_idx ON item_stock_receipts(item_id);
CREATE INDEX IF NOT EXISTS item_stock_receipts_received_on_idx ON item_stock_receipts(received_on DESC);
