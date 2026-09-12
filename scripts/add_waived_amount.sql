-- ============================================================
-- Agregar columnas de abono a payment_schedule
-- - waived_*: montos condonados cuando abono solo-capital marca cuota pagada
-- - extra_capital: sobrante de abono anterior aplicado como capital
-- ============================================================

-- 1. Columnas de monto condonado
ALTER TABLE payment_schedule
ADD COLUMN IF NOT EXISTS waived_interest DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE payment_schedule
ADD COLUMN IF NOT EXISTS waived_mora DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE payment_schedule
ADD COLUMN IF NOT EXISTS waived_admin_fees DECIMAL(12,2) NOT NULL DEFAULT 0;

-- 2. Columna de capital extra (sobrante de abono anterior)
ALTER TABLE payment_schedule
ADD COLUMN IF NOT EXISTS extra_capital DECIMAL(12,2) NOT NULL DEFAULT 0;

-- 3. Comentarios
COMMENT ON COLUMN payment_schedule.waived_interest IS 'Interés condonado cuando un abono solo-capital marca la cuota como pagada.';
COMMENT ON COLUMN payment_schedule.waived_mora IS 'Mora condonada cuando un abono solo-capital marca la cuota como pagada.';
COMMENT ON COLUMN payment_schedule.waived_admin_fees IS 'Gastos admin condonados cuando un abono solo-capital marca la cuota como pagada.';
COMMENT ON COLUMN payment_schedule.extra_capital IS 'Sobrante de abono anterior aplicado como capital extra a esta cuota.';
