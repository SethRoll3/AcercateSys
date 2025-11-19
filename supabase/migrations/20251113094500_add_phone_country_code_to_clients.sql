DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='clients' AND column_name='phone_country_code' AND table_schema='public'
  ) THEN
    ALTER TABLE clients ADD COLUMN phone_country_code TEXT;
  END IF;
END $$;

COMMENT ON COLUMN clients.phone_country_code IS 'Código de país para el teléfono del cliente (ej. +502)';

