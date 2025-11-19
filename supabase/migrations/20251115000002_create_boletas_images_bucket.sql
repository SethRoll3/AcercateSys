-- Create bucket for boletas images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'boletas-images',
  'boletas-images', 
  true,
  5242880, -- 5MB in bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for the bucket
CREATE POLICY "Allow authenticated users to upload boletas images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'boletas-images' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Allow public read access to boletas images" ON storage.objects
FOR SELECT USING (bucket_id = 'boletas-images');

CREATE POLICY "Allow users to update their own boletas images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'boletas-images' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Allow users to delete their own boletas images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'boletas-images' 
  AND auth.role() = 'authenticated'
);