
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

async function sbFetch(path, method="GET", body=null) {
  const opts = { method, headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(SB_URL + path, opts);
    if (!r.ok) {
      if (r.status === 409) return null; // conflict ??? silently ignore
      const txt = await r.text().catch(() => "");
      console.error("sbFetch error:", method, path, r.status, txt.slice(0,100));
      return null;
    }
    if (method === "DELETE" || r.status === 204) return true;
    return r.headers.get("content-type")?.includes("json") ? await r.json() : true;
  } catch(e) {
    console.error("sbFetch error:", e.message);
    return null;
  }
}

async function sbFetchAll(path) {
  let all = [], page = 0, pageSize = 1000;
  while (true) {
    const offset = page * pageSize;
    const url = `${path}&offset=${offset}&limit=${pageSize}`;
    const data = await sbFetch(url, "GET");
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    page++;
  }
  return all;
}

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
