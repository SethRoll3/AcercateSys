ALTER TABLE loans
ADD COLUMN client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_loans_user_id;

ALTER TABLE loans
DROP COLUMN user_id;

CREATE INDEX IF NOT EXISTS idx_loans_client_id ON loans(client_id);

CREATE POLICY "loans_select_own" ON loans
  FOR SELECT USING (auth.uid() = client_id);