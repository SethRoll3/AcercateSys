-- Ajuste de políticas RLS para permitir asignación de boletas en cuota_boletas
-- Clientes: pueden insertar enlaces a sus propias cuotas
-- Asesores: pueden insertar enlaces a cuotas de sus clientes asignados

-- Asegurar que RLS está habilitado (idempotente)
ALTER TABLE cuota_boletas ENABLE ROW LEVEL SECURITY;

-- Política existente: Admins pueden gestionar todo (se recrea para asegurar configuración)
DROP POLICY IF EXISTS "Admins can manage cuota_boletas" ON cuota_boletas;
CREATE POLICY "Admins can manage cuota_boletas"
  ON cuota_boletas
  FOR ALL
  USING ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin');

-- Política de lectura amplia (se mantiene si ya existe)
DROP POLICY IF EXISTS "Users can view all cuota_boletas" ON cuota_boletas;
CREATE POLICY "Users can view all cuota_boletas"
  ON cuota_boletas
  FOR SELECT
  USING (true);

-- Clientes pueden insertar enlaces de boletas a sus propias cuotas
DROP POLICY IF EXISTS "Clients can insert cuota_boletas for own schedules" ON cuota_boletas;
CREATE POLICY "Clients can insert cuota_boletas for own schedules"
  ON cuota_boletas
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM users WHERE auth_id = auth.uid()) = 'cliente'
    AND EXISTS (
      SELECT 1
      FROM payment_schedule ps
      JOIN loans l ON l.id = ps.loan_id
      JOIN clients c ON c.id = l.client_id
      WHERE ps.id = cuota_boletas.payment_schedule_id
        AND c.email = (SELECT email FROM users WHERE auth_id = auth.uid())
    )
  );

-- Asesores pueden insertar enlaces para cuotas de sus clientes
DROP POLICY IF EXISTS "Advisors can insert cuota_boletas for assigned clients" ON cuota_boletas;
CREATE POLICY "Advisors can insert cuota_boletas for assigned clients"
  ON cuota_boletas
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM users WHERE auth_id = auth.uid()) = 'asesor'
    AND EXISTS (
      SELECT 1
      FROM payment_schedule ps
      JOIN loans l ON l.id = ps.loan_id
      JOIN clients c ON c.id = l.client_id
      WHERE ps.id = cuota_boletas.payment_schedule_id
        AND c.advisor_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- Nota: si existe una política previa que restringe INSERT solo a admin,
-- puede ser necesario DROP de esa política para no bloquear a clientes/asesores.
-- Por ejemplo:
-- DROP POLICY IF EXISTS "Only admins insert cuota_boletas" ON cuota_boletas;