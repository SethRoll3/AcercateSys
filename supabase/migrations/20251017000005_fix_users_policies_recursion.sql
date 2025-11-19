-- Migration: Fix users table policies recursion and add missing advisor_id column
-- Created: 2025-01-17
-- Description: Fix infinite recursion in users table policies and add advisor_id column

-- First, add the missing advisor_id column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS advisor_id UUID REFERENCES users(id);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_users_advisor_id ON users(advisor_id);

-- Drop all existing problematic policies on users table
DROP POLICY IF EXISTS "Users can view own data and admins can view all" ON users;
DROP POLICY IF EXISTS "Users can update own data and admins can update all" ON users;
DROP POLICY IF EXISTS "Only admins can insert users" ON users;
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;

-- Create a simple function to get user role without recursion
CREATE OR REPLACE FUNCTION get_user_role(user_auth_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role 
    FROM users 
    WHERE auth_id = user_auth_id;
    
    RETURN COALESCE(user_role, 'user');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new non-recursive policies for users table
CREATE POLICY "users_select_policy" ON users
    FOR SELECT USING (
        -- Users can see their own data
        auth.uid() = auth_id OR
        -- Admins can see all users (using function to avoid recursion)
        get_user_role(auth.uid()) = 'admin'
    );

CREATE POLICY "users_update_policy" ON users
    FOR UPDATE USING (
        -- Users can update their own data
        auth.uid() = auth_id OR
        -- Admins can update all users
        get_user_role(auth.uid()) = 'admin'
    );

CREATE POLICY "users_insert_policy" ON users
    FOR INSERT WITH CHECK (
        -- Only admins can insert new users
        get_user_role(auth.uid()) = 'admin'
    );

CREATE POLICY "users_delete_policy" ON users
    FOR DELETE USING (
        -- Only admins can delete users
        get_user_role(auth.uid()) = 'admin'
    );