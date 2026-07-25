// ---
// The panel controls these remotely
let apiKeys = [];
let aiProvider = "groq";
let aiModel = "qwen/qwen3.6-27b";
let writeToken = "";

async function loadConfig() {
  const cfg = await readConfig();
  if (cfg) {
    apiKeys = cfg.api_keys || [];
    aiProvider = cfg.ai_provider || "groq";
    aiModel = cfg.ai_model || "qwen/qwen3.6-27b";
    if (cfg.license_secret) LICENSE_SECRET = cfg.license_secret;
    writeToken = cfg.write_token || "";
    if (!writeToken) console.warn("loadConfig: write_token vacío en admin_config — las partes no se sincronizarán con V-CAP");
  }
  return !!cfg;
}

// ---
async function registerDevice() {
  const ua = navigator.userAgent || "";
  const data = { id: deviceId, user_agent: ua.slice(0,500), last_seen: new Date().toISOString() };
  // Use upsert to avoid 409 conflict if device already exists
  try {
    const opts = {
      method: "POST",
      headers: {
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(data)
    };
    await fetch(SB_URL + "/rest/v1/devices", opts);
  } catch(e) { console.warn("registerDevice:", e); }
}
async function heartbeatDevice() {
  const data = { last_seen: new Date().toISOString() };
  await sbFetch(`/rest/v1/devices?id=eq.${encodeURIComponent(deviceId)}`, "PATCH", data);
}
async function logScan(partId, categoria, resultado, latenciaMs) {
  const id = "scan_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  await sbFetch("/rest/v1/scan_log", "POST", {
    id, device_id: deviceId, part_id: partId, categoria, timestamp: new Date().toISOString(),
    resultado, latencia_ms: latenciaMs || 0
  });
}

// ---
// ---
async function sbUploadPhoto(partId, dataUrl) {
  try {
    if (!dataUrl || !dataUrl.startsWith("data:")) return null;
    const mime = dataUrl.split(";")[0].split(":")[1];
    const ext  = mime.includes("png") ? "png" : "jpg";
    const b64  = dataUrl.split(",")[1];
    const bin  = atob(b64);
    const arr  = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    // ??? CORREGIDO: subir directamente al bucket público
    const path = `${partId}.${ext}`;
    // POST to /object/ (without /public/) to upload
    const r = await fetch(`${SB_URL}/storage/v1/object/Fotos/${path}`, {
      method: "POST",
      headers: {
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
        "Content-Type": mime,
        "x-upsert": "true"
      },
      body: blob
    });
    if (!r.ok) {
      const txt = await r.text();
      console.warn("Storage upload failed:", r.status, txt);
      return null;
    }
    // Public read URL uses /object/public/
    return `${SB_URL}/storage/v1/object/public/Fotos/${path}`;
  } catch(e) {
    console.warn("sbUploadPhoto error:", e);
    return null;
  }
}

async function loadPartsFromSupabase() {
  const data = await sbFetchAll("/rest/v1/partes?select=id,data,created_at&order=created_at.desc");
  if (!data || !Array.isArray(data)) return;
  parts = data.map(d => {
    const p = { id: d.id, ...(d.data || {}), created_at: d.created_at };
    if (p.photoUrl) {
      p.preview     = p.photoUrl;
      p.previewFull = p.photoUrl;
    } else {
      if (p.preview && !p.previewFull) p.previewFull = p.preview;
      if (!p.preview && p.previewFull) p.preview = p.previewFull;
    }
    // Ensure photos array exists
    if (!p.photos || !Array.isArray(p.photos)) {
      p.photos = p.photoUrl ? [p.photoUrl] : (p.preview ? [p.preview] : []);
    }
    return p;
  });
}

async function savePartToSupabase(part) {
  const { fileDataUrl, file, batchFiles, ...rest } = part;

  const uploads = [];
  if (!rest.photoUrl) {
    const fullDataUrl = fileDataUrl || part.previewFull || part.preview || null;
    if (fullDataUrl && fullDataUrl.startsWith("data:")) {
      uploads.push(sbUploadPhoto(part.id, fullDataUrl));
    }
  }
  if (batchFiles && batchFiles.length) {
    batchFiles.forEach((bf, i) => {
      const dataUrl = bf.fileDataUrl || bf.preview;
      if (dataUrl && dataUrl.startsWith("data:")) {
        uploads.push(sbUploadPhoto(`${part.id}-${i+1}`, dataUrl));
      }
    });
  }

  let results = [];
  if (uploads.length) results = await Promise.all(uploads);

  if (results.length) {
    const photoUrl = results[0];
    if (photoUrl) {
      rest.photoUrl = rest.preview = rest.previewFull = photoUrl;
      const idx = parts.findIndex(p => p.id === part.id);
      if (idx > -1) Object.assign(parts[idx], { photoUrl, preview: photoUrl, previewFull: photoUrl });
    }
    if (results.length > 1) {
      const urls = results.filter(Boolean);
      rest.photos = urls;
      const idx = parts.findIndex(p => p.id === part.id);
      if (idx > -1) parts[idx].photos = urls;
    }
  }

  rest.company_id = companyId || null;
  let isUpdate = false;
  if (!writeToken) {
    console.error("savePartToSupabase: writeToken vacío — revisar admin_config.write_token en Supabase");
    return false;
  }
  let ok = await apiProxy("partes", "POST", { id: part.id, data: rest });
  if (!ok) {
    isUpdate = true;
    ok = await apiProxy("partes", "PATCH", { data: rest }, `?id=eq.${encodeURIComponent(part.id)}`);
  }
  if (!ok) { console.error("savePartToSupabase: apiProxy falló para", part.id); return false; }
  await sbLogAudit(part.id, isUpdate ? "update" : "create", { marca: part.marca, modelo: part.modelo });
  return true;
}

async function deletePartFromSupabase(partId) {
  const p = parts.find(x => x.id === partId);
  const changes = p ? { marca: p.marca, modelo: p.modelo } : {};
  const ok = await apiProxy("partes", "DELETE", null, `?id=eq.${encodeURIComponent(partId)}`);
  if (!ok) { console.error("deletePartFromSupabase: apiProxy falló para", partId); return false; }
  await sbLogAudit(partId, "delete", changes);
  return true;
}

// ---
async function loadPartHistory(partId) {
  try {
    const data = await sbFetch(`/rest/v1/partes_log?select=*&part_id=eq.${encodeURIComponent(partId)}&order=timestamp.desc&limit=20`, "GET");
    return Array.isArray(data) ? data : [];
  } catch(e) { return []; }
}

async function checkMaintenance() {
  const cfg = await readConfig();
  if (!cfg) return;
  const overlay = document.getElementById("maint-overlay");
  if (!overlay) return;
  const msgEl = document.getElementById("maint-msg");
  if (cfg.maintenance_mode) {
    if(msgEl) msgEl.textContent = cfg.maintenance_message || "El sistema está en mantenimiento. Volvé más tarde.";
    overlay.classList.add("on");
  } else {
    overlay.classList.remove("on");
  }
  const banner = document.getElementById("admin-banner");
  if (!banner) return;
  if (cfg.admin_message) {
    banner.textContent = cfg.admin_message;
    banner.className = "on " + (cfg.admin_message_type || "info");
  } else {
    banner.className = "";
    banner.textContent = "";
  }
}


