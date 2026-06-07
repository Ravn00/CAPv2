// ---
// COUNTERS
// ---
function updateCatalogCount() { const el = document.getElementById("c-catalog"); if (el) el.textContent = parts.length; }
function updateDeviceCount() { const el = document.getElementById("c-devices"); if (el) el.textContent = devices.length; }

// ---
// DASHBOARD STATS
// ---
function updateDashboardStats() {
  const total = parts.length;
  const estado = p => p.estado || (p.sold ? "vendida" : "disponible");
  const avail = parts.filter(p => estado(p) === "disponible").length;
  const sold = parts.filter(p => estado(p) === "vendida").length;
  const resv = parts.filter(p => estado(p) === "reservada").length;
  const dTotal = document.getElementById("dash-total");
  const dAvail = document.getElementById("dash-avail");
  const dSold = document.getElementById("dash-sold");
  const dResv = document.getElementById("dash-resv");
  const dDev = document.getElementById("dash-devices");
  const dActive = document.getElementById("dash-active-devices");
  if (dTotal) dTotal.textContent = total;
  if (dAvail) dAvail.textContent = avail;
  if (dSold) dSold.textContent = sold;
  if (dResv) dResv.textContent = resv;
  if (dDev) dDev.textContent = devices.length;
  if (dActive) {
    const activeCount = devices.filter(d => {
      if (d.status === "blocked") return false;
      if (!d.last_seen) return false;
      return (Date.now() - new Date(d.last_seen.endsWith("Z")||d.last_seen.includes("+")?d.last_seen:d.last_seen+"Z").getTime()) < 300000;
    }).length;
    dActive.textContent = activeCount + " activos";
  }
}

// ---
// CATALOG (inside modal)
// ---
function setCatFilter(f) {
  catFilter = f;
  const pills = document.querySelectorAll("#modal-body .filter-pill");
  pills.forEach(p => p.classList.toggle("on", p.dataset.f === f));
  renderCatalogInModal();
}

