-- Crear la tabla de grupos
CREATE TABLE grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  clientes_ids UUID[]
);

-- Alterar la tabla de clientes para agregar las nuevas columnas
ALTER TABLE clients
ADD COLUMN group_id UUID REFERENCES grupos(id),
ADD COLUMN in_group BOOLEAN DEFAULT FALSE;

-- Crear índices para mejorar el rendimiento de las consultas
CREATE INDEX idx_clients_group_id ON clients(group_id);
CREATE INDEX idx_grupos_clientes_ids ON grupos USING GIN(clientes_ids);

-- Comentarios en las nuevas columnas y tabla para mayor claridad
COMMENT ON TABLE grupos IS 'Almacena la información de los grupos de clientes';
COMMENT ON COLUMN grupos.nombre IS 'Nombre del grupo';
COMMENT ON COLUMN grupos.clientes_ids IS 'Array con los IDs de los clientes que pertenecen al grupo';
COMMENT ON COLUMN clients.group_id IS 'ID del grupo al que pertenece el cliente';
COMMENT ON COLUMN clients.in_group IS 'Indica si el cliente ha sido asignado a un grupo';