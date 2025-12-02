-- Add dynamic mora settings to system_settings
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS dynamic_mora_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dynamic_mora_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Ensure admins can read/update the new columns via existing RLS policy
-- No additional policy changes required since system_settings_admin_all covers ALL columns

