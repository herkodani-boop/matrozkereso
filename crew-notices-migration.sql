-- A legénység értesítései azokról a változásokról, amelyek után nem marad nyom az eredeti táblában:
-- a kapitány töröl egy jövőbeli eseményt (a sor eltűnik), vagy eltávolít valakit a csapatból.
-- A bejegyzéseket csak a triggerek írják; a felhasználó a sajátjait olvashatja, a csengő ezekből dolgozik.
CREATE TABLE IF NOT EXISTS public.crew_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('event-cancelled', 'team-removed')),
  boat_name text,
  title text,
  event_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crew_notices_user_created_idx
ON public.crew_notices (user_id, created_at DESC);

ALTER TABLE public.crew_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crew_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.crew_notices TO authenticated;

DROP POLICY IF EXISTS crew_notices_select_own ON public.crew_notices;
CREATE POLICY crew_notices_select_own
ON public.crew_notices
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Jövőbeli esemény törlése: értesítés a csapat aktív tagjainak és az esemény résztvevőinek
-- (a kapitány kivételével). BEFORE DELETE, mert a résztvevői sorok a törléssel együtt eltűnnek.
CREATE OR REPLACE FUNCTION public.notify_event_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  owner_id uuid;
  boat_label text;
BEGIN
  IF COALESCE(OLD.end_date, OLD.start_date) < current_date THEN
    RETURN OLD;
  END IF;

  SELECT boat.user_id, boat.name INTO owner_id, boat_label
  FROM public.boats AS boat
  WHERE boat.id = OLD.boat_id;

  INSERT INTO public.crew_notices (user_id, kind, boat_name, title, event_date)
  SELECT recipient.user_id, 'event-cancelled', boat_label, OLD.title, OLD.start_date
  FROM (
    SELECT member.user_id
    FROM public.boat_team_members AS member
    WHERE member.boat_id = OLD.boat_id AND member.status = 'active' AND member.user_id IS NOT NULL
    UNION
    SELECT attendee.user_id
    FROM public.boat_event_attendees AS attendee
    WHERE attendee.event_id = OLD.id
  ) AS recipient
  WHERE recipient.user_id IS DISTINCT FROM owner_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS boat_events_notify_cancelled ON public.boat_events;
CREATE TRIGGER boat_events_notify_cancelled
BEFORE DELETE ON public.boat_events
FOR EACH ROW
EXECUTE FUNCTION public.notify_event_cancelled();

-- Aktív tag eltávolítása: a tag jövőbeli eseményekre adott válaszai törlődnek (különben továbbra is
-- látná az eseményeket, és a kapitány listáján is "jön" maradna), és értesítést kap. Ha a tag maga
-- lép ki, értesítés nem kell.
CREATE OR REPLACE FUNCTION public.handle_team_member_removed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.boat_event_attendees AS attendee
  USING public.boat_events AS event
  WHERE attendee.event_id = event.id
    AND attendee.user_id = NEW.user_id
    AND event.boat_id = NEW.boat_id
    AND COALESCE(event.end_date, event.start_date) >= current_date;

  IF auth.uid() IS DISTINCT FROM NEW.user_id THEN
    INSERT INTO public.crew_notices (user_id, kind, boat_name)
    SELECT NEW.user_id, 'team-removed', boat.name
    FROM public.boats AS boat
    WHERE boat.id = NEW.boat_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boat_team_members_handle_removed ON public.boat_team_members;
CREATE TRIGGER boat_team_members_handle_removed
AFTER UPDATE OF status ON public.boat_team_members
FOR EACH ROW
WHEN (OLD.status = 'active' AND NEW.status = 'removed' AND NEW.user_id IS NOT NULL)
EXECUTE FUNCTION public.handle_team_member_removed();
