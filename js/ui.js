// --- (render functions moved to render-parts.js)
// --- (dashboard moved to render-dashboard.js)
// --- (reviews moved to reviews.js)

// ---
// CONFIRM / TOAST / LIGHTBOX
// ---
function showConfirm(title, msg, cb, danger=false) {
  $("conf-title").textContent=title; $("conf-msg").textContent=msg;
  $("conf-ok").className=danger?"danger":"";
  confirmCb=cb; $("confirm-bg").classList.add("on");
}
$("conf-ok").onclick = async () => { $("confirm-bg").classList.remove("on"); if(confirmCb) { const fn=confirmCb; confirmCb=null; await fn(); } };
$("conf-cancel").onclick = () => { $("confirm-bg").classList.remove("on"); confirmCb=null; };
let toastTimer, undoAction = null;
function toast(msg, dur=2600) {
  const el = $("toast"), btn = $("toast-undo");
  if (!el) { console.log("toast:", msg); return; }
  $("toast-msg").textContent=msg;
  btn.style.display="none";
  undoAction=null;
  el.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("on"), dur);
}
function toastWithUndo(msg, onUndo) {
  const el = $("toast"), btn = $("toast-undo");
  if (!el) { console.log("toast:", msg); return; }
  $("toast-msg").textContent=msg;
  btn.style.display="";
  undoAction=onUndo;
  el.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.classList.remove("on"); undoAction=null; }, 5000);
}
$("toast-undo").onclick = () => {
  if (undoAction) { const fn = undoAction; undoAction=null; $("toast").classList.remove("on"); $("toast-undo").style.display="none"; fn(); }
};
// --- (dashboard moved to render-dashboard.js)
// --- (reviews moved to reviews.js)

// ---
// PART HISTORY
// ---
const ACTION_LABELS = { create:"Creada", update:"Editada", delete:"Eliminada", sale:"Vendida", reserve:"Reservada", release:"Liberada" };
async function showPartHistory(part) {
  const bg = document.createElement("div"); bg.className = "modal-bg on"; bg.id = "hist-modal";
  bg.innerHTML = `<div class="modal-sheet" style="max-width:450px">
    <div class="modal-title">Historial: ${escH(part.marca)} ${escH(part.modelo)}</div>
    <div class="modal-sub">Últimos movimientos registrados</div>
    <div id="hist-content" style="max-height:60vh;overflow-y:auto;margin-bottom:12px"><div style="text-align:center;padding:20px;color:var(--t4);font-size:12px">Cargando…</div></div>
    <div class="modal-btns"><button class="btn-ghost-sm" onclick="document.getElementById('hist-modal').remove()">Cerrar</button></div>
  </div>`;
  document.body.appendChild(bg);
  const content = document.getElementById("hist-content");
  const logs = await loadPartHistory(part.id);
  if (!logs || logs.length === 0) {
    content.innerHTML = '<div style="text-align:center;padding:30px 20px;color:var(--t4);font-size:12px">Sin movimientos registrados para esta pieza.</div>';
    return;
  }
  content.innerHTML = logs.map(l => {
    const ts = l.timestamp ? new Date(l.timestamp.endsWith("Z")||l.timestamp.includes("+")?l.timestamp:l.timestamp+"Z").toLocaleString("es-CL") : "???";
    const action = ACTION_LABELS[l.action] || l.action;
    let detail = "";
    try { const c = JSON.parse(l.changes || "{}"); detail = Object.entries(c).map(([k,v]) => `${k}:${v}`).join(", "); } catch(_) {}
    return `<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--bdr);align-items:flex-start">
      <span style="white-space:nowrap;font-size:9px;color:var(--t4);min-width:60px">${ts}</span>
      <span class="estado-badge estado-${l.action === "delete" ? "vendida" : l.action === "create" ? "disponible" : "reservada"}">${action}</span>
      <span style="font-size:10px;color:var(--t3);flex:1">${escH(detail)}</span>
      <span style="font-size:8px;color:var(--t4);font-family:monospace">${escH((l.device_id||"").slice(0,10))}</span>
    </div>`;
  }).join("");
}
// ---
