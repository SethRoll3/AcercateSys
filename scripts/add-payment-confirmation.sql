-- Add confirmation status and receipt image fields to payments table
-- This script adds the new fields needed for payment confirmation workflow

-- Add confirmation_status field (pendiente, confirmado)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS confirmation_status VARCHAR(20) DEFAULT 'pendiente' CHECK (confirmation_status IN ('pendiente', 'confirmado'));

-- Add receipt_image_url field for storing the uploaded receipt image
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS receipt_image_url TEXT;

-- Add confirmed_by field to track which advisor confirmed the payment
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id);

-- Add confirmed_at timestamp
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;

-- Update existing payments to have 'confirmado' status (since they were already processed)
UPDATE payments 
SET confirmation_status = 'confirmado', 
    confirmed_at = created_at 
WHERE confirmation_status = 'pendiente';

-- Create index for better performance on confirmation status queries
CREATE INDEX IF NOT EXISTS idx_payments_confirmation_status ON payments(confirmation_status);

-- Create index for advisor confirmation queries
CREATE INDEX IF NOT EXISTS idx_payments_confirmed_by ON payments(confirmed_by);

COMMENT ON COLUMN payments.confirmation_status IS 'Estado de confirmación del pago: pendiente (esperando confirmación del asesor) o confirmado (aprobado por el asesor)';
COMMENT ON COLUMN payments.receipt_image_url IS 'URL de la imagen de la boleta de pago subida por el cliente';
COMMENT ON COLUMN payments.confirmed_by IS 'ID del usuario (asesor) que confirmó el pago';
COMMENT ON COLUMN payments.confirmed_at IS 'Fecha y hora cuando se confirmó el pago';