ALTER TABLE public.ad_reports
  ADD COLUMN IF NOT EXISTS evaluation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DO $$
BEGIN
  ALTER TABLE public.ad_reports
    DROP CONSTRAINT IF EXISTS ad_reports_report_type_check;
  ALTER TABLE public.ad_reports
    ADD CONSTRAINT ad_reports_report_type_check
    CHECK (report_type IN ('boat_report', 'user_report', 'tragar', 'spam', 'csalas', 'valotlan', 'egyeb'));

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ad_reports_evaluation_status_check'
      AND conrelid = 'public.ad_reports'::regclass
  ) THEN
    ALTER TABLE public.ad_reports
      ADD CONSTRAINT ad_reports_evaluation_status_check
      CHECK (evaluation_status IN ('pending', 'valid', 'invalid'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ad_reports_one_per_user_per_ad_idx
  ON public.ad_reports(ad_id, user_id);

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
    SET is_deleted = true, deleted_at = now()
    WHERE id = target_ad_id AND is_deleted IS FALSE;

    UPDATE public.ad_reports
    SET is_deleted = true,
        deleted_at = now(),
        evaluation_status = CASE
          WHEN id = p_report_id THEN 'valid'
          ELSE evaluation_status
        END
    WHERE ad_id = target_ad_id AND is_deleted IS FALSE;
  ELSE
    UPDATE public.ad_reports
    SET is_deleted = true,
        deleted_at = now(),
        evaluation_status = 'invalid'
    WHERE id = p_report_id AND is_deleted IS FALSE;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_ad_report(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_ad_report(uuid, text) TO service_role;
