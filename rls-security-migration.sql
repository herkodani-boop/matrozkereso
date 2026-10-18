-- Run this migration in the Supabase SQL Editor after backing up the project.
-- It replaces existing policies on the listed public tables with this project's policy set.
-- Public listing and profile data is exposed only through the policies and views below.

CREATE OR REPLACE FUNCTION public.owns_boat(p_boat_id uuid)
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
      AND boat.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_boat_team_member(p_boat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.boat_team_members AS member
    WHERE member.boat_id = p_boat_id
      AND member.user_id = (SELECT auth.uid())
      AND member.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_ad(p_ad_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ads AS listing
    WHERE listing.id = p_ad_id
      AND listing.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.boat_events AS event
    WHERE event.id = p_event_id
      AND (
        public.owns_boat(event.boat_id)
        OR public.is_active_boat_team_member(event.boat_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_event_attendee(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.boat_event_attendees AS attendee
    WHERE attendee.event_id = p_event_id
      AND attendee.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_applicant_to_owned_ad(p_profile_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.applications AS application
    JOIN public.ads AS listing ON listing.id = application.ad_id
    WHERE application.user_id = p_profile_user_id
      AND listing.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_member_of_owned_boat(p_profile_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.boat_team_members AS member
    WHERE member.user_id = p_profile_user_id
      AND public.owns_boat(member.boat_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_user_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
    AND (
      NEW.email IS DISTINCT FROM OLD.email
      OR NEW.role IS DISTINCT FROM OLD.role
    ) THEN
    RAISE EXCEPTION 'A felhasználó email-címe és szerepköre nem módosítható közvetlenül.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.owns_boat(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_boat_team_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_ad(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_event_attendee(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_applicant_to_owned_ad(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_member_of_owned_boat(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_user_identity_change() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.owns_boat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_boat_team_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_ad(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_event_attendee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_applicant_to_owned_ad(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member_of_owned_boat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_boat(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_active_boat_team_member(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.owns_ad(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_manage_event(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_event_attendee(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_applicant_to_owned_ad(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_member_of_owned_boat(uuid) TO anon;

DROP TRIGGER IF EXISTS prevent_user_identity_change ON public.users;
CREATE TRIGGER prevent_user_identity_change
BEFORE UPDATE OF email, role ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_user_identity_change();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boat_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boat_event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boat_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boat_team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_feedback ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'users',
        'boats',
        'ads',
        'applications',
        'boat_events',
        'boat_event_attendees',
        'boat_team_members',
        'boat_team_invitations',
        'test_feedback'
      ])
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS users_select_self_or_related ON public.users;
CREATE POLICY users_select_self_or_related
ON public.users
FOR SELECT
TO authenticated
USING (
  id = (SELECT auth.uid())
  OR public.is_applicant_to_owned_ad(id)
  OR public.is_member_of_owned_boat(id)
);

DROP POLICY IF EXISTS users_insert_self ON public.users;
CREATE POLICY users_insert_self
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self
ON public.users
FOR UPDATE
TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS boats_select_visible ON public.boats;
CREATE POLICY boats_select_visible
ON public.boats
FOR SELECT
TO anon, authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.is_active_boat_team_member(id)
  OR EXISTS (
    SELECT 1
    FROM public.ads AS listing
    WHERE listing.boat_id = boats.id
      AND listing.is_active IS TRUE
      AND COALESCE(listing.is_deleted, false) IS FALSE
  )
);

DROP POLICY IF EXISTS boats_insert_owner ON public.boats;
CREATE POLICY boats_insert_owner
ON public.boats
FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS boats_update_owner ON public.boats;
CREATE POLICY boats_update_owner
ON public.boats
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS boats_delete_owner ON public.boats;
CREATE POLICY boats_delete_owner
ON public.boats
FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS ads_select_public_or_owner ON public.ads;
CREATE POLICY ads_select_public_or_owner
ON public.ads
FOR SELECT
TO anon, authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    is_active IS TRUE
    AND COALESCE(is_deleted, false) IS FALSE
  )
);

DROP POLICY IF EXISTS ads_insert_boat_owner ON public.ads;
CREATE POLICY ads_insert_boat_owner
ON public.ads
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND public.owns_boat(boat_id)
);

DROP POLICY IF EXISTS ads_update_owner ON public.ads;
CREATE POLICY ads_update_owner
ON public.ads
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND public.owns_boat(boat_id)
);

DROP POLICY IF EXISTS ads_delete_owner ON public.ads;
CREATE POLICY ads_delete_owner
ON public.ads
FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS applications_select_applicant_or_listing_owner ON public.applications;
CREATE POLICY applications_select_applicant_or_listing_owner
ON public.applications
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.owns_ad(ad_id)
);

DROP POLICY IF EXISTS applications_insert_self ON public.applications;
CREATE POLICY applications_insert_self
ON public.applications
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.ads AS listing
    WHERE listing.id = applications.ad_id
      AND listing.user_id <> (SELECT auth.uid())
      AND listing.is_active IS TRUE
      AND COALESCE(listing.is_deleted, false) IS FALSE
  )
);

