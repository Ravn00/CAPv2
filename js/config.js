
// ---
// CONFIG ??? leída desde Supabase admin_config
// ---
const SB_URL = "https://xkguzluwbbxsbustlcxo.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrZ3V6bHV3YmJ4c2J1c3RsY3hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzQwOTUsImV4cCI6MjA5NTc1MDA5NX0.N6oatsQFuRPdlpKcwWnqNSvagtg1dGqjSNg2dzU9Tl0";

// Company ID (multi-tenant)
let companyId;
try { companyId = localStorage.getItem("ap_company_id"); } catch(_) {}

// Device ID ??? persistente para tracking
let deviceId;
  try { deviceId = localStorage.getItem("ap_device_id"); } catch(_) {}
  if (!deviceId) {
    deviceId = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,8);
    try { localStorage.setItem("ap_device_id", deviceId); } catch(_) {}
  }

// Config cache
let configCache = null;

// Read config from Supabase
async function readConfig() {
  try {
    let rows = await sbFetch("/rest/v1/admin_config?select=*&limit=1");
    if (!rows || !rows.length) {
      const created = await sbFetch("/rest/v1/admin_config", "POST", { id: "global", api_keys: [] });
      if (created) rows = await sbFetch("/rest/v1/admin_config?select=*&limit=1");
    }
    if (!rows || !rows.length) return null;
    const cfg = rows[0];
    // api_keys may be stored as JSON string
    if (typeof cfg.api_keys === "string") {
      try { cfg.api_keys = JSON.parse(cfg.api_keys); } catch(_) { cfg.api_keys = []; }
    }
    if (!Array.isArray(cfg.api_keys)) cfg.api_keys = [];
    configCache = cfg;
    return configCache;
  } catch(e) { return null; }
}
