CREATE TABLE IF NOT EXISTS boat_event_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES boat_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id),
  CHECK (char_length(status) > 0)
);

CREATE INDEX IF NOT EXISTS boat_event_attendees_event_id_idx
  ON boat_event_attendees (event_id);

CREATE INDEX IF NOT EXISTS boat_event_attendees_user_id_idx
  ON boat_event_attendees (user_id);

CREATE OR REPLACE FUNCTION update_boat_event_attendees_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boat_event_attendees_set_updated_at ON boat_event_attendees;
CREATE TRIGGER boat_event_attendees_set_updated_at
BEFORE UPDATE ON boat_event_attendees
FOR EACH ROW
EXECUTE FUNCTION update_boat_event_attendees_updated_at();
