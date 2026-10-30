-- Keresett posztok egyszerűsítése (2026-10)
-- 1) Új mező: hány főt keres a hirdetés összesen (régi hirdetéseknél üres)
ALTER TABLE ads
ADD COLUMN IF NOT EXISTS crew_needed INTEGER;

ALTER TABLE ads
DROP CONSTRAINT IF EXISTS ads_crew_needed_range;

ALTER TABLE ads
ADD CONSTRAINT ads_crew_needed_range CHECK (crew_needed IS NULL OR crew_needed BETWEEN 1 AND 30);

-- 2) Régi posztértékek az új kulcsokra: a "bármilyen" jellegűek segítő legénység,
--    a "foredeck" írásmód az "fordeck" kulcs. Ismétlődések kiszűrve, a sorrend megmarad.
UPDATE ads
SET positions = COALESCE((
  SELECT array_agg(normalized ORDER BY first_index)
  FROM (
    SELECT normalized, min(idx) AS first_index
    FROM (
      SELECT
        idx,
        CASE
          WHEN lower(trim(value)) IN ('barmilyen', 'bármilyen', 'mindegy', 'egyeb', 'egyéb', 'matroz', 'matróz', 'trimmer') THEN 'mancsaft'
          WHEN lower(trim(value)) = 'foredeck' THEN 'fordeck'
          ELSE trim(value)
        END AS normalized
      FROM unnest(positions) WITH ORDINALITY AS item(value, idx)
      WHERE trim(value) <> ''
    ) mapped
    GROUP BY normalized
  ) deduped
), ARRAY['mancsaft'])
WHERE positions IS NOT NULL
  AND array_length(positions, 1) IS NOT NULL;
