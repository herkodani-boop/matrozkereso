-- A hajó eredeti (nem kivágott) képe. A boats.image_url a 3:1 arányú fejléckivágás,
-- a hirdetéskártya pedig az eredeti képből, a hirdetés saját fókuszpontjával dolgozik.
alter table public.boats
  add column if not exists original_image_url text;
