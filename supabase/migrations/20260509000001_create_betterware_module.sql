-- ============================================================================
-- MÓDULO BETTERWARE — Migración completa
-- Ejecutar en Supabase SQL Editor
-- Fecha: 2026-05-09
-- Descripción: Crea todas las tablas, roles, RLS y storage para el módulo
--              Betterware. 100% separado del módulo de préstamos existente.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────
-- NOTA: Ejecutar PRIMERO el archivo 20260509000000_add_betterware_role.sql
-- que contiene: ALTER TYPE user_role ADD VALUE 'betterware_supervisor'
-- (debe hacer commit antes de poder usar el nuevo valor)
-- ──────────────────────────────────────────────────────────────

-- ──────────────────────────────────────────────────────────────
-- 2. TABLA: betterware_clientes (Clientes Betterware, separados)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS betterware_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dpi VARCHAR(20) NOT NULL,
  nombres VARCHAR(255) NOT NULL,
  apellidos VARCHAR(255) NOT NULL,
  direccion TEXT,
  telefono VARCHAR(20),
  nit VARCHAR(20),
  fecha_nacimiento DATE,
  email VARCHAR(255),
  gerente_zona VARCHAR(255),
  observaciones TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bw_clientes_dpi ON betterware_clientes(dpi);
CREATE INDEX IF NOT EXISTS idx_bw_clientes_nombres ON betterware_clientes(nombres, apellidos);
CREATE INDEX IF NOT EXISTS idx_bw_clientes_created_by ON betterware_clientes(created_by);

-- ──────────────────────────────────────────────────────────────
-- 3. TABLA: betterware_solicitudes (Solicitud de crédito)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS betterware_solicitudes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES betterware_clientes(id) ON DELETE CASCADE,
  numero_solicitud VARCHAR(50) UNIQUE NOT NULL,
  
  -- Datos de la solicitud
  id_referencia VARCHAR(100),
  score_credito INTEGER,
  monto_solicitado DECIMAL(12,2) NOT NULL,
  monto_autorizado DECIMAL(12,2) DEFAULT 0,
  
  -- Estado de la solicitud
  status VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'aprobado', 'rechazado')),
  
  -- Estado operativo del asociado
  estado_asociado VARCHAR(30) NOT NULL DEFAULT 'habilitado'
    CHECK (estado_asociado IN ('habilitado', 'despacho_detenido', 'bloqueado')),
  
  fecha_solicitud DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Auditoría
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bw_solicitudes_cliente ON betterware_solicitudes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_bw_solicitudes_status ON betterware_solicitudes(status);
CREATE INDEX IF NOT EXISTS idx_bw_solicitudes_estado ON betterware_solicitudes(estado_asociado);
CREATE INDEX IF NOT EXISTS idx_bw_solicitudes_fecha ON betterware_solicitudes(fecha_solicitud);
CREATE INDEX IF NOT EXISTS idx_bw_solicitudes_created_by ON betterware_solicitudes(created_by);

