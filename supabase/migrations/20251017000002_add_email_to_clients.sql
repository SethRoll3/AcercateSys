-- Migration: Add email field to clients table
-- Created: 2025-01-17
-- Description: Add email field to clients table for better client management

-- Add email column to clients table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'email' AND table_schema = 'public') THEN
        ALTER TABLE clients ADD COLUMN email VARCHAR(255);
    END IF;
END $$;

-- Create index for better performance on email queries
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);

-- Add comment for documentation
COMMENT ON COLUMN clients.email IS 'Client email address for communication';