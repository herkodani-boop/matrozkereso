-- Új jelentkezésről szóló kapitányi e-mail: jelentkezésenként egyszer küldjük ki.
-- Az /api/applications/notify-captain route ezt a mezőt foglalja le atomikusan.
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS captain_notified_at timestamptz;
