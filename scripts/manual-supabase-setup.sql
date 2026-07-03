-- =============================================================
-- Script para correr manualmente en el SQL Editor de Supabase
-- Cooperativa (proyecto: lihgzgxeyxokedjqmmxp)
-- =============================================================
-- Este script:
--   1. Agrega las columnas del acta a la tabla `loans`
--   2. Crea el bucket de Storage `receipts` si no existe
--   3. Configura las políticas RLS de Storage para ese bucket
--
-- IMPORTANTE: corré cada bloque por separado si alguna parte ya existe.
-- =============================================================


-- ============================================================
-- PARTE 1: Columnas del acta en la tabla `loans`
-- (equivalente a la migración 20260102000000_add_acta_fields_to_loans.sql)
-- ============================================================

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS acta_url TEXT,
  ADD COLUMN IF NOT EXISTS acta_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acta_uploaded_by UUID REFERENCES users(id);

COMMENT ON COLUMN loans.acta_url IS 'URL pública del archivo del acta de comité firmada, almacenado en Supabase Storage';
COMMENT ON COLUMN loans.acta_uploaded_at IS 'Fecha y hora en que se subió el acta firmada';
COMMENT ON COLUMN loans.acta_uploaded_by IS 'Usuario (admin o asesor) que subió el acta firmada';


-- ============================================================
-- PARTE 2: Crear el bucket de Storage `receipts`
-- (si ya existe, este INSERT no hace nada gracias a ON CONFLICT)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  true,
  5242880,  -- 5 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- PARTE 3: Políticas RLS de Storage para el bucket `receipts`
-- (DROP IF EXISTS para que sea idempotente — se puede correr varias veces)
-- ============================================================

-- Lectura pública (para que las URLs públicas de boletas/actas funcionen)
DROP POLICY IF EXISTS "Public read for receipts bucket" ON storage.objects;
CREATE POLICY "Public read for receipts bucket"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'receipts');

-- Subida para usuarios autenticados
DROP POLICY IF EXISTS "Authenticated upload to receipts bucket" ON storage.objects;
CREATE POLICY "Authenticated upload to receipts bucket"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'receipts');

-- Actualización para usuarios autenticados
DROP POLICY IF EXISTS "Authenticated update on receipts bucket" ON storage.objects;
CREATE POLICY "Authenticated update on receipts bucket"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'receipts')
  WITH CHECK (bucket_id = 'receipts');

-- Eliminación para usuarios autenticados
DROP POLICY IF EXISTS "Authenticated delete on receipts bucket" ON storage.objects;
CREATE POLICY "Authenticated delete on receipts bucket"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'receipts');


-- ============================================================
-- VERIFICACIÓN (opcional, correr al final para confirmar)
-- ============================================================

-- Verificar columnas del acta:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'loans' AND column_name LIKE 'acta%';

-- Verificar bucket:
-- SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'receipts';

-- Verificar políticas:
-- SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
