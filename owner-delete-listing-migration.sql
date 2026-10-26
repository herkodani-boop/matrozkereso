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
