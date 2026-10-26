DROP POLICY IF EXISTS boats_insert_owner ON public.boats;

CREATE POLICY boats_insert_owner
ON public.boats
FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));
