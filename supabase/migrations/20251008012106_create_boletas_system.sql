-- Crear tabla de boletas (recibos de pago)
CREATE TABLE IF NOT EXISTS boletas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_boleta VARCHAR(50) UNIQUE NOT NULL,
  forma_pago VARCHAR(50) NOT NULL, -- efectivo, transferencia, cheque, etc.
  fecha DATE NOT NULL,
  referencia VARCHAR(100),
  banco VARCHAR(100),
  monto DECIMAL(10, 2) NOT NULL CHECK (monto > 0),
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Crear tabla de relación entre cuotas y boletas (muchos a muchos)
CREATE TABLE IF NOT EXISTS cuota_boletas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_schedule_id UUID REFERENCES payment_schedule(id) ON DELETE CASCADE,
  boleta_id UUID REFERENCES boletas(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(payment_schedule_id, boleta_id)
);

-- Agregar campo de mora a payment_schedule
ALTER TABLE payment_schedule 
ADD COLUMN IF NOT EXISTS mora DECIMAL(10, 2) DEFAULT 0 CHECK (mora >= 0);

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_boletas_numero ON boletas(numero_boleta);
CREATE INDEX IF NOT EXISTS idx_cuota_boletas_schedule ON cuota_boletas(payment_schedule_id);
CREATE INDEX IF NOT EXISTS idx_cuota_boletas_boleta ON cuota_boletas(boleta_id);

-- Habilitar RLS
ALTER TABLE boletas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuota_boletas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para boletas
CREATE POLICY "Users can view all boletas" ON boletas
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert boletas" ON boletas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update boletas" ON boletas
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete boletas" ON boletas
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );