CREATE TABLE IF NOT EXISTS boat_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_id uuid NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('Verseny', 'Edzés', 'Egyéb')),
  start_date date NOT NULL,
  end_date date,
  is_one_day boolean NOT NULL DEFAULT false,
  location text NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(title) > 0),
  CHECK (char_length(location) > 0),
  CHECK (NOT is_one_day OR end_date IS NULL OR end_date = start_date),
  CHECK (NOT is_one_day OR start_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS boat_events_boat_id_idx
  ON boat_events (boat_id);

CREATE INDEX IF NOT EXISTS boat_events_start_date_idx
  ON boat_events (start_date);

CREATE OR REPLACE FUNCTION update_boat_events_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boat_events_set_updated_at ON boat_events;
CREATE TRIGGER boat_events_set_updated_at
BEFORE UPDATE ON boat_events
FOR EACH ROW
EXECUTE FUNCTION update_boat_events_updated_at();
