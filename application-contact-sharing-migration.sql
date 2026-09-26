ALTER TABLE applications
ADD COLUMN IF NOT EXISTS captain_contact_shared_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS captain_contact_name TEXT,
ADD COLUMN IF NOT EXISTS captain_contact_email TEXT,
ADD COLUMN IF NOT EXISTS captain_contact_phone TEXT;