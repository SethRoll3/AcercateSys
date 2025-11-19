-- Fix RLS policies to properly map auth.uid() to users.auth_id
-- The issue is that policies are using auth.uid() = users.id when they should use auth.uid() = users.auth_id

-- Drop existing conflicting policies for loans
DROP POLICY IF EXISTS "Role-based loan insert" ON loans;
DROP POLICY IF EXISTS "loans_insert_admin" ON loans;

-- Create corrected loan insert policy
CREATE POLICY "Role-based loan insert" ON loans
    FOR INSERT WITH CHECK (
        -- Admin and advisors can create loans
        (SELECT role FROM users WHERE auth_id = auth.uid()) IN ('admin', 'asesor')
    );

-- Drop and recreate other loan policies with correct auth mapping
DROP POLICY IF EXISTS "Role-based loan access" ON loans;
CREATE POLICY "Role-based loan access" ON loans
    FOR SELECT USING (
        -- Admin can see all loans
        (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin' OR
        -- Advisor can see loans of their assigned clients
        ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'asesor' AND 
         client_id IN (SELECT id FROM clients WHERE advisor_id = (SELECT id FROM users WHERE auth_id = auth.uid()))) OR
        -- Client can see their own loans
        ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'cliente' AND client_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
    );

DROP POLICY IF EXISTS "Role-based loan update" ON loans;
CREATE POLICY "Role-based loan update" ON loans
    FOR UPDATE USING (
        -- Admin can update all loans
        (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin' OR
        -- Advisor can update loans of their assigned clients
        ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'asesor' AND 
         client_id IN (SELECT id FROM clients WHERE advisor_id = (SELECT id FROM users WHERE auth_id = auth.uid())))
    );

DROP POLICY IF EXISTS "Only admins can delete loans" ON loans;
CREATE POLICY "Only admins can delete loans" ON loans
    FOR DELETE USING (
        (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin'
    );

-- Fix payment schedule policies
DROP POLICY IF EXISTS "Role-based payment schedule insert" ON payment_schedule;
CREATE POLICY "Role-based payment schedule insert" ON payment_schedule
    FOR INSERT WITH CHECK (
        -- Admin and advisors can create payment schedules
        (SELECT role FROM users WHERE auth_id = auth.uid()) IN ('admin', 'asesor')
    );

DROP POLICY IF EXISTS "Role-based payment schedule access" ON payment_schedule;
CREATE POLICY "Role-based payment schedule access" ON payment_schedule
    FOR SELECT USING (
        -- Admin can see all payment schedules
        (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin' OR
        -- Advisor can see payment schedules of their assigned clients' loans
        ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'asesor' AND 
         loan_id IN (
             SELECT l.id FROM loans l 
             INNER JOIN clients c ON l.client_id = c.id 
             WHERE c.advisor_id = (SELECT id FROM users WHERE auth_id = auth.uid())
         )) OR
        -- Client can see their own payment schedules
        ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'cliente' AND 
         loan_id IN (SELECT id FROM loans WHERE client_id = (SELECT id FROM users WHERE auth_id = auth.uid())))
    );

DROP POLICY IF EXISTS "Role-based payment schedule update" ON payment_schedule;
CREATE POLICY "Role-based payment schedule update" ON payment_schedule
    FOR UPDATE USING (
        -- Admin can update all payment schedules
        (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin' OR
        -- Advisor can update payment schedules of their assigned clients' loans
        ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'asesor' AND 
         loan_id IN (
             SELECT l.id FROM loans l 
             INNER JOIN clients c ON l.client_id = c.id 
             WHERE c.advisor_id = (SELECT id FROM users WHERE auth_id = auth.uid())
         ))
    );

DROP POLICY IF EXISTS "Only admins can delete payment schedules" ON payment_schedule;
CREATE POLICY "Only admins can delete payment schedules" ON payment_schedule
    FOR DELETE USING (
        (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin'
    );

-- Fix payment policies
DROP POLICY IF EXISTS "Role-based payment insert" ON payments;
CREATE POLICY "Role-based payment insert" ON payments
    FOR INSERT WITH CHECK (
        -- Admin and advisors can create payments
        (SELECT role FROM users WHERE auth_id = auth.uid()) IN ('admin', 'asesor')
    );

DROP POLICY IF EXISTS "Role-based payment access" ON payments;
CREATE POLICY "Role-based payment access" ON payments
    FOR SELECT USING (
        -- Admin can see all payments
        (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin' OR
        -- Advisor can see payments of their assigned clients' loans
        ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'asesor' AND 
         loan_id IN (
             SELECT l.id FROM loans l 
             INNER JOIN clients c ON l.client_id = c.id 
             WHERE c.advisor_id = (SELECT id FROM users WHERE auth_id = auth.uid())
         )) OR
        -- Client can see their own payments
        ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'cliente' AND 
         loan_id IN (SELECT id FROM loans WHERE client_id = (SELECT id FROM users WHERE auth_id = auth.uid())))
    );

DROP POLICY IF EXISTS "Role-based payment update" ON payments;
CREATE POLICY "Role-based payment update" ON payments
    FOR UPDATE USING (
        -- Admin can update all payments
        (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin' OR
        -- Advisor can update payments of their assigned clients' loans
        ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'asesor' AND 
         loan_id IN (
             SELECT l.id FROM loans l 
             INNER JOIN clients c ON l.client_id = c.id 
             WHERE c.advisor_id = (SELECT id FROM users WHERE auth_id = auth.uid())
         ))
    );

DROP POLICY IF EXISTS "Only admins can delete payments" ON payments;
CREATE POLICY "Only admins can delete payments" ON payments
    FOR DELETE USING (
        (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin'
    );

-- Fix client policies
DROP POLICY IF EXISTS "Role-based client insert" ON clients;
CREATE POLICY "Role-based client insert" ON clients
    FOR INSERT WITH CHECK (
        -- Admin and advisors can create clients
        (SELECT role FROM users WHERE auth_id = auth.uid()) IN ('admin', 'asesor')
    );

DROP POLICY IF EXISTS "Role-based client access" ON clients;
CREATE POLICY "Role-based client access" ON clients
    FOR SELECT USING (
        -- Admin can see all clients
        (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin' OR
        -- Advisor can see their assigned clients
        ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'asesor' AND advisor_id = (SELECT id FROM users WHERE auth_id = auth.uid())) OR
        -- Client can see their own record
        ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'cliente' AND id = (SELECT id FROM users WHERE auth_id = auth.uid()))
    );

DROP POLICY IF EXISTS "Role-based client update" ON clients;
CREATE POLICY "Role-based client update" ON clients
    FOR UPDATE USING (
        -- Admin can update all clients
        (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin' OR
        -- Advisor can update their assigned clients
        ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'asesor' AND advisor_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
    );

DROP POLICY IF EXISTS "Only admins can delete clients" ON clients;
CREATE POLICY "Only admins can delete clients" ON clients
    FOR DELETE USING (
        (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin'
    );

-- Fix users table policies - EMERGENCY FIX
DROP POLICY IF EXISTS "Users can view own data and admins can view all" ON users;
DROP POLICY IF EXISTS "Users can view their own data" ON users;
DROP POLICY IF EXISTS "Users can view own data, and admins/advisors can view all" ON users;

CREATE POLICY "EMERGENCY FIX - Users can view their own data" ON users
    FOR SELECT USING (
        auth.uid() = auth_id
    );

DROP POLICY IF EXISTS "Users can update own data and admins can update all" ON users;
CREATE POLICY "EMERGENCY FIX - Users can update their own data" ON users
    FOR UPDATE USING (
        auth.uid() = auth_id
    );