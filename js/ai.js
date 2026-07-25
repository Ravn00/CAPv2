// ---
const MAX_DIM = 1024;
const MAX_B64_KB = 1200;

function resizeFile(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      if (!dataUrl) { resolve(null); return; }
      resizeFromDataUrl(dataUrl).then(resolve).catch(() => resolve(null));
    };
    reader.onerror = () => resolve(null);
    try { reader.readAsDataURL(file); } catch(e) { resolve(null); }
  });
}

function resizeFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let w=img.width, h=img.height;
        if (w===0||h===0) { reject(new Error("sin dimensiones")); return; }
        if (w>MAX_DIM||h>MAX_DIM) { if (w>=h) {h=Math.round(h*MAX_DIM/w);w=MAX_DIM;} else {w=Math.round(w*MAX_DIM/h);h=MAX_DIM;} }
        const tryEnc = (W,H,q) => { const c=document.createElement("canvas");c.width=W;c.height=H;c.getContext("2d").drawImage(img,0,0,W,H); return c.toDataURL("image/jpeg",q).split(",")[1]; };
        let b64=tryEnc(w,h,0.82);
        let kb=Math.round(b64.length*.75/1024);
        if (kb>MAX_B64_KB) { b64=tryEnc(w,h,0.65); kb=Math.round(b64.length*.75/1024); }
        if (kb>MAX_B64_KB) { w=Math.round(w*.7); h=Math.round(h*.7); b64=tryEnc(w,h,0.75); }
        if (!b64) { reject(new Error("canvas vacío")); return; }
        resolve({b64,mime:"image/jpeg",size:kb});
      } catch(err) { reject(err); }
    };
    img.onerror = () => reject(new Error("img.onerror"));
    img.src = dataUrl;
  });
}

async function analyzeImage(item) {
  const fallback = (msg, isRate=false) => ({ marca:"No determinado", modelo:"No determinado", años:"No determinado",
    descripcion:msg.slice(0,65), posicion:"No determinado", confianza:"Baja", _ok:false, _isRateLimit:isRate });
  try {
    let img = null;
    if (item.fileDataUrl) img = await resizeFromDataUrl(item.fileDataUrl).catch(() => null);
    if (!img) img = await resizeFile(item.file).catch(() => null);
    if (!img) return fallback("No se pudo leer la imagen");
    const provider = "groq";
    // Edge Function proxy (keys are server-side, never exposed to frontend)
    const efUrl = `${SB_URL}/functions/v1/analyze-part`;
    let efResp;
    try {
      efResp = await fetch(efUrl, {
        method: "POST",
        headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ image: `data:${img.mime};base64,${img.b64}`, provider, model: provider === "groq" ? "qwen/qwen3.6-27b" : provider === "openrouter" ? "google/gemma-4-31b-it:free" : "gemini-2.0-flash", prompt: PROMPT }),
        signal: AbortSignal.timeout(10000)
      });
    } catch(e) {
      if (e.name==="AbortError") return fallback("Tiempo de espera agotado");
      return fallback("No se pudo conectar con el servidor de IA");
    }
    if (efResp.ok) {
      const efResult = await efResp.json();
      if (efResult && !efResult._error && !efResult.error) {
        return {
          marca: efResult.marca || "No determinado",
          modelo: efResult.modelo || "No determinado",
          años: efResult.años || "No determinado",
          categoria: efResult.categoria || "varios",
          descripcion: (efResult.descripcion || "").slice(0, 65),
          posicion: efResult.posicion || "No determinado",
          confianza: efResult.confianza || "Baja",
          codigo_oem: efResult.codigo_oem || "",
          _ok: efResult._ok !== false
        };
      }
      return fallback(efResult.error || efResult._error || "Error en edge function");
    }
    // Log raw AI response for debugging
    if (efResult._raw) console.warn("Raw AI response:", efResult._raw);
    return fallback(`Error ${efResp.status} en edge function`);
  } catch(err) {
    return fallback(err.message?.slice(0,55)||"Error desconocido");
  }
}

