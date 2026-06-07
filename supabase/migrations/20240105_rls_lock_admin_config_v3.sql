-- Migration: 20240105_rls_lock_admin_config_v3
-- REVOKE ALL direct table access from anon/authenticated on admin_config
-- RPC get_admin_config_public() as the only allowed read path
-- Apply: supabase db push (or via SQL Editor in Dashboard)

REVOKE ALL ON admin_config FROM anon, authenticated;

CREATE OR REPLACE FUNCTION get_admin_config_public()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS 
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(admin_config.*)), '[]'::jsonb)
  INTO result
  FROM admin_config;
  RETURN result;
END;
;

GRANT EXECUTE ON FUNCTION get_admin_config_public TO anon, authenticated;
