-- A hirdetéskártya képkivágásának fókuszpontja (százalék, 0-100). Alapértelmezetten a kép közepe.
alter table public.ads
  add column if not exists image_focus_x smallint not null default 50 check (image_focus_x between 0 and 100),
  add column if not exists image_focus_y smallint not null default 50 check (image_focus_y between 0 and 100);
