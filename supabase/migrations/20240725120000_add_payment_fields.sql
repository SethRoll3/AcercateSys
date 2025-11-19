-- Crear un nuevo tipo de dato para los estados de confirmación
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_confirmation_status') THEN
        CREATE TYPE payment_confirmation_status AS ENUM ('pendiente', 'aprobado', 'rechazado');
    END IF;
END$$;

-- Agregar la columna confirmation_status a la tabla de pagos si no existe
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS confirmation_status payment_confirmation_status DEFAULT 'pendiente';

-- Agregar un comentario para describir la columna
COMMENT ON COLUMN payments.confirmation_status IS 'Estado de confirmación del pago subido por el cliente (pendiente, aprobado, rechazado)';

-- Agregar las columnas que faltan a la tabla de pagos
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS receipt_image_url TEXT,
ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Agregar comentarios para describir las nuevas columnas
COMMENT ON COLUMN payments.receipt_image_url IS 'URL de la imagen del recibo de pago subido por el cliente';
COMMENT ON COLUMN payments.confirmed_by IS 'ID del usuario (asesor/admin) que confirma o rechaza el pago';
COMMENT ON COLUMN payments.confirmed_at IS 'Fecha y hora de la confirmación o rechazo del pago';
COMMENT ON COLUMN payments.rejection_reason IS 'Motivo del rechazo del pago';