CREATE OR REPLACE FUNCTION public.prevent_owner_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  listing_owner_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'A jelentkezés csak a bejelentkezett felhasználó nevében adható be.'
      USING ERRCODE = '42501';
  END IF;

  SELECT listing.user_id
  INTO listing_owner_id
  FROM public.ads AS listing
  WHERE listing.id = NEW.ad_id;

  IF listing_owner_id IS NOT NULL AND listing_owner_id = NEW.user_id THEN
    RAISE EXCEPTION 'Saját hirdetésre nem lehet jelentkezni.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_owner_application ON public.applications;

CREATE TRIGGER prevent_owner_application
BEFORE INSERT OR UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.prevent_owner_application();
