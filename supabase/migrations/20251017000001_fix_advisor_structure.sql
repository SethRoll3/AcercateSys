-- Migration: Fix advisor structure
-- Created: 2025-01-17
-- Description: Remove advisor_id from users table as it should only be in clients table

-- Remove advisor_id column from users table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'advisor_id' AND table_schema = 'public') THEN
        ALTER TABLE users DROP COLUMN advisor_id;
    END IF;
END $$;

-- Drop the index on users.advisor_id if it exists
DROP INDEX IF EXISTS idx_users_advisor_id;

-- Update the advisor_clients view to remove reference to users.advisor_id
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

-- Ensure the clients table has the advisor_id column (should already exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'advisor_id' AND table_schema = 'public') THEN
        ALTER TABLE clients ADD COLUMN advisor_id UUID REFERENCES users(id);
    END IF;
END $$;

-- Ensure the index on clients.advisor_id exists
CREATE INDEX IF NOT EXISTS idx_clients_advisor_id ON clients(advisor_id);