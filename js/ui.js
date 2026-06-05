// RENDER
// ---
function renderAll() {
  updateHeaderStats(); updateUploadCounts();
  renderFolderContent();
  fabExport.classList.toggle("on", parts.length > 0);
}
function updateHeaderStats() {
  const disp = parts.filter(p=>(p.estado||(p.sold?"vendida":"disponible"))==="disponible").length;
  const vend = parts.filter(p=>(p.estado||(p.sold?"vendida":"disponible"))==="vendida").length;
  const resv = parts.filter(p=>(p.estado||(p.sold?"vendida":"disponible"))==="reservada").length;
  const cats = new Set(parts.map(p=>p.categoria).filter(Boolean)).size;
  $("stat-avail").textContent = disp;
  $("stat-sold").textContent = vend;
  if($("stat-resv")) $("stat-resv").textContent = resv;
  const t = $("stat-total"); if(t) t.textContent = parts.length;
  const c = $("stat-cats"); if(c) c.textContent = cats;
}
function updateUploadCounts() {
  Object.keys(CATS).forEach(k => {
    const el = $(`ucc-${k}`);
    if (!el) return;
    const n = parts.filter(p=>p.categoria===k).length;
    el.textContent = n;
    $(`ucb-${k}`)?.classList.toggle("cat-has-items", n > 0);
  });
}
function buildCategorySelect() {
  const sel = document.createElement("select");
  sel.id = "cat-select";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = `Todos (${parts.length})`;
  sel.appendChild(allOpt);
  Object.entries(CATS).forEach(([k, c]) => {
    const count = parts.filter(p => p.categoria === k).length;
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = `${c.label} (${count})`;
    if (activeFolder === k) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.value = activeFolder;
  sel.onchange = () => { activeFolder = sel.value; renderFolderContent(); };
  return sel;
}
function fuzzyMatch(q, text) {
  const lq = q.toLowerCase(), lt = text.toLowerCase();
  if (lt.includes(lq)) return true;
  let qi = 0;
  for (let ti = 0; ti < lt.length && qi < lq.length; ti++) {
    if (lt[ti] === lq[qi]) qi++;
  }
  return qi === lq.length;
}
function validateUbicacion(u) {
  if (!u || !u.trim()) return true;
  return /^[A-Z]-\d{2}-\d{2}-\d{2}$/.test(u.trim());
}
function multiWordSearch(q, text) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every(w => fuzzyMatch(w, text));
}
function renderFolderContent() {
  const el = folderContent;
  const s = (folderSearch[activeFolder]||"").toLowerCase();
  const sf = folderStatus[activeFolder]||"all";
  let filtered = parts.filter(p => {
    const pEstado = p.estado||(p.sold?"vendida":"disponible");
    if (activeFolder!=="all" && p.categoria!==activeFolder) return false;
    if (sf==="disp" && pEstado!=="disponible") return false;
    if (sf==="vend" && pEstado!=="vendida") return false;
    if (sf==="resv" && pEstado!=="reservada") return false;
    if (s && !multiWordSearch(s, (p.marca+p.modelo+p.años+p.descripcion+p.posicion+(p.codigoOem||"")+(p.ubicacion||"")+p.categoria))) return false;
    return true;
  }).slice().reverse();
  el.innerHTML = "";
  const toolbar = document.createElement("div");
  toolbar.className = "cat-toolbar";
  toolbar.appendChild(buildCategorySelect());
  const searchWrap = document.createElement("div");
  searchWrap.className = "cat-search-wrap";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Buscar por marca o modelo…";
  searchInput.value = folderSearch[activeFolder] || "";
  let searchDebounce; searchInput.oninput = e => { clearTimeout(searchDebounce); searchDebounce = setTimeout(() => { folderSearch[activeFolder] = e.target.value; renderFolderContent(); }, 250); };
  searchWrap.appendChild(searchInput);
  toolbar.appendChild(searchWrap);
  const filterGroup = document.createElement("div");
  filterGroup.className = "cat-filter-group";
  ["all","disp","resv","vend"].forEach(v => {
    const btn = document.createElement("button");
    btn.className = `cat-filter-btn${sf === v ? " on" : ""}`;
    btn.textContent = v === "all" ? "Todos" : v === "disp" ? "Disp." : v === "resv" ? "Resv." : "Vend.";
    btn.onclick = () => { folderStatus[activeFolder] = v; renderFolderContent(); };
    filterGroup.appendChild(btn);
  });
  toolbar.appendChild(filterGroup);
  const actions = document.createElement("div");
  actions.className = "cat-actions";
  const addBtn = document.createElement("button");
  addBtn.id = "add-manual-btn";
  addBtn.textContent = "+";
  addBtn.title = "Agregar una parte manualmente";
  addBtn.onclick = () => openManual(activeFolder !== "all" ? activeFolder : null);
  actions.appendChild(addBtn);
  toolbar.appendChild(actions);
  el.appendChild(toolbar);
  const list = document.createElement("div"); list.className = "prod-list";
  if (filtered.length===0) {
    list.innerHTML = `<div class="folder-empty" style="text-align:center;padding:44px 20px;color:var(--t4)">
      <div style="font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--t5);margin-bottom:5px">${s?"Sin resultados":sf!=="all"?"Sin partes en este estado":"Carpeta vacía"}</div>
      <div style="font-size:11px;color:var(--t4);line-height:1.6">${s?"Probá con otro término":"Subí imágenes usando los botones de categoría"}</div></div>`;
  } else {
    filtered.forEach(p => {
      if (editId===p.id) list.appendChild(buildEditCard(p));
      else list.appendChild(buildPartCard(p));
    });
  }
  el.appendChild(list);
}

function buildPartCard(part) {
  const cat = CATS[part.categoria]||CATS.varios;
  const imgSrc = part.preview||part.previewFull||"";
  const estado = part.estado||(part.sold?"vendida":"disponible");
  const photos = (part.photos && part.photos.length > 1) ? part.photos : null;
  const el = document.createElement("div");
  el.className="pcard"; el.id=`card-${part.id}`;
  el.innerHTML = (imgSrc?`<div class="pcard-img-wrap"><img class="pcard-img" src="${escH(imgSrc)}" onclick="openLightbox('${escH(imgSrc)}')">${photos?`<div class="pcard-gallery">${photos.map((s,i)=>`<img class="pcard-gallery-thumb${i===0?' on':''}" src="${escH(s)}" onclick="event.stopPropagation();const p=this.parentElement.parentElement;const m=p.querySelector('.pcard-img');const prev=m.src;m.src=this.src;this.src=prev;this.parentElement.querySelectorAll('.pcard-gallery-thumb').forEach(t=>t.classList.remove('on'));this.classList.add('on')">`).join('')}</div>`:''}</div>`
    :`<div class="pcard-img no-img">${cat.icon}</div>`)+
    `<div class="pcard-body">
      <div class="pcard-title">${escH(part.marca)} ${escH(part.modelo)}</div>
      <div class="pcard-meta">${escH(part.años)} · ${escH(part.posicion)}</div>
      <div class="pcard-desc">${escH(part.descripcion)}</div>
      <div class="pcard-tags"><span class="ptag ptag-cat">${cat.label}</span>
        ${part.codigoOem?`<span class="pcard-oem">${escH(part.codigoOem)}</span>`:""}
        ${part.ubicacion?`<span class="pcard-ubicacion">📍 ${escH(part.ubicacion)}</span>`:""}
      </div>
      ${part.fechaVenta?`<div style="font-size:8px;color:var(--t4);margin-top:1px">Vendido: ${escH(part.fechaVenta)}</div>`:""}
      <div class="pcard-tags" style="margin-top:2px">
        <span class="estado-badge estado-${estado}">${estado.charAt(0).toUpperCase()+estado.slice(1)}</span>
        ${part.stock>0?`<span class="pcard-stock">📦 x${part.stock}</span>`:""}
        ${part.precioVenta?`<span class="pcard-price">$${Number(part.precioVenta).toLocaleString("es-CL")}</span>`:""}
        ${part.precioCompra&&part.precioVenta?(()=>{const m=((part.precioVenta-part.precioCompra)/part.precioCompra*100);return `<span class="margen-badge ${m>=50?"ok":m>=20?"warn":"bad"}">${m>=0?"+":""}${Math.round(m)}%</span>`;})():""}
      </div>
    </div>
    <div class="pcard-right">
      <button class="sold-btn ${estado==='vendida'||estado==='descartada'?'sold':'avail'}" data-id="${part.id}"><span class="sold-dot"></span>${estado.charAt(0).toUpperCase()+estado.slice(1)}</button>
      <div class="pcard-actions">
        <button class="qr-btn" data-qr="${part.id}" aria-label="QR" title="Código QR">${QR_ICON}</button>
        <button class="pact" data-edit="${part.id}" aria-label="Editar" title="Editar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="pact del" data-del="${part.id}" title="Eliminar"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </div>
    </div>`;
  el.querySelector("[data-edit]").onclick = () => { editId=part.id; editBuf={...part}; renderFolderContent(); };
  el.querySelector("[data-del]").onclick = () => showConfirm("Eliminar parte",`"${part.marca} ${part.modelo}" será eliminada.`,()=>{ parts=parts.filter(p=>p.id!==part.id); deletePartFromSupabase(part.id); saveParts(); renderAll(); toast("Parte eliminada"); },true);
  el.querySelector("[data-qr]").onclick = () => showQR(part);
  el.querySelector(".sold-btn").onclick = () => {
    const oldEstado = estado;
    const estados = ["disponible","reservada","vendida","descartada"];
    const idx = estados.indexOf(part.estado||"disponible");
    const next = estados[(idx+1)%estados.length];
    const p = parts.find(p => p.id === part.id);
    if (!p) return;
    p.estado = next;
    if (next === "vendida") { p.fechaVenta = new Date().toLocaleString("es-CL"); }
    else if (oldEstado === "vendida") { p.fechaVenta = null; }
    savePartToSupabase(p);
    saveParts();
    updateHeaderStats();
    renderFolderContent();
    toastWithUndo(`Estado: ${next}`, () => {
      const pp = parts.find(pp => pp.id === part.id);
      if (!pp) return;
      pp.estado = oldEstado;
      if (oldEstado === "vendida") { pp.fechaVenta = new Date().toLocaleString("es-CL"); }
      else if (next === "vendida") { pp.fechaVenta = null; }
      savePartToSupabase(pp);
      saveParts();
      updateHeaderStats();
      renderFolderContent();
      toast(`Deshecho: vuelto a ${oldEstado}`);
    });
  };
  return el;
}

function calcMargenEdit(){
  const compra=parseFloat(editBuf.precioCompra)||0;
  const venta=parseFloat(editBuf.precioVenta)||0;
  const badge=$("margen-edit-badge");
  if(compra>0&&venta>0&&badge){
    const margen=((venta-compra)/compra*100);
    badge.textContent=(margen>=0?"+":"")+margen.toFixed(0)+"%";
    badge.className="margen-badge"+(margen>=50?" ok":margen>=20?" warn":" bad");
    badge.style.display="inline-flex";
  }else if(badge){badge.style.display="none"}
}
function buildEditCard(part) {
  const cat = CATS[part.categoria]||CATS.varios;
  const el = document.createElement("div");
  el.className="pcard"; el.id=`card-${part.id}`; el.style.flexDirection="column";
  const imgSrc = part.preview||part.previewFull||"";
  const photos = (part.photos && part.photos.length > 1) ? part.photos : null;
  const margen= (editBuf.precioCompra>0&&editBuf.precioVenta>0) ? ((editBuf.precioVenta-editBuf.precioCompra)/editBuf.precioCompra*100) : null;
  const margenCls=margen!==null?(margen>=50?"ok":margen>=20?"warn":"bad"):"";
  const margenHtml=margen!==null?`<span class="margen-badge ${margenCls}" id="margen-edit-badge">${margen>=0?"+":""}${Math.round(margen)}%</span>`:`<span class="margen-badge" id="margen-edit-badge" style="display:none"></span>`;
  el.innerHTML = (imgSrc?`<div style="width:100%"><img src="${escH(imgSrc)}" style="width:100%;height:180px;object-fit:cover;cursor:zoom-in" onclick="openLightbox('${escH(imgSrc)}')">${photos?`<div style="display:flex;gap:3px;padding:4px;overflow-x:auto;background:var(--s2)">${photos.map((s,i)=>`<img src="${escH(s)}" style="width:36px;height:36px;object-fit:cover;border-radius:var(--r4);cursor:pointer;opacity:${i===0?1:.5};border:1.5px solid ${i===0?'var(--gold)':'transparent'};flex-shrink:0" onclick="event.stopPropagation();this.parentElement.previousElementSibling.src=this.src">`).join('')}</div>`:''}</div>`:`<div style="width:100%;height:60px;display:flex;align-items:center;justify-content:center;background:var(--s3);color:var(--t4)">${cat.icon}</div>`)+
    `<div style="padding:12px;display:flex;flex-direction:column;gap:9px">
      <div class="fld-row"><div style="flex:1"><div class="fld-label">Marca</div><input class="fld-input" data-f="marca" value="${escH(editBuf.marca||"")}"/></div>
        <div style="flex:1"><div class="fld-label">Modelo</div><input class="fld-input" data-f="modelo" value="${escH(editBuf.modelo||"")}"/></div></div>
      <div class="fld-row"><div style="flex:1"><div class="fld-label">Años</div><input class="fld-input" data-f="años" value="${escH(editBuf.años||"")}"/></div>
        <div style="flex:1"><div class="fld-label">Posición</div><input class="fld-input" data-f="posicion" value="${escH(editBuf.posicion||"")}"/></div></div>
      <div><div class="fld-label">Descripción</div><input class="fld-input" data-f="descripcion" value="${escH(editBuf.descripcion||"")}"/></div>
      <div><div class="fld-label">Categoría</div><select class="fld-input" data-f="categoria">${Object.entries(CATS).map(([k,c])=>`<option value="${k}"${editBuf.categoria===k?" selected":""}>${c.label}</option>`).join("")}</select></div>
      <div class="fld-row"><div style="flex:1"><div class="fld-label">Estado</div><select class="fld-input" data-f="estado">${["disponible","reservada","vendida","descartada"].map(e=>`<option value="${e}"${editBuf.estado===e?" selected":""}>${e.charAt(0).toUpperCase()+e.slice(1)}</option>`).join("")}</select></div>
        <div style="flex:1"><div class="fld-label">Stock</div><input class="fld-input" data-f="stock" type="number" min="1" value="${editBuf.stock||1}"/></div></div>
      <div class="precio-wrap"><div style="flex:1"><div class="fld-label">Precio Compra</div><input class="fld-input" data-f="precioCompra" type="number" step="0.01" min="0" value="${editBuf.precioCompra||""}"/></div>
        <div style="flex:1"><div class="fld-label">Precio Venta</div><input class="fld-input" data-f="precioVenta" type="number" step="0.01" min="0" value="${editBuf.precioVenta||""}"/></div>
        ${margenHtml}</div>
      <div class="fld-row">        <div style="flex:1"><div class="fld-label">Código OEM</div><input class="fld-input" data-f="codigoOem" value="${escH(editBuf.codigoOem||"")}"/></div>
        <div style="flex:1"><div class="fld-label">Ubicación</div><input class="fld-input" data-f="ubicacion" placeholder="A-03-02-05" value="${escH(editBuf.ubicacion||"")}"/></div></div>
      <div style="display:flex;gap:8px"><button class="btn-primary" id="sv-${part.id}">Guardar</button><button class="btn-ghost-sm" id="cn-${part.id}">Cancelar</button></div>
    </div>`;
  el.querySelectorAll(".fld-input").forEach(i => { i.oninput = i.onchange = e => { editBuf[e.target.dataset.f]=e.target.value; if(e.target.dataset.f==="precioCompra"||e.target.dataset.f==="precioVenta")calcMargenEdit(); }; });
  el.querySelector(`#sv-${part.id}`).onclick = async () => {
    const años = (editBuf.años || "").trim();
    if (años && años !== "No determinado" && !/\b\d{4}\b/.test(años)) { toast("Años: debe contener un año de 4 dígitos (ej: 1997 o 1995-2005)"); return; }
    const pos = (editBuf.posicion || "").trim().toLowerCase();
    const validPos = ["delantero","trasero","izquierdo","derecho","central","no determinado",""];
    if (pos && !validPos.includes(pos)) { toast("Posición: Delantero, Trasero, Izquierdo, Derecho o Central"); return; }
    const editUbic = (editBuf.ubicacion || "").trim();
    if (editUbic && !validateUbicacion(editUbic)) { toast("Ubicación: formato A-03-02-05 (Letra-NN-NN-NN)"); return; }
    if(editBuf.stock)editBuf.stock=parseInt(editBuf.stock)||1;
    if(editBuf.precioCompra)editBuf.precioCompra=parseFloat(editBuf.precioCompra)||null;
    if(editBuf.precioVenta)editBuf.precioVenta=parseFloat(editBuf.precioVenta)||null;
    const updated={...part,...editBuf}; parts=parts.map(p=>p.id===part.id?updated:p); editId=null; await savePartToSupabase(updated); saveParts(); renderAll(); toast("Cambios guardados");
  };
  el.querySelector(`#cn-${part.id}`).onclick = () => { editId=null; renderFolderContent(); };
  return el;
}

function addLoadingCard(item) {
  const el = document.createElement("div");
  el.className="pcard loading"; el.id=`card-${item.id}`;
  el.innerHTML=`<div class="pcard-img"></div><div class="pcard-body" style="padding:10px"><div class="skel" style="height:9px;background:var(--s3);border-radius:3px;margin-bottom:5px;width:70%"></div><div class="skel" style="height:9px;background:var(--s3);border-radius:3px;margin-bottom:5px;width:50%"></div><div class="skel" style="height:9px;background:var(--s3);border-radius:3px;width:85%"></div></div>`;
  const list = folderContent.querySelector(".prod-list");
  if (list) list.insertBefore(el, list.firstChild);
}
function replaceLoadingCard(id, part, label) {
  const old = document.getElementById(`card-${id}`);
  if (!old) return;
  if (!part) {
    const statusColor = label === "Revisar" ? "var(--amber)" : "var(--red-lt)";
    old.className = "pcard";
    old.innerHTML = `<div class="pcard-img" style="display:flex;align-items:center;justify-content:center;background:var(--s3);color:${statusColor};font-size:24px">${label === "Revisar" ? "👀" : "✏"}</div>
      <div class="pcard-body" style="padding:10px;display:flex;align-items:center;justify-content:center;font-size:11px;color:${statusColor}">${label}</div>`;
    return;
  }
  old.replaceWith(buildPartCard(part));
}

function renderQueue() {
  if (queue.length===0) { queueWrap.classList.remove("on"); $("queue-pause").textContent = "Pausar"; return; }
  queueWrap.classList.add("on");
  $("queue-prog").textContent = `${queue.length} imagen${queue.length!==1?"es":""} en cola`;
  queueRow.innerHTML = "";
  queue.slice(0,18).forEach(item => {
    const d = document.createElement("div");
    d.className=`q-th ${item.status}`;
    const spin = item.status==="analyzing"?`<div class="spin" style="width:14px;height:14px;border-color:var(--amber-lt)"></div>`:item.status==="done"?`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`:"";
    d.innerHTML=`<img src="${item.preview}" alt=""/><div class="q-ov">${spin}</div>`;
    if (item.status !== "analyzing") {
      const cancelBtn = document.createElement("div");
      cancelBtn.className = "q-cancel";
      cancelBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      cancelBtn.title = "Cancelar";
      cancelBtn.onclick = (e) => { e.stopPropagation(); cancelledItems.add(item.id); queue = queue.filter(q => q.id !== item.id); renderQueue(); if (processing && queue.length === 0) { processing=false; queuePaused=false; procPill.classList.remove("on"); progWrap.classList.remove("on"); progFill.style.width="0%"; totalBatch=0; doneBatch=0; } };
      d.appendChild(cancelBtn);
    }
    queueRow.appendChild(d);
  });
  if (queue.length>18) {
    const more=document.createElement("div"); more.style.cssText="font-size:11px;color:var(--t4);display:flex;align-items:center";
    more.textContent=`+${queue.length-18}`; queueRow.appendChild(more);
  }
}

// ---
// MANUAL ENTRY
// ---
function openManual(presetCat) {
  ["m-marca","m-modelo","m-años","m-pos","m-desc","m-oem","m-ubicacion"].forEach(id=>{$(id).value="";});
  $("m-estado").value="disponible"; $("m-stock").value="1";
  $("m-precio-compra").value=""; $("m-precio-venta").value="";
  $("m-margen-badge").style.display="none";
  if (presetCat&&CATS[presetCat]) $("m-cat").value=presetCat;
  $("manual-title").textContent=presetCat&&CATS[presetCat]?`Agregar en ${CATS[presetCat].label}`:"Agregar parte";
  $("manual-preview-img").src=""; $("manual-preview-img").style.display="none";
  $("manual-file").value=""; manualPreviewDataUrl=null; manualPreviewFile=null;
  $("manual-modal").classList.add("on");
}
$("manual-photo-preview").onclick=()=>$("manual-file").click();
$("manual-file").onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const raw=ev.target.result; if(!raw) return;
    const img=new Image();
    img.onload=()=>{
      let w=img.width, h=img.height; const max=800;
      if(w>max||h>max){if(w>=h){h=Math.round(h*max/w);w=max;}else{w=Math.round(w*max/h);h=max;}}
      const c=document.createElement("canvas");c.width=w;c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      manualPreviewDataUrl=c.toDataURL("image/jpeg",0.88);
      manualPreviewFile=f;
      $("manual-preview-img").src=manualPreviewDataUrl;
      $("manual-preview-img").style.display="block";
    };
    img.onerror=()=>{manualPreviewDataUrl=raw;manualPreviewFile=f;$("manual-preview-img").src=raw;$("manual-preview-img").style.display="block";};
    img.src=raw;
  };
  reader.readAsDataURL(f);
};
function openManualWithResult(result) {
  $("m-marca").value = result.marca !== "No determinado" ? result.marca : "";
  $("m-modelo").value = result.modelo !== "No determinado" ? result.modelo : "";
  $("m-años").value = result.años !== "No determinado" ? result.años : "";
  $("m-pos").value = result.posicion !== "No determinado" && result.posicion !== "Central" ? result.posicion : "";
  $("m-desc").value = result.descripcion !== "Sin descripción" ? result.descripcion : "";
  if (result.categoria && CATS[result.categoria]) $("m-cat").value = result.categoria;
  if (result.codigo_oem) $("m-oem").value = result.codigo_oem;
  $("manual-title").textContent = "Catalogar manualmente (IA: " + result.confianza + ")";
  $("manual-modal").classList.add("on");
}
function calcMargen(){
  const compra=parseFloat($("m-precio-compra").value)||0;
  const venta=parseFloat($("m-precio-venta").value)||0;
  const badge=$("m-margen-badge");
  if(compra>0&&venta>0){
    const margen=((venta-compra)/compra*100);
    badge.textContent=(margen>=0?"+":"")+margen.toFixed(0)+"%";
    badge.className="margen-badge"+(margen>=50?" ok":margen>=20?" warn":" bad");
    badge.style.display="inline-flex";
  }else{badge.style.display="none"}
}
$("manual-save").onclick=async ()=>{
  const ubic=$("m-ubicacion").value.trim();
  if (ubic && !validateUbicacion(ubic)) { toast("Ubicación: formato A-03-02-05 (Letra-NN-NN-NN)"); return; }
  const marca=$("m-marca").value.trim()||"Sin marca";
  const modelo=$("m-modelo").value.trim()||"Sin modelo";
  const estado=$("m-estado").value;
  const stock=parseInt($("m-stock").value)||1;
  const precioCompra=parseFloat($("m-precio-compra").value)||null;
  const precioVenta=parseFloat($("m-precio-venta").value)||null;
  const part={ id:`m-${Date.now()}-${Math.random().toString(36).slice(2)}`, preview:manualPreviewDataUrl||null, previewFull:manualPreviewDataUrl||null, fileName:manualPreviewFile?.name||"manual", fileSize:manualPreviewFile?.size||0, estado, stock, precioCompra, precioVenta, codigoOem:$("m-oem").value.trim()||null, ubicacion:$("m-ubicacion").value.trim()||null, categoria:$("m-cat").value, marca, modelo, años:$("m-años").value.trim()||"No determinado", posicion:$("m-pos").value.trim()||"No determinado", descripcion:$("m-desc").value.trim()||"Sin descripción", confianza:"Alta", _ok:true, manual:true, addedAt:new Date().toLocaleString("es-CL") };
  parts.push(part); await savePartToSupabase(part); saveParts(); renderAll(); renderDashboard(); closeModal("manual-modal"); toast(`Agregado: ${marca} ${modelo}`);
};

