-- Migration: Add roles and advisor system (Fixed)
-- Created: 2025-01-16
-- Description: Adds role-based access control and advisor-client relationships

-- First, drop all existing policies that depend on the role column
DROP POLICY IF EXISTS "loans_select_admin" ON loans;
DROP POLICY IF EXISTS "loans_insert_admin" ON loans;
DROP POLICY IF EXISTS "loans_update_admin" ON loans;
DROP POLICY IF EXISTS "loans_delete_admin" ON loans;
DROP POLICY IF EXISTS "payments_insert_admin" ON payments;
DROP POLICY IF EXISTS "payments_update_admin" ON payments;
DROP POLICY IF EXISTS "payments_delete_admin" ON payments;
DROP POLICY IF EXISTS "Admins can insert boletas" ON boletas;
DROP POLICY IF EXISTS "Admins can update boletas" ON boletas;
DROP POLICY IF EXISTS "Admins can delete boletas" ON boletas;
DROP POLICY IF EXISTS "cuota_boletas_insert_admin" ON cuota_boletas;
DROP POLICY IF EXISTS "cuota_boletas_update_admin" ON cuota_boletas;
DROP POLICY IF EXISTS "cuota_boletas_delete_admin" ON cuota_boletas;

-- Create enum for user roles if it doesn't exist
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'cliente', 'asesor');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Check if role column exists and add it if it doesn't
DO $$ 
BEGIN
    -- Try to add role column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role' AND table_schema = 'public') THEN
        ALTER TABLE users ADD COLUMN role user_role DEFAULT 'cliente';
    ELSE
        -- If it exists but is VARCHAR, convert it to the enum
        ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;
    END IF;
    
    -- Add advisor_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'advisor_id' AND table_schema = 'public') THEN
        ALTER TABLE users ADD COLUMN advisor_id UUID REFERENCES users(id);
    END IF;
END $$;

-- Add advisor_id to clients table to establish advisor-client relationship
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'advisor_id' AND table_schema = 'public') THEN
        ALTER TABLE clients ADD COLUMN advisor_id UUID REFERENCES users(id);
    END IF;
END $$;

-- Create indexes for better performance on advisor queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_advisor_id ON users(advisor_id);
CREATE INDEX IF NOT EXISTS idx_clients_advisor_id ON clients(advisor_id);

-- Create a view for advisors with their assigned clients
CREATE OR REPLACE VIEW advisor_clients AS
SELECT 
    u.id as advisor_id,
    u.email as advisor_email,
    u.full_name as advisor_name,
    c.id as client_id,
    CONCAT(c.first_name, ' ', c.last_name) as client_name,
    c.phone as client_phone,
    c.address as client_address,
    c.created_at as client_created_at
FROM users u
LEFT JOIN clients c ON u.id = c.advisor_id
WHERE u.role = 'asesor';

-- Create a function to get clients accessible by a user based on their role
CREATE OR REPLACE FUNCTION get_accessible_clients(user_id UUID)
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    address TEXT,
    emergency_phone TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    advisor_id UUID
) AS $$
DECLARE
    user_role_val user_role;
BEGIN
    -- Get the user's role
    SELECT role INTO user_role_val FROM users WHERE users.id = user_id;
    
    -- Return clients based on role
    IF user_role_val = 'admin' THEN
        -- Admin can see all clients
        RETURN QUERY SELECT * FROM clients;
    ELSIF user_role_val = 'asesor' THEN
        -- Advisor can only see their assigned clients
        RETURN QUERY SELECT * FROM clients WHERE clients.advisor_id = user_id;
    ELSIF user_role_val = 'cliente' THEN
        -- Client can only see their own record (if they exist in clients table)
        RETURN QUERY SELECT * FROM clients WHERE clients.id = user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to get loans accessible by a user based on their role
