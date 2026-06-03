// Supabase Edge Function: analyze-part
// Deploy: supabase functions deploy analyze-part --no-verify-jwt
// Set secrets: supabase secrets set GROQ_API_KEY=xxx OPENROUTER_API_KEY=xxx GEMINI_API_KEY=xxx

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  try {
    const { image, provider, model, prompt } = await req.json();
    if (!image) return new Response(JSON.stringify({ error: "image required" }), { status: 400 });

    const apiKey = getApiKey(provider || "groq");
    if (!apiKey) return new Response(JSON.stringify({ error: `${provider} API key not configured` }), { status: 500 });

    let result;
    if (provider === "groq") {
      result = await callGroq(apiKey, model || "meta-llama/llama-4-scout-17b-16e-instruct", image, prompt);
    } else if (provider === "openrouter") {
      result = await callOpenRouter(apiKey, model || "google/gemma-3-27b-it:free", image, prompt);
    } else if (provider === "gemini") {
      result = await callGemini(apiKey, model || "gemini-2.0-flash", image, prompt);
    } else {
      return new Response(JSON.stringify({ error: "unsupported provider" }), { status: 400 });
    }

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "internal error" }), { status: 500 });
  }
});

function getApiKey(provider: string): string {
  switch (provider) {
    case "groq": return Deno.env.get("GROQ_API_KEY") || "";
    case "openrouter": return Deno.env.get("OPENROUTER_API_KEY") || "";
    case "gemini": return Deno.env.get("GEMINI_API_KEY") || "";
    default: return "";
  }
}

async function callGroq(key: string, model: string, image: string, prompt: string) {
  const body = { model, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }] }], max_tokens: 300 };
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return handleResponse(res);
}

async function callOpenRouter(key: string, model: string, image: string, prompt: string) {
  const body = { model, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }] }], max_tokens: 300 };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return handleResponse(res);
}

async function callGemini(key: string, model: string, image: string, prompt: string) {
  const body = { contents: [{ parts: [{ inlineData: { mimeType: "image/jpeg", data: image.split(",")[1] || image } }, { text: prompt }] }] };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = tryParseJSON(text) || { marca: "No determinado", modelo: "No determinado", años: "No determinado", categoria: "varios", descripcion: text.slice(0, 65), posicion: "No determinado", confianza: "Baja", _ok: false };
  return { ...parsed, _ok: parsed.marca !== "No determinado" };
}

async function handleResponse(res: Response) {
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content || "";
  const parsed = tryParseJSON(text) || { marca: "No determinado", modelo: "No determinado", años: "No determinado", categoria: "varios", descripcion: text.slice(0, 65), posicion: "No determinado", confianza: "Baja", _ok: false };
  return { ...parsed, _ok: parsed.marca !== "No determinado" };
}

function tryParseJSON(s: string): Record<string, unknown> | null {
  try {
    const cleaned = s.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === "object") return obj;
    return null;
  } catch { return null; }
}
