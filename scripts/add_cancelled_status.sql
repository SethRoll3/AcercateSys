-- ============================================================
-- Agregar status 'cancelled' a la tabla loans
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Eliminar constraint anterior
ALTER TABLE loans
DROP CONSTRAINT IF EXISTS loans_status_check;

-- 2. Agregar nuevo constraint con 'cancelled'
ALTER TABLE loans
ADD CONSTRAINT loans_status_check
CHECK (status IN ('active', 'paid', 'defaulted', 'pending', 'cancelled'));
