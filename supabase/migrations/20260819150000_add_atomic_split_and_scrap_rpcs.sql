-- ============================================================
-- Migration: Add Atomic Split Movements and Scrap Stored Functions (RPC)
-- Ensures multi-step forward movements + scrap defect recordings execute
-- inside a single ACID database transaction.
-- Idempotent: safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION record_split_movement_and_scrap(
  p_batch_id uuid,
  p_from_stage_id uuid,
  p_to_stage_id uuid,
  p_qty_forward integer,
  p_qty_scrapped integer DEFAULT 0,
  p_scrap_reason text DEFAULT 'Defect / Damage on transfer',
  p_scrap_stage_id uuid DEFAULT NULL,
  p_cap_name text DEFAULT NULL,
  p_atomizer_name text DEFAULT NULL,
  p_box_name text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_printing_design text DEFAULT NULL,
  p_cap_item_id uuid DEFAULT NULL,
  p_atomizer_item_id uuid DEFAULT NULL,
  p_box_item_id uuid DEFAULT NULL,
  p_cap_qty_used integer DEFAULT NULL,
  p_atomizer_qty_used integer DEFAULT NULL,
  p_box_qty_used integer DEFAULT NULL,
  p_remarks text DEFAULT NULL,
  p_done_by text DEFAULT NULL,
  p_moved_on date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_forward_id uuid;
  v_scrap_id uuid := NULL;
  v_effective_scrap_stage uuid := p_scrap_stage_id;
  v_scrap_remark text;
BEGIN
  -- 1. Insert forward movement (if qty > 0)
  IF p_qty_forward > 0 THEN
    INSERT INTO stage_movements (
      batch_id,
      from_stage_id,
      to_stage_id,
      qty_moved,
      moved_on,
      cap_name,
      atomizer_name,
      box_name,
      color,
      printing_design,
      cap_item_id,
      atomizer_item_id,
      box_item_id,
      cap_qty_used,
      atomizer_qty_used,
      box_qty_used,
      remarks,
      done_by
    ) VALUES (
      p_batch_id,
      p_from_stage_id,
      p_to_stage_id,
      p_qty_forward,
      COALESCE(p_moved_on, current_date),
      p_cap_name,
      p_atomizer_name,
      p_box_name,
      p_color,
      p_printing_design,
      p_cap_item_id,
      p_atomizer_item_id,
      p_box_item_id,
      p_cap_qty_used,
      p_atomizer_qty_used,
      p_box_qty_used,
      p_remarks,
      p_done_by
    ) RETURNING id INTO v_forward_id;
  END IF;

  -- 2. Insert scrap movement atomically (if qty_scrapped > 0)
  IF p_qty_scrapped > 0 THEN
    IF v_effective_scrap_stage IS NULL THEN
      SELECT id INTO v_effective_scrap_stage FROM stages WHERE name = 'Scrap / Defect' OR lower(name) LIKE '%scrap%' LIMIT 1;
    END IF;

    IF v_effective_scrap_stage IS NULL THEN
      RAISE EXCEPTION 'Scrap / Defect stage not found in stages catalog.';
    END IF;

    v_scrap_remark := TRIM(CONCAT('[SCRAP: ', COALESCE(p_scrap_reason, 'Loss on transfer'), '] ', COALESCE(p_remarks, '')));

    INSERT INTO stage_movements (
      batch_id,
      from_stage_id,
      to_stage_id,
      qty_moved,
      moved_on,
      remarks,
      done_by
    ) VALUES (
      p_batch_id,
      p_from_stage_id,
      v_effective_scrap_stage,
      p_qty_scrapped,
      COALESCE(p_moved_on, current_date),
      v_scrap_remark,
      p_done_by
    ) RETURNING id INTO v_scrap_id;
  END IF;

  RETURN jsonb_build_object(
    'forward_id', v_forward_id,
    'scrap_id', v_scrap_id,
    'qty_forward', p_qty_forward,
    'qty_scrapped', p_qty_scrapped
  );
END;
$$;


CREATE OR REPLACE FUNCTION record_multi_variant_movements(
  p_batch_id uuid,
  p_from_stage_id uuid,
  p_to_stage_id uuid,
  p_variants jsonb,
  p_scrapped_qty integer DEFAULT 0,
  p_scrap_reason text DEFAULT 'Multi-variant split loss',
  p_scrap_stage_id uuid DEFAULT NULL,
  p_general_remarks text DEFAULT NULL,
  p_done_by text DEFAULT NULL,
  p_moved_on date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_elem jsonb;
  v_qty integer;
  v_inserted_ids uuid[] := ARRAY[]::uuid[];
  v_curr_id uuid;
  v_scrap_id uuid := NULL;
  v_effective_scrap_stage uuid := p_scrap_stage_id;
  v_scrap_remark text;
  v_combined_remarks text;
BEGIN
  -- 1. Insert all variant movements
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_variants)
  LOOP
    v_qty := (v_elem->>'qty')::integer;
    IF v_qty IS NOT NULL AND v_qty > 0 THEN
      v_combined_remarks := NULLIF(TRIM(CONCAT_WS(' • ', NULLIF(v_elem->>'remarks', ''), NULLIF(p_general_remarks, ''))), '');

      INSERT INTO stage_movements (
        batch_id,
        from_stage_id,
        to_stage_id,
        qty_moved,
        moved_on,
        color,
        printing_design,
        cap_name,
        atomizer_name,
        box_name,
        cap_item_id,
        atomizer_item_id,
        box_item_id,
        cap_qty_used,
        atomizer_qty_used,
        box_qty_used,
        remarks,
        done_by
      ) VALUES (
        p_batch_id,
        p_from_stage_id,
        p_to_stage_id,
        v_qty,
        COALESCE(p_moved_on, current_date),
        NULLIF(v_elem->>'color', ''),
        NULLIF(v_elem->>'printing_design', ''),
        NULLIF(v_elem->>'cap_name', ''),
        NULLIF(v_elem->>'atomizer_name', ''),
        NULLIF(v_elem->>'box_name', ''),
        (NULLIF(v_elem->>'cap_item_id', ''))::uuid,
        (NULLIF(v_elem->>'atomizer_item_id', ''))::uuid,
        (NULLIF(v_elem->>'box_item_id', ''))::uuid,
        CASE WHEN NULLIF(v_elem->>'cap_item_id', '') IS NOT NULL THEN (COALESCE(v_elem->>'cap_qty_used', v_elem->>'qty'))::integer ELSE NULL END,
        CASE WHEN NULLIF(v_elem->>'atomizer_item_id', '') IS NOT NULL THEN (COALESCE(v_elem->>'atomizer_qty_used', v_elem->>'qty'))::integer ELSE NULL END,
        CASE WHEN NULLIF(v_elem->>'box_item_id', '') IS NOT NULL THEN (COALESCE(v_elem->>'box_qty_used', v_elem->>'qty'))::integer ELSE NULL END,
        v_combined_remarks,
        p_done_by
      ) RETURNING id INTO v_curr_id;

      v_inserted_ids := array_append(v_inserted_ids, v_curr_id);
    END IF;
  END LOOP;

  -- 2. Insert inline scrap defect atomically if specified
  IF p_scrapped_qty > 0 THEN
    IF v_effective_scrap_stage IS NULL THEN
      SELECT id INTO v_effective_scrap_stage FROM stages WHERE name = 'Scrap / Defect' OR lower(name) LIKE '%scrap%' LIMIT 1;
    END IF;

    IF v_effective_scrap_stage IS NULL THEN
      RAISE EXCEPTION 'Scrap / Defect stage not found in stages catalog.';
    END IF;

    v_scrap_remark := TRIM(CONCAT('[SCRAP: ', COALESCE(p_scrap_reason, 'Multi-variant split loss'), '] ', COALESCE(p_general_remarks, '')));

    INSERT INTO stage_movements (
      batch_id,
      from_stage_id,
      to_stage_id,
      qty_moved,
      moved_on,
      remarks,
      done_by
    ) VALUES (
      p_batch_id,
      p_from_stage_id,
      v_effective_scrap_stage,
      p_scrapped_qty,
      COALESCE(p_moved_on, current_date),
      v_scrap_remark,
      p_done_by
    ) RETURNING id INTO v_scrap_id;
  END IF;

  RETURN jsonb_build_object(
    'movement_ids', to_jsonb(v_inserted_ids),
    'scrap_id', v_scrap_id,
    'variant_count', array_length(v_inserted_ids, 1),
    'scrapped_qty', p_scrapped_qty
  );
END;
$$;
