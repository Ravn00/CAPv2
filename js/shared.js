// Shared utilities — CAPv2
function $(id) { return document.getElementById(id); }
function escH(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  const msgEl = document.getElementById("toast-msg") || el.querySelector(".toast-msg");
  if (msgEl) msgEl.textContent = msg;
  el.classList.add("on");
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), 3000);
}

async function sbFetch(path, method="GET", body=null, showError=true) {
  const opts = { method, headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(SB_URL + path, opts);
    if (!r.ok) {
      if (r.status === 409) return null;
      const txt = await r.text().catch(() => "");
      console.error("sbFetch error:", method, path, r.status, txt.slice(0,100));
      if (showError) toast("Error " + r.status);
      return null;
    }
    if (method === "DELETE" || r.status === 204) return true;
    return r.headers.get("content-type")?.includes("json") ? await r.json() : true;
  } catch(e) {
    console.error("sbFetch error:", e.message);
    if (showError) toast("Error de red");
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

function closeLightbox() {
  const lb = document.getElementById("lightbox");
  if (lb) lb.classList.remove("on");
  const img = document.getElementById("lb-img");
  if (img) img.src = "";
}

async function apiProxy(table, method, body, query) {
  if (!writeToken) { console.warn("apiProxy: no write token configured"); return null; }
  try {
    const res = await fetch(`${SB_URL}/functions/v1/api-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-write-token": writeToken },
      body: JSON.stringify({ table, method, body, query: query || "" })
    });
    if (!res.ok) { console.warn("apiProxy error:", res.status); return null; }
    return true;
  } catch(e) { console.warn("apiProxy error:", e.message); return null; }
}

async function sbLogAudit(partId, action, changes) {
  try {
    await fetch(`${SB_URL}/rest/v1/partes_log`, {
      method: "POST",
      headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify({ part_id: partId, action, changes: JSON.stringify(changes || {}), device_id: deviceId, timestamp: new Date().toISOString() })
    });
  } catch(_) {}
}

async function resetAllData() {
  if (!confirm("⚠️ RESET TOTAL\n\nEsto eliminará TODOS los datos:\n• Catálogo completo\n• Ventas registradas\n• Historial de escaneos\n• Dispositivos\n• Configuración\n\n¿Estás seguro?")) return;
  if (!confirm("ÚLTIMA ADVERTENCIA\n\nEsta acción NO se puede deshacer.\nTodo el localStorage y los datos en Supabase serán eliminados.\n\n¿Confirmas?")) return;
  localStorage.clear();
  if (writeToken) {
    try {
      await fetch(`${SB_URL}/functions/v1/api-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-write-token": writeToken },
        body: JSON.stringify({ action: "reset-all" })
      });
    } catch(e) { console.warn("reset-all error:", e); }
  }
  location.reload();
}
