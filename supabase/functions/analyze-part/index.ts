import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

let groqKeys: string[] = [];
let keyLastUsed: number[] = [];
const KEY_COOLDOWN = 1800;
const RATE_PENALTY = 62000;

function loadGroqKeys(): string[] {
  const raw = Deno.env.get("GROQ_API_KEYS");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(k => typeof k === "string" && k.startsWith("gsk_"));
  } catch {}
  return [];
}

function getNextGroqKey(): string | null {
  if (!groqKeys.length) groqKeys = loadGroqKeys();
  if (!groqKeys.length) return null;
  if (keyLastUsed.length !== groqKeys.length) keyLastUsed = new Array(groqKeys.length).fill(0);
  const now = Date.now();
  for (let i = 0; i < groqKeys.length; i++) {
    if (now - (keyLastUsed[i] || 0) >= KEY_COOLDOWN) return groqKeys[i];
  }
  return null;
}

function penalizeKey(key: string) {
  const idx = groqKeys.indexOf(key);
  if (idx >= 0) keyLastUsed[idx] = Date.now() + RATE_PENALTY;
}

function markKeyUsed(key: string) {
  const idx = groqKeys.indexOf(key);
  if (idx >= 0) keyLastUsed[idx] = Date.now();
}

const FALLBACK = { marca:"No determinado", modelo:"No determinado", años:"No determinado", categoria:"varios", descripcion:"", posicion:"No determinado", confianza:"Baja", codigo_oem:"", precio_sugerido:null, fuentes:[], _ok:false };

async function callGroqChat(key: string, model: string, messages: unknown[], timeoutMs = 45000): Promise<Record<string, unknown>> {
  return callAI("https://api.groq.com/openai/v1/chat/completions",
    { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    { model, messages, max_tokens: 500 },
    timeoutMs
  );
}

async function callAI(apiURL: string, headers: Record<string,string>, body: unknown, timeoutMs = 45000): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiURL, { method:"POST", headers, body: JSON.stringify(body), signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (res.status === 429) return { ...FALLBACK, _isRateLimit: true, _error: `429 ${txt.slice(0,80)}` };
      return { ...FALLBACK, _error: `${res.status} ${txt.slice(0,80)}` };
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content || "";
    const parsed = tryParseJSON(text);
    if (parsed) return normalize(parsed);
    return { ...FALLBACK, _error: "JSON no parseable", _raw: text.slice(0,200) };
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === "AbortError") return { ...FALLBACK, _error: "timeout" };
    return { ...FALLBACK, _error: (e as Error).message?.slice(0,80) || "fetch error" };
  }
}

function tryParseJSON(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim()); } catch { return null; }
}

function normalize(obj: Record<string, unknown>) {
  const c = String(obj.confianza || "Baja");
  const ps = obj.precio_sugerido;
  const precio = typeof ps === "number" ? ps : (ps ? Number(ps) : null);
  return {
    marca: String(obj.marca || "No determinado"),
    modelo: String(obj.modelo || "No determinado"),
    años: String(obj.años || "No determinado"),
    categoria: String(obj.categoria || "varios"),
    descripcion: String(obj.descripcion || "").slice(0,60),
    posicion: String(obj.posicion || "No determinado"),
    confianza: c,
    codigo_oem: String(obj.codigo_oem || ""),
    precio_sugerido: (isNaN(precio) || precio === null || precio === 0) ? null : Math.round(precio),
    fuentes: Array.isArray(obj.fuentes) ? obj.fuentes.slice(0,3) : [],
    _ok: c !== "Baja"
  };
}

const DEFAULT_PROMPT = `Identificá esta autoparte en una línea de JSON exacto.
Buscá: marca visible (logotipo, texto), modelo, años, categoría (parachoques|opticos|focos|guardabarros|capots|varios), posición (Delantero|Trasero|Izquierdo|Derecho), código OEM si hay.
Confianza: Alta si marca+modelo seguros, Media si dudas, Baja si no se identifica.
{"marca":"","modelo":"","años":"","categoria":"varios","descripcion":"","posicion":"No determinado","confianza":"Baja","codigo_oem":""}`;

