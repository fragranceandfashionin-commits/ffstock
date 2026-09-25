-- ============================================================
-- Migration: 20260923000000_secure_rbac_profiles_and_rls.sql
-- Description:
--   1. Auto-sync trigger on_auth_user_created (auth.users -> public.user_profiles)
--   2. Audit columns: created_by_user_id on stage_movements, inward_batches, dispatches
--   3. Database trigger enforce_stage_movement_rbac on stage_movements
--   4. RLS hardening: revoke public anon mutations, restrict writes to authenticated roles
--   5. GoTrue-compliant seed provisioning for standard factory workstation accounts
-- ============================================================

-- 1. Ensure pgcrypto is available for bcrypt password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Audit columns on operational tables
ALTER TABLE stage_movements
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id);

ALTER TABLE inward_batches
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id);

ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id);

-- 3. Auto-sync trigger from auth.users into public.user_profiles
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_display_name text;
BEGIN
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'viewer');
  v_display_name := COALESCE(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );

  INSERT INTO public.user_profiles (id, email, display_name, role, is_active, created_at)
  VALUES (new.id, new.email, v_display_name, v_role, true, now())
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      display_name = COALESCE(public.user_profiles.display_name, EXCLUDED.display_name),
      role = COALESCE(public.user_profiles.role, EXCLUDED.role);

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 4. Database-level trigger on stage_movements to enforce operator boundary
CREATE OR REPLACE FUNCTION public.check_stage_movement_rbac()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  v_from_seq integer;
  v_to_seq integer;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  -- If an authenticated operator is present, inspect their profile role
  IF v_user_id IS NOT NULL THEN
    SELECT role INTO v_user_role FROM public.user_profiles WHERE id = v_user_id;

    -- If role found and not admin, enforce operator transition boundary
    IF v_user_role IS NOT NULL AND v_user_role <> 'admin' THEN
      SELECT sequence_no INTO v_from_seq FROM public.stages WHERE id = NEW.from_stage_id;
      SELECT sequence_no INTO v_to_seq FROM public.stages WHERE id = NEW.to_stage_id;

      IF v_from_seq IS NOT NULL AND v_to_seq IS NOT NULL THEN
        IF NOT is_operator_transition_allowed(v_user_role, v_from_seq, v_to_seq) THEN
          RAISE EXCEPTION 'Access Denied: Operator role "%" is not authorized to transition batches from stage sequence % to %.',
            v_user_role, v_from_seq, v_to_seq;
        END IF;
      END IF;
    END IF;

    -- Automatically bind created_by_user_id if column exists and empty
    NEW.created_by_user_id := COALESCE(NEW.created_by_user_id, v_user_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_stage_movement_rbac ON stage_movements;
CREATE TRIGGER trg_enforce_stage_movement_rbac
  BEFORE INSERT ON stage_movements
  FOR EACH ROW EXECUTE FUNCTION public.check_stage_movement_rbac();

-- 5. Revoke open mutation privileges from anon on operational tables
REVOKE INSERT, UPDATE, DELETE ON inward_batches FROM anon;
REVOKE INSERT, UPDATE, DELETE ON stage_movements FROM anon;
REVOKE INSERT, UPDATE, DELETE ON dispatches FROM anon;
REVOKE INSERT, UPDATE, DELETE ON batch_allocations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON item_stock_receipts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON suppliers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON clients FROM anon;
REVOKE INSERT, UPDATE, DELETE ON production_orders FROM anon;

-- Grant mutation access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON inward_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stage_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dispatches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch_allocations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON item_stock_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON production_orders TO authenticated;

-- Allow read-only access to anon for kiosk displays
GRANT SELECT ON inward_batches, stage_movements, dispatches, batch_allocations, item_stock_receipts, items, suppliers, clients, production_orders TO anon;

-- 6. Helper function to seed or reset standard factory workstation accounts safely
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
  -- Compute bcrypt password hash
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      aud
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      p_email,
      v_encrypted_pw,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      json_build_object('display_name', p_display_name, 'role', p_role)::jsonb,
      now(),
      now(),
      'authenticated',
      'authenticated'
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        raw_user_meta_data = json_build_object('display_name', p_display_name, 'role', p_role)::jsonb,
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- Ensure public.user_profiles has matching authoritative role
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

-- 7. Provision standard factory workstations
DO $$
BEGIN
  PERFORM public.seed_factory_workstation_account('admin@factory.local', 'Factory2026!', 'Plant General Manager', 'admin');
  PERFORM public.seed_factory_workstation_account('inward@factory.local', 'Factory2026!', 'Inward Supervisor', 'inward_manager');
  PERFORM public.seed_factory_workstation_account('coloring.line1@factory.local', 'Factory2026!', 'Coloring Specialist (Line 1)', 'coloring_operator');
  PERFORM public.seed_factory_workstation_account('printing.line1@factory.local', 'Factory2026!', 'Printing Specialist (Line 1)', 'printing_operator');
  PERFORM public.seed_factory_workstation_account('filling.line1@factory.local', 'Factory2026!', 'Filling Specialist (Line 1)', 'filling_operator');
  PERFORM public.seed_factory_workstation_account('packaging.line1@factory.local', 'Factory2026!', 'Packaging Specialist (Line 1)', 'packaging_operator');
  PERFORM public.seed_factory_workstation_account('stock@factory.local', 'Factory2026!', 'Inventory Controller', 'stock_manager');
  PERFORM public.seed_factory_workstation_account('dispatch@factory.local', 'Factory2026!', 'Logistics Officer', 'dispatch_manager');
  PERFORM public.seed_factory_workstation_account('vendor@factory.local', 'Factory2026!', 'Procurement Officer', 'vendor_manager');
  PERFORM public.seed_factory_workstation_account('auditor@factory.local', 'Factory2026!', 'Plant Quality Auditor', 'viewer');
END;
$$;
