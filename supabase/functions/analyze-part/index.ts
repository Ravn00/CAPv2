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

const FALLBACK = { marca:"No determinado", modelo:"No determinado", años:"No determinado", categoria:"varios", descripcion:"", posicion:"No determinado", confianza:"Baja", codigo_oem:"", _ok:false };

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
  s = s.trim();
  // Strip markdown code fences
  s = s.replace(/^```(?:json)?\s*/gi, "").replace(/```\s*$/g, "").trim();
  // Find first { and last } in case model added thinking text before JSON
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const candidate = s.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch { /* fall through */ }
  }
  return null;
}

function normalize(obj: Record<string, unknown>) {
  const c = String(obj.confianza || "Baja");
  return {
    marca: String(obj.marca || "No determinado"),
    modelo: String(obj.modelo || "No determinado"),
    años: String(obj.años || "No determinado"),
    categoria: String(obj.categoria || "varios"),
    descripcion: String(obj.descripcion || "").slice(0,60),
    posicion: String(obj.posicion || "No determinado"),
    confianza: c,
    codigo_oem: String(obj.codigo_oem || ""),
    _ok: c !== "Baja"
  };
}

const DEFAULT_PROMPT = `Identificá esta autoparte en una línea de JSON exacto. NO agregues explicaciones ni pensamiento, solo el JSON. Debes responder exclusivamente en español.
Buscá: marca visible (logotipo, texto), modelo, años, categoría (parachoques|opticos|focos|guardabarros|capots|varios), posición (Delantero|Trasero|Izquierdo|Derecho), código OEM si hay.
Confianza: Alta si marca+modelo seguros, Media si dudas, Baja si no se identifica.
{"marca":"","modelo":"","años":"","categoria":"varios","descripcion":"","posicion":"No determinado","confianza":"Baja","codigo_oem":""}`;

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
    const useModel = model || "qwen/qwen3.6-27b";
    let vision: Record<string, unknown>;
    let usedKey = "";

    if (provider === "groq" || !provider) {
      const key = getNextGroqKey();
      if (!key) return new Response(JSON.stringify({ error: "No Groq keys available" }), { status: 503, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      usedKey = key;
      vision = await callGroqWithRetry(key, useModel, image, sprompt);
    } else if (provider === "openrouter") {
      const apiKey = Deno.env.get("OPENROUTER_API_KEY") || "";
      if (!apiKey) return new Response(JSON.stringify({ error: "OpenRouter key not configured" }), { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      vision = await callOpenRouter(apiKey, useModel, image, sprompt);
    } else if (provider === "gemini") {
      const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
      if (!apiKey) return new Response(JSON.stringify({ error: "Gemini key not configured" }), { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      vision = await callGemini(apiKey, useModel, image, sprompt);
    } else {
      return new Response(JSON.stringify({ error: "unsupported provider" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }

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
