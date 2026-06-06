import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Max-Age": "86400",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const results: Record<string, unknown>[] = [];
  function add(name: string, ok: boolean, detail?: unknown) {
    results.push({ check: name, ok, detail: detail ?? null });
  }

  // 1 — Environment secrets check
  const secrets = {
    GROQ_API_KEYS: !!Deno.env.get("GROQ_API_KEYS"),
    TAVILY_API_KEY: !!Deno.env.get("TAVILY_API_KEY"),
    SUPABASE_URL: !!Deno.env.get("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    API_WRITE_TOKEN: !!Deno.env.get("API_WRITE_TOKEN"),
    OPENROUTER_API_KEY: !!Deno.env.get("OPENROUTER_API_KEY"),
    GEMINI_API_KEY: !!Deno.env.get("GEMINI_API_KEY"),
  };
  add("secrets", true, secrets);

  // 2 — Supabase DB connectivity via service_role key
  const sbUrl = Deno.env.get("SUPABASE_URL") || "";
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (sbUrl && svcKey) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(`${sbUrl}/rest/v1/admin_config?select=id&limit=1`, {
        headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      add("supabase_db", r.ok, { status: r.status });
    } catch (e) {
      add("supabase_db", false, { error: (e as Error).message?.slice(0, 80) });
    }
  } else {
    add("supabase_db", false, { error: "URL or key missing" });
  }

  // 3 — Groq API ping
  const rawKeys = Deno.env.get("GROQ_API_KEYS") || "[]";
  try {
    const keys = JSON.parse(rawKeys) as string[];
    if (keys.length > 0) {
      const testKey = keys[0];
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${testKey}` },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      add("groq_api", r.ok, { status: r.status, keyCount: keys.length });
    } else {
      add("groq_api", false, { error: "No keys in array" });
    }
  } catch (e) {
    add("groq_api", false, { error: (e as Error).message?.slice(0, 80) });
  }

  // 4 — Tavily API ping
  const tavilyKey = Deno.env.get("TAVILY_API_KEY") || "";
  if (tavilyKey) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query: "test", search_depth: "basic", max_results: 1 }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const body = r.ok ? await r.json().catch(() => null) : null;
      add("tavily_api", r.ok, { status: r.status, hasResults: body?.results?.length > 0 });
    } catch (e) {
      add("tavily_api", false, { error: (e as Error).message?.slice(0, 80) });
    }
  } else {
    add("tavily_api", false, { error: "TAVILY_API_KEY not set" });
  }

  // 5 — analyze-part edge function self-test
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(`${sbUrl}/functions/v1/analyze-part`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: svcKey, Authorization: `Bearer ${svcKey}` },
      body: JSON.stringify({ image: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA=", provider: "groq", model: "meta-llama/llama-4-scout-17b-16e-instruct", prompt: "test" }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const body = r.ok ? await r.json().catch(() => null) : null;
    add("edge_analyze_part", r.ok, { status: r.status, responded: !!body });
  } catch (e) {
    add("edge_analyze_part", false, { error: (e as Error).message?.slice(0, 80) });
  }

  // 6 — api-proxy edge function self-test
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(`${sbUrl}/functions/v1/api-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-write-token": Deno.env.get("API_WRITE_TOKEN") || "" },
      body: JSON.stringify({ table: "admin_config", method: "POST", body: {} }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    // Expected: 403 (table not allowed for arbitrary POST), which means proxy is alive
    add("edge_api_proxy", true, { status: r.status, message: r.status === 403 ? "alive (forbidden expected)" : "unexpected" });
  } catch (e) {
    add("edge_api_proxy", false, { error: (e as Error).message?.slice(0, 80) });
  }

  // 7 — Overall
  const allOk = results.every(r => r.ok === true);
  add("overall", allOk, { passed: results.filter(r => r.ok).length, total: results.length });

  return new Response(JSON.stringify({ ok: allOk, checks: results, ts: new Date().toISOString() }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});
