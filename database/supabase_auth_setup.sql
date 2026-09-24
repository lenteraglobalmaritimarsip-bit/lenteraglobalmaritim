-- Run this once in the Supabase SQL Editor.
-- Supabase Auth owns passwords. public.app_users stores the application profile.

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
    SET id = NEW.id,
        updated_at = NOW()
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
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'role', ''), 'SALES'),
    COALESCE(NEW.raw_user_meta_data ->> 'department', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'branch', 'JKT'),
    'ACTIVE'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Username lookup is intentionally callable before authentication.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON TABLE public.app_users TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_email_by_username(TEXT) TO anon, authenticated;