DROP POLICY IF EXISTS applications_delete_self ON public.applications;
CREATE POLICY applications_delete_self
ON public.applications
FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS boat_events_select_related ON public.boat_events;
CREATE POLICY boat_events_select_related
ON public.boat_events
FOR SELECT
TO authenticated
USING (
  public.owns_boat(boat_id)
  OR public.is_active_boat_team_member(boat_id)
  OR public.is_event_attendee(id)
);

DROP POLICY IF EXISTS boat_events_insert_owner ON public.boat_events;
CREATE POLICY boat_events_insert_owner
ON public.boat_events
FOR INSERT
TO authenticated
WITH CHECK (public.owns_boat(boat_id));

DROP POLICY IF EXISTS boat_events_update_owner ON public.boat_events;
CREATE POLICY boat_events_update_owner
ON public.boat_events
FOR UPDATE
TO authenticated
USING (public.owns_boat(boat_id))
WITH CHECK (public.owns_boat(boat_id));

DROP POLICY IF EXISTS boat_events_delete_owner ON public.boat_events;
CREATE POLICY boat_events_delete_owner
ON public.boat_events
FOR DELETE
TO authenticated
USING (public.owns_boat(boat_id));

REVOKE INSERT, UPDATE ON TABLE public.boat_events FROM PUBLIC, anon, authenticated;
GRANT INSERT (boat_id, title, type, start_date, end_date, is_one_day, location, notes)
ON TABLE public.boat_events TO authenticated;
GRANT UPDATE (title, type, start_date, end_date, is_one_day, location, notes)
ON TABLE public.boat_events TO authenticated;

DROP POLICY IF EXISTS boat_event_attendees_select_related ON public.boat_event_attendees;
CREATE POLICY boat_event_attendees_select_related
ON public.boat_event_attendees
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.can_manage_event(event_id)
);

DROP POLICY IF EXISTS boat_event_attendees_insert_related ON public.boat_event_attendees;
CREATE POLICY boat_event_attendees_insert_related
ON public.boat_event_attendees
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  OR public.can_manage_event(event_id)
);

DROP POLICY IF EXISTS boat_event_attendees_update_related ON public.boat_event_attendees;
CREATE POLICY boat_event_attendees_update_related
ON public.boat_event_attendees
FOR UPDATE
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.can_manage_event(event_id)
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  OR public.can_manage_event(event_id)
);

DROP POLICY IF EXISTS boat_event_attendees_delete_related ON public.boat_event_attendees;
CREATE POLICY boat_event_attendees_delete_related
ON public.boat_event_attendees
FOR DELETE
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.can_manage_event(event_id)
);

REVOKE INSERT, UPDATE ON TABLE public.boat_event_attendees FROM PUBLIC, anon, authenticated;
GRANT INSERT (event_id, user_id, status)
ON TABLE public.boat_event_attendees TO authenticated;
GRANT UPDATE (status)
ON TABLE public.boat_event_attendees TO authenticated;

DROP POLICY IF EXISTS boat_team_members_select_self_or_owner ON public.boat_team_members;
CREATE POLICY boat_team_members_select_self_or_owner
ON public.boat_team_members
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.owns_boat(boat_id)
);

DROP POLICY IF EXISTS boat_team_members_update_owner ON public.boat_team_members;
CREATE POLICY boat_team_members_update_owner
ON public.boat_team_members
FOR UPDATE
TO authenticated
USING (public.owns_boat(boat_id))
WITH CHECK (public.owns_boat(boat_id));

REVOKE UPDATE ON TABLE public.boat_team_members FROM PUBLIC, anon, authenticated;
GRANT UPDATE (status) ON TABLE public.boat_team_members TO authenticated;

DROP POLICY IF EXISTS boat_team_invitations_select_owner ON public.boat_team_invitations;
CREATE POLICY boat_team_invitations_select_owner
ON public.boat_team_invitations
FOR SELECT
TO authenticated
USING (public.owns_boat(boat_id));

DROP POLICY IF EXISTS boat_team_invitations_update_owner ON public.boat_team_invitations;
CREATE POLICY boat_team_invitations_update_owner
ON public.boat_team_invitations
FOR UPDATE
TO authenticated
USING (public.owns_boat(boat_id))
WITH CHECK (public.owns_boat(boat_id));

REVOKE UPDATE ON TABLE public.boat_team_invitations FROM PUBLIC, anon, authenticated;
GRANT UPDATE (status) ON TABLE public.boat_team_invitations TO authenticated;

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_barrier = true)
AS
SELECT id, full_name, avatar_url
FROM public.users AS profile
WHERE EXISTS (
  SELECT 1
  FROM public.ads AS listing
  WHERE listing.user_id = profile.id
    AND listing.is_active IS TRUE
    AND COALESCE(listing.is_deleted, false) IS FALSE
);

GRANT SELECT ON public.public_profiles TO anon, authenticated;

