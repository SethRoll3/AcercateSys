-- Users table with role-based access 
 CREATE TABLE IF NOT EXISTS users ( 
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  email VARCHAR(255) UNIQUE NOT NULL, 
  password_hash VARCHAR(255) NOT NULL, 
  full_name VARCHAR(255) NOT NULL, 
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'user')), 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), 
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() 
 ); 
 
 
 -- Loans table 
 CREATE TABLE IF NOT EXISTS loans ( 
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, 
  loan_number VARCHAR(50) UNIQUE NOT NULL, 
  amount DECIMAL(12, 2) NOT NULL, 
  interest_rate DECIMAL(5, 2) NOT NULL, 
  term_months INTEGER NOT NULL, 
  monthly_payment DECIMAL(12, 2) NOT NULL, 
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'paid', 'defaulted', 'pending')), 
  start_date DATE NOT NULL, 
  end_date DATE NOT NULL, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), 
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() 
 ); 
 
 
 -- Payment schedule table 
 CREATE TABLE IF NOT EXISTS payment_schedule ( 
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE, 
  payment_number INTEGER NOT NULL, 
  due_date DATE NOT NULL, 
  amount DECIMAL(12, 2) NOT NULL, 
  principal DECIMAL(12, 2) NOT NULL, 
  interest DECIMAL(12, 2) NOT NULL, 
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'paid', 'overdue')), 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() 
 ); 
 
 
 -- Payments table (actual payments made) 
 CREATE TABLE IF NOT EXISTS payments ( 
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE, 
  schedule_id UUID REFERENCES payment_schedule(id) ON DELETE SET NULL, 
  amount DECIMAL(12, 2) NOT NULL, 
  payment_date DATE NOT NULL, 
  receipt_number VARCHAR(50) UNIQUE NOT NULL, 
  payment_method VARCHAR(50) NOT NULL, 
  notes TEXT, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() 
 ); 
 
 
 -- Create indexes for better query performance 
 CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id); 
 CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status); 
 CREATE INDEX IF NOT EXISTS idx_payment_schedule_loan_id ON payment_schedule(loan_id); 
 CREATE INDEX IF NOT EXISTS idx_payments_loan_id ON payments(loan_id); 
 CREATE INDEX IF NOT EXISTS idx_payments_schedule_id ON payments(schedule_id);