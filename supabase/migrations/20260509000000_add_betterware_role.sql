-- ============================================================================
-- PASO 1 DE 2: Agregar rol betterware_supervisor
-- EJECUTAR PRIMERO, ANTES del archivo 20260509000001
-- ============================================================================
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'betterware_supervisor';
