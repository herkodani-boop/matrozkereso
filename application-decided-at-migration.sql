-- Mikor döntött a kapitány a jelentkezésről (elfogadás vagy elutasítás).
-- A matróz csengője ebből tudja, hogy "elfogadták a jelentkezésedet". A trigger minden
-- állapotváltáskor kitölti, így a kód egyik útvonalán sem kell külön beállítani.
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS decided_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_application_decided_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('accepted', 'rejected') THEN
    NEW.decided_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_set_decided_at ON public.applications;
CREATE TRIGGER applications_set_decided_at
BEFORE UPDATE OF status ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.set_application_decided_at();
