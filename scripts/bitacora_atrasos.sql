-- =============================================================
-- BITÁCORA DE ATRASOS
-- Ejecutar en Supabase SQL Editor
-- =============================================================

-- 1. Crear tabla
CREATE TABLE IF NOT EXISTS bitacora_atrasos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES payment_schedule(id) ON DELETE SET NULL,
  fecha_atraso DATE NOT NULL,
  dias_atraso INTEGER NOT NULL DEFAULT 0,
  capital_pendiente DECIMAL(12,2) NOT NULL DEFAULT 0,
  interes_perdido DECIMAL(12,2) NOT NULL DEFAULT 0,
  mora_acumulada DECIMAL(12,2) NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_bitacora_atrasos_loan_id ON bitacora_atrasos(loan_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_atrasos_schedule_id ON bitacora_atrasos(schedule_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_atrasos_fecha ON bitacora_atrasos(fecha_atraso);

-- 3. RLS
ALTER TABLE bitacora_atrasos ENABLE ROW LEVEL SECURITY;

-- Admin ve todo
CREATE POLICY "bitacora_atrasos_admin_all"
  ON bitacora_atrasos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Asesor ve préstamos de sus clientes
CREATE POLICY "bitacora_atrasos_asesor_read"
  ON bitacora_atrasos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN clients c ON c.advisor_id = u.id
      JOIN loans l ON l.client_id = c.id
      WHERE u.auth_id = auth.uid()
      AND u.role = 'asesor'
      AND l.id = bitacora_atrasos.loan_id
    )
  );

-- Asesor puede insertar
CREATE POLICY "bitacora_atrasos_asesor_insert"
  ON bitacora_atrasos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      JOIN clients c ON c.advisor_id = u.id
      JOIN loans l ON l.client_id = c.id
      WHERE u.auth_id = auth.uid()
      AND u.role = 'asesor'
      AND l.id = bitacora_atrasos.loan_id
    )
  );

-- Cliente ve sus propios préstamos
CREATE POLICY "bitacora_atrasos_cliente_read"
  ON bitacora_atrasos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM loans l
      WHERE l.id = bitacora_atrasos.loan_id
      AND l.client_id = auth.uid()
    )
    AND
    (SELECT role FROM users WHERE auth_id = auth.uid()) = 'cliente'
  );

-- 4. Función para registrar atraso automáticamente
CREATE OR REPLACE FUNCTION registrar_atraso(
  p_schedule_id UUID,
  p_fecha DATE DEFAULT CURRENT_DATE
)
RETURNS VOID AS $$
DECLARE
  v_loan_id UUID;
  v_due_date DATE;
  v_dias INTEGER;
  v_principal DECIMAL(12,2);
  v_interest DECIMAL(12,2);
  v_mora DECIMAL(12,2);
  v_admin_fees DECIMAL(12,2);
  v_paid_amount DECIMAL(12,2);
  v_status TEXT;
BEGIN
  SELECT loan_id, due_date, principal, interest, mora, admin_fees, paid_amount, status
  INTO v_loan_id, v_due_date, v_principal, v_interest, v_mora, v_admin_fees, v_paid_amount, v_status
  FROM payment_schedule
  WHERE id = p_schedule_id;

  IF v_status = 'paid' THEN
    RETURN;
  END IF;

  v_dias := GREATEST(0, p_fecha - v_due_date);

  IF v_dias <= 0 THEN
    RETURN;
  END IF;

  -- No duplicar si ya existe un registro para esta cuota y fecha
  IF EXISTS (
    SELECT 1 FROM bitacora_atrasos
    WHERE schedule_id = p_schedule_id AND fecha_atraso = p_fecha
  ) THEN
    RETURN;
  END IF;

  INSERT INTO bitacora_atrasos (
    loan_id, schedule_id, fecha_atraso, dias_atraso,
    capital_pendiente, interes_perdido, mora_acumulada, notas
  ) VALUES (
    v_loan_id, p_schedule_id, p_fecha, v_dias,
    GREATEST(0, v_principal - COALESCE(v_paid_amount, 0)),
    v_interest,
    v_mora,
    FORMAT('Atraso de %s días detectado automáticamente', v_dias)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Vista resumen de atrasos por préstamo
CREATE OR REPLACE VIEW vista_resumen_atrasos AS
SELECT
  ba.loan_id,
  l.loan_number,
  c.first_name || ' ' || c.last_name AS cliente_nombre,
  COUNT(*) AS totalregistros,
  MAX(ba.dias_atraso) AS max_dias_atraso,
  SUM(ba.interes_perdido) AS total_interes_perdido,
  SUM(ba.mora_acumulada) AS total_mora,
  MIN(ba.fecha_atraso) AS primer_atraso,
  MAX(ba.fecha_atraso) AS ultimo_atraso
FROM bitacora_atrasos ba
JOIN loans l ON l.id = ba.loan_id
JOIN clients c ON c.id = l.client_id
GROUP BY ba.loan_id, l.loan_number, c.first_name, c.last_name;
