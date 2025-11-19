CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  support_contact TEXT NOT NULL DEFAULT '+502 5555-5555',
  payment_instructions TEXT NOT NULL DEFAULT 'Paga en ventanilla, transferencia o vía asesor.',
  default_quiet_hours_start TIME NULL DEFAULT '08:00',
  default_quiet_hours_end TIME NULL DEFAULT '18:00',
  default_country_code TEXT NOT NULL DEFAULT '+502',
  timezone TEXT NOT NULL DEFAULT 'America/Guatemala',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_settings_admin_all ON system_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

