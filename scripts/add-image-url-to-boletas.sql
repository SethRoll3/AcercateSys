-- Agregar campo image_url a la tabla boletas
ALTER TABLE boletas ADD COLUMN image_url TEXT;

-- Hacer que el campo sea requerido (NOT NULL) después de agregar datos existentes
-- Por ahora lo dejamos como opcional para no romper datos existentes
-- ALTER TABLE boletas ALTER COLUMN image_url SET NOT NULL;

-- Comentario: El campo image_url almacenará la URL pública de la imagen de la boleta
-- subida a Supabase Storage