-- ──────────────────────────────────────────────────────────────
-- 4. TABLA: betterware_documentos (Documentación obligatoria)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS betterware_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES betterware_solicitudes(id) ON DELETE CASCADE,
  
  -- Tipo de documento
  tipo_documento VARCHAR(30) NOT NULL
    CHECK (tipo_documento IN ('solicitud_credito', 'consulta_buro', 'dpi', 'recibo', 'otro')),
  
  nombre_archivo VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  tamano_bytes BIGINT,
  mime_type VARCHAR(100),
  
  -- Auditoría
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bw_documentos_solicitud ON betterware_documentos(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_bw_documentos_tipo ON betterware_documentos(tipo_documento);

-- ──────────────────────────────────────────────────────────────
-- 5. TABLA: betterware_autorizaciones (Evaluación crediticia)
--    Puede haber múltiples por solicitud (re-evaluaciones)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS betterware_autorizaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES betterware_solicitudes(id) ON DELETE CASCADE,
  
  score INTEGER,
  clasificacion VARCHAR(50),           -- Ej: "A", "B", "C", "AA"
  monto_autorizado DECIMAL(12,2),
  resultado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (resultado IN ('pendiente', 'aprobado', 'rechazado')),
  observaciones TEXT,
  
  -- Quién autorizó
  autorizado_por UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bw_autorizaciones_solicitud ON betterware_autorizaciones(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_bw_autorizaciones_resultado ON betterware_autorizaciones(resultado);

-- ──────────────────────────────────────────────────────────────
-- 6. TABLA: betterware_estados_log (Historial de cambios de estado)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS betterware_estados_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES betterware_solicitudes(id) ON DELETE CASCADE,
  
  estado_anterior VARCHAR(30) NOT NULL,
  estado_nuevo VARCHAR(30) NOT NULL,
  motivo TEXT NOT NULL,
  
  -- Excepciones de supervisor
  requiere_excepcion BOOLEAN DEFAULT false,
  supervisor_id UUID REFERENCES users(id),
  
  -- Auditoría
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bw_estados_log_solicitud ON betterware_estados_log(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_bw_estados_log_fecha ON betterware_estados_log(created_at);

-- ──────────────────────────────────────────────────────────────
-- 7. TABLA: betterware_facturacion (Facturación semanal)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS betterware_facturacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES betterware_solicitudes(id) ON DELETE CASCADE,
  
  numero_semana INTEGER NOT NULL,
  anio INTEGER NOT NULL,
  monto_factura DECIMAL(12,2) NOT NULL DEFAULT 0,
  limite_asignado DECIMAL(12,2) NOT NULL DEFAULT 0,     -- Default = monto_autorizado, editable
  excedente DECIMAL(12,2) NOT NULL DEFAULT 0,
  pago_excedente DECIMAL(12,2) NOT NULL DEFAULT 0,
  
  status VARCHAR(30) NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'pagado', 'excedente_pendiente')),
  
  observaciones TEXT,
  
  -- Auditoría
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Evitar duplicados de semana para la misma solicitud
  UNIQUE (solicitud_id, numero_semana, anio)
);

CREATE INDEX IF NOT EXISTS idx_bw_facturacion_solicitud ON betterware_facturacion(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_bw_facturacion_semana ON betterware_facturacion(anio, numero_semana);
CREATE INDEX IF NOT EXISTS idx_bw_facturacion_status ON betterware_facturacion(status);

-- ──────────────────────────────────────────────────────────────
-- 8. TRIGGER: updated_at automático
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_betterware_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bw_clientes_updated_at ON betterware_clientes;
CREATE TRIGGER trg_bw_clientes_updated_at
  BEFORE UPDATE ON betterware_clientes
  FOR EACH ROW EXECUTE FUNCTION update_betterware_updated_at();

DROP TRIGGER IF EXISTS trg_bw_solicitudes_updated_at ON betterware_solicitudes;
CREATE TRIGGER trg_bw_solicitudes_updated_at
  BEFORE UPDATE ON betterware_solicitudes
  FOR EACH ROW EXECUTE FUNCTION update_betterware_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 9. ROW LEVEL SECURITY (RLS)
-- ──────────────────────────────────────────────────────────────

-- Enable RLS on all Betterware tables
ALTER TABLE betterware_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE betterware_solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE betterware_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE betterware_autorizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE betterware_estados_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE betterware_facturacion ENABLE ROW LEVEL SECURITY;

-- ── betterware_clientes ─────────────────────────────────────
CREATE POLICY "bw_clientes_select" ON betterware_clientes
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor', 'contador', 'betterware_supervisor')
  );

CREATE POLICY "bw_clientes_insert" ON betterware_clientes
  FOR INSERT WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor', 'betterware_supervisor')
  );

CREATE POLICY "bw_clientes_update" ON betterware_clientes
  FOR UPDATE USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor', 'betterware_supervisor')
  );

CREATE POLICY "bw_clientes_delete" ON betterware_clientes
  FOR DELETE USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- ── betterware_solicitudes ──────────────────────────────────
CREATE POLICY "bw_solicitudes_select" ON betterware_solicitudes
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor', 'contador', 'betterware_supervisor')
  );

CREATE POLICY "bw_solicitudes_insert" ON betterware_solicitudes
  FOR INSERT WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor', 'betterware_supervisor')
  );

CREATE POLICY "bw_solicitudes_update" ON betterware_solicitudes
  FOR UPDATE USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor', 'betterware_supervisor')
  );

CREATE POLICY "bw_solicitudes_delete" ON betterware_solicitudes
  FOR DELETE USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- ── betterware_documentos ───────────────────────────────────
CREATE POLICY "bw_documentos_select" ON betterware_documentos
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor', 'contador', 'betterware_supervisor')
  );

CREATE POLICY "bw_documentos_insert" ON betterware_documentos
  FOR INSERT WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor', 'betterware_supervisor')
  );

