-- Migration: 20260926000000_production_readiness_consolidation.sql
-- Description: Consolidated turnkey script for production deployment.
-- Run in Supabase SQL Editor to deploy missing RPCs, Views, RBAC logic, and Accounts.

-- 1. CRITICAL PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS stage_movements_batch_id_idx ON stage_movements(batch_id);
CREATE INDEX IF NOT EXISTS stage_movements_batch_moved_idx ON stage_movements(batch_id, moved_on ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS dispatches_batch_id_idx ON dispatches(batch_id);
CREATE INDEX IF NOT EXISTS dispatches_batch_dispatched_idx ON dispatches(batch_id, dispatched_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS inward_batches_received_on_idx ON inward_batches(received_on DESC);
CREATE INDEX IF NOT EXISTS batch_allocations_source_batch_idx ON batch_allocations(source_batch_id);
CREATE INDEX IF NOT EXISTS batch_allocations_destination_batch_idx ON batch_allocations(destination_batch_id);
CREATE INDEX IF NOT EXISTS item_stock_receipts_item_id_idx ON item_stock_receipts(item_id);
CREATE INDEX IF NOT EXISTS item_stock_receipts_received_on_idx ON item_stock_receipts(received_on DESC);

-- 2. REVERSE BATCH ALLOCATION RPC
CREATE OR REPLACE FUNCTION public.reverse_batch_allocation(
  p_allocation_id uuid,
  p_reversed_by text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orig record;
  v_raw_stage_id uuid;
  v_dest_available integer;
  v_new_allocation_id uuid;
  v_reason_text text;
BEGIN
  SELECT * INTO v_orig FROM batch_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF v_orig.id IS NULL THEN
    RAISE EXCEPTION 'Allocation record % does not exist.', p_allocation_id;
  END IF;

  IF v_orig.allocation_type = 'reversal' THEN
    RAISE EXCEPTION 'Cannot reverse an allocation that is already a reversal entry.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM batch_allocations
    WHERE allocation_type = 'reversal'
      AND source_batch_id = v_orig.destination_batch_id
      AND destination_batch_id = v_orig.source_batch_id
      AND remarks LIKE '%' || p_allocation_id::text || '%'
  ) THEN
    RAISE EXCEPTION 'Allocation % has already been reversed.', p_allocation_id;
  END IF;

  IF v_orig.source_batch_id < v_orig.destination_batch_id THEN
    PERFORM 1 FROM inward_batches WHERE id = v_orig.source_batch_id FOR UPDATE;
    PERFORM 1 FROM inward_batches WHERE id = v_orig.destination_batch_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM inward_batches WHERE id = v_orig.destination_batch_id FOR UPDATE;
    PERFORM 1 FROM inward_batches WHERE id = v_orig.source_batch_id FOR UPDATE;
  END IF;

  SELECT id INTO v_raw_stage_id FROM stages WHERE sequence_no = 1 OR name = 'Raw Stock' LIMIT 1;
  IF v_raw_stage_id IS NULL THEN
    RAISE EXCEPTION 'Raw Stock stage not found in stages catalog.';
  END IF;

  SELECT COALESCE(qty_available, 0) INTO v_dest_available
  FROM v_stage_stock
  WHERE batch_id = v_orig.destination_batch_id AND stage_id = v_raw_stage_id;

  IF COALESCE(v_dest_available, 0) < v_orig.allocated_qty THEN
    RAISE EXCEPTION 'Cannot reverse allocation: destination batch only has % units available in Raw Stock, but % units are required.',
      COALESCE(v_dest_available, 0), v_orig.allocated_qty;
  END IF;

  v_reason_text := TRIM(CONCAT(
    '[REVERSAL of allocation ', v_orig.id::text, '] ',
    COALESCE(p_reason, 'Allocation reversed by supervisor')
  ));

  INSERT INTO batch_allocations (
    source_batch_id,
    destination_batch_id,
    allocated_qty,
    allocated_on,
    allocation_type,
    allocated_by,
    remarks
  ) VALUES (
    v_orig.destination_batch_id,
    v_orig.source_batch_id,
    v_orig.allocated_qty,
    CURRENT_DATE,
    'reversal',
    COALESCE(p_reversed_by, 'Supervisor'),
    v_reason_text
  )
  RETURNING id INTO v_new_allocation_id;

  RETURN v_new_allocation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_batch_allocation TO anon, authenticated;

-- 3. MULTI-BATCH STAGE MOVEMENT RPC
ALTER TABLE stage_movements ADD COLUMN IF NOT EXISTS variant_name text;
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS variant_name text;

CREATE OR REPLACE FUNCTION public.execute_multi_batch_stage_movement(
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
SECURITY DEFINER
SET search_path = public, extensions
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

  FOR v_split IN SELECT * FROM jsonb_to_recordset(p_batch_splits) AS x(batch_id uuid, qty integer)
  LOOP
    v_batch_id := v_split.batch_id;
    v_split_qty := v_split.qty;

    IF v_split_qty <= 0 THEN
      RAISE EXCEPTION 'Split quantity must be greater than zero. Received: %', v_split_qty;
    END IF;

    SELECT item_id INTO v_item_id
    FROM inward_batches
    WHERE id = v_batch_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch with ID % not found.', v_batch_id;
    END IF;

    IF v_first_item_id IS NULL THEN
      v_first_item_id := v_item_id;
    ELSIF v_first_item_id <> v_item_id THEN
      RAISE EXCEPTION 'All batches in a multi-batch movement must belong to the same item.';
    END IF;
  END LOOP;

  IF p_scrap_splits IS NOT NULL AND jsonb_array_length(p_scrap_splits) > 0 THEN
    FOR v_split IN SELECT * FROM jsonb_to_recordset(p_scrap_splits) AS x(batch_id uuid, qty integer)
    LOOP
      v_batch_id := v_split.batch_id;
      v_split_qty := v_split.qty;

      IF v_split_qty > 0 THEN
        SELECT item_id INTO v_item_id
        FROM inward_batches
        WHERE id = v_batch_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Scrap batch with ID % not found.', v_batch_id;
        END IF;

        IF v_first_item_id IS NOT NULL AND v_first_item_id <> v_item_id THEN
          RAISE EXCEPTION 'Scrap batches must belong to the same item as forward batches.';
        END IF;
      END IF;
    END LOOP;
  END IF;

  FOR v_split IN SELECT * FROM jsonb_to_recordset(p_batch_splits) AS x(batch_id uuid, qty integer)
  LOOP
    v_batch_id := v_split.batch_id;
    v_split_qty := v_split.qty;

    INSERT INTO stage_movements (
      batch_id, from_stage_id, to_stage_id, qty_moved, moved_on,
      variant_name, color, printing_design, cap_name, atomizer_name,
      box_name, cap_item_id, atomizer_item_id, box_item_id,
      cap_qty_used, atomizer_qty_used, box_qty_used, remarks, done_by
    ) VALUES (
      v_batch_id, p_from_stage_id, p_to_stage_id, v_split_qty, COALESCE(p_moved_on, current_date),
      p_variant_name, p_color, p_printing_design, p_cap_name, p_atomizer_name,
      p_box_name, p_cap_item_id, p_atomizer_item_id, p_box_item_id,
      CASE WHEN p_cap_item_id IS NOT NULL THEN v_split_qty ELSE NULL END,
      CASE WHEN p_atomizer_item_id IS NOT NULL THEN v_split_qty ELSE NULL END,
      CASE WHEN p_box_item_id IS NOT NULL THEN v_split_qty ELSE NULL END,
      p_remarks, p_done_by
    )
    RETURNING id INTO v_new_id;

    v_created_ids := array_append(v_created_ids, v_new_id);
    v_total_moved := v_total_moved + v_split_qty;
  END LOOP;

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
          batch_id, from_stage_id, to_stage_id, qty_moved, moved_on,
          variant_name, color, printing_design, cap_name, atomizer_name,
          box_name, remarks, done_by
        ) VALUES (
          v_batch_id, p_from_stage_id, v_effective_scrap_stage, v_split_qty, COALESCE(p_moved_on, current_date),
          p_variant_name, p_color, p_printing_design, p_cap_name, p_atomizer_name,
          p_box_name, v_scrap_remark, p_done_by
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

GRANT EXECUTE ON FUNCTION public.execute_multi_batch_stage_movement TO anon, authenticated;

-- 4. SYNCHRONIZE v_component_stock VIEW
CREATE OR REPLACE VIEW public.v_component_stock
WITH (security_invoker = true) AS
WITH
  receipts_agg AS (
    SELECT item_id, COALESCE(SUM(qty), 0) AS qty, COUNT(id) AS receipt_count
    FROM item_stock_receipts
    GROUP BY item_id
  ),
  direct_batches_agg AS (
    SELECT item_id, COALESCE(SUM(qty_received), 0) AS qty, COUNT(id) AS batch_count
    FROM inward_batches
    GROUP BY item_id
  ),
  attached_caps_agg AS (
    SELECT cap_item_id AS item_id, COALESCE(SUM(COALESCE(cap_qty, qty_received)), 0) AS qty, COUNT(id) AS batch_count
    FROM inward_batches
    WHERE cap_item_id IS NOT NULL AND (item_id IS NULL OR cap_item_id <> item_id)
    GROUP BY cap_item_id
  ),
  attached_atomizers_agg AS (
    SELECT atomizer_item_id AS item_id, COALESCE(SUM(COALESCE(atomizer_qty, qty_received)), 0) AS qty, COUNT(id) AS batch_count
    FROM inward_batches
    WHERE atomizer_item_id IS NOT NULL 
      AND (item_id IS NULL OR atomizer_item_id <> item_id)
      AND (cap_item_id IS NULL OR atomizer_item_id <> cap_item_id)
    GROUP BY atomizer_item_id
  ),
  attached_boxes_agg AS (
    SELECT box_item_id AS item_id, COALESCE(SUM(COALESCE(box_qty, qty_received)), 0) AS qty, COUNT(id) AS batch_count
    FROM inward_batches
    WHERE box_item_id IS NOT NULL 
      AND (item_id IS NULL OR box_item_id <> item_id)
      AND (cap_item_id IS NULL OR box_item_id <> cap_item_id)
      AND (atomizer_item_id IS NULL OR box_item_id <> atomizer_item_id)
    GROUP BY box_item_id
  ),
  cap_moves_agg AS (
    SELECT 
      sm.cap_item_id AS item_id,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' OR s_from.name = 'Scrap / Defect' THEN 0
          WHEN (s_from.name = 'Filling' OR (s_from.sequence_no <= 4 AND s_to.sequence_no > 4))
               AND NOT (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN COALESCE(sm.cap_qty_used, sm.qty_moved)
          WHEN (s_to.name = 'Filling' OR (s_from.sequence_no > 4 AND s_to.sequence_no <= 4))
               AND (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN -COALESCE(sm.cap_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_used,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' THEN COALESCE(sm.cap_qty_used, sm.qty_moved)
          WHEN s_from.name = 'Scrap / Defect' THEN -COALESCE(sm.cap_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_scrapped,
      COUNT(DISTINCT sm.batch_id) AS movement_count
    FROM stage_movements sm
    LEFT JOIN stages s_to ON s_to.id = sm.to_stage_id
    LEFT JOIN stages s_from ON s_from.id = sm.from_stage_id
    WHERE sm.cap_item_id IS NOT NULL
    GROUP BY sm.cap_item_id
  ),
  atomizer_moves_agg AS (
    SELECT 
      sm.atomizer_item_id AS item_id,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' OR s_from.name = 'Scrap / Defect' THEN 0
          WHEN (s_from.name = 'Filling' OR (s_from.sequence_no <= 4 AND s_to.sequence_no > 4))
               AND NOT (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN COALESCE(sm.atomizer_qty_used, sm.qty_moved)
          WHEN (s_to.name = 'Filling' OR (s_from.sequence_no > 4 AND s_to.sequence_no <= 4))
               AND (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN -COALESCE(sm.atomizer_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_used,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' THEN COALESCE(sm.atomizer_qty_used, sm.qty_moved)
          WHEN s_from.name = 'Scrap / Defect' THEN -COALESCE(sm.atomizer_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_scrapped,
      COUNT(DISTINCT sm.batch_id) AS movement_count
    FROM stage_movements sm
    LEFT JOIN stages s_to ON s_to.id = sm.to_stage_id
    LEFT JOIN stages s_from ON s_from.id = sm.from_stage_id
    WHERE sm.atomizer_item_id IS NOT NULL
    GROUP BY sm.atomizer_item_id
  ),
  box_moves_agg AS (
    SELECT 
      sm.box_item_id AS item_id,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' OR s_from.name = 'Scrap / Defect' THEN 0
          WHEN (s_from.name = 'Packaging' OR (s_from.sequence_no <= 5 AND s_to.sequence_no > 5))
               AND NOT (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN COALESCE(sm.box_qty_used, sm.qty_moved)
          WHEN (s_to.name = 'Packaging' OR (s_from.sequence_no > 5 AND s_to.sequence_no <= 5))
               AND (COALESCE(sm.remarks, '') ILIKE '%[REVERSAL%' OR (s_from.sequence_no > s_to.sequence_no))
          THEN -COALESCE(sm.box_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_used,
      COALESCE(SUM(
        CASE 
          WHEN s_to.name = 'Scrap / Defect' THEN COALESCE(sm.box_qty_used, sm.qty_moved)
          WHEN s_from.name = 'Scrap / Defect' THEN -COALESCE(sm.box_qty_used, sm.qty_moved)
          ELSE 0 
        END
      ), 0) AS qty_scrapped,
      COUNT(DISTINCT sm.batch_id) AS movement_count
    FROM stage_movements sm
    LEFT JOIN stages s_to ON s_to.id = sm.to_stage_id
    LEFT JOIN stages s_from ON s_from.id = sm.from_stage_id
    WHERE sm.box_item_id IS NOT NULL
    GROUP BY sm.box_item_id
  ),
  bottle_moves_agg AS (
    SELECT
      ib.item_id,
      COALESCE(SUM(
        CASE
          WHEN s_from.name = 'Raw Stock' AND s_to.name <> 'Raw Stock' THEN sm.qty_moved
          WHEN s_to.name = 'Raw Stock' AND s_from.name <> 'Raw Stock' THEN -sm.qty_moved
          ELSE 0
        END
      ), 0) AS qty_moved_from_raw,
      COALESCE(SUM(
        CASE
          WHEN s_to.name = 'Scrap / Defect' THEN sm.qty_moved
          WHEN s_from.name = 'Scrap / Defect' THEN -sm.qty_moved
          ELSE 0
        END
      ), 0) AS qty_scrapped,
      COUNT(DISTINCT sm.batch_id) FILTER (WHERE s_from.name = 'Raw Stock') AS batches_in_prod
    FROM stage_movements sm
    JOIN inward_batches ib ON ib.id = sm.batch_id
    LEFT JOIN stages s_to ON s_to.id = sm.to_stage_id
    LEFT JOIN stages s_from ON s_from.id = sm.from_stage_id
    GROUP BY ib.item_id
  ),
  dispatches_box_agg AS (
    SELECT box_item_id AS item_id, COALESCE(SUM(qty), 0) AS qty
    FROM dispatches
    WHERE box_item_id IS NOT NULL
    GROUP BY box_item_id
  )
SELECT
  i.id AS item_id,
  i.name AS item_name,
  i.category,
  i.unit,
  (COALESCE(r.qty, 0) + COALESCE(db.qty, 0) + COALESCE(ac.qty, 0) + COALESCE(aa.qty, 0) + COALESCE(ab.qty, 0)) AS total_inwarded,
  (COALESCE(r.receipt_count, 0) + COALESCE(db.batch_count, 0) + COALESCE(ac.batch_count, 0) + COALESCE(aa.batch_count, 0) + COALESCE(ab.batch_count, 0)) AS inward_batch_count,
  CASE 
    WHEN lower(i.category) = 'bottle' THEN GREATEST(0, COALESCE(btm.qty_moved_from_raw, 0))
    ELSE GREATEST(0, (COALESCE(cm.qty_used, 0) + COALESCE(am.qty_used, 0) + COALESCE(bm.qty_used, 0)))
  END AS total_used,
  CASE
    WHEN lower(i.category) = 'bottle' THEN COALESCE(btm.batches_in_prod, 0)
    ELSE (COALESCE(cm.movement_count, 0) + COALESCE(am.movement_count, 0) + COALESCE(bm.movement_count, 0))
  END AS used_in_batch_count,
  CASE
    WHEN lower(i.category) = 'bottle' THEN GREATEST(0, COALESCE(btm.qty_scrapped, 0))
    ELSE GREATEST(0, (COALESCE(cm.qty_scrapped, 0) + COALESCE(am.qty_scrapped, 0) + COALESCE(bm.qty_scrapped, 0)))
  END AS total_scrapped,
  COALESCE(dbx.qty, 0) AS total_dispatched,
  CASE
    WHEN lower(i.category) = 'bottle' THEN
      GREATEST(0, (COALESCE(r.qty, 0) + COALESCE(db.qty, 0)) - GREATEST(0, COALESCE(btm.qty_moved_from_raw, 0)) - GREATEST(0, COALESCE(btm.qty_scrapped, 0)))
    ELSE
      GREATEST(0, (COALESCE(r.qty, 0) + COALESCE(db.qty, 0) + COALESCE(ac.qty, 0) + COALESCE(aa.qty, 0) + COALESCE(ab.qty, 0)) 
        - GREATEST(0, (COALESCE(cm.qty_used, 0) + COALESCE(am.qty_used, 0) + COALESCE(bm.qty_used, 0)))
        - GREATEST(0, (COALESCE(cm.qty_scrapped, 0) + COALESCE(am.qty_scrapped, 0) + COALESCE(bm.qty_scrapped, 0))))
  END AS available_stock
FROM items i
LEFT JOIN receipts_agg r ON r.item_id = i.id
LEFT JOIN direct_batches_agg db ON db.item_id = i.id
LEFT JOIN attached_caps_agg ac ON ac.item_id = i.id
LEFT JOIN attached_atomizers_agg aa ON aa.item_id = i.id
LEFT JOIN attached_boxes_agg ab ON ab.item_id = i.id
LEFT JOIN cap_moves_agg cm ON cm.item_id = i.id
LEFT JOIN atomizer_moves_agg am ON am.item_id = i.id
LEFT JOIN box_moves_agg bm ON bm.item_id = i.id
LEFT JOIN bottle_moves_agg btm ON btm.item_id = i.id
LEFT JOIN dispatches_box_agg dbx ON dbx.item_id = i.id;

-- Explicit PostgREST View Grants
GRANT SELECT ON public.v_component_stock, public.v_stage_stock, public.v_batch_stock, public.v_location_stock TO anon, authenticated;

-- 5. UPGRADED OPERATOR TRANSITION RBAC
CREATE OR REPLACE FUNCTION public.is_operator_transition_allowed(
  p_role text,
  p_from_seq integer,
  p_to_seq integer
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_role IN ('admin', 'stock_manager') THEN
    RETURN true;
  END IF;

  CASE p_role
    WHEN 'coloring_operator' THEN
      RETURN (p_from_seq = 1 AND p_to_seq = 2)
          OR (p_from_seq = 2 AND p_to_seq IN (1, 3, 4, 8));

    WHEN 'printing_operator' THEN
      RETURN (p_from_seq IN (1, 2) AND p_to_seq = 3)
          OR (p_from_seq = 3 AND p_to_seq IN (1, 2, 4, 8));

    WHEN 'filling_operator' THEN
      RETURN (p_from_seq IN (1, 2, 3) AND p_to_seq = 4)
          OR (p_from_seq = 4 AND p_to_seq IN (1, 2, 3, 5, 8));

    WHEN 'packaging_operator' THEN
      RETURN (p_from_seq = 4 AND p_to_seq = 5)
          OR (p_from_seq = 5 AND p_to_seq IN (4, 6, 8));

    ELSE
      RETURN false;
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_operator_transition_allowed TO anon, authenticated;

-- 6. FIXED GOTRUE WORKSTATION PROVISIONING FUNCTION
CREATE OR REPLACE FUNCTION public.seed_factory_workstation_account(
  p_email text,
  p_password text,
  p_display_name text,
  p_role text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_encrypted_pw text;
BEGIN
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    -- 1. Insert into auth.users with empty string non-null tokens
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
      'authenticated', p_email, v_encrypted_pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      json_build_object('display_name', p_display_name, 'role', p_role)::jsonb,
      now(), now(), '', '', '', ''
    );

    -- 2. Link identity in auth.identities (mandatory for GoTrue Auth v2)
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id,
      format('{"sub": "%s", "email": "%s"}', v_user_id::text, p_email)::jsonb,
      'email', v_user_id::text, now(), now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        raw_user_meta_data = json_build_object('display_name', p_display_name, 'role', p_role)::jsonb,
        updated_at = now()
    WHERE id = v_user_id;

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_user_id) THEN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_user_id,
        format('{"sub": "%s", "email": "%s"}', v_user_id::text, p_email)::jsonb,
        'email', v_user_id::text, now(), now(), now()
      );
    END IF;
  END IF;

  INSERT INTO public.user_profiles (id, email, display_name, role, is_active, created_at)
  VALUES (v_user_id, p_email, p_display_name, p_role, true, now())
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      role = EXCLUDED.role,
      is_active = true;

  RETURN v_user_id;
END;
$$;

-- 7. PROVISION STANDARD FACTORY WORKSTATIONS
DO $$
BEGIN
  PERFORM public.seed_factory_workstation_account('admin@ffstock.internal', 'Factory2026!', 'Plant General Manager', 'admin');
  PERFORM public.seed_factory_workstation_account('inward@ffstock.internal', 'Factory2026!', 'Inward Supervisor', 'inward_manager');
  PERFORM public.seed_factory_workstation_account('coloring.line1@ffstock.internal', 'Factory2026!', 'Coloring Specialist (Line 1)', 'coloring_operator');
  PERFORM public.seed_factory_workstation_account('printing.line1@ffstock.internal', 'Factory2026!', 'Printing Specialist (Line 1)', 'printing_operator');
  PERFORM public.seed_factory_workstation_account('filling.line1@ffstock.internal', 'Factory2026!', 'Filling Specialist (Line 1)', 'filling_operator');
  PERFORM public.seed_factory_workstation_account('packaging.line1@ffstock.internal', 'Factory2026!', 'Packaging Specialist (Line 1)', 'packaging_operator');
  PERFORM public.seed_factory_workstation_account('stock@ffstock.internal', 'Factory2026!', 'Inventory Controller', 'stock_manager');
  PERFORM public.seed_factory_workstation_account('dispatch@ffstock.internal', 'Factory2026!', 'Logistics Officer', 'dispatch_manager');
  PERFORM public.seed_factory_workstation_account('vendor@ffstock.internal', 'Factory2026!', 'Procurement Officer', 'vendor_manager');
  PERFORM public.seed_factory_workstation_account('auditor@ffstock.internal', 'Factory2026!', 'Plant Quality Auditor', 'viewer');
END;
$$;