// ---
// IMAGE TEST (kept from diag)
// ---
$("btn-test-ai").onclick = () => {
  $("diag-file-in").value=""; $("diag-real-wrap").style.display="none";
  $("diag-real-steps").innerHTML=""; $("diag-real-log").style.display="none";
  $("diag-real-log").textContent="";
  $("diag-test-modal").classList.add("on");
};
$("diag-file-in").onchange = async e => {
  const file = e.target.files[0]; if(!file) return;
  $("diag-file-in").value="";
  const reader = new FileReader();
  reader.onload = ev => {
    const dataUrl = ev.target.result;
    $("diag-real-preview").src = dataUrl;
    $("diag-real-meta").innerHTML = `<b>${escH(file.name)}</b><br>${(file.size/1024).toFixed(0)} KB`;
    $("diag-real-wrap").style.display = "block";
    $("diag-real-steps").innerHTML = "";
    $("diag-real-log").style.display = "none"; $("diag-real-log").textContent = "";
    $("diag-real-run")._file = file; $("diag-real-run")._dataUrl = dataUrl;
  };
  reader.readAsDataURL(file);
};
$("diag-real-run").onclick = async () => {
  const file = $("diag-real-run")._file; if(!file) return;
  const stepsEl = $("diag-real-steps"); const logEl = $("diag-real-log");
  stepsEl.innerHTML = ""; logEl.style.display = "block"; logEl.textContent = "";
  $("diag-real-run").disabled = true; $("diag-real-run").textContent = "Procesando…";
  const log = t => { logEl.textContent+=t+"\n"; logEl.scrollTop=logEl.scrollHeight; };
  const addStep = (icon, label, status, detail="") => {
    const colors={ok:"var(--green-lt)",err:"var(--red-lt)",warn:"var(--amber-lt)",run:"var(--t2)"};
    const dots={ok:"var(--green-lt)",err:"var(--red-lt)",warn:"var(--amber-lt)",run:"var(--t4)"};
    const d=document.createElement("div");
    d.style.cssText="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;background:var(--bg);border-radius:var(--r8);border:1px solid var(--bdr2)";
    d.innerHTML=`<span style="width:8px;height:8px;border-radius:50%;background:${dots[status]||"var(--t4)"};flex-shrink:0;margin-top:4px;display:block"></span>
      <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:500;color:${colors[status]||"var(--text)"};line-height:1.4">${label}</div>
      ${detail?`<div style="font-size:10px;color:var(--t4);margin-top:2px;word-break:break-all">${detail}</div>`:""}</div>`;
    stepsEl.appendChild(d); return d;
  };
  const savedDataUrl = $("diag-real-run")._dataUrl||"";
  let img = null;
  if (savedDataUrl) img = await resizeFromDataUrl(savedDataUrl).catch(()=>null);
  if (!img) img = await resizeFile(file).catch(()=>null);
  if (!img) { addStep("err","No se pudo procesar la imagen","err"); $("diag-real-run").disabled=false; $("diag-real-run").textContent="Probar con esta foto"; return; }
  addStep("ok",`Imagen comprimida: ${img.size}KB`,"ok");
  log(`[1] Comprimida: ${img.size}KB`);
  addStep("run","Enviando a edge function…","run");
  log("[2] Enviando a edge function");
  const t0 = Date.now();
  const fakeItem = { file, id:"diag-test", preview:"", fileDataUrl: savedDataUrl };
  const result = await analyzeImage(fakeItem);
  const ms = Date.now() - t0;
  if (!result._ok) { addStep("err",`Error: ${result.descripcion}`,"err",`${ms}ms`); log(`[2] Error: ${result.descripcion}`); $("diag-real-run").disabled=false; $("diag-real-run").textContent="Repetir prueba"; return; }
  addStep("ok",`IA respondió en ${ms}ms`,"ok",`${result.marca} ${result.modelo} · ${result.años} · Confianza: ${result.confianza}`);
  addStep("ok","JSON parseado correctamente","ok",`Marca: ${result.marca} | Modelo: ${result.modelo} | Categoría: ${result.categoria}`);
  log(`[2] Resultado: ${JSON.stringify(result)}`);
  $("diag-real-run").disabled=false; $("diag-real-run").textContent="Repetir prueba";
};

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
function openLightbox(src) { $("lb-img").src=src; $("lightbox").classList.add("on"); }
function closeLightbox() { $("lightbox").classList.remove("on"); }
function closeModal(id) { $(id).classList.remove("on"); }
function escH(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/\//g,"&#x2F;"); }

// ---
// DASHBOARD
// ---
const BAR_COLORS = ["#C8A96E","#3DBFA0","#6B7280","#E55347","#E2A84B","#5B8DEF","#C084FC","#34D399","#F472B6","#F97316"];
function renderDashboard() {
  const total = parts.length;
  const disp = parts.filter(p=>(p.estado||(p.sold?"vendida":"disponible"))==="disponible").length;
  const vend = parts.filter(p=>(p.estado||(p.sold?"vendida":"disponible"))==="vendida").length;
  const conPrecio = parts.filter(p=>p.precioVenta>0);
  const valorInv = conPrecio.reduce((s,p)=>s+(p.precioVenta||0)*(p.stock||1),0);
  const precioProm = conPrecio.length ? conPrecio.reduce((s,p)=>s+(p.precioVenta||0),0)/conPrecio.length : 0;
  const conCompra = parts.filter(p=>p.precioCompra>0&&p.precioVenta>0);
  const margenProm = conCompra.length ? conCompra.reduce((s,p)=>s+(((p.precioVenta-p.precioCompra)/p.precioCompra)*100),0)/conCompra.length : 0;
  const rotacion = total ? Math.round((vend/total)*100) : 0;



  const resv = parts.filter(p=>(p.estado||(p.sold?"vendida":"disponible"))==="reservada").length;
  const sinUbic = parts.filter(p => !p.ubicacion).length;
  const sinPrecio = parts.filter(p => !p.precioVenta || p.precioVenta <= 0).length;

  $("dash-valor").textContent = "$"+valorInv.toLocaleString("es-CL",{minimumFractionDigits:0,maximumFractionDigits:0});
  $("dash-promedio").textContent = "$"+Math.round(precioProm).toLocaleString("es-CL");
  $("dash-margen").textContent = Math.round(margenProm)+"%";
  $("dash-rotacion").textContent = rotacion+"%";
  if($("dash-resv")) $("dash-resv").textContent = resv;
  $("dash-sin-ubic").textContent = sinUbic;
  $("dash-sin-precio").textContent = sinPrecio;

  // Bars por categoría
  const barEl = $("dash-bars"); barEl.innerHTML = "";
  const cats = Object.entries(CATS);
  cats.forEach(([k,c],i) => {
    const count = parts.filter(p=>p.categoria===k).length;
    if (!count) return;
    const pct = (count/total)*100;
    const row = document.createElement("div"); row.className = "dash-bar-row";
    row.innerHTML = `<div class="dash-bar-label">${c.label}</div>
      <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${Math.max(pct,2)}%;background:${BAR_COLORS[i%BAR_COLORS.length]}"></div></div>
      <div class="dash-bar-count">${count}</div>`;
    barEl.appendChild(row);
  });

  // Últimos movimientos
  const tbody = $("dash-tbody"); tbody.innerHTML = "";
  const sorted = [...parts].sort((a,b)=>new Date(b.addedAt||0)-new Date(a.addedAt||0)).slice(0,20);
  sorted.forEach(p => {
    const tr = document.createElement("tr");
    const est = p.estado||(p.sold?"vendida":"disponible");
    const val = p.precioVenta ? "$"+Math.round(p.precioVenta).toLocaleString("es-CL") : "-";
    tr.innerHTML = `<td>${p.addedAt||"-"}</td><td>${escH(p.marca+" "+p.modelo).slice(0,30)}</td><td><span class="estado-badge estado-${est}">${est}</span></td><td>${val}</td>`;
    tbody.appendChild(tr);
  });
}



// ---
// PENDING REVIEWS
// ---
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
    card.innerHTML = `<div class="ven-card-hdr"><span class="ven-card-cli">${escH(r.marca+" "+r.modelo)}</span><span style="font-size:10px;color:var(--amber)">Media</span></div>
      <div class="ven-card-meta">${r.años} · ${r.posicion} · ${r.descripcion}</div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn-primary" style="flex:1;font-size:10px;padding:6px" data-approve="${i}">✓ Aprobar</button>
        <button class="btn-ghost-sm" style="flex:1;font-size:10px;padding:6px" data-edit="${i}">✎ Editar</button>
        <button class="btn-ghost-sm" style="flex:none;font-size:10px;padding:6px;color:var(--red-lt)" data-discard="${i}">✕</button>
      </div>`;
    card.querySelector("[data-approve]").onclick = () => approveReview(i);
    card.querySelector("[data-edit]").onclick = () => { bg.remove(); editReview(i); };
    card.querySelector("[data-discard]").onclick = () => discardReview(i);
    list.appendChild(card);
  });
}