function renderCatalogInModal() {
  const body = $("modal-body");
  if (!body) return;
  let filtered = [...parts];
  if (catSearch) {
    const q = catSearch;
    filtered = filtered.filter(p =>
      (p.marca || "").toLowerCase().includes(q) ||
      (p.modelo || "").toLowerCase().includes(q) ||
      (p.años || "").toLowerCase().includes(q) ||
      (p.descripcion || "").toLowerCase().includes(q) ||
      (p.posicion || "").toLowerCase().includes(q)
    );
  }
  const _est2 = p => p.estado || (p.sold ? "vendida" : "disponible");
  if (catFilter === "avail") filtered = filtered.filter(p => _est2(p) === "disponible");
  if (catFilter === "resv") filtered = filtered.filter(p => _est2(p) === "reservada");
  if (catFilter === "sold") filtered = filtered.filter(p => _est2(p) === "vendida");

  const grid = body.querySelector("#cat-grid");
  const empty = body.querySelector("#cat-empty");
  const stats = body.querySelector("#cat-stats");
  if (!grid) return;
  const _estado = p => p.estado || (p.sold ? "vendida" : "disponible");
  const totalAvail = parts.filter(p => _estado(p) === "disponible").length;
  const totalSold = parts.filter(p => _estado(p) === "vendida").length;
  if (stats) stats.textContent = `${parts.length} totales · ${totalAvail} disponibles · ${totalSold} vendidas`;

  if (filtered.length === 0) { grid.innerHTML = ""; if (empty) empty.style.display = "block"; return; }
  if (empty) empty.style.display = "none";

  grid.innerHTML = filtered.map((p, i) => {
    const idx = `pi-${i}`;
    const imgSrc = p.preview || p.previewFull || "";
    const _est = p.estado || (p.sold ? "vendida" : "disponible");
    const soldClass = _est === "vendida" ? "p-card-sold" : "";
    const catLabel = { parachoques:"Parachoques", opticos:"Ópticos", focos:"Focos", guardabarros:"Guardabarros", capots:"Capots", varios:"Varios" }[p.categoria] || p.categoria || "";
    const confianza = p.confianza || "";
    const estLabel = { disponible:"DISPONIBLE", vendida:"VENDIDA", reservada:"RESERVADA", descartada:"DESCARTADA" };
    return `<div class="p-card ${soldClass}" data-cidx="${idx}">
      ${imgSrc ? `<img class="p-card-img" src="${escH(imgSrc)}" width="400" height="130" loading="lazy" alt="${escH(p.marca + ' ' + p.modelo)}" data-img="${escH(imgSrc)}"/>` : `<div class="p-card-img" style="display:flex;align-items:center;justify-content:center;color:var(--t5);font-size:10px">Sin foto</div>`}
      <div class="p-card-body">
        <div class="p-card-brand">${escH(p.marca || "No determinado")}</div>
        <div class="p-card-model">${escH(p.modelo || "No determinado")}</div>
        <div class="p-card-meta">${escH(p.años || "")}${p.posicion ? " · " + escH(p.posicion) : ""}</div>
        <div class="p-card-meta">${escH((p.descripcion || "").slice(0, 80))}</div>
        ${p.precioVenta ? `<div class="p-card-meta" style="color:var(--green);font-weight:600">$${Number(p.precioVenta).toLocaleString("es-CL")}</div>` : p.precio_sugerido ? `<div class="p-card-meta" style="color:var(--green);font-weight:600">Sug.: $${Number(p.precio_sugerido).toLocaleString("es-CL")}</div>` : ""}
        <div style="display:flex;gap:6px;align-items:center;margin-top:5px">
          ${catLabel ? `<span class="p-card-cat">${catLabel}</span>` : ""}
          ${confianza ? `<span style="font-size:8px;color:var(--t4)">${confianza}</span>` : ""}
          ${_est !== "disponible" ? `<span class="sold-tag">${estLabel[_est] || _est}</span>` : ""}
        </div>
      </div>
      <div class="p-card-footer">
        <button class="btn-ghost btn-sm btn-copy" data-cidx="${idx}">Copiar</button>
        <button class="btn-ghost btn-sm btn-del" data-cidx="${idx}">Eliminar</button>
      </div>
    </div>`;
  }).join("");
  grid.querySelectorAll(".btn-copy").forEach(btn => {
    const p = filtered[parseInt(btn.dataset.cidx.replace("pi-",""))];
    if (p) btn.onclick = () => copyToClipboard(formatWhatsAppText(p));
  });
  grid.querySelectorAll(".btn-del").forEach(btn => {
    const p = filtered[parseInt(btn.dataset.cidx.replace("pi-",""))];
    if (p) btn.onclick = () => showConfirm("Eliminar parte", `"${p.marca} ${p.modelo}" será eliminada.`, () => deletePart(p.id), true);
  });
  grid.querySelectorAll(".p-card-img[data-img]").forEach(img => {
    img.onclick = () => openLightbox(img.dataset.img);
  });
}

// ---
// API KEYS (inside modal)
// ---
function renderKeysInModal() {
  const body = $("modal-body");
  const el = body?.querySelector("#keys-list"); if (!el) return;
  let keys = adminConfig?.api_keys || [];
  if (typeof keys === 'string') { try { keys = JSON.parse(keys); } catch(_) { keys = []; } }
  el.innerHTML = "";
  if (keys.length === 0) {
    el.innerHTML = '<div style="font-size:12px;color:var(--t4);text-align:center;padding:6px">Sin API keys configuradas</div>';
    return;
  }
  keys.forEach((k, i) => {
    const isOR   = k.startsWith("sk-or-");
    const label  = isOR ? "OpenRouter" : "Groq";
    const color  = isOR ? "var(--amber-lt)" : "var(--green-lt)";
    const row = document.createElement("div");
    row.className = "key-row";
    row.innerHTML = `
      <span class="key-label" style="background:${color}22;color:${color}">${label}</span>
      <span class="key-val">...${k.slice(-12)}</span>
      <button class="key-del" data-kidx="${i}" aria-label="Eliminar API key">X</button>`;
    el.appendChild(row);
  });
  el.querySelectorAll(".key-del").forEach(btn => {
    const i = parseInt(btn.dataset.kidx);
    btn.onclick = () => removeKey(i);
  });
}

window.removeKey = async function(i) {
  if (!authedOnly()) return;
  const keys = adminConfig?.api_keys || [];
  keys.splice(i, 1);
  await updateAdminConfig({ api_keys: keys });
  renderKeysInModal();
  toast("Key eliminada");
};

