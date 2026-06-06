// --- Diagnostic tabs ---
document.querySelectorAll(".diag-tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".diag-tab").forEach(b => b.classList.remove("on"));
    document.querySelectorAll(".diag-panel").forEach(p => p.classList.remove("on"));
    btn.classList.add("on");
    const el = document.getElementById("diag-" + btn.dataset.diagTab);
    if (el) el.classList.add("on");
  };
});

// --- System Diagnostic ---
function diagSysAddStep(parent, icon, label, status, detail) {
  const colors = { ok: "var(--green-lt)", err: "var(--red-lt)", warn: "var(--amber-lt)", run: "var(--t2)", skip: "var(--t4)" };
  const dots  = { ok: "var(--green-lt)", err: "var(--red-lt)", warn: "var(--amber-lt)", run: "var(--t4)", skip: "var(--t4)" };
  const d = document.createElement("div");
  d.style.cssText = "display:flex;align-items:flex-start;gap:10px;padding:9px 12px;background:var(--bg);border-radius:var(--r8);border:1px solid var(--bdr2);animation:fadeDown .3s ease";
  d.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${dots[status]||"var(--t4)"};flex-shrink:0;margin-top:4px;display:block"></span>
    <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:500;color:${colors[status]||"var(--text)"};line-height:1.4">${label}</div>
    ${detail ? `<div style="font-size:10px;color:var(--t4);margin-top:2px;word-break:break-all">${detail}</div>` : ""}</div>`;
  parent.appendChild(d);
  return d;
}

async function runSystemDiag() {
  const stepsEl = document.getElementById("diag-sys-steps");
  const logEl = document.getElementById("diag-sys-log");
  const btn = document.getElementById("diag-sys-run");
  if (!stepsEl || !btn) return;

  stepsEl.innerHTML = "";
  logEl.style.display = "block";
  logEl.textContent = "";
  const log = t => { logEl.textContent += t + "\n"; logEl.scrollTop = logEl.scrollHeight; };
  btn.disabled = true;
  btn.textContent = "Diagnosticando…";

  const add = (label, status, detail) => diagSysAddStep(stepsEl, "", label, status, detail);

  // 1 — Online / Network
  add("Conexión a Internet…", "run");
  await sleep(300);
  const online = navigator.onLine;
  add(online ? "Conexión a Internet" : "Sin conexión", online ? "ok" : "err",
    online ? `Navegador reporta online` : "Revisá tu conexión de red");
  log(`[1] Online: ${online}`);

  // 2 — Supabase reachable
  add("Conectando con Supabase…", "run");
  await sleep(200);
  let sbOk = false, sbMs = 0;
  try {
    const t0 = performance.now();
    const r = await fetch(`${SB_URL}/rest/v1/admin_config?select=id&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    sbMs = Math.round(performance.now() - t0);
    sbOk = r.ok;
    add(sbOk ? "Supabase responde" : "Supabase error", sbOk ? "ok" : "err",
      sbOk ? `${sbMs}ms · ${r.status}` : `HTTP ${r.status}`);
    log(`[2] Supabase: ${r.status} · ${sbMs}ms`);
  } catch (e) {
    add("Supabase error", "err", e.name === "AbortError" ? "Timeout (10s)" : e.message?.slice(0, 60));
    log(`[2] Supabase: ${e.message?.slice(0, 60)}`);
  }

  // 3 — Edge Functions reachable (CORS + connectivity)
  const efTests = [
    { name: "analyze-part", url: `${SB_URL}/functions/v1/analyze-part` },
    { name: "api-proxy",    url: `${SB_URL}/functions/v1/api-proxy` },
    { name: "diagnose",     url: `${SB_URL}/functions/v1/diagnose` },
  ];
  for (const ef of efTests) {
    add(`${ef.name}…`, "run");
    await sleep(200);
    try {
      const t0 = performance.now();
      const r = await fetch(ef.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        body: JSON.stringify({ image: "test", provider: "groq", model: "test", prompt: "test" }),
        signal: AbortSignal.timeout(10000),
      });
      const ms = Math.round(performance.now() - t0);
      add(`${ef.name}: HTTP ${r.status}`, r.ok || r.status < 500 ? "ok" : "err",
        `${ms}ms · ${r.status === 503 ? "sin keys (esperado)" : r.status === 400 ? "payload inválido (esperado)" : r.status}`);
      log(`[3] ${ef.name}: ${r.status} · ${ms}ms`);
    } catch (e) {
      add(`${ef.name}: error`, "err", e.name === "AbortError" ? "Timeout (10s)" : e.message?.slice(0, 60));
      log(`[3] ${ef.name}: ${e.message?.slice(0, 60)}`);
    }
  }

  // 4 — Server-side diagnostics via diagnose function
  add("Diagnóstico en servidor…", "run");
  await sleep(200);
  let diagResult = null;
  try {
    const t0 = performance.now();
    const r = await fetch(`${SB_URL}/functions/v1/diagnose`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      body: "{}",
      signal: AbortSignal.timeout(60000),
    });
    const ms = Math.round(performance.now() - t0);
    if (r.ok) diagResult = await r.json();
    add(diagResult?.ok ? "Server checks: todos OK" : "Server checks: fallos detectados",
      diagResult?.ok ? "ok" : "warn",
      `${ms}ms · ${diagResult?.checks?.length || 0} checks`);
    log(`[4] Diagnóstico server: ${JSON.stringify(diagResult?.checks || r.status)}`);
  } catch (e) {
    add("Diagnóstico en servidor: error", "err", e.message?.slice(0, 60));
    log(`[4] Diagnóstico server: ${e.message?.slice(0, 60)}`);
  }

  // Show detailed server checks
  if (diagResult?.checks) {
    for (const c of diagResult.checks) {
      if (c.check === "overall") continue;
      const detail = typeof c.detail === "object" && c.detail ? JSON.stringify(c.detail) : String(c.detail || "");
      add(`  ${c.check}: ${c.ok ? "OK" : "FALLA"}`, c.ok ? "ok" : "err", detail.slice(0, 200));
    }
  }

  // 5 — localStorage integrity
  add("Almacenamiento local…", "run");
  await sleep(200);
  let lsOk = true;
  const lsChecks = [];
  try {
    const partsRaw = localStorage.getItem("ap_parts_v2");
    if (partsRaw) {
      const parsed = JSON.parse(partsRaw);
      if (Array.isArray(parsed)) {
        lsChecks.push(`partes: ${parsed.length}`);
        if (parsed.some(p => !p.id || !p.marca)) lsChecks.push("(datos corruptos)");
      } else {
        lsChecks.push("partes: corrupto");
        lsOk = false;
      }
    } else {
      lsChecks.push("partes: vacío");
    }

    const reviewsRaw = localStorage.getItem("ap_reviews_v2");
    if (reviewsRaw) {
      const rParsed = JSON.parse(reviewsRaw);
      lsChecks.push(`revisiones: ${Array.isArray(rParsed) ? rParsed.length : "?"}`);
    } else {
      lsChecks.push("revisiones: vacío");
    }

    const cid = localStorage.getItem("ap_company_id");
    const did = localStorage.getItem("ap_device_id");
    const theme = localStorage.getItem("ap_theme");
    lsChecks.push(`company: ${cid ? cid.slice(0, 12) + "…" : "no"}`);
    lsChecks.push(`device: ${did ? did.slice(0, 12) + "…" : "no"}`);
    lsChecks.push(`tema: ${theme || "dark"}`);

    add("Almacenamiento local OK", lsOk ? "ok" : "warn", lsChecks.join(" · "));
    log(`[5] localStorage: ${lsChecks.join(" · ")}`);
  } catch (e) {
    add("localStorage error", "err", e.message?.slice(0, 60));
    lsOk = false;
    log(`[5] localStorage error: ${e.message}`);
  }

  // 6 — Browser info
  add("Información del navegador…", "run");
  await sleep(200);
  const info = [
    `User Agent: ${navigator.userAgent.slice(0, 80)}…`,
    `Platform: ${navigator.platform || "?"}`,
    `Language: ${navigator.language}`,
    `Online: ${navigator.onLine}`,
    `Memory: ${navigator.deviceMemory || "?"}GB`,
    `Cores: ${navigator.hardwareConcurrency || "?"}`,
    `Service Worker: ${"serviceWorker" in navigator}`,
    `AbortSignal.timeout: ${typeof AbortSignal?.timeout === "function"}`,
  ];
  add("Información del navegador", "skip", info.join(" · "));
  log(`[6] Browser: ${navigator.userAgent}`);

  // 7 — Parts integrity
  add("Integridad del catálogo…", "run");
  await sleep(200);
  const pCount = parts.length;
  const pWithPrice = parts.filter(p => p.precio_sugerido || p.precioVenta).length;
  const pWithLoc = parts.filter(p => p.ubicacion).length;
  const pWithPhoto = parts.filter(p => p.preview && !p.preview.startsWith("data:")).length;
  const pendingR = pendingReviews.length;
  add("Catálogo cargado", "skip",
    `${pCount} partes · ${pWithPrice} con precio · ${pWithLoc} con ubicación · ${pWithPhoto} con foto en nube · ${pendingR} revisiones pendientes`);
  log(`[7] Catálogo: ${pCount} partes, ${pendingR} revisión(es)`);

  // Summary
  const allSteps = stepsEl.children;
  const okCount = Array.from(allSteps).filter(s => s.querySelector('[style*="background:var(--green-lt)"]')).length;
  const errCount = Array.from(allSteps).filter(s => s.querySelector('[style*="background:var(--red-lt)"]')).length;
  const warnCount = Array.from(allSteps).filter(s => s.querySelector('[style*="background:var(--amber-lt)"]')).length;
  const summary = errCount === 0
    ? `✅ Todos los sistemas OK (${okCount} checks)`
    : `⚠️ ${errCount} fallo(s), ${warnCount} advertencia(s)`;
  add(summary, errCount === 0 ? "ok" : "warn", errCount === 0 ? "Sistema operativo correctamente" : "Revisá los puntos marcados en rojo");

  btn.disabled = false;
  btn.textContent = "Repetir diagnóstico";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Wire up ---
(function() {
  const diagBtn = document.getElementById("btn-diagnose");
  if (diagBtn) {
    diagBtn.onclick = () => {
      const stepsEl = document.getElementById("diag-sys-steps");
      const logEl = document.getElementById("diag-sys-log");
      const btn = document.getElementById("diag-sys-run");
      if (stepsEl) stepsEl.innerHTML = "";
      if (logEl) { logEl.style.display = "none"; logEl.textContent = ""; }
      if (btn) { btn.disabled = false; btn.textContent = "Ejecutar diagnóstico"; }

      document.querySelectorAll(".diag-tab").forEach(b => b.classList.remove("on"));
      document.querySelectorAll(".diag-panel").forEach(p => p.classList.remove("on"));
      const sysTab = document.querySelector('[data-diag-tab="sistema"]');
      const sysPanel = document.getElementById("diag-sistema");
      if (sysTab) sysTab.classList.add("on");
      if (sysPanel) sysPanel.classList.add("on");

      document.getElementById("diag-test-modal")?.classList.add("on");
    };
  }

  const sysBtn = document.getElementById("diag-sys-run");
  if (sysBtn) sysBtn.onclick = runSystemDiag;
})();
