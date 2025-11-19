ALTER TABLE payment_schedule 
DROP CONSTRAINT IF EXISTS payment_schedule_status_check;

-- Create the enum type if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_schedule_status') THEN
    CREATE TYPE payment_schedule_status AS ENUM ('pending', 'paid', 'overdue', 'pending_confirmation', 'rejected');
  END IF;
END$$;

-- Add new values to the enum type
ALTER TYPE payment_schedule_status ADD VALUE IF NOT EXISTS 'pending_confirmation';
ALTER TYPE payment_schedule_status ADD VALUE IF NOT EXISTS 'rejected';

-- Update existing rows with 'partially_paid' to 'pending_confirmation'
UPDATE payment_schedule
SET status = 'pending_confirmation'::payment_schedule_status
WHERE status = 'partially_paid'::payment_schedule_status;

-- Remove 'partially_paid' from the enum
-- This is a complex operation in PostgreSQL, so for now we will just stop using it.

-- Add the check constraint back
ALTER TABLE payment_schedule 
ADD CONSTRAINT payment_schedule_status_check 
CHECK (status IN ('pending', 'paid', 'overdue', 'pending_confirmation', 'rejected'));