async function addKeyHandler() {
  if (!authedOnly()) return;
  const body = $("modal-body");
  const inp = body?.querySelector("#api-key-in");
  const st = body?.querySelector("#api-status");
  if (!inp) return;
  const k = inp.value.trim();
  if (!k) return;
  const isOR   = k.startsWith("sk-or-");
  const isGroq = k.startsWith("gsk_");
  if (!isOR && !isGroq) {
    if (st) { st.textContent = "Clave inválida - verifica que sea correcta"; st.style.color = "var(--red-lt)"; }
    return;
  }
  const keys = adminConfig?.api_keys || [];
  if (keys.includes(k)) { if (st) { st.textContent = "Esta key ya está guardada"; st.style.color = "var(--amber-lt)"; } return; }
  keys.push(k);
  await updateAdminConfig({ api_keys: keys });
  inp.value = "";
  if (st) { st.textContent = `Key ${keys.length} agregada`; st.style.color = "var(--green-lt)"; }
  renderKeysInModal();
  setTimeout(() => { if (st) st.textContent = ""; }, 2000);
}

function renderSellersInModal() {
  const body = $("modal-body");
  const listEl = body?.querySelector("#sellers-list"); if (!listEl) return;
  const statsEl = body?.querySelector("#sellers-stats");
  let sellers = adminConfig?.sellers || [];
  if (typeof sellers === "string") { try { sellers = JSON.parse(sellers); } catch(_) { sellers = []; } }
  listEl.innerHTML = "";
  if (!sellers.length) {
    listEl.innerHTML = '<div style="font-size:12px;color:var(--t4);text-align:center;padding:6px">Sin vendedores configurados</div>';
    if (statsEl) statsEl.innerHTML = "";
    return;
  }

  const sales = ventas || [];

  if (statsEl) {
    statsEl.innerHTML = sellers.map(s => {
      const mySales = sales.filter(v => v.vendedor === s.name);
      const totalV = mySales.reduce((a, v) => a + (v.total || 0), 0);
      const histComm = mySales.reduce((a, v) => a + (v.comision || Math.round((v.total || 0) * 0.1)), 0);
      const since = s.last_paid_at ? new Date(s.last_paid_at).getTime() : 0;
      const pendComm = mySales
        .filter(v => { const t = v.created_at ? new Date(v.created_at.endsWith("Z")||v.created_at.includes("+")?v.created_at:v.created_at+"Z").getTime() : 0; return t > since; })
        .reduce((a, v) => a + (v.comision || Math.round((v.total || 0) * 0.1)), 0);
      const lastPay = s.last_paid_at ? new Date(s.last_paid_at.endsWith("Z")||s.last_paid_at.includes("+")?s.last_paid_at:s.last_paid_at+"Z").toLocaleDateString("es-CL") : "—";
      return `<div class="dash-card" style="flex:1;min-width:150px">
        <div class="dash-val default" style="font-size:13px">${escH(s.name)}</div>
        <div style="font-size:9px;color:var(--t4);line-height:1.5;margin-top:2px">
          ${mySales.length} ventas · $${Math.round(totalV).toLocaleString("es-CL")} vendido<br/>
          📊 Histórico: $${Math.round(histComm).toLocaleString("es-CL")}<br/>
          💰 <strong style="color:var(--green-lt)">Pendiente: $${Math.round(pendComm).toLocaleString("es-CL")}</strong><br/>
          🕐 Último pago: ${lastPay}
        </div>
        <button class="btn-primary btn-sm" data-pay-seller="${escH(s.name)}" style="margin-top:6px;font-size:10px;padding:4px 10px" ${pendComm === 0 ? "disabled" : ""}>${pendComm > 0 ? `Pagar $${Math.round(pendComm).toLocaleString("es-CL")}` : "Al día"}</button>
      </div>`;
    }).join("");
    statsEl.querySelectorAll("[data-pay-seller]").forEach(btn => {
      btn.onclick = () => paySeller(btn.dataset.paySeller);
    });
  }

  sellers.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "key-row";
    row.innerHTML = `
      <span style="flex:1;font-weight:600">${escH(s.name||"Vendedor")}</span>
      <span style="color:var(--t3);font-size:11px;margin:0 10px">PIN: ${"•".repeat(String(s.pin||"").length)}</span>
      <button class="key-eye" data-sidx="${i}" aria-label="Mostrar u ocultar PIN" style="background:none;border:none;color:var(--t4);cursor:pointer;display:flex;padding:2px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8"/><circle cx="12" cy="12" r="3"/></svg></button>
      <button class="key-del" data-sidxi="${i}" aria-label="Eliminar vendedor">X</button>`;
    listEl.appendChild(row);
  });
  listEl.querySelectorAll(".key-eye").forEach(btn => {
    const i = parseInt(btn.dataset.sidx);
    btn.onclick = () => window.toggleSellerPin(i);
  });
  listEl.querySelectorAll(".key-del").forEach(btn => {
    const i = parseInt(btn.dataset.sidxi);
    btn.onclick = () => window.removeSeller(i);
  });
}

