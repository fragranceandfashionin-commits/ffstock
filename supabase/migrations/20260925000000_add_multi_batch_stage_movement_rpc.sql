-- Migration: Add Atomic Multi-Batch Stage Movement & Scrap RPC
-- Enables advancing and scrapping consolidated item stock spanning multiple batches in a single atomic transaction.

CREATE OR REPLACE FUNCTION execute_multi_batch_stage_movement(
  p_batch_splits jsonb,
  p_from_stage_id uuid,
  p_to_stage_id uuid,
  p_moved_on date DEFAULT current_date,
  p_variant_name text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_printing_design text DEFAULT NULL,
  p_cap_name text DEFAULT NULL,
  p_atomizer_name text DEFAULT NULL,
  p_box_name text DEFAULT NULL,
  p_cap_item_id uuid DEFAULT NULL,
  p_atomizer_item_id uuid DEFAULT NULL,
  p_box_item_id uuid DEFAULT NULL,
  p_remarks text DEFAULT NULL,
  p_done_by text DEFAULT NULL,
  p_scrap_splits jsonb DEFAULT NULL,
  p_scrap_reason text DEFAULT NULL,
  p_scrap_stage_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_split record;
  v_batch_id uuid;
  v_split_qty integer;
  v_item_id uuid;
  v_first_item_id uuid := NULL;
  v_created_ids uuid[] := '{}';
  v_scrap_ids uuid[] := '{}';
  v_new_id uuid;
  v_total_moved integer := 0;
  v_total_scrapped integer := 0;
  v_effective_scrap_stage uuid := p_scrap_stage_id;
  v_scrap_remark text;
BEGIN
  IF p_batch_splits IS NULL OR jsonb_array_length(p_batch_splits) = 0 THEN
    RAISE EXCEPTION 'Batch splits payload cannot be empty.';
  END IF;

  IF p_from_stage_id = p_to_stage_id THEN
    RAISE EXCEPTION 'Source stage and destination stage cannot be the same.';
  END IF;

  -- 1. Lock and validate all participating forward batches upfront
  FOR v_split IN SELECT * FROM jsonb_to_recordset(p_batch_splits) AS x(batch_id uuid, qty integer)
  LOOP
    v_batch_id := v_split.batch_id;
    v_split_qty := v_split.qty;

    IF v_split_qty <= 0 THEN
      RAISE EXCEPTION 'Split quantity must be greater than zero. Received: %', v_split_qty;
    END IF;

    -- Lock batch row and verify item consistency
    SELECT item_id INTO v_item_id
    FROM inward_batches
    WHERE id = v_batch_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch with ID % not found.', v_batch_id;
    END IF;

    IF v_first_item_id IS NULL THEN
      v_first_item_id := v_item_id;
    ELSIF v_first_item_id <> v_item_id THEN
      RAISE EXCEPTION 'All batches in a multi-batch movement must belong to the same item.';
    END IF;
  END LOOP;

  -- 2. Lock and validate any additional scrap batches
  IF p_scrap_splits IS NOT NULL AND jsonb_array_length(p_scrap_splits) > 0 THEN
    FOR v_split IN SELECT * FROM jsonb_to_recordset(p_scrap_splits) AS x(batch_id uuid, qty integer)
    LOOP
      v_batch_id := v_split.batch_id;
      v_split_qty := v_split.qty;

      IF v_split_qty > 0 THEN
        SELECT item_id INTO v_item_id
        FROM inward_batches
        WHERE id = v_batch_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Scrap batch with ID % not found.', v_batch_id;
        END IF;

        IF v_first_item_id IS NOT NULL AND v_first_item_id <> v_item_id THEN
          RAISE EXCEPTION 'Scrap batches must belong to the same item as forward batches.';
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 3. Insert forward stage_movements records (triggers validate_stage_movement per row)
  FOR v_split IN SELECT * FROM jsonb_to_recordset(p_batch_splits) AS x(batch_id uuid, qty integer)
  LOOP
    v_batch_id := v_split.batch_id;
    v_split_qty := v_split.qty;

    INSERT INTO stage_movements (
      batch_id,
      from_stage_id,
      to_stage_id,
      qty_moved,
      moved_on,
      variant_name,
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
      v_batch_id,
      p_from_stage_id,
      p_to_stage_id,
      v_split_qty,
      COALESCE(p_moved_on, current_date),
      p_variant_name,
      p_color,
      p_printing_design,
      p_cap_name,
      p_atomizer_name,
      p_box_name,
      p_cap_item_id,
      p_atomizer_item_id,
      p_box_item_id,
      CASE WHEN p_cap_item_id IS NOT NULL THEN v_split_qty ELSE NULL END,
      CASE WHEN p_atomizer_item_id IS NOT NULL THEN v_split_qty ELSE NULL END,
      CASE WHEN p_box_item_id IS NOT NULL THEN v_split_qty ELSE NULL END,
      p_remarks,
      p_done_by
    )
    RETURNING id INTO v_new_id;

    v_created_ids := array_append(v_created_ids, v_new_id);
    v_total_moved := v_total_moved + v_split_qty;
  END LOOP;

  -- 4. Insert scrap stage_movements records if scrap splits are provided
  IF p_scrap_splits IS NOT NULL AND jsonb_array_length(p_scrap_splits) > 0 THEN
    IF v_effective_scrap_stage IS NULL THEN
      SELECT id INTO v_effective_scrap_stage
      FROM stages
      WHERE name = 'Scrap / Defect' OR lower(name) LIKE '%scrap%'
      LIMIT 1;
    END IF;

    IF v_effective_scrap_stage IS NULL THEN
      RAISE EXCEPTION 'Scrap / Defect stage not found in stages catalog.';
    END IF;

    v_scrap_remark := TRIM(CONCAT('[SCRAP: ', COALESCE(p_scrap_reason, 'Loss on transfer'), '] ', COALESCE(p_remarks, '')));

    FOR v_split IN SELECT * FROM jsonb_to_recordset(p_scrap_splits) AS x(batch_id uuid, qty integer)
    LOOP
      v_batch_id := v_split.batch_id;
      v_split_qty := v_split.qty;

      IF v_split_qty > 0 THEN
        INSERT INTO stage_movements (
          batch_id,
          from_stage_id,
          to_stage_id,
          qty_moved,
          moved_on,
          variant_name,
          color,
          printing_design,
          cap_name,
          atomizer_name,
          box_name,
          remarks,
          done_by
        ) VALUES (
          v_batch_id,
          p_from_stage_id,
          v_effective_scrap_stage,
          v_split_qty,
          COALESCE(p_moved_on, current_date),
          p_variant_name,
          p_color,
          p_printing_design,
          p_cap_name,
          p_atomizer_name,
          p_box_name,
          v_scrap_remark,
          p_done_by
        )
        RETURNING id INTO v_new_id;

        v_scrap_ids := array_append(v_scrap_ids, v_new_id);
        v_total_scrapped := v_total_scrapped + v_split_qty;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'total_moved', v_total_moved,
    'total_scrapped', v_total_scrapped,
    'movement_ids', to_jsonb(v_created_ids),
    'scrap_ids', to_jsonb(v_scrap_ids)
  );
END;
$$;