CREATE OR REPLACE FUNCTION get_accessible_loans(user_id UUID)
RETURNS TABLE (
    id UUID,
    client_id UUID,
    amount DECIMAL,
    interest_rate DECIMAL,
    term_months INTEGER,
    monthly_payment DECIMAL,
    start_date DATE,
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
DECLARE
    user_role_val user_role;
BEGIN
    -- Get the user's role
    SELECT role INTO user_role_val FROM users WHERE users.id = user_id;
    
    -- Return loans based on role
    IF user_role_val = 'admin' THEN
        -- Admin can see all loans
        RETURN QUERY SELECT * FROM loans;
    ELSIF user_role_val = 'asesor' THEN
        -- Advisor can see loans of their assigned clients
        RETURN QUERY 
        SELECT l.* FROM loans l
        INNER JOIN clients c ON l.client_id = c.id
        WHERE c.advisor_id = user_id;
    ELSIF user_role_val = 'cliente' THEN
        -- Client can only see their own loans
        RETURN QUERY SELECT * FROM loans WHERE loans.client_id = user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to get payments accessible by a user based on their role
CREATE OR REPLACE FUNCTION get_accessible_payments(user_id UUID)
RETURNS TABLE (
    id UUID,
    loan_id UUID,
    schedule_id UUID,
    amount DECIMAL,
    payment_date DATE,
    receipt_number TEXT,
    payment_method TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    user_role_val user_role;
BEGIN
    -- Get the user's role
    SELECT role INTO user_role_val FROM users WHERE users.id = user_id;
    
    -- Return payments based on role
    IF user_role_val = 'admin' THEN
        -- Admin can see all payments
        RETURN QUERY SELECT * FROM payments;
    ELSIF user_role_val = 'asesor' THEN
        -- Advisor can see payments of their assigned clients' loans
        RETURN QUERY 
        SELECT p.* FROM payments p
        INNER JOIN loans l ON p.loan_id = l.id
        INNER JOIN clients c ON l.client_id = c.id
        WHERE c.advisor_id = user_id;
    ELSIF user_role_val = 'cliente' THEN
        -- Client can only see their own payments
        RETURN QUERY 
        SELECT p.* FROM payments p
        INNER JOIN loans l ON p.loan_id = l.id
        WHERE l.client_id = user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies for role-based access

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;
DROP POLICY IF EXISTS "Enable read access for all users" ON clients;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON clients;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON clients;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON clients;

-- Enable RLS on clients table if not already enabled
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view own data and admins can view all" ON users
    FOR SELECT USING (
        auth.uid() = id OR 
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

CREATE POLICY "Users can update own data and admins can update all" ON users
    FOR UPDATE USING (
        auth.uid() = id OR 
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

CREATE POLICY "Only admins can insert users" ON users
    FOR INSERT WITH CHECK (
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

-- Clients table policies
CREATE POLICY "Role-based client access" ON clients
    FOR SELECT USING (
        -- Admin can see all clients
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can see their assigned clients
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND advisor_id = auth.uid()) OR
        -- Client can see their own record
        ((SELECT role FROM users WHERE id = auth.uid()) = 'cliente' AND id = auth.uid())
    );

CREATE POLICY "Role-based client insert" ON clients
    FOR INSERT WITH CHECK (
        -- Admin and advisors can create clients
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor')
    );

CREATE POLICY "Role-based client update" ON clients
    FOR UPDATE USING (
        -- Admin can update all clients
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can update their assigned clients
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND advisor_id = auth.uid())
    );

CREATE POLICY "Only admins can delete clients" ON clients
    FOR DELETE USING (
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

-- Loans table policies
DROP POLICY IF EXISTS "loans_select_own" ON loans;
DROP POLICY IF EXISTS "loans_select_admin" ON loans;
DROP POLICY IF EXISTS "loans_insert_admin" ON loans;
DROP POLICY IF EXISTS "loans_update_admin" ON loans;
DROP POLICY IF EXISTS "loans_delete_admin" ON loans;

CREATE POLICY "Role-based loan access" ON loans
    FOR SELECT USING (
        -- Admin can see all loans
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can see loans of their assigned clients
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND 
         client_id IN (SELECT id FROM clients WHERE advisor_id = auth.uid())) OR
        -- Client can see their own loans
        ((SELECT role FROM users WHERE id = auth.uid()) = 'cliente' AND client_id = auth.uid())
    );

CREATE POLICY "Role-based loan insert" ON loans
    FOR INSERT WITH CHECK (
        -- Admin and advisors can create loans
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor')
    );

CREATE POLICY "Role-based loan update" ON loans
    FOR UPDATE USING (
        -- Admin can update all loans
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can update loans of their assigned clients
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND 
         client_id IN (SELECT id FROM clients WHERE advisor_id = auth.uid()))
    );

CREATE POLICY "Only admins can delete loans" ON loans
    FOR DELETE USING (
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

-- Payments table policies
DROP POLICY IF EXISTS "payments_select_own" ON payments;
DROP POLICY IF EXISTS "payments_insert_admin" ON payments;
DROP POLICY IF EXISTS "payments_update_admin" ON payments;
DROP POLICY IF EXISTS "payments_delete_admin" ON payments;

CREATE POLICY "Role-based payment access" ON payments
    FOR SELECT USING (
        -- Admin can see all payments
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can see payments of their assigned clients' loans
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND 
         loan_id IN (
             SELECT l.id FROM loans l 
             INNER JOIN clients c ON l.client_id = c.id 
             WHERE c.advisor_id = auth.uid()
         )) OR
        -- Client can see their own payments
        ((SELECT role FROM users WHERE id = auth.uid()) = 'cliente' AND 
         loan_id IN (SELECT id FROM loans WHERE client_id = auth.uid()))
    );

CREATE POLICY "Role-based payment insert" ON payments
    FOR INSERT WITH CHECK (
        -- Admin and advisors can create payments
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor')
    );

CREATE POLICY "Role-based payment update" ON payments
    FOR UPDATE USING (
        -- Admin can update all payments
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can update payments of their assigned clients' loans
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND 
         loan_id IN (
             SELECT l.id FROM loans l 
             INNER JOIN clients c ON l.client_id = c.id 
             WHERE c.advisor_id = auth.uid()
         ))
    );

CREATE POLICY "Only admins can delete payments" ON payments
    FOR DELETE USING (
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

-- Recreate boletas policies
CREATE POLICY "Admins can insert boletas" ON boletas
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "Admins can update boletas" ON boletas
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "Admins can delete boletas" ON boletas
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Recreate cuota_boletas policies
CREATE POLICY "cuota_boletas_insert_admin" ON cuota_boletas
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "cuota_boletas_update_admin" ON cuota_boletas
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "cuota_boletas_delete_admin" ON cuota_boletas
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Add comments for documentation
COMMENT ON COLUMN users.role IS 'User role determining access permissions';
COMMENT ON COLUMN users.advisor_id IS 'For clients: ID of assigned advisor';
COMMENT ON COLUMN clients.advisor_id IS 'ID of the advisor assigned to this client';
COMMENT ON VIEW advisor_clients IS 'View showing advisors and their assigned clients';
COMMENT ON FUNCTION get_accessible_clients IS 'Returns clients accessible to a user based on their role';
COMMENT ON FUNCTION get_accessible_loans IS 'Returns loans accessible to a user based on their role';
COMMENT ON FUNCTION get_accessible_payments IS 'Returns payments accessible to a user based on their role';