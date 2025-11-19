-- Script simple para arreglar SOLO el constraint users_role_check
-- Sin modificar políticas RLS ni vistas

-- Eliminar el constraint incorrecto que solo permite 'admin' y 'user'
-- pero el ENUM user_role tiene 'admin', 'cliente', 'asesor'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Listo. El campo role ya es de tipo user_role ENUM, 
-- así que no necesita constraint adicional.