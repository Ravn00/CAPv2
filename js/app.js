// --- Init on full load ---
window.addEventListener("load", async () => {
  await loadConfig();
  const licValid = await checkSavedLicense();
  if (licValid) {
    document.getElementById('lic-gate').classList.add('gone');
    await initApp();
  }
  // If not valid: gate stays visible, activateLicense() calls initApp() on success
});
// ---
// Service Worker registration
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { scope: '/CAPv2/' }).catch(() => {});
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('on'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('on'));
    btn.classList.add('on');
    const tab = document.getElementById('tab-'+btn.dataset.tab);
    if (tab) tab.classList.add('on');
    if (btn.dataset.tab === 'dashboard') renderDashboard();

  };
});

// Theme toggle
(function() {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  const stored = localStorage.getItem('ap_theme');
  if (stored === 'light') document.documentElement.classList.add('light');
  btn.onclick = () => {
    const isLight = document.documentElement.classList.toggle('light');
    localStorage.setItem('ap_theme', isLight ? 'light' : 'dark');
  };
})();



// --- QR ---
let _qrPart = null;
function showQR(part) {
  _qrPart = part;
  $("qr-sub").textContent = `${part.marca} ${part.modelo} · ${part.años}${part.ubicacion ? ` · 📍 ${part.ubicacion}` : ""}`;
  const c = $("qr-container"); c.innerHTML = "";
  const url = location.href.split("?")[0] + "?part=" + part.id;
  const img = document.createElement("img");
  img.alt = "QR"; img.style.width = "180px"; img.style.height = "180px";
  img.src = "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=" + encodeURIComponent(url);
  img.onerror = () => {
    const fb = document.createElement("canvas");
    fb.width = 180; fb.height = 180;
    const ctx = fb.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,180,180);
    ctx.fillStyle = "#000"; ctx.font = "12px monospace"; ctx.textAlign = "center";
    ctx.fillText("QR no disponible", 90, 90);
    c.appendChild(fb);
  };
  c.appendChild(img);
  $("qr-modal").classList.add("on");
}
$("qr-download").onclick = () => {
  const img = $("qr-container").querySelector("img");
  if (img && img.src && img.complete) {
    const a = document.createElement("a");
    a.download = `QR-${_qrPart?.marca||"parte"}-${_qrPart?.modelo||"unknown"}.png`;
    a.href = img.src; a.click();
  } else { toast("Esperá a que cargue el QR"); }
};
$("qr-print").onclick = () => {
  const img = $("qr-container").querySelector("img");
  if (!img || !img.src) { toast("QR no disponible"); return; }
  const part = _qrPart; if (!part) return;
  const w = window.open("","_blank");
  if (!w) { toast("Permití ventanas emergentes"); return; }
  w.document.write(`<html><head><title>Imprimir QR</title><style>body{text-align:center;padding:20px;font-family:sans-serif}img{max-width:300px;margin:20px auto}h2{font-size:16px;margin-bottom:4px}p{font-size:12px;color:#666}</style></head><body>
    <h2>${escH(part.marca)} ${escH(part.modelo)}</h2>
    <p>${escH(part.descripcion||"")} · ${escH(part.años)}</p>
    <img src="${img.src}" crossorigin="anonymous"/>
    <p>Código QR · CAPv2</p>
    <script>window.onload=function(){window.print();}<\/script></body></html>`);
  w.document.close();
};

// ---
$("btn-clear-all").onclick = () => {
  if (!parts.length) { toast("Catálogo vacío"); return; }
  showConfirm("Limpiar catálogo",`¿Eliminar las ${parts.length} partes?`,async ()=>{ for(const p of parts) await deletePartFromSupabase(p.id); parts=[]; saveParts(); renderAll(); toast("Catálogo limpiado"); },true);
};

// ---
async function resyncMissingPhotos() {
  const missing = parts.filter(p =>
    !p.photoUrl &&
    (p.preview?.startsWith("data:") || p.previewFull?.startsWith("data:"))
  );
  if (!missing.length) { toast("Todas las fotos ya están en la nube"); return; }
  toast(`Subiendo ${missing.length} fotos...`);
  let uploaded = 0, failed = 0;
  for (const part of missing) {
    const dataUrl = part.previewFull || part.preview;
    if (!dataUrl?.startsWith("data:")) continue;
    const url = await sbUploadPhoto(part.id, dataUrl);
    if (url) {
      const idx = parts.findIndex(p => p.id === part.id);
      if (idx > -1) {
        parts[idx].photoUrl    = url;
        parts[idx].preview     = url;
        parts[idx].previewFull = url;
      }
      const { fileDataUrl, file, ...rest } = parts[idx] || part;
      rest.photoUrl = url; rest.preview = url; rest.previewFull = url;
      await sbFetch(`/rest/v1/partes?id=eq.${encodeURIComponent(part.id)}`, "PATCH", { data: rest });
      uploaded++;
    } else { failed++; }
  }
  saveParts();
  renderAll();
  toast(`${uploaded} fotos subidas${failed ? ` · ${failed} fallaron` : ""}`);
}

// ---
function exportExcel() {
  if (!parts.length) return;
  const wb = XLSX.utils.book_new();
  const hdrs = ["#","Archivo","Marca","Modelo","Años","Posición","Descripción","Confianza","Estado","Fecha","Dispositivo"];
  Object.entries(CATS).forEach(([k,c]) => {
    const rows = parts.filter(p=>p.categoria===k);
    if (!rows.length) return;
    const data = [hdrs, ...rows.map((p,i)=>[i+1,p.fileName,p.marca,p.modelo,p.años,p.posicion,p.descripcion,p.manual?"Manual":p.confianza,p.estado||(p.sold?"vendida":"disponible"),p.addedAt||"",deviceId])];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"]=[{wch:4},{wch:22},{wch:14},{wch:14},{wch:16},{wch:14},{wch:30},{wch:10},{wch:12},{wch:18},{wch:20}];
    XLSX.utils.book_append_sheet(wb, ws, c.label);
  });
  XLSX.writeFile(wb, `autopartes-${new Date().toISOString().slice(0,10)}.xlsx`);
  toast("Excel descargado");
}