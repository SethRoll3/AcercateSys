-- Add image_url field to boletas table for receipt photos
ALTER TABLE boletas 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add a comment to clarify the purpose of this field
COMMENT ON COLUMN boletas.image_url IS 'URL de la imagen de la boleta/recibo subida por el cliente';

-- Create index for better query performance when filtering by image presence
CREATE INDEX IF NOT EXISTS idx_boletas_image_url ON boletas(image_url) WHERE image_url IS NOT NULL;