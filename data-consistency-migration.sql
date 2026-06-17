-- Data consistency migration
-- 1) Normalize role values in users
UPDATE users
SET role = CASE
  WHEN role IN ('skipper', 'kapitany', 'kapitány') THEN 'kapitany'
  WHEN role IN ('sailor', 'mancsaft', 'matroz', 'matróz') THEN 'mancsaft'
  ELSE role
END;

-- 2) Ensure ads.is_active exists and defaults to true
ALTER TABLE ads
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

UPDATE ads
SET is_active = true
WHERE is_active IS NULL;

ALTER TABLE ads
ALTER COLUMN is_active SET DEFAULT true,
ALTER COLUMN is_active SET NOT NULL;

-- 3) Normalize first positions value to canonical ASCII keys
UPDATE ads
SET positions = ARRAY[
  CASE
    WHEN positions IS NULL OR array_length(positions, 1) IS NULL THEN 'mancsaft'
    WHEN lower(positions[1]) IN ('kormanyos', 'kormányos') THEN 'kormanyos'
    WHEN lower(positions[1]) IN ('barmilyen', 'bármilyen', 'mindegy', 'egyeb', 'egyéb') THEN 'barmilyen'
    WHEN lower(positions[1]) IN ('mancsaft', 'matroz', 'matróz', 'trimmer') THEN 'mancsaft'
    ELSE 'mancsaft'
  END
]
WHERE true;

-- 4) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_ads_is_active ON ads(is_active);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