window.toggleSellerPin = function(i) {
  const sellers = adminConfig?.sellers || [];
  const s = sellers[i];
  if (!s) return;
  const row = document.querySelectorAll("#sellers-list .key-row")[i];
  if (!row) return;
  const span = row.querySelector("span:nth-child(2)");
  if (span) span.textContent = span.textContent.includes("PIN:")
    ? `PIN: ${s.pin}`
    : `PIN: ${"•".repeat(String(s.pin||"").length)}`;
};

async function paySeller(sellerName) {
  if (!authedOnly()) return;
  const now = new Date().toISOString();
  const sellers = (adminConfig?.sellers || []).map(s => {
    if (s.name === sellerName) return { ...s, last_paid_at: now };
    return s;
  });
  showConfirm("Pagar comisión",
    `Marcar a "${sellerName}" como pagado al ${new Date().toLocaleString("es-CL")}. La comisión pendiente se reiniciará a $0.`,
    async () => {
      await updateAdminConfig({ sellers });
      await loadVentas(false);
      renderSellersInModal();
      toast(`${sellerName} pagado`);
    },
    false
  );
}

window.removeSeller = async function(i) {
  if (!authedOnly()) return;
  const sellers = adminConfig?.sellers || [];
  sellers.splice(i, 1);
  await updateAdminConfig({ sellers });
  renderSellersInModal();
  toast("Vendedor eliminado");
};

async function addSellerHandler() {
  if (!authedOnly()) return;
  const body = $("modal-body");
  const nameInp = body?.querySelector("#sel-name-in");
  const pinInp = body?.querySelector("#sel-pin-in");
  const st = body?.querySelector("#sel-status");
  const name = (nameInp?.value||"").trim();
  const pin = (pinInp?.value||"").trim();
  if (!name) { if (st) { st.textContent = "Ingresá un nombre"; st.style.color = "var(--red-lt)"; } return; }
  if (!pin || pin.length < 3) { if (st) { st.textContent = "El PIN debe tener al menos 3 caracteres"; st.style.color = "var(--red-lt)"; } return; }
  const sellers = adminConfig?.sellers || [];
  if (sellers.some(s => s.pin === pin)) { if (st) { st.textContent = "Ese PIN ya está en uso"; st.style.color = "var(--amber-lt)"; } return; }
  sellers.push({ name, pin });
  await updateAdminConfig({ sellers });
  if (nameInp) nameInp.value = "";
  if (pinInp) pinInp.value = "";
  if (st) { st.textContent = `${name} agregado como vendedor`; st.style.color = "var(--green-lt)"; }
  renderSellersInModal();
  setTimeout(() => { if (st) st.textContent = ""; }, 2000);
}

// ---
// DEVICES (inside modal, dual view)
// ---
function rebindDeviceActions(container) {
  container.querySelectorAll(".btn-block").forEach(btn => {
    const did = btn.closest("[data-did]")?.dataset.did;
    if (did) btn.onclick = () => showConfirm("Bloquear","¿Bloquear este dispositivo?",()=>updateDeviceStatus(did,"blocked"),true);
  });
  container.querySelectorAll(".btn-activate").forEach(btn => {
    const did = btn.closest("[data-did]")?.dataset.did;
    if (did) btn.onclick = () => updateDeviceStatus(did,"active");
  });
  container.querySelectorAll(".btn-dev-del").forEach(btn => {
    const did = btn.closest("[data-did]")?.dataset.did;
    if (did) btn.onclick = () => showConfirm("Eliminar dispositivo","¿Eliminar este dispositivo permanentemente?",()=>deleteDevice(did),true);
  });
}

