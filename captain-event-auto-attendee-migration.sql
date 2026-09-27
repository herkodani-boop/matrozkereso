CREATE OR REPLACE FUNCTION public.add_event_owner_as_attendee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.boat_event_attendees (event_id, user_id, status)
  SELECT NEW.id, boat.user_id, 'confirmed'
  FROM public.boats AS boat
  WHERE boat.id = NEW.boat_id
    AND boat.user_id = auth.uid()
  ON CONFLICT (event_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boat_event_owner_auto_attendee ON public.boat_events;

CREATE TRIGGER boat_event_owner_auto_attendee
AFTER INSERT ON public.boat_events
FOR EACH ROW
EXECUTE FUNCTION public.add_event_owner_as_attendee();