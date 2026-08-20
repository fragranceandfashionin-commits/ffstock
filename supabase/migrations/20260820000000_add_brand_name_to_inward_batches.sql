-- ============================================================
-- Migration: Add brand_name column to inward_batches
-- ============================================================

/*
# Add brand_name column to inward_batches table

1. Changes
- Add `brand_name` (text, nullable) to `inward_batches` table.
  This allows tracking the client brand / party (e.g. "Royal Club", "Zara", "Bella Vita")
  independently from the batch lot identifier (`batch_no`).
- Create an index on `brand_name` for fast filtering and searching.

2. Safety
- Uses `ADD COLUMN IF NOT EXISTS` so it is safe and idempotent.
*/

ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS brand_name text;

CREATE INDEX IF NOT EXISTS idx_inward_batches_brand_name ON inward_batches(brand_name);
