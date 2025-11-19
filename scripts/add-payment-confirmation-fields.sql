-- Script para agregar campos de confirmación a la tabla de pagos
-- Ejecutar en Supabase SQL Editor

-- Agregar nuevas columnas a la tabla payments
ALTER TABLE payments 
ADD COLUMN confirmation_status VARCHAR(20) DEFAULT 'confirmado' CHECK (confirmation_status IN ('pendiente', 'confirmado', 'rechazado')),
ADD COLUMN receipt_image_url TEXT,
ADD COLUMN confirmed_by UUID REFERENCES users(id),
ADD COLUMN confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN rejection_reason TEXT;

-- Actualizar todos los pagos existentes a estado 'confirmado'
UPDATE payments 
SET confirmation_status = 'confirmado', 
    confirmed_at = created_at
WHERE confirmation_status IS NULL;

-- Crear índices para mejorar el rendimiento
CREATE INDEX idx_payments_confirmation_status ON payments(confirmation_status);
CREATE INDEX idx_payments_confirmed_by ON payments(confirmed_by);
CREATE INDEX idx_payments_confirmed_at ON payments(confirmed_at);

-- Comentarios sobre los nuevos campos
COMMENT ON COLUMN payments.confirmation_status IS 'Estado de confirmación del pago: pendiente, confirmado, rechazado';
COMMENT ON COLUMN payments.receipt_image_url IS 'URL de la imagen de la boleta/recibo subida por el cliente';
COMMENT ON COLUMN payments.confirmed_by IS 'ID del usuario (asesor/admin) que confirmó el pago';
COMMENT ON COLUMN payments.confirmed_at IS 'Fecha y hora cuando se confirmó el pago';
COMMENT ON COLUMN payments.rejection_reason IS 'Razón del rechazo si el pago fue rechazado';