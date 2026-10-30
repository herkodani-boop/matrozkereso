-- Run after soft-delete-listings-migration.sql, admin-platform-migration.sql,
-- ad-reports-migration.sql, and ad-report-review-migration.sql.

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS deletion_reason text
    CHECK (deletion_reason IN ('admin', 'owner', 'expired'));

UPDATE public.ads
SET deletion_reason = 'expired'
WHERE is_deleted IS TRUE
  AND deletion_reason IS NULL
  AND COALESCE(end_date, start_date) < COALESCE(deleted_at::date, CURRENT_DATE);

CREATE INDEX IF NOT EXISTS ads_user_deletion_reason_idx
  ON public.ads(user_id, deletion_reason);
CREATE INDEX IF NOT EXISTS ad_reports_ad_evaluation_status_idx
  ON public.ad_reports(ad_id, evaluation_status);
CREATE INDEX IF NOT EXISTS ad_reports_user_evaluation_status_idx
  ON public.ad_reports(user_id, evaluation_status);

CREATE OR REPLACE FUNCTION public.set_ad_deletion_reason()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_deleted IS TRUE AND OLD.is_deleted IS DISTINCT FROM TRUE THEN
    IF (SELECT auth.uid()) IS NOT NULL AND OLD.user_id = (SELECT auth.uid()) THEN
      NEW.deletion_reason := 'owner';
    ELSIF NEW.deletion_reason = 'expired' THEN
      RETURN NEW;
    ELSE
      NEW.deletion_reason := 'admin';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_ad_deletion_reason() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_ad_deletion_reason ON public.ads;
CREATE TRIGGER set_ad_deletion_reason
BEFORE UPDATE OF is_deleted ON public.ads
FOR EACH ROW
EXECUTE FUNCTION public.set_ad_deletion_reason();

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
      OR (
        TG_TABLE_NAME = 'ads'
        AND (to_jsonb(NEW) ->> 'deletion_reason') IS DISTINCT FROM (to_jsonb(OLD) ->> 'deletion_reason')
      )
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

DROP TRIGGER IF EXISTS prevent_soft_delete_by_user ON public.ads;
CREATE TRIGGER prevent_soft_delete_by_user
BEFORE UPDATE OF is_deleted, deleted_at, deletion_reason ON public.ads
FOR EACH ROW
EXECUTE FUNCTION public.prevent_soft_delete_by_user();

