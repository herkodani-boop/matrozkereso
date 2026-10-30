-- Csengő: mikor nézte meg a felhasználó utoljára az értesítéseit (2026-10).
-- Az ennél újabb visszajelzések, jelentkezések és csapatba lépések számítanak újnak.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS notifications_seen_at timestamptz;
