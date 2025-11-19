-- Add mora field to payment_schedule table
ALTER TABLE payment_schedule 
ADD COLUMN IF NOT EXISTS mora DECIMAL(12, 2) DEFAULT 0.00 NOT NULL;

-- Add admin_fees field for gastos administrativos
ALTER TABLE payment_schedule 
ADD COLUMN IF NOT EXISTS admin_fees DECIMAL(12, 2) DEFAULT 0.00 NOT NULL;

-- Add a comment to clarify the purpose of these fields
COMMENT ON COLUMN payment_schedule.mora IS 'Mora aplicada cuando el pago se realiza después de la fecha de vencimiento';
COMMENT ON COLUMN payment_schedule.admin_fees IS 'Gastos administrativos asociados al pago';