-- ========================================
-- SQL para Supabase SQL Editor
-- Tablas con data JSONB (compatible con la app)
-- ========================================

-- 1. PARTES (catálogo)
CREATE TABLE IF NOT EXISTS partes (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. CLIENTES
CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. VENTAS
CREATE TABLE IF NOT EXISTS ventas (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABLAS AUXILIARES (si no existen)
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_agent TEXT,
  last_seen TIMESTAMPTZ,
  total_scans INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scan_log (
  id TEXT PRIMARY KEY,
  device_id TEXT,
  part_id TEXT,
  categoria TEXT,
  timestamp TIMESTAMPTZ,
  resultado TEXT,
  latencia_ms INT
);

CREATE TABLE IF NOT EXISTS partes_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  part_id TEXT,
  action TEXT,
  changes JSONB,
  device_id TEXT,
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_config (
  id TEXT PRIMARY KEY DEFAULT 'global',
  api_keys JSONB DEFAULT '[]',
  ai_provider TEXT DEFAULT 'groq',
  ai_model TEXT DEFAULT 'meta-llama/llama-4-scout-17b-16e-instruct',
  license_secret TEXT,
  maintenance_mode BOOLEAN DEFAULT false,
  maintenance_message TEXT,
  admin_message TEXT,
  admin_message_type TEXT DEFAULT 'info',
  created_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO admin_config (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;

-- ========================================
-- ROW LEVEL SECURITY
-- ========================================

-- CLIENTES
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clientes_select ON clientes;
CREATE POLICY clientes_select ON clientes FOR SELECT USING (true);
DROP POLICY IF EXISTS clientes_insert ON clientes;
CREATE POLICY clientes_insert ON clientes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS clientes_update ON clientes;
CREATE POLICY clientes_update ON clientes FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS clientes_delete ON clientes;
CREATE POLICY clientes_delete ON clientes FOR DELETE USING (auth.role() = 'authenticated');

-- VENTAS
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ventas_select ON ventas;
CREATE POLICY ventas_select ON ventas FOR SELECT USING (true);
DROP POLICY IF EXISTS ventas_insert ON ventas;
CREATE POLICY ventas_insert ON ventas FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS ventas_update ON ventas;
CREATE POLICY ventas_update ON ventas FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS ventas_delete ON ventas;
CREATE POLICY ventas_delete ON ventas FOR DELETE USING (auth.role() = 'authenticated');

-- PARTES (si no tiene RLS)
ALTER TABLE partes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partes_select ON partes;
CREATE POLICY partes_select ON partes FOR SELECT USING (true);
DROP POLICY IF EXISTS partes_insert ON partes;
CREATE POLICY partes_insert ON partes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS partes_update ON partes;
CREATE POLICY partes_update ON partes FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS partes_delete ON partes;
CREATE POLICY partes_delete ON partes FOR DELETE USING (auth.role() = 'authenticated');

-- DEVICES
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS devices_select ON devices;
CREATE POLICY devices_select ON devices FOR SELECT USING (true);
DROP POLICY IF EXISTS devices_insert ON devices;
CREATE POLICY devices_insert ON devices FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS devices_update ON devices;
CREATE POLICY devices_update ON devices FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS devices_delete ON devices;
CREATE POLICY devices_delete ON devices FOR DELETE USING (true);

-- SCAN_LOG
ALTER TABLE scan_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scan_log_select ON scan_log;
CREATE POLICY scan_log_select ON scan_log FOR SELECT USING (true);
DROP POLICY IF EXISTS scan_log_insert ON scan_log;
CREATE POLICY scan_log_insert ON scan_log FOR INSERT WITH CHECK (true);

-- PARTES_LOG
ALTER TABLE partes_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partes_log_select ON partes_log;
CREATE POLICY partes_log_select ON partes_log FOR SELECT USING (true);
DROP POLICY IF EXISTS partes_log_insert ON partes_log;
CREATE POLICY partes_log_insert ON partes_log FOR INSERT WITH CHECK (true);

-- ADMIN_CONFIG
ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_config_select ON admin_config;
CREATE POLICY admin_config_select ON admin_config FOR SELECT USING (true);
DROP POLICY IF EXISTS admin_config_insert ON admin_config;
CREATE POLICY admin_config_insert ON admin_config FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS admin_config_update ON admin_config;
CREATE POLICY admin_config_update ON admin_config FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ========================================
-- ÍNDICES (rendimiento)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_partes_data_categoria ON partes ((data->>'categoria'));
CREATE INDEX IF NOT EXISTS idx_partes_data_marca ON partes ((data->>'marca'));
CREATE INDEX IF NOT EXISTS idx_partes_data_estado ON partes ((data->>'estado'));
CREATE INDEX IF NOT EXISTS idx_clientes_data_nombre ON clientes ((data->>'nombre'));
CREATE INDEX IF NOT EXISTS idx_ventas_data_fecha ON ventas ((data->>'fecha'));
CREATE INDEX IF NOT EXISTS idx_partes_data_company_id ON partes ((data->>'company_id'));
CREATE INDEX IF NOT EXISTS idx_partes_data_codigo_oem ON partes ((data->>'codigoOem'));
CREATE INDEX IF NOT EXISTS idx_partes_data_ubicacion ON partes ((data->>'ubicacion'));
CREATE INDEX IF NOT EXISTS idx_partes_data_posicion ON partes ((data->>'posicion'));
CREATE INDEX IF NOT EXISTS idx_clientes_data_company_id ON clientes ((data->>'company_id'));
CREATE INDEX IF NOT EXISTS idx_ventas_data_company_id ON ventas ((data->>'company_id'));
