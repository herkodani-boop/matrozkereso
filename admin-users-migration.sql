-- Run this migration in the Supabase SQL Editor.
-- Admin access is managed independently from the users.role boat-role field.

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_snapshot text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_users FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_admin_user_email_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT auth_user.email
  INTO NEW.email_snapshot
  FROM auth.users AS auth_user
  WHERE auth_user.id = NEW.user_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_admin_user_email_snapshot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_admin_user_email_snapshot ON public.admin_users;
CREATE TRIGGER set_admin_user_email_snapshot
BEFORE INSERT OR UPDATE OF user_id ON public.admin_users
FOR EACH ROW
EXECUTE FUNCTION public.set_admin_user_email_snapshot();

CREATE OR REPLACE FUNCTION public.sync_admin_user_email_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.admin_users
  SET email_snapshot = NEW.email
  WHERE user_id = NEW.id
    AND email_snapshot IS DISTINCT FROM NEW.email;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_admin_user_email_snapshot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_admin_user_email_snapshot ON auth.users;
CREATE TRIGGER sync_admin_user_email_snapshot
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_admin_user_email_snapshot();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users AS admin
    WHERE admin.user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
