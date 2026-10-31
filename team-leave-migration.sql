-- Kilépés a csapatból a "Csapataim" oldalról. A crew-notices-migration.sql után kell futtatni.
-- A tag maga lép ki: a tagsága "removed" lesz, a közelgő eseményekre adott válaszai törlődnek
-- (ezt a boat_team_members_handle_removed trigger végzi), és a kapitány értesítést kap.
-- A trigger az auth.uid() alapján tudja, hogy a tag maga lépett ki, ezért neki nem szól.

ALTER TABLE public.crew_notices DROP CONSTRAINT IF EXISTS crew_notices_kind_check;
ALTER TABLE public.crew_notices
  ADD CONSTRAINT crew_notices_kind_check CHECK (kind IN ('event-cancelled', 'team-removed', 'member-left'));

CREATE OR REPLACE FUNCTION public.leave_boat_team(target_boat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me uuid := auth.uid();
  owner_id uuid;
  boat_label text;
  member_name text;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Ehhez be kell jelentkezni.' USING ERRCODE = '28000';
  END IF;

  UPDATE public.boat_team_members
  SET status = 'removed'
  WHERE boat_id = target_boat_id AND user_id = me AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nem vagy aktív tagja ennek a csapatnak.' USING ERRCODE = 'P0002';
  END IF;

  SELECT boat.user_id, boat.name INTO owner_id, boat_label
  FROM public.boats AS boat
  WHERE boat.id = target_boat_id;

  SELECT NULLIF(BTRIM(profile.full_name), '') INTO member_name
  FROM public.users AS profile
  WHERE profile.id = me;

  -- A kapitány értesítése: a title oszlop itt a kilépett tag neve.
  IF owner_id IS NOT NULL AND owner_id <> me THEN
    INSERT INTO public.crew_notices (user_id, kind, boat_name, title)
    VALUES (owner_id, 'member-left', boat_label, COALESCE(member_name, 'Egy csapattag'));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_boat_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_boat_team(uuid) TO authenticated;
