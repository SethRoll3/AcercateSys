-- Notifications system tables
-- Run this in Supabase SQL editor if needed. RLS policies included for admin-only access.

-- Logs of all notification attempts
CREATE TABLE IF NOT EXISTS notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NULL REFERENCES clients(id) ON DELETE SET NULL,
  loan_id UUID NULL REFERENCES loans(id) ON DELETE SET NULL,
  schedule_id UUID NULL REFERENCES payment_schedule(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms','whatsapp')),
  stage TEXT NOT NULL,
  message_template TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','failed','ignored')),
  error_code TEXT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMP WITH TIME ZONE NULL,
  next_retry_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_log_schedule ON notifications_log(schedule_id);
CREATE INDEX IF NOT EXISTS idx_notifications_log_stage_channel ON notifications_log(stage, channel);
CREATE INDEX IF NOT EXISTS idx_notifications_log_status ON notifications_log(status);

-- Per-client settings/opt-ins
CREATE TABLE IF NOT EXISTS notifications_settings (
  client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  sms_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_channel TEXT NOT NULL DEFAULT 'both' CHECK (preferred_channel IN ('both','sms','whatsapp')),
  quiet_hours_start TIME NULL,
  quiet_hours_end TIME NULL,
  weekly_reminder_day INTEGER NULL CHECK (weekly_reminder_day BETWEEN 0 AND 6), -- 0=Sunday
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Templates repository for messages
CREATE TABLE IF NOT EXISTS notifications_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms','whatsapp')),
  locale TEXT NOT NULL DEFAULT 'es-GT',
  text TEXT NOT NULL,
  variables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_templates_key_channel_locale
  ON notifications_templates(key, channel, locale);

-- Enable RLS
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_templates ENABLE ROW LEVEL SECURITY;

-- Admin-only policies (service role will bypass RLS)
CREATE POLICY notifications_log_admin_select ON notifications_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );
CREATE POLICY notifications_log_admin_insert ON notifications_log
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );
CREATE POLICY notifications_log_admin_update ON notifications_log
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY notifications_settings_admin_all ON notifications_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY notifications_templates_admin_all ON notifications_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

