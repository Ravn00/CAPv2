// Supabase Edge Function: api-proxy
// Proxy for write operations — validates token, uses service_role internally
// Deploy: supabase functions deploy api-proxy --no-verify-jwt
// Set secret: supabase secrets set API_WRITE_TOKEN="token-seguro-123"

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-write-token",
  "Access-Control-Max-Age": "86400",
};

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WRITE_TOKEN = Deno.env.get("API_WRITE_TOKEN") || "dev-token";

const SB_URL = Deno.env.get("SUPABASE_URL") || "";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const headers = req.headers;
  const auth = headers.get("x-write-token") || "";

  if (auth !== WRITE_TOKEN) {
    return jsonResp({ error: "Unauthorized — invalid write token" }, 401);
  }

  try {
    const { table, method, body, query } = await req.json();
    if (!table || !method) {
      return jsonResp({ error: "table and method required" }, 400);
    }

    const allowedTables = ["partes", "ventas", "admin_config", "devices", "scan_log", "partes_log"];
    if (!allowedTables.includes(table)) {
      return jsonResp({ error: `table "${table}" not allowed` }, 403);
    }

    const allowedMethods = ["POST", "PATCH", "DELETE"];
    if (!allowedMethods.includes(method)) {
      return jsonResp({ error: `method "${method}" not allowed` }, 400);
    }

    const url = `${SB_URL}/rest/v1/${table}${query || ""}`;
    const opts = {
      method,
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
    };
    if (body && method !== "DELETE") opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return jsonResp({ error: `DB error ${res.status}`, detail: txt.slice(0,200) }, 502);
    }

    return jsonResp({ ok: true });
  } catch (e) {
    return jsonResp({ error: e.message || "internal error" }, 500);
  }
});