// ---
// QUEUE PROCESSING
// ---
async function processQueue() {
  if (processing) return;
  processing = true; queuePaused = false; doneBatch = 0; totalBatch = queue.length;
  $("queue-pause").textContent = "Pausar";
  procPill.classList.add("on"); progWrap.classList.add("on");
  updateProg();

  async function doOne(item) {
    if (cancelledItems.has(item.id)) { cancelledItems.delete(item.id); return true; }
    const t0 = Date.now();
    item.status = "analyzing"; renderQueue(); addLoadingCard(item);
    const result = await analyzeImageWithRetry(item);
    const ms = Date.now() - t0;
    item.status = result._ok ? "done" : "error"; renderQueue();

    // Handle based on confidence
    if (result._ok && result.confianza === "Alta") {
      const extraPhotos = item.batchPhotos || [];
      const price = result.precio_sugerido ?? null;
      const part = {
        id:item.id, preview:item.preview, previewFull:item.fileDataUrl||item.preview,
        fileName:item.file.name, fileSize:item.file.size,
        categoria:item.presetCat||result.categoria||"varios",
        marca:result.marca, modelo:result.modelo, años:result.años,
        descripcion:result.descripcion, posicion:result.posicion,
        confianza:result.confianza, _ok:result._ok,
        precio_sugerido: price,
        precioVenta: price,
        fuentes:result.fuentes || [],
        addedAt:new Date().toLocaleString("es-CL"),
        photos: extraPhotos.length ? [item.preview, ...extraPhotos.map(p => p.preview)] : undefined
      };
      if (extraPhotos.length) {
        part.batchFiles = extraPhotos.map(p => ({ preview: p.preview, fileDataUrl: p.fileDataUrl, fileName: p.fileName, fileSize: p.fileSize }));
      }
      parts.push(part);
      await savePartToSupabase(part);
      saveParts();
      replaceLoadingCard(item.id, part);
      doneBatch++; updateProg(); updateUploadCounts(); updateHeaderStats();
      await logScan(part.id, part.categoria, "success", ms);
    } else if (result._ok && result.confianza === "Media") {
      const extraPhotos = item.batchPhotos || [];
      const mPrice = result.precio_sugerido ?? null;
      const review = {
        id:item.id, preview:item.preview, previewFull:item.fileDataUrl||item.preview,
        fileName:item.file.name, fileSize:item.file.size,
        categoria:item.presetCat||result.categoria||"varios",
        marca:result.marca, modelo:result.modelo, años:result.años,
        descripcion:result.descripcion, posicion:result.posicion,
        confianza:result.confianza, codigo_oem:result.codigo_oem||"",
        precio_sugerido: mPrice,
        precioVenta: mPrice,
        fuentes:result.fuentes || [],
        addedAt:new Date().toLocaleString("es-CL"),
        photos: extraPhotos.length ? [item.preview, ...extraPhotos.map(p => p.preview)] : undefined,
        batchFiles: extraPhotos.map(p => ({ preview: p.preview, fileDataUrl: p.fileDataUrl, fileName: p.fileName, fileSize: p.fileSize }))
      };
      pendingReviews.push(review);
      savePendingReviews();
      replaceLoadingCard(item.id, null, "Revisar");
      showReviewBadge();
      doneBatch++; updateProg(); updateUploadCounts(); updateHeaderStats();
      await logScan(review.id, review.categoria, "pending_review", ms);
    } else {
      replaceLoadingCard(item.id, null, "Manual");
      openManualWithResult(result, item.fileDataUrl || item.preview);
      doneBatch++; updateProg(); updateUploadCounts(); updateHeaderStats();
      await logScan(item.id, result.categoria||item.presetCat||"varios", "manual_needed", ms);
    }
    return false;
  }

    const CONCURRENCY = 2;
    while (queue.length > 0) {
      while (queuePaused && queue.length > 0) { await new Promise(r => setTimeout(r, 500)); }
      if (queue.length === 0) break;
      const batch = queue.splice(0, CONCURRENCY);
      try {
        await Promise.all(batch.map(async item => {
          try {
            const skipped = await doOne(item);
            if (skipped) cancelledItems.delete(item.id);
          } catch(e) { console.warn("doOne error:", e); }
        }));
      } catch(e) { console.warn("batch error:", e); }
    }

  processing = false; queuePaused = false;
  procPill.classList.remove("on"); progWrap.classList.remove("on");
  progFill.style.width = "0%"; totalBatch = 0; doneBatch = 0;
  renderQueue(); renderFolderContent();
  toast(`${parts.length} parte${parts.length!==1?"s":""} en catálogo`);
}

$("queue-pause").onclick = () => {
  queuePaused = !queuePaused;
  $("queue-pause").textContent = queuePaused ? "Reanudar" : "Pausar";
  if (queuePaused) toast("Cola pausada");
};

async function analyzeImageWithRetry(item) {
  return await analyzeImage(item);
}

function updateProg() {
  const pct = totalBatch > 0 ? Math.round(doneBatch/totalBatch*100) : 0;
  progFill.style.width = pct+"%";
  progLabel.textContent = `Analizando ${doneBatch} de ${totalBatch} (${pct}%)`;
  procTxt.textContent = `${doneBatch}/${totalBatch}`;
}

function saveParts() {
  try {
    const data = JSON.stringify(parts.map(({fileDataUrl,file,...p})=>p));
    // ~5MB limit; warn at 4MB
    if (data.length > 4e6) { toast("Almacenamiento casi lleno — respaldá los datos pronto", 4000); }
    localStorage.setItem("ap_parts_v2", data);
  } catch(e) {
    console.warn("localStorage save failed:", e);
    toast("Error al guardar en caché local — el almacenamiento podría estar lleno", 5000);
  }
}

// ---