const ENHANCE_PROMPT = `Autoparte identificada inicialmente (confirmá o corregí):
{marca}, {modelo}, {años}, {categoria}, {posicion}, OEM:{codigo_oem}, desc:{descripcion}

Resultados de búsqueda online (precios reales de tiendas):
{searchText}

Respondé SOLO JSON con los campos corregidos + precio_sugerido (número entero en CLP, ej: 45000) y fuentes (hasta 3 URLs).
Si no hay precios claros, precio_sugerido: null.
{"marca":"","modelo":"","años":"","categoria":"varios","descripcion":"","posicion":"No determinado","confianza":"Alta","codigo_oem":"","precio_sugerido":null,"fuentes":[]}`;

async function searchTavily(query: string): Promise<{title:string;url:string;content:string}[] | null> {
  const apiKey = Deno.env.get("TAVILY_API_KEY");
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, search_depth: "basic", max_results: 5 }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.results?.length) return null;
    return json.results.map((r: {title?:string;url?:string;content?:string}) => ({
      title: r.title || "", url: r.url || "", content: r.content || ""
    })).filter(r => r.content || r.title);
  } catch {
    return null;
  }
}

function buildSearchQuery(result: Record<string, unknown>): string {
  const parts = [
    result.marca,
    result.modelo,
    result.años,
    result.descripcion,
    result.codigo_oem,
    result.posicion,
    "autoparte",
    "precio",
    "Chile"
  ].filter(Boolean).filter(s => {
    const v = String(s).toLowerCase();
    return v !== "no determinado" && v !== "varios" && v !== "";
  });
  return [...new Set(parts)].join(" ").slice(0, 200);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Max-Age": "86400",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    const { image, provider, model, prompt } = await req.json();
    if (!image) return new Response(JSON.stringify({ error: "image required" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

    const sprompt = prompt || DEFAULT_PROMPT;
    let vision: Record<string, unknown>;
    let usedKey = "";

    if (provider === "groq") {
      const key = getNextGroqKey();
      if (!key) return new Response(JSON.stringify({ error: "No Groq keys available" }), { status: 503, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      usedKey = key;
      vision = await callGroqWithRetry(key, model || "meta-llama/llama-4-scout-17b-16e-instruct", image, sprompt);
    } else if (provider === "openrouter") {
      const apiKey = Deno.env.get("OPENROUTER_API_KEY") || "";
      if (!apiKey) return new Response(JSON.stringify({ error: "OpenRouter key not configured" }), { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      vision = await callOpenRouter(apiKey, model || "google/gemma-3-27b-it:free", image, sprompt);
    } else if (provider === "gemini") {
      const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
      if (!apiKey) return new Response(JSON.stringify({ error: "Gemini key not configured" }), { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      vision = await callGemini(apiKey, model || "gemini-2.0-flash", image, sprompt);
    } else {
      return new Response(JSON.stringify({ error: "unsupported provider" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }

    // Diagnostic info (always included)
    vision._diag = { tavily: null, enhanced: false, searchQuery: null };

    if (vision._ok && vision.confianza !== "Baja") {
      const query = buildSearchQuery(vision);
      vision._diag.searchQuery = query;
      if (query) {
        const results = await searchTavily(query);
        vision._diag.tavily = results ? results.map(r => ({ title: r.title, url: r.url })) : [];
        if (results && results.length > 0) {
          const searchText = results.map(r => `- ${r.title}\n  ${r.content}\n  ${r.url}`).join("\n\n");
          const enhanceBody = ENHANCE_PROMPT
            .replace("{marca}", String(vision.marca))
            .replace("{modelo}", String(vision.modelo))
            .replace("{años}", String(vision.años))
            .replace("{categoria}", String(vision.categoria))
            .replace("{posicion}", String(vision.posicion))
            .replace("{codigo_oem}", String(vision.codigo_oem))
            .replace("{descripcion}", String(vision.descripcion))
            .replace("{searchText}", searchText);

          let enhanced: Record<string, unknown> | null = null;
          if (provider === "groq") {
            const key = getNextGroqKey();
            if (key) {
              const r = await callGroqChat(key, model || "meta-llama/llama-4-scout-17b-16e-instruct",
                [{ role: "user", content: enhanceBody }], 30000);
              if (r && !r._error) enhanced = r;
            }
          } else if (provider === "openrouter") {
            const apiKey = Deno.env.get("OPENROUTER_API_KEY") || "";
            if (apiKey) {
              const r = await callAI("https://openrouter.ai/api/v1/chat/completions",
                { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                { model: model || "google/gemma-3-27b-it:free", messages: [{ role: "user", content: enhanceBody }], max_tokens: 500 }, 30000);
              if (r && !r._error) enhanced = r;
            }
          } else if (provider === "gemini") {
            const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
            if (apiKey) {
              const geminiBody = { contents: [{ role: "user", parts: [{ text: enhanceBody }] }] };
              try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 30000);
                const gres = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent?key=${apiKey}`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(geminiBody), signal: ctrl.signal });
                clearTimeout(t);
                const gj = await gres.json();
                const gt = gj?.candidates?.[0]?.content?.parts?.[0]?.text || "";
                const gp = tryParseJSON(gt);
                if (gp) enhanced = normalize(gp);
              } catch {}
            }
          }

          if (enhanced) {
            enhanced.fuentes = results.map(r => r.url).filter(Boolean).slice(0,3);
            vision._diag.enhanced = true;
            Object.assign(vision, enhanced);
            return new Response(JSON.stringify(vision), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
          }
        }
      }
    }

    // Ensure precio_sugerido and fuentes are always present
    if (vision.precio_sugerido === undefined) vision.precio_sugerido = null;
    if (!vision.fuentes) vision.fuentes = [];
    return new Response(JSON.stringify(vision), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "internal error" }), { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }
});

async function callGroqWithRetry(key: string, model: string, image: string, prompt: string, attempt = 0): Promise<Record<string, unknown>> {
  const result = await callAI("https://api.groq.com/openai/v1/chat/completions",
    { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    { model, messages: [{ role:"user", content:[{ type:"image_url", image_url:{ url:image } }, { type:"text", text:prompt }] }], max_tokens:500 },
    30000
  );
  if (result._isRateLimit && attempt < 2) {
    penalizeKey(key);
    const nextKey = getNextGroqKey();
    if (nextKey && nextKey !== key) return callGroqWithRetry(nextKey, model, image, prompt, attempt + 1);
  }
  if (!result._isRateLimit) markKeyUsed(key);
  return result;
}

async function callOpenRouter(key: string, model: string, image: string, prompt: string) {
  return callAI("https://openrouter.ai/api/v1/chat/completions",
    { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    { model, messages: [{ role:"user", content:[{ type:"image_url", image_url:{ url:image } }, { type:"text", text:prompt }] }], max_tokens:500 },
    30000
  );
}

async function callGemini(key: string, model: string, image: string, prompt: string) {
  const body = { contents: [{ role:"user", parts:[{ inlineData:{ mimeType:"image/jpeg", data: image.split(",")[1] || image } }, { text: prompt }] }] };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body), signal: controller.signal });
    clearTimeout(timer);
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = tryParseJSON(text);
    if (parsed) return normalize(parsed);
    return { ...FALLBACK, _error: "Gemini: JSON no parseable", _raw: text.slice(0,200) };
  } catch (e) {
    return { ...FALLBACK, _error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message?.slice(0,80) || "gemini error" };
  }
}
