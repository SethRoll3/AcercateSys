-- Script para crear un usuario asesor de prueba
INSERT INTO users (email, password_hash, full_name, role) 
VALUES (
  'asesor@test.com',
  '$2a$10$dummy.hash.for.testing.purposes.only',
  'Asesor de Prueba',
  'asesor'
);