
async function initApp() {
  if (_inited) return;
  _inited = true;

  // Load config from Supabase (api keys, maintenance, messages)
  const cfgOk = await loadConfig();
  if (!cfgOk) {
    toast("No se pudo conectar con el servidor de configuración");
  }
  // Prompt for company if not set
  if (!companyId) {
    const name = prompt("Nombre de la empresa:", "Desarmaduría Paola");
    if (name && name.trim()) {
      companyId = name.trim().toLowerCase().replace(/\s+/g, "-");
      try { localStorage.setItem("ap_company_id", companyId); } catch(_) {}
    }
  }

  // Network status indicator
  const nb = document.getElementById("net-banner");
  function updateNet() { nb.classList.toggle("on", !navigator.onLine); }
  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
  updateNet();

  // Restore auth session
  const hadSession = await sbRestoreSession();
  if (hadSession) updateAuthUI();

  // Check maintenance mode
  await checkMaintenance();

  // Register this device
  await registerDevice();
  // Heartbeat every 5 minutes
  setInterval(heartbeatDevice, 300000);
  setInterval(checkMaintenance, 60000);

  // Load clientes from Supabase and merge with localStorage
  await loadClientesFromSupabase();
  try {
    const saved = localStorage.getItem("ap_clientes_v2");
    if (saved) {
      const local = JSON.parse(saved);
      const supabaseIds = new Set(clientes.map(c => c.id));
      local.forEach(c => { if (!supabaseIds.has(c.id)) clientes.push(c); });
    }
  } catch(e) {}

  // Load ventas from Supabase and merge with localStorage
  await loadVentasFromSupabase();
  try {
    const saved = localStorage.getItem("ap_ventas_v2");
    if (saved) {
      const local = JSON.parse(saved);
      const supabaseIds = new Set(ventas.map(v => v.id));
      local.forEach(v => { if (!supabaseIds.has(v.id)) ventas.push(v); });
    }
  } catch(e) {}

  // Load parts from Supabase and merge with localStorage
  await loadPartsFromSupabase();
  // Also load any local-only parts from localStorage
  try {
    const saved = localStorage.getItem("ap_parts_v2");
    if (saved) {
      const local = JSON.parse(saved);
      // Merge: keep parts that exist in local but not in supabase
      const supabaseIds = new Set(parts.map(p => p.id));
      local.forEach(p => { if (!supabaseIds.has(p.id)) parts.push(p); });
    }
  } catch(e) {}

  // Load pending reviews from localStorage
  try {
    const saved = localStorage.getItem("ap_reviews_v2");
    if (saved) { pendingReviews = JSON.parse(saved); }
  } catch(e) {}
  showReviewBadge();

  buildUploadGrid();
  renderAll();
  renderDashboard();
}

// ---
// BUILD UPLOAD
// ---
function buildUploadGrid() {
  const grid = $("up-grid");
  grid.innerHTML = "";
  Object.keys(CATS).forEach(key => { const o = $(`fi-${key}`); if (o) o.remove(); });
  Object.entries(CATS).forEach(([key, cat]) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.multiple = true; inp.accept = "image/*";
    inp.style.display = "none"; inp.id = `fi-${key}`;
    inp.onchange = e => { handleFiles(e.target.files, key); inp.value = ""; };
    document.body.appendChild(inp);
    const btn = document.createElement("button");
    btn.className = "up-cat-btn"; btn.id = `ucb-${key}`;
    btn.innerHTML = `<span class="up-cat-count" id="ucc-${key}">0</span><span class="up-cat-icon">${cat.icon}</span><span class="up-cat-label">${cat.label}</span>`;
    btn.onclick = () => $(`fi-${key}`).click();
    grid.appendChild(btn);
  });
}

$("up-toggle").onclick = () => {
  $("up-body").classList.toggle("open");
  $("up-toggle-arrow").classList.toggle("open");
};

// ---
// FILES
// ---
async function handleFiles(files, presetCat) {
  const imgs = Array.from(files).filter(f => f.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|heic)$/i.test(f.name));
  if (!imgs.length) { toast("Sin imágenes encontradas"); return; }
  const existing = new Set(parts.map(p => `${p.fileName}|${p.fileSize||0}`));
  const fresh = imgs.filter(f => !existing.has(`${f.name}|${f.size}`));
  if (fresh.length === 0) { toast("Todas las imágenes ya están catalogadas"); return; }
  const large = fresh.filter(f => f.size > 5e6);
  if (large.length > 0) { toast(`${large.length} foto${large.length>1?"s":""} pesa${large.length>1?"n":""} >5MB — puede tardar`, 4000); }
  const items = await Promise.all(fresh.map(async file => {
    let preview = "", fileDataUrl = "";
    try {
      const raw = await new Promise(res => {
        const rr = new FileReader();
        rr.onload = e => res(e.target.result || "");
        rr.onerror = () => res("");
        rr.readAsDataURL(file);
      });
      if (!raw) { return { file, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, preview, fileDataUrl, status:"waiting", fileSize: file.size, presetCat }; }
      let img;
      img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = raw; });
      if (img) {
        let w = img.width, h = img.height;
        const max = 800;
        if (w > max || h > max) { if (w >= h) { h = Math.round(h * max / w); w = max; } else { w = Math.round(w * max / h); h = max; } }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        preview = c.toDataURL("image/jpeg", 0.88);
        fileDataUrl = raw;
        if (img.close) img.close();
      }
    } catch(_) {}
    return { file, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, preview, fileDataUrl, status:"waiting", fileSize: file.size, presetCat };
  }));
  queue = [...queue, ...items];
  totalBatch += items.length;
  renderQueue();
  if (!processing) processQueue();
}

// ---
// ANALYZE ??? reads API keys from Supabase config