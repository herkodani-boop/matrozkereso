ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS level text;

UPDATE public.users AS profile
SET level = auth_user.raw_user_meta_data ->> 'level'
FROM auth.users AS auth_user
WHERE auth_user.id = profile.id
  AND profile.level IS NULL
  AND auth_user.raw_user_meta_data ->> 'level' IN ('kezdo', 'halado', 'profi');
