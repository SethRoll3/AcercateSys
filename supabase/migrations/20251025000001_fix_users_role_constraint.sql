-- Fix users table role constraint
-- Remove the old CHECK constraint that only allows 'admin' and 'user'
-- The table should use the user_role ENUM type instead

-- First, find and drop the existing CHECK constraint
DO $$ 
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the constraint name
    SELECT conname INTO constraint_name
    FROM pg_constraint 
    WHERE conrelid = 'users'::regclass 
    AND contype = 'c' 
    AND consrc LIKE '%role%IN%';
    
    -- Drop the constraint if it exists
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || constraint_name;
        RAISE NOTICE 'Dropped constraint: %', constraint_name;
    END IF;
END $$;

-- Ensure the role column uses the user_role ENUM type
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;

-- Add a comment for documentation
COMMENT ON COLUMN users.role IS 'User role using user_role ENUM type (admin, cliente, asesor)';