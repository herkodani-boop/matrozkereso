-- Replace this value with the exact email address, then run the whole script in Supabase SQL Editor.
-- All database deletions are in one transaction. Any error aborts the transaction.
BEGIN;

CREATE TEMP TABLE delete_user_target_email (
  email text NOT NULL
) ON COMMIT DROP;

INSERT INTO delete_user_target_email (email)
VALUES ('replace-with-email@example.com');

DO $$
DECLARE
  target_email text;
  target_user_id uuid;
  matching_users integer;
  owned_boat_ids uuid[];
  owned_ad_ids uuid[];
  owned_event_ids uuid[];
  affected_rows integer;
  storage_object record;
BEGIN
  SELECT lower(trim(email))
  INTO target_email
  FROM pg_temp.delete_user_target_email;

  IF target_email IS NULL
     OR target_email = ''
     OR target_email = 'replace-with-email@example.com' THEN
    RAISE EXCEPTION 'Edit the target email in delete_user_target_email before running this script.';
  END IF;

  SELECT count(*)
  INTO matching_users
  FROM auth.users
  WHERE lower(email) = target_email;

  IF matching_users = 0 THEN
    RAISE EXCEPTION 'No auth.users row found for email %.', target_email;
  ELSIF matching_users > 1 THEN
    RAISE EXCEPTION 'More than one auth.users row found for email %; refusing to delete.', target_email;
  END IF;

  SELECT id
  INTO target_user_id
  FROM auth.users
  WHERE lower(email) = target_email;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO owned_boat_ids
  FROM public.boats
  WHERE user_id = target_user_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO owned_ad_ids
  FROM public.ads
  WHERE user_id = target_user_id
     OR boat_id = ANY(owned_boat_ids);

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO owned_event_ids
  FROM public.boat_events
  WHERE boat_id = ANY(owned_boat_ids);

  RAISE NOTICE 'Deleting user % (id=%), owned boats %, ads %, events %.',
    target_email, target_user_id,
    cardinality(owned_boat_ids), cardinality(owned_ad_ids), cardinality(owned_event_ids);

  -- Storage blobs must be removed through the Supabase Storage API, not by deleting storage.objects rows.
  IF to_regclass('storage.objects') IS NOT NULL THEN
    FOR storage_object IN
      SELECT bucket_id, name
      FROM storage.objects
      WHERE (bucket_id = 'avatars'
        AND (name LIKE 'avatars/' || target_user_id::text || '-%'
          OR name LIKE target_user_id::text || '-%'))
         OR (bucket_id = 'boats'
        AND (name LIKE 'boats/' || target_user_id::text || '-%'
          OR name LIKE target_user_id::text || '-%'))
    LOOP
      RAISE NOTICE 'Remove Storage object separately: bucket=%, name=%',
        storage_object.bucket_id, storage_object.name;
    END LOOP;
  END IF;

  DELETE FROM public.test_feedback
  WHERE user_id = target_user_id
     OR lower(trim(user_email)) = target_email;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'Deleted % test_feedback rows.', affected_rows;

  DELETE FROM public.boat_team_invitations
  WHERE inviter_id = target_user_id
     OR accepted_by_user_id = target_user_id
     OR lower(trim(invitee_email::text)) = target_email;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'Deleted % boat_team_invitations rows.', affected_rows;

  DELETE FROM public.boat_team_members
  WHERE user_id = target_user_id
     OR invited_by = target_user_id
     OR lower(trim(email::text)) = target_email;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'Deleted % boat_team_members rows.', affected_rows;

  DELETE FROM public.boat_event_attendees
  WHERE user_id = target_user_id
     OR event_id = ANY(owned_event_ids);
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'Deleted % boat_event_attendees rows.', affected_rows;

  DELETE FROM public.applications
  WHERE user_id = target_user_id
     OR ad_id = ANY(owned_ad_ids);
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'Deleted % applications rows.', affected_rows;

  DELETE FROM public.ads
  WHERE id = ANY(owned_ad_ids);
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'Deleted % ads rows.', affected_rows;

  DELETE FROM public.boat_events
  WHERE id = ANY(owned_event_ids);
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'Deleted % boat_events rows.', affected_rows;

  DELETE FROM public.boats
  WHERE id = ANY(owned_boat_ids);
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'Deleted % boats rows.', affected_rows;

  DELETE FROM public.users
  WHERE id = target_user_id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'Deleted % public.users rows.', affected_rows;

  DELETE FROM auth.users
  WHERE id = target_user_id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'Deleted % auth.users rows.', affected_rows;
END $$;

COMMIT;