CREATE POLICY "bw_documentos_update" ON betterware_documentos
  FOR UPDATE USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'betterware_supervisor')
  );

CREATE POLICY "bw_documentos_delete" ON betterware_documentos
  FOR DELETE USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'betterware_supervisor')
  );

-- ── betterware_autorizaciones ───────────────────────────────
CREATE POLICY "bw_autorizaciones_select" ON betterware_autorizaciones
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor', 'contador', 'betterware_supervisor')
  );

CREATE POLICY "bw_autorizaciones_insert" ON betterware_autorizaciones
  FOR INSERT WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'betterware_supervisor')
  );

CREATE POLICY "bw_autorizaciones_update" ON betterware_autorizaciones
  FOR UPDATE USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'betterware_supervisor')
  );

CREATE POLICY "bw_autorizaciones_delete" ON betterware_autorizaciones
  FOR DELETE USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- ── betterware_estados_log ──────────────────────────────────
CREATE POLICY "bw_estados_log_select" ON betterware_estados_log
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor', 'contador', 'betterware_supervisor')
  );

CREATE POLICY "bw_estados_log_insert" ON betterware_estados_log
  FOR INSERT WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'betterware_supervisor')
  );

-- Estados log no se editan ni eliminan (historial inmutable)

-- ── betterware_facturacion ──────────────────────────────────
CREATE POLICY "bw_facturacion_select" ON betterware_facturacion
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor', 'contador', 'betterware_supervisor')
  );

CREATE POLICY "bw_facturacion_insert" ON betterware_facturacion
  FOR INSERT WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor', 'betterware_supervisor')
  );

CREATE POLICY "bw_facturacion_update" ON betterware_facturacion
  FOR UPDATE USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'betterware_supervisor')
  );

CREATE POLICY "bw_facturacion_delete" ON betterware_facturacion
  FOR DELETE USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- ──────────────────────────────────────────────────────────────
-- 10. STORAGE BUCKET para documentos Betterware
-- ──────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'betterware-docs',
  'betterware-docs',
  false,
  10485760,  -- 10 MB máximo por archivo
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "bw_docs_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'betterware-docs' AND
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'asesor', 'contador', 'betterware_supervisor')
  );

CREATE POLICY "bw_docs_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'betterware-docs' AND
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'asesor', 'betterware_supervisor')
  );

CREATE POLICY "bw_docs_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'betterware-docs' AND
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'betterware_supervisor')
  );

CREATE POLICY "bw_docs_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'betterware-docs' AND
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'betterware_supervisor')
  );

-- ──────────────────────────────────────────────────────────────
-- 11. FUNCIÓN: Generar número de solicitud secuencial
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_betterware_solicitud_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(numero_solicitud, '[^0-9]', '', 'g') AS INTEGER)), 0) + 1
    INTO next_num
    FROM betterware_solicitudes;
  RETURN 'BW-' || LPAD(next_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────────────────────────
-- 12. GRANTS (permisos para authenticated)
-- ──────────────────────────────────────────────────────────────
GRANT ALL ON betterware_clientes TO authenticated;
GRANT ALL ON betterware_solicitudes TO authenticated;
GRANT ALL ON betterware_documentos TO authenticated;
GRANT ALL ON betterware_autorizaciones TO authenticated;
GRANT ALL ON betterware_estados_log TO authenticated;
GRANT ALL ON betterware_facturacion TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 13. COMENTARIOS DE DOCUMENTACIÓN
-- ──────────────────────────────────────────────────────────────
COMMENT ON TABLE betterware_clientes IS 'Clientes del módulo Betterware — separados de los clientes de préstamos';
COMMENT ON TABLE betterware_solicitudes IS 'Solicitudes de crédito Betterware';
COMMENT ON TABLE betterware_documentos IS 'Documentos obligatorios por solicitud (solicitud_credito, consulta_buro, dpi, recibo)';
COMMENT ON TABLE betterware_autorizaciones IS 'Evaluaciones crediticias — puede haber múltiples por solicitud';
COMMENT ON TABLE betterware_estados_log IS 'Historial de cambios de estado del asociado (habilitado/detenido/bloqueado)';
COMMENT ON TABLE betterware_facturacion IS 'Facturación semanal del asociado';
COMMENT ON COLUMN betterware_facturacion.limite_asignado IS 'Por defecto = monto_autorizado de la solicitud, pero es editable';
