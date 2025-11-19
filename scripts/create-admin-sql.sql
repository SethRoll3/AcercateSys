-- Script SQL para crear usuario admin directamente en Supabase
-- Ejecutar este script en el SQL Editor de Supabase

-- 1. Primero, crear el usuario en auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@cooperativa.com',
  crypt('admin123', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Administrator", "role": "admin"}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
) ON CONFLICT (email) DO UPDATE SET
  encrypted_password = crypt('admin123', gen_salt('bf')),
  raw_user_meta_data = '{"full_name": "Administrator", "role": "admin"}',
  updated_at = NOW();

-- 2. Luego, crear/actualizar el usuario en public.users
INSERT INTO public.users (
  id,
  email,
  full_name,
  role,
  created_at,
  updated_at
) 
SELECT 
  id,
  'admin@cooperativa.com',
  'Administrator',
  'admin',
  NOW(),
  NOW()
FROM auth.users 
WHERE email = 'admin@cooperativa.com'
ON CONFLICT (id) DO UPDATE SET
  email = 'admin@cooperativa.com',
  full_name = 'Administrator',
  role = 'admin',
  updated_at = NOW();

-- 3. Verificar que el usuario se creó correctamente
SELECT 'Auth user created:' as status, id, email, raw_user_meta_data 
FROM auth.users 
WHERE email = 'admin@cooperativa.com';

SELECT 'Public user created:' as status, id, email, full_name, role 
FROM public.users 
WHERE email = 'admin@cooperativa.com';