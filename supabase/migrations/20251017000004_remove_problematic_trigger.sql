-- Migration: Remove problematic trigger
-- Created: 2025-01-17
-- Description: Remove the trigger that's causing "Database error creating new user"

-- Drop the trigger that's causing issues
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the function as well
DROP FUNCTION IF EXISTS public.handle_new_user();

-- We'll handle user synchronization manually for now