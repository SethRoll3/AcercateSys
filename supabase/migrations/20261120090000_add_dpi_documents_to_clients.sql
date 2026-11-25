-- DPI documents and identity data for clients.
-- The images live in a private bucket; only server-side service-role code
-- creates signed URLs after checking the caller's role.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS nationality TEXT,
  ADD COLUMN IF NOT EXISTS dpi_issue_date DATE,
  ADD COLUMN IF NOT EXISTS dpi_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS dpi_front_path TEXT,
  ADD COLUMN IF NOT EXISTS dpi_back_path TEXT,
  ADD COLUMN IF NOT EXISTS dpi_extracted_data JSONB,
  ADD COLUMN IF NOT EXISTS dpi_provider TEXT,
  ADD COLUMN IF NOT EXISTS dpi_scanned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clients_dpi ON public.clients (dpi);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dpi-images',
  'dpi-images',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No public read policy is created on purpose. The application uploads and
-- signs URLs with the service-role client, and enforces admin/advisor access
-- in /api/clients/[id]/dpi and /api/clients/dpi/scan.
