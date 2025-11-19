-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Users table policies
-- Users can only view their own data
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = auth_id);

-- Users can update their own data
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Loans table policies
-- Users can view their own loans
CREATE POLICY "loans_select_own" ON loans
  FOR SELECT USING (
    client_id = (
      SELECT id FROM clients WHERE email = (SELECT email FROM users WHERE auth_id = auth.uid()))
  );

-- Admins can view all loans
CREATE POLICY "loans_select_admin" ON loans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Admins can insert loans
CREATE POLICY "loans_insert_admin" ON loans
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Admins can update loans
CREATE POLICY "loans_update_admin" ON loans
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Admins can delete loans
CREATE POLICY "loans_delete_admin" ON loans
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Payment schedule policies
-- Users can view their own payment schedules
CREATE POLICY "payment_schedule_select_own" ON payment_schedule
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM loans 
      WHERE loans.id = payment_schedule.loan_id 
      AND loans.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- Admins can view all payment schedules
CREATE POLICY "payment_schedule_select_admin" ON payment_schedule
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Admins can insert payment schedules
CREATE POLICY "payment_schedule_insert_admin" ON payment_schedule
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Admins can update payment schedules
CREATE POLICY "payment_schedule_update_admin" ON payment_schedule
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Payments table policies
-- Users can view their own payments
CREATE POLICY "payments_select_own" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM loans 
      WHERE loans.id = payments.loan_id 
      AND loans.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- Admins can view all payments
CREATE POLICY "payments_select_admin" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Admins can insert payments
CREATE POLICY "payments_insert_admin" ON payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Admins can update payments
CREATE POLICY "payments_update_admin" ON payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );
