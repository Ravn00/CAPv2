// Supabase Edge Function: analyze-part
// Deploy: supabase functions deploy analyze-part --no-verify-jwt
// Set secrets: supabase functions set GROQ_API_KEYS='["key1","key2","key3"]' OPENROUTER_API_KEY=xxx GEMINI_API_KEY=xxx

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// --- Key rotation state ---
let groqKeys: string[] = [];
let keyLastUsed: number[] = [];
const KEY_COOLDOWN = 1800; // ms between uses per key
const RATE_PENALTY = 62000; // ms penalty on 429

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
  let bestIdx = -1;
  let bestReady = Infinity;
  for (let i = 0; i < groqKeys.length; i++) {
    const elapsed = now - (keyLastUsed[i] || 0);
    if (elapsed >= KEY_COOLDOWN) return groqKeys[i]; // first ready found
    const remaining = KEY_COOLDOWN - elapsed;
    if (remaining < bestReady) { bestReady = remaining; bestIdx = i; }
  }
  if (bestIdx === -1) return null;
  return groqKeys[bestIdx];
}

function penalizeKey(key: string) {
  const idx = groqKeys.indexOf(key);
  if (idx >= 0) keyLastUsed[idx] = Date.now() + RATE_PENALTY;
}

function markKeyUsed(key: string) {
  const idx = groqKeys.indexOf(key);
  if (idx >= 0) keyLastUsed[idx] = Date.now();
}

const SYSTEM_PROMPT = `Eres el motor de IA de "CAPv2" — un catálogo profesional de autopartes con inteligencia artificial.

## CAPACIDADES DEL SISTEMA
Este sistema tiene las siguientes funcionalidades, y tu análisis alimenta todas ellas:

1. **Catálogo de autopartes** — Cada pieza se guarda con: marca, modelo, años, categoría, descripción, posición. El usuario puede buscar por cualquiera de estos campos.

2. **Códigos QR** — Cada pieza recibe un QR único. Se puede imprimir y pegar físicamente en la pieza. Escaneando el QR se abre la ficha de esa pieza.

3. **Stock y precios** — Cada pieza tiene: estado (disponible, reservada, vendida, descartada), stock (cantidad), precio de compra, precio de venta, margen de ganancia, código OEM, y ubicación física (estante, pasillo).

4. **Dashboard ejecutivo** — Muestra valor del inventario, precio promedio, margen promedio, rotación, distribución por categoría (gráfico de barras), y últimos movimientos.

5. **Módulo Clientes** — Registro de clientes con nombre, teléfono, email, dirección, notas.

6. **Módulo Ventas** — Registro de ventas vinculadas a clientes, con desglose de piezas, cantidades y totales.

7. **Multi-tenant** — El sistema soporta múltiples empresas, cada una con su propio catálogo aislado.

8. **Búsqueda avanzada** — Se puede buscar por: marca, modelo, año, posición, descripción, código OEM, ubicación física.

## TU TRABAJO
Analizás la foto de una autoparte y devolvés un JSON con la mayor precisión posible.

### INSTRUCCIONES DETALLADAS:
- **No te rindas fácilmente.** Usá todo lo que veas: texto, logotipos, forma, color, material, número de parte.
- **Tenés acceso a internet y conocimiento general** de autopartes de todas las marcas (Toyota, Honda, Nissan, Ford, Chevrolet, Hyundai, Kia, BMW, Mercedes, VW, Peugeot, Renault, Fiat, etc.).
- **Si ves un código, número de parte o fabricante** (ej: "44320-06010", "MB-XXX"), incluilo en "codigo_oem".
- **Si no hay marcas visibles**, inferí por la forma y el contexto. Ej: una parrilla cromada con forma específica puede ser de cierta marca aunque no diga el nombre.
- **Si la pieza es de una categoría que no está en la lista**, igual elegí la más cercana.

### CATEGORÍAS DISPONIBLES:
parachoques, opticos, focos, guardabarros, capots, varios

### CRITERIOS DE CONFIANZA:
- "Alta" — Estás 90%+ seguro. Viste texto claro (marca, logo, código) o diseño inconfundible.
- "Media" — 60-89% seguro. Identificás la categoría y posible marca pero no el modelo/año exacto.
- "Baja" — Menos de 60%. Solo podés adivinar la categoría o no se entiende la foto.

NUNCA devuelvas "Alta" si tenés dudas.

### FORMATO DE RESPUESTA (SOLO JSON, SIN EXPLICACIONES NI PENSAMIENTO):
{"marca":"marca compatible o No determinado","modelo":"modelo o No determinado","años":"rango (ej: 1995-2005) o año exacto (ej: 1998) o No determinado","categoria":"parachoques|opticos|focos|guardabarros|capots|varios","descripcion":"descripción breve máx 60 chars","posicion":"Delantero|Trasero|Izquierdo|Derecho|Central|No determinado","confianza":"Alta|Media|Baja","codigo_oem":"código OEM visible o vacío"}`;

