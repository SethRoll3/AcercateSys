-- Clean all existing data to start fresh
-- This will cascade delete all related data due to foreign key constraints

-- Delete all cuota_boletas (boleta assignments)
DELETE FROM cuota_boletas;

-- Delete all payments
DELETE FROM payments;

-- Delete all payment schedules
DELETE FROM payment_schedule;

-- Delete all loans
DELETE FROM loans;

-- Delete all boletas
DELETE FROM boletas;

-- Reset sequences if needed (PostgreSQL will handle UUID generation automatically)
-- Add comment to track the cleanup
COMMENT ON TABLE loans IS 'Cleaned on 2025-01-15 - All existing data removed to implement proper payment states';