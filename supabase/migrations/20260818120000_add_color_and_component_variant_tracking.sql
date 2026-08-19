-- ============================================================
-- Migration: Add color & component variant tracking
-- Adds color, cap_item_id, atomizer_item_id to inward_batches,
-- stage_movements, and dispatches for full product traceability.
-- Adds default color to items.
-- Idempotent: safe to re-run.
-- ============================================================

/*
# Color & Component Variant Tracking

## Why
Different batches of the same bottle type can have different colors
(Clear, Frosted Blue, Amber, etc.) and different caps/atomizers.
The system had no structured way to track these per-batch variations.

Cap and atomizer names on stage_movements were free text with no
link to the items catalogue and no inventory deduction awareness.

## What this does
- Adds `color` to `items` (optional default color for an item).
- Adds `color`, `cap_item_id`, `atomizer_item_id` to `inward_batches`
  so each incoming batch can declare its intended color and components.
- Adds `color`, `cap_item_id`, `atomizer_item_id` to `stage_movements`
  so each stage transfer can record what color was applied or which
  cap/atomizer was assembled.
- Adds `color`, `cap_name`, `atomizer_name`, `product_specs` to
  `dispatches` so shipped goods have complete product specification.

All new columns are nullable for backward compatibility.
*/

-- ─────────────────────────────────────────────────────────────
-- 1. Items: optional default color
-- ─────────────────────────────────────────────────────────────
ALTER TABLE items ADD COLUMN IF NOT EXISTS color text;

-- ─────────────────────────────────────────────────────────────
-- 2. Inward batches: batch-level color & intended components
-- ─────────────────────────────────────────────────────────────
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS cap_item_id uuid REFERENCES items(id);
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS atomizer_item_id uuid REFERENCES items(id);

-- ─────────────────────────────────────────────────────────────
-- 3. Stage movements: color applied & components assembled
--    (cap_name and atomizer_name already exist as text columns)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS cap_item_id uuid REFERENCES items(id);
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS atomizer_item_id uuid REFERENCES items(id);

-- ─────────────────────────────────────────────────────────────
-- 4. Dispatches: final assembled product specification
-- ─────────────────────────────────────────────────────────────
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS cap_name text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS atomizer_name text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS product_specs text;

-- ─────────────────────────────────────────────────────────────
-- 5. Indexes for component lookups
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS inward_batches_cap_item_id_idx ON inward_batches(cap_item_id);
CREATE INDEX IF NOT EXISTS inward_batches_atomizer_item_id_idx ON inward_batches(atomizer_item_id);
CREATE INDEX IF NOT EXISTS stage_movements_cap_item_id_idx ON stage_movements(cap_item_id);
CREATE INDEX IF NOT EXISTS stage_movements_atomizer_item_id_idx ON stage_movements(atomizer_item_id);