CREATE OR REPLACE VIEW public.visible_event_participant_profiles
WITH (security_barrier = true)
AS
SELECT DISTINCT profile.id, profile.full_name, profile.avatar_url
FROM public.users AS profile
JOIN public.boat_event_attendees AS attendee ON attendee.user_id = profile.id
WHERE public.can_manage_event(attendee.event_id)
   OR public.is_event_attendee(attendee.event_id);

GRANT SELECT ON public.visible_event_participant_profiles TO authenticated;

CREATE OR REPLACE VIEW public.public_application_counts
WITH (security_barrier = true)
AS
SELECT
  application.ad_id,
  count(*)::integer AS application_count,
  count(*) FILTER (WHERE application.status <> 'rejected')::integer AS active_application_count
FROM public.applications AS application
JOIN public.ads AS listing ON listing.id = application.ad_id
WHERE listing.is_active IS TRUE
  AND COALESCE(listing.is_deleted, false) IS FALSE
GROUP BY application.ad_id;

GRANT SELECT ON public.public_application_counts TO anon, authenticated;

DROP POLICY IF EXISTS storage_private_object_select_guard ON storage.objects;
CREATE POLICY storage_private_object_select_guard
ON storage.objects
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (
  bucket_id NOT IN ('avatars', 'boats')
  OR (
    bucket_id = 'avatars'
    AND name LIKE 'avatars/' || (SELECT auth.uid())::text || '-%'
  )
  OR (
    bucket_id = 'boats'
    AND name LIKE 'boats/' || (SELECT auth.uid())::text || '-%'
  )
);

DROP POLICY IF EXISTS storage_private_object_insert_guard ON storage.objects;
CREATE POLICY storage_private_object_insert_guard
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id NOT IN ('avatars', 'boats')
  OR (
    bucket_id = 'avatars'
    AND name LIKE 'avatars/' || (SELECT auth.uid())::text || '-%'
  )
  OR (
    bucket_id = 'boats'
    AND name LIKE 'boats/' || (SELECT auth.uid())::text || '-%'
  )
);

DROP POLICY IF EXISTS storage_private_object_update_guard ON storage.objects;
CREATE POLICY storage_private_object_update_guard
ON storage.objects
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (
  bucket_id NOT IN ('avatars', 'boats')
  OR (
    bucket_id = 'avatars'
    AND name LIKE 'avatars/' || (SELECT auth.uid())::text || '-%'
  )
  OR (
    bucket_id = 'boats'
    AND name LIKE 'boats/' || (SELECT auth.uid())::text || '-%'
  )
)
WITH CHECK (
  bucket_id NOT IN ('avatars', 'boats')
  OR (
    bucket_id = 'avatars'
    AND name LIKE 'avatars/' || (SELECT auth.uid())::text || '-%'
  )
  OR (
    bucket_id = 'boats'
    AND name LIKE 'boats/' || (SELECT auth.uid())::text || '-%'
  )
);

DROP POLICY IF EXISTS storage_private_object_delete_guard ON storage.objects;
CREATE POLICY storage_private_object_delete_guard
ON storage.objects
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (
  bucket_id NOT IN ('avatars', 'boats')
  OR (
    bucket_id = 'avatars'
    AND name LIKE 'avatars/' || (SELECT auth.uid())::text || '-%'
  )
  OR (
    bucket_id = 'boats'
    AND name LIKE 'boats/' || (SELECT auth.uid())::text || '-%'
  )
);

DROP POLICY IF EXISTS avatars_select_own ON storage.objects;
CREATE POLICY avatars_select_own
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND name LIKE 'avatars/' || (SELECT auth.uid())::text || '-%'
);

DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND name LIKE 'avatars/' || (SELECT auth.uid())::text || '-%'
);

DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND name LIKE 'avatars/' || (SELECT auth.uid())::text || '-%'
)
WITH CHECK (
  bucket_id = 'avatars'
  AND name LIKE 'avatars/' || (SELECT auth.uid())::text || '-%'
);

DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND name LIKE 'avatars/' || (SELECT auth.uid())::text || '-%'
);

DROP POLICY IF EXISTS boats_select_own_image ON storage.objects;
CREATE POLICY boats_select_own_image
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'boats'
  AND name LIKE 'boats/' || (SELECT auth.uid())::text || '-%'
);

DROP POLICY IF EXISTS boats_insert_own_image ON storage.objects;
CREATE POLICY boats_insert_own_image
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'boats'
  AND name LIKE 'boats/' || (SELECT auth.uid())::text || '-%'
);

DROP POLICY IF EXISTS boats_update_own_image ON storage.objects;
CREATE POLICY boats_update_own_image
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'boats'
  AND name LIKE 'boats/' || (SELECT auth.uid())::text || '-%'
)
WITH CHECK (
  bucket_id = 'boats'
  AND name LIKE 'boats/' || (SELECT auth.uid())::text || '-%'
);

DROP POLICY IF EXISTS boats_delete_own_image ON storage.objects;
CREATE POLICY boats_delete_own_image
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'boats'
  AND name LIKE 'boats/' || (SELECT auth.uid())::text || '-%'
);
