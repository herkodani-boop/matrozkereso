CREATE OR REPLACE FUNCTION public.revoke_application_contact(
  p_application_id uuid,
  p_event_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_user_id uuid;
  target_boat_id uuid;
  current_status text;
BEGIN
  SELECT application_record.user_id, listing.boat_id, application_record.status
  INTO target_user_id, target_boat_id, current_status
  FROM public.applications AS application_record
  JOIN public.ads AS listing ON listing.id = application_record.ad_id
  WHERE application_record.id = p_application_id
    AND listing.user_id = auth.uid()
  FOR UPDATE OF application_record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A jelentkezés nem található, vagy nincs jogosultságod módosítani.';
  END IF;

  IF current_status <> 'accepted' THEN
    RAISE EXCEPTION 'A jelentkezés állapota időközben megváltozott.';
  END IF;

  IF p_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.boat_events AS event_record
    WHERE event_record.id = p_event_id
      AND event_record.boat_id = target_boat_id
  ) THEN
    RAISE EXCEPTION 'Az esemény nem tartozik ehhez a hajóhoz.';
  END IF;

  UPDATE public.applications
  SET status = 'pending',
      captain_contact_shared_at = NULL,
      captain_contact_name = NULL,
      captain_contact_email = NULL,
      captain_contact_phone = NULL
  WHERE id = p_application_id;

  IF p_event_id IS NOT NULL THEN
    DELETE FROM public.boat_event_attendees
    WHERE event_id = p_event_id
      AND user_id = target_user_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_application_contact(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_application_contact(uuid, uuid) TO authenticated;
