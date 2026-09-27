ALTER TABLE public.boat_event_attendees
  DROP CONSTRAINT IF EXISTS boat_event_attendees_status_check;

ALTER TABLE public.boat_event_attendees
  ADD CONSTRAINT boat_event_attendees_status_check
  CHECK (status IN ('confirmed', 'pending', 'declined', 'unset'));
