// ---
// The panel controls these remotely
let apiKeys = [];
let aiProvider = "gemini";
let aiModel = "gemini-2.0-flash";

async function loadConfig() {
  const cfg = await readConfig();
  if (cfg) {
    apiKeys = cfg.api_keys || [];
    aiProvider = cfg.ai_provider || "gemini";
    aiModel = cfg.ai_model || "gemini-2.0-flash";
    if (cfg.license_secret) LICENSE_SECRET = cfg.license_secret;
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
  // Increment device scan count
  const dev = await sbFetch(`/rest/v1/devices?id=eq.${deviceId}&select=total_scans`);
  const current = (dev && dev[0]?.total_scans) || 0;
  await sbFetch(`/rest/v1/devices?id=eq.${deviceId}`, "PATCH", { total_scans: current + 1 });
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

  // Upload full photo to Storage if not already uploaded
  if (!rest.photoUrl) {
    const fullDataUrl = fileDataUrl || part.previewFull || part.preview || null;
    if (fullDataUrl && fullDataUrl.startsWith("data:")) {
      const url = await sbUploadPhoto(part.id, fullDataUrl);
      if (url) {
        rest.photoUrl    = url;
        rest.preview     = url;
        rest.previewFull = url;
        const idx = parts.findIndex(p => p.id === part.id);
        if (idx > -1) {
          parts[idx].photoUrl    = url;
          parts[idx].preview     = url;
          parts[idx].previewFull = url;
          saveParts();
        }
      }
    }
  }

  // Upload additional batch photos
  const photoUrls = [rest.photoUrl || rest.preview || ""];
  if (batchFiles && batchFiles.length) {
    for (let i = 0; i < batchFiles.length; i++) {
      const bf = batchFiles[i];
      const dataUrl = bf.fileDataUrl || bf.preview;
      if (dataUrl && dataUrl.startsWith("data:")) {
        const url = await sbUploadPhoto(`${part.id}-${i+1}`, dataUrl);
        if (url) photoUrls.push(url);
      }
    }
    rest.photos = photoUrls;
    // Update local part
    const idx = parts.findIndex(p => p.id === part.id);
    if (idx > -1) {
      parts[idx].photos = photoUrls;
      saveParts();
    }
  }

  rest.company_id = companyId || null;
  const body = { data: rest };
  const existing = await sbFetch(`/rest/v1/partes?id=eq.${encodeURIComponent(part.id)}&select=id`);
  if (existing && existing.length > 0) {
    await sbFetch(`/rest/v1/partes?id=eq.${encodeURIComponent(part.id)}`, "PATCH", body);
    await sbLogAudit(part.id, "update", { marca: part.marca, modelo: part.modelo });
  } else {
    await sbFetch("/rest/v1/partes", "POST", { id: part.id, data: rest });
    await sbLogAudit(part.id, "create", { marca: part.marca, modelo: part.modelo });
  }
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

async function deletePartFromSupabase(partId) {
  const p = parts.find(x => x.id === partId);
  const changes = p ? { marca: p.marca, modelo: p.modelo } : {};
  await sbLogAudit(partId, "delete", changes);
  await sbFetch(`/rest/v1/partes?id=eq.${encodeURIComponent(partId)}`, "DELETE");
}

// ---
async function checkMaintenance() {
  const cfg = await readConfig();
  if (!cfg) return;
  const overlay = document.getElementById("maint-overlay");
  if (cfg.maintenance_mode) {
    document.getElementById("maint-msg").textContent = cfg.maintenance_message || "El sistema está en mantenimiento. Volvé más tarde.";
    overlay.classList.add("on");
  } else {
    overlay.classList.remove("on");
  }
  // Admin banner
  const banner = document.getElementById("admin-banner");
  if (cfg.admin_message) {
    banner.textContent = cfg.admin_message;
    banner.className = "on " + (cfg.admin_message_type || "info");
  } else {
    banner.className = "";
    banner.textContent = "";
  }
}