CREATE OR REPLACE FUNCTION public.owner_soft_delete_ad(p_ad_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_ad_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_active_user() THEN
    RAISE EXCEPTION 'A hirdetés törléséhez aktív, bejelentkezett fiók szükséges.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.ads
  SET is_active = false,
      is_deleted = true,
      deleted_at = now()
  WHERE id = p_ad_id
    AND user_id = (SELECT auth.uid())
    AND COALESCE(is_deleted, false) IS FALSE
  RETURNING id INTO deleted_ad_id;

  RETURN deleted_ad_id;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_soft_delete_ad(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_soft_delete_ad(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_user_listing_report_metrics()
RETURNS TABLE (
  user_id uuid,
  admin_deleted_listings bigint,
  valid_reports_received bigint,
  pending_reports_received bigint,
  invalid_reports_sent bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    profile.id,
    (
      SELECT count(*)::bigint
      FROM public.ads AS listing
      WHERE listing.user_id = profile.id
        AND listing.deletion_reason = 'admin'
    ),
    (
      SELECT count(*)::bigint
      FROM public.ad_reports AS report
      JOIN public.ads AS listing ON listing.id = report.ad_id
      WHERE listing.user_id = profile.id
        AND report.evaluation_status = 'valid'
    ),
    (
      SELECT count(*)::bigint
      FROM public.ad_reports AS report
      JOIN public.ads AS listing ON listing.id = report.ad_id
      WHERE listing.user_id = profile.id
        AND report.evaluation_status = 'pending'
    ),
    (
      SELECT count(*)::bigint
      FROM public.ad_reports AS report
      WHERE report.user_id = profile.id
        AND report.evaluation_status = 'invalid'
    )
  FROM public.users AS profile;
$$;

REVOKE ALL ON FUNCTION public.admin_user_listing_report_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_listing_report_metrics() TO service_role;

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
  SET is_deleted = true, deleted_at = deleted_on, deletion_reason = 'admin'
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
  SET is_deleted = true, deleted_at = deleted_on, deletion_reason = 'admin'
  WHERE (user_id = p_user_id OR boat_id = ANY(owned_boat_ids))
    AND is_deleted IS FALSE;

  UPDATE public.boat_events
  SET is_deleted = true, deleted_at = deleted_on
  WHERE boat_id = ANY(owned_boat_ids) AND is_deleted IS FALSE;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_restore_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_on timestamptz;
  restored_boat_ids uuid[];
BEGIN
  SELECT profile.deleted_at
  INTO deleted_on
  FROM public.users AS profile
  WHERE profile.id = p_user_id AND profile.is_deleted IS TRUE
  FOR UPDATE;

  IF NOT FOUND OR deleted_on IS NULL THEN
    RETURN false;
  END IF;

  SELECT coalesce(array_agg(boat.id), ARRAY[]::uuid[])
  INTO restored_boat_ids
  FROM public.boats AS boat
  WHERE boat.user_id = p_user_id
    AND boat.is_deleted IS TRUE
    AND boat.deleted_at = deleted_on;

  UPDATE public.users
  SET is_deleted = false, deleted_at = NULL, is_banned = false, banned_at = NULL
  WHERE id = p_user_id AND is_deleted IS TRUE;

  UPDATE public.boats
  SET is_deleted = false, deleted_at = NULL
  WHERE id = ANY(restored_boat_ids);

  UPDATE public.ads
  SET is_deleted = false, deleted_at = NULL, deletion_reason = NULL
  WHERE is_deleted IS TRUE
    AND deleted_at = deleted_on
    AND (user_id = p_user_id OR boat_id = ANY(restored_boat_ids));

  UPDATE public.boat_events
  SET is_deleted = false, deleted_at = NULL
  WHERE boat_id = ANY(restored_boat_ids)
    AND is_deleted IS TRUE
    AND deleted_at = deleted_on;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_ad_report(
  p_report_id uuid,
  p_decision text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_ad_id uuid;
BEGIN
  IF p_decision NOT IN ('valid', 'invalid') THEN
    RAISE EXCEPTION 'Érvénytelen bejelentésdöntés.'
      USING ERRCODE = '22023';
  END IF;

  SELECT ad_id
  INTO target_ad_id
  FROM public.ad_reports
  WHERE id = p_report_id AND is_deleted IS FALSE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM 1
  FROM public.ads
  WHERE id = target_ad_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM 1
  FROM public.ad_reports
  WHERE id = p_report_id AND ad_id = target_ad_id AND is_deleted IS FALSE
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_decision = 'valid' THEN
    UPDATE public.ads
    SET is_deleted = true, deleted_at = now(), deletion_reason = 'admin'
    WHERE id = target_ad_id AND is_deleted IS FALSE;

    UPDATE public.ad_reports
    SET is_deleted = true,
        deleted_at = now(),
        evaluation_status = CASE WHEN id = p_report_id THEN 'valid' ELSE evaluation_status END
    WHERE ad_id = target_ad_id AND is_deleted IS FALSE;
  ELSE
    UPDATE public.ad_reports
    SET is_deleted = true, deleted_at = now(), evaluation_status = 'invalid'
    WHERE id = p_report_id AND is_deleted IS FALSE;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_soft_delete_boat(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_soft_delete_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_restore_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_review_ad_report(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_boat(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_restore_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_ad_report(uuid, text) TO service_role;
