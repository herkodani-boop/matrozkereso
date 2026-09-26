ALTER TABLE ads
ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES boat_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ads_event_id_idx
ON ads(event_id);

WITH unique_matches AS (
  SELECT
    ad.id AS ad_id,
    (ARRAY_AGG(event.id))[1] AS event_id
  FROM ads AS ad
  JOIN boat_events AS event
    ON event.boat_id = ad.boat_id
    AND LOWER(BTRIM(event.title)) = LOWER(BTRIM(ad.title))
    AND LOWER(BTRIM(event.location)) = LOWER(BTRIM(ad.location))
    AND event.start_date = ad.start_date
  WHERE ad.event_id IS NULL
  GROUP BY ad.id
  HAVING COUNT(*) = 1
)
UPDATE ads AS ad
SET event_id = unique_matches.event_id
FROM unique_matches
WHERE ad.id = unique_matches.ad_id;