function renderDevicesInModal() {
  const body = $("modal-body");
  if (!body) return;
  const tbody = body.querySelector("#dev-tbody");
  const grid = body.querySelector("#dev-grid");
  const empty = body.querySelector("#dev-empty");
  if (!tbody && !grid) return;
  updateDeviceCount();
  if (devices.length === 0) { if (tbody) tbody.innerHTML = ""; if (grid) grid.innerHTML = ""; if (empty) empty.style.display = "block"; return; }
  if (empty) empty.style.display = "none";

  if (tbody) {
    tbody.innerHTML = devices.map(d => {
      const lastSeen = d.last_seen ? new Date(d.last_seen.endsWith("Z")||d.last_seen.includes("+")?d.last_seen:d.last_seen+"Z").toLocaleString("es-CL") : "???";
      const isActive = d.status === "active";
      const isOnline = d.last_seen && (Date.now() - new Date(d.last_seen.endsWith("Z")||d.last_seen.includes("+")?d.last_seen:d.last_seen+"Z").getTime() < 300000);
      const statusClass = d.status === "blocked" ? "badge-blocked" : isOnline ? "badge-active" : "badge-away";
      const statusLabel = d.status === "blocked" ? "Bloqueado" : isOnline ? "Activo" : "Ausente";
      return `<tr>
        <td style="font-family:monospace;font-size:10px">${escH(d.id)}</td>
        <td>${escH(d.nombre || "---")}</td>
        <td style="font-size:10px;color:var(--t4)">${lastSeen}</td>
        <td>${d.total_scans || 0}</td>
        <td><span class="badge ${statusClass}">${statusLabel}</span></td>
        <td style="display:flex;gap:4px;flex-wrap:wrap" data-did="${escH(d.id)}">
          ${isActive
            ? `<button class="btn-ghost btn-sm btn-block">Bloquear</button>`
            : `<button class="btn-ghost btn-sm btn-activate">Activar</button>`}
          <button class="btn-danger btn-sm btn-dev-del">Eliminar</button>
        </td>
      </tr>`;
    }).join("");
    rebindDeviceActions(body);
  }

  if (grid) {
    grid.innerHTML = devices.map(d => {
      const lastSeen = d.last_seen ? new Date(d.last_seen.endsWith("Z")||d.last_seen.includes("+")?d.last_seen:d.last_seen+"Z").toLocaleString("es-CL") : "???";
      const isActive = d.status === "active";
      const isOnline = d.last_seen && (Date.now() - new Date(d.last_seen.endsWith("Z")||d.last_seen.includes("+")?d.last_seen:d.last_seen+"Z").getTime() < 300000);
      const statusClass = d.status === "blocked" ? "badge-blocked" : isOnline ? "badge-active" : "badge-away";
      const statusLabel = d.status === "blocked" ? "Bloqueado" : isOnline ? "Activo" : "Ausente";
      return `<div class="dev-card">
        <div class="dev-card-info">
          <div class="dev-card-id">${escH(d.id)}</div>
          <div class="dev-card-name">${escH(d.nombre || "---")}</div>
          <div class="dev-card-meta">
            <span>${lastSeen}</span>
            <span>${d.total_scans || 0} escaneos</span>
            <span class="badge ${statusClass}">${statusLabel}</span>
          </div>
        </div>
        <div class="dev-card-actions" data-did="${escH(d.id)}">
          ${isActive
            ? `<button class="btn-ghost btn-sm btn-block">Bloquear</button>`
            : `<button class="btn-ghost btn-sm btn-activate">Activar</button>`}
          <button class="btn-danger btn-sm btn-dev-del">Eliminar</button>
        </div>
      </div>`;
    }).join("");
    rebindDeviceActions(body);
  }
}

// ---
// SCAN LOG (inside modal)
// ---
function renderScanLogInModal() {
  const body = $("modal-body");
  if (!body) return;
  const tbody = body.querySelector("#sl-tbody");
  const empty = body.querySelector("#sl-empty");
  if (!tbody) return;
  let filtered = [...scanLogs];
  if (slSearch) {
    const q = slSearch;
    filtered = filtered.filter(l => (l.part_id||"").toLowerCase().includes(q) || (l.device_id||"").toLowerCase().includes(q));
  }
  if (slFilter !== "all") filtered = filtered.filter(l => l.resultado === slFilter);

  const stats = body.querySelector("#sl-stats");
  if (stats) stats.textContent = slTotal > 0 ? `${scanLogs.length} cargados de ${slTotal} totales` : `${scanLogs.length} registros cargados`;

  if (filtered.length === 0) { tbody.innerHTML = ""; if (empty && allLoaded) empty.style.display = "block"; return; }
  if (empty) empty.style.display = "none";
  tbody.innerHTML = filtered.map(l => {
    const ts = l.timestamp ? new Date(l.timestamp.endsWith("Z")||l.timestamp.includes("+")?l.timestamp:l.timestamp+"Z").toLocaleString("es-CL") : "???";
    const resClass = l.resultado === "success" ? "badge-success" : "badge-error";
    return `<tr>
      <td style="font-size:10px;color:var(--t4);white-space:nowrap">${ts}</td>
      <td style="font-family:monospace;font-size:10px">${escH((l.device_id || "").slice(0, 12))}</td>
      <td style="font-family:monospace;font-size:10px">${escH(l.part_id || "")}</td>
      <td>${escH(l.categoria || "")}</td>
      <td><span class="badge ${resClass}">${l.resultado || "---"}</span></td>
      <td style="color:var(--t4)">${l.latencia_ms != null ? l.latencia_ms + "ms" : "---"}</td>
    </tr>`;
  }).join("");
}

// ---
// AUDIT LOG (inside modal)
// ---
function renderAuditLogInModal() {
  const body = $("modal-body");
  if (!body) return;
  const tbody = body.querySelector("#audit-tbody");
  const empty = body.querySelector("#audit-empty");
  if (!tbody) return;
  let filtered = [...auditLogs];
  if (auditSearch) { const q = auditSearch; filtered = filtered.filter(l => (l.part_id||"").toLowerCase().includes(q)); }
  if (auditFilter !== "all") filtered = filtered.filter(l => l.action === auditFilter);
  const stats = body.querySelector("#audit-stats") || (() => { const s = document.createElement("div"); s.id = "audit-stats"; s.style.cssText = "font-size:10px;color:var(--t4);margin-bottom:6px"; body.querySelector(".tbl-wrap")?.before(s); return s; })();
  if (stats) stats.textContent = auditTotal > 0 ? `${auditLogs.length} cargados de ${auditTotal} totales` : `${auditLogs.length} registros`;
  if (filtered.length === 0) { tbody.innerHTML = ""; if (empty) empty.style.display = "block"; return; }
  if (empty) empty.style.display = "none";
  const actionLabels = { create:"Creada", update:"Editada", delete:"Eliminada" };
  tbody.innerHTML = filtered.map(l => {
    const ts = l.timestamp ? new Date(l.timestamp.endsWith("Z")||l.timestamp.includes("+")?l.timestamp:l.timestamp+"Z").toLocaleString("es-CL") : "???";
    let detail = "";
    try { const c = JSON.parse(l.changes || "{}"); detail = [c.marca, c.modelo].filter(Boolean).join(" ") || c.sold != null ? (c.sold ? "Vendido" : "Disponible") : ""; } catch(_) {}
    return `<tr>
      <td style="font-size:10px;color:var(--t4);white-space:nowrap">${ts}</td>
      <td style="font-family:monospace;font-size:10px">${escH(l.part_id || "")}</td>
      <td><span class="badge ${l.action === "delete" ? "badge-error" : l.action === "create" ? "badge-success" : "badge-warn"}">${actionLabels[l.action] || l.action}</span></td>
      <td style="font-size:10px;color:var(--t4)">${escH(detail)}</td>
      <td style="font-family:monospace;font-size:10px;color:var(--t4)">${escH((l.device_id || "").slice(0, 12))}</td>
    </tr>`;
  }).join("");
}

