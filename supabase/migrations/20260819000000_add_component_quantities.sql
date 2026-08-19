-- ============================================================
-- Add independent component quantity tracking columns
-- ============================================================

/*
# Component Quantity Tracking

## Why
Components (Caps, Atomizers, Boxes) were previously linked to inward batches
and stage movements by reference only (cap_item_id, etc.) with no independent
quantity. This made it impossible to answer:
  - "How many caps arrived in this batch?"
  - "How many atomizers were consumed at the Filling stage?"
  - "What is the remaining cap inventory?"

## What this does
1. Adds `cap_qty`, `atomizer_qty`, `box_qty` to `inward_batches` so each
   batch receipt can record exactly how many of each component arrived.
2. Adds `cap_qty_used`, `atomizer_qty_used`, `box_qty_used` to
   `stage_movements` so each production step records exactly how many
   components were consumed.

Idempotent: safe to re-run.
*/

-- ─────────────────────────────────────────────────────────────
-- 1. Component quantities on inward batches
-- ─────────────────────────────────────────────────────────────

ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS cap_qty integer;
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS atomizer_qty integer;
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS box_qty integer;

-- ─────────────────────────────────────────────────────────────
-- 2. Component consumption on stage movements
-- ─────────────────────────────────────────────────────────────

ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS cap_qty_used integer;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS atomizer_qty_used integer;
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS box_qty_used integer;
