-- ========================================
-- 1. Tabla de auditoría (partes_log)
-- ========================================
CREATE TABLE IF NOT EXISTS partes_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  part_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  changes jsonb DEFAULT '{}',
  device_id text DEFAULT '',
  timestamp timestamptz DEFAULT now()
);

-- Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_partes_log_part_id ON partes_log (part_id);
CREATE INDEX IF NOT EXISTS idx_partes_log_timestamp ON partes_log (timestamp DESC);

-- ========================================
-- 2. RLS: partes_log
-- ========================================
ALTER TABLE partes_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read for anon" ON partes_log;
CREATE POLICY "Enable read for anon" ON partes_log
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable insert for anon" ON partes_log;
CREATE POLICY "Enable insert for anon" ON partes_log
  FOR INSERT WITH CHECK (true);

-- ========================================
-- 3. RLS: admin_config (UPDATE faltaba)
-- ========================================
DROP POLICY IF EXISTS "Enable update for anon" ON admin_config;
CREATE POLICY "Enable update for anon" ON admin_config
  FOR UPDATE USING (true) WITH CHECK (true);

-- ========================================
-- 4. RLS: partes
-- ========================================
ALTER TABLE partes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read for anon" ON partes;
CREATE POLICY "Enable read for anon" ON partes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable insert for anon" ON partes;
CREATE POLICY "Enable insert for anon" ON partes
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Enable update for anon" ON partes;
CREATE POLICY "Enable update for anon" ON partes
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable delete for anon" ON partes;
CREATE POLICY "Enable delete for anon" ON partes
  FOR DELETE USING (true);

-- ========================================
-- 5. RLS: devices
-- ========================================
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read for anon" ON devices;
CREATE POLICY "Enable read for anon" ON devices
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable insert for anon" ON devices;
CREATE POLICY "Enable insert for anon" ON devices
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Enable update for anon" ON devices;
CREATE POLICY "Enable update for anon" ON devices
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable delete for anon" ON devices;
CREATE POLICY "Enable delete for anon" ON devices
  FOR DELETE USING (true);

-- ========================================
-- 6. RLS: scan_log
-- ========================================
ALTER TABLE scan_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read for anon" ON scan_log;
CREATE POLICY "Enable read for anon" ON scan_log
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable insert for anon" ON scan_log;
CREATE POLICY "Enable insert for anon" ON scan_log
  FOR INSERT WITH CHECK (true);
