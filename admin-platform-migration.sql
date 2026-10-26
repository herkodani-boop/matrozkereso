-- Run after admin-users-migration.sql.
-- Adds moderation state and restricts normal authenticated users to active accounts.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz;

ALTER TABLE public.boats
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.boat_events
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.users AS profile
    WHERE profile.id = (SELECT auth.uid())
      AND (profile.is_banned IS TRUE OR profile.is_deleted IS TRUE)
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_admin_managed_user_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
    AND (
      NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
      OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
    ) THEN
    RAISE EXCEPTION 'A fiók állapotát csak adminisztrátor módosíthatja.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_admin_managed_user_fields() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_admin_managed_user_fields ON public.users;
CREATE TRIGGER prevent_admin_managed_user_fields
BEFORE UPDATE OF is_deleted, deleted_at, is_banned, banned_at ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_admin_managed_user_fields();

CREATE OR REPLACE FUNCTION public.prevent_soft_delete_by_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
    AND (
      NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    ) THEN
    IF TG_TABLE_NAME = 'ads'
      AND OLD.user_id = (SELECT auth.uid())
      AND OLD.is_deleted IS NOT TRUE
      AND NEW.is_deleted IS TRUE
      AND NEW.deleted_at IS NOT NULL THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Ezt az elemet csak adminisztrátor törölheti.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_soft_delete_by_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_soft_delete_by_user ON public.boats;
CREATE TRIGGER prevent_soft_delete_by_user
BEFORE UPDATE OF is_deleted, deleted_at ON public.boats
FOR EACH ROW
EXECUTE FUNCTION public.prevent_soft_delete_by_user();

DROP TRIGGER IF EXISTS prevent_soft_delete_by_user ON public.ads;
CREATE TRIGGER prevent_soft_delete_by_user
BEFORE UPDATE OF is_deleted, deleted_at ON public.ads
FOR EACH ROW
EXECUTE FUNCTION public.prevent_soft_delete_by_user();

DROP TRIGGER IF EXISTS prevent_soft_delete_by_user ON public.boat_events;
CREATE TRIGGER prevent_soft_delete_by_user
BEFORE UPDATE OF is_deleted, deleted_at ON public.boat_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_soft_delete_by_user();

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'users',
    'boats',
    'ads',
    'applications',
    'boat_events',
    'boat_event_attendees',
    'boat_team_members',
    'boat_team_invitations',
    'test_feedback'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS active_account_required ON public.%I',
      target_table
    );
    EXECUTE format(
      'CREATE POLICY active_account_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_active_user()) WITH CHECK (public.is_active_user())',
      target_table
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['users', 'boats', 'ads', 'boat_events']
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS hide_soft_deleted ON public.%I',
      target_table
    );
    EXECUTE format(
      'CREATE POLICY hide_soft_deleted ON public.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (COALESCE(is_deleted, false) IS FALSE)',
      target_table
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_public_boat(p_boat_id uuid, p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.boats AS boat
    WHERE boat.id = p_boat_id
      AND COALESCE(boat.is_deleted, false) IS FALSE
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.users AS owner
    WHERE owner.id = p_owner_id
      AND (owner.is_banned IS TRUE OR owner.is_deleted IS TRUE)
  );
$$;

REVOKE ALL ON FUNCTION public.is_public_boat(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_boat(uuid, uuid) TO anon, authenticated;

DROP POLICY IF EXISTS boats_select_visible ON public.boats;
CREATE POLICY boats_select_visible
ON public.boats
FOR SELECT
TO anon, authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    (
      public.is_active_boat_team_member(id)
      OR EXISTS (
        SELECT 1
        FROM public.ads AS listing
        WHERE listing.boat_id = boats.id
          AND listing.is_active IS TRUE
          AND COALESCE(listing.is_deleted, false) IS FALSE
      )
    )
    AND public.is_public_boat(boats.id, boats.user_id)
  )
);

DROP POLICY IF EXISTS ads_select_public_or_owner ON public.ads;
CREATE POLICY ads_select_public_or_owner
ON public.ads
FOR SELECT
TO anon, authenticated
USING (
  (
    user_id = (SELECT auth.uid())
    OR (
      is_active IS TRUE
      AND COALESCE(is_deleted, false) IS FALSE
    )
  )
  AND public.is_public_boat(ads.boat_id, ads.user_id)
);

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_barrier = true)
AS
SELECT id, full_name, avatar_url
FROM public.users AS profile
WHERE profile.is_banned IS FALSE
  AND profile.is_deleted IS FALSE
  AND EXISTS (
    SELECT 1
    FROM public.ads AS listing
    WHERE listing.user_id = profile.id
      AND listing.is_active IS TRUE
      AND COALESCE(listing.is_deleted, false) IS FALSE
  );

CREATE OR REPLACE VIEW public.visible_event_participant_profiles
WITH (security_barrier = true)
AS
SELECT DISTINCT profile.id, profile.full_name, profile.avatar_url
FROM public.users AS profile
JOIN public.boat_event_attendees AS attendee ON attendee.user_id = profile.id
WHERE profile.is_banned IS FALSE
  AND profile.is_deleted IS FALSE
  AND (
    public.can_manage_event(attendee.event_id)
    OR public.is_event_attendee(attendee.event_id)
  );

CREATE OR REPLACE FUNCTION public.admin_soft_delete_boat(p_boat_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changed_count integer;
  deleted_on timestamptz := now();
BEGIN
  UPDATE public.boats
  SET is_deleted = true, deleted_at = deleted_on
  WHERE id = p_boat_id AND is_deleted IS FALSE;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.ads
  SET is_deleted = true, deleted_at = deleted_on
  WHERE boat_id = p_boat_id AND is_deleted IS FALSE;

  UPDATE public.boat_events
  SET is_deleted = true, deleted_at = deleted_on
  WHERE boat_id = p_boat_id AND is_deleted IS FALSE;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_soft_delete_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owned_boat_ids uuid[];
  deleted_on timestamptz := now();
BEGIN
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO owned_boat_ids
  FROM public.boats
  WHERE user_id = p_user_id AND is_deleted IS FALSE;

  UPDATE public.users
  SET is_deleted = true, deleted_at = deleted_on, is_banned = true, banned_at = deleted_on
  WHERE id = p_user_id AND is_deleted IS FALSE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  DELETE FROM public.admin_users
  WHERE user_id = p_user_id;

  UPDATE public.boats
  SET is_deleted = true, deleted_at = deleted_on
  WHERE user_id = p_user_id AND is_deleted IS FALSE;

  UPDATE public.ads
  SET is_deleted = true, deleted_at = deleted_on
  WHERE (user_id = p_user_id OR boat_id = ANY(owned_boat_ids))
    AND is_deleted IS FALSE;

  UPDATE public.boat_events
  SET is_deleted = true, deleted_at = deleted_on
  WHERE boat_id = ANY(owned_boat_ids) AND is_deleted IS FALSE;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_soft_delete_boat(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_soft_delete_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_boat(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_user(uuid) TO service_role;

DROP POLICY IF EXISTS active_account_required ON storage.objects;
CREATE POLICY active_account_required
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.is_active_user())
WITH CHECK (public.is_active_user());
