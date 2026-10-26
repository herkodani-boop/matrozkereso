CREATE TABLE IF NOT EXISTS public.ad_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('tragar', 'spam', 'csalas', 'valotlan', 'egyeb')),
  extra_text text CHECK (extra_text IS NULL OR char_length(extra_text) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_reports_ad_id_idx ON public.ad_reports(ad_id);
CREATE INDEX IF NOT EXISTS ad_reports_user_id_idx ON public.ad_reports(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ad_reports_one_per_user_per_ad_idx
  ON public.ad_reports(ad_id, user_id);

ALTER TABLE public.ad_reports ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON TABLE public.ad_reports TO authenticated;
GRANT SELECT ON TABLE public.ad_reports TO authenticated;

DROP POLICY IF EXISTS ad_reports_insert_self ON public.ad_reports;
CREATE POLICY ad_reports_insert_self
ON public.ad_reports
FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS ad_reports_select_self ON public.ad_reports;
CREATE POLICY ad_reports_select_self
ON public.ad_reports
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));
