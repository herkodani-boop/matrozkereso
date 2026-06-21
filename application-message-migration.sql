-- Add optional free-text message for applicants
ALTER TABLE applications
ADD COLUMN IF NOT EXISTS message TEXT;

-- Keep stored messages bounded to the UI limit
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'applications_message_length_check'
	) THEN
		ALTER TABLE applications
		ADD CONSTRAINT applications_message_length_check
		CHECK (message IS NULL OR char_length(message) <= 500);
	END IF;
END $$;