serve(async (req) => {
  try {
    const { image, provider, model } = await req.json();
    if (!image) return new Response(JSON.stringify({ error: "image required" }), { status: 400 });

    let result;
    if (provider === "groq") {
      const key = getNextGroqKey();
      if (!key) return new Response(JSON.stringify({ error: "No Groq keys available" }), { status: 503 });
      result = await callGroq(key, model || "qwen/qwen3.6-27b", image);
    } else if (provider === "openrouter") {
      const apiKey = Deno.env.get("OPENROUTER_API_KEY") || "";
      if (!apiKey) return new Response(JSON.stringify({ error: "OpenRouter key not configured" }), { status: 500 });
      result = await callOpenRouter(apiKey, model || "google/gemma-4-31b-it:free", image);
    } else if (provider === "gemini") {
      const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
      if (!apiKey) return new Response(JSON.stringify({ error: "Gemini key not configured" }), { status: 500 });
      result = await callGemini(apiKey, model || "gemini-2.0-flash", image);
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

async function callGroq(key: string, model: string, image: string, attempt = 0): Promise<Record<string, unknown>> {
  const body = { model, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: [{ type: "image_url", image_url: { url: image } }] }], max_tokens: 500 };
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (res.status === 429) {
    penalizeKey(key);
    if (attempt < 2) {
      const nextKey = getNextGroqKey();
      if (nextKey && nextKey !== key) return callGroq(nextKey, model, image, attempt + 1);
    }
    return { marca: "No determinado", modelo: "No determinado", años: "No determinado", descripcion: "Rate limit — todas las keys en espera", posicion: "No determinado", confianza: "Baja", codigo_oem: "", _ok: false };
  }
  markKeyUsed(key);
  return handleResponse(res);
}

async function callOpenRouter(key: string, model: string, image: string) {
  const body = { model, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: [{ type: "image_url", image_url: { url: image } }] }], max_tokens: 500 };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return handleResponse(res);
}

async function callGemini(key: string, model: string, image: string) {
  const body = { contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: image.split(",")[1] || image } }, { text: SYSTEM_PROMPT }] }] };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = tryParseJSON(text) || { marca: "No determinado", modelo: "No determinado", años: "No determinado", categoria: "varios", descripcion: text.slice(0, 65), posicion: "No determinado", confianza: "Baja", codigo_oem: "", _ok: false };
  return normalize(parsed);
}

async function handleResponse(res: Response) {
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content || "";
  const parsed = tryParseJSON(text) || { marca: "No determinado", modelo: "No determinado", años: "No determinado", categoria: "varios", descripcion: text.slice(0, 65), posicion: "No determinado", confianza: "Baja", codigo_oem: "", _ok: false };
  return normalize(parsed);
}

function normalize(obj: Record<string, unknown>) {
  const confianza = String(obj.confianza || "Baja");
  const isOk = confianza !== "Baja";
  return { ...obj, confianza, _ok: isOk };
}

function tryParseJSON(s: string): Record<string, unknown> | null {
  s = s.trim();
  s = s.replace(/^```(?:json)?\s*/gi, "").replace(/```\s*$/g, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  return null;
}
