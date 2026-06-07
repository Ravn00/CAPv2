// Supabase Edge Function: api-proxy
// Proxy for DB operations — validates token, uses service_role internally
// GET  — read (requires read token)
// POST/PATCH/DELETE — write (requires write token)
// Deploy: supabase functions deploy api-proxy --no-verify-jwt
// Set secrets:
//   supabase secrets set API_READ_TOKEN="token-lectura-123"
//   supabase secrets set API_WRITE_TOKEN="token-escritura-456"

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-read-token, x-write-token",
  "Access-Control-Max-Age": "86400",
};

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const READ_TOKEN = Deno.env.get("API_READ_TOKEN") || "dev-read-token";
const WRITE_TOKEN = Deno.env.get("API_WRITE_TOKEN") || "dev-write-token";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const params = Object.fromEntries(url.searchParams);

    // GET request — read via query params
    if (req.method === "GET") {
      const auth = req.headers.get("x-read-token") || "";
      if (auth !== READ_TOKEN) {
        return jsonResp({ error: "Unauthorized — invalid read token" }, 401);
      }
      if (!params.table) {
        return jsonResp({ error: "?table= required in query" }, 400);
      }
      const allowed = ["partes", "ventas", "admin_config", "devices", "scan_log", "partes_log"];
      if (!allowed.includes(params.table)) {
        return jsonResp({ error: `table "${params.table}" not allowed` }, 403);
      }
      const select = params.select || "*";
      const restQuery = params.q || "";
      const restUrl = `${SB_URL}/rest/v1/${params.table}?select=${select}${restQuery}`;
      const res = await fetch(restUrl, {
        headers: {
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Accept": "application/json",
        },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return jsonResp({ error: `DB error ${res.status}`, detail: txt.slice(0, 200) }, 502);
      }
      const data = await res.json();
      return jsonResp(data);
    }

    // POST/PATCH/DELETE — write operations (JSON body)
    const auth = req.headers.get("x-write-token") || "";
    if (auth !== WRITE_TOKEN) {
      return jsonResp({ error: "Unauthorized — invalid write token" }, 401);
    }

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

    const restUrl = `${SB_URL}/rest/v1/${table}${query || ""}`;
    const opts: Record<string, unknown> = {
      method,
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
    };
    if (body && method !== "DELETE") opts.body = JSON.stringify(body);

    const res = await fetch(restUrl, opts as RequestInit);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return jsonResp({ error: `DB error ${res.status}`, detail: txt.slice(0, 200) }, 502);
    }
    return jsonResp({ ok: true });
  } catch (e) {
    return jsonResp({ error: e.message || "internal error" }, 500);
  }
});
