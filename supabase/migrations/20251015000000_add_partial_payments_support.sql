-- Add paid_amount column to payment_schedule table
ALTER TABLE payment_schedule 
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2) DEFAULT 0.00;

-- Drop the existing check constraint and recreate it with partially_paid
ALTER TABLE payment_schedule 
DROP CONSTRAINT IF EXISTS payment_schedule_status_check;

ALTER TABLE payment_schedule 
ADD CONSTRAINT payment_schedule_status_check 
CHECK (status IN ('pending', 'paid', 'overdue', 'partially_paid'));

-- Add comment to explain the new column
COMMENT ON COLUMN payment_schedule.paid_amount IS 'Amount actually paid for this installment (may be less than scheduled amount for partial payments)';

-- Update existing paid records to have paid_amount equal to amount
UPDATE payment_schedule 
SET paid_amount = amount 
WHERE status = 'paid' AND paid_amount = 0.00;

-- Create index for better performance on paid_amount queries
CREATE INDEX IF NOT EXISTS idx_payment_schedule_paid_amount ON payment_schedule(paid_amount);
CREATE INDEX IF NOT EXISTS idx_payment_schedule_status_paid_amount ON payment_schedule(status, paid_amount);