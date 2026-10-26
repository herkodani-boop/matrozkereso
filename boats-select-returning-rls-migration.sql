DROP POLICY IF EXISTS boats_select_visible ON public.boats;

CREATE POLICY boats_select_visible
ON public.boats
FOR SELECT
TO anon, authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    (
      public.is_active_boat_team_member(id)
      OR EXISTS (
        SELECT 1
        FROM public.ads AS listing
        WHERE listing.boat_id = boats.id
          AND listing.is_active IS TRUE
          AND COALESCE(listing.is_deleted, false) IS FALSE
      )
    )
    AND public.is_public_boat(boats.id, boats.user_id)
  )
);
