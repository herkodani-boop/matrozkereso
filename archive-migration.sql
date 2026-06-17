-- Add is_active column to ads table for archiving listings
ALTER TABLE ads
ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL;

-- Add index for faster filtering
CREATE INDEX idx_ads_is_active ON ads(is_active);
