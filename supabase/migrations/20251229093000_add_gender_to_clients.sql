DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='clients' AND column_name='gender' AND table_schema='public'
  ) THEN
    ALTER TABLE clients ADD COLUMN gender TEXT CHECK (gender IN ('hombre','mujer'));
  END IF;
END $$;