// ---
// SALES
// ---
function renderSalesInModal() {
  const body = $("modal-body");
  if (!body) return;
  const tbody = body.querySelector("#sales-tbody");
  const empty = body.querySelector("#sales-empty");
  const summary = body.querySelector("#sales-summary");
  if (!tbody) return;
  let filtered = [...ventas];
  if (salesFilter === "seller") filtered = filtered.filter(v => v.vendedor?.trim());
  if (salesSearch) {
    const q = salesSearch.toLowerCase();
    filtered = filtered.filter(v =>
      (v.vendedor || "").toLowerCase().includes(q) ||
      (v.items || []).some(it => (it.marca + " " + it.modelo).toLowerCase().includes(q))
    );
  }

  const stats = body.querySelector("#sales-stats") || (() => { const s = document.createElement("div"); s.id = "sales-stats"; s.style.cssText = "font-size:10px;color:var(--t4);margin-bottom:6px"; tbody.parentElement?.before(s); return s; })();
  if (stats) stats.textContent = salesTotal > 0 ? `${ventas.length} cargadas de ${salesTotal} totales` : `${ventas.length} ventas`;

  if (summary) {
    const totalsBySeller = {};
    ventas.forEach(v => {
      const seller = v.vendedor || "Anónimo";
      if (!totalsBySeller[seller]) totalsBySeller[seller] = { count: 0, total: 0, comision: 0 };
      totalsBySeller[seller].count++;
      totalsBySeller[seller].total += v.total || 0;
      totalsBySeller[seller].comision += v.comision || 0;
    });
    const totalVentas = ventas.reduce((s, v) => s + (v.total || 0), 0);
    const totalComisiones = ventas.reduce((s, v) => s + (v.comision || 0), 0);
    summary.innerHTML = `
      <div class="dash-card" style="flex:1;min-width:120px">
        <div class="dash-val gold">${ventas.length}</div>
        <div class="dash-label">Ventas totales</div>
      </div>
      <div class="dash-card" style="flex:1;min-width:120px">
        <div class="dash-val green">$${Math.round(totalVentas).toLocaleString("es-CL")}</div>
        <div class="dash-label">Ingresos totales</div>
      </div>
      <div class="dash-card" style="flex:1;min-width:120px">
        <div class="dash-val" style="color:var(--amber-lt)">$${Math.round(totalComisiones).toLocaleString("es-CL")}</div>
        <div class="dash-label">Comisiones (10%)</div>
      </div>
      ${Object.entries(totalsBySeller).sort((a,b) => b[1].total - a[1].total).map(([seller, data]) =>
        `<div class="dash-card" style="flex:1;min-width:140px">
          <div class="dash-val default">${escH(seller)}</div>
          <div class="dash-label">${data.count} ventas · $${Math.round(data.comision).toLocaleString("es-CL")} comisión</div>
        </div>`
      ).join("")}`;
  }

  if (filtered.length === 0) { tbody.innerHTML = ""; if (empty) empty.style.display = "block"; return; }
  if (empty) empty.style.display = "none";
  tbody.innerHTML = filtered.map(v => {
    const ts = v.fecha || (v.created_at ? new Date(v.created_at.endsWith("Z")||v.created_at.includes("+")?v.created_at:v.created_at+"Z").toLocaleString("es-CL") : "???");
    const partsList = (v.items || []).map(it => `${it.marca} ${it.modelo}`).join(", ");
    const comision = v.comision || 0;
    return `<tr>
      <td style="font-size:10px;color:var(--t4);white-space:nowrap">${ts}</td>
      <td style="font-weight:600">${escH(v.vendedor || "Anónimo")}</td>
      <td style="font-size:10px;color:var(--t2)">${escH(partsList.slice(0,60))}</td>
      <td style="font-family:var(--font-display);font-weight:600;color:var(--gold)">$${Math.round(v.total||0).toLocaleString("es-CL")}</td>
      <td style="color:var(--amber-lt)">$${Math.round(comision).toLocaleString("es-CL")}</td>
    </tr>`;
  }).join("");
}

// ---
// REFRESH ALL
// ---
async function refreshAll() {
  if (!authedOnly()) return;
  await Promise.all([loadParts(), loadDevices(), loadVentas(false)]);
  slPage = 0;
  await loadScanLogs(false);
  await updateDashboardStats();
  toast("Datos actualizados");
}
