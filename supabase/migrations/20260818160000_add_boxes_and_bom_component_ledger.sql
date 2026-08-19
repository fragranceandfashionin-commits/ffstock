-- ============================================================
-- Migration: Add Box / Packaging tracking & BOM component ledger support
-- Adds box_item_id and box_name to inward_batches, stage_movements,
-- and dispatches for full 360-degree product packaging traceability.
-- Idempotent: safe to re-run.
-- ============================================================

/*
# Box & Packaging Tracking Migration

## Why
In addition to Caps and Atomizers, Perfume & Fragrance manufacturing
requires packaging boxes (mono-cartons, gift boxes, master outer cartons).
This migration adds explicit columns to link packaging items and track
box consumption per batch.

## What this does
- Adds `box_item_id` to `inward_batches` (optional intended packaging).
- Adds `box_item_id` and `box_name` to `stage_movements` (box assembled during Packaging stage).
- Adds `box_item_id` and `box_name` to `dispatches` (packaged product specification).
- Adds indexes on box columns for rapid join and lookup performance.

All new columns are nullable for 100% backward compatibility.
*/

-- ─────────────────────────────────────────────────────────────
-- 1. Inward batches: intended box / packaging
-- ─────────────────────────────────────────────────────────────
ALTER TABLE inward_batches ADD COLUMN IF NOT EXISTS box_item_id uuid REFERENCES items(id);
CREATE INDEX IF NOT EXISTS inward_batches_box_item_id_idx ON inward_batches(box_item_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Stage movements: box assembled during production/packaging
-- ─────────────────────────────────────────────────────────────
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS box_item_id uuid REFERENCES items(id);
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS box_name text;
CREATE INDEX IF NOT EXISTS stage_movements_box_item_id_idx ON stage_movements(box_item_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Dispatches: final packaging specification
-- ─────────────────────────────────────────────────────────────
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS box_item_id uuid REFERENCES items(id);
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS box_name text;
CREATE INDEX IF NOT EXISTS dispatches_box_item_id_idx ON dispatches(box_item_id);