function approveReview(i) {
  const r = pendingReviews[i];
  if (!r) return;
  const part = {
    id: r.id, preview: r.preview, previewFull: r.previewFull,
    fileName: r.fileName, fileSize: r.fileSize, estado: "disponible",
    categoria: r.categoria, marca: r.marca, modelo: r.modelo,
    años: r.años, descripcion: r.descripcion, posicion: r.posicion,
    confianza: r.confianza, _ok: true,
    codigoOem: r.codigo_oem, photos: r.photos, batchFiles: r.batchFiles,
    addedAt: r.addedAt
  };
  parts.push(part);
  savePartToSupabase(part);
  saveParts();
  pendingReviews.splice(i, 1);
  savePendingReviews();
  showReviewBadge();
  const modal = document.getElementById("review-modal");
  if (pendingReviews.length) openReviewModal(); else modal?.remove();
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
  if (r.categoria && CATS[r.categoria]) $("m-cat").value = r.categoria;
  if (r.codigo_oem) $("m-oem").value = r.codigo_oem;
  $("m-estado").value = "disponible";
  $("m-stock").value = "1";
  $("manual-title").textContent = "Editar y guardar (pendiente de revisión)";
  const origSave = $("manual-save").onclick;
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
      photos: r.photos, batchFiles: r.batchFiles,
      estado, stock, addedAt: r.addedAt || new Date().toLocaleString("es-CL")
    };
    parts.push(part);
    await savePartToSupabase(part);
    saveParts();
    pendingReviews.splice(i, 1);
    savePendingReviews();
    showReviewBadge();
    closeModal("manual-modal");
    renderAll();
    toast("Parte aprobada y guardada");
    $("manual-save").onclick = origSave;
  };
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
// ---
