-- Hirdetésenkénti jelentkezői limit (NULL = korlátlan). A meglévő hirdetések 25-ös limitet kapnak.
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS max_applicants integer DEFAULT 25
  CHECK (max_applicants IS NULL OR max_applicants > 0);

CREATE OR REPLACE FUNCTION public.enforce_application_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  listing_limit integer;
  active_count integer;
BEGIN
  SELECT listing.max_applicants
  INTO listing_limit
  FROM public.ads AS listing
  WHERE listing.id = NEW.ad_id
  FOR UPDATE;

  IF listing_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO active_count
  FROM public.applications AS application
  WHERE application.ad_id = NEW.ad_id
    AND application.status <> 'rejected';

  IF active_count >= listing_limit THEN
    RAISE EXCEPTION 'Erre a hirdetésre betelt a jelentkezők maximális száma.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_application_limit ON public.applications;

CREATE TRIGGER enforce_application_limit
BEFORE INSERT ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.enforce_application_limit();
