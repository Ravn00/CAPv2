// PENDING REVIEWS
function showReviewBadge() {
  let badge = document.getElementById("review-badge");
  if (!badge) {
    const ref = $("btn-test-ai") || $("theme-btn");
    if (!ref || !ref.parentNode) return;
    badge = document.createElement("button");
    badge.id = "review-badge";
    badge.className = "ico-btn";
    badge.title = "Revisiones pendientes";
    badge.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><span id="review-count" style="position:absolute;top:-2px;right:-2px;background:var(--amber);color:#000;font-size:8px;font-weight:700;border-radius:50%;min-width:14px;height:14px;display:flex;align-items:center;justify-content:center;padding:0 2px">0</span>`;
    badge.onclick = openReviewModal;
    ref.parentNode.insertBefore(badge, ref);
  }
  const count = pendingReviews.length;
  const el = document.getElementById("review-count");
  if (el) el.textContent = count;
  badge.style.display = count ? "" : "none";
}

function openReviewModal() {
  const existing = document.getElementById("review-modal");
  if (existing) existing.remove();
  const bg = document.createElement("div"); bg.className = "modal-bg on"; bg.id = "review-modal";
  bg.innerHTML = `<div class="modal-sheet" style="max-width:450px">
    <div class="modal-title">Revisiones pendientes</div>
    <div class="modal-sub">${pendingReviews.length} parte${pendingReviews.length!==1?"s":""} con confianza Media — revisá antes de guardar</div>
    <div id="review-list" style="max-height:60vh;overflow-y:auto"></div>
    <div class="modal-btns"><button class="btn-ghost-sm" onclick="document.getElementById('review-modal').remove()">Cerrar</button></div>
  </div>`;
  document.body.appendChild(bg);
  const list = document.getElementById("review-list");
  pendingReviews.forEach((r, i) => {
    const card = document.createElement("div"); card.className = "ven-card";
    card.style.cursor = "default";
    const imgSrc = r.preview || r.previewFull || "";
    const pDisplay = r.precioVenta || r.precio_sugerido;
    const priceHtml = pDisplay ? `<span style="color:var(--green);font-weight:600">$${pDisplay.toLocaleString("es-CL")}</span>` : "";
    card.innerHTML = `<div style="display:flex;gap:10px;margin-bottom:8px">
      ${imgSrc ? `<img src="${escH(imgSrc)}" style="width:60px;height:60px;object-fit:cover;border-radius:var(--r6);flex-shrink:0;background:var(--s3)" loading="lazy">` : ""}
      <div style="flex:1;min-width:0">
      <div class="ven-card-hdr"><span class="ven-card-cli">${escH(r.marca+" "+r.modelo)}</span>${priceHtml ? " · "+priceHtml : ""}<span style="font-size:10px;color:var(--amber)">Media</span></div>
      <div class="ven-card-meta">${r.años} · ${r.posicion} · ${r.descripcion}${r.fuentes?.length && r.fuentes[0].startsWith("http") ? ' · <a href="'+escH(r.fuentes[0])+'" target="_blank" rel="noopener noreferrer" style="color:var(--blue);font-size:10px">🔗 ref</a>' : ""}</div>
      </div>
    </div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn-primary" style="flex:1;font-size:10px;padding:6px" data-approve="${i}">✓ Aprobar</button>
        <button class="btn-ghost-sm" style="flex:1;font-size:10px;padding:6px" data-edit="${i}">✎ Editar</button>
        <button class="btn-ghost-sm" style="flex:none;font-size:10px;padding:6px;color:var(--red-lt)" data-discard="${i}">✕</button>
      </div>`;
    card.querySelector("[data-approve]").onclick = async () => { await approveReview(i); };
    card.querySelector("[data-edit]").onclick = () => editReview(i);
    card.querySelector("[data-discard]").onclick = () => discardReview(i);
    list.appendChild(card);
  });
}

async function approveReview(i) {
  const r = pendingReviews[i];
  if (!r) return;
  const part = {
    id: r.id, preview: r.preview, previewFull: r.previewFull,
    fileName: r.fileName, fileSize: r.fileSize, estado: "disponible",
    categoria: r.categoria, marca: r.marca, modelo: r.modelo,
    años: r.años, descripcion: r.descripcion, posicion: r.posicion,
    confianza: r.confianza, _ok: true,
    codigoOem: r.codigo_oem, photos: r.photos, batchFiles: r.batchFiles,
    precio_sugerido: r.precio_sugerido ?? null,
    fuentes: r.fuentes || [],
    addedAt: r.addedAt
  };
  parts.push(part);
  await savePartToSupabase(part);
  saveParts();
  pendingReviews.splice(i, 1);
  savePendingReviews();
  showReviewBadge();
  const modal = document.getElementById("review-modal");
  if (pendingReviews.length) openReviewModal(); else if (modal) modal.remove();
  renderAll();
  toast("Parte aprobada y guardada");
}

function editReview(i) {
  const r = pendingReviews[i];
  if (!r) return;
  $("m-marca").value = r.marca !== "No determinado" ? r.marca : "";
  $("m-modelo").value = r.modelo !== "No determinado" ? r.modelo : "";
  $("m-años").value = r.años !== "No determinado" ? r.años : "";
  $("m-pos").value = r.posicion !== "No determinado" && r.posicion !== "Central" ? r.posicion : "";
  $("m-desc").value = r.descripcion !== "Sin descripción" ? r.descripcion : "";
  const imgSrc = r.preview || r.previewFull || "";
  if (imgSrc) {
    $("manual-preview-img").src = imgSrc;
    $("manual-preview-img").style.display = "block";
    manualPreviewDataUrl = imgSrc.startsWith("data:") ? imgSrc : null;
  }
  if (r.categoria && CATS[r.categoria]) $("m-cat").value = r.categoria;
  if (r.codigo_oem) $("m-oem").value = r.codigo_oem;
  $("m-estado").value = "disponible";
  $("m-stock").value = "1";
  $("manual-title").textContent = "Editar y guardar (pendiente de revisión)";
  const origSave = $("manual-save").onclick;
  const cleanup = () => { $("manual-save").onclick = origSave; };
  $("manual-save").onclick = async () => {
    const marca = $("m-marca").value.trim() || "Sin marca";
    const modelo = $("m-modelo").value.trim() || "Sin modelo";
    const estado = $("m-estado").value;
    const stock = parseInt($("m-stock").value) || 1;
    const part = {
      id: r.id, preview: r.preview, previewFull: r.previewFull,
      fileName: r.fileName, fileSize: r.fileSize, estado,
      categoria: $("m-cat").value, marca, modelo,
      años: $("m-años").value.trim() || "No determinado",
      posicion: $("m-pos").value.trim() || "No determinado",
      descripcion: $("m-desc").value.trim() || "Sin descripción",
      confianza: r.confianza, _ok: true, manual: true,
      codigoOem: $("m-oem").value.trim() || null,
      precio_sugerido: r.precio_sugerido ?? null,
      fuentes: r.fuentes || [],
      photos: r.photos, batchFiles: r.batchFiles,
      estado, stock, addedAt: r.addedAt || new Date().toLocaleString("es-CL")
    };
    parts.push(part);
    await savePartToSupabase(part);
    saveParts();
    pendingReviews.splice(i, 1);
    savePendingReviews();
    showReviewBadge();
    cleanup();
    closeModal("manual-modal");
    renderAll();
    toast("Parte aprobada y guardada");
  };
  $("manual-cancel").onclick = () => { cleanup(); closeModal("manual-modal"); };
  closeModal("review-modal");
  $("manual-modal").classList.add("on");
}

function discardReview(i) {
  pendingReviews.splice(i, 1);
  savePendingReviews();
  showReviewBadge();
  const modal = document.getElementById("review-modal");
  if (pendingReviews.length) openReviewModal(); else modal?.remove();
}

function savePendingReviews() {
  try { localStorage.setItem("ap_reviews_v2", JSON.stringify(pendingReviews)); } catch(e) {}
}
