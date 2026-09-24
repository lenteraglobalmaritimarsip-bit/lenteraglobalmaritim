-- Auth migration for an existing database.
-- Run database/schema.sql first for a new database. This file is non-destructive:
-- it does not drop application tables or replace existing user profiles.
-- Supabase Auth owns passwords; public.app_users stores the application profile.

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS username VARCHAR(80),
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

UPDATE public.app_users
SET username = COALESCE(NULLIF(BTRIM(username), ''), split_part(LOWER(email), '@', 1))
WHERE username IS NULL OR BTRIM(username) = '';

ALTER TABLE public.app_users
  ALTER COLUMN username SET NOT NULL,
  ALTER COLUMN password_hash SET DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_key ON public.app_users(username);

-- Keep live Fix Tariff categories aligned with the application and schema.
ALTER TABLE public.fix_tariffs DROP CONSTRAINT IF EXISTS fix_tariffs_cost_category_check;
ALTER TABLE public.fix_tariffs
  ADD CONSTRAINT fix_tariffs_cost_category_check
  CHECK (cost_category IS NULL OR cost_category IN (
    'PORT_EXPENSES', 'CLEARANCE', 'GENERAL_EXPENSES', 'CREW_EXPENSES',
    'OWNER_MATTER', 'AGENCY_FEE', 'TAX_CONTINGENCY', 'PORT_DUES',
    'PILOTAGE_TOWAGE', 'BERTHING', 'CREW_CHANGE', 'IMMIGRATION_CUSTOMS',
    'LOGISTICS_SUPPLIES', 'SUNDRY'
  ));

CREATE OR REPLACE FUNCTION public.get_auth_email_by_username(input_username TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
  FROM public.app_users
  WHERE LOWER(username) = LOWER(BTRIM(input_username))
    AND status = 'ACTIVE'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_auth_email_by_username(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_email_by_username(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_username TEXT;
  existing_user_id UUID;
BEGIN
  requested_username := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'username', '')), '');

  SELECT id INTO existing_user_id
  FROM public.app_users
  WHERE LOWER(email) = LOWER(NEW.email)
  LIMIT 1;

  IF existing_user_id IS NOT NULL AND existing_user_id <> NEW.id THEN
    UPDATE public.app_users
    SET id = NEW.id, updated_at = NOW()
    WHERE id = existing_user_id;
    RETURN NEW;
  END IF;

  INSERT INTO public.app_users (
    id, employee_code, name, email, username, password_hash, role, department, branch, status
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'employee_code', ''), 'EMP-' || LEFT(REPLACE(NEW.id::TEXT, '-', ''), 12)),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'name', ''), COALESCE(NEW.email, 'New User')),
    NEW.email,
    COALESCE(requested_username, split_part(COALESCE(NEW.email, NEW.id::TEXT), '@', 1)),
    '',
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'role', ''), CASE WHEN NOT EXISTS (SELECT 1 FROM public.app_users) THEN 'ADMIN' ELSE 'SALES' END),
    COALESCE(NEW.raw_user_meta_data ->> 'department', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'branch', 'JKT'),
    'ACTIVE'
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON TABLE public.app_users TO authenticated;