ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS acta_url TEXT,
  ADD COLUMN IF NOT EXISTS acta_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acta_uploaded_by UUID REFERENCES users(id);

COMMENT ON COLUMN loans.acta_url IS 'URL pública del archivo del acta de comité firmada, almacenado en Supabase Storage';
COMMENT ON COLUMN loans.acta_uploaded_at IS 'Fecha y hora en que se subió el acta firmada';
COMMENT ON COLUMN loans.acta_uploaded_by IS 'Usuario (admin o asesor) que subió el acta firmada';
