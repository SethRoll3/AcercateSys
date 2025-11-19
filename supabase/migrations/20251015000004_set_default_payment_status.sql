-- Set default status for payment_schedule to 'pending'
-- This ensures all new payment schedules start as pending

ALTER TABLE payment_schedule 
ALTER COLUMN status SET DEFAULT 'pending';

-- Add comment to clarify the payment status workflow
COMMENT ON COLUMN payment_schedule.status IS 'Payment status: pending (not paid), partially_paid (partial payment made), paid (fully paid), overdue (